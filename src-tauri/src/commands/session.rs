use crate::error::AppResult;
use crate::fsops::atomic::{read_json, write_json};
use crate::paths;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTab {
    pub path: String,
    #[serde(default)]
    pub cursor: usize,
    #[serde(default)]
    pub scroll_top: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarState {
    pub visible: bool,
    pub panel: String,
    pub width: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub tabs: Vec<SessionTab>,
    pub active_index: i32,
    pub sidebar: SidebarState,
    pub tree_root: Option<String>,
}

#[tauri::command]
pub async fn session_load(app: AppHandle) -> AppResult<Option<SessionState>> {
    let dir = paths::config_dir(&app)?;
    Ok(read_json(&dir.join("session.json")))
}

#[tauri::command]
pub async fn session_save(app: AppHandle, state: SessionState) -> AppResult<()> {
    let dir = paths::config_dir(&app)?;
    write_json(&dir.join("session.json"), &state)
}
