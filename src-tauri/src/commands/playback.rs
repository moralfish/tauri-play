use crate::db::queries;
use crate::services::{gdrive_cache, playback, waveform};
use crate::state::AppState;
use serde::Serialize;
use tauri::State;

#[tauri::command]
pub fn play(state: State<'_, AppState>, media_id: String) -> Result<String, String> {
    // Resolve URL synchronously so the frontend can start playback immediately.
    let url = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        playback::resolve_stream_url(&conn, &media_id).map_err(|e| e.to_string())?
    };

    // Kick off background hydration for cloud sources: download into the
    // local cache, extract tag metadata, generate waveform peaks. The play
    // request itself returns immediately and continues to stream from Drive
    // until the cache is warm; subsequent plays will hit the cache.
    let item = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        queries::get_media_item_by_id(&conn, &media_id).map_err(|e| e.to_string())?
    };
    if let Some(item) = item {
        if item.source_type == "gdrive" {
            gdrive_cache::ensure_cached_in_background((*state).clone(), media_id.clone());
        }
    }

    // Best-effort play history logging. Any error here is swallowed — a
    // failing INSERT into `play_history` must never block playback. The row
    // drives the Home screen's Recently Played / Most Played / Back in
    // Rotation / Late Night sections and also bumps `media_items.play_count`.
    {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        if let Ok(conn) = state.db.lock() {
            let _ = queries::record_play(&conn, &media_id, now_ms);
        }
    }

    Ok(url)
}

#[tauri::command]
pub async fn get_waveform(
    state: State<'_, AppState>,
    media_id: String,
) -> Result<Vec<f32>, String> {
    // Acquire the DB briefly to resolve the file path and check the peaks
    // cache, then drop the lock. Heavy decoding happens on a blocking
    // thread with no locks held.
    let decode_path: Option<std::path::PathBuf> = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;

        // Cached peaks win — return immediately without any decoding.
        if let Ok(cached) = conn.query_row(
            "SELECT peaks FROM waveform_cache WHERE media_id = ?1",
            rusqlite::params![&media_id],
            |row| row.get::<_, String>(0),
        ) {
            if let Ok(peaks) = serde_json::from_str::<Vec<f32>>(&cached) {
                return Ok(peaks);
            }
        }

        let item = queries::get_media_item_by_id(&conn, &media_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Media item not found".to_string())?;

        if item.source_type == "local" {
            let path = std::path::PathBuf::from(&item.external_id);
            if path.exists() {
                Some(path)
            } else {
                None
            }
        } else {
            state.cache_manager.get_cached_path(&conn, &media_id)
        }
    };

    let Some(path) = decode_path else {
        return Ok(vec![0.0; 800]);
    };

    let peaks = tokio::task::spawn_blocking(move || waveform::generate_peaks(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    // Store the freshly computed peaks so subsequent calls hit the cache.
    if let Ok(conn) = state.db.lock() {
        if let Ok(json) = serde_json::to_string(&peaks) {
            conn.execute(
                "INSERT OR REPLACE INTO waveform_cache (media_id, peaks) VALUES (?1, ?2)",
                rusqlite::params![&media_id, json],
            )
            .ok();
        }
    }

    Ok(peaks)
}

#[derive(Serialize)]
pub struct CacheStats {
    pub total_bytes: u64,
    pub item_count: u64,
    pub max_bytes: u64,
    pub cache_dir: String,
}

#[tauri::command]
pub fn get_cache_stats(state: State<'_, AppState>) -> Result<CacheStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let total_bytes = state.cache_manager.total_size(&conn).map_err(|e| e.to_string())?;
    let item_count = state.cache_manager.item_count(&conn).map_err(|e| e.to_string())?;
    let max_bytes = state.cache_manager.get_max_bytes();
    let cache_dir = state.cache_manager.cache_dir().to_string_lossy().to_string();
    Ok(CacheStats {
        total_bytes,
        item_count,
        max_bytes,
        cache_dir,
    })
}

#[tauri::command]
pub fn clear_cache(state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    state.cache_manager.clear_all(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_cache_max_bytes(
    state: State<'_, AppState>,
    max_bytes: u64,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    state
        .cache_manager
        .set_max_bytes(&conn, max_bytes)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_cache_folder(state: State<'_, AppState>) -> Result<(), String> {
    let path = state.cache_manager.cache_dir().to_path_buf();
    // Make sure the directory exists so the OS file manager can open it.
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    open::that_detached(&path).map_err(|e| e.to_string())
}
