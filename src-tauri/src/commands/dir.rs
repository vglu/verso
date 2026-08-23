use crate::error::{AppError, AppResult};
use crate::paths;
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// One directory level: sub-directories plus Markdown files, hidden entries
/// filtered out, directories first then case-insensitive alphabetical.
///
/// One `read_dir` and nothing else. There used to be a second one per
/// sub-directory — a probe that opened every child folder to decide whether
/// its row deserved a disclosure arrow — and in a folder like Downloads, with
/// a hundred and fifty sub-folders, that was a hundred and fifty directory
/// opens on the path between double-clicking a file and seeing it. The arrow
/// is drawn for every folder either way; nothing ever read the answer.
#[tauri::command]
pub async fn list_dir(app: AppHandle, path: String) -> AppResult<Vec<TreeEntry>> {
    let entries = read_level(Path::new(&path))?;

    // Pictures live wherever the writer put them, and that is often not beside
    // the document: `docs/guide/page.md` pointing at `../images/diagram.png`
    // is an ordinary layout, and until now it drew a broken-image box. Opening
    // a document allows its own folder; opening a folder allows that folder,
    // which is the project the reader is working in.
    if let Ok(dir) = std::fs::canonicalize(Path::new(&path)) {
        // Verbatim on purpose; see allow_asset_dir in commands/fs.rs.
        app.asset_protocol_scope().allow_directory(&dir, true).ok();
    }

    Ok(entries)
}

fn read_level(path: &Path) -> AppResult<Vec<TreeEntry>> {
    let dir = paths::canonicalize(path)?;
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
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: true,
            });
        } else if paths::is_markdown(&entry_path) {
            out.push(TreeEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: false,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn lists_folders_first_then_markdown_alphabetically() {
        let temp = std::env::temp_dir().join("verso-dir-test");
        let _ = fs::remove_dir_all(&temp);
        fs::create_dir_all(temp.join("Zebra")).unwrap();
        fs::create_dir_all(temp.join("apple")).unwrap();
        fs::create_dir_all(temp.join("node_modules")).unwrap();
        fs::create_dir_all(temp.join(".git")).unwrap();
        fs::write(temp.join("b.md"), "b").unwrap();
        fs::write(temp.join("A.md"), "a").unwrap();
        fs::write(temp.join("photo.png"), "x").unwrap();

        let names: Vec<String> = read_level(&temp)
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();

        // Folders first, case-insensitively sorted; ignored and hidden ones
        // gone; only Markdown among the files.
        assert_eq!(names, vec!["apple", "Zebra", "A.md", "b.md"]);
        let _ = fs::remove_dir_all(&temp);
    }
}
