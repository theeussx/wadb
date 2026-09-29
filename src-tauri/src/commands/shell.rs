//! ADB shell session commands (spec §24–25).
//!
//! The host process is always `adb -s <validated-serial> shell`. User input
//! goes to the child's stdin — it is never part of the host argv.

use std::sync::Arc;

use tauri::AppHandle;
use tauri::Emitter;
use tauri::State;

use serde::Serialize;

use crate::error::AppError;

use super::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellSessionInfo {
    pub id: String,
    pub serial: String,
}

/// Opens a new shell session. Emits `shell-output` events:
/// `{ "session": "<id>", "line": "..." }`.
#[tauri::command]
pub fn shell_open(
    app: AppHandle,
    state: State<'_, AppState>,
    serial: String,
) -> Result<ShellSessionInfo, AppError> {
    let st = state.inner().clone();
    let adb = st.adb()?;
    let id = st.shell_mgr.next_id();

    let emitter = app.clone();
    let id_for_event = id.clone();
    let on_line = move |line: String| {
        let _ = emitter.emit(
            "shell-output",
            serde_json::json!({ "session": id_for_event, "line": line }),
        );
    };

    st.shell_mgr.open(&id, &adb, &serial, Arc::new(on_line))?;
    st.log
        .info(&format!("shell session {id} opened for {serial}"));
    Ok(ShellSessionInfo {
        id,
        serial: serial.clone(),
    })
}

/// Writes user input to the session stdin.
#[tauri::command]
pub fn shell_write(state: State<'_, AppState>, id: String, data: String) -> Result<(), AppError> {
    let st = state.inner().clone();
    st.shell_mgr.write(&id, &data)
}

/// Closes a session (kills the adb shell child).
#[tauri::command]
pub fn shell_close(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let st = state.inner().clone();
    st.shell_mgr.close(&id)?;
    Ok(())
}

#[tauri::command]
pub fn shell_list(state: State<'_, AppState>) -> Result<Vec<ShellSessionInfo>, AppError> {
    let st = state.inner().clone();
    Ok(st
        .shell_mgr
        .list()
        .into_iter()
        .map(|s| ShellSessionInfo {
            id: s.id,
            serial: s.serial,
        })
        .collect())
}

/// Closes every session (used on exit and on "close all").
#[tauri::command]
pub fn shell_close_all(state: State<'_, AppState>) -> Result<u32, AppError> {
    let st = state.inner().clone();
    let ids: Vec<String> = st.shell_mgr.list().into_iter().map(|s| s.id).collect();
    for id in &ids {
        st.shell_mgr.close(id)?;
    }
    Ok(ids.len() as u32)
}
