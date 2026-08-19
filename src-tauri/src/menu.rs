use serde::Serialize;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Debug, Clone, Serialize)]
pub struct MenuActionPayload {
    pub id: String,
}

/// The native menu owns the application-level accelerators (open, save,
/// close tab...). Keeping them here rather than in the webview means one
/// place decides what Ctrl+S does, and the OS shows the shortcut to the user.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let open = MenuItemBuilder::with_id("open", "Open File…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let open_folder = MenuItemBuilder::with_id("openFolder", "Open Folder…")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;
    let save = MenuItemBuilder::with_id("save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as = MenuItemBuilder::with_id("saveAs", "Save As…")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let close_tab = MenuItemBuilder::with_id("closeTab", "Close Tab")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;

    let file = SubmenuBuilder::new(app, "File")
        .item(&open)
        .item(&open_folder)
        .separator()
        .item(&save)
        .item(&save_as)
        .separator()
        .item(&close_tab)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let find = MenuItemBuilder::with_id("find", "Find…")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&find)
        .build()?;

    let toggle_sidebar = MenuItemBuilder::with_id("toggleSidebar", "Toggle Sidebar")
        .accelerator("CmdOrCtrl+\\")
        .build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let view = SubmenuBuilder::new(app, "View")
        .item(&toggle_sidebar)
        .separator()
        .item(&settings)
        .build()?;

    let about = MenuItemBuilder::with_id("about", "About MDViewer").build(app)?;
    let help = SubmenuBuilder::new(app, "Help").item(&about).build()?;

    MenuBuilder::new(app)
        .items(&[&file, &edit, &view, &help])
        .build()
}

/// Forward menu clicks to the frontend, which owns the actual behaviour.
pub fn on_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let _ = app.emit(
        "menu:action",
        MenuActionPayload {
            id: id.to_string(),
        },
    );
}
