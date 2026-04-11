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
    /// For gdrive items: the parent folder id they were discovered under.
    /// Used so that removing a scanned gdrive folder can delete exactly the
    /// tracks that folder sourced. None for local items.
    #[serde(default)]
    pub gdrive_parent_folder_id: Option<String>,
    /// Number of times this track has been played. Incremented inside
    /// `commands::playback::play`. Defaults to 0 for rows that pre-date the
    /// v4 migration.
    #[serde(default)]
    pub play_count: u32,
    /// Epoch-ms timestamp of the most recent `play_history` entry for this
    /// track. Derived via a LEFT JOIN in `get_all_media_items`; `None` for
    /// tracks that have never been played.
    #[serde(default)]
    pub last_played_at: Option<i64>,
    /// Whether the user has marked this track as a favorite. Derived via
    /// LEFT JOIN on the `favorites` table — not persisted on the
    /// `media_items` row itself, so `upsert_media_item` ignores this field.
    #[serde(default)]
    pub is_favorite: bool,
    /// Beats-per-minute as tagged by the DJ tool that wrote the file. Read
    /// from the TBPM ID3 frame; stored as f32 so fractional BPMs ("124.5")
    /// round-trip cleanly. None when the tag is missing or unparseable.
    #[serde(default)]
    pub bpm: Option<f32>,
    /// Initial musical key in whatever notation the tagging tool wrote —
    /// Camelot ("8A"), Open Key ("1m"), or standard notation ("F#min").
    /// We surface it verbatim; rendering normalization is the UI's job.
    #[serde(default)]
    pub initial_key: Option<String>,
    /// Mixed-In-Key style 1-10 energy rating (stored in the ID3v2 TXXX
    /// "EnergyLevel" frame). Lets DJs filter by vibe.
    #[serde(default)]
    pub energy: Option<u32>,
    /// Free-form comment. DJ tools sometimes stash cue-point annotations
    /// or custom tags here, so it's worth displaying in the track details.
    #[serde(default)]
    pub comment: Option<String>,
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
            gdrive_parent_folder_id: None,
            play_count: 0,
            last_played_at: None,
            is_favorite: false,
            bpm: None,
            initial_key: None,
            energy: None,
            comment: None,
        }
    }
}
