use crate::error::AppResult;
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

#[tauri::command]
pub async fn draft_save(
    app: AppHandle,
    doc_id: String,
    path: String,
    base_mtime_ms: u64,
    content: String,
) -> AppResult<()> {
    let dir = paths::drafts_dir(&app)?;
    let file = dir.join(format!("{doc_id}.json"));
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
    Ok(read_json(&dir.join(format!("{doc_id}.json"))))
}

#[tauri::command]
pub async fn draft_delete(app: AppHandle, doc_id: String) -> AppResult<()> {
    let dir = paths::drafts_dir(&app)?;
    let file = dir.join(format!("{doc_id}.json"));
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
