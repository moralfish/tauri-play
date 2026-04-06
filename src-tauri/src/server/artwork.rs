use crate::db::queries;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, Response, StatusCode};

pub async fn artwork_handler(
    State(state): State<AppState>,
    Path(hash): Path<String>,
) -> Response<Body> {
    match serve_artwork(&state, &hash) {
        Ok(response) => response,
        Err(_) => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("Artwork not found"))
            .unwrap(),
    }
}

fn serve_artwork(state: &AppState, hash: &str) -> anyhow::Result<Response<Body>> {
    let conn = state.db.lock().map_err(|e| anyhow::anyhow!("{}", e))?;
    let (data, mime_type) = queries::get_artwork(&conn, hash)?
        .ok_or_else(|| anyhow::anyhow!("Artwork not found"))?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime_type)
        .header(header::CONTENT_LENGTH, data.len().to_string())
        .header(
            header::CACHE_CONTROL,
            "public, max-age=31536000, immutable",
        )
        .body(Body::from(data))
        .unwrap())
}
