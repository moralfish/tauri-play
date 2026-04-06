use crate::db::queries;
use anyhow::Result;
use rusqlite::Connection;

/// Resolve the streaming URL for a media item.
/// All sources stream through our local Axum server, so we just need the item ID.
pub fn resolve_stream_url(
    conn: &Connection,
    media_id: &str,
) -> Result<String> {
    // Verify the item exists
    let _item = queries::get_media_item_by_id(conn, media_id)?
        .ok_or_else(|| anyhow::anyhow!("Media item not found: {}", media_id))?;

    // All media streams through the local Axum server which handles
    // both local files and GDrive proxying based on source_type
    Ok(format!("http://127.0.0.1:9876/stream/{}", media_id))
}
