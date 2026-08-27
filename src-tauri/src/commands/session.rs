use crate::error::AppResult;
use crate::fsops::atomic::{read_json, write_json};
use crate::paths;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

/// A session is saved by round-tripping these structs, so a field that is not
/// declared here does not merely go unread — it is dropped from the file on
/// every save. That is how the reading position was lost: the frontend sent
/// `scrollPos`, serde discarded it, and every document reopened at line one.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTab {
    pub path: String,
    #[serde(default)]
    pub cursor: usize,
    /// Written by versions that stored a raw pixel offset. Kept so their
    /// sessions still load, and not written back out.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scroll_top: Option<f64>,
    /// The place in the text the reader was at, and how far above it the view
    /// sat — an anchor in the document rather than a pixel count, so it
    /// survives a different window size or font.
    #[serde(default)]
    pub scroll_pos: usize,
    #[serde(default)]
    pub scroll_offset: f64,
    /// Which half of a split window the document was in.
    #[serde(default)]
    pub pane: u8,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarState {
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default = "default_panel")]
    pub panel: String,
    #[serde(default = "default_width")]
    pub width: f64,
    #[serde(default = "default_true")]
    pub outline_visible: bool,
    #[serde(default = "default_outline_width")]
    pub outline_width: f64,
}

fn default_true() -> bool {
    true
}
fn default_panel() -> String {
    "files".into()
}
fn default_width() -> f64 {
    260.0
}
fn default_outline_width() -> f64 {
    240.0
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub tabs: Vec<SessionTab>,
    pub active_index: i32,
    /// Whether the window was showing two panes, and where the divider sat.
    #[serde(default)]
    pub split: bool,
    #[serde(default = "default_split_ratio")]
    pub split_ratio: f64,
    /// Which half, if either, was showing the rendered page instead of text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_pane: Option<u8>,
    pub sidebar: SidebarState,
    pub tree_root: Option<String>,
}

fn default_split_ratio() -> f64 {
    0.5
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
