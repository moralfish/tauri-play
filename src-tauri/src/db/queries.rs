use crate::models::{MediaItem, MediaKind, Playlist};
use anyhow::Result;
use rusqlite::{params, Connection};

// --- Media Items ---

pub fn upsert_media_item(conn: &Connection, item: &MediaItem) -> Result<()> {
    conn.execute(
        "INSERT INTO media_items (id, source_id, source_type, external_id, name, mime_type, kind,
            title, artist, album, album_artist, track_number, duration_secs, year, genre,
            artwork_hash, file_size, last_modified, gdrive_parent_folder_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
         ON CONFLICT(source_type, external_id) DO UPDATE SET
            name = excluded.name,
            mime_type = excluded.mime_type,
            kind = excluded.kind,
            title = excluded.title,
            artist = excluded.artist,
            album = excluded.album,
            album_artist = excluded.album_artist,
            track_number = excluded.track_number,
            duration_secs = excluded.duration_secs,
            year = excluded.year,
            genre = excluded.genre,
            artwork_hash = excluded.artwork_hash,
            file_size = excluded.file_size,
            last_modified = excluded.last_modified,
            gdrive_parent_folder_id = COALESCE(excluded.gdrive_parent_folder_id, media_items.gdrive_parent_folder_id)",
        params![
            item.id,
            item.source_id,
            item.source_type,
            item.external_id,
            item.name,
            item.mime_type,
            item.kind.as_str(),
            item.title,
            item.artist,
            item.album,
            item.album_artist,
            item.track_number.map(|v| v as i32),
            item.duration_secs,
            item.year.map(|v| v as i32),
            item.genre,
            item.artwork_hash,
            item.file_size,
            item.last_modified,
            item.gdrive_parent_folder_id,
        ],
    )?;
    Ok(())
}

fn row_to_media_item(row: &rusqlite::Row) -> rusqlite::Result<MediaItem> {
    Ok(MediaItem {
        id: row.get(0)?,
        source_id: row.get(1)?,
        source_type: row.get(2)?,
        external_id: row.get(3)?,
        name: row.get(4)?,
        mime_type: row.get(5)?,
        kind: MediaKind::from_str(&row.get::<_, String>(6)?),
        title: row.get(7)?,
        artist: row.get(8)?,
        album: row.get(9)?,
        album_artist: row.get(10)?,
        track_number: row.get::<_, Option<i32>>(11)?.map(|v| v as u32),
        duration_secs: row.get(12)?,
        year: row.get::<_, Option<i32>>(13)?.map(|v| v as u32),
        genre: row.get(14)?,
        artwork_hash: row.get(15)?,
        file_size: row.get(16)?,
        last_modified: row.get(17)?,
        gdrive_parent_folder_id: row.get(18)?,
    })
}

const MEDIA_ITEM_COLS: &str =
    "id, source_id, source_type, external_id, name, mime_type, kind, \
     title, artist, album, album_artist, track_number, duration_secs, year, genre, \
     artwork_hash, file_size, last_modified, gdrive_parent_folder_id";

pub fn get_all_media_items(conn: &Connection) -> Result<Vec<MediaItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM media_items ORDER BY COALESCE(artist, ''), COALESCE(album, ''), COALESCE(track_number, 999), name",
        MEDIA_ITEM_COLS
    ))?;
    let items = stmt
        .query_map([], |row| row_to_media_item(row))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(items)
}

/// Return all Google Drive media items whose tag-derived metadata is still
/// empty — the background sync loop uses this to opportunistically fetch and
/// decode tags for freshly-discovered cloud tracks so the library view shows
/// real titles/artists/album art without having to actually play each one.
pub fn get_gdrive_items_needing_metadata(conn: &Connection) -> Result<Vec<MediaItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM media_items \
         WHERE source_type = 'gdrive' \
           AND title IS NULL \
           AND artist IS NULL \
           AND duration_secs IS NULL",
        MEDIA_ITEM_COLS
    ))?;
    let items = stmt
        .query_map([], |row| row_to_media_item(row))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(items)
}

pub fn get_media_item_by_id(conn: &Connection, id: &str) -> Result<Option<MediaItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM media_items WHERE id = ?1",
        MEDIA_ITEM_COLS
    ))?;
    let mut rows = stmt.query_map(params![id], |row| row_to_media_item(row))?;
    Ok(rows.next().transpose()?)
}

