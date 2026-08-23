mod commands;
mod error;
mod fsops;
mod menu;
mod paths;
mod state;
mod watcher;

use serde::Serialize;
use state::AppState;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct OpenFilePayload {
    pub paths: Vec<String>,
}

/// Markdown paths out of a raw argv list. Anything that is not an existing
/// Markdown file (flags, the exe path, dev-server args) is ignored.
/// Files named on the command line — by a double-click, by "Open with", or by
/// a drag onto the icon.
///
/// Every file, not every *Markdown* file. This used to filter by extension
/// against the six Markdown ones, while the application itself opens some
/// twenty kinds — XML, JSON, CSV, YAML, a log — as themselves. Choosing
/// "Open with → Verso" on any of those opened the window and no document, and
/// said nothing about why: the path was dropped here, before anything that
/// could have explained it.
///
/// What can be read is decided where the file is read, which is the only place
/// that knows. A file that is not text says so on screen.
fn openable_paths_from_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(PathBuf::from)
        .filter(|p| p.is_file())
        .filter_map(|p| paths::canonicalize(&p).ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_files = openable_paths_from_args(std::env::args());

    let mut builder = tauri::Builder::default();

    // Single instance must be registered first so a second launch is caught
    // before it starts building its own window.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files = openable_paths_from_args(argv);

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            if !files.is_empty() {
                let _ = app.emit("open-file", OpenFilePayload { paths: files });
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(AppState::new(startup_files))
        .setup(|app| {
            let handle = app.handle();
            app.set_menu(menu::build(handle)?)?;

            // Clean up temp files left by a crash between write and rename.
            if let Ok(dir) = paths::config_dir(handle) {
                fsops::atomic::sweep_temp_files(&dir);
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            menu::on_event(app, event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            commands::fs::read_file,
            commands::fs::save_file,
            commands::fs::stat_file,
            commands::dir::list_dir,
            commands::dir::resolve_tree_root,
            commands::drafts::draft_save,
            commands::drafts::draft_get,
            commands::drafts::draft_delete,
            commands::drafts::drafts_list,
            commands::session::session_load,
            commands::session::session_save,
            commands::settings::settings_load,
            commands::settings::settings_save,
            commands::shell::reveal_in_os,
            commands::shell::open_external,
            commands::shell::get_startup_files,
            commands::menu::set_menu_labels,
            commands::theme::read_theme,
            commands::export::read_image_data_uri,
            commands::export::write_export,
            commands::plugins::plugins_load,
            commands::plugins::plugins_dir,
            watcher::watch_paths,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Verso")
        .run(|_app, _event| {
            // macOS delivers double-clicked documents as an Opened event.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let files: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .filter(|p| paths::is_markdown(p))
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                if !files.is_empty() {
                    let _ = _app.emit("open-file", OpenFilePayload { paths: files });
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argv_filtering_skips_exe_and_flags() {
        let args = vec![
            "verso.exe".to_string(),
            "--flag".to_string(),
            "definitely-missing-file.md".to_string(),
        ];
        // Nothing exists on disk, so nothing is opened.
        assert!(openable_paths_from_args(args).is_empty());
    }

    #[test]
    fn argv_takes_every_file_the_reader_pointed_at() {
        let dir = std::env::temp_dir().join(format!("verso-argv-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let md = dir.join("doc.md");
        std::fs::write(&md, b"# hi").unwrap();
        // The reported bug: "Open with -> Verso" on one of these opened the
        // window and no document. They are files the application reads, and
        // the launcher was the only thing that disagreed.
        let data = dir.join("settings.json");
        std::fs::write(&data, b"{}").unwrap();
        let markup = dir.join("feed.xml");
        std::fs::write(&markup, b"<x/>").unwrap();

        let args = vec![
            "verso.exe".to_string(),
            md.to_string_lossy().to_string(),
            data.to_string_lossy().to_string(),
            markup.to_string_lossy().to_string(),
        ];
        let found = openable_paths_from_args(args);
        assert_eq!(found.len(), 3);
        assert!(found.iter().any(|p| p.ends_with("doc.md")));
        assert!(found.iter().any(|p| p.ends_with("settings.json")));
        assert!(found.iter().any(|p| p.ends_with("feed.xml")));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn argv_still_refuses_what_is_not_a_file() {
        let dir = std::env::temp_dir().join(format!("verso-argv-dir-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let args = vec!["verso.exe".to_string(), dir.to_string_lossy().to_string()];
        // A folder is not a document; the window must not try to read one.
        assert!(openable_paths_from_args(args).is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
