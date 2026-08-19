use serde::Serialize;
use std::path::Path;

/// Errors crossing the IPC boundary. Serialized tagged by `kind` so the
/// frontend matches on a discriminant, never on a message string.
/// Contract: docs/design/IPC-CONTRACT.md §1.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all_fields = "camelCase")]
pub enum AppError {
    #[error("file not found: {path}")]
    NotFound { path: String },

    #[error("permission denied: {path}")]
    PermissionDenied { path: String },

    #[error("file changed on disk: {path}")]
    ExternalModified { path: String, disk_mtime_ms: u64 },

    #[error("unsupported encoding ({detected}): {path}")]
    UnsupportedEncoding { path: String, detected: String },

    #[error("not a text file: {path}")]
    IsBinary { path: String },

    #[error("{message}")]
    Io { message: String },
}

impl AppError {
    pub fn io(message: impl Into<String>) -> Self {
        AppError::Io {
            message: message.into(),
        }
    }

    /// Map a std::io::Error against the path it happened on.
    pub fn from_io(e: std::io::Error, path: &Path) -> Self {
        let p = path.to_string_lossy().to_string();
        match e.kind() {
            std::io::ErrorKind::NotFound => AppError::NotFound { path: p },
            std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied { path: p },
            _ => AppError::Io {
                message: format!("{p}: {e}"),
            },
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
