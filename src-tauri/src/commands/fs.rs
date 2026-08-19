use crate::error::{AppError, AppResult};
use crate::fsops::atomic::atomic_write;
use crate::fsops::encoding::{decode, encode_lines, endings_for, Encoding, Eol};
use crate::paths;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// 50 MB: past this a Markdown file is not a document any more, and the
/// editor would stall trying to render it.
const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMeta {
    pub path: String,
    pub doc_id: String,
    pub file_name: String,
    pub dir_path: String,
    pub mtime_ms: u64,
    pub readonly: bool,
    pub encoding: Encoding,
    pub eol: Eol,
    /// The file mixes line endings; the status bar says so.
    pub mixed_eol: bool,
    pub trailing_newline: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct OpenedFile {
    pub meta: FileMeta,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub mtime_ms: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMeta {
    pub encoding: Encoding,
    pub eol: Eol,
    pub trailing_newline: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatResult {
    pub mtime_ms: u64,
    pub exists: bool,
}

#[tauri::command]
pub async fn read_file(app: AppHandle, path: String) -> AppResult<OpenedFile> {
    let path = paths::canonicalize(Path::new(&path))?;

    let meta = std::fs::metadata(&path).map_err(|e| AppError::from_io(e, &path))?;
    if meta.is_dir() {
        return Err(AppError::io(format!("{} is a directory", path.display())));
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(AppError::io(format!(
            "file is too large ({} MB); the limit is {} MB",
            meta.len() / 1024 / 1024,
            MAX_FILE_BYTES / 1024 / 1024
        )));
    }

    let bytes = std::fs::read(&path).map_err(|e| AppError::from_io(e, &path))?;

    // An unsupported encoding is not a hard failure: the frontend opens the
    // file read-only, so the user can still read it and we never rewrite it.
    let decoded = decode(&bytes, &path)?;

    // Images referenced by the document live next to it; let the webview read them.
    allow_asset_dir(&app, &path);

    let dir_path = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(OpenedFile {
        meta: FileMeta {
            doc_id: paths::doc_id(&path),
            file_name: path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            dir_path,
            mtime_ms: paths::mtime_ms(&meta),
            readonly: meta.permissions().readonly(),
            encoding: decoded.encoding,
            eol: decoded.eol,
            mixed_eol: decoded.mixed_eol,
            trailing_newline: decoded.trailing_newline,
            size_bytes: meta.len(),
            path: path.to_string_lossy().to_string(),
        },
        content: decoded.content,
    })
}

#[tauri::command]
pub async fn save_file(
    path: String,
    content: String,
    base_mtime_ms: Option<u64>,
    meta: SaveMeta,
) -> AppResult<SaveResult> {
    let path = paths::canonicalize_parent(Path::new(&path))?;

    // Conflict guard: refuse to overwrite a file that changed under us.
    // `None` means the user explicitly chose to overwrite anyway.
    if let Some(base) = base_mtime_ms {
        if let Ok(disk) = std::fs::metadata(&path) {
            let disk_ms = paths::mtime_ms(&disk);
            // 1s tolerance: some filesystems round mtime, and a false conflict
            // on every save is worse than a missed one (watch also covers us).
            if disk_ms > base.saturating_add(1000) {
                return Err(AppError::ExternalModified {
                    path: path.to_string_lossy().to_string(),
                    disk_mtime_ms: disk_ms,
                });
            }
        }
    }

    // Take the line endings from the file itself rather than assuming one
    // kind throughout. Files with inconsistent endings are common, and a save
    // that quietly rewrote the minority of them would change bytes the user
    // never typed.
    let endings = std::fs::read(&path)
        .ok()
        .and_then(|old| decode(&old, &path).ok())
        .map(|old| endings_for(&content, &old.content, &old.line_endings, meta.eol))
        .unwrap_or_else(|| {
            let breaks = content.split('\n').count().saturating_sub(1);
            vec![meta.eol; breaks]
        });

    let bytes = encode_lines(
        &content,
        meta.encoding,
        &endings,
        meta.eol,
        meta.trailing_newline,
    );
    atomic_write(&path, &bytes)?;

    let after = std::fs::metadata(&path).map_err(|e| AppError::from_io(e, &path))?;
    Ok(SaveResult {
        mtime_ms: paths::mtime_ms(&after),
    })
}

#[tauri::command]
pub async fn stat_file(path: String) -> AppResult<StatResult> {
    let p = PathBuf::from(&path);
    match std::fs::metadata(&p) {
        Ok(m) => Ok(StatResult {
            mtime_ms: paths::mtime_ms(&m),
            exists: true,
        }),
        Err(_) => Ok(StatResult {
            mtime_ms: 0,
            exists: false,
        }),
    }
}

/// Register a directory with the asset protocol so `<img src="asset://...">`
/// can load images that sit beside the document.
pub fn allow_asset_dir(app: &AppHandle, file_path: &Path) {
    if let Some(dir) = file_path.parent() {
        app.asset_protocol_scope().allow_directory(dir, true).ok();
    }
}
