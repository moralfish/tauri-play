mod artwork;
mod streaming;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;
use tower_http::cors::CorsLayer;

pub async fn start_streaming_server(state: AppState) {
    let app = Router::new()
        .route("/stream/{media_id}", get(streaming::stream_handler))
        .route("/artwork/{hash}", get(artwork::artwork_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:9876")
        .await
        .expect("Failed to bind streaming server to port 9876");

    log::info!("Streaming server running on http://127.0.0.1:9876");

    axum::serve(listener, app)
        .await
        .expect("Streaming server error");
}
