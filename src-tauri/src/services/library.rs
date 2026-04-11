use crate::db::queries;
use crate::models::MediaItem;
use crate::providers::traits::MediaProvider;
use anyhow::Result;
use rusqlite::Connection;
use serde::Serialize;
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub items_found: usize,
    pub playlists_found: usize,
}

/// Run every provider's streaming scan and persist results into the
/// database. Crucially, the DB mutex is acquired *per item* (and per
/// playlist write), **never** held across the long-running provider walk.
///
/// Holding the lock across the whole scan was the cause of the multi-minute
/// main-thread hang reported on macOS 26: the user-initiated `save_app_state`
/// IPC call was blocked behind `sync_all` waiting for a Google Drive scan to
/// finish. The user-initiated `run_scan` path in `commands/library.rs` has
/// always done it this way; the background `sync_all` path used to call this
/// helper with a pre-locked connection, which is what produced the hang.
///
/// Errors during individual upserts are logged and skipped so a single bad
/// row doesn't abort an entire sync.
pub fn scan_all(
    providers: &[Box<dyn MediaProvider>],
    db: &Arc<Mutex<Connection>>,
) -> Result<ScanResult> {
    let mut total_items = 0usize;
    let mut total_playlists = 0usize;

    // Clear old source playlists to avoid duplicates on re-scan. This is the
    // only place we hold the lock for more than one statement, and it runs
    // before any network I/O so it's bounded.
    {
        let conn = db
            .lock()
            .map_err(|e| anyhow::anyhow!("db poisoned: {}", e))?;
        queries::clear_source_playlists(&conn)?;
    }

    for provider in providers {
        // Streaming scan: each item is upserted as soon as the provider yields
        // it, holding the DB mutex only for that single statement. This frees
        // the lock between items so frontend commands like `save_app_state`
        // and `get_media_items` can interleave with a multi-minute Drive walk.
        let imported = std::sync::atomic::AtomicUsize::new(0);
        provider.scan_streaming(
            &|item: MediaItem| {
                match db.lock() {
                    Ok(conn) => {
                        if let Err(e) = queries::upsert_media_item(&conn, &item) {
                            log::warn!(
                                "[scan_all] upsert failed for {}: {}",
                                item.name,
                                e
                            );
                            return;
                        }
                    }
                    Err(e) => {
                        log::error!("[scan_all] db poisoned: {}", e);
                        return;
                    }
                }
                imported.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            },
            &|_msg, _file| {
                // Background sync is silent — the user-initiated scan path
                // (commands::library::run_scan) is responsible for emitting
                // progress events. We just ignore them here.
            },
        )?;
        total_items += imported.load(std::sync::atomic::Ordering::SeqCst);

        // Source playlists. detect_playlists() may itself do network I/O for
        // remote providers, so it runs *outside* the lock too. The actual DB
        // writes briefly re-acquire the lock per playlist.
        let playlists = provider.detect_playlists()?;
        for (playlist, playlist_items) in &playlists {
            let conn = db
                .lock()
                .map_err(|e| anyhow::anyhow!("db poisoned: {}", e))?;
            for item in playlist_items {
                if let Err(e) = queries::upsert_media_item(&conn, item) {
                    log::warn!(
                        "[scan_all] playlist item upsert failed for {}: {}",
                        item.name,
                        e
                    );
                }
            }
            queries::insert_playlist(&conn, playlist)?;
            for (i, item) in playlist_items.iter().enumerate() {
                let actual_id = queries::get_media_id_by_source(
                    &conn,
                    &item.source_type,
                    &item.external_id,
                )?
                .unwrap_or_else(|| item.id.clone());
                let entry_id = uuid::Uuid::new_v4().to_string();
                let _ = queries::add_playlist_entry(
                    &conn,
                    &entry_id,
                    &playlist.id,
                    &actual_id,
                    i as i32,
                );
            }
        }
        total_playlists += playlists.len();
    }

    Ok(ScanResult {
        items_found: total_items,
        playlists_found: total_playlists,
    })
}
