use crate::db::queries;
use crate::providers::gdrive::{oauth::OAuthManager, GDriveProvider};
use crate::providers::local::LocalProvider;
use crate::providers::traits::MediaProvider;
use crate::services::gdrive_cache;
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

        // Run the sync on a blocking thread so heavy scanning + decoding
        // never starves the Tokio runtime that drives the UI / streaming.
        let sync_state = state.clone();
        let result = tokio::task::spawn_blocking(move || sync_all(&sync_state)).await;

        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => log::error!("Sync error: {}", e),
            Err(e) => log::error!("Sync task join error: {}", e),
        }

        if let Some(ref handle) = state.app_handle {
            use tauri::Emitter;
            let _ = handle.emit("sync-completed", ());
            let _ = handle.emit("library-updated", ());
        }

        // Opportunistic metadata hydration for freshly-discovered Google
        // Drive tracks. Runs as a detached async task so the next sync tick
        // isn't blocked waiting on downloads — each file is fetched to a
        // temp path, tagged via lofty, and deleted immediately. Library UI
        // receives incremental `media-cached`/`library-updated` events as
        // rows pick up real titles and artwork.
        gdrive_cache::sync_gdrive_metadata(state.clone());
    }
}

fn sync_all(state: &AppState) -> anyhow::Result<()> {
    // Phase 1: read config under a brief lock, then drop it so the scan
    // itself doesn't block any other DB consumer.
    let (dir_paths, gdrive_config, gdrive_folder_ids) = {
        let conn = state.db.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        let dirs = queries::get_scan_directories(&conn)?;
        let dir_paths: Vec<PathBuf> = dirs.iter().map(|(_, p)| PathBuf::from(p)).collect();

        let gdrive_config = queries::get_gdrive_config(&conn).ok().flatten();
        let gdrive_folders = queries::get_gdrive_scan_folders(&conn).unwrap_or_default();
        let gdrive_folder_ids: Vec<String> =
            gdrive_folders.iter().map(|(_, fid, _)| fid.clone()).collect();

        (dir_paths, gdrive_config, gdrive_folder_ids)
    };

    // Phase 2: build providers without any locks held.
    let mut providers: Vec<Box<dyn MediaProvider>> = Vec::new();
    if !dir_paths.is_empty() {
        providers.push(Box::new(LocalProvider::new(dir_paths)));
    }
    if let Some((client_id, client_secret)) = gdrive_config {
        let token_path = state.app_data_dir.join("gdrive_token.json");
        // Never walk an entire Drive — only run the provider when the user
        // has picked specific folders.
        if token_path.exists() && !gdrive_folder_ids.is_empty() {
            let oauth = Arc::new(OAuthManager::new(
                client_id,
                client_secret,
                state.app_data_dir.clone(),
            ));
            providers.push(Box::new(GDriveProvider::new(oauth, gdrive_folder_ids)));
        }
    }

    // Phase 3: mirror into shared state (briefly) so other commands see them.
    {
        let mut shared = state
            .providers
            .lock()
            .map_err(|e| anyhow::anyhow!("{}", e))?;
        shared.clear();
    }

    // Phase 4: run the scan. We deliberately do **not** hold `state.db` here
    // — `scan_all` re-acquires the mutex per upsert internally. Holding it
    // across the whole call used to wedge the main thread for the entire
    // duration of a Google Drive walk (network-bound, can be many minutes),
    // because frontend IPC commands like `save_app_state` would block on the
    // same mutex. See the macOS hang report at v0.1.0 for the smoking-gun
    // stack trace.
    crate::services::library::scan_all(&providers, &state.db)?;

    Ok(())
}
