use crate::db::queries;
use crate::providers::gdrive::api as gdrive_api;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, Response, StatusCode};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

pub async fn stream_handler(
    State(state): State<AppState>,
    Path(media_id): Path<String>,
    headers: HeaderMap,
) -> Response<Body> {
    match handle_stream(&state, &media_id, &headers).await {
        Ok(response) => response,
        Err(e) => Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::from(format!("Stream error: {}", e)))
            .unwrap(),
    }
}

async fn handle_stream(
    state: &AppState,
    media_id: &str,
    headers: &HeaderMap,
) -> anyhow::Result<Response<Body>> {
    let item = {
        let conn = state.db.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
        queries::get_media_item_by_id(&conn, media_id)?
            .ok_or_else(|| anyhow::anyhow!("Media not found: {}", media_id))?
    };

    match item.source_type.as_str() {
        "local" => stream_local(&item.external_id, &item.mime_type, headers).await,
        "gdrive" => stream_gdrive(state, &item.external_id, &item.mime_type, headers).await,
        other => anyhow::bail!("Unknown source type: {}", other),
    }
}

async fn stream_local(
    file_path: &str,
    mime_type: &str,
    headers: &HeaderMap,
) -> anyhow::Result<Response<Body>> {
    let mut file = tokio::fs::File::open(file_path).await?;
    let metadata = file.metadata().await?;
    let total_size = metadata.len();

    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| parse_range(s, total_size));

    match range {
        Some((start, end)) => {
            let length = end - start + 1;
            file.seek(std::io::SeekFrom::Start(start)).await?;
            let stream = ReaderStream::new(file.take(length));

            Ok(Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_TYPE, mime_type)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_LENGTH, length.to_string())
                .header(
                    header::CONTENT_RANGE,
                    format!("bytes {}-{}/{}", start, end, total_size),
                )
                .body(Body::from_stream(stream))
                .unwrap())
        }
        None => {
            let stream = ReaderStream::new(file);
            Ok(Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime_type)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_LENGTH, total_size.to_string())
                .body(Body::from_stream(stream))
                .unwrap())
        }
    }
}

async fn stream_gdrive(
    state: &AppState,
    file_id: &str,
    mime_type: &str,
    headers: &HeaderMap,
) -> anyhow::Result<Response<Body>> {
    // Read token from app data dir
    let token_path = state.app_data_dir.join("gdrive_token.json");
    let token_data: String = if token_path.exists() {
        let data = tokio::fs::read_to_string(&token_path).await?;
        let parsed: serde_json::Value = serde_json::from_str(&data)?;
        parsed["access_token"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("No access token"))?
            .to_string()
    } else {
        anyhow::bail!("No Google Drive credentials found");
    };

    let download_url = gdrive_api::download_url(file_id);
    let client = reqwest::Client::new();
    let mut req = client.get(&download_url).bearer_auth(&token_data);

    // Forward Range header if present
    if let Some(range_val) = headers.get(header::RANGE) {
        req = req.header(header::RANGE, range_val);
    }

    let resp = req.send().await?;
    let status = if resp.status() == reqwest::StatusCode::PARTIAL_CONTENT {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };

    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime_type)
        .header(header::ACCEPT_RANGES, "bytes");

    // Forward content-range and content-length from Google's response
    if let Some(cr) = resp.headers().get(header::CONTENT_RANGE) {
        builder = builder.header(header::CONTENT_RANGE, cr);
    }
    if let Some(cl) = resp.headers().get(header::CONTENT_LENGTH) {
        builder = builder.header(header::CONTENT_LENGTH, cl);
    }

    let stream = resp.bytes_stream();
    Ok(builder.body(Body::from_stream(stream)).unwrap())
}

fn parse_range(range_header: &str, total_size: u64) -> Option<(u64, u64)> {
    let range_str = range_header.strip_prefix("bytes=")?;
    let parts: Vec<&str> = range_str.splitn(2, '-').collect();
    if parts.len() != 2 {
        return None;
    }

    let start: u64 = if parts[0].is_empty() {
        // Suffix range: -500 means last 500 bytes
        let suffix: u64 = parts[1].parse().ok()?;
        total_size.saturating_sub(suffix)
    } else {
        parts[0].parse().ok()?
    };

    let end: u64 = if parts[1].is_empty() {
        total_size - 1
    } else {
        parts[1].parse().ok()?
    };

    if start <= end && start < total_size {
        Some((start, end.min(total_size - 1)))
    } else {
        None
    }
}
