use crate::error::{AppError, AppResult};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Canonicalize a path for use as a stable identity across the app.
/// On Windows this also strips the \\?\ verbatim prefix that canonicalize adds,
/// because that form leaks into the UI and breaks string comparisons.
pub fn canonicalize(path: &Path) -> AppResult<PathBuf> {
    let canonical = std::fs::canonicalize(path).map_err(|e| AppError::from_io(e, path))?;
    Ok(strip_verbatim(canonical))
}

/// Canonicalize a path that may not exist yet (e.g. "save as" target):
/// resolve the parent, then re-attach the file name.
pub fn canonicalize_parent(path: &Path) -> AppResult<PathBuf> {
    if path.exists() {
        return canonicalize(path);
    }
    let parent = path
        .parent()
        .ok_or_else(|| AppError::io(format!("no parent for {}", path.display())))?;
    let name = path
        .file_name()
        .ok_or_else(|| AppError::io(format!("no file name in {}", path.display())))?;
    let canonical_parent = std::fs::canonicalize(parent).map_err(|e| AppError::from_io(e, parent))?;
    Ok(strip_verbatim(canonical_parent).join(name))
}

fn strip_verbatim(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        p
    }
}

/// Stable document id: sha256 of the canonical path (lowercased on Windows,
/// where the filesystem is case-insensitive). Used as the draft file name.
pub fn doc_id(path: &Path) -> String {
    let s = path.to_string_lossy();
    let normalized = if cfg!(windows) {
        s.to_lowercase()
    } else {
        s.to_string()
    };
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// `{app_config_dir}` — created on demand.
pub fn config_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::io(format!("no config dir: {e}")))?;
    std::fs::create_dir_all(&dir).map_err(|e| AppError::from_io(e, &dir))?;
    Ok(dir)
}

/// `{app_data_dir}/drafts` — created on demand.
pub fn drafts_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::io(format!("no data dir: {e}")))?
        .join("drafts");
    std::fs::create_dir_all(&dir).map_err(|e| AppError::from_io(e, &dir))?;
    Ok(dir)
}

/// Is this a Markdown file we are willing to open?
pub fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .as_deref(),
        Some("md" | "markdown" | "mdown" | "mkd" | "mdx" | "txt")
    )
}

/// Millisecond timestamp of a file's mtime.
pub fn mtime_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Current wall-clock time in milliseconds.
pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doc_id_is_stable_and_distinct() {
        let a = doc_id(Path::new("/tmp/one.md"));
        let b = doc_id(Path::new("/tmp/one.md"));
        let c = doc_id(Path::new("/tmp/two.md"));
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 64);
    }

    #[test]
    fn markdown_detection() {
        assert!(is_markdown(Path::new("a.md")));
        assert!(is_markdown(Path::new("a.MARKDOWN")));
        assert!(!is_markdown(Path::new("a.png")));
        assert!(!is_markdown(Path::new("noext")));
    }
}
