use anyhow::Result;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use lofty::prelude::*;
use lofty::probe::Probe;
use sha2::{Digest, Sha256};
use std::path::Path;

/// Mixed In Key 10+ writes a base64-encoded JSON envelope into the TKEY
/// frame instead of the plain musical key string, so a file tagged by MIK
/// ends up with `initial_key` looking like
///
/// ```text
/// eyJhbGdvcml0aG0iOjk0LCJrZXkiOiIxMEEiLCJzb3VyY2UiOiJtaXhlZGlua2V5In0=
/// ```
///
/// which decodes to `{"algorithm":94,"key":"10A","source":"mixedinkey"}`.
/// This helper detects that envelope and unwraps it down to the `key` field
/// (`"10A"`). Any non-envelope value (`"10A"`, `"Am"`, `"F#min"`, …) is
/// returned verbatim so it stays compatible with other DJ tools that write
/// the standard plain-string form.
pub fn unwrap_mik_key(raw: &str) -> String {
    let s = raw.trim();
    // Quick-reject for anything that can't be our envelope. Base64 of `{"`
    // is `eyJ`, so MIK blobs always start with that prefix.
    if !s.starts_with("eyJ") || s.len() < 16 {
        return s.to_string();
    }
    let decoded = match B64.decode(s.as_bytes()) {
        Ok(bytes) => bytes,
        Err(_) => return s.to_string(),
    };
    let json: serde_json::Value = match serde_json::from_slice(&decoded) {
        Ok(v) => v,
        Err(_) => return s.to_string(),
    };
    json.get("key")
        .and_then(|v| v.as_str())
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty())
        .unwrap_or_else(|| s.to_string())
}

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
    // DJ-oriented fields (all optional — only populated for files whose
    // tags carry these frames at all).
    pub bpm: Option<f32>,
    pub initial_key: Option<String>,
    pub energy: Option<u32>,
    pub comment: Option<String>,
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

    #[allow(clippy::type_complexity)]
    let (
        title,
        artist,
        album,
        album_artist,
        track_number,
        year,
        genre,
        artwork,
        bpm,
        initial_key,
        energy,
        comment,
    ) = if let Some(tag) = tag {
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

        // BPM: try the integer frame first (ID3v2 TBPM, MP4 tmpo), fall back
        // to the decimal BPM atom that Apple / Vorbis use. Strip trailing
        // zeros and parse — some tools write "124" and others "124.00".
        let bpm = tag
            .get_string(&ItemKey::IntegerBpm)
            .or_else(|| tag.get_string(&ItemKey::Bpm))
            .and_then(|s| s.trim().parse::<f32>().ok())
            .filter(|v| *v > 0.0 && *v < 400.0);

        // Normalize MIK's base64-JSON envelope down to the plain key
        // string; other tagging tools (Rekordbox, Serato, Traktor) write
        // the plain form directly, which `unwrap_mik_key` passes through
        // unchanged.
        let initial_key = tag
            .get_string(&ItemKey::InitialKey)
            .map(unwrap_mik_key)
            .filter(|s| !s.is_empty());

        // Energy is a user-defined TXXX frame in ID3v2. Mixed In Key writes
        // it as "EnergyLevel"; some older tools as "ENERGY". TXXX frames
        // get mapped to ItemKey::Unknown(description), so we look both up.
        let energy = tag
            .get_string(&ItemKey::Unknown("EnergyLevel".to_string()))
            .or_else(|| tag.get_string(&ItemKey::Unknown("ENERGY".to_string())))
            .or_else(|| tag.get_string(&ItemKey::Unknown("Energy".to_string())))
            .and_then(|s| s.trim().parse::<u32>().ok())
            .filter(|v| *v > 0 && *v <= 10);

        let comment = tag
            .get_string(&ItemKey::Comment)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        (
            tag.title().map(|s| s.to_string()),
            tag.artist().map(|s| s.to_string()),
            tag.album().map(|s| s.to_string()),
            tag.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string()),
            tag.track().map(|t| t as u32),
            tag.year().map(|y| y as u32),
            tag.genre().map(|s| s.to_string()),
            artwork,
            bpm,
            initial_key,
            energy,
            comment,
        )
    } else {
        (
            None, None, None, None, None, None, None, None, None, None, None, None,
        )
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
        bpm,
        initial_key,
        energy,
        comment,
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
