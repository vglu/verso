use crate::error::{AppError, AppResult};
use crate::state::AppState;
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

/// Filesystem noise is bursty (editors write several times per save), so
/// events are coalesced here rather than in the frontend.
const DEBOUNCE: Duration = Duration::from_millis(300);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsChangedPayload {
    pub path: String,
    pub kind: &'static str,
}

/// Owns the debouncer and the set of paths currently observed.
pub struct WatchManager {
    debouncer: Option<Debouncer<RecommendedWatcher, RecommendedCache>>,
    watched: HashSet<PathBuf>,
}

impl WatchManager {
    pub fn new() -> Self {
        Self {
            debouncer: None,
            watched: HashSet::new(),
        }
    }

    fn ensure_debouncer(&mut self, app: &AppHandle) -> AppResult<()> {
        if self.debouncer.is_some() {
            return Ok(());
        }
        let handle = app.clone();
        let debouncer = new_debouncer(DEBOUNCE, None, move |result: DebounceEventResult| {
            let events = match result {
                Ok(events) => events,
                Err(errors) => {
                    for e in errors {
                        eprintln!("[verso] watch error: {e}");
                    }
                    return;
                }
            };

            // One notification per path per burst; a save produces several
            // raw events and the UI only cares that the file moved on.
            let mut seen: HashSet<(PathBuf, &'static str)> = HashSet::new();
            for event in events {
                let kind = classify(&event.event.kind);
                for path in &event.event.paths {
                    if seen.insert((path.clone(), kind)) {
                        let _ = handle.emit(
                            "fs:changed",
                            FsChangedPayload {
                                path: path.to_string_lossy().to_string(),
                                kind,
                            },
                        );
                    }
                }
            }
        })
        .map_err(|e| AppError::io(format!("watcher init: {e}")))?;

        self.debouncer = Some(debouncer);
        Ok(())
    }

    /// Replace the observed set with `paths` (idempotent): only the difference
    /// is applied, so re-sending the same list costs nothing.
    pub fn set_paths(&mut self, app: &AppHandle, paths: Vec<PathBuf>) -> AppResult<()> {
        self.ensure_debouncer(app)?;
        let Some(debouncer) = self.debouncer.as_mut() else {
            return Ok(());
        };

        let next: HashSet<PathBuf> = paths.into_iter().filter(|p| p.exists()).collect();

        // The debouncer keeps its own record of the roots it watches now, so
        // watch/unwatch is the whole story — no separate cache to keep in step.
        for gone in self.watched.difference(&next) {
            let _ = debouncer.unwatch(gone);
        }

        // Non-recursive throughout: we watch the open documents and their
        // immediate directory, never a whole tree the user did not ask for.
        for added in next.difference(&self.watched) {
            if let Err(e) = debouncer.watch(added, RecursiveMode::NonRecursive) {
                eprintln!("[verso] cannot watch {}: {e}", added.display());
            }
        }

        self.watched = next;
        Ok(())
    }
}

impl Default for WatchManager {
    fn default() -> Self {
        Self::new()
    }
}

fn classify(kind: &notify::EventKind) -> &'static str {
    use notify::event::{ModifyKind, RenameMode};
    match kind {
        notify::EventKind::Remove(_) => "removed",
        notify::EventKind::Modify(ModifyKind::Name(RenameMode::From)) => "renamed",
        notify::EventKind::Modify(ModifyKind::Name(_)) => "renamed",
        _ => "modified",
    }
}

#[tauri::command]
pub async fn watch_paths(app: AppHandle, paths: Vec<String>) -> AppResult<()> {
    let state: State<AppState> = app.state();
    let list: Vec<PathBuf> = with_parents(&paths).iter().map(PathBuf::from).collect();

    let mut guard = state
        .watcher
        .lock()
        .map_err(|e| AppError::io(format!("watcher lock: {e}")))?;
    guard.set_paths(&app, list)
}

/// Watch the directory a document lives in, in addition to the file itself:
/// some editors replace files by rename, which a file-only watch misses.
pub fn with_parents(paths: &[String]) -> Vec<String> {
    let mut out: HashSet<String> = HashSet::new();
    for p in paths {
        out.insert(p.clone());
        if let Some(parent) = Path::new(p).parent() {
            out.insert(parent.to_string_lossy().to_string());
        }
    }
    out.into_iter().collect()
}
