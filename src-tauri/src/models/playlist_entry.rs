use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistEntry {
    pub id: String,
    pub playlist_id: String,
    pub media_id: String,
    pub position: i32,
}
