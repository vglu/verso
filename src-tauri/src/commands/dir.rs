use crate::error::{AppError, AppResult};
use crate::paths;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub has_children: bool,
}

/// One directory level: sub-directories plus Markdown files, hidden entries
/// filtered out, directories first then case-insensitive alphabetical.
#[tauri::command]
pub async fn list_dir(path: String) -> AppResult<Vec<TreeEntry>> {
    let dir = paths::canonicalize(Path::new(&path))?;
    let entries = std::fs::read_dir(&dir).map_err(|e| AppError::from_io(e, &dir))?;

    let mut out: Vec<TreeEntry> = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let entry_path = entry.path();

        if file_type.is_dir() {
            if is_ignored_dir(&name) {
                continue;
            }
            out.push(TreeEntry {
                has_children: dir_has_visible_children(&entry_path),
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: true,
            });
        } else if paths::is_markdown(&entry_path) {
            out.push(TreeEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: false,
                has_children: false,
            });
        }
    }

    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(out)
}

#[tauri::command]
pub async fn resolve_tree_root(file_path: String) -> AppResult<String> {
    let p = paths::canonicalize(Path::new(&file_path))?;
    let parent = p
        .parent()
        .ok_or_else(|| AppError::io(format!("no parent directory for {}", p.display())))?;
    Ok(parent.to_string_lossy().to_string())
}

/// Directories that never contain documents the user wants to browse.
fn is_ignored_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules" | "target" | "dist" | "build" | "__pycache__" | "vendor" | "obj" | "bin"
    )
}

/// Cheap probe so the tree can show a disclosure arrow only when it opens
/// to something: stop at the first visible child.
fn dir_has_visible_children(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        match entry.file_type() {
            Ok(t) if t.is_dir() => {
                if !is_ignored_dir(&name) {
                    return true;
                }
            }
            Ok(_) => {
                if paths::is_markdown(&entry.path()) {
                    return true;
                }
            }
            Err(_) => continue,
        }
    }
    false
}
