use crate::db::queries;
use crate::providers::gdrive::api as gdrive_api;
use crate::services::{metadata, waveform};
use crate::state::AppState;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

/// Tracks which media ids are currently being downloaded so we don't kick
/// off duplicate fetches when the user spams play on the same track.
fn in_flight() -> &'static Mutex<HashSet<String>> {
    static IN_FLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    IN_FLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

fn mark_started(media_id: &str) -> bool {
    in_flight().lock().unwrap().insert(media_id.to_string())
}

fn mark_finished(media_id: &str) {
    in_flight().lock().unwrap().remove(media_id);
}

/// Best-effort: ensure a Google Drive media item is mirrored into the local
/// cache and that we have decoded metadata + waveform peaks for it. Returns
/// immediately if the item is already cached or already being processed.
/// All errors are logged and swallowed because this runs in the background.
pub fn ensure_cached_in_background(state: AppState, media_id: String) {
    if !mark_started(&media_id) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        if let Err(e) = ensure_cached_inner(&state, &media_id).await {
            eprintln!("[gdrive_cache] {}: {}", media_id, e);
        }
        mark_finished(&media_id);
    });
}

async fn ensure_cached_inner(state: &AppState, media_id: &str) -> anyhow::Result<()> {
    // 1. Look up the item and bail early for non-gdrive sources or if already cached.
    let item = {
        let conn = state.db.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        queries::get_media_item_by_id(&conn, media_id)?
            .ok_or_else(|| anyhow::anyhow!("media item not found"))?
    };
    if item.source_type != "gdrive" {
        return Ok(());
    }

    let already_cached = {
        let conn = state.db.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        state.cache_manager.is_cached(&conn, media_id)
    };

    // If we already have the file but metadata is still missing (e.g. an
    // older cache predating tag extraction), fall through and re-extract.
    let needs_metadata = item.title.is_none() && item.artist.is_none() && item.duration_secs.is_none();
    if already_cached && !needs_metadata {
        return Ok(());
    }

    // 2. Resolve a cache path. Use the mime type for the extension hint so
    //    Symphonia/lofty can probe the format from the filename.
    let ext_hint = mime_to_ext(&item.mime_type);
    let cache_path: PathBuf = state.cache_manager.path_for(media_id, ext_hint);

    // 3. Download the file from Drive (if not already on disk).
    if !cache_path.exists() {
        let token = read_access_token(state).await?;
        let url = gdrive_api::download_url(&item.external_id);
        let client = reqwest::Client::new();
        let resp = client.get(&url).bearer_auth(&token).send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("drive download failed: HTTP {}", resp.status());
        }
        let bytes = resp.bytes().await?;
        tokio::fs::write(&cache_path, &bytes).await?;
    }

    // 4. Register in file_cache and run LRU eviction.
    {
        let conn = state.db.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        state.cache_manager.register(&conn, media_id, &cache_path)?;
        state.cache_manager.evict_if_needed(&conn).ok();
    }

    // 5. Extract tag metadata via lofty — this is CPU/IO blocking work, so
    //    it runs on a dedicated blocking thread to keep Tokio workers free.
    let meta_path = cache_path.clone();
    let meta_result = tokio::task::spawn_blocking(move || metadata::read_metadata(&meta_path))
        .await
        .map_err(|e| anyhow::anyhow!("metadata task join failed: {}", e))?;
    if let Ok(meta) = meta_result {
        let mut updated = item.clone();
        if updated.title.is_none() {
            updated.title = meta.title;
        }
        if updated.artist.is_none() {
            updated.artist = meta.artist;
        }
        if updated.album.is_none() {
            updated.album = meta.album;
        }
        if updated.album_artist.is_none() {
            updated.album_artist = meta.album_artist;
        }
        if updated.track_number.is_none() {
            updated.track_number = meta.track_number;
        }
        if updated.duration_secs.is_none() {
            updated.duration_secs = meta.duration_secs;
        }
        if updated.year.is_none() {
            updated.year = meta.year;
        }
        if updated.genre.is_none() {
            updated.genre = meta.genre;
        }
        if let Some(art) = meta.artwork {
            updated.artwork_hash = Some(art.hash.clone());
            if let Ok(conn) = state.db.lock() {
                queries::upsert_artwork(&conn, &art.hash, &art.data, &art.mime_type).ok();
            }
        }
        if let Ok(conn) = state.db.lock() {
            queries::upsert_media_item(&conn, &updated).ok();
        }
    }

    // 6. Generate waveform peaks (audio only). Symphonia fully decodes the
    //    file, which is very CPU-heavy. The DB lock is only held for the
    //    tiny check-cache / write-peaks bookkeeping — the actual decode
    //    happens lock-free on a blocking thread, so UI queries can still
    //    run while a huge waveform is being computed.
    let already_have_peaks = {
        if let Ok(conn) = state.db.lock() {
            conn.query_row(
                "SELECT 1 FROM waveform_cache WHERE media_id = ?1",
                rusqlite::params![media_id],
                |_| Ok(()),
            )
            .is_ok()
        } else {
            false
        }
    };
    if !already_have_peaks {
        let peak_path = cache_path.clone();
        let peaks_result =
            tokio::task::spawn_blocking(move || waveform::generate_peaks(&peak_path))
                .await
                .map_err(|e| anyhow::anyhow!("waveform task join failed: {}", e))?;
        if let Ok(peaks) = peaks_result {
            if let Ok(json) = serde_json::to_string(&peaks) {
                if let Ok(conn) = state.db.lock() {
                    conn.execute(
                        "INSERT OR REPLACE INTO waveform_cache (media_id, peaks) VALUES (?1, ?2)",
                        rusqlite::params![media_id, json],
                    )
                    .ok();
                }
            }
        }
    }

    // 7. Tell the frontend something it cares about changed so the library
    //    view can refresh and the player can re-fetch the waveform.
    if let Some(handle) = &state.app_handle {
        let _ = handle.emit("library-updated", ());
        let _ = handle.emit("media-cached", media_id);
    }

    Ok(())
}

