use crate::db::queries;
use crate::services::{playback, waveform};
use crate::state::AppState;
use serde::Serialize;
use tauri::State;

#[tauri::command]
pub fn play(state: State<'_, AppState>, media_id: String) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    playback::resolve_stream_url(&conn, &media_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_waveform(state: State<'_, AppState>, media_id: String) -> Result<Vec<f32>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let item = queries::get_media_item_by_id(&conn, &media_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Media item not found".to_string())?;

    // Only generate waveforms for local audio files or cached files
    if item.source_type == "local" {
        let path = std::path::Path::new(&item.external_id);
        if path.exists() {
            return waveform::get_or_generate_peaks(&conn, &media_id, path)
                .map_err(|e| e.to_string());
        }
    }

    // Check if file is in cache (for GDrive)
    if let Some(cached_path) = state.cache_manager.get_cached_path(&conn, &media_id) {
        return waveform::get_or_generate_peaks(&conn, &media_id, &cached_path)
            .map_err(|e| e.to_string());
    }

    // No local file available — return empty peaks
    Ok(vec![0.0; 800])
}

#[derive(Serialize)]
pub struct CacheStats {
    pub total_bytes: u64,
    pub item_count: u64,
}

#[tauri::command]
pub fn get_cache_stats(state: State<'_, AppState>) -> Result<CacheStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let total_bytes = state.cache_manager.total_size(&conn).map_err(|e| e.to_string())?;
    let item_count = state.cache_manager.item_count(&conn).map_err(|e| e.to_string())?;
    Ok(CacheStats {
        total_bytes,
        item_count,
    })
}

#[tauri::command]
pub fn clear_cache(state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    state.cache_manager.clear_all(&conn).map_err(|e| e.to_string())
}
