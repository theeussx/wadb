//! File transfers via `adb push` / `adb pull` (spec §27–28).
//!
//! - adb streams data to/from disk: file contents never sit in our memory.
//! - Progress: for `pull` we poll the growing local file against the remote
//!   size (real numbers). `adb push` does not report progress natively, so it
//!   is shown as an indeterminate operation (we do not fake percentages).
//! - Every transfer can be cancelled; the adb child is killed cleanly.
//! - Jobs are removed from the map once finished (`remove_finished`).

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::error::{AppError, ErrorCode};
use crate::security::{validate_device_path, validate_local_path};

use super::{run_captured, spawn_streamed, StreamHandle};

pub const TRANSFER_TIMEOUT: Duration = Duration::from_secs(3600);

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferEvent {
    pub id: String,
    pub status: String, // running | done | error | cancelled
    pub done_bytes: u64,
    pub total: Option<u64>,
    pub message: String,
}

struct Job {
    kind: String,
    file: String,
    local: std::path::PathBuf,
    total: Option<u64>,
    done: AtomicBool,
    last_line: Mutex<String>,
    handle: Arc<StreamHandle>,
}

pub struct TransferManager {
    jobs: Mutex<HashMap<String, Arc<Job>>>,
    counter: Mutex<u32>,
}

type EventSink = Box<dyn Fn(TransferEvent) + Send + Sync + 'static>;

impl TransferManager {
    pub fn new() -> TransferManager {
        TransferManager {
            jobs: Mutex::new(HashMap::new()),
            counter: Mutex::new(0),
        }
    }

    fn next_id(&self) -> String {
        let mut c = self.counter.lock().unwrap();
        *c += 1;
        format!("tx{}", *c)
    }

    /// Starts `adb -s serial pull remote local`.
    ///
    /// `remote_size` may be `None` (the bar is then indeterminate).
    pub fn start_pull(
        &self,
        adb: &str,
        serial: &str,
        remote: &str,
        local: &Path,
        remote_size: Option<u64>,
        on_event: EventSink,
    ) -> Result<String, AppError> {
        let file = local
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| remote.rsplit('/').next().unwrap_or("?").to_string());

