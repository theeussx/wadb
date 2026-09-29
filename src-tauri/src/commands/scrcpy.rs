//! scrcpy commands (spec §8, §14, §17).

use std::sync::Arc;

use tauri::AppHandle;
use tauri::Emitter;
use tauri::State;

use crate::adb::ToolKind;
use crate::error::{AppError, ErrorCode};
use crate::processes::spawn_streamed;
use crate::scrcpy::{ScrcpyOptions, ScrcpyStatus};

use super::{media, AppState};

const SCRCPY_ID: &str = "scrcpy";

#[tauri::command]
pub fn scrcpy_start(
    app: AppHandle,
    state: State<'_, AppState>,
    serial: String,
    options: ScrcpyOptions,
) -> Result<ScrcpyStatus, AppError> {
    let st = state.inner().clone();
    let s = st.settings.load();
    let scrcpy_bin = st
        .tools
        .require(ToolKind::Scrcpy, s.scrcpy_path.as_deref())?;

    if st.registry.is_running(SCRCPY_ID) {
        return Err(AppError::new(
            ErrorCode::AlreadyRunning,
            "scrcpy is already running",
        ));
    }

    let mut opts = options;
    if let Some(preset) = opts.preset.clone() {
        opts.apply_preset(&preset);
    }
    opts.validate()?;
    let args = opts.to_args(&serial)?;

    let recording = opts.record_path.is_some();

    // Stream scrcpy's log lines to the UI (it prints errors like
    // "ERROR: unable to find the device" on stderr).
    let emitter = app.clone();
    let serial_for_event = serial.clone();
    let on_line = move |line: String| {
        let _ = emitter.emit(
            "scrcpy-log",
            serde_json::json!({ "serial": serial_for_event, "line": line }),
        );
    };

    let label = format!("scrcpy -s {serial}");
    let handle = spawn_streamed(&scrcpy_bin, &args, &label, false, Arc::new(on_line))?;
    st.registry.add(SCRCPY_ID, handle);
    st.log.info(&format!("scrcpy started: {}", args.join(" ")));

    Ok(ScrcpyStatus {
        running: true,
        pid: st.registry.status(SCRCPY_ID).1,
        recording,
    })
}

#[tauri::command]
pub fn scrcpy_stop(state: State<'_, AppState>) -> Result<ScrcpyStatus, AppError> {
    let st = state.inner().clone();
    if st.registry.is_running(SCRCPY_ID) {
        st.registry.stop(SCRCPY_ID)?;
        st.log.info("scrcpy stopped");
    }
    Ok(ScrcpyStatus {
        running: false,
        pid: None,
        recording: false,
    })
}

#[tauri::command]
pub fn scrcpy_status(state: State<'_, AppState>) -> Result<ScrcpyStatus, AppError> {
    let st = state.inner().clone();
    let (running, pid) = st.registry.status(SCRCPY_ID);
    let recording = st.registry.get(SCRCPY_ID).map(|_| false).unwrap_or(false);
    Ok(ScrcpyStatus {
        running,
        pid,
        recording,
    })
}

/// Resolves (and creates) the recording directory for the UI to prefill.
#[tauri::command]
pub fn recording_dir_cmd(state: State<'_, AppState>) -> Result<String, AppError> {
    let st = state.inner().clone();
    Ok(media::recording_dir(&st).to_string_lossy().to_string())
}

/// Suggested recording file: never overwrites (spec §16 principle).
#[tauri::command]
pub fn recording_filename(state: State<'_, AppState>) -> Result<String, AppError> {
    let st = state.inner().clone();
    let dir = media::recording_dir(&st);
    std::fs::create_dir_all(&dir)?;
    let ts = chrono::Local::now().format("%Y-%m-%d-%H%M%S");
    let mut name = format!("recording-{ts}.mp4");
    if dir.join(&name).exists() {
        for i in 1..100 {
            let alt = format!("recording-{ts}-{i}.mp4");
            if !dir.join(&alt).exists() {
                name = alt;
                break;
            }
        }
    }
    Ok(dir.join(name).to_string_lossy().to_string())
}
