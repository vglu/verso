use serde::Serialize;
use std::collections::HashMap;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Debug, Clone, Serialize)]
pub struct MenuActionPayload {
    pub id: String,
}

/// Labels for the menu, supplied by the frontend.
///
/// The application is translated in one place — `stores/i18n.ts` — and the
/// menu asks it rather than keeping a second copy of every word here. Two
/// dictionaries drift: the one that is edited and the one that is forgotten.
/// Until the frontend has loaded its settings and said which language it is
/// in, the English labels below stand.
pub type Labels = HashMap<String, String>;

fn label<'a>(labels: &'a Labels, id: &str, fallback: &'a str) -> &'a str {
    labels.get(id).map(String::as_str).unwrap_or(fallback)
}

/// The native menu owns the application-level accelerators (open, save,
/// close tab...). Keeping them here rather than in the webview means one
/// place decides what Ctrl+S does, and the OS shows the shortcut to the user.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    build_with(app, &Labels::new())
}

pub fn build_with<R: Runtime>(app: &AppHandle<R>, l: &Labels) -> tauri::Result<Menu<R>> {
    let new_file = MenuItemBuilder::with_id("newFile", label(l, "newFile", "New File"))
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open = MenuItemBuilder::with_id("open", label(l, "open", "Open File…"))
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let open_folder =
        MenuItemBuilder::with_id("openFolder", label(l, "openFolder", "Open Folder…"))
            .accelerator("CmdOrCtrl+Shift+O")
            .build(app)?;
    let save = MenuItemBuilder::with_id("save", label(l, "save", "Save"))
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as = MenuItemBuilder::with_id("saveAs", label(l, "saveAs", "Save As…"))
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let close_tab = MenuItemBuilder::with_id("closeTab", label(l, "closeTab", "Close Tab"))
        .accelerator("CmdOrCtrl+W")
        .build(app)?;

    let file = SubmenuBuilder::new(app, label(l, "menu.file", "File"))
        .item(&new_file)
        .separator()
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

    let find = MenuItemBuilder::with_id("find", label(l, "find", "Find…"))
        .accelerator("CmdOrCtrl+F")
        .build(app)?;
    // These two live in the menu rather than in the editor's own keymap on
    // purpose: WebView2 claims Ctrl+P for printing before the page sees it,
    // and the window's accelerators are handled first.
    let go_to_heading =
        MenuItemBuilder::with_id("goToHeading", label(l, "goToHeading", "Go to Heading…"))
            .accelerator("CmdOrCtrl+P")
            .build(app)?;
    let go_to_line = MenuItemBuilder::with_id("goToLine", label(l, "goToLine", "Go to Line…"))
        .accelerator("CmdOrCtrl+G")
        .build(app)?;

    let edit = SubmenuBuilder::new(app, label(l, "menu.edit", "Edit"))
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&find)
        .item(&go_to_heading)
        .item(&go_to_line)
        .build()?;

    let toggle_sidebar =
        MenuItemBuilder::with_id("toggleSidebar", label(l, "toggleSidebar", "Toggle Sidebar"))
            .accelerator("CmdOrCtrl+\\")
            .build(app)?;
    // The action existed and nothing could reach it: an outline the reader
    // hid by dragging had no way back.
    let toggle_outline =
        MenuItemBuilder::with_id("toggleOutline", label(l, "toggleOutline", "Toggle Outline"))
            .accelerator("CmdOrCtrl+Alt+O")
            .build(app)?;
    let fold_all = MenuItemBuilder::with_id("foldAll", label(l, "foldAll", "Fold All Sections"))
        .accelerator("CmdOrCtrl+Alt+[")
        .build(app)?;
    let unfold_all =
        MenuItemBuilder::with_id("unfoldAll", label(l, "unfoldAll", "Unfold All Sections"))
            .accelerator("CmdOrCtrl+Alt+]")
            .build(app)?;
    let settings = MenuItemBuilder::with_id("settings", label(l, "settings", "Settings…"))
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let view = SubmenuBuilder::new(app, label(l, "menu.view", "View"))
        .item(&toggle_sidebar)
        .item(&toggle_outline)
        .separator()
        .item(&fold_all)
        .item(&unfold_all)
        .separator()
        .item(&settings)
        .build()?;

    let about =
        MenuItemBuilder::with_id("about", label(l, "about", "About MDViewer")).build(app)?;
    let help = SubmenuBuilder::new(app, label(l, "menu.help", "Help"))
        .item(&about)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&file, &edit, &view, &help])
        .build()
}

/// Forward menu clicks to the frontend, which owns the actual behaviour.
pub fn on_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let _ = app.emit("menu:action", MenuActionPayload { id: id.to_string() });
}
