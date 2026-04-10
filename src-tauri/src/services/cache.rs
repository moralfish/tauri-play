use anyhow::Result;
use rusqlite::Connection;
use std::path::PathBuf;

pub struct CacheManager;

impl CacheManager {
    pub fn new(app_data_dir: &std::path::Path) -> Self {
        // Ensure the cache directory exists for any future cache writers.
        let cache_dir = app_data_dir.join("media_cache");
        std::fs::create_dir_all(&cache_dir).ok();
        Self
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
        let mut stmt = conn.prepare("SELECT cache_path FROM file_cache")?;
        let paths: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for path in paths {
            std::fs::remove_file(&path).ok();
        }
        conn.execute_batch("DELETE FROM file_cache")?;
        Ok(())
    }
}
