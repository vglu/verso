use crate::watcher::WatchManager;
use std::sync::Mutex;

/// Process-wide state owned by Tauri.
pub struct AppState {
    /// Files from argv of the first launch, consumed once by the frontend.
    startup_files: Mutex<Vec<String>>,
    pub watcher: Mutex<WatchManager>,
}

impl AppState {
    pub fn new(startup_files: Vec<String>) -> Self {
        Self {
            startup_files: Mutex::new(startup_files),
            watcher: Mutex::new(WatchManager::new()),
        }
    }

    /// Startup files are a one-shot handoff: reading them clears them, so a
    /// reload of the webview does not reopen the same tabs again.
    pub fn take_startup_files(&self) -> Vec<String> {
        match self.startup_files.lock() {
            Ok(mut guard) => std::mem::take(&mut *guard),
            Err(poisoned) => {
                let mut guard = poisoned.into_inner();
                std::mem::take(&mut *guard)
            }
        }
    }
}
