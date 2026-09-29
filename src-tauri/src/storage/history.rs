//! Device connection history (spec §36).
//!
//! Stores ONLY non-sensitive metadata: model name, last seen time, last
//! state, connection kind. Never file content, never credentials.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::devices::Device;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct HistoryFile {
    entries: BTreeMap<String, HistoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub serial: String,
    pub model: Option<String>,
    pub last_state: Option<String>,
    pub last_seen_ms: Option<i64>,
    pub connection: Option<String>,
}

pub struct DeviceHistory {
    path: PathBuf,
    cache: Mutex<BTreeMap<String, HistoryEntry>>,
}

impl DeviceHistory {
    pub fn open(dir: &std::path::Path) -> DeviceHistory {
        fs::create_dir_all(dir).ok();
        let path = dir.join("devices-history.json");
        let file: HistoryFile = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        DeviceHistory {
            path,
            cache: Mutex::new(file.entries),
        }
    }

    /// Records a device sighting (called after each `list_devices`).
    pub fn record(&self, devices: &[Device]) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let mut map = self.cache.lock().unwrap();
        for d in devices {
            let e = map.entry(d.serial.clone()).or_insert_with(|| HistoryEntry {
                serial: d.serial.clone(),
                ..Default::default()
            });
            e.model = d.model.clone();
            e.last_state = Some(format!("{:?}", d.state).to_lowercase());
            e.last_seen_ms = Some(now);
            e.connection = Some(format!("{:?}", d.connection).to_lowercase());
        }
        drop(map);
        self.persist();
    }

    pub fn read(&self) -> Vec<HistoryEntry> {
        let mut v: Vec<HistoryEntry> = self.cache.lock().unwrap().values().cloned().collect();
        v.sort_by(|a, b| {
            b.last_seen_ms
                .unwrap_or(0)
                .cmp(&a.last_seen_ms.unwrap_or(0))
        });
        v
    }

    pub fn clear(&self) {
        self.cache.lock().unwrap().clear();
        self.persist();
    }

    fn persist(&self) {
        let map = self.cache.lock().unwrap().clone();
        let file = HistoryFile { entries: map };
        if let Ok(json) = serde_json::to_string_pretty(&file) {
            fs::write(&self.path, json).ok();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::devices::{ConnectionKind, DeviceState};

    #[test]
    fn records_and_clears() {
        let dir = std::env::temp_dir().join(format!("zittodb-hist-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let h = DeviceHistory::open(&dir);
        let d = Device {
            serial: "S1".into(),
            state: DeviceState::Connected,
            model: Some("Test Phone".into()),
            product: None,
            device: None,
            connection: ConnectionKind::Usb,
            is_emulator: false,
        };
        h.record(std::slice::from_ref(&d));
        let v = h.read();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].model.as_deref(), Some("Test Phone"));
        assert!(v[0].last_seen_ms.is_some());
        h.clear();
        assert!(h.read().is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
