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

/// List all audio/video files across the entire Google Drive.
pub async fn list_media_files(access_token: &str) -> Result<Vec<DriveFile>> {
    let client = reqwest::Client::new();
    let mut all_files = Vec::new();
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
        all_files.extend(list.files);

        match list.next_page_token {
            Some(token) => page_token = Some(token),
            None => break,
        }
    }

    Ok(all_files)
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

/// Recursively list all audio/video files within a folder and its subfolders.
pub async fn list_media_files_in_folder(
    access_token: &str,
    folder_id: &str,
) -> Result<Vec<DriveFile>> {
    let client = reqwest::Client::new();
    let mut all_files = Vec::new();
    let mut folders_to_scan = vec![folder_id.to_string()];

    while let Some(current_folder) = folders_to_scan.pop() {
        // List media files in this folder
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
            all_files.extend(list.files);

            match list.next_page_token {
                Some(token) => page_token = Some(token),
                None => break,
            }
        }

        // List subfolders to recurse into
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
            for subfolder in &list.files {
                folders_to_scan.push(subfolder.id.clone());
            }

            match list.next_page_token {
                Some(token) => page_token = Some(token),
                None => break,
            }
        }
    }

    Ok(all_files)
}

pub fn download_url(file_id: &str) -> String {
    format!(
        "https://www.googleapis.com/drive/v3/files/{}?alt=media",
        file_id
    )
}