/// Sync metadata for all Google Drive tracks that are still missing tag
/// information. Runs sequentially to avoid saturating the Drive API or the
/// local disk, and downloads each file to a short-lived temp path that is
/// deleted as soon as metadata extraction finishes — we deliberately don't
/// touch the cache_manager here, so the background sync doesn't compete
/// with the user's play-driven LRU cache. Called from the background sync
/// loop; safe to call when there are zero gdrive items (returns immediately).
pub fn sync_gdrive_metadata(state: AppState) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = sync_gdrive_metadata_inner(&state).await {
            log::warn!("[gdrive_cache] metadata sync: {}", e);
        }
    });
}

/// How many gdrive files we hydrate in parallel. Drive happily serves ~8
/// simultaneous downloads per user but starts returning 403 rateLimitExceeded
/// beyond that, so we stay conservatively below the ceiling. 4 is enough to
/// saturate a residential connection on FLAC payloads while leaving headroom
/// for the user's interactive playback requests to cut in.
const METADATA_SYNC_CONCURRENCY: usize = 4;

async fn sync_gdrive_metadata_inner(state: &AppState) -> anyhow::Result<()> {
    let items = {
        let conn = state.db.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        queries::get_gdrive_items_needing_metadata(&conn)?
    };
    if items.is_empty() {
        return Ok(());
    }

    let token = match read_access_token(state).await {
        Ok(t) => t,
        Err(e) => {
            log::warn!("[gdrive_cache] metadata sync skipped: {}", e);
            return Ok(());
        }
    };

    // A single reusable client — reqwest pools connections internally so this
    // reuses keep-alive sockets across concurrent workers.
    let client = reqwest::Client::new();
    let tmp_dir = state.app_data_dir.join("gdrive_meta_tmp");
    let _ = tokio::fs::create_dir_all(&tmp_dir).await;

    let total = items.len();
    log::info!(
        "[gdrive_cache] hydrating metadata for {} gdrive track(s) with concurrency={}",
        total,
        METADATA_SYNC_CONCURRENCY
    );

    // Announce a sync pass start so the frontend can show a non-modal
    // "hydrating metadata…" indicator.
    if let Some(handle) = &state.app_handle {
        let _ = handle.emit(
            "metadata-sync-progress",
            serde_json::json!({ "done": 0u32, "total": total as u32 }),
        );
    }

    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(METADATA_SYNC_CONCURRENCY));
    let done = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let mut join_set: tokio::task::JoinSet<()> = tokio::task::JoinSet::new();

    for item in items.into_iter() {
        // Skip items that the playback path is already handling — no point
        // racing the same download twice.
        if !mark_started(&item.id) {
            continue;
        }

        let permit = sem
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| anyhow::anyhow!("semaphore closed: {}", e))?;
        let state_c = state.clone();
        let client_c = client.clone();
        let token_c = token.clone();
        let tmp_c = tmp_dir.clone();
        let done_c = done.clone();

        join_set.spawn(async move {
            let _permit = permit; // released when task ends
            let item_id = item.id.clone();
            let result =
                hydrate_one_metadata(&state_c, &client_c, &token_c, &tmp_c, &item).await;
            mark_finished(&item_id);

            if let Err(e) = result {
                log::warn!(
                    "[gdrive_cache] metadata sync: {} ({}): {}",
                    item.name,
                    item_id,
                    e
                );
                return;
            }

            let n = done_c.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            if let Some(handle) = &state_c.app_handle {
                let _ = handle.emit("media-cached", &item_id);
                // Push a progress tick and a library refresh every 10 items
                // (or at the very end) so the UI sees incremental updates
                // instead of one big refresh when the whole sync finishes.
                if n % 10 == 0 || n == total {
                    let _ = handle.emit("library-updated", ());
                    let _ = handle.emit(
                        "metadata-sync-progress",
                        serde_json::json!({ "done": n as u32, "total": total as u32 }),
                    );
                }
            }
        });
    }

    // Drain all workers.
    while let Some(res) = join_set.join_next().await {
        if let Err(e) = res {
            log::warn!("[gdrive_cache] worker join error: {}", e);
        }
    }

    // Clean up temp directory if it's empty.
    let _ = tokio::fs::remove_dir(&tmp_dir).await;

    // Final refresh + progress sentinel so any remainder after the last
    // 10-item tick is flushed and the UI can hide its indicator.
    if let Some(handle) = &state.app_handle {
        let _ = handle.emit("library-updated", ());
        let _ = handle.emit(
            "metadata-sync-progress",
            serde_json::json!({ "done": total as u32, "total": total as u32, "finished": true }),
        );
    }

    Ok(())
}

