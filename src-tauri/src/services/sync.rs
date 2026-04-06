use crate::db::queries;
use crate::providers::gdrive::{oauth::OAuthManager, GDriveProvider};
use crate::providers::local::LocalProvider;
use crate::state::AppState;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

pub async fn start_sync_loop(state: AppState, interval: Duration) {
    loop {
        tokio::time::sleep(interval).await;

        if let Some(ref handle) = state.app_handle {
            use tauri::Emitter;
            let _ = handle.emit("sync-started", ());
        }

        // Sync: re-scan all providers for changes
        if let Err(e) = sync_all(&state) {
            log::error!("Sync error: {}", e);
        }

        if let Some(ref handle) = state.app_handle {
            use tauri::Emitter;
            let _ = handle.emit("sync-completed", ());
            let _ = handle.emit("library-updated", ());
        }
    }
}

fn sync_all(state: &AppState) -> anyhow::Result<()> {
    let conn = state.db.lock().map_err(|e| anyhow::anyhow!("{}", e))?;

    // Rebuild providers list with current config
    let mut providers = state.providers.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
    providers.clear();

    // Local provider
    let dirs = queries::get_scan_directories(&conn)?;
    let dir_paths: Vec<PathBuf> = dirs.iter().map(|(_, p)| PathBuf::from(p)).collect();
    if !dir_paths.is_empty() {
        providers.push(Box::new(LocalProvider::new(dir_paths)));
    }

    // GDrive provider (if configured and connected)
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
            providers.push(Box::new(GDriveProvider::new(oauth, folder_ids)));
        }
    }

    crate::services::library::scan_all(&providers, &conn)?;
    Ok(())
}
