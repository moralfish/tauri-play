use crate::models::{MediaItem, Playlist};
use crate::services::playlist as playlist_service;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_playlists(state: State<'_, AppState>) -> Result<Vec<Playlist>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    playlist_service::get_playlists(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_playlist_tracks(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<Vec<MediaItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    playlist_service::get_playlist_tracks(&conn, &playlist_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_playlist(state: State<'_, AppState>, name: String) -> Result<Playlist, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    playlist_service::create_playlist(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_playlist(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    playlist_service::delete_playlist(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_playlist(
    state: State<'_, AppState>,
    id: String,
    new_name: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    playlist_service::rename_playlist(&conn, &id, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_track_to_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    media_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    playlist_service::add_track(&conn, &playlist_id, &media_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_track_from_playlist(
    state: State<'_, AppState>,
    entry_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    playlist_service::remove_track(&conn, &entry_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    ordered_media_ids: Vec<String>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    playlist_service::reorder_tracks(&conn, &playlist_id, &ordered_media_ids)
        .map_err(|e| e.to_string())
}
