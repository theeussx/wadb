use serde::Serialize;
use std::fmt;

/// Stable machine-readable error codes.
///
/// The frontend maps each code to a localized, human friendly message and
/// keeps `details` available behind "Ver detalhes técnicos". This keeps the
/// Rust layer 100% language neutral (i18n is a frontend concern).
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    AdbNotFound,
    ToolNotFound,
    ToolLaunchFailed,
    NoDevice,
    AmbiguousDevice,
    DeviceUnreachable,
    DeviceUnauthorized,
    DeviceOffline,
    Timeout,
    Cancelled,
    InvalidSerial,
    InvalidPath,
    InvalidPackage,
    InvalidArgument,
    ConfirmationRequired,
    FileExists,
    FileNotFound,
    AlreadyRunning,
    OperationRejected,
    ProcessFailed,
    Unsupported,
    Unexpected,
}

/// Structured error returned to the frontend.
///
/// Serialized by Tauri as `{ "code": "...", "details": "..." }`.
#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: ErrorCode,
    pub details: String,
}

impl AppError {
    pub fn new(code: ErrorCode, details: impl Into<String>) -> Self {
        Self {
            code,
            details: details.into(),
        }
    }

    pub fn with_details(code: ErrorCode, details: impl fmt::Display) -> Self {
        Self::new(code, details.to_string())
    }

    /// Builds an error from a failed process, inferring the most likely
    /// cause from adb's stderr so the UI can show an actionable message.
    pub fn from_process(code: ErrorCode, executable: &str, output: &crate::processes::Captured) -> Self {
        let stderr = output.stderr.to_lowercase();
        let inferred = if stderr.contains("unauthorized")
            || stderr.contains("check the confirmation dialog on your device")
        {
            ErrorCode::DeviceUnauthorized
        } else if stderr.contains("no devices/emulators found")
            || stderr.contains("cannot connect to daemon")
            || stderr.contains("no devices")
        {
            ErrorCode::NoDevice
        } else if stderr.contains("device offline") || stderr.contains("offline") {
            ErrorCode::DeviceOffline
        } else if stderr.contains("device '") && stderr.contains("not found") {
            ErrorCode::NoDevice
        } else if stderr.contains("no permissions") {
            ErrorCode::OperationRejected
        } else {
            code
        };

        let mut details = format!(
            "{} exited with code {} (timeout: {})",
            executable, output.exit_code, output.timed_out
        );
        if !output.stderr.trim().is_empty() {
            details.push_str(&format!(" | stderr: {}", output.stderr.trim()));
        }
        Self::new(inferred, details)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code.as_str(), self.details)
    }
}

impl fmt::Debug for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl ErrorCode {
    pub fn as_str(&self) -> &'static str {
        use ErrorCode::*;
        match self {
            AdbNotFound => "ADB_NOT_FOUND",
            ToolNotFound => "TOOL_NOT_FOUND",
            ToolLaunchFailed => "TOOL_LAUNCH_FAILED",
            NoDevice => "NO_DEVICE",
            AmbiguousDevice => "AMBIGUOUS_DEVICE",
            DeviceUnreachable => "DEVICE_UNREACHABLE",
            DeviceUnauthorized => "DEVICE_UNAUTHORIZED",
            DeviceOffline => "DEVICE_OFFLINE",
            Timeout => "TIMEOUT",
            Cancelled => "CANCELLED",
            InvalidSerial => "INVALID_SERIAL",
            InvalidPath => "INVALID_PATH",
            InvalidPackage => "INVALID_PACKAGE",
            InvalidArgument => "INVALID_ARGUMENT",
            ConfirmationRequired => "CONFIRMATION_REQUIRED",
            FileExists => "FILE_EXISTS",
            FileNotFound => "FILE_NOT_FOUND",
            AlreadyRunning => "ALREADY_RUNNING",
            OperationRejected => "OPERATION_REJECTED",
            ProcessFailed => "PROCESS_FAILED",
            Unsupported => "UNSUPPORTED",
            Unexpected => "UNEXPECTED",
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        let code = match e.kind() {
            std::io::ErrorKind::NotFound => ErrorCode::FileNotFound,
            std::io::ErrorKind::PermissionDenied => ErrorCode::OperationRejected,
            _ => ErrorCode::Unexpected,
        };
        Self::new(code, e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self::new(ErrorCode::Unexpected, format!("json: {e}"))
    }
}
