use crate::db::queries;
use crate::models::MediaItem;
use crate::providers::gdrive::{oauth::OAuthManager, GDriveProvider};
use crate::providers::local::{self, LocalProvider};
use crate::services::library::{self, ScanResult};
use crate::services::metadata::{self, WriteMetadata};
use crate::state::AppState;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn scan_library(state: State<'_, AppState>) -> Result<ScanResult, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Get configured directories for local provider
    let dirs = queries::get_scan_directories(&conn).map_err(|e| e.to_string())?;
    let dir_paths: Vec<PathBuf> = dirs.iter().map(|(_, p)| PathBuf::from(p)).collect();

    // Update local provider with current directories
    let local_provider = LocalProvider::new(dir_paths.clone());

    let mut providers = state.providers.lock().map_err(|e| e.to_string())?;
    providers.retain(|p| p.id() != "local" && p.id() != "gdrive");
    providers.push(Box::new(local_provider));

    // Add GDrive provider if configured and connected
    if let Ok(Some((client_id, client_secret))) = queries::get_gdrive_config(&conn) {
        let token_path = state.app_data_dir.join("gdrive_token.json");
        if token_path.exists() {
            let oauth = Arc::new(OAuthManager::new(
                client_id,
                client_secret,
                state.app_data_dir.clone(),
            ));
            let gdrive_folders = queries::get_gdrive_scan_folders(&conn).unwrap_or_default();
            let folder_ids: Vec<String> =
                gdrive_folders.iter().map(|(_, fid, _)| fid.clone()).collect();
            let gdrive_provider = GDriveProvider::new(oauth, folder_ids);
            providers.push(Box::new(gdrive_provider));
        }
    }

    let result = library::scan_all(&providers, &conn).map_err(|e| e.to_string())?;

    // Extract and store artwork from local files
    let artwork_items = local::extract_artwork_from_items(&dir_paths);
    for (hash, data, mime_type) in artwork_items {
        queries::upsert_artwork(&conn, &hash, &data, &mime_type).ok();
    }

    Ok(result)
}

#[tauri::command]
pub fn get_media_items(state: State<'_, AppState>) -> Result<Vec<MediaItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_all_media_items(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_directory(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    queries::add_scan_directory(&conn, &id, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_directory(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::remove_scan_directory(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_directories(state: State<'_, AppState>) -> Result<Vec<(String, String)>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_scan_directories(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_metadata(
    state: State<'_, AppState>,
    media_id: String,
    meta: WriteMetadata,
) -> Result<MediaItem, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let item = queries::get_media_item_by_id(&conn, &media_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Media item not found".to_string())?;

    if item.source_type != "local" {
        return Err("Metadata write-back only supported for local files".to_string());
    }

    let path = std::path::Path::new(&item.external_id);
    metadata::write_metadata(path, &meta).map_err(|e| e.to_string())?;

    // Re-read metadata and update DB
    let new_meta = metadata::read_metadata(path).map_err(|e| e.to_string())?;
    let mut updated_item = item;
    updated_item.title = new_meta.title;
    updated_item.artist = new_meta.artist;
    updated_item.album = new_meta.album;
    updated_item.album_artist = new_meta.album_artist;
    updated_item.track_number = new_meta.track_number;
    updated_item.duration_secs = new_meta.duration_secs;
    updated_item.year = new_meta.year;
    updated_item.genre = new_meta.genre;
    if let Some(ref art) = new_meta.artwork {
        updated_item.artwork_hash = Some(art.hash.clone());
        queries::upsert_artwork(&conn, &art.hash, &art.data, &art.mime_type)
            .map_err(|e| e.to_string())?;
    }
    queries::upsert_media_item(&conn, &updated_item).map_err(|e| e.to_string())?;

    Ok(updated_item)
}

#[tauri::command]
pub fn save_app_state(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::set_sync_state(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_app_state(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_sync_state(&conn, &key).map_err(|e| e.to_string())
}
