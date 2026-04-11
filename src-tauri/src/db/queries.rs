use crate::models::{MediaItem, MediaKind, Playlist};
use crate::services::metadata::unwrap_mik_key;
use anyhow::Result;
use rusqlite::{params, Connection};

// --- Media Items ---

pub fn upsert_media_item(conn: &Connection, item: &MediaItem) -> Result<()> {
    conn.execute(
        "INSERT INTO media_items (id, source_id, source_type, external_id, name, mime_type, kind,
            title, artist, album, album_artist, track_number, duration_secs, year, genre,
            artwork_hash, file_size, last_modified, gdrive_parent_folder_id,
            bpm, initial_key, energy, comment)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19,
                 ?20, ?21, ?22, ?23)
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
            gdrive_parent_folder_id = COALESCE(excluded.gdrive_parent_folder_id, media_items.gdrive_parent_folder_id),
            bpm = COALESCE(excluded.bpm, media_items.bpm),
            initial_key = COALESCE(excluded.initial_key, media_items.initial_key),
            energy = COALESCE(excluded.energy, media_items.energy),
            comment = COALESCE(excluded.comment, media_items.comment)",
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
            item.bpm.map(|v| v as f64),
            item.initial_key,
            item.energy.map(|v| v as i32),
            item.comment,
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
        bpm: row.get::<_, Option<f64>>(19)?.map(|v| v as f32),
        // Heal legacy rows that were scanned before the MIK envelope
        // unwrap landed — otherwise a base64-JSON blob would leak into
        // the UI as if it were a plain key string.
        initial_key: row
            .get::<_, Option<String>>(20)?
            .map(|s| unwrap_mik_key(&s))
            .filter(|s| !s.is_empty()),
        energy: row.get::<_, Option<i32>>(21)?.map(|v| v as u32),
        comment: row.get(22)?,
        play_count: row.get::<_, Option<i32>>(23)?.unwrap_or(0) as u32,
        last_played_at: row.get(24)?,
        is_favorite: row.get::<_, Option<i64>>(25)?.is_some(),
    })
}

/// Column list used for every `SELECT ... FROM media_items m` that wants a
/// full `MediaItem` back. The last three columns come from LEFT JOINs so
/// they're nullable: `play_count` defaults to 0, `last_played_at` stays None
/// for never-played tracks, and `is_favorite` is derived from whether the
/// `favorites` join produced a row. The DJ columns (bpm/key/energy/comment)
/// live on the `media_items` row itself and come straight out of SELECT.
const MEDIA_ITEM_COLS: &str =
    "m.id, m.source_id, m.source_type, m.external_id, m.name, m.mime_type, m.kind, \
     m.title, m.artist, m.album, m.album_artist, m.track_number, m.duration_secs, m.year, m.genre, \
     m.artwork_hash, m.file_size, m.last_modified, m.gdrive_parent_folder_id, \
     m.bpm, m.initial_key, m.energy, m.comment, \
     COALESCE(m.play_count, 0) AS play_count, \
     ph.last_played_at AS last_played_at, \
     f.media_id AS favorite_id";

/// Standard FROM + LEFT JOINs that materialize `last_played_at` and
/// `is_favorite` alongside every media row. All `SELECT MEDIA_ITEM_COLS ...`
/// callers need to use this clause so the column indices match
/// `row_to_media_item`.
const MEDIA_ITEM_JOINS: &str =
    "FROM media_items m \
     LEFT JOIN (SELECT media_id, MAX(played_at) AS last_played_at \
                FROM play_history GROUP BY media_id) ph ON ph.media_id = m.id \
     LEFT JOIN favorites f ON f.media_id = m.id";

pub fn get_all_media_items(conn: &Connection) -> Result<Vec<MediaItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols} {joins} \
         ORDER BY COALESCE(m.artist, ''), COALESCE(m.album, ''), COALESCE(m.track_number, 999), m.name",
        cols = MEDIA_ITEM_COLS,
        joins = MEDIA_ITEM_JOINS,
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
        "SELECT {cols} {joins} \
         WHERE m.source_type = 'gdrive' \
           AND m.title IS NULL \
           AND m.artist IS NULL \
           AND m.duration_secs IS NULL",
        cols = MEDIA_ITEM_COLS,
        joins = MEDIA_ITEM_JOINS,
    ))?;
    let items = stmt
        .query_map([], |row| row_to_media_item(row))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(items)
}

