use anyhow::Result;
use serde::Deserialize;

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

/// Stream all audio/video files across the entire Google Drive via the
/// `on_file` callback. Each file is yielded as soon as it arrives in a page.
pub async fn list_media_files(
    access_token: &str,
    on_file: &(dyn Fn(&DriveFile) + Send + Sync),
) -> Result<()> {
    let client = reqwest::Client::new();
    let mut page_token: Option<String> = None;

    let query =
        "(mimeType contains 'audio/' or mimeType contains 'video/') and trashed = false";

    loop {
        let mut req = client
            .get("https://www.googleapis.com/drive/v3/files")
            .query(&[
                ("q", query),
                ("fields", "files(id,name,mimeType),nextPageToken"),
                ("pageSize", "1000"),
            ])
            .bearer_auth(access_token);

        if let Some(ref token) = page_token {
            req = req.query(&[("pageToken", token.as_str())]);
        }

        let resp = req.send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Drive API error {}: {}", status, body);
        }

        let list: DriveFileList = resp.json().await?;
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
    let client = reqwest::Client::new();
    let mut all_folders = Vec::new();
    let mut page_token: Option<String> = None;

    let query = format!(
        "'{}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        parent_id
    );

    loop {
        let mut req = client
            .get("https://www.googleapis.com/drive/v3/files")
            .query(&[
                ("q", query.as_str()),
                ("fields", "files(id,name,mimeType),nextPageToken"),
                ("pageSize", "1000"),
                ("orderBy", "name"),
            ])
            .bearer_auth(access_token);

        if let Some(ref token) = page_token {
            req = req.query(&[("pageToken", token.as_str())]);
        }

        let resp = req.send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Drive API error {}: {}", status, body);
        }

        let list: DriveFileList = resp.json().await?;
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
    let client = reqwest::Client::new();
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
            let mut req = client
                .get("https://www.googleapis.com/drive/v3/files")
                .query(&[
                    ("q", media_query.as_str()),
                    ("fields", "files(id,name,mimeType),nextPageToken"),
                    ("pageSize", "1000"),
                ])
                .bearer_auth(access_token);

            if let Some(ref token) = page_token {
                req = req.query(&[("pageToken", token.as_str())]);
            }

            let resp = req.send().await?;
            if !resp.status().is_success() {
                break;
            }

            let list: DriveFileList = resp.json().await?;
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
            let mut req = client
                .get("https://www.googleapis.com/drive/v3/files")
                .query(&[
                    ("q", folder_query.as_str()),
                    ("fields", "files(id,name,mimeType),nextPageToken"),
                    ("pageSize", "1000"),
                ])
                .bearer_auth(access_token);

            if let Some(ref token) = page_token {
                req = req.query(&[("pageToken", token.as_str())]);
            }

            let resp = req.send().await?;
            if !resp.status().is_success() {
                break;
            }

            let list: DriveFileList = resp.json().await?;
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
