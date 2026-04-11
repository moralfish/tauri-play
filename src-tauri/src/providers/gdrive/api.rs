use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::error::Error as StdError;
use std::sync::OnceLock;
use std::time::Duration;

#[derive(Debug, Deserialize)]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}

#[derive(Debug, Deserialize)]
struct DriveFileList {
    files: Vec<DriveFile>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

// Shared hardened HTTP client. Reusing one client across every Drive
// call lets reqwest pool TCP+TLS connections instead of paying a full
// handshake per page, and the explicit timeouts mean a stalled
// connection fails fast instead of hanging the whole scan.
fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(60))
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(4)
            .user_agent(concat!("TauriPlay/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("failed to build reqwest client")
    })
}

/// Walk a `reqwest::Error`'s full `source()` chain and fold it into a
/// single readable string. Without this, top-level errors like
/// `error sending request for url(...)` hide the actual cause (DNS
/// failure / connection refused / TLS handshake failure / timeout),
/// which is exactly what bit the user's scan.
fn describe_reqwest_err(err: &reqwest::Error) -> String {
    let mut parts: Vec<String> = vec![err.to_string()];
    let mut src: Option<&dyn StdError> = err.source();
    while let Some(cause) = src {
        parts.push(cause.to_string());
        src = cause.source();
    }
    // Annotate common categories so the user sees actionable info.
    let mut hint = String::new();
    if err.is_timeout() {
        hint = " (timeout)".to_string();
    } else if err.is_connect() {
        hint = " (connection failed — check network / DNS)".to_string();
    } else if err.is_request() {
        hint = " (request build error)".to_string();
    }
    format!("{}{}", parts.join(" → "), hint)
}

/// Classify whether a transport error is worth retrying. Anything
/// except a builder error (malformed URL, bad headers, etc.) can
/// plausibly succeed on a second attempt — timeouts, connection
/// refusals, and generic send failures are all transient.
fn is_retryable(err: &reqwest::Error) -> bool {
    !err.is_builder()
}

/// Send a GET with retries. Transport failures and 5xx/429 responses
/// are retried with exponential backoff; 4xx responses fail fast so
/// auth errors surface immediately.
async fn send_with_retry(
    req_builder: impl Fn() -> reqwest::RequestBuilder,
) -> Result<reqwest::Response> {
    const MAX_ATTEMPTS: usize = 4;
    // 300ms, 800ms, 1800ms, 3500ms — total wait ~6.4s worst case.
    const BACKOFFS_MS: [u64; 4] = [300, 800, 1800, 3500];

    let mut last_err: Option<String> = None;
    for attempt in 0..MAX_ATTEMPTS {
        match req_builder().send().await {
            Ok(resp) => {
                let status = resp.status();
                // Success (2xx) or client error (4xx, non-429) → return
                // immediately and let the caller inspect the response.
                if status.is_success() || (status.is_client_error() && status.as_u16() != 429) {
                    return Ok(resp);
                }
                // Retryable server/rate-limit response — consume body for
                // the error message and loop.
                let body = resp.text().await.unwrap_or_default();
                last_err = Some(format!(
                    "Drive API {} (attempt {}/{}): {}",
                    status,
                    attempt + 1,
                    MAX_ATTEMPTS,
                    body.chars().take(200).collect::<String>()
                ));
            }
            Err(err) => {
                let expanded = describe_reqwest_err(&err);
                if !is_retryable(&err) {
                    return Err(anyhow!("Drive API request failed: {}", expanded));
                }
                last_err = Some(format!(
                    "Drive API transport error (attempt {}/{}): {}",
                    attempt + 1,
                    MAX_ATTEMPTS,
                    expanded
                ));
            }
        }

        // Sleep before next attempt, unless we've already exhausted them.
        if attempt + 1 < MAX_ATTEMPTS {
            tokio::time::sleep(Duration::from_millis(BACKOFFS_MS[attempt])).await;
        }
    }

    Err(anyhow!(
        "Drive API unreachable after {} attempts: {}",
        MAX_ATTEMPTS,
        last_err.unwrap_or_else(|| "unknown error".to_string())
    ))
}

/// Stream all audio/video files across the entire Google Drive via the
/// `on_file` callback. Each file is yielded as soon as it arrives in a page.
///
/// Kept around for future "scan entire drive" support but currently unused:
/// the GDrive provider only walks explicitly-selected folders.
#[allow(dead_code)]
pub async fn list_media_files(
    access_token: &str,
    on_file: &(dyn Fn(&DriveFile) + Send + Sync),
) -> Result<()> {
    let client = http_client();
    let mut page_token: Option<String> = None;

    let query =
        "(mimeType contains 'audio/' or mimeType contains 'video/') and trashed = false";

    loop {
        let page_token_snapshot = page_token.clone();
        let resp = send_with_retry(|| {
            let mut req = client
                .get("https://www.googleapis.com/drive/v3/files")
                .query(&[
                    ("q", query),
                    ("fields", "files(id,name,mimeType),nextPageToken"),
                    ("pageSize", "1000"),
                ])
                .bearer_auth(access_token);
            if let Some(ref token) = page_token_snapshot {
                req = req.query(&[("pageToken", token.as_str())]);
            }
            req
        })
        .await
        .context("listing Drive media files")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Drive API error {}: {}", status, body);
        }

        let list: DriveFileList = resp
            .json()
            .await
            .context("parsing Drive file list JSON")?;
        for file in &list.files {
            on_file(file);
        }

        match list.next_page_token {
            Some(token) => page_token = Some(token),
            None => break,
        }
    }

    Ok(())
}

