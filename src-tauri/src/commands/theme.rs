use crate::error::{AppError, AppResult};
use std::path::PathBuf;

/// A theme is one CSS file, and a CSS file is not a document.
///
/// It gets its own command rather than going through `read_file`: that one
/// answers with a document's identity, encoding and line endings, none of
/// which mean anything here, and it would put a stylesheet through the whole
/// editing contract. This reads text and nothing else.
const MAX_THEME_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub async fn read_theme(path: String) -> AppResult<String> {
    let p = PathBuf::from(&path);

    let meta = std::fs::metadata(&p).map_err(|e| AppError::from_io(e, &p))?;
    if meta.len() > MAX_THEME_BYTES {
        return Err(AppError::io(format!(
            "theme file is too large ({} bytes): {path}",
            meta.len()
        )));
    }

    // A theme that is not valid UTF-8 is not a theme anyone wrote on purpose.
    let bytes = std::fs::read(&p).map_err(|e| AppError::from_io(e, &p))?;
    String::from_utf8(bytes).map_err(|_| AppError::UnsupportedEncoding {
        path,
        detected: "not utf-8".into(),
    })
}
