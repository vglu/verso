use crate::error::{AppError, AppResult};
use crate::fsops::atomic::{read_json, write_json};
use crate::paths;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

/// An unsaved buffer, persisted outside the user's file so a crash never
/// costs typing. Contract: docs/design/DATA-SAFETY.md §4.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub doc_id: String,
    pub path: String,
    pub base_mtime_ms: u64,
    pub saved_at_ms: u64,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftInfo {
    pub doc_id: String,
    pub path: String,
    pub base_mtime_ms: u64,
    pub saved_at_ms: u64,
}

/// A document id is a file name here, so it may only be one.
///
/// Today every id comes from Rust and is a hash, but this is the path that
/// stands between a crash and someone's typing: an id carrying a separator or
/// `..` would put — or delete — a file outside the drafts directory. Checked
/// rather than trusted.
fn draft_file(dir: &std::path::Path, doc_id: &str) -> AppResult<std::path::PathBuf> {
    let safe = !doc_id.is_empty()
        && doc_id.len() <= 128
        && doc_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');

    if !safe {
        return Err(AppError::io(format!("invalid document id: {doc_id}")));
    }
    Ok(dir.join(format!("{doc_id}.json")))
}

#[tauri::command]
pub async fn draft_save(
    app: AppHandle,
    doc_id: String,
    path: String,
    base_mtime_ms: u64,
    content: String,
) -> AppResult<()> {
    let dir = paths::drafts_dir(&app)?;
    let file = draft_file(&dir, &doc_id)?;
    let draft = Draft {
        doc_id,
        path,
        base_mtime_ms,
        saved_at_ms: paths::now_ms(),
        content,
    };
    write_json(&file, &draft)
}

#[tauri::command]
pub async fn draft_get(app: AppHandle, doc_id: String) -> AppResult<Option<Draft>> {
    let dir = paths::drafts_dir(&app)?;
    Ok(read_json(&draft_file(&dir, &doc_id)?))
}

#[tauri::command]
pub async fn draft_delete(app: AppHandle, doc_id: String) -> AppResult<()> {
    let dir = paths::drafts_dir(&app)?;
    let file = draft_file(&dir, &doc_id)?;
    if file.exists() {
        std::fs::remove_file(&file).map_err(|e| crate::error::AppError::from_io(e, &file))?;
    }
    Ok(())
}

/// Drafts worth offering to restore: the file still exists and the draft is
/// newer than what is on disk. Stale drafts are cleaned up as we go.
#[tauri::command]
pub async fn drafts_list(app: AppHandle) -> AppResult<Vec<DraftInfo>> {
    let dir = paths::drafts_dir(&app)?;
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let file = entry.path();
        if file.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(draft) = read_json::<Draft>(&file) else {
            let _ = std::fs::remove_file(&file);
            continue;
        };

        let target = std::path::Path::new(&draft.path);
        let disk_mtime = std::fs::metadata(target).map(|m| paths::mtime_ms(&m)).ok();

        match disk_mtime {
            // File gone: the draft is the only copy left, keep offering it.
            None => out.push(info(&draft)),
            Some(disk) if draft.saved_at_ms > disk => out.push(info(&draft)),
            // Disk is newer — the draft was already saved (or superseded).
            Some(_) => {
                let _ = std::fs::remove_file(&file);
            }
        }
    }

    out.sort_by(|a, b| b.saved_at_ms.cmp(&a.saved_at_ms));
    Ok(out)
}

fn info(d: &Draft) -> DraftInfo {
    DraftInfo {
        doc_id: d.doc_id.clone(),
        path: d.path.clone(),
        base_mtime_ms: d.base_mtime_ms,
        saved_at_ms: d.saved_at_ms,
    }
}

#[cfg(test)]
mod tests {
    use super::draft_file;
    use std::path::Path;

    /// A document id becomes a file name, so anything that can leave the
    /// drafts directory has to be refused before it is joined to a path.
    #[test]
    fn accepts_the_ids_we_actually_produce() {
        let dir = Path::new("C:/drafts");
        let id = "036b618d759f1b06743ad6955235e690ec4f92b6f83bd77894f1f36a7b644471";
        assert!(draft_file(dir, id).is_ok());
        assert!(draft_file(dir, "untitled-3-1750000000000").is_ok());
        assert!(draft_file(dir, "unread-2").is_ok());
    }

    #[test]
    fn refuses_an_id_that_could_escape_the_directory() {
        let dir = Path::new("C:/drafts");
        for id in [
            "../../windows/system32/config",
            "unread:D:/Projects/notes.md",
            "sub/dir",
            "back\\slash",
            "..",
            "",
        ] {
            assert!(draft_file(dir, id).is_err(), "should refuse {id:?}");
        }
    }

    #[test]
    fn refuses_an_absurdly_long_id() {
        let dir = Path::new("C:/drafts");
        assert!(draft_file(dir, &"a".repeat(129)).is_err());
    }
}
