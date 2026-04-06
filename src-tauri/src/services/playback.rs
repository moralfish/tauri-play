use crate::db::queries;
use crate::providers::traits::MediaProvider;
use anyhow::Result;
use rusqlite::Connection;

pub fn resolve_stream_url(
    conn: &Connection,
    providers: &[Box<dyn MediaProvider>],
    media_id: &str,
) -> Result<String> {
    let item = queries::get_media_item_by_id(conn, media_id)?
        .ok_or_else(|| anyhow::anyhow!("Media item not found: {}", media_id))?;

    let provider = providers
        .iter()
        .find(|p| p.id() == item.source_type)
        .ok_or_else(|| anyhow::anyhow!("No provider found for source_type: {}", item.source_type))?;

    provider.get_stream_url(&item)
}
