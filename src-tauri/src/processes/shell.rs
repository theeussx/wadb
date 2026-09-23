//! Interactive ADB shell sessions (spec §24–25).
//!
//! Security model: the host process is always exactly
//! `adb -s <validated-serial> shell`. User input is written to the child's
//! stdin — it is never concatenated into the host command line, so the
//! frontend cannot inject arguments into adb itself.
//!
//! Multiple sessions are supported; every session is killed on close and on
//! app exit (no orphans).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::error::{AppError, ErrorCode};
use crate::security::validate_serial;

use super::{spawn_streamed, StreamHandle};

pub struct ShellSession {
    pub id: String,
    pub serial: String,
    pub handle: Arc<StreamHandle>,
}

pub struct ShellManager {
    sessions: Mutex<HashMap<String, Arc<StreamHandle>>>,
    serials: Mutex<HashMap<String, String>>,
    counter: Mutex<u32>,
}

impl ShellManager {
    pub fn new() -> ShellManager {
        ShellManager {
            sessions: Mutex::new(HashMap::new()),
            serials: Mutex::new(HashMap::new()),
            counter: Mutex::new(0),
        }
    }

    pub fn next_id(&self) -> String {
        let mut c = self.counter.lock().unwrap();
        *c += 1;
        format!("sh{}", *c)
    }

    /// Opens `adb -s <serial> shell` as a long-lived process.
    pub fn open(
        &self,
        id: &str,
        adb: &str,
        serial: &str,
        on_line: Box<dyn Fn(String) + Send + Sync + 'static>,
    ) -> Result<Arc<StreamHandle>, AppError> {
        validate_serial(serial)?;
        if self.sessions.lock().unwrap().contains_key(id) {
            return Err(AppError::new(ErrorCode::AlreadyRunning, format!("session {id} exists")));
        }

        let args = vec![
            "-s".to_string(),
            serial.to_string(),
            "shell".to_string(),
        ];
        let handle =
            spawn_streamed(adb, &args, &format!("adb -s {serial} shell"), true, on_line)?;

        self.sessions.lock().unwrap().insert(id.to_string(), handle.clone());
        self.serials.lock().unwrap().insert(id.to_string(), serial.to_string());
        Ok(handle)
    }

    pub fn write(&self, id: &str, data: &str) -> Result<(), AppError> {
        let guard = self.sessions.lock().unwrap();
        let Some(handle) = guard.get(id) else {
            return Err(AppError::new(ErrorCode::FileNotFound, format!("no shell session '{id}'")));
        };
        handle.write(data)
    }

    pub fn close(&self, id: &str) -> Result<(), AppError> {
        let handle = self
            .sessions
            .lock()
            .unwrap()
            .remove(id)
            .ok_or_else(|| AppError::new(ErrorCode::FileNotFound, format!("no shell session '{id}'")))?;
        self.serials.lock().unwrap().remove(id);
        handle.stop();
        Ok(())
    }

    pub fn list(&self) -> Vec<ShellSession> {
        let sessions = self.sessions.lock().unwrap();
        let serials = self.serials.lock().unwrap();
        sessions
            .iter()
            .filter_map(|(id, handle)| {
                Some(ShellSession {
                    id: id.clone(),
                    serial: serials.get(id).cloned().unwrap_or_default(),
                    handle: handle.clone(),
                })
            })
            .collect()
    }

    pub fn stop_all(&self) {
        for (_, handle) in self.sessions.lock().unwrap().drain() {
            handle.stop();
        }
        self.serials.lock().unwrap().clear();
    }
}

impl Drop for ShellManager {
    fn drop(&mut self) {
        self.stop_all();
    }
}

impl Default for ShellManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_serial() {
        let m = ShellManager::new();
        let on_line = |_l: String| {};
        let err = m
            .open("sh1", "/bin/echo", "bad;rm -rf /", Box::new(on_line))
            .expect_err("invalid serial must be rejected");
        assert_eq!(err.code, ErrorCode::InvalidSerial);
    }

    #[test]
    fn rejects_shell_metachars_in_serial() {
        let m = ShellManager::new();
        for bad in ["a b", "a|b", "a&b", "$(x)", "`x`", "a\nb", "a/b"] {
            let on_line = |_l: String| {};
            let err = m
                .open("shX", "/bin/echo", bad, Box::new(on_line))
                .expect_err("must reject");
            assert_eq!(err.code, ErrorCode::InvalidSerial, "serial {bad:?} accepted?");
        }
    }

    #[test]
    fn closes_sessions() {
        let m = ShellManager::new();
        let on_line = |_l: String| {};
        // /bin/cat with stdin as a stand-in for `adb shell` (same shape:
        // writes go to stdin, output comes on stdout).
        let h = m.open("sh1", "/bin/cat", "192.168.1.50:5555", Box::new(on_line)).unwrap();
        m.write("sh1", "hi\n").unwrap();
        assert_eq!(m.list().len(), 1);
        m.close("sh1").unwrap();
        assert_eq!(m.list().len(), 0);
        let err = m.write("sh1", "x").expect_err("gone");
        assert_eq!(err.code, ErrorCode::FileNotFound);
        drop(h);
    }
}
