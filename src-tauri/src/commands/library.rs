use crate::db::queries;
use crate::models::MediaItem;
use crate::providers::gdrive::{oauth::OAuthManager, GDriveProvider};
use crate::providers::local::{self, LocalProvider};
use crate::providers::traits::MediaProvider;
use crate::services::gdrive_cache;
use crate::services::library::ScanResult;
use crate::services::metadata::{self, WriteMetadata};
use crate::state::AppState;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    stage: String,
    message: String,
    current: usize,
    total: usize,
    current_file: Option<String>,
}

// Prevent overlapping scans across the whole app.
static SCAN_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

fn emit_progress(app: &AppHandle, stage: &str, message: &str, current: usize, total: usize) {
    let _ = app.emit(
        "scan-progress",
        ScanProgress {
            stage: stage.to_string(),
            message: message.to_string(),
            current,
            total,
            current_file: None,
        },
    );
}

#[tauri::command]
pub async fn scan_library(app: AppHandle) -> Result<(), String> {
    // Guard against re-entry
    if SCAN_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Scan already in progress".to_string());
    }

    // Run the heavy work on a blocking thread so we don't lock up the IPC thread
    // or the Tokio runtime. Errors are reported via events.
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = run_scan(&app_clone);
        SCAN_IN_PROGRESS.store(false, Ordering::SeqCst);

        match result {
            Ok(scan_result) => {
                let _ = app_clone.emit("scan-completed", &scan_result);
                let _ = app_clone.emit("library-updated", ());

                // Kick off the gdrive metadata hydration pass right away.
                // Without this, freshly-scanned cloud tracks would show up
                // in the library with their bare filename only and stay
                // that way until either the user played each one or the
                // 5-minute periodic background sync caught up. The pass
                // is idempotent and uses an in-flight dedup set, so it's
                // safe to run alongside the periodic sync.
                let state: State<'_, AppState> = app_clone.state();
                gdrive_cache::sync_gdrive_metadata((*state).clone());
            }
            Err(err) => {
                let _ = app_clone.emit("scan-error", err.to_string());
            }
        }
    });

    Ok(())
}

