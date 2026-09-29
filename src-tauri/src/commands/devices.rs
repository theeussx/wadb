//! Device commands (spec §10–13, §31–35).

use tauri::State;

use crate::adb::operations::{DeviceOperation, RebootTarget};
use crate::devices;
use crate::error::{AppError, ErrorCode};

use super::{blocking, execute_op, join, AppState, OpResult};

/// `adb devices -l` — the main discovery call.
#[tauri::command]
pub async fn list_devices(state: State<'_, AppState>) -> Result<Vec<devices::Device>, AppError> {
    let st = state.inner().clone();
    let adb = st.adb()?;
    let h = blocking(move || devices::list_devices(&adb));
    let list = join(h).await?;
    st.history.record(&list);
    Ok(list)
}

#[tauri::command]
pub async fn get_device_info(
    state: State<'_, AppState>,
    serial: Option<String>,
) -> Result<devices::DeviceInfo, AppError> {
    let st = state.inner().clone();
    let adb = st.adb()?;
    let serial = match serial {
        Some(s) => {
            crate::security::validate_serial(&s)?;
            s
        }
        None => {
            let devices = devices::list_devices(&adb)?;
            devices::resolve_serial(None, &devices)?
        }
    };
    let h = blocking(move || devices::get_device_info(&adb, &serial));
    join(h).await
}

#[tauri::command]
pub async fn get_battery(
    state: State<'_, AppState>,
    serial: Option<String>,
) -> Result<crate::adb::parse::BatteryInfo, AppError> {
    let st = state.inner().clone();
    let adb = st.adb()?;
    let serial = match serial {
        Some(s) => {
            crate::security::validate_serial(&s)?;
            s
        }
        None => {
            let devices = devices::list_devices(&adb)?;
            devices::resolve_serial(None, &devices)?
        }
    };
    let h = blocking(move || devices::get_battery(&adb, &serial));
    join(h).await
}

#[tauri::command]
pub async fn get_storage(
    state: State<'_, AppState>,
    serial: Option<String>,
) -> Result<crate::adb::parse::DiskUsage, AppError> {
    let st = state.inner().clone();
    let adb = st.adb()?;
    let serial = match serial {
        Some(s) => {
            crate::security::validate_serial(&s)?;
            s
        }
        None => {
            let devices = devices::list_devices(&adb)?;
            devices::resolve_serial(None, &devices)?
        }
    };
    let h = blocking(move || devices::get_storage(&adb, &serial));
    join(h).await
}

#[tauri::command]
pub async fn get_network_info(
    state: State<'_, AppState>,
    serial: Option<String>,
) -> Result<devices::NetworkInfo, AppError> {
    let st = state.inner().clone();
    let adb = st.adb()?;
    let serial = match serial {
        Some(s) => {
            crate::security::validate_serial(&s)?;
            s
        }
        None => {
            let devices = devices::list_devices(&adb)?;
            devices::resolve_serial(None, &devices)?
        }
    };
    let h = blocking(move || devices::get_network_info(&adb, &serial));
    join(h).await
}

#[tauri::command]
pub async fn get_device_props(
    state: State<'_, AppState>,
    serial: Option<String>,
) -> Result<std::collections::BTreeMap<String, String>, AppError> {
    let st = state.inner().clone();
    let adb = st.adb()?;
    let serial = match serial {
        Some(s) => {
            crate::security::validate_serial(&s)?;
            s
        }
        None => {
            let devices = devices::list_devices(&adb)?;
            devices::resolve_serial(None, &devices)?
        }
    };
    let h = blocking(move || devices::get_props(&adb, &serial));
    join(h).await
}

/// ADB over Wi-Fi — only explicit user-provided addresses (spec §35).
#[tauri::command]
pub async fn adb_connect(
    state: State<'_, AppState>,
    host: String,
    port: u16,
) -> Result<String, AppError> {
    let st = state.inner().clone();
    let adb = st.adb()?;
    let h = blocking(move || devices::adb_connect(&adb, &host, port));
    join(h).await
}

#[tauri::command]
pub async fn adb_disconnect(
    state: State<'_, AppState>,
    host: String,
    port: u16,
) -> Result<String, AppError> {
    let st = state.inner().clone();
    let adb = st.adb()?;
    let h = blocking(move || devices::adb_disconnect(&adb, &host, port));
    join(h).await
}

/// Reboot requires the typed word REINICIAR (spec §53).
#[tauri::command]
pub async fn reboot_device(
    state: State<'_, AppState>,
    serial: Option<String>,
    target: String,
    confirmation: String,
) -> Result<OpResult, AppError> {
    let st = state.inner().clone();
    let target = match target.as_str() {
        "system" => RebootTarget::System,
        "bootloader" => RebootTarget::Bootloader,
        "recovery" => RebootTarget::Recovery,
        "sideload" => RebootTarget::Sideload,
        _ => {
            return Err(AppError::new(
                ErrorCode::InvalidArgument,
                format!("invalid reboot target: {target}"),
            ))
        }
    };
    execute_op(
        st,
        serial,
        DeviceOperation::Reboot { target },
        Some(confirmation),
    )
    .await
}
