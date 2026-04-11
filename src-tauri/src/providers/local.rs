use crate::models::{MediaItem, MediaKind, Playlist};
use crate::providers::traits::{MediaProvider, ScanItemFn, ScanProgressFn};
use crate::services::metadata;
use anyhow::Result;
use sha2::{Sha256, Digest};
use std::path::PathBuf;
use walkdir::WalkDir;

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "flac", "ogg", "aac", "m4a", "wma"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "webm", "mov", "wmv"];
const PLAYLIST_EXTENSIONS: &[&str] = &["m3u", "m3u8"];

pub struct LocalProvider {
    pub directories: Vec<PathBuf>,
}

impl LocalProvider {
    pub fn new(directories: Vec<PathBuf>) -> Self {
        Self { directories }
    }

    fn classify_extension(ext: &str) -> Option<MediaKind> {
        let ext_lower = ext.to_lowercase();
        if AUDIO_EXTENSIONS.contains(&ext_lower.as_str()) {
            Some(MediaKind::Audio)
        } else if VIDEO_EXTENSIONS.contains(&ext_lower.as_str()) {
            Some(MediaKind::Video)
        } else {
            None
        }
    }

    fn is_playlist_file(ext: &str) -> bool {
        PLAYLIST_EXTENSIONS.contains(&ext.to_lowercase().as_str())
    }

    fn parse_m3u(path: &std::path::Path) -> Vec<PathBuf> {
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };
        let base_dir = path.parent().unwrap_or(std::path::Path::new("."));
        content
            .lines()
            .filter(|line| !line.trim().is_empty() && !line.starts_with('#'))
            .map(|line| {
                let p = PathBuf::from(line.trim());
                if p.is_absolute() {
                    p
                } else {
                    base_dir.join(p)
                }
            })
            .filter(|p| p.exists())
            .collect()
    }

    fn build_media_item(path: &std::path::Path, ext: &str, kind: MediaKind) -> MediaItem {
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        let mime = mime_guess::from_ext(ext)
            .first_or_octet_stream()
            .to_string();
        let abs_path = path.to_string_lossy().to_string();

        let mut item = MediaItem::new(
            uuid::Uuid::new_v4().to_string(),
            "local".to_string(),
            "local".to_string(),
            abs_path,
            name,
            mime,
            kind,
        );

        // Read file metadata
        if let Ok(fs_meta) = std::fs::metadata(path) {
            item.file_size = Some(fs_meta.len() as i64);
            if let Ok(modified) = fs_meta.modified() {
                if let Ok(dur) = modified.duration_since(std::time::UNIX_EPOCH) {
                    item.last_modified = Some(dur.as_secs() as i64);
                }
            }
        }

        // Read tag metadata (audio files primarily)
        if let Ok(meta) = metadata::read_metadata(path) {
            item.title = meta.title;
            item.artist = meta.artist;
            item.album = meta.album;
            item.album_artist = meta.album_artist;
            item.track_number = meta.track_number;
            item.duration_secs = meta.duration_secs;
            item.year = meta.year;
            item.genre = meta.genre;
            item.bpm = meta.bpm;
            item.initial_key = meta.initial_key;
            item.energy = meta.energy;
            item.comment = meta.comment;
            if let Some(ref art) = meta.artwork {
                item.artwork_hash = Some(art.hash.clone());
            }
        }

        item
    }
}

/// After scanning, call this to store artwork blobs in the DB.
/// Returns a list of (hash, data, mime_type) for new artwork.
pub fn extract_artwork_from_items(
    directories: &[PathBuf],
) -> Vec<(String, Vec<u8>, String)> {
    let mut artwork = Vec::new();
    let mut seen_hashes = std::collections::HashSet::new();

    for dir in directories {
        if !dir.exists() {
            continue;
        }
        for entry in WalkDir::new(dir).follow_links(true).into_iter().flatten() {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let ext = match path.extension().and_then(|e| e.to_str()) {
                Some(e) => e,
                None => continue,
            };
            if LocalProvider::classify_extension(ext).is_none() {
                continue;
            }
            if let Ok(meta) = metadata::read_metadata(path) {
                if let Some(art) = meta.artwork {
                    if seen_hashes.insert(art.hash.clone()) {
                        artwork.push((art.hash, art.data, art.mime_type));
                    }
                }
            }
        }
    }
    artwork
}

impl MediaProvider for LocalProvider {
    fn id(&self) -> &str {
        "local"
    }

    fn scan_streaming(
        &self,
        on_item: ScanItemFn<'_>,
        on_progress: ScanProgressFn<'_>,
    ) -> Result<()> {
        let mut count = 0usize;
        for dir in &self.directories {
            if !dir.exists() {
                continue;
            }
            on_progress(&format!("Scanning {}", dir.display()), None);
            for entry in WalkDir::new(dir).follow_links(true).into_iter().flatten() {
                if !entry.file_type().is_file() {
                    continue;
                }
                let path = entry.path();
                let ext = match path.extension().and_then(|e| e.to_str()) {
                    Some(e) => e,
                    None => continue,
                };
                let kind = match Self::classify_extension(ext) {
                    Some(k) => k,
                    None => continue,
                };
                let item = Self::build_media_item(path, ext, kind);
                let display_name = item.name.clone();
                count += 1;
                on_progress(&format!("Discovered {} files", count), Some(&display_name));
                on_item(item);
            }
        }
        Ok(())
    }

    fn detect_playlists(&self) -> Result<Vec<(Playlist, Vec<MediaItem>)>> {
        let mut playlists = Vec::new();

        for dir in &self.directories {
            if !dir.exists() {
                continue;
            }
            for entry in WalkDir::new(dir).follow_links(true).into_iter().flatten() {
                if !entry.file_type().is_file() {
                    continue;
                }
                let path = entry.path();
                let ext = match path.extension().and_then(|e| e.to_str()) {
                    Some(e) => e,
                    None => continue,
                };
                if !Self::is_playlist_file(ext) {
                    continue;
                }

                let playlist_name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("playlist")
                    .to_string();

                let file_paths = Self::parse_m3u(path);
                let mut media_items = Vec::new();

                for file_path in file_paths {
                    let file_ext = match file_path.extension().and_then(|e| e.to_str()) {
                        Some(e) => e,
                        None => continue,
                    };
                    let kind = match Self::classify_extension(file_ext) {
                        Some(k) => k,
                        None => continue,
                    };
                    media_items.push(Self::build_media_item(&file_path, file_ext, kind));
                }

                // Use deterministic ID based on file path to avoid duplicates on re-scan
                let mut hasher = Sha256::new();
                hasher.update(path.to_string_lossy().as_bytes());
                let hash = format!("src-{:x}", hasher.finalize());

                let playlist = Playlist {
                    id: hash,
                    name: playlist_name,
                    is_source: true,
                };

                playlists.push((playlist, media_items));
            }
        }

        Ok(playlists)
    }
}
