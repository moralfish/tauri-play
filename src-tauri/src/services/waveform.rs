use anyhow::Result;
use rusqlite::Connection;
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

const NUM_PEAKS: usize = 800;

pub fn generate_peaks(file_path: &Path) -> Result<Vec<f32>> {
    let file = std::fs::File::open(file_path)?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe().format(
        &hint,
        mss,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    )?;

    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| anyhow::anyhow!("No audio track found"))?;
    let track_id = track.id;

    let mut decoder =
        symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default())?;

    // First pass: collect all samples to compute total count
    let mut all_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        if let Ok(decoded) = decoder.decode(&packet) {
            let spec = *decoded.spec();
            let num_frames = decoded.capacity();
            let mut sample_buf = SampleBuffer::<f32>::new(num_frames as u64, spec);
            sample_buf.copy_interleaved_ref(decoded);
            let samples = sample_buf.samples();

            // Mix to mono by averaging channels
            let channels = spec.channels.count();
            if channels > 0 {
                for chunk in samples.chunks(channels) {
                    let mono: f32 = chunk.iter().sum::<f32>() / channels as f32;
                    all_samples.push(mono);
                }
            }
        }
    }

    if all_samples.is_empty() {
        return Ok(vec![0.0; NUM_PEAKS]);
    }

    // Compute peaks
    let chunk_size = (all_samples.len() / NUM_PEAKS).max(1);
    let mut peaks = Vec::with_capacity(NUM_PEAKS);

    for chunk in all_samples.chunks(chunk_size) {
        let max_val = chunk.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        peaks.push(max_val);
    }

    // Pad or truncate to exactly NUM_PEAKS
    peaks.resize(NUM_PEAKS, 0.0);

    // Normalize to 0.0-1.0
    let global_max = peaks.iter().copied().fold(0.0f32, f32::max);
    if global_max > 0.0 {
        for p in &mut peaks {
            *p /= global_max;
        }
    }

    Ok(peaks)
}

pub fn get_or_generate_peaks(
    conn: &Connection,
    media_id: &str,
    file_path: &Path,
) -> Result<Vec<f32>> {
    // Check cache first
    if let Ok(cached) = conn.query_row(
        "SELECT peaks FROM waveform_cache WHERE media_id = ?1",
        rusqlite::params![media_id],
        |row| row.get::<_, String>(0),
    ) {
        let peaks: Vec<f32> = serde_json::from_str(&cached)?;
        return Ok(peaks);
    }

    // Generate
    let peaks = generate_peaks(file_path)?;

    // Cache
    let peaks_json = serde_json::to_string(&peaks)?;
    conn.execute(
        "INSERT OR REPLACE INTO waveform_cache (media_id, peaks) VALUES (?1, ?2)",
        rusqlite::params![media_id, peaks_json],
    )?;

    Ok(peaks)
}
