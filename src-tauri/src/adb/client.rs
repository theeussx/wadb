//! Thin, safe wrapper around the official `adb` binary.
//!
//! Every call is `executable + arguments[]` — there is no `sh -c` anywhere.
//! Blocking runs are meant to be called from `spawn_blocking`.

use std::time::Duration;

use crate::error::{AppError, ErrorCode};
use crate::processes::{run_captured, Captured};

/// Default timeouts (kept conservative so a stuck device never hangs the UI).
pub const TIMEOUT_DEVICE: Duration = Duration::from_secs(15);
pub const TIMEOUT_PROPS: Duration = Duration::from_secs(30);
pub const TIMEOUT_DUMP: Duration = Duration::from_secs(60);
pub const TIMEOUT_INSTALL: Duration = Duration::from_secs(600);
pub const TIMEOUT_MEDIA: Duration = Duration::from_secs(30);

pub struct AdbClient<'a> {
    adb: &'a str,
}

impl<'a> AdbClient<'a> {
    pub fn new(adb: &'a str) -> AdbClient<'a> {
        AdbClient { adb }
    }

    pub fn adb(&self) -> &'a str {
        self.adb
    }

    /// Runs adb with the given args, capturing output, with a timeout.
    pub fn run(&self, args: Vec<String>, timeout: Duration) -> Result<Captured, AppError> {
        run_captured(self.adb, &args, timeout)
    }

    /// Runs an adb command and fails with a structured error on non-zero exit.
    pub fn run_ok(&self, args: Vec<String>, timeout: Duration) -> Result<String, AppError> {
        let out = self.run(args.clone(), timeout)?;
        if out.timed_out {
            return Err(AppError::new(
                ErrorCode::Timeout,
                format!("{} timed out after {}s", self.adb, timeout.as_secs()),
            ));
        }
        if out.exit_code != 0 {
            return Err(AppError::from_process(
                ErrorCode::ProcessFailed,
                self.adb,
                &out,
            ));
        }
        Ok(out.text())
    }

    /// Runs a single *device-side* shell command.
    ///
    /// `cmd` must be built by the operation allowlist
    /// (`crate::adb::operations`) — never raw user input.
    pub fn run_shell(&self, serial: &str, cmd: &str) -> Result<Captured, AppError> {
        crate::security::validate_serial(serial)?;
        let args = vec![
            "-s".to_string(),
            serial.to_string(),
            "shell".to_string(),
            cmd.to_string(),
        ];
        self.run(args, TIMEOUT_DEVICE)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Uses `echo` as a stand-in adb: same calling shape (argv vector).
    #[test]
    fn run_ok_success_and_failure() {
        let c = AdbClient::new("/bin/echo");
        let out = c
            .run_ok(vec!["-s".into(), "X".into(), "hello".into()], Duration::from_secs(5))
            .expect("echo should succeed");
        assert_eq!(out.trim(), "hello");

        // sh exit 1 must surface as ProcessFailed (or inferred code).
        let c2 = AdbClient::new("/bin/sh");
        let err = c2
            .run_ok(vec!["-c".into(), "exit 1".into()], Duration::from_secs(5))
            .expect_err("should fail");
        assert!(
            matches!(
                err.code,
                ErrorCode::ProcessFailed | ErrorCode::OperationRejected
            )
        );
    }

    #[test]
    fn run_shell_validates_serial() {
        let c = AdbClient::new("/bin/echo");
        let err = c
            .run_shell("bad;serial", "getprop")
            .expect_err("must reject serial");
        assert_eq!(err.code, ErrorCode::InvalidSerial);
    }
}
