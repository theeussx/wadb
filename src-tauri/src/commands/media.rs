//! Screenshots + file dialogs + clipboard (spec §16).

use std::path::PathBuf;

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::error::{AppError, ErrorCode};
use crate::processes::run_captured;

use super::{blocking, join, AppState};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotResult {
    pub path: String,
    pub size_bytes: u64,
}

/// Default screenshot dir: <screenshot_dir setting> | ~/Pictures/ADB Studio
/// | ~/Pictures | ~/Downloads.
fn screenshot_dir(st: &AppState) -> PathBuf {
    let s = st.settings.load();
    if let Some(p) = s.screenshot_dir {
        return PathBuf::from(p);
    }
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        let pictures = home.join("Pictures");
        if pictures.is_dir() {
            let sub = pictures.join("ADB Studio");
            let _ = std::fs::create_dir_all(&sub);
            return sub;
        }
        return home.join("Downloads");
    }
    std::env::temp_dir()
}

fn default_dir_from_setting(setting: Option<&str>, name: &str) -> PathBuf {
    if let Some(p) = setting {
        return PathBuf::from(p);
    }
    if let Some(home) = std::env::var_os("HOME") {
        let base = PathBuf::from(home).join(name);
        let _ = std::fs::create_dir_all(&base);
        return base;
    }
    std::env::temp_dir()
}

pub fn recording_dir(st: &AppState) -> PathBuf {
    default_dir_from_setting(st.settings.load().recording_dir.as_deref(), "Videos/ADB Studio")
}

pub fn download_dir(st: &AppState) -> PathBuf {
    default_dir_from_setting(st.settings.load().download_dir.as_deref(), "Downloads/ADB Studio")
}

/// Takes a screenshot.
///
/// - Never overwrites an existing file without `force` (spec §16).
/// - Auto name: `screenshot-2026-09-23-142501.png` (local time).
#[tauri::command]
pub async fn screenshot(
    state: tauri::State<'_, AppState>,
    serial: Option<String>,
    force: bool,
) -> Result<ScreenshotResult, AppError> {
    let st = state.inner().clone();
    let adb = st.adb()?;

    let serial = match serial {
        Some(s) => {
            crate::security::validate_serial(&s)?;
            s
        }
        None => {
            let devices = crate::devices::list_devices(&adb)?;
            crate::devices::resolve_serial(None, &devices)?
        }
    };

    // 1. Capture bytes (binary stdout).
    let bytes = {
        let h = blocking(move || crate::devices::screenshot_bytes(&adb, &serial));
        join(h).await?
    };

    // 2. Choose destination.
    let dir = screenshot_dir(&st);
    std::fs::create_dir_all(&dir)?;
    let ts = chrono::Local::now().format("%Y-%m-%d-%H%M%S");
    let mut path = dir.join(format!("screenshot-{ts}.png"));
    if path.exists() && !force {
        return Err(AppError::new(
            ErrorCode::FileExists,
            format!("file exists: {}", path.display()),
        ));
    }
    if path.exists() && force {
        // Disambiguate even with force so nothing is silently lost.
        for i in 1..100 {
            let alt = dir.join(format!("screenshot-{ts}-{i}.png"));
            if !alt.exists() {
                path = alt;
                break;
            }
        }
    }

    std::fs::write(&path, &bytes)?;
    Ok(ScreenshotResult {
        path: path.to_string_lossy().to_string(),
        size_bytes: bytes.len() as u64,
    })
}

/// Native file picker (Tauri dialog plugin). kind: "apk" | "file" | "directory"
#[tauri::command]
pub fn pick_path(app: AppHandle, kind: String) -> Result<Option<String>, AppError> {
    let picked = match kind.as_str() {
        "directory" => app.dialog().file().blocking_pick_folder(),
        _ => app.dialog().file().blocking_pick_file(),
    };
    // `FilePath` is an enum (`Path` | `Url`): prefer the filesystem path and
    // fall back to its display form (URLs only happen on mobile targets).
    Ok(picked.map(|p| {
        p.as_path()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_else(|| p.to_string())
    }))
}

/// Opens a file/folder with the system handler (xdg-open).
#[tauri::command]
pub fn open_path(path: String) -> Result<(), AppError> {
    crate::security::validate_local_path(&path)?;
    std::process::Command::new("xdg-open")
        .arg(&path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| AppError::new(ErrorCode::ToolLaunchFailed, format!("xdg-open: {e}")))?;
    Ok(())
}

/// Copies a PNG to the X11/Wayland clipboard when a supporting tool exists.
/// We probe for tools; we never assume one is installed (spec §32 honesty).
#[tauri::command]
pub fn copy_image_to_clipboard(path: String) -> Result<(), AppError> {
    crate::security::validate_local_path(&path)?;
    if !std::path::Path::new(&path).exists() {
        return Err(AppError::new(
            ErrorCode::FileNotFound,
            format!("not found: {path}"),
        ));
    }
    let attempts: Vec<Vec<String>> = vec![
        vec![
            "wl-copy".into(),
            "--type".into(),
            "image/png".into(),
            path.clone(),
        ],
        vec![
            "xclip".into(),
            "-selection".into(),
            "clipboard".into(),
            "-t".into(),
            "image/png".into(),
            "-i".into(),
            path.clone(),
        ],
    ];

    let mut last_err = String::new();
    for args in attempts.iter() {
        let exe = args.first().cloned().unwrap_or_default();
        let rest: Vec<String> = args[1..].to_vec();
        let out = run_captured(&exe, &rest, std::time::Duration::from_secs(5));
        match out {
            Ok(c) if c.exit_code == 0 => return Ok(()),
            Ok(c) => last_err = c.stderr.trim().to_string(),
            Err(e) => last_err = e.details.clone(),
        }
    }
    Err(AppError::new(
        ErrorCode::Unsupported,
        format!(
            "clipboard image support not found (try installing xclip or wl-clipboard). {last_err}"
        ),
    ))
}