pub fn get_media_item_by_id(conn: &Connection, id: &str) -> Result<Option<MediaItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols} {joins} WHERE m.id = ?1",
        cols = MEDIA_ITEM_COLS,
        joins = MEDIA_ITEM_JOINS,
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

// --- Play history / favorites / Home queries ---

/// Record a single play event and bump `media_items.play_count` by 1.
/// Errors bubble up to the caller, but the caller in `commands::playback::play`
/// deliberately ignores them — history is best-effort, playback must not
/// fail because the history row couldn't be written.
pub fn record_play(conn: &Connection, media_id: &str, played_at_ms: i64) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    let entry_id = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO play_history (id, media_id, played_at) VALUES (?1, ?2, ?3)",
        params![entry_id, media_id, played_at_ms],
    )?;
    tx.execute(
        "UPDATE media_items SET play_count = COALESCE(play_count, 0) + 1 WHERE id = ?1",
        params![media_id],
    )?;
    tx.commit()?;
    Ok(())
}

/// Most recent plays first, deduped by media_id. Used by the Home screen's
/// "Recently Played" scroller.
pub fn get_recently_played(conn: &Connection, limit: usize) -> Result<Vec<MediaItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols} \
         {joins} \
         WHERE ph.last_played_at IS NOT NULL \
         ORDER BY ph.last_played_at DESC \
         LIMIT ?1",
        cols = MEDIA_ITEM_COLS,
        joins = MEDIA_ITEM_JOINS,
    ))?;
    let items = stmt
        .query_map(params![limit as i64], |row| row_to_media_item(row))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(items)
}

/// Highest play_count first, tiebroken by most recent play. Used by the
/// Home screen's "Most Played" row.
pub fn get_most_played(conn: &Connection, limit: usize) -> Result<Vec<MediaItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols} \
         {joins} \
         WHERE COALESCE(m.play_count, 0) > 0 \
         ORDER BY m.play_count DESC, ph.last_played_at DESC \
         LIMIT ?1",
        cols = MEDIA_ITEM_COLS,
        joins = MEDIA_ITEM_JOINS,
    ))?;
    let items = stmt
        .query_map(params![limit as i64], |row| row_to_media_item(row))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(items)
}

/// Most recently added to the library, by file mtime. Used by the Home
/// screen's "Recently Added" quick-action filter.
pub fn get_recently_added(conn: &Connection, limit: usize) -> Result<Vec<MediaItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols} \
         {joins} \
         WHERE m.last_modified IS NOT NULL \
         ORDER BY m.last_modified DESC \
         LIMIT ?1",
        cols = MEDIA_ITEM_COLS,
        joins = MEDIA_ITEM_JOINS,
    ))?;
    let items = stmt
        .query_map(params![limit as i64], |row| row_to_media_item(row))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(items)
}

/// Tracks the user has played at least once but not within `min_age_secs`.
/// Used by "Library Highlights – Back in Rotation" on Home.
pub fn get_back_in_rotation(
    conn: &Connection,
    limit: usize,
    min_age_secs: i64,
) -> Result<Vec<MediaItem>> {
    let cutoff_ms = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0))
        - min_age_secs * 1000;
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols} \
         {joins} \
         WHERE COALESCE(m.play_count, 0) > 0 \
           AND ph.last_played_at IS NOT NULL \
           AND ph.last_played_at < ?1 \
         ORDER BY m.play_count DESC, ph.last_played_at ASC \
         LIMIT ?2",
        cols = MEDIA_ITEM_COLS,
        joins = MEDIA_ITEM_JOINS,
    ))?;
    let items = stmt
        .query_map(params![cutoff_ms, limit as i64], |row| row_to_media_item(row))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(items)
}

