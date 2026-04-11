use crate::db::queries;
use crate::providers::gdrive::{api, oauth::OAuthManager};
use crate::state::AppState;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[derive(Serialize)]
pub struct GDriveStatus {
    pub connected: bool,
    pub has_credentials: bool,
}

#[derive(Serialize, Clone)]
pub struct GDriveFolder {
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub async fn connect_gdrive(
    state: State<'_, AppState>,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    // Clone what we need before any .await
    let db = state.db.clone();
    let app_data_dir = state.app_data_dir.clone();
    let app_handle = state.app_handle.clone();

    // Resolve credentials: use provided or fall back to stored
    // Note: new credentials are saved AFTER successful OAuth, not before
    let (cid, csecret, is_new_creds) = if client_id.is_empty() || client_secret.is_empty() {
        // Use stored credentials
        let conn = db.lock().map_err(|e| e.to_string())?;
        let (cid, csecret) = queries::get_gdrive_config(&conn)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "No Google Drive credentials configured. Please set up OAuth credentials first.".to_string())?;
        (cid, csecret, false)
    } else {
        (client_id, client_secret, true)
    };

    let oauth = OAuthManager::new(cid.clone(), csecret.clone(), app_data_dir);
    let auth_url = oauth.auth_url();

    // Start temporary HTTP server to capture OAuth callback BEFORE opening browser
    let listener = tokio::net::TcpListener::bind("127.0.0.1:1421")
        .await
        .map_err(|e| format!("Failed to start OAuth callback server: {}", e))?;

    // Open browser for OAuth consent
    open::that_detached(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    // Wait for the OAuth callback (with timeout)
    let accept_result = tokio::time::timeout(
        std::time::Duration::from_secs(120), // 2 minute timeout
        listener.accept(),
    )
    .await
    .map_err(|_| "OAuth timed out. If you saw a Google error page (like 'deleted_client' or 'redirect_uri_mismatch'), your OAuth credentials may be invalid. Please reset and try with new credentials.".to_string())?
    .map_err(|e| format!("Failed to accept OAuth callback: {}", e))?;

    let (mut stream, _) = accept_result;

    // Read the HTTP request
    let mut buf = vec![0u8; 8192];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("Failed to read callback: {}", e))?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // Extract authorization code from: GET /?code=xxx&scope=... HTTP/1.1
    let code = extract_code_from_request(&request).ok_or_else(|| {
        // Check for error
        if request.contains("error=") {
            "OAuth was denied or failed. Please try again.".to_string()
        } else {
            "Failed to extract authorization code from callback".to_string()
        }
    })?;

    // Send success response to browser
    let html = r#"<html><head><script>setTimeout(function(){window.close()},2000);</script></head>
        <body style="font-family:system-ui;text-align:center;padding:60px;background:#09090b;color:#e4e4e7">
        <h2 style="color:#22c55e">&#10003; Connected to Google Drive!</h2>
        <p style="color:#a1a1aa">This tab will close automatically. You can return to Tauri Play.</p></body></html>"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| format!("Failed to send response: {}", e))?;
    stream.shutdown().await.ok();
    drop(listener);

    // Exchange authorization code for tokens
    let oauth = Arc::new(oauth);
    oauth
        .exchange_code(&code, "http://127.0.0.1:1421")
        .await
        .map_err(|e| format!("Failed to exchange authorization code: {}", e))?;

    // Save credentials to DB only after successful OAuth flow
    if is_new_creds {
        let conn = db.lock().map_err(|e| e.to_string())?;
        queries::set_gdrive_config(&conn, &cid, &csecret)
            .map_err(|e| e.to_string())?;
    }

    // Notify frontend and focus the app window
    if let Some(ref handle) = app_handle {
        let _ = handle.emit("gdrive-connected", ());
        if let Some(window) = handle.get_webview_window("main") {
            let _ = window.set_focus();
        }
    }

    Ok(())
}

fn extract_code_from_request(request: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for param in query.split('&') {
        let mut kv = param.splitn(2, '=');
        let key = kv.next()?;
        let value = kv.next()?;
        if key == "code" {
            return Some(urldecode(value));
        }
    }
    None
}

fn urldecode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            }
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result
}

#[tauri::command]
pub fn disconnect_gdrive(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    // Remove token file
    let token_path = state.app_data_dir.join("gdrive_token.json");
    if token_path.exists() {
        std::fs::remove_file(&token_path).map_err(|e| e.to_string())?;
    }

    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;

        // Every gdrive track — file_cache / waveform_cache / playlist_entries
        // rows cascade automatically thanks to the FK constraints.
        queries::delete_media_items_by_source(&conn, "gdrive")
            .map_err(|e| e.to_string())?;
        queries::prune_orphan_artwork(&conn).ok();

        // Remove GDrive scan folders
        conn.execute("DELETE FROM gdrive_scan_folders", [])
            .map_err(|e| e.to_string())?;

        // Remove credentials
        queries::remove_gdrive_config(&conn).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("library-updated", ());
    Ok(())
}

#[tauri::command]
pub fn get_gdrive_status(state: State<'_, AppState>) -> Result<GDriveStatus, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let has_credentials = queries::get_gdrive_config(&conn)
        .map_err(|e| e.to_string())?
        .is_some();
    let token_path = state.app_data_dir.join("gdrive_token.json");
    let connected = has_credentials && token_path.exists();
    Ok(GDriveStatus {
        connected,
        has_credentials,
    })
}

#[tauri::command]
pub async fn list_gdrive_folders(
    state: State<'_, AppState>,
    parent_id: Option<String>,
) -> Result<Vec<GDriveFolder>, String> {
    let (client_id, client_secret) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        queries::get_gdrive_config(&conn)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Google Drive not configured".to_string())?
    };

    let oauth = OAuthManager::new(client_id, client_secret, state.app_data_dir.clone());
    let token = oauth
        .get_access_token()
        .await
        .map_err(|e| e.to_string())?;

    let parent = parent_id.as_deref().unwrap_or("root");
    let folders = api::list_folders(&token, parent)
        .await
        .map_err(|e| e.to_string())?;

    Ok(folders
        .into_iter()
        .map(|f| GDriveFolder {
            id: f.id,
            name: f.name,
        })
        .collect())
}

#[tauri::command]
pub fn add_gdrive_folder(
    state: State<'_, AppState>,
    folder_id: String,
    folder_name: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    queries::add_gdrive_scan_folder(&conn, &id, &folder_id, &folder_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_gdrive_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_id: String,
) -> Result<usize, String> {
    let removed = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        queries::remove_gdrive_scan_folder(&conn, &folder_id)
            .map_err(|e| e.to_string())?;
        // Drop every track that was discovered under this folder. The FK
        // cascade sweeps caches and playlist entries with it.
        let n = queries::delete_gdrive_items_by_folder(&conn, &folder_id)
            .map_err(|e| e.to_string())?;
        queries::prune_orphan_artwork(&conn).ok();
        n
    };
    let _ = app.emit("library-updated", ());
    Ok(removed)
}

#[tauri::command]
pub fn get_gdrive_folders(state: State<'_, AppState>) -> Result<Vec<GDriveFolder>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let folders = queries::get_gdrive_scan_folders(&conn).map_err(|e| e.to_string())?;
    Ok(folders
        .into_iter()
        .map(|(_, fid, name)| GDriveFolder { id: fid, name })
        .collect())
}
