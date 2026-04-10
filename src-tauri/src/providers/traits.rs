use crate::models::{MediaItem, Playlist};
use anyhow::Result;
use std::sync::Mutex;

/// Progress callback invoked during a long-running scan.
/// Args: (message, optional current-item name).
pub type ScanProgressFn<'a> = &'a (dyn Fn(&str, Option<&str>) + Send + Sync);

/// Item-yield callback invoked once for each discovered media item.
pub type ScanItemFn<'a> = &'a (dyn Fn(MediaItem) + Send + Sync);

pub trait MediaProvider: Send + Sync {
    fn id(&self) -> &str;

    /// Stream-based scan: `on_item` is called for each discovered media item,
    /// `on_progress` for human-readable status updates. Implementations should
    /// emit items as soon as they're known so the caller can persist them
    /// incrementally instead of waiting for the entire walk to finish.
    fn scan_streaming(
        &self,
        on_item: ScanItemFn<'_>,
        on_progress: ScanProgressFn<'_>,
    ) -> Result<()>;

    /// Convenience wrapper that collects all streamed items into a Vec.
    fn scan(&self) -> Result<Vec<MediaItem>> {
        let items = Mutex::new(Vec::new());
        self.scan_streaming(
            &|item| items.lock().unwrap().push(item),
            &|_, _| {},
        )?;
        Ok(items.into_inner().unwrap())
    }

    fn detect_playlists(&self) -> Result<Vec<(Playlist, Vec<MediaItem>)>>;
}
