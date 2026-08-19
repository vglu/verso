use crate::error::AppResult;
use crate::fsops::atomic::{read_json, write_json};
use crate::paths;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_lang")]
    pub ui_lang: String,
    #[serde(default = "default_autosave")]
    pub autosave_draft_ms: u64,
    #[serde(default = "default_true")]
    pub restore_session: bool,
    #[serde(default = "default_font_size")]
    pub editor_font_size: u32,
    #[serde(default = "default_max_width")]
    pub editor_max_width: u32,
    /// Window zoom factor. Typography (font size, text width) is a separate
    /// question from how large everything on screen is.
    #[serde(default = "default_zoom")]
    pub zoom: f64,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_true")]
    pub show_status_strip: bool,
    #[serde(default = "default_true")]
    pub show_toolbar: bool,
    #[serde(default = "default_editor_mode")]
    pub editor_mode: String,
    /// Path to the user's own theme file, or null for the built-in themes.
    ///
    /// Every field the frontend sends must exist here: settings are saved by
    /// round-tripping this struct, so a field that is missing is not merely
    /// unread — it is erased from the file on the next save.
    #[serde(default)]
    pub theme_file: Option<String>,
    #[serde(default)]
    pub recent_files: Vec<String>,
}

fn default_editor_mode() -> String {
    "live".into()
}

fn default_theme() -> String {
    "system".into()
}
fn default_lang() -> String {
    "system".into()
}
fn default_autosave() -> u64 {
    800
}
fn default_true() -> bool {
    true
}
fn default_font_size() -> u32 {
    16
}
fn default_max_width() -> u32 {
    760
}
fn default_zoom() -> f64 {
    1.0
}
fn default_font_family() -> String {
    "default".into()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            ui_lang: default_lang(),
            autosave_draft_ms: default_autosave(),
            restore_session: true,
            editor_font_size: default_font_size(),
            editor_max_width: default_max_width(),
            zoom: default_zoom(),
            font_family: default_font_family(),
            show_status_strip: true,
            show_toolbar: true,
            editor_mode: default_editor_mode(),
            theme_file: None,
            recent_files: Vec::new(),
        }
    }
}

/// Missing or corrupt settings fall back to defaults rather than failing —
/// a bad config file must never keep the app from starting.
#[tauri::command]
pub async fn settings_load(app: AppHandle) -> AppResult<Settings> {
    let dir = paths::config_dir(&app)?;
    Ok(read_json(&dir.join("settings.json")).unwrap_or_default())
}

#[tauri::command]
pub async fn settings_save(app: AppHandle, settings: Settings) -> AppResult<()> {
    let dir = paths::config_dir(&app)?;
    write_json(&dir.join("settings.json"), &settings)
}