/// Tracks the user has played late-night (22:00-05:00 local time), ordered
/// by how often they've been played in that window. Used by the "Late Night
/// Tracks" smart suggestion card.
pub fn get_late_night_tracks(conn: &Connection, limit: usize) -> Result<Vec<MediaItem>> {
    // `played_at` is stored in epoch-ms. SQLite's strftime() takes epoch
    // seconds, so we divide by 1000 first. 'localtime' converts to the
    // user's timezone before slicing the hour.
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols}, COUNT(ph2.id) AS night_plays \
         {joins} \
         JOIN play_history ph2 ON ph2.media_id = m.id \
         WHERE CAST(strftime('%H', ph2.played_at / 1000, 'unixepoch', 'localtime') AS INTEGER) \
               IN (22, 23, 0, 1, 2, 3, 4, 5) \
         GROUP BY m.id \
         ORDER BY night_plays DESC, ph.last_played_at DESC \
         LIMIT ?1",
        cols = MEDIA_ITEM_COLS,
        joins = MEDIA_ITEM_JOINS,
    ))?;
    let items = stmt
        .query_map(params![limit as i64], |row| row_to_media_item(row))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(items)
}

/// Tracks whose genre tag matches a high-energy list. Uses RANDOM() so the
/// card stays fresh across visits. Used by the "High Energy Session" smart
/// suggestion card.
pub fn get_high_energy_tracks(conn: &Connection, limit: usize) -> Result<Vec<MediaItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols} \
         {joins} \
         WHERE m.genre IS NOT NULL AND ( \
            LOWER(m.genre) LIKE '%house%' OR \
            LOWER(m.genre) LIKE '%techno%' OR \
            LOWER(m.genre) LIKE '%trance%' OR \
            LOWER(m.genre) LIKE '%dnb%' OR \
            LOWER(m.genre) LIKE '%drum%' OR \
            LOWER(m.genre) LIKE '%electro%' OR \
            LOWER(m.genre) LIKE '%rock%' OR \
            LOWER(m.genre) LIKE '%punk%' OR \
            LOWER(m.genre) LIKE '%metal%' \
         ) \
         ORDER BY RANDOM() \
         LIMIT ?1",
        cols = MEDIA_ITEM_COLS,
        joins = MEDIA_ITEM_JOINS,
    ))?;
    let items = stmt
        .query_map(params![limit as i64], |row| row_to_media_item(row))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(items)
}

/// Toggle a track's favorite state. Returns `true` if the track is now a
/// favorite (row inserted), `false` if it was removed.
pub fn toggle_favorite(conn: &Connection, media_id: &str) -> Result<bool> {
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM favorites WHERE media_id = ?1",
            params![media_id],
            |_| Ok(()),
        )
        .is_ok();
    if exists {
        conn.execute(
            "DELETE FROM favorites WHERE media_id = ?1",
            params![media_id],
        )?;
        Ok(false)
    } else {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        conn.execute(
            "INSERT INTO favorites (media_id, created_at) VALUES (?1, ?2)",
            params![media_id, now_ms],
        )?;
        Ok(true)
    }
}

/// All favorited media ids — used on app startup to populate the playback
/// store's favorites cache so the heart icon can render correctly without
/// a per-track round trip.
pub fn get_favorite_ids(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT media_id FROM favorites")?;
    let ids = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(ids)
}

/// Favorited tracks, most-recently-favorited first. Used by the Home
/// screen's optional "Favorites" row.
pub fn get_favorites(conn: &Connection, limit: usize) -> Result<Vec<MediaItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {cols} \
         {joins} \
         WHERE f.media_id IS NOT NULL \
         ORDER BY f.created_at DESC \
         LIMIT ?1",
        cols = MEDIA_ITEM_COLS,
        joins = MEDIA_ITEM_JOINS,
    ))?;
    let items = stmt
        .query_map(params![limit as i64], |row| row_to_media_item(row))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(items)
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
        "SELECT {cols} \
         {joins} \
         JOIN playlist_entries pe ON pe.media_id = m.id \
         WHERE pe.playlist_id = ?1 \
         ORDER BY pe.position",
        cols = MEDIA_ITEM_COLS,
        joins = MEDIA_ITEM_JOINS,
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
