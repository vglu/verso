use crate::error::{AppError, AppResult};
use base64::Engine;
use std::path::PathBuf;

/// Pictures are embedded into an exported document, so they have to be read
/// as bytes. Past this size a picture is not illustrating a note any more,
/// and an export nobody can email is not much of an export.
const MAX_IMAGE_BYTES: u64 = 12 * 1024 * 1024;

/// A local image as a data URI, ready to be inlined.
///
/// An exported page has to work when it is moved, mailed or opened from a
/// stick — that is the whole point of "standalone" — and a relative path to a
/// picture on the author's disk survives none of those.
#[tauri::command]
pub async fn read_image_data_uri(path: String) -> AppResult<String> {
    let p = PathBuf::from(&path);

    let meta = std::fs::metadata(&p).map_err(|e| AppError::from_io(e, &p))?;
    if meta.len() > MAX_IMAGE_BYTES {
        return Err(AppError::io(format!(
            "image is too large to embed ({} bytes): {path}",
            meta.len()
        )));
    }

    let bytes = std::fs::read(&p).map_err(|e| AppError::from_io(e, &p))?;
    let mime = mime_for(&p);
    let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{data}"))
}

fn mime_for(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("avif") => "image/avif",
        Some("bmp") => "image/bmp",
        _ => "application/octet-stream",
    }
}

/// Write an exported file.
///
/// Deliberately not `save_file`: that one is the document contract — mtime
/// guards, encodings, per-line endings, all the machinery that protects
/// someone's source. An export is a new file we generated, always UTF-8, and
/// it borrows none of that.
#[tauri::command]
pub async fn write_export(path: String, contents: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    crate::fsops::atomic::atomic_write(&p, contents.as_bytes())
}