        self.spawn(
            adb,
            serial,
            "pull",
            &file,
            local,
            remote_size,
            vec![remote.to_string(), local.to_string_lossy().to_string()],
            on_event,
        )
    }

    /// Starts `adb -s serial push local remote`.
    pub fn start_push(
        &self,
        adb: &str,
        serial: &str,
        local: &Path,
        remote: &str,
        on_event: EventSink,
    ) -> Result<String, AppError> {
        if !local.exists() {
            return Err(AppError::new(
                ErrorCode::FileNotFound,
                format!("local file not found: {}", local.display()),
            ));
        }
        let size = local_file_size(local);
        let file = local
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| local.to_string_lossy().to_string());

        self.spawn(
            adb,
            serial,
            "push",
            &file,
            local,
            size,
            vec![local.to_string_lossy().to_string(), remote.to_string()],
            on_event,
        )
    }

    fn spawn(
        &self,
        adb: &str,
        serial: &str,
        kind: &str,
        file: &str,
        local: &Path,
        total: Option<u64>,
        adb_args: Vec<String>,
        on_event: EventSink,
    ) -> Result<String, AppError> {
        crate::security::validate_serial(serial)?;
        validate_local_path(&local.to_string_lossy())?;
        // exactly one of the args is the device path; validate the one that
        // looks like it (must start with '/').
        for arg in &adb_args {
            if arg.starts_with('/') && kind == "pull" {
                validate_device_path(arg)?;
            }
            if arg.starts_with('/') && kind == "push" {
                validate_device_path(arg)?;
            }
        }

        let id = self.next_id();
        let full_args: Vec<String> = {
            let mut v = vec!["-s".to_string(), serial.to_string(), kind.to_string()];
            v.extend(adb_args);
            v
        };

        let job = Arc::new(Job {
            kind: kind.to_string(),
            file: file.to_string(),
            local: local.to_path_buf(),
            total,
            done: AtomicBool::new(false),
            last_line: Mutex::new(String::new()),
            handle: Arc::new(StreamHandle {
                child: Mutex::new(None),
                stdin: None,
                label: format!("adb {kind}"),
            }),
        });

        let job_for_line = Arc::clone(&job);
        let on_line = move |line: String| {
            // adb reports the outcome in its final lines:
            //   "12345 bytes pushed in 1.234s (9.98 MB/s)"
            //   "12345 bytes pulled in 1.234s (9.98 MB/s)"
            //   "adb: error: remote object 'x' not found"
            if line.contains("bytes pushed")
                || line.contains("bytes pulled")
                || line.contains("error")
            {
                *job_for_line.last_line.lock().unwrap() = line.trim().to_string();
                job_for_line.done.store(true, Ordering::SeqCst);
            }
        };

        let handle = spawn_streamed(
            adb,
            &full_args,
            &format!("adb {kind} {file}"),
            false,
            Box::new(on_line),
        )?;
        job.handle = handle;
        self.jobs.lock().unwrap().insert(id.clone(), Arc::clone(&job));

        let watcher = Arc::clone(&job);
        let watcher_id = id.clone();
        let sink = on_event;
        std::thread::spawn(move || {
            let deadline = Instant::now() + TRANSFER_TIMEOUT;
            loop {
                if watcher.done.load(Ordering::SeqCst) {
                    let msg = watcher.last_line.lock().unwrap().clone();
                    let status = if msg.contains("error") {
                        "error"
                    } else if msg == "cancelled" {
                        "cancelled"
                    } else {
                        "done"
                    };
                    sink(TransferEvent {
                        id: watcher_id.clone(),
                        status: status.to_string(),
                        done_bytes: if watcher.kind == "pull" {
                            local_current_bytes(&watcher.local)
                        } else {
                            watcher.total.unwrap_or(0)
                        },
                        total: watcher.total,
                        message: msg,
                    });
                    break;
                }
                if !watcher.handle.is_alive() {
                    sink(TransferEvent {
                        id: watcher_id.clone(),
                        status: "error".into(),
                        done_bytes: local_current_bytes(&watcher.local),
                        total: watcher.total,
                        message: "adb process ended without a result line".into(),
                    });
                    break;
                }
                // Real progress for pulls: the local file grows on disk.
                if watcher.kind == "pull" {
                    sink(TransferEvent {
                        id: watcher_id.clone(),
                        status: "running".into(),
                        done_bytes: local_current_bytes(&watcher.local),
                        total: watcher.total,
                        message: String::new(),
                    });
                }
                std::thread::sleep(Duration::from_millis(300));
                if Instant::now() >= deadline {
                    watcher.handle.stop();
                    watcher.done.store(true, Ordering::SeqCst);
                    sink(TransferEvent {
                        id: watcher_id.clone(),
                        status: "error".into(),
                        done_bytes: 0,
                        total: watcher.total,
                        message: "timeout".into(),
                    });
                    break;
                }
            }
        });

        Ok(id)
    }

    pub fn cancel(&self, id: &str) -> Result<(), AppError> {
        let jobs = self.jobs.lock().unwrap();
        let Some(job) = jobs.get(id) else {
            return Err(AppError::new(
                ErrorCode::FileNotFound,
                format!("no transfer '{id}'"),
            ));
        };
        if !job.done.load(Ordering::SeqCst) {
            job.done.store(true, Ordering::SeqCst);
            *job.last_line.lock().unwrap() = "cancelled".to_string();
            job.handle.stop();
        }
        Ok(())
    }

    pub fn remove_finished(&self, id: &str) {
        self.jobs.lock().unwrap().remove(id);
    }

    pub fn stop_all(&self) {
        for (_, job) in self.jobs.lock().unwrap().drain() {
            if !job.done.load(Ordering::SeqCst) {
                job.done.store(true, Ordering::SeqCst);
                job.handle.stop();
            }
        }
    }
}

impl Drop for TransferManager {
    fn drop(&mut self) {
        self.stop_all();
    }
}

impl Default for TransferManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Remote size via `adb shell stat -c %s <path>` (toybox stat supports -c).
pub fn remote_file_size(adb: &str, serial: &str, remote: &str) -> Result<Option<u64>, AppError> {
    validate_device_path(remote)?;
    let quoted = crate::security::quote_shell(remote);
    let out = run_captured(
        adb,
        &[
            "-s".into(),
            serial.into(),
            "shell".into(),
            format!("stat -c %s {quoted}"),
        ],
        Duration::from_secs(10),
    )?;
    if !out.success() {
        return Ok(None);
    }
    Ok(out.text().trim().parse::<u64>().ok())
}

pub fn local_file_size(local: &Path) -> Option<u64> {
    std::fs::metadata(local).ok().map(|m| m.len())
}

