//! Local persistence (spec §36, §54, §65).
//!
//! Deliberately tiny: plain JSON + JSONL in the user's config dir.
//! No database, no sync, no cloud (spec §65 anti-overengineering rule).

pub mod audit;
pub mod history;
pub mod settings;

use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct AppDirs {
    pub config: PathBuf,
    pub data: PathBuf,
    pub log: PathBuf,
}

/// Resolves the app's local directories (Linux:
/// `~/.config/adb-studio`, `~/.local/share/adb-studio`).
///
/// Falls back to `./.adb-studio` when HOME is unavailable (headless tests).
pub fn app_dirs() -> AppDirs {
    match directories::ProjectDirs::from("com", "wadb", "adb-studio") {
        Some(pd) => AppDirs {
            config: pd.config_dir().to_path_buf(),
            data: pd.data_dir().to_path_buf(),
            log: pd.data_dir().join("logs"),
        },
        None => {
            let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
            let base = base.join(".adb-studio");
            AppDirs {
                config: base.clone(),
                data: base.clone(),
                log: base.join("logs"),
            }
        }
    }
}
