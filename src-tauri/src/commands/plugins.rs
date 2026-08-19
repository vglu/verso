use crate::error::{AppError, AppResult};
use crate::paths;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

/// What a plugin says about itself, in `manifest.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub author: String,
    /// The file to run, relative to the plugin folder. Defaults to index.js.
    #[serde(default = "default_entry")]
    pub entry: String,
    /// Extensions this plugin offers to format, without the dot.
    #[serde(default)]
    pub extensions: Vec<String>,
}

fn default_entry() -> String {
    "index.js".into()
}

/// A manifest together with the source it points at.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedPlugin {
    pub manifest: PluginManifest,
    pub source: String,
    /// Where it came from, for the settings list and for error messages.
    pub dir: String,
}

/// Plugin sources are read into the webview and run there; a file this large
/// is not a formatter, it is a mistake or an attack, and either way it is not
/// going to be executed.
const MAX_SOURCE_BYTES: u64 = 512 * 1024;

/// Ids name folders and settings keys, so they stay boring on purpose.
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// Read every plugin in `{config}/plugins/*/`.
///
/// A plugin that is broken — no manifest, bad JSON, an entry that is missing
/// or absurdly large — is skipped rather than failing the whole call. One bad
/// folder must not cost the reader the plugins that are fine.
#[tauri::command]
pub async fn plugins_load(app: AppHandle) -> AppResult<Vec<LoadedPlugin>> {
    let dir = paths::config_dir(&app)?.join("plugins");
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(&dir)
        .map_err(|e| AppError::io(format!("cannot read plugins folder: {e}")))?;

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let folder = entry.path();
        if !folder.is_dir() {
            continue;
        }

        let manifest_path = folder.join("manifest.json");
        let Ok(raw) = std::fs::read_to_string(&manifest_path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_str::<PluginManifest>(&raw) else {
            eprintln!("[verso] plugin manifest is not valid JSON: {}", manifest_path.display());
            continue;
        };
        if !valid_id(&manifest.id) {
            eprintln!("[verso] plugin id is not usable: {:?}", manifest.id);
            continue;
        }

        // The entry must stay inside its own folder: a manifest is a file the
        // user downloaded, and "../../../etc/passwd" is a plausible thing for
        // one to contain.
        let entry_path = folder.join(&manifest.entry);
        let inside = entry_path
            .canonicalize()
            .ok()
            .zip(folder.canonicalize().ok())
            .map(|(e, f)| e.starts_with(f))
            .unwrap_or(false);
        if !inside {
            eprintln!("[verso] plugin entry points outside its folder: {}", manifest.id);
            continue;
        }

        match std::fs::metadata(&entry_path) {
            Ok(meta) if meta.len() <= MAX_SOURCE_BYTES => {}
            Ok(_) => {
                eprintln!("[verso] plugin entry is too large: {}", manifest.id);
                continue;
            }
            Err(_) => continue,
        }

        let Ok(source) = std::fs::read_to_string(&entry_path) else {
            continue;
        };

        out.push(LoadedPlugin {
            manifest,
            source,
            dir: folder.to_string_lossy().to_string(),
        });
    }

    out.sort_by_key(|p| p.manifest.name.to_lowercase());
    Ok(out)
}

/// The folder to put plugins in — shown in Settings so it can be opened.
#[tauri::command]
pub async fn plugins_dir(app: AppHandle) -> AppResult<String> {
    let dir = paths::config_dir(&app)?.join("plugins");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| AppError::io(format!("cannot create plugins folder: {e}")))?;
    }
    Ok(dir.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_boring_on_purpose() {
        assert!(valid_id("tidy-markdown"));
        assert!(valid_id("sort_lines2"));
        assert!(!valid_id(""));
        assert!(!valid_id("Tidy"), "upper case would make two ids for one plugin");
        assert!(!valid_id("../escape"), "an id names a folder and a settings key");
        assert!(!valid_id(&"x".repeat(65)));
    }

    #[test]
    fn a_manifest_needs_only_id_and_name() {
        let m: PluginManifest =
            serde_json::from_str(r#"{"id":"a","name":"A"}"#).expect("minimal manifest");
        assert_eq!(m.entry, "index.js");
        assert!(m.extensions.is_empty());
    }
}