pub fn local_current_bytes(local: &Path) -> u64 {
    std::fs::metadata(local)
        .map(|m| m.len())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_remote_path() {
        let m = TransferManager::new();
        let on_event = |_e: TransferEvent| {};
        let err = m
            .start_pull("/bin/echo", "S1", "no-slash", Path::new("/tmp/x"), None, Box::new(on_event))
            .expect_err("device path must start with /");
        assert_eq!(err.code, ErrorCode::InvalidPath);
    }

    #[test]
    fn rejects_missing_local_file() {
        let m = TransferManager::new();
        let on_event = |_e: TransferEvent| {};
        let err = m
            .start_push(
                "/bin/echo",
                "S1",
                Path::new("/tmp/adb-studio-does-not-exist.bin"),
                "/sdcard/x",
                Box::new(on_event),
            )
            .expect_err("missing local file");
        assert_eq!(err.code, ErrorCode::FileNotFound);
    }

    /// End-to-end transfer pipeline using a fake `adb` shell script:
    /// spawn → run → final-line detection → completion event.
    #[test]
    fn push_pull_roundtrip_with_fake_adb() {
        let dir = std::env::temp_dir().join(format!(
            "adb-studio-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("fake-adb");
        let content = r#"#!/bin/sh
args="$*"
case "$args" in
  *" push "*)
    set -- $args
    shift; shift; shift
    local="$1"; remote="$2"
    mkdir -p "$(dirname "$remote")"
    cp "$local" "$remote"
    echo "1024 bytes pushed in 0.100s (10.00 MB/s)"
    ;;
  *" pull "*)
    set -- $args
    shift; shift; shift
    remote="$1"; local="$2"
    mkdir -p "$(dirname "$local")"
    cp "$remote" "$local"
    echo "1024 bytes pulled in 0.100s (10.00 MB/s)"
    ;;
  *)
    echo "fake adb: unknown" >&2
    exit 1
    ;;
esac
exit 0
"#;
        std::fs::write(&fake, content).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut p = std::fs::metadata(&fake).unwrap().permissions();
            p.set_mode(0o755);
            std::fs::set_permissions(&fake, p).unwrap();
        }

        let payload = dir.join("payload.bin");
        std::fs::write(&payload, vec![0u8; 1024]).unwrap();

        let m = TransferManager::new();
        let (tx, rx) = std::sync::mpsc::channel::<TransferEvent>();
        let remote_path = dir.join("remote").join("payload.bin");
        let id = m
            .start_push(
                fake.to_str().unwrap(),
                "TESTSERIAL",
                &payload,
                &remote_path.to_string_lossy(),
                Box::new(move |e: TransferEvent| {
                    let _ = tx.send(e);
                }),
            )
            .expect("push should start");

        let event = rx
            .recv_timeout(Duration::from_secs(10))
            .expect("should receive a final event");
        assert_eq!(event.id, id);
        assert_eq!(event.status, "done", "got: {event:?}");
        assert!(remote_path.exists(), "fake adb should have copied the file");
        m.remove_finished(&id);

        // And a pull back.
        let (tx2, rx2) = std::sync::mpsc::channel::<TransferEvent>();
        let local_out = dir.join("back.bin");
        let id2 = m
            .start_pull(
                fake.to_str().unwrap(),
                "TESTSERIAL",
                &remote_path.to_string_lossy(),
                &local_out,
                Some(1024),
                Box::new(move |e: TransferEvent| {
                    let _ = tx2.send(e);
                }),
            )
            .expect("pull should start");
        let event2 = rx2
            .recv_timeout(Duration::from_secs(10))
            .expect("should receive a final event");
        assert_eq!(event2.id, id2);
        assert_eq!(event2.status, "done", "got: {event2:?}");
        assert_eq!(
            std::fs::read(&local_out).unwrap().len(),
            1024
        );
        m.remove_finished(&id2);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cancel_stops_the_child() {
        let dir = std::env::temp_dir().join(format!(
            "adb-studio-cancel-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("slow-adb");
        let content = "#!/bin/sh\nsleep 30\necho never\n";
        std::fs::write(&fake, content).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut p = std::fs::metadata(&fake).unwrap().permissions();
            p.set_mode(0o755);
            std::fs::set_permissions(&fake, p).unwrap();
        }

        let payload = dir.join("p.bin");
        std::fs::write(&payload, b"hi").unwrap();

        let m = TransferManager::new();
        let id = m
            .start_push(
                fake.to_str().unwrap(),
                "S1",
                &payload,
                "/sdcard/p.bin",
                Box::new(|_e: TransferEvent| {}),
            )
            .unwrap();
        std::thread::sleep(Duration::from_millis(200));
        m.cancel(&id).expect("cancel");
        std::thread::sleep(Duration::from_millis(200));
        m.stop_all();
        std::fs::remove_dir_all(&dir).ok();
    }
}
