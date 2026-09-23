//! Logcat commands (spec §29–30).
//!
//! The backend streams lines; the frontend keeps a bounded window
//! (settings.logcat_max_lines, default 5 000) so memory stays flat.

use tauri::AppHandle;
use tauri::Emitter;
use tauri::State;

use crate::processes::validate_logcat_spec;

use super::AppState;

/// Starts a logcat stream. Emits `logcat-line`: `{ "session", "line" }`.
///
/// `spec` is an optional validated tag filter (e.g. "Camera" or "Camera:E").
#[tauri::command]
pub fn logcat_start(
    app: AppHandle,
    state: State<'_, AppState>,
    serial: String,
    spec: Option<String>,
) -> Result<String, AppError> {
    let st = state.inner().clone();
    let adb = st.adb()?;
    let id = st.logcat_mgr.next_id();

    if let Some(s) = &spec {
        if !validate_logcat_spec(s)? {
            return Err(crate::error::AppError::new(
                crate::error::ErrorCode::InvalidArgument,
                format!("invalid logcat spec: {s}"),
            ));
        }
    }

    let emitter = app.clone();
    let id_for_event = id.clone();
    let on_line = move |line: String| {
        let _ = emitter.emit(
            "logcat-line",
            serde_json::json!({ "session": id_for_event, "line": line }),
        );
    };

    let spec_ref = spec.as_deref();
    st.logcat_mgr
        .open(&id, &adb, &serial, spec_ref, Box::new(on_line))?;
    st.log.info(&format!("logcat session {id} started for {serial}"));
    Ok(id)
}

#[tauri::command]
pub fn logcat_stop(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let st = state.inner().clone();
    st.logcat_mgr.stop(&id)
}

#[tauri::command]
pub fn logcat_list(state: State<'_, AppState>) -> Result<Vec<String>, AppError> {
    let st = state.inner().clone();
    Ok(st.logcat_mgr.list())
}

/// Saves the user-selected log text to a local file (explicit user action;
/// the path is validated).
#[tauri::command]
pub fn save_log_file(path: String, content: String) -> Result<(), AppError> {
    crate::security::validate_local_path(&path)?;
    let p = std::path::Path::new(&path);
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(p, content)?;
    Ok(())
}
