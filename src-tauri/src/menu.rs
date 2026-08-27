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
    // Every other action in this menu can be reached from the keyboard; export
    // was the one that needed the mouse. Ctrl+E is reader mode, so export
    // takes the Shift variant, next to Print on Ctrl+Shift+P.
    let export_html =
        MenuItemBuilder::with_id("exportHtml", label(l, "exportHtml", "Export as HTML…"))
            .accelerator("CmdOrCtrl+Shift+E")
            .build(app)?;
    // Not Ctrl+P: that is Go to Heading, and WebView2 would take it anyway.
    // Print keeps the Shift variant, which the window's menu claims first.
    let print = MenuItemBuilder::with_id("print", label(l, "print", "Print…"))
        .accelerator("CmdOrCtrl+Shift+P")
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
        .item(&export_html)
        .item(&print)
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
    // Two documents side by side. Ctrl+\ is already the sidebar and
    // Ctrl+Shift+\ the outline, so the split takes the third of that family.
    let split_editor =
        MenuItemBuilder::with_id("toggleSplit", label(l, "toggleSplit", "Split Editor"))
            .accelerator("CmdOrCtrl+Alt+\\")
            .build(app)?;
    // The document beside its own rendering (ADR-005).
    let source_and_preview = MenuItemBuilder::with_id(
        "toggleSourceAndPreview",
        label(l, "toggleSourceAndPreview", "Source and Preview"),
    )
    .accelerator("CmdOrCtrl+Alt+P")
    .build(app)?;
    let fold_all = MenuItemBuilder::with_id("foldAll", label(l, "foldAll", "Fold All Sections"))
        .accelerator("CmdOrCtrl+Alt+[")
        .build(app)?;
    let unfold_all =
        MenuItemBuilder::with_id("unfoldAll", label(l, "unfoldAll", "Unfold All Sections"))
            .accelerator("CmdOrCtrl+Alt+]")
            .build(app)?;
    let format_doc =
        MenuItemBuilder::with_id("formatDocument", label(l, "formatDocument", "Format Document"))
            .accelerator("Alt+Shift+F")
            .build(app)?;

    // The window's own keydown handler does the zooming, so these carry no
    // accelerators of their own — two owners for one key means the menu wins
    // and the wheel gesture stops matching the keyboard. They are here to be
    // discoverable, and to say what the keys are.
    let zoom_in = MenuItemBuilder::with_id("zoomIn", label(l, "zoomIn", "Zoom In	Ctrl++"))
        .build(app)?;
    let zoom_out = MenuItemBuilder::with_id("zoomOut", label(l, "zoomOut", "Zoom Out	Ctrl+-"))
        .build(app)?;
    let zoom_reset =
        MenuItemBuilder::with_id("zoomReset", label(l, "zoomReset", "Actual Size	Ctrl+0"))
            .build(app)?;
    let settings = MenuItemBuilder::with_id("settings", label(l, "settings", "Settings…"))
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let view = SubmenuBuilder::new(app, label(l, "menu.view", "View"))
        .item(&toggle_sidebar)
        .item(&toggle_outline)
        .item(&split_editor)
        .item(&source_and_preview)
        .separator()
        .item(&fold_all)
        .item(&unfold_all)
        .separator()
        .item(&format_doc)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&zoom_reset)
        .separator()
        .item(&settings)
        .build()?;

    let about = MenuItemBuilder::with_id("about", label(l, "about", "About Verso")).build(app)?;
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