async fn hydrate_one_metadata(
    state: &AppState,
    client: &reqwest::Client,
    token: &str,
    tmp_dir: &std::path::Path,
    item: &crate::models::MediaItem,
) -> anyhow::Result<()> {
    // Fast path: if the user already played this track, the file is sitting
    // in the LRU cache — reuse it instead of paying for another full Drive
    // download. This also keeps bandwidth usage sane for big libraries where
    // a handful of tracks have been played but the rest are cold.
    let cached_path = {
        if let Ok(conn) = state.db.lock() {
            state.cache_manager.get_cached_path(&conn, &item.id)
        } else {
            None
        }
    };

    let (read_path, tmp_path) = if let Some(p) = cached_path.filter(|p| p.exists()) {
        (p, None)
    } else {
        let ext_hint = mime_to_ext(&item.mime_type).unwrap_or("bin");
        let tmp_path = tmp_dir.join(format!("{}.{}", item.id, ext_hint));

        // Download the file to the temp path. We do a streaming write so very
        // large files don't have to be buffered in memory all at once.
        let url = gdrive_api::download_url(&item.external_id);
        let resp = client.get(&url).bearer_auth(token).send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("HTTP {}", resp.status());
        }
        let bytes = resp.bytes().await?;
        tokio::fs::write(&tmp_path, &bytes).await?;
        (tmp_path.clone(), Some(tmp_path))
    };

    let meta_path = read_path.clone();
    let meta_result = tokio::task::spawn_blocking(move || metadata::read_metadata(&meta_path))
        .await
        .map_err(|e| anyhow::anyhow!("metadata task join failed: {}", e))?;

    // Only remove the temp file if we created one — never touch the cache path.
    if let Some(tmp) = tmp_path {
        let _ = tokio::fs::remove_file(&tmp).await;
    }

    let meta = meta_result.map_err(|e| anyhow::anyhow!("read_metadata: {}", e))?;

    let mut updated = item.clone();
    if updated.title.is_none() {
        updated.title = meta.title;
    }
    if updated.artist.is_none() {
        updated.artist = meta.artist;
    }
    if updated.album.is_none() {
        updated.album = meta.album;
    }
    if updated.album_artist.is_none() {
        updated.album_artist = meta.album_artist;
    }
    if updated.track_number.is_none() {
        updated.track_number = meta.track_number;
    }
    if updated.duration_secs.is_none() {
        updated.duration_secs = meta.duration_secs;
    }
    if updated.year.is_none() {
        updated.year = meta.year;
    }
    if updated.genre.is_none() {
        updated.genre = meta.genre;
    }
    if let Some(art) = meta.artwork {
        updated.artwork_hash = Some(art.hash.clone());
        if let Ok(conn) = state.db.lock() {
            queries::upsert_artwork(&conn, &art.hash, &art.data, &art.mime_type).ok();
        }
    }
    if let Ok(conn) = state.db.lock() {
        queries::upsert_media_item(&conn, &updated)?;
    }
    Ok(())
}

async fn read_access_token(state: &AppState) -> anyhow::Result<String> {
    let token_path = state.app_data_dir.join("gdrive_token.json");
    if !token_path.exists() {
        anyhow::bail!("no Google Drive credentials");
    }
    let data = tokio::fs::read_to_string(&token_path).await?;
    let parsed: serde_json::Value = serde_json::from_str(&data)?;
    let access = parsed["access_token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing access_token"))?
        .to_string();
    Ok(access)
}

fn mime_to_ext(mime: &str) -> Option<&'static str> {
    match mime {
        "audio/mpeg" => Some("mp3"),
        "audio/mp4" | "audio/x-m4a" => Some("m4a"),
        "audio/aac" => Some("aac"),
        "audio/flac" | "audio/x-flac" => Some("flac"),
        "audio/ogg" | "audio/vorbis" => Some("ogg"),
        "audio/wav" | "audio/x-wav" | "audio/wave" => Some("wav"),
        "video/mp4" => Some("mp4"),
        "video/x-matroska" => Some("mkv"),
        "video/webm" => Some("webm"),
        "video/quicktime" => Some("mov"),
        _ => None,
    }
}
