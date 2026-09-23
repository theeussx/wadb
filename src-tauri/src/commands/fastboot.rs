//! Fastboot commands (spec §52–53).

use tauri::State;

use crate::adb::ToolKind;
use crate::error::{AppError, ErrorCode};
use crate::fastboot::{self, FastbootOperation};

use super::{blocking, join, AppState, OpResult};

#[tauri::command]
pub async fn fastboot_devices(
    state: State<'_, AppState>,
) -> Result<Vec<fastboot::FastbootDevice>, AppError> {
    let st = state.inner().clone();
    let s = st.settings.load();
    let fastboot = st
        .tools
        .require(ToolKind::Fastboot, s.fastboot_path.as_deref())?;
    let h = blocking(move || fastboot::list_devices(&fastboot));
    join(h).await
}

/// Executes a fastboot operation. Destructive ops (flash/erase/unlock/lock)
/// require the typed confirmation word — one click is never enough.
#[tauri::command]
pub async fn fastboot_execute(
    state: State<'_, AppState>,
    op: FastbootOperation,
    confirmation: Option<String>,
) -> Result<OpResult, AppError> {
    let st = state.inner().clone();
    let s = st.settings.load();
    let fastboot_bin = st
        .tools
        .require(ToolKind::Fastboot, s.fastboot_path.as_deref())?;

    if op.is_destructive() {
        let required = op
            .required_confirmation()
            .expect("destructive fastboot ops define a confirmation word");
        match &confirmation {
            Some(c) if c == required => {}
            _ => {
                return Err(AppError::new(
                    ErrorCode::ConfirmationRequired,
                    format!("type {required} to confirm"),
                ))
            }
        }
    }

    let args = op.to_args()?;
    let described = format!("{} {}", fastboot_bin, args.join(" "));
    st.log.info(&format!("fastboot: {}", op.name()));

    let h = blocking(move || op.run(&fastboot_bin));
    let out = join(h).await?;

    let (result_str, code) = if out.success() {
        ("ok".to_string(), None)
    } else {
        (
            format!("error:{}", crate::commands::infer_code(&out).as_str()),
            Some(crate::commands::infer_code(&out).as_str().to_string()),
        )
    };

    st.audit.append(crate::storage::audit::AuditEntry {
        ts: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
        device: None,
        action: op.name().to_string(),
        command: described,
        result: result_str,
        undo: None,
    });

    Ok(OpResult {
        ok: out.success(),
        stdout: out.text(),
        stderr: out.stderr.clone(),
        code,
    })
}
