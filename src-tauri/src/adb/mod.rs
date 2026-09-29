//! ADB tool discovery + client (spec §7, §9).
//!
//! We do NOT reimplement the ADB protocol: we locate and execute the official
//! `adb` binary. Discovery order:
//!   1. manual path (user setting)
//!   2. PATH
//!   3. $ANDROID_HOME/platform-tools
//!   4. $ANDROID_SDK_ROOT/platform-tools
//!   5. ~/Android/Sdk/platform-tools
//!   6. common Linux install dirs
//!
//! scrcpy and fastboot are discovered the same way (spec §8, §52).

pub mod client;
pub mod operations;
pub mod parse;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;

use crate::error::{AppError, ErrorCode};
use crate::processes::run_captured;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolKind {
    Adb,
    Scrcpy,
    Fastboot,
}

impl ToolKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ToolKind::Adb => "adb",
            ToolKind::Scrcpy => "scrcpy",
            ToolKind::Fastboot => "fastboot",
        }
    }

    fn version_args(&self) -> &'static [&'static str] {
        match self {
            ToolKind::Adb => &["version"],
            ToolKind::Fastboot => &["version"],
            // scrcpy prints its version on stdout (older builds: stderr)
            ToolKind::Scrcpy => &["--version"],
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub name: String,
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: Option<String>,
}

pub struct ToolManager {
    paths: Mutex<[Option<String>; 3]>, // Adb, Scrcpy, Fastboot
}

impl ToolManager {
    pub fn new() -> ToolManager {
        ToolManager {
            paths: Mutex::new([None, None, None]),
        }
    }

    fn idx(kind: ToolKind) -> usize {
        match kind {
            ToolKind::Adb => 0,
            ToolKind::Scrcpy => 1,
            ToolKind::Fastboot => 2,
        }
    }

    /// Detects all tools once. Called at startup and after settings change.
    pub fn detect(
        &self,
        adb_manual: Option<&str>,
        scrcpy_manual: Option<&str>,
        fastboot_manual: Option<&str>,
    ) -> Vec<ToolStatus> {
        let dirs = sdk_dirs();
        let kinds = [ToolKind::Adb, ToolKind::Scrcpy, ToolKind::Fastboot];
        let manuals: [Option<&str>; 3] = [adb_manual, scrcpy_manual, fastboot_manual];

        let mut statuses = Vec::with_capacity(3);
        let mut found: [Option<String>; 3] = [None, None, None];

        for (i, kind) in kinds.iter().enumerate() {
            let manual = manuals[i];
            let (path, source) = find_tool(kind, manual, &dirs);
            let path_str = path.map(|p| p.to_string_lossy().to_string());
            let version = path_str.as_ref().map(|p| fetch_version(p, kind)).flatten();
            statuses.push(ToolStatus {
                name: kind.as_str().to_string(),
                found: path_str.is_some(),
                path: path_str.clone(),
                version,
                source,
            });
            found[i] = path_str;
        }

        *self.paths.lock().unwrap() = found;
        statuses
    }

    /// Returns the cached (or re-detected) path of a tool.
    pub fn require(&self, kind: ToolKind, manual: Option<&str>) -> Result<String, AppError> {
        let mut cache = self.paths.lock().unwrap();
        let idx = Self::idx(kind);
        if let Some(cached) = cache[idx].as_ref() {
            if is_executable_file(Path::new(cached)) {
                return Ok(cached.clone());
            }
            // A manually configured binary may have been removed or moved.
            cache[idx] = None;
        }
        // First use or invalidated cache: detect on the fly.
        let dirs = sdk_dirs();
        let (path, _source) = find_tool(&kind, manual, &dirs);
        match path {
            Some(p) => {
                let s = p.to_string_lossy().to_string();
                cache[idx] = Some(s.clone());
                Ok(s)
            }
            None => {
                let details = if let Some(path) = manual {
                    format!(
                        "Configured {} path does not exist or is not executable: {}. Choose the downloaded executable in Configurações → Ferramentas.",
                        kind.as_str(), path
                    )
                } else {
                    format!(
                        "{} not found. Install it or set its path in Configurações.",
                        kind.as_str()
                    )
                };
                Err(AppError::new(
                    if kind == ToolKind::Adb {
                        ErrorCode::AdbNotFound
                    } else {
                        ErrorCode::ToolNotFound
                    },
                    details,
                ))
            }
        }
    }

    /// User-configured path: validate it points at an executable file.
    pub fn set_manual(&self, kind: ToolKind, path: Option<&str>) -> Result<(), AppError> {
        let mut cache = self.paths.lock().unwrap();
        let idx = Self::idx(kind);
        match path {
            None => {
                cache[idx] = None;
                Ok(())
            }
            Some(p) => {
                if !is_executable_file(Path::new(p)) {
                    return Err(AppError::new(
                        ErrorCode::InvalidPath,
                        format!("not an executable file: {p}"),
                    ));
                }
                cache[idx] = Some(p.to_string());
                Ok(())
            }
        }
    }

    pub fn clear_cache(&self) {
        *self.paths.lock().unwrap() = [None, None, None];
    }
}

impl Default for ToolManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Candidate platform-tools directories for ADB/scrcpy/fastboot.
pub fn sdk_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for var in ["ANDROID_HOME", "ANDROID_SDK_ROOT"] {
        if let Some(v) = std::env::var_os(var) {
            dirs.push(PathBuf::from(v).join("platform-tools"));
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(PathBuf::from(home).join("Android/Sdk/platform-tools"));
    }
    dirs.push(PathBuf::from("/usr/lib/android-sdk/platform-tools"));
    dirs.push(PathBuf::from("/opt/android-sdk/platform-tools"));
    dirs
}

/// Public wrapper (used by `check_tool_path`).
pub fn is_executable_file_check(p: &str) -> bool {
    is_executable_file(Path::new(p))
}

fn is_executable_file(p: &Path) -> bool {
    let Ok(md) = std::fs::metadata(p) else {
        return false;
    };
    if !md.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        md.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    let pathvar = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&pathvar) {
        let cand = dir.join(name);
        if is_executable_file(&cand) {
            return Some(cand);
        }
    }
    None
}