/// List immediate subfolders of a given parent folder.
pub async fn list_folders(access_token: &str, parent_id: &str) -> Result<Vec<DriveFile>> {
    let client = http_client();
    let mut all_folders = Vec::new();
    let mut page_token: Option<String> = None;

    let query = format!(
        "'{}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        parent_id
    );

    loop {
        let page_token_snapshot = page_token.clone();
        let resp = send_with_retry(|| {
            let mut req = client
                .get("https://www.googleapis.com/drive/v3/files")
                .query(&[
                    ("q", query.as_str()),
                    ("fields", "files(id,name,mimeType),nextPageToken"),
                    ("pageSize", "1000"),
                    ("orderBy", "name"),
                ])
                .bearer_auth(access_token);
            if let Some(ref token) = page_token_snapshot {
                req = req.query(&[("pageToken", token.as_str())]);
            }
            req
        })
        .await
        .with_context(|| format!("listing subfolders of {}", parent_id))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Drive API error {}: {}", status, body);
        }

        let list: DriveFileList = resp
            .json()
            .await
            .context("parsing Drive subfolder list JSON")?;
        all_folders.extend(list.files);

        match list.next_page_token {
            Some(token) => page_token = Some(token),
            None => break,
        }
    }

    Ok(all_folders)
}

/// Recursively walk a folder tree and stream every audio/video file via
/// `on_file`. Calls `on_status` between folders so the caller can render live
/// "Visiting folder X (N pending)" updates even when nothing new is being
/// discovered. Includes cycle protection so duplicate or shortcut-induced
/// loops cannot stall the scan.
pub async fn list_media_files_in_folder(
    access_token: &str,
    folder_id: &str,
    on_file: &(dyn Fn(&DriveFile) + Send + Sync),
    on_status: &(dyn Fn(&str) + Send + Sync),
) -> Result<()> {
    let client = http_client();
    let mut folders_to_scan: Vec<(String, String)> =
        vec![(folder_id.to_string(), String::new())];
    let mut seen_folders: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    seen_folders.insert(folder_id.to_string());
    let mut folders_visited = 0usize;
    let mut file_count = 0usize;

    while let Some((current_folder, current_name)) = folders_to_scan.pop() {
        folders_visited += 1;
        let pending = folders_to_scan.len();
        let label = if current_name.is_empty() {
            String::new()
        } else {
            format!(" — {}", current_name)
        };
        on_status(&format!(
            "Visiting folder {} ({} pending, {} files so far){}",
            folders_visited, pending, file_count, label
        ));

        // List media files in this folder (paginated)
        let mut page_token: Option<String> = None;
        let media_query = format!(
            "'{}' in parents and (mimeType contains 'audio/' or mimeType contains 'video/') and trashed = false",
            current_folder
        );

        loop {
            let page_token_snapshot = page_token.clone();
            let resp = send_with_retry(|| {
                let mut req = client
                    .get("https://www.googleapis.com/drive/v3/files")
                    .query(&[
                        ("q", media_query.as_str()),
                        ("fields", "files(id,name,mimeType),nextPageToken"),
                        ("pageSize", "1000"),
                    ])
                    .bearer_auth(access_token);
                if let Some(ref token) = page_token_snapshot {
                    req = req.query(&[("pageToken", token.as_str())]);
                }
                req
            })
            .await
            .with_context(|| {
                format!("listing media in folder {}", current_folder)
            })?;

            if !resp.status().is_success() {
                // For non-success (e.g. a single folder the user doesn't
                // have read access to) we skip gracefully rather than
                // aborting the entire scan.
                on_status(&format!(
                    "Skipped folder {} ({}): {}",
                    folders_visited,
                    resp.status(),
                    current_name
                ));
                break;
            }

            let list: DriveFileList = match resp.json().await {
                Ok(l) => l,
                Err(err) => {
                    on_status(&format!(
                        "Skipped folder {} (bad JSON): {}",
                        folders_visited,
                        describe_reqwest_err(&err)
                    ));
                    break;
                }
            };
            for file in &list.files {
                file_count += 1;
                on_file(file);
            }

            match list.next_page_token {
                Some(token) => page_token = Some(token),
                None => break,
            }
        }

        // Enumerate subfolders to recurse into (with cycle protection)
        let mut page_token: Option<String> = None;
        let folder_query = format!(
            "'{}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            current_folder
        );

        loop {
            let page_token_snapshot = page_token.clone();
            let resp = send_with_retry(|| {
                let mut req = client
                    .get("https://www.googleapis.com/drive/v3/files")
                    .query(&[
                        ("q", folder_query.as_str()),
                        ("fields", "files(id,name,mimeType),nextPageToken"),
                        ("pageSize", "1000"),
                    ])
                    .bearer_auth(access_token);
                if let Some(ref token) = page_token_snapshot {
                    req = req.query(&[("pageToken", token.as_str())]);
                }
                req
            })
            .await
            .with_context(|| {
                format!("listing subfolders of {}", current_folder)
            })?;

            if !resp.status().is_success() {
                break;
            }

            let list: DriveFileList = match resp.json().await {
                Ok(l) => l,
                Err(_) => break,
            };
            for subfolder in list.files {
                if seen_folders.insert(subfolder.id.clone()) {
                    folders_to_scan.push((subfolder.id, subfolder.name));
                }
            }

            match list.next_page_token {
                Some(token) => page_token = Some(token),
                None => break,
            }
        }
    }

    Ok(())
}

pub fn download_url(file_id: &str) -> String {
    format!(
        "https://www.googleapis.com/drive/v3/files/{}?alt=media",
        file_id
    )
}
