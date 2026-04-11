mod commands;
mod db;
mod models;
mod providers;
mod server;
mod services;
mod state;

use std::sync::Arc;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_dir = app.handle().path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;

            let db_conn = db::schema::init_db(app.handle())?;
            let db = Arc::new(std::sync::Mutex::new(db_conn));

            let cache_manager = Arc::new(services::cache::CacheManager::new(&app_dir));
            if let Ok(conn) = db.lock() {
                cache_manager.load_config(&conn);
            }

            let app_state = state::AppState {
                db: db.clone(),
                providers: Arc::new(std::sync::Mutex::new(Vec::new())),
                app_data_dir: app_dir,
                app_handle: Some(app.handle().clone()),
                cache_manager,
            };

            app.manage(app_state.clone());

            // Open devtools in debug builds
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            // Spawn the streaming server
            let server_state = app_state.clone();
            tauri::async_runtime::spawn(async move {
                server::start_streaming_server(server_state).await;
            });

            // Spawn background sync loop (5 minute interval)
            let sync_state = app_state.clone();
            tauri::async_runtime::spawn(async move {
                services::sync::start_sync_loop(
                    sync_state,
                    std::time::Duration::from_secs(5 * 60),
                )
                .await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::scan_library,
            commands::library::get_media_items,
            commands::library::add_directory,
            commands::library::remove_directory,
            commands::library::get_directories,
            commands::library::write_metadata,
            commands::library::save_app_state,
            commands::library::get_app_state,
            commands::library::delete_media_items,
            commands::library::flush_library,
            commands::playlist::get_playlists,
            commands::playlist::get_playlist_tracks,
            commands::playlist::create_playlist,
            commands::playlist::delete_playlist,
            commands::playlist::rename_playlist,
            commands::playlist::add_track_to_playlist,
            commands::playlist::remove_track_from_playlist,
            commands::playlist::reorder_playlist,
            commands::playback::play,
            commands::playback::get_waveform,
            commands::playback::get_cache_stats,
            commands::playback::clear_cache,
            commands::playback::set_cache_max_bytes,
            commands::playback::open_cache_folder,
            commands::gdrive::connect_gdrive,
            commands::gdrive::disconnect_gdrive,
            commands::gdrive::get_gdrive_status,
            commands::gdrive::list_gdrive_folders,
            commands::gdrive::add_gdrive_folder,
            commands::gdrive::remove_gdrive_folder,
            commands::gdrive::get_gdrive_folders,
            commands::home::get_recently_played,
            commands::home::get_most_played,
            commands::home::get_recently_added,
            commands::home::get_back_in_rotation,
            commands::home::get_late_night_tracks,
            commands::home::get_high_energy_tracks,
            commands::home::get_favorites,
            commands::home::get_favorite_ids,
            commands::home::toggle_favorite,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
