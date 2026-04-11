use crate::models::{MediaItem, Playlist};
use anyhow::Result;

/// Progress callback invoked during a long-running scan.
/// Args: (message, optional current-item name).
pub type ScanProgressFn<'a> = &'a (dyn Fn(&str, Option<&str>) + Send + Sync);

/// Item-yield callback invoked once for each discovered media item.
pub type ScanItemFn<'a> = &'a (dyn Fn(MediaItem) + Send + Sync);

pub trait MediaProvider: Send + Sync {
    fn id(&self) -> &str;

    /// Stream-based scan: `on_item` is called for each discovered media item,
    /// `on_progress` for human-readable status updates. Implementations must
    /// emit items as soon as they're known so the caller can persist them
    /// incrementally instead of waiting for the entire walk to finish.
    ///
    /// There is intentionally **no** non-streaming `scan()` convenience
    /// wrapper. A previous `scan() -> Vec<MediaItem>` helper existed and was
    /// the root cause of a multi-minute main-thread hang on macOS: callers
    /// would buffer the entire (network-bound) Drive walk while holding the
    /// global DB mutex, blocking every frontend IPC command. Always use the
    /// streaming form so the DB mutex can be acquired per-item.
    fn scan_streaming(
        &self,
        on_item: ScanItemFn<'_>,
        on_progress: ScanProgressFn<'_>,
    ) -> Result<()>;

    fn detect_playlists(&self) -> Result<Vec<(Playlist, Vec<MediaItem>)>>;
}