/// Delete a batch of media items by internal id. Cascade takes care of
/// `file_cache`, `waveform_cache`, and `playlist_entries` rows. Returns the
/// number of media_items rows actually removed.
pub fn delete_media_items(conn: &Connection, ids: &[String]) -> Result<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let tx = conn.unchecked_transaction()?;
    let mut stmt = tx.prepare("DELETE FROM media_items WHERE id = ?1")?;
    let mut removed = 0usize;
    for id in ids {
        removed += stmt.execute(params![id])?;
    }
    drop(stmt);
    tx.commit()?;
    Ok(removed)
}

/// Delete every media item. Returns the number of rows removed. Cascades
/// clean up file_cache / waveform_cache / playlist_entries.
pub fn delete_all_media_items(conn: &Connection) -> Result<usize> {
    let n = conn.execute("DELETE FROM media_items", [])?;
    Ok(n)
}

/// Delete every media item that came from a given source type (e.g. "gdrive").
pub fn delete_media_items_by_source(conn: &Connection, source_type: &str) -> Result<usize> {
    let n = conn.execute(
        "DELETE FROM media_items WHERE source_type = ?1",
        params![source_type],
    )?;
    Ok(n)
}

/// Delete every gdrive media item that was discovered under `folder_id`.
pub fn delete_gdrive_items_by_folder(conn: &Connection, folder_id: &str) -> Result<usize> {
    let n = conn.execute(
        "DELETE FROM media_items WHERE source_type = 'gdrive' AND gdrive_parent_folder_id = ?1",
        params![folder_id],
    )?;
    Ok(n)
}

/// Remove orphaned artwork rows — entries no longer referenced by any media
/// item. Called after bulk deletes so the artwork cache doesn't grow
/// unbounded. Artwork is deduped by hash so there's no cascade on the FK.
pub fn prune_orphan_artwork(conn: &Connection) -> Result<usize> {
    let n = conn.execute(
        "DELETE FROM artwork_cache WHERE hash NOT IN \
         (SELECT artwork_hash FROM media_items WHERE artwork_hash IS NOT NULL)",
        [],
    )?;
    Ok(n)
}

// --- Artwork ---

pub fn upsert_artwork(conn: &Connection, hash: &str, data: &[u8], mime_type: &str) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO artwork_cache (hash, data, mime_type) VALUES (?1, ?2, ?3)",
        params![hash, data, mime_type],
    )?;
    Ok(())
}

pub fn get_artwork(conn: &Connection, hash: &str) -> Result<Option<(Vec<u8>, String)>> {
    let mut stmt =
        conn.prepare("SELECT data, mime_type FROM artwork_cache WHERE hash = ?1")?;
    let mut rows = stmt.query_map(params![hash], |row| {
        Ok((row.get::<_, Vec<u8>>(0)?, row.get::<_, String>(1)?))
    })?;
    Ok(rows.next().transpose()?)
}

// --- Playlists ---

pub fn insert_playlist(conn: &Connection, playlist: &Playlist) -> Result<()> {
    conn.execute(
        "INSERT INTO playlists (id, name, is_source) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name",
        params![playlist.id, playlist.name, playlist.is_source as i32],
    )?;
    Ok(())
}

pub fn get_all_playlists(conn: &Connection) -> Result<Vec<Playlist>> {
    let mut stmt = conn.prepare("SELECT id, name, is_source FROM playlists ORDER BY name")?;
    let playlists = stmt
        .query_map([], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                is_source: row.get::<_, i32>(2)? != 0,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(playlists)
}

pub fn delete_playlist(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn rename_playlist(conn: &Connection, id: &str, new_name: &str) -> Result<()> {
    conn.execute(
        "UPDATE playlists SET name = ?1 WHERE id = ?2",
        params![new_name, id],
    )?;
    Ok(())
}

// --- Playlist Entries ---

pub fn get_playlist_tracks(conn: &Connection, playlist_id: &str) -> Result<Vec<MediaItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT m.{cols}
         FROM media_items m
         JOIN playlist_entries pe ON pe.media_id = m.id
         WHERE pe.playlist_id = ?1
         ORDER BY pe.position",
        cols = MEDIA_ITEM_COLS
            .split(", ")
            .map(|c| format!("m.{}", c))
            .collect::<Vec<_>>()
            .join(", ")
    ))?;
    let items = stmt
        .query_map(params![playlist_id], |row| row_to_media_item(row))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(items)
}

pub fn add_playlist_entry(
    conn: &Connection,
    id: &str,
    playlist_id: &str,
    media_id: &str,
    position: i32,
) -> Result<()> {
    conn.execute(
        "INSERT INTO playlist_entries (id, playlist_id, media_id, position) VALUES (?1, ?2, ?3, ?4)",
        params![id, playlist_id, media_id, position],
    )?;
    Ok(())
}

