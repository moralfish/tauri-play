//! Home screen & favorites commands.
//!
//! Every command here is a thin wrapper around a single `queries.rs`
//! function — the real work happens in SQL. The frontend's `homeStore`
//! fans all of these out in `Promise.all` when it refreshes, so they need
//! to each take a DB lock briefly and drop it.

use crate::db::queries;
use crate::models::MediaItem;
use crate::state::AppState;
use tauri::{AppHandle, Emitter, State};

/// Limit coming from the frontend as an optional parameter. When omitted we
/// default to 24 so the Home scrollers have enough headroom for two-row
/// virtual scrolling without a second round-trip.
fn clamp_limit(limit: Option<usize>) -> usize {
    let n = limit.unwrap_or(24);
    n.clamp(1, 200)
}

#[tauri::command]
pub fn get_recently_played(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<MediaItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_recently_played(&conn, clamp_limit(limit)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_most_played(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<MediaItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_most_played(&conn, clamp_limit(limit)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_recently_added(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<MediaItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_recently_added(&conn, clamp_limit(limit)).map_err(|e| e.to_string())
}

/// "Back in rotation" = played at least once, but not within the last
/// `min_age_secs` seconds. Default cutoff is 30 days so the user sees
/// tracks they'd forgotten about.
#[tauri::command]
pub fn get_back_in_rotation(
    state: State<'_, AppState>,
    limit: Option<usize>,
    min_age_secs: Option<i64>,
) -> Result<Vec<MediaItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let cutoff = min_age_secs.unwrap_or(30 * 24 * 60 * 60); // 30 days
    queries::get_back_in_rotation(&conn, clamp_limit(limit), cutoff)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_late_night_tracks(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<MediaItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_late_night_tracks(&conn, clamp_limit(limit)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_high_energy_tracks(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<MediaItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_high_energy_tracks(&conn, clamp_limit(limit)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_favorites(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<MediaItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_favorites(&conn, clamp_limit(limit)).map_err(|e| e.to_string())
}

/// Returns `true` if the track is now favorited, `false` if it was just
/// un-favorited. The frontend uses the return value to update its in-memory
/// `favorites: Set<string>` cache without a second round trip.
#[tauri::command]
pub fn toggle_favorite(
    app: AppHandle,
    state: State<'_, AppState>,
    media_id: String,
) -> Result<bool, String> {
    let now_favorite = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        queries::toggle_favorite(&conn, &media_id).map_err(|e| e.to_string())?
    };
    // Let any mounted view (Home, Player heart) know to refresh.
    let _ = app.emit("favorites-updated", &media_id);
    Ok(now_favorite)
}

/// All favorited media ids at once. Used by `playbackStore` to warm a
/// client-side `Set<string>` at startup so the transport bar's heart can
/// render without per-track lookups.
#[tauri::command]
pub fn get_favorite_ids(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_favorite_ids(&conn).map_err(|e| e.to_string())
}
