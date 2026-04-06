use crate::models::{MediaItem, Playlist};
use anyhow::Result;

pub trait MediaProvider: Send + Sync {
    fn id(&self) -> &str;
    fn scan(&self) -> Result<Vec<MediaItem>>;
    fn get_stream_url(&self, media: &MediaItem) -> Result<String>;
    fn detect_playlists(&self) -> Result<Vec<(Playlist, Vec<MediaItem>)>>;
}
