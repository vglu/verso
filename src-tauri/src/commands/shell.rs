use crate::error::{AppError, AppResult};
use crate::state::AppState;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn reveal_in_os(app: AppHandle, path: String) -> AppResult<()> {
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| AppError::io(format!("reveal {path}: {e}")))
}

/// Only web-ish schemes leave the app. Anything else is a document path and
/// must be handled inside MDViewer, not handed to the OS shell.
#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> AppResult<()> {
    let lower = url.to_lowercase();
    let allowed = lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:");
    if !allowed {
        return Err(AppError::io(format!("refusing to open external url: {url}")));
    }
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| AppError::io(format!("open {url}: {e}")))
}

/// Markdown paths passed on the command line of the *first* launch.
/// Later launches arrive through the single-instance `open-file` event.
#[tauri::command]
pub async fn get_startup_files(app: AppHandle) -> AppResult<Vec<String>> {
    let state: State<AppState> = app.state();
    Ok(state.take_startup_files())
}
