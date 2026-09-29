//! Logcat stream sessions (spec §29–30).
//!
//! Runs `adb -s <serial> logcat -v threadtime [spec]`. Lines are delivered to
//! the caller; the frontend keeps only a bounded window (e.g. last 5 000
//! lines) so memory stays flat even on chatty devices (spec §29).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::error::{AppError, ErrorCode};
use crate::security::validate_serial;

use super::{spawn_streamed, StreamHandle};

pub struct LogcatManager {
    sessions: Mutex<HashMap<String, Arc<StreamHandle>>>,
    counter: Mutex<u32>,
}

impl LogcatManager {
    pub fn new() -> LogcatManager {
        LogcatManager {
            sessions: Mutex::new(HashMap::new()),
            counter: Mutex::new(0),
        }
    }

    pub fn next_id(&self) -> String {
        let mut c = self.counter.lock().unwrap();
        *c += 1;
        format!("lc{}", *c)
    }

    /// `spec` is an optional validated logcat spec (e.g. `ActivityManager:E`).
    pub fn open(
        &self,
        id: &str,
        adb: &str,
        serial: &str,
        spec: Option<&str>,
        on_line: Arc<dyn Fn(String) + Send + Sync + 'static>,
    ) -> Result<Arc<StreamHandle>, AppError> {
        validate_serial(serial)?;

        let mut args = vec![
            "-s".to_string(),
            serial.to_string(),
            "logcat".to_string(),
            "-v".to_string(),
            "threadtime".to_string(),
        ];
        if let Some(spec) = spec {
            if !validate_logcat_spec(spec)? {
                return Err(AppError::new(
                    ErrorCode::InvalidArgument,
                    format!("bad logcat spec: {spec}"),
                ));
            }
            args.push(spec.to_string());
        }

        let handle = spawn_streamed(
            adb,
            &args,
            &format!("adb -s {serial} logcat"),
            false,
            on_line,
        )?;
        self.sessions
            .lock()
            .unwrap()
            .insert(id.to_string(), Arc::clone(&handle));
        Ok(handle)
    }

    pub fn stop(&self, id: &str) -> Result<(), AppError> {
        let handle = self.sessions.lock().unwrap().remove(id).ok_or_else(|| {
            AppError::new(ErrorCode::FileNotFound, format!("no logcat session '{id}'"))
        })?;
        handle.stop();
        Ok(())
    }

    pub fn list(&self) -> Vec<String> {
        self.sessions.lock().unwrap().keys().cloned().collect()
    }

    pub fn stop_all(&self) {
        for (_, handle) in self.sessions.lock().unwrap().drain() {
            handle.stop();
        }
    }
}

impl Drop for LogcatManager {
    fn drop(&mut self) {
        self.stop_all();
    }
}

impl Default for LogcatManager {
    fn default() -> Self {
        Self::new()
    }
}

/// A logcat spec is `TAG:PRIORITY` or just `TAG`.
/// Allowed characters: alphanumerics, `._*` plus `:` and the priority letters.
pub fn validate_logcat_spec(spec: &str) -> Result<bool, AppError> {
    if spec.is_empty() || spec.len() > 128 {
        return Ok(false);
    }
    let allowed = spec
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '*' | ':' | '-'));
    if !allowed {
        return Ok(false);
    }
    if let Some(tag) = spec.split_once(':').map(|(t, _)| t) {
        // tag must not be empty and must not start with '-' (option injection)
        if tag.is_empty() || tag.starts_with('-') {
            return Ok(false);
        }
    } else if spec.starts_with('-') {
        return Ok(false);
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spec_validation() {
        assert!(validate_logcat_spec("ActivityManager").unwrap());
        assert!(validate_logcat_spec("USB:W").unwrap());
        assert!(validate_logcat_spec("Camera.*:E").unwrap());
        assert!(!validate_logcat_spec("").unwrap());
        assert!(!validate_logcat_spec(":E").unwrap());
        assert!(!validate_logcat_spec("-v").unwrap());
        assert!(!validate_logcat_spec("a b").unwrap());
        assert!(!validate_logcat_spec("a|b").unwrap());
    }

    #[test]
    fn serial_validation_blocks_injection() {
        let m = LogcatManager::new();
        let on_line = |_l: String| {};
        let err = m
            .open("lc1", "/bin/echo", "x;reboot", None, Arc::new(on_line))
            .expect_err("must reject");
        assert_eq!(err.code, ErrorCode::InvalidSerial);
    }
}