pub fn remove_playlist_entry(conn: &Connection, entry_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM playlist_entries WHERE id = ?1",
        params![entry_id],
    )?;
    Ok(())
}

pub fn get_max_position(conn: &Connection, playlist_id: &str) -> Result<i32> {
    let max: Option<i32> = conn.query_row(
        "SELECT MAX(position) FROM playlist_entries WHERE playlist_id = ?1",
        params![playlist_id],
        |row| row.get(0),
    )?;
    Ok(max.unwrap_or(0))
}

pub fn reorder_playlist_entries(
    conn: &Connection,
    playlist_id: &str,
    ordered_media_ids: &[String],
) -> Result<()> {
    for (i, media_id) in ordered_media_ids.iter().enumerate() {
        conn.execute(
            "UPDATE playlist_entries SET position = ?1 WHERE playlist_id = ?2 AND media_id = ?3",
            params![i as i32, playlist_id, media_id],
        )?;
    }
    Ok(())
}

// --- Scan Directories ---

pub fn get_scan_directories(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT id, path FROM scan_directories ORDER BY path")?;
    let dirs = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<std::result::Result<Vec<(String, String)>, _>>()?;
    Ok(dirs)
}

pub fn add_scan_directory(conn: &Connection, id: &str, path: &str) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO scan_directories (id, path) VALUES (?1, ?2)",
        params![id, path],
    )?;
    Ok(())
}

pub fn remove_scan_directory(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM scan_directories WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

// --- Sync State (key-value) ---

pub fn set_sync_state(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_sync_state(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM sync_state WHERE key = ?1")?;
    let mut rows = stmt.query_map(params![key], |row| row.get(0))?;
    Ok(rows.next().transpose()?)
}

// --- Google Drive Config ---

pub fn set_gdrive_config(conn: &Connection, client_id: &str, client_secret: &str) -> Result<()> {
    let config = serde_json::json!({
        "client_id": client_id,
        "client_secret": client_secret,
    });
    conn.execute(
        "INSERT OR REPLACE INTO provider_config (id, provider_type, name, config_json, enabled)
         VALUES ('gdrive', 'gdrive', 'Google Drive', ?1, 1)",
        params![config.to_string()],
    )?;
    Ok(())
}

pub fn get_gdrive_config(conn: &Connection) -> Result<Option<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT config_json FROM provider_config WHERE id = 'gdrive' AND enabled = 1",
    )?;
    let mut rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    match rows.next() {
        Some(Ok(json_str)) => {
            let v: serde_json::Value = serde_json::from_str(&json_str)?;
            let client_id = v["client_id"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing client_id"))?
                .to_string();
            let client_secret = v["client_secret"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing client_secret"))?
                .to_string();
            Ok(Some((client_id, client_secret)))
        }
        _ => Ok(None),
    }
}

pub fn get_media_id_by_source(conn: &Connection, source_type: &str, external_id: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT id FROM media_items WHERE source_type = ?1 AND external_id = ?2")?;
    let mut rows = stmt.query_map(params![source_type, external_id], |row| row.get(0))?;
    Ok(rows.next().transpose()?)
}

pub fn clear_source_playlists(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM playlist_entries WHERE playlist_id IN (SELECT id FROM playlists WHERE is_source = 1)", [])?;
    conn.execute("DELETE FROM playlists WHERE is_source = 1", [])?;
    Ok(())
}

pub fn remove_gdrive_config(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM provider_config WHERE id = 'gdrive'", [])?;
    Ok(())
}

// --- GDrive Scan Folders ---

pub fn add_gdrive_scan_folder(
    conn: &Connection,
    id: &str,
    folder_id: &str,
    folder_name: &str,
) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO gdrive_scan_folders (id, folder_id, folder_name) VALUES (?1, ?2, ?3)",
        params![id, folder_id, folder_name],
    )?;
    Ok(())
}

pub fn remove_gdrive_scan_folder(conn: &Connection, folder_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM gdrive_scan_folders WHERE folder_id = ?1",
        params![folder_id],
    )?;
    Ok(())
}

pub fn get_gdrive_scan_folders(conn: &Connection) -> Result<Vec<(String, String, String)>> {
    let mut stmt =
        conn.prepare("SELECT id, folder_id, folder_name FROM gdrive_scan_folders ORDER BY folder_name")?;
    let rows = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<std::result::Result<Vec<(String, String, String)>, _>>()?;
    Ok(rows)
}
