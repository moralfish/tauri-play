use anyhow::Result;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

pub fn init_db(app_handle: &AppHandle) -> Result<Connection> {
    let app_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("media_player.db");
    let conn = Connection::open(db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    create_tables(&conn)?;
    run_migrations(&conn)?;

    Ok(conn)
}

fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS media_items (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            external_id TEXT NOT NULL,
            name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            kind TEXT NOT NULL,
            UNIQUE(source_type, external_id)
        );

        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            is_source INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS playlist_entries (
            id TEXT PRIMARY KEY,
            playlist_id TEXT NOT NULL,
            media_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE,
            UNIQUE(playlist_id, media_id)
        );

        CREATE TABLE IF NOT EXISTS scan_directories (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE
        );
        ",
    )?;

    Ok(())
}

fn get_user_version(conn: &Connection) -> Result<i32> {
    let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    Ok(version)
}

fn set_user_version(conn: &Connection, version: i32) -> Result<()> {
    conn.execute_batch(&format!("PRAGMA user_version = {};", version))?;
    Ok(())
}

fn run_migrations(conn: &Connection) -> Result<()> {
    let version = get_user_version(conn)?;

    if version < 1 {
        migrate_v1(conn)?;
        set_user_version(conn, 1)?;
    }

    if version < 2 {
        migrate_v2(conn)?;
        set_user_version(conn, 2)?;
    }

    if version < 3 {
        migrate_v3(conn)?;
        set_user_version(conn, 3)?;
    }

    if version < 4 {
        migrate_v4(conn)?;
        set_user_version(conn, 4)?;
    }

    if version < 5 {
        migrate_v5(conn)?;
        set_user_version(conn, 5)?;
    }

    Ok(())
}

fn migrate_v1(conn: &Connection) -> Result<()> {
    // Metadata columns on media_items
    let new_columns = [
        ("title", "TEXT"),
        ("artist", "TEXT"),
        ("album", "TEXT"),
        ("album_artist", "TEXT"),
        ("track_number", "INTEGER"),
        ("duration_secs", "REAL"),
        ("year", "INTEGER"),
        ("genre", "TEXT"),
        ("artwork_hash", "TEXT"),
        ("file_size", "INTEGER"),
        ("last_modified", "INTEGER"),
    ];
    for (col, col_type) in &new_columns {
        // ALTER TABLE ADD COLUMN is idempotent-safe with IF NOT EXISTS in newer SQLite,
        // but rusqlite bundled version may not support it, so we check first.
        let exists: bool = conn
            .prepare(&format!(
                "SELECT COUNT(*) FROM pragma_table_info('media_items') WHERE name = '{}'",
                col
            ))?
            .query_row([], |row| row.get::<_, i32>(0))
            .map(|count| count > 0)?;
        if !exists {
            conn.execute_batch(&format!(
                "ALTER TABLE media_items ADD COLUMN {} {};",
                col, col_type
            ))?;
        }
    }

    // Artwork cache (deduplicated by SHA256)
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS artwork_cache (
            hash TEXT PRIMARY KEY,
            data BLOB NOT NULL,
            mime_type TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS file_cache (
            media_id TEXT PRIMARY KEY,
            cache_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            cached_at INTEGER NOT NULL,
            last_accessed INTEGER NOT NULL,
            FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS waveform_cache (
            media_id TEXT PRIMARY KEY,
            peaks TEXT NOT NULL,
            FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS provider_config (
            id TEXT PRIMARY KEY,
            provider_type TEXT NOT NULL,
            name TEXT NOT NULL,
            config_json TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS sync_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )?;

    Ok(())
}

fn migrate_v2(conn: &Connection) -> Result<()> {
    // Google Drive scan folders
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS gdrive_scan_folders (
            id TEXT PRIMARY KEY,
            folder_id TEXT NOT NULL UNIQUE,
            folder_name TEXT NOT NULL
        );
        ",
    )?;

    Ok(())
}

fn migrate_v3(conn: &Connection) -> Result<()> {
    // Track the parent GDrive folder a media item was discovered under so
    // that removing a folder from the scan list can delete exactly the
    // tracks it sourced — no API round-trip, no cross-referencing.
    let exists: bool = conn
        .prepare(
            "SELECT COUNT(*) FROM pragma_table_info('media_items') WHERE name = 'gdrive_parent_folder_id'",
        )?
        .query_row([], |row| row.get::<_, i32>(0))
        .map(|count| count > 0)?;
    if !exists {
        conn.execute_batch(
            "ALTER TABLE media_items ADD COLUMN gdrive_parent_folder_id TEXT;",
        )?;
    }

    // Helpful index for the folder-scoped delete.
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_media_items_gdrive_folder \
         ON media_items(gdrive_parent_folder_id);",
    )?;

    Ok(())
}

fn migrate_v5(conn: &Connection) -> Result<()> {
    // DJ-oriented metadata columns. Most of these come from ID3v2 frames
    // that normal tag readers ignore but that Mixed In Key / Rekordbox /
    // Serato / iTunes DJ tools all write:
    //
    //   - bpm          → TBPM (float; DJ tools often store 124.00)
    //   - initial_key  → TKEY (Camelot or Open Key notation — "8A", "Cm")
    //   - energy       → TXXX:EnergyLevel (1..10 integer)
    //   - comment      → COMM frame (free-form; DJ tools stuff cue info here)
    //
    // Columns are nullable so existing rows stay valid; they get populated
    // the next time each track's tags are read (local scan, gdrive metadata
    // sync, or an explicit write-back from the metadata editor).
    let new_columns = [
        ("bpm", "REAL"),
        ("initial_key", "TEXT"),
        ("energy", "INTEGER"),
        ("comment", "TEXT"),
    ];
    for (col, col_type) in &new_columns {
        let exists: bool = conn
            .prepare(&format!(
                "SELECT COUNT(*) FROM pragma_table_info('media_items') WHERE name = '{}'",
                col
            ))?
            .query_row([], |row| row.get::<_, i32>(0))
            .map(|count| count > 0)?;
        if !exists {
            conn.execute_batch(&format!(
                "ALTER TABLE media_items ADD COLUMN {} {};",
                col, col_type
            ))?;
        }
    }
    Ok(())
}

fn migrate_v4(conn: &Connection) -> Result<()> {
    // Play history (one row per play event), favorites (set of liked ids),
    // and a per-item `play_count` counter. These back the new Home screen's
    // Recently Played / Most Played / Back in Rotation / Late Night / Favorites
    // sections and also let the transport bar's heart button toggle favorite
    // state. History rows cascade with media_items so removing a track also
    // cleans up its listen history and favorite flag.
    let play_count_exists: bool = conn
        .prepare(
            "SELECT COUNT(*) FROM pragma_table_info('media_items') WHERE name = 'play_count'",
        )?
        .query_row([], |row| row.get::<_, i32>(0))
        .map(|count| count > 0)?;
    if !play_count_exists {
        conn.execute_batch(
            "ALTER TABLE media_items ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0;",
        )?;
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS play_history (
            id TEXT PRIMARY KEY,
            media_id TEXT NOT NULL,
            played_at INTEGER NOT NULL,
            FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_play_history_played_at
            ON play_history(played_at DESC);
        CREATE INDEX IF NOT EXISTS idx_play_history_media_id
            ON play_history(media_id);

        CREATE TABLE IF NOT EXISTS favorites (
            media_id TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
        );
        ",
    )?;

    Ok(())
}
