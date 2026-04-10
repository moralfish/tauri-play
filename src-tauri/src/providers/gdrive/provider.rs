use crate::models::{MediaItem, MediaKind, Playlist};
use crate::providers::gdrive::{api, oauth::OAuthManager};
use crate::providers::traits::{MediaProvider, ScanItemFn, ScanProgressFn};
use anyhow::Result;
use std::collections::HashSet;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tokio::runtime::Runtime;

// Dedicated runtime for blocking GDrive scans from sync Tauri commands.
// `Handle::current()` would panic when called from a sync Tauri command thread,
// so we own a multi-thread runtime here and reuse it for every scan.
static GDRIVE_RUNTIME: OnceLock<Runtime> = OnceLock::new();

fn gdrive_runtime() -> &'static Runtime {
    GDRIVE_RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .worker_threads(2)
            .thread_name("gdrive-worker")
            .build()
            .expect("failed to build gdrive tokio runtime")
    })
}

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

    fn scan_streaming(
        &self,
        on_item: ScanItemFn<'_>,
        on_progress: ScanProgressFn<'_>,
    ) -> Result<()> {
        let oauth = self.oauth.clone();
        let folder_ids = self.folder_ids.clone();

        // Cross-folder dedup: a single file may show up in multiple selected
        // folder trees (or via shortcuts) — only emit each external id once.
        let seen_files: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
        let item_count = AtomicUsize::new(0);

        let on_drive_file = |f: &api::DriveFile| {
            if !seen_files.lock().unwrap().insert(f.id.clone()) {
                return;
            }
            let item = MediaItem::new(
                uuid::Uuid::new_v4().to_string(),
                "gdrive".to_string(),
                "gdrive".to_string(),
                f.id.clone(),
                f.name.clone(),
                f.mime_type.clone(),
                Self::kind_from_mime(&f.mime_type),
            );
            let n = item_count.fetch_add(1, Ordering::SeqCst) + 1;
            on_progress(&format!("Discovered {} files", n), Some(&f.name));
            on_item(item);
        };

        gdrive_runtime().block_on(async {
            on_progress("Authenticating with Google Drive...", None);
            let token = oauth.get_access_token().await?;

            if folder_ids.is_empty() {
                on_progress("Listing entire Google Drive...", None);
                api::list_media_files(&token, &on_drive_file).await?;
            } else {
                let folder_total = folder_ids.len();
                for (idx, folder_id) in folder_ids.iter().enumerate() {
                    on_progress(
                        &format!("Scanning Drive folder {}/{}", idx + 1, folder_total),
                        None,
                    );
                    api::list_media_files_in_folder(
                        &token,
                        folder_id,
                        &on_drive_file,
                        &|status| on_progress(status, None),
                    )
                    .await?;
                }
            }

            Ok::<_, anyhow::Error>(())
        })?;

        Ok(())
    }

    fn detect_playlists(&self) -> Result<Vec<(Playlist, Vec<MediaItem>)>> {
        Ok(Vec::new())
    }
}
