use crate::error::AppResult;
use crate::menu::{self, Labels};
use tauri::AppHandle;

/// Rebuild the native menu with labels from the frontend.
///
/// The application's translations live in one place (`stores/i18n.ts`), and
/// the menu asks for them instead of keeping a second copy in Rust. Called
/// once the settings are loaded and again whenever the language changes, so
/// the menu is in the same language as everything else in the window.
#[tauri::command]
pub async fn set_menu_labels(app: AppHandle, labels: Labels) -> AppResult<()> {
    let menu = menu::build_with(&app, &labels)
        .map_err(|e| crate::error::AppError::io(format!("menu rebuild failed: {e}")))?;
    app.set_menu(menu)
        .map_err(|e| crate::error::AppError::io(format!("menu install failed: {e}")))?;
    Ok(())
}
