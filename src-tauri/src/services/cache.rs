use anyhow::Result;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// Default upper bound for the cloud media cache. LRU eviction kicks in
/// once `total_size` exceeds this. Roughly 10 GB.
pub const DEFAULT_MAX_BYTES: u64 = 10 * 1024 * 1024 * 1024;

/// sync_state key used to persist the user-configured cap.
const MAX_BYTES_KEY: &str = "cache_max_bytes";

pub struct CacheManager {
    cache_dir: PathBuf,
    /// Atomic so Settings can mutate the cap at runtime without needing a
    /// writer lock on the whole manager.
    max_bytes: AtomicU64,
}

impl CacheManager {
    pub fn new(app_data_dir: &Path) -> Self {
        let cache_dir = app_data_dir.join("media_cache");
        std::fs::create_dir_all(&cache_dir).ok();
        Self {
            cache_dir,
            max_bytes: AtomicU64::new(DEFAULT_MAX_BYTES),
        }
    }

    /// Load the persisted cap (if any) from the sync_state table and apply
    /// it to this manager. Safe to call at startup before any cache work.
    pub fn load_config(&self, conn: &Connection) {
        if let Ok(Some(raw)) = crate::db::queries::get_sync_state(conn, MAX_BYTES_KEY) {
            if let Ok(value) = raw.parse::<u64>() {
                if value > 0 {
                    self.max_bytes.store(value, Ordering::Relaxed);
                }
            }
        }
    }

    pub fn get_max_bytes(&self) -> u64 {
        self.max_bytes.load(Ordering::Relaxed)
    }

    /// Persist a new cap and immediately enforce it. A value of 0 resets to
    /// the default.
    pub fn set_max_bytes(&self, conn: &Connection, value: u64) -> Result<()> {
        let effective = if value == 0 { DEFAULT_MAX_BYTES } else { value };
        self.max_bytes.store(effective, Ordering::Relaxed);
        crate::db::queries::set_sync_state(conn, MAX_BYTES_KEY, &effective.to_string())?;
        self.evict_if_needed(conn)?;
        Ok(())
    }

    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }

    pub fn get_cached_path(&self, conn: &Connection, media_id: &str) -> Option<PathBuf> {
        let path: Option<String> = conn
            .query_row(
                "SELECT cache_path FROM file_cache WHERE media_id = ?1",
                rusqlite::params![media_id],
                |row| row.get(0),
            )
            .ok();
        path.map(PathBuf::from).filter(|p| p.exists())
    }

    /// Return whether the given media is already cached on disk.
    pub fn is_cached(&self, conn: &Connection, media_id: &str) -> bool {
        self.get_cached_path(conn, media_id).is_some()
    }

    /// Build the on-disk path used for a given media id. Caller is
    /// responsible for writing the file there before calling `register`.
    pub fn path_for(&self, media_id: &str, ext_hint: Option<&str>) -> PathBuf {
        let safe_id: String = media_id
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect();
        match ext_hint {
            Some(ext) if !ext.is_empty() => self.cache_dir.join(format!("{}.{}", safe_id, ext)),
            _ => self.cache_dir.join(safe_id),
        }
    }

    /// Insert a `file_cache` row pointing at an existing on-disk file. The
    /// file size is recorded so eviction can keep the cache under the cap.
    pub fn register(&self, conn: &Connection, media_id: &str, path: &Path) -> Result<()> {
        let metadata = std::fs::metadata(path)?;
        let size = metadata.len() as i64;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        conn.execute(
            "INSERT INTO file_cache (media_id, cache_path, file_size, cached_at, last_accessed)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(media_id) DO UPDATE SET
                cache_path = excluded.cache_path,
                file_size = excluded.file_size,
                last_accessed = excluded.last_accessed",
            rusqlite::params![media_id, path.to_string_lossy(), size, now],
        )?;
        Ok(())
    }

    /// Bump the LRU timestamp on a cached file. Called whenever the file is
    /// served, so the cache prefers to evict tracks the user hasn't touched
    /// in a while.
    pub fn touch(&self, conn: &Connection, media_id: &str) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        conn.execute(
            "UPDATE file_cache SET last_accessed = ?1 WHERE media_id = ?2",
            rusqlite::params![now, media_id],
        )?;
        Ok(())
    }

    /// Drop least-recently-used entries until total size fits under the cap.
    /// Always leaves at least one entry behind so the just-cached file isn't
    /// immediately evicted.
    pub fn evict_if_needed(&self, conn: &Connection) -> Result<()> {
        let cap = self.max_bytes.load(Ordering::Relaxed);
        let mut total = self.total_size(conn)?;
        if total <= cap {
            return Ok(());
        }

        // Oldest accessed first
        let mut stmt = conn.prepare(
            "SELECT media_id, cache_path, file_size FROM file_cache ORDER BY last_accessed ASC",
        )?;
        let rows: Vec<(String, String, i64)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        drop(stmt);

        for (media_id, cache_path, file_size) in rows {
            if total <= cap {
                break;
            }
            std::fs::remove_file(&cache_path).ok();
            conn.execute(
                "DELETE FROM file_cache WHERE media_id = ?1",
                rusqlite::params![media_id],
            )?;
            // Also drop the cached waveform — it was tied to this file copy.
            conn.execute(
                "DELETE FROM waveform_cache WHERE media_id = ?1",
                rusqlite::params![media_id],
            )
            .ok();
            total = total.saturating_sub(file_size as u64);
        }
        Ok(())
    }

    pub fn total_size(&self, conn: &Connection) -> Result<u64> {
        let size: i64 = conn.query_row(
            "SELECT COALESCE(SUM(file_size), 0) FROM file_cache",
            [],
            |row| row.get(0),
        )?;
        Ok(size as u64)
    }

    pub fn item_count(&self, conn: &Connection) -> Result<u64> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM file_cache",
            [],
            |row| row.get(0),
        )?;
        Ok(count as u64)
    }

    pub fn clear_all(&self, conn: &Connection) -> Result<()> {
        // First pass: delete every file we know about via the file_cache table.
        let mut stmt = conn.prepare("SELECT cache_path FROM file_cache")?;
        let paths: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        drop(stmt);
        for path in paths {
            std::fs::remove_file(&path).ok();
        }
        conn.execute_batch("DELETE FROM file_cache")?;
        // Also drop every cached waveform — the audio they were derived
        // from is gone, so they would only bloat the sqlite file.
        conn.execute_batch("DELETE FROM waveform_cache").ok();

        // Second pass: scrub the cache directory itself. Any stray file
        // that wasn't tracked in `file_cache` (e.g. left over from an
        // aborted download, a previous app version, or a crash between
        // `fs::write` and `cache_manager.register`) still counts as
        // disk usage from the user's perspective, so they should be
        // removed when they click "Clear cache".
        if self.cache_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&self.cache_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        std::fs::remove_dir_all(&p).ok();
                    } else {
                        std::fs::remove_file(&p).ok();
                    }
                }
            }
            // Re-create in case the directory itself was somehow removed
            // alongside its contents — downstream code assumes it exists.
            std::fs::create_dir_all(&self.cache_dir).ok();
        }
        Ok(())
    }
}
