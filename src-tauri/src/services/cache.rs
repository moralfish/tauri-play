use anyhow::Result;
use rusqlite::Connection;
use std::path::PathBuf;

pub struct CacheManager {
    pub cache_dir: PathBuf,
    pub max_bytes: u64,
}

impl CacheManager {
    pub fn new(app_data_dir: &std::path::Path, max_bytes: u64) -> Self {
        let cache_dir = app_data_dir.join("media_cache");
        std::fs::create_dir_all(&cache_dir).ok();
        Self {
            cache_dir,
            max_bytes,
        }
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

    pub fn cache_file(
        &self,
        conn: &Connection,
        media_id: &str,
        ext: &str,
        data: &[u8],
    ) -> Result<PathBuf> {
        let filename = format!("{}.{}", media_id, ext);
        let cache_path = self.cache_dir.join(&filename);
        std::fs::write(&cache_path, data)?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() as i64;

        conn.execute(
            "INSERT OR REPLACE INTO file_cache (media_id, cache_path, file_size, cached_at, last_accessed)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                media_id,
                cache_path.to_string_lossy().to_string(),
                data.len() as i64,
                now,
                now
            ],
        )?;

        // Evict if over limit
        self.evict_if_needed(conn)?;

        Ok(cache_path)
    }

    pub fn touch(&self, conn: &Connection, media_id: &str) -> Result<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() as i64;
        conn.execute(
            "UPDATE file_cache SET last_accessed = ?1 WHERE media_id = ?2",
            rusqlite::params![now, media_id],
        )?;
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

    fn evict_if_needed(&self, conn: &Connection) -> Result<()> {
        let total = self.total_size(conn)?;
        if total <= self.max_bytes {
            return Ok(());
        }
        let to_free = total - self.max_bytes;
        self.evict_lru(conn, to_free)?;
        Ok(())
    }

    fn evict_lru(&self, conn: &Connection, bytes_to_free: u64) -> Result<()> {
        let mut stmt = conn.prepare(
            "SELECT media_id, cache_path, file_size FROM file_cache ORDER BY last_accessed ASC",
        )?;
        let entries: Vec<(String, String, i64)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let mut freed: u64 = 0;
        for (media_id, cache_path, file_size) in entries {
            if freed >= bytes_to_free {
                break;
            }
            std::fs::remove_file(&cache_path).ok();
            conn.execute(
                "DELETE FROM file_cache WHERE media_id = ?1",
                rusqlite::params![media_id],
            )?;
            freed += file_size as u64;
        }
        Ok(())
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
