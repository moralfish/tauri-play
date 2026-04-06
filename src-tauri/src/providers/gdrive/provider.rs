use crate::models::{MediaItem, MediaKind, Playlist};
use crate::providers::gdrive::{api, oauth::OAuthManager};
use crate::providers::traits::MediaProvider;
use anyhow::Result;
use std::sync::Arc;

pub struct GDriveProvider {
    pub oauth: Arc<OAuthManager>,
    pub folder_ids: Vec<String>,
}

impl GDriveProvider {
    pub fn new(oauth: Arc<OAuthManager>, folder_ids: Vec<String>) -> Self {
        Self { oauth, folder_ids }
    }

    fn kind_from_mime(mime: &str) -> MediaKind {
        if mime.starts_with("video/") {
            MediaKind::Video
        } else {
            MediaKind::Audio
        }
    }
}

impl MediaProvider for GDriveProvider {
    fn id(&self) -> &str {
        "gdrive"
    }

    fn scan(&self) -> Result<Vec<MediaItem>> {
        let oauth = self.oauth.clone();
        let folder_ids = self.folder_ids.clone();
        let rt = tokio::runtime::Handle::current();

        let items = rt.block_on(async {
            let token = oauth.get_access_token().await?;

            let files = if folder_ids.is_empty() {
                // No specific folders selected — scan entire drive
                api::list_media_files(&token).await?
            } else {
                // Scan selected folders recursively
                let mut all = Vec::new();
                for folder_id in &folder_ids {
                    let files = api::list_media_files_in_folder(&token, folder_id).await?;
                    all.extend(files);
                }
                // Deduplicate by file ID (a file might appear in multiple folder trees)
                let mut seen = std::collections::HashSet::new();
                all.retain(|f| seen.insert(f.id.clone()));
                all
            };

            let items: Vec<MediaItem> = files
                .into_iter()
                .map(|f| {
                    MediaItem::new(
                        uuid::Uuid::new_v4().to_string(),
                        "gdrive".to_string(),
                        "gdrive".to_string(),
                        f.id,
                        f.name,
                        f.mime_type.clone(),
                        Self::kind_from_mime(&f.mime_type),
                    )
                })
                .collect();

            Ok::<_, anyhow::Error>(items)
        })?;

        Ok(items)
    }

    fn get_stream_url(&self, media: &MediaItem) -> Result<String> {
        Ok(format!("http://127.0.0.1:9876/stream/{}", media.id))
    }

    fn detect_playlists(&self) -> Result<Vec<(Playlist, Vec<MediaItem>)>> {
        Ok(Vec::new())
    }
}