/// Returns (path, source) where source is one of
/// "manual" | "path" | "android_home" | "sdk".
pub fn find_tool(
    kind: &ToolKind,
    manual: Option<&str>,
    dirs: &[PathBuf],
) -> (Option<PathBuf>, Option<String>) {
    let name = kind.as_str();
    if let Some(m) = manual {
        let p = Path::new(m);
        if is_executable_file(p) {
            return (Some(p.to_path_buf()), Some("manual".into()));
        }
    }
    if let Some(p) = find_in_path(name) {
        return (Some(p), Some("path".into()));
    }
    if *kind == ToolKind::Scrcpy {
        if let Some(p) = find_scrcpy_download() {
            return (Some(p), Some("download".into()));
        }
    }
    for dir in dirs {
        let cand = dir.join(name);
        if is_executable_file(&cand) {
            return (Some(cand), Some("sdk".into()));
        }
    }
    (None, None)
}

/// Finds the official Linux archive/AppImage when it was downloaded but not
/// installed into PATH. This scans only ~/Downloads and one directory level.
fn find_scrcpy_download() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    let downloads = home.join("Downloads");
    for entry in std::fs::read_dir(downloads).ok()?.flatten() {
        let path = entry.path();
        let name = path.file_name()?.to_string_lossy().to_lowercase();
        if path.is_file() && name.starts_with("scrcpy") && is_executable_file(&path) {
            return Some(path);
        }
        if path.is_dir() && name.starts_with("scrcpy") {
            let binary = path.join("scrcpy");
            if is_executable_file(&binary) {
                return Some(binary);
            }
        }
    }
    None
}

fn fetch_version(path: &str, kind: &ToolKind) -> Option<String> {
    let args: Vec<String> = kind.version_args().iter().map(|s| s.to_string()).collect();
    let out = run_captured(path, &args, Duration::from_secs(5)).ok()?;
    if out.timed_out {
        return None;
    }
    let text = format!("{} {}", out.text(), out.stderr);
    text.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .map(|l| l.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_tool_manual_wins_when_valid() {
        let (p, source) = find_tool(&ToolKind::Adb, Some("/bin/sh"), &[]);
        assert!(p.is_some());
        assert_eq!(source.as_deref(), Some("manual"));
    }

    #[test]
    fn find_tool_rejects_bad_manual() {
        let (p, _) = find_tool(&ToolKind::Adb, Some("/nonexistent/nope"), &[]);
        // /bin/sh is not named adb, PATH won't have adb in this sandbox:
        // either way, the bad manual path must not be used.
        assert!(
            p.as_ref()
                .map(|x| x.file_name().unwrap().to_string_lossy().to_string())
                != Some("nope".to_string())
        );
    }

    #[test]
    fn version_of_known_tool() {
        let v = fetch_version("/bin/sh", &ToolKind::Adb);
        // sh runs the args `version` as a command (fails) -> None or a line;
        // just ensure no panic and an Option is returned.
        let _ = v;
    }

    #[test]
    fn set_manual_validates_executable() {
        let m = ToolManager::new();
        assert!(m.set_manual(ToolKind::Adb, Some("/bin/sh")).is_ok());
        assert!(m
            .set_manual(ToolKind::Adb, Some("/nonexistent/xyz"))
            .is_err());
        assert!(m.set_manual(ToolKind::Adb, None).is_ok());
    }
}
