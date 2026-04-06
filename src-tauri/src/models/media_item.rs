use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MediaKind {
    Audio,
    Video,
}

impl MediaKind {
    pub fn as_str(&self) -> &str {
        match self {
            MediaKind::Audio => "audio",
            MediaKind::Video => "video",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "video" => MediaKind::Video,
            _ => MediaKind::Audio,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItem {
    pub id: String,
    pub source_id: String,
    pub source_type: String,
    pub external_id: String,
    pub name: String,
    pub mime_type: String,
    pub kind: MediaKind,
    // Metadata fields
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub duration_secs: Option<f64>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub artwork_hash: Option<String>,
    pub file_size: Option<i64>,
    pub last_modified: Option<i64>,
}

impl MediaItem {
    /// Create a new MediaItem with only the required fields (metadata defaults to None)
    pub fn new(
        id: String,
        source_id: String,
        source_type: String,
        external_id: String,
        name: String,
        mime_type: String,
        kind: MediaKind,
    ) -> Self {
        Self {
            id,
            source_id,
            source_type,
            external_id,
            name,
            mime_type,
            kind,
            title: None,
            artist: None,
            album: None,
            album_artist: None,
            track_number: None,
            duration_secs: None,
            year: None,
            genre: None,
            artwork_hash: None,
            file_size: None,
            last_modified: None,
        }
    }
}
