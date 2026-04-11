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
