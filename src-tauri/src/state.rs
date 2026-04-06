use crate::providers::traits::MediaProvider;
use crate::services::cache::CacheManager;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub providers: Arc<Mutex<Vec<Box<dyn MediaProvider>>>>,
    pub app_data_dir: PathBuf,
    pub app_handle: Option<tauri::AppHandle>,
    pub cache_manager: Arc<CacheManager>,
}
