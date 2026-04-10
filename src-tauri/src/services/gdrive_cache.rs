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

    // 5. Extract tag metadata via lofty and update the media row.
    if let Ok(meta) = metadata::read_metadata(&cache_path) {
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
            let conn = state.db.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
            queries::upsert_artwork(&conn, &art.hash, &art.data, &art.mime_type).ok();
        }
        let conn = state.db.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        queries::upsert_media_item(&conn, &updated).ok();
    }

    // 6. Generate waveform peaks (audio only). Best-effort: video files
    //    won't decode through symphonia's audio probe, just skip.
    {
        let conn = state.db.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        let _ = waveform::get_or_generate_peaks(&conn, media_id, &cache_path);
    }

    // 7. Tell the frontend something it cares about changed so the library
    //    view can refresh and the player can re-fetch the waveform.
    if let Some(handle) = &state.app_handle {
        let _ = handle.emit("library-updated", ());
        let _ = handle.emit("media-cached", media_id);
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
