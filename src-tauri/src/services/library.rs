use crate::db::queries;
use crate::providers::traits::MediaProvider;
use anyhow::Result;
use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub items_found: usize,
    pub playlists_found: usize,
}

pub fn scan_all(
    providers: &[Box<dyn MediaProvider>],
    conn: &Connection,
) -> Result<ScanResult> {
    let mut total_items = 0;
    let mut total_playlists = 0;

    // Clear old source playlists to avoid duplicates on re-scan
    queries::clear_source_playlists(conn)?;

    for provider in providers {
        // Scan media items
        let items = provider.scan()?;
        for item in &items {
            queries::upsert_media_item(conn, item)?;
        }
        total_items += items.len();

        // Detect source playlists
        let playlists = provider.detect_playlists()?;
        for (playlist, playlist_items) in &playlists {
            // Upsert playlist items first
            for item in playlist_items {
                queries::upsert_media_item(conn, item)?;
            }
            // Insert the playlist
            queries::insert_playlist(conn, playlist)?;
            // Add entries — look up actual stored media IDs
            for (i, item) in playlist_items.iter().enumerate() {
                // The upsert may have preserved an existing ID, so look up the real one
                let actual_id = queries::get_media_id_by_source(conn, &item.source_type, &item.external_id)?
                    .unwrap_or_else(|| item.id.clone());
                let entry_id = uuid::Uuid::new_v4().to_string();
                let _ = queries::add_playlist_entry(conn, &entry_id, &playlist.id, &actual_id, i as i32);
            }
        }
        total_playlists += playlists.len();
    }

    Ok(ScanResult {
        items_found: total_items,
        playlists_found: total_playlists,
    })
}