fn run_scan(app: &AppHandle) -> Result<ScanResult, String> {
    let state: State<'_, AppState> = app.state();

    emit_progress(app, "starting", "Preparing scan...", 0, 0);

    let dir_paths: Vec<PathBuf>;
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let dirs = queries::get_scan_directories(&conn).map_err(|e| e.to_string())?;
        dir_paths = dirs.iter().map(|(_, p)| PathBuf::from(p)).collect();
    }

    // Build a fresh providers list. We avoid holding the providers mutex
    // across the long-running scan by collecting into a local Vec.
    let mut local_providers: Vec<Box<dyn MediaProvider>> = Vec::new();
    local_providers.push(Box::new(LocalProvider::new(dir_paths.clone())));

    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        if let Ok(Some((client_id, client_secret))) = queries::get_gdrive_config(&conn) {
            let token_path = state.app_data_dir.join("gdrive_token.json");
            if token_path.exists() {
                let gdrive_folders =
                    queries::get_gdrive_scan_folders(&conn).unwrap_or_default();
                let folder_ids: Vec<String> = gdrive_folders
                    .iter()
                    .map(|(_, fid, _)| fid.clone())
                    .collect();
                // Only add the GDrive provider when the user has explicitly
                // selected folders. We never walk an entire Drive.
                if !folder_ids.is_empty() {
                    let oauth = Arc::new(OAuthManager::new(
                        client_id,
                        client_secret,
                        state.app_data_dir.clone(),
                    ));
                    local_providers.push(Box::new(GDriveProvider::new(oauth, folder_ids)));
                }
            }
        }
    }

    // Mirror into shared state so other commands can still see them
    {
        let mut providers = state.providers.lock().map_err(|e| e.to_string())?;
        providers.retain(|p| p.id() != "local" && p.id() != "gdrive");
        // Re-construct fresh boxes for the shared list (cheap configuration data only)
        providers.push(Box::new(LocalProvider::new(dir_paths.clone())));
    }

    let mut total_items = 0usize;
    let mut total_playlists = 0usize;
    let provider_count = local_providers.len();

    // Clear old source playlists to avoid duplicates
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        queries::clear_source_playlists(&conn).map_err(|e| e.to_string())?;
    }

    for (idx, provider) in local_providers.iter().enumerate() {
        let label = match provider.id() {
            "local" => "Scanning local files",
            "gdrive" => "Scanning Google Drive",
            other => other,
        };
        emit_progress(app, "provider", label, idx, provider_count);

        // Stream items into the DB as they're discovered so they become
        // visible/playable as soon as the scan finishes — instead of waiting
        // for the entire (potentially very long) discovery walk to complete.
        //
        // Progress events are throttled: we emit at most once every 200 ms
        // OR every 100 items, whichever comes first. Without this, a
        // ten-thousand-file scan floods the webview with ten thousand
        // React re-renders and the UI becomes unresponsive.
        let imported = AtomicUsize::new(0);
        let db = state.db.clone();
        let app_for_item = app.clone();
        let app_for_status = app.clone();
        let label_for_item = label.to_string();
        let label_for_status = label.to_string();
        let last_item_emit = Mutex::new(Instant::now() - Duration::from_secs(1));
        let last_status_emit = Mutex::new(Instant::now() - Duration::from_secs(1));
        // Independent throttle for `library-updated`. We want the library
        // view to refresh while a long Drive scan is still in flight, but
        // not on every single upsert (a 10k-file scan would re-fetch the
        // whole library 10k times). One refetch every ~750 ms or every
        // 50 imported items strikes the balance.
        let last_lib_emit = Mutex::new(Instant::now() - Duration::from_secs(1));

        const ITEM_EMIT_INTERVAL: Duration = Duration::from_millis(200);
        const ITEM_EMIT_EVERY_N: usize = 100;
        const STATUS_EMIT_INTERVAL: Duration = Duration::from_millis(250);
        const LIB_EMIT_INTERVAL: Duration = Duration::from_millis(750);
        const LIB_EMIT_EVERY_N: usize = 50;

        let scan_result = provider.scan_streaming(
            &|item: MediaItem| {
                if let Ok(conn) = db.lock() {
                    if let Err(e) = queries::upsert_media_item(&conn, &item) {
                        eprintln!("Failed to upsert media item: {}", e);
                        return;
                    }
                }
                let n = imported.fetch_add(1, Ordering::SeqCst) + 1;

                // Tell the frontend the library has new rows so it can
                // refetch incrementally instead of waiting for the entire
                // scan to finish. The frontend store debounces these at
                // 250 ms, so even a burst of 50 events still produces a
                // single getMediaItems() round-trip.
                let should_emit_lib = {
                    let mut last = last_lib_emit.lock().unwrap();
                    let now = Instant::now();
                    if n % LIB_EMIT_EVERY_N == 0
                        || now.duration_since(*last) >= LIB_EMIT_INTERVAL
                    {
                        *last = now;
                        true
                    } else {
                        false
                    }
                };
                if should_emit_lib {
                    let _ = app_for_item.emit("library-updated", ());
                }

                // Throttle: emit only if enough time or items have elapsed.
                let should_emit = {
                    let mut last = last_item_emit.lock().unwrap();
                    let now = Instant::now();
                    if n % ITEM_EMIT_EVERY_N == 0 || now.duration_since(*last) >= ITEM_EMIT_INTERVAL {
                        *last = now;
                        true
                    } else {
                        false
                    }
                };
                if should_emit {
                    let _ = app_for_item.emit(
                        "scan-progress",
                        ScanProgress {
                            stage: "items".to_string(),
                            message: format!("{}: imported {} files", label_for_item, n),
                            current: n,
                            total: 0,
                            current_file: Some(item.name.clone()),
                        },
                    );
                }
            },
            &|msg, file| {
                // Throttle status updates similarly.
                let should_emit = {
                    let mut last = last_status_emit.lock().unwrap();
                    let now = Instant::now();
                    if now.duration_since(*last) >= STATUS_EMIT_INTERVAL {
                        *last = now;
                        true
                    } else {
                        false
                    }
                };
                if !should_emit {
                    return;
                }
                let _ = app_for_status.emit(
                    "scan-progress",
                    ScanProgress {
                        stage: "discovering".to_string(),
                        message: format!("{}: {}", label_for_status, msg),
                        current: 0,
                        total: 0,
                        current_file: file.map(|s| s.to_string()),
                    },
                );
            },
        );
        scan_result.map_err(|e| e.to_string())?;
        total_items += imported.load(Ordering::SeqCst);

        // Source playlists
        emit_progress(app, "playlists", "Importing playlists...", idx, provider_count);
        let playlists = provider.detect_playlists().map_err(|e| e.to_string())?;
        {
            let conn = state.db.lock().map_err(|e| e.to_string())?;
            for (playlist, playlist_items) in &playlists {
                for item in playlist_items {
                    queries::upsert_media_item(&conn, item).map_err(|e| e.to_string())?;
                }
                queries::insert_playlist(&conn, playlist).map_err(|e| e.to_string())?;
                for (i, item) in playlist_items.iter().enumerate() {
                    let actual_id = queries::get_media_id_by_source(
                        &conn,
                        &item.source_type,
                        &item.external_id,
                    )
                    .map_err(|e| e.to_string())?
                    .unwrap_or_else(|| item.id.clone());
                    let entry_id = uuid::Uuid::new_v4().to_string();
                    let _ = queries::add_playlist_entry(
                        &conn,
                        &entry_id,
                        &playlist.id,
                        &actual_id,
                        i as i32,
                    );
                }
            }
        }
        total_playlists += playlists.len();
    }

    // Extract and store artwork from local files
    emit_progress(app, "artwork", "Extracting artwork...", 0, 0);
    let artwork_items = local::extract_artwork_from_items(&dir_paths);
    let artwork_total = artwork_items.len();
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        for (i, (hash, data, mime_type)) in artwork_items.into_iter().enumerate() {
            queries::upsert_artwork(&conn, &hash, &data, &mime_type).ok();
            if i % 10 == 0 || i + 1 == artwork_total {
                emit_progress(
                    app,
                    "artwork",
                    &format!("Extracting artwork ({}/{})", i + 1, artwork_total),
                    i + 1,
                    artwork_total,
                );
            }
        }
    }

    emit_progress(app, "done", "Finalizing...", total_items, total_items);

    Ok(ScanResult {
        items_found: total_items,
        playlists_found: total_playlists,
    })
}

#[tauri::command]
pub fn get_media_items(state: State<'_, AppState>) -> Result<Vec<MediaItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_all_media_items(&conn).map_err(|e| e.to_string())
}

/// Remove a specific set of tracks from the library. Cascades through
/// file_cache / waveform_cache / playlist_entries. Also prunes any orphaned
/// artwork rows that were only referenced by the removed tracks.
#[tauri::command]
pub fn delete_media_items(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<usize, String> {
    let removed = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let n = queries::delete_media_items(&conn, &ids).map_err(|e| e.to_string())?;
        queries::prune_orphan_artwork(&conn).ok();
        n
    };
    let _ = app.emit("library-updated", ());
    Ok(removed)
}

/// Nuke every track from the library. Source configuration (scan dirs,
/// gdrive folders) is left alone — the user can rescan any time.
#[tauri::command]
pub fn flush_library(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let removed = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let n = queries::delete_all_media_items(&conn).map_err(|e| e.to_string())?;
        queries::prune_orphan_artwork(&conn).ok();
        n
    };
    let _ = app.emit("library-updated", ());
    Ok(removed)
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
