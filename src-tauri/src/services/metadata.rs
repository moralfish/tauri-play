use anyhow::Result;
use lofty::prelude::*;
use lofty::probe::Probe;
use sha2::{Digest, Sha256};
use std::path::Path;

pub struct Metadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub duration_secs: Option<f64>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub artwork: Option<ArtworkData>,
}

pub struct ArtworkData {
    pub data: Vec<u8>,
    pub mime_type: String,
    pub hash: String,
}

pub fn read_metadata(path: &Path) -> Result<Metadata> {
    let tagged_file = Probe::open(path)?.read()?;

    let properties = tagged_file.properties();
    let duration_secs = if properties.duration().as_secs_f64() > 0.0 {
        Some(properties.duration().as_secs_f64())
    } else {
        None
    };

    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

    let (title, artist, album, album_artist, track_number, year, genre, artwork) =
        if let Some(tag) = tag {
            let artwork = tag.pictures().first().map(|pic| {
                let mime = match pic.mime_type() {
                    Some(lofty::picture::MimeType::Png) => "image/png",
                    Some(lofty::picture::MimeType::Jpeg) => "image/jpeg",
                    Some(lofty::picture::MimeType::Bmp) => "image/bmp",
                    Some(lofty::picture::MimeType::Gif) => "image/gif",
                    Some(lofty::picture::MimeType::Tiff) => "image/tiff",
                    _ => "image/jpeg",
                };
                let data = pic.data().to_vec();
                let hash = format!("{:x}", Sha256::digest(&data));
                ArtworkData {
                    data,
                    mime_type: mime.to_string(),
                    hash,
                }
            });

            (
                tag.title().map(|s| s.to_string()),
                tag.artist().map(|s| s.to_string()),
                tag.album().map(|s| s.to_string()),
                tag.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string()),
                tag.track().map(|t| t as u32),
                tag.year().map(|y| y as u32),
                tag.genre().map(|s| s.to_string()),
                artwork,
            )
        } else {
            (None, None, None, None, None, None, None, None)
        };

    Ok(Metadata {
        title,
        artist,
        album,
        album_artist,
        track_number,
        duration_secs,
        year,
        genre,
        artwork,
    })
}

pub fn write_metadata(path: &Path, meta: &WriteMetadata) -> Result<()> {
    let mut tagged_file = Probe::open(path)?.read()?;

    // Try primary tag first, fall back to first tag
    let has_primary = tagged_file.primary_tag().is_some();
    let tag = if has_primary {
        tagged_file.primary_tag_mut()
    } else {
        tagged_file.first_tag_mut()
    };

    if let Some(tag) = tag {
        if let Some(ref title) = meta.title {
            tag.set_title(title.clone());
        }
        if let Some(ref artist) = meta.artist {
            tag.set_artist(artist.clone());
        }
        if let Some(ref album) = meta.album {
            tag.set_album(album.clone());
        }
        if let Some(ref album_artist) = meta.album_artist {
            tag.insert(lofty::tag::TagItem::new(
                ItemKey::AlbumArtist,
                lofty::tag::ItemValue::Text(album_artist.clone()),
            ));
        }
        if let Some(track) = meta.track_number {
            tag.set_track(track);
        }
        if let Some(year) = meta.year {
            tag.set_year(year);
        }
        if let Some(ref genre) = meta.genre {
            tag.set_genre(genre.clone());
        }

        tag.save_to_path(path, lofty::config::WriteOptions::default())?;
    }

    Ok(())
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct WriteMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
}
