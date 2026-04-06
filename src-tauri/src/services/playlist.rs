use crate::db::queries;
use crate::models::{MediaItem, Playlist};
use anyhow::Result;
use rusqlite::Connection;

pub fn create_playlist(conn: &Connection, name: &str) -> Result<Playlist> {
    let playlist = Playlist {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        is_source: false,
    };
    queries::insert_playlist(conn, &playlist)?;
    Ok(playlist)
}

pub fn delete_playlist(conn: &Connection, id: &str) -> Result<()> {
    queries::delete_playlist(conn, id)
}

pub fn rename_playlist(conn: &Connection, id: &str, new_name: &str) -> Result<()> {
    queries::rename_playlist(conn, id, new_name)
}

pub fn get_playlists(conn: &Connection) -> Result<Vec<Playlist>> {
    queries::get_all_playlists(conn)
}

pub fn get_playlist_tracks(conn: &Connection, playlist_id: &str) -> Result<Vec<MediaItem>> {
    queries::get_playlist_tracks(conn, playlist_id)
}

pub fn add_track(conn: &Connection, playlist_id: &str, media_id: &str) -> Result<()> {
    let position = queries::get_max_position(conn, playlist_id)? + 1;
    let entry_id = uuid::Uuid::new_v4().to_string();
    queries::add_playlist_entry(conn, &entry_id, playlist_id, media_id, position)
}

pub fn remove_track(conn: &Connection, entry_id: &str) -> Result<()> {
    queries::remove_playlist_entry(conn, entry_id)
}

pub fn reorder_tracks(
    conn: &Connection,
    playlist_id: &str,
    ordered_media_ids: &[String],
) -> Result<()> {
    queries::reorder_playlist_entries(conn, playlist_id, ordered_media_ids)
}
