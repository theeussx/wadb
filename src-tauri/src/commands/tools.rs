//! Tool discovery commands (spec §7–9).

use tauri::State;

use crate::adb::{ToolKind, ToolStatus};
use crate::error::AppError;

use super::AppState;

/// Detects adb/scrcpy/fastboot (manual override → PATH → SDK dirs).
#[tauri::command]
pub fn detect_tools(state: State<'_, AppState>) -> Result<Vec<ToolStatus>, AppError> {
    let st = state.inner().clone();
    let s = st.settings.load();
    let statuses = st.tools.detect(
        s.adb_path.as_deref(),
        s.scrcpy_path.as_deref(),
        s.fastboot_path.as_deref(),
    );
    st.log.info(&format!(
        "detect: adb={} scrcpy={} fastboot={}",
        statuses
            .iter()
            .find(|t| t.name == "adb")
            .map(|t| t.found)
            .unwrap_or(false),
        statuses
            .iter()
            .find(|t| t.name == "scrcpy")
            .map(|t| t.found)
            .unwrap_or(false),
        statuses
            .iter()
            .find(|t| t.name == "fastboot")
            .map(|t| t.found)
            .unwrap_or(false),
    ));
    Ok(statuses)
}

/// Validates and persists a manual tool path, then re-detects.
#[tauri::command]
pub fn set_tool_path(
    state: State<'_, AppState>,
    tool: String,
    path: Option<String>,
) -> Result<Vec<ToolStatus>, AppError> {
    let st = state.inner().clone();
    let kind = match tool.as_str() {
        "adb" => ToolKind::Adb,
        "scrcpy" => ToolKind::Scrcpy,
        "fastboot" => ToolKind::Fastboot,
        _ => {
            return Err(AppError::new(
                crate::error::ErrorCode::InvalidArgument,
                format!("unknown tool: {tool}"),
            ))
        }
    };

    let mut s = st.settings.load();
    st.tools.set_manual(kind, path.as_deref())?;
    match kind {
        ToolKind::Adb => s.adb_path = path,
        ToolKind::Scrcpy => s.scrcpy_path = path,
        ToolKind::Fastboot => s.fastboot_path = path,
    }
    st.settings.save(&s)?;
    st.tools.clear_cache();
    Ok(detect_tools_inner(&st))
}

#[tauri::command]
pub fn check_tool_path(state: State<'_, AppState>, path: String) -> Result<bool, AppError> {
    let _ = state;
    Ok(crate::adb::is_executable_file_check(&path))
}

fn detect_tools_inner(st: &AppState) -> Vec<ToolStatus> {
    let s = st.settings.load();
    st.tools.detect(
        s.adb_path.as_deref(),
        s.scrcpy_path.as_deref(),
        s.fastboot_path.as_deref(),
    )
}
