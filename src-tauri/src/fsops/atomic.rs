use crate::error::{AppError, AppResult};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Write bytes so that the destination is either the old content or the new
/// content, never a truncated mix: write a sibling temp file, fsync it, then
/// rename over the target (atomic on the same volume).
///
/// Contract: docs/design/DATA-SAFETY.md §3.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| AppError::io(format!("no parent directory for {}", path.display())))?;

    let tmp = temp_sibling(path);

    // Write + flush + fsync the temp file before it replaces anything.
    {
        let mut f = File::create(&tmp).map_err(|e| AppError::from_io(e, &tmp))?;
        f.write_all(bytes).map_err(|e| cleanup(&tmp, e, &tmp))?;
        f.flush().map_err(|e| cleanup(&tmp, e, &tmp))?;
        f.sync_all().map_err(|e| cleanup(&tmp, e, &tmp))?;
    }

    // Preserve the original file's permissions (Unix mode bits).
    #[cfg(unix)]
    if let Ok(meta) = fs::metadata(path) {
        let _ = fs::set_permissions(&tmp, meta.permissions());
    }

    rename_with_retry(&tmp, path)?;

    // On Unix the rename itself is only durable once the directory is synced.
    #[cfg(unix)]
    if let Ok(d) = File::open(dir) {
        let _ = d.sync_all();
    }
    #[cfg(not(unix))]
    let _ = dir;

    Ok(())
}

/// Windows: antivirus and search indexers hold brief locks on freshly written
/// files, which makes rename fail spuriously. Retry a few times before giving up.
fn rename_with_retry(from: &Path, to: &Path) -> AppResult<()> {
    const DELAYS_MS: [u64; 3] = [50, 150, 400];

    match fs::rename(from, to) {
        Ok(()) => return Ok(()),
        Err(e) if !is_retryable(&e) => {
            let _ = fs::remove_file(from);
            return Err(AppError::from_io(e, to));
        }
        Err(_) => {}
    }

    for delay in DELAYS_MS {
        std::thread::sleep(std::time::Duration::from_millis(delay));
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) if !is_retryable(&e) => {
                let _ = fs::remove_file(from);
                return Err(AppError::from_io(e, to));
            }
            Err(_) => {}
        }
    }

    let _ = fs::remove_file(from);
    Err(AppError::io(format!(
        "could not replace {} after retries (file locked by another program?)",
        to.display()
    )))
}

fn is_retryable(e: &std::io::Error) -> bool {
    matches!(
        e.kind(),
        std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::Interrupted
    )
}

fn cleanup(tmp: &Path, e: std::io::Error, path: &Path) -> AppError {
    let _ = fs::remove_file(tmp);
    AppError::from_io(e, path)
}

/// Hidden sibling in the same directory (same volume ⇒ rename stays atomic).
fn temp_sibling(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let pid = std::process::id();
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    dir.join(format!(".{name}.verso-tmp-{pid}-{nanos}"))
}

/// Remove leftover temp files (a crash between write and rename).
pub fn sweep_temp_files(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') && name.contains(".verso-tmp-") {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Serialize a value as pretty JSON and write it atomically.
pub fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> AppResult<()> {
    let json = serde_json::to_vec_pretty(value)
        .map_err(|e| AppError::io(format!("serialize {}: {e}", path.display())))?;
    atomic_write(path, &json)
}

/// Read and deserialize JSON; `None` when the file is absent or corrupt,
/// so a damaged config never blocks startup.
///
/// A leading UTF-8 BOM is stripped first: editors on Windows add one freely,
/// and JSON parsers reject it — without this, hand-editing settings.json in
/// Notepad silently resets every setting.
pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let bytes = fs::read(path).ok()?;
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes);
    match serde_json::from_slice(bytes) {
        Ok(v) => Some(v),
        Err(e) => {
            eprintln!("[verso] ignoring corrupt {}: {e}", path.display());
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("verso-test-{tag}-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        dir
    }

    #[test]
    fn writes_and_replaces_content() {
        let dir = tmpdir("atomic");
        let file = dir.join("a.md");

        atomic_write(&file, b"first").unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"first");

        atomic_write(&file, b"second-longer").unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"second-longer");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn leaves_no_temp_files_behind() {
        let dir = tmpdir("notemp");
        let file = dir.join("b.md");
        atomic_write(&file, b"x").unwrap();

        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains("verso-tmp"))
            .collect();
        assert!(leftovers.is_empty(), "temp file left behind");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn sweep_removes_orphans() {
        let dir = tmpdir("sweep");
        let orphan = dir.join(".c.md.verso-tmp-1-2");
        fs::write(&orphan, b"junk").unwrap();
        let keep = dir.join("keep.md");
        fs::write(&keep, b"keep").unwrap();

        sweep_temp_files(&dir);

        assert!(!orphan.exists());
        assert!(keep.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn json_roundtrip_and_corrupt_tolerance() {
        let dir = tmpdir("json");
        let file = dir.join("s.json");

        write_json(&file, &vec![1u32, 2, 3]).unwrap();
        let back: Option<Vec<u32>> = read_json(&file);
        assert_eq!(back, Some(vec![1, 2, 3]));

        fs::write(&file, b"{not json").unwrap();
        let broken: Option<Vec<u32>> = read_json(&file);
        assert_eq!(broken, None);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn json_with_utf8_bom_is_still_read() {
        let dir = tmpdir("bom");
        let file = dir.join("bom.json");

        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(br#"{"theme":"light"}"#);
        fs::write(&file, &bytes).unwrap();

        let parsed: Option<serde_json::Value> = read_json(&file);
        assert_eq!(parsed.unwrap()["theme"], "light");

        let _ = fs::remove_dir_all(&dir);
    }
}
