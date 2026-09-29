//! Parsers for ADB/Android tool output.
//!
//! All functions are pure (`&str -> structured`), which makes them trivially
//! unit-testable (spec §55) and reusable.

use std::collections::BTreeMap;

use serde::Serialize;

// ---------------------------------------------------------------------------
// `adb devices -l`
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawDevice {
    pub serial: String,
    pub state: String,
    /// Key/value pairs from the trailing part: product, device, model,
    /// transport_id, usb, wifi_ip …
    pub attrs: BTreeMap<String, String>,
}

pub fn parse_devices_l(text: &str) -> Vec<RawDevice> {
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim_end();
        // Real adb prints daemon noise such as "* daemon started
        // successfully *" — never a device line.
        if line.is_empty() || line.starts_with("List of devices") || line.starts_with('*') {
            continue;
        }
        let mut parts = line.splitn(2, char::is_whitespace);
        let serial = parts.next().unwrap_or("").trim().to_string();
        let rest = parts.next().unwrap_or("");
        if serial.is_empty() {
            continue;
        }
        let mut it = rest.split_whitespace();
        let state = it.next().unwrap_or("unknown").to_string();
        let mut attrs = BTreeMap::new();
        for tok in it {
            if let Some((k, v)) = tok.split_once(':') {
                // Attribute keys (`product`, `model`, `usb`, …) are lowercase
                // identifiers; anything else is noise.
                if !k.is_empty() && k.bytes().all(|b| b.is_ascii_lowercase()) {
                    attrs.insert(k.to_string(), v.to_string());
                }
            }
        }
        out.push(RawDevice {
            serial,
            state,
            attrs,
        });
    }
    out
}

// ---------------------------------------------------------------------------
// `getprop`
// ---------------------------------------------------------------------------

pub fn parse_getprop(text: &str) -> BTreeMap<String, String> {
    let mut m = BTreeMap::new();
    for line in text.lines() {
        let line = line.trim();
        // Real `getprop` output is bracketed: `[ro.x]: [value]`.
        if let Some(rest) = line.strip_prefix('[') {
            if let Some((k, v)) = rest.split_once("]: [") {
                if let Some(v) = v.strip_suffix(']') {
                    insert_prop(&mut m, k, v);
                }
            }
            continue;
        }
        // Unbracketed `key: value` lines are accepted too (robustness).
        if let Some((k, v)) = line.split_once(": ") {
            insert_prop(&mut m, k.trim(), v.trim());
        }
    }
    m
}

fn insert_prop(m: &mut BTreeMap<String, String>, k: &str, v: &str) {
    if !k.is_empty()
        && k.len() <= 128
        && k.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        m.insert(k.to_string(), v.to_string());
    }
}

// ---------------------------------------------------------------------------
// `dumpsys battery`
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    /// Percent 0..100 (normalized from level/scale when possible).
    pub level: Option<u32>,
    pub temperature: Option<u32>, // 0.1 °C
    /// Derived Celsius value (`temperature / 10`), serialized as
    /// `temperatureC` for the dashboard (matches mock + local backends).
    pub temperature_c: Option<f32>,
    pub status: Option<String>, // Charging / Discharging / Not charging / Full
    pub health: Option<String>,
    pub technology: Option<String>,
    pub voltage_mv: Option<u32>,
    pub plugged: Option<String>,
}

pub fn parse_dumpsys_battery(text: &str) -> BatteryInfo {
    let mut info = BatteryInfo::default();
    for line in text.lines() {
        let line = line.trim();
        macro_rules! take {
            ($e:expr) => {
                line.strip_prefix($e)
                    .map(|v| v.trim().to_string())
                    .filter(|s| !s.is_empty())
            };
        }
        if let Some(v) = take!("level: ") {
            info.level = v.parse().ok();
        } else if let Some(v) = take!("scale: ") {
            if let Ok(scale) = v.parse::<u32>() {
                if let Some(level) = info.level {
                    if scale > 0 {
                        info.level = Some((level * 100 / scale).min(100));
                    }
                }
            }
        } else if let Some(v) = take!("temperature: ") {
            info.temperature = v.parse().ok();
        } else if let Some(v) = take!("status: ") {
            info.status = Some(v);
        } else if let Some(v) = take!("health: ") {
            info.health = Some(v);
        } else if let Some(v) = take!("technology: ") {
            info.technology = Some(v);
        } else if let Some(v) = take!("voltage: ") {
            info.voltage_mv = v.parse().ok();
        } else if let Some(v) = take!("plugged: ") {
            info.plugged = Some(v);
        }
    }
    info.temperature_c = info
        .temperature
        .map(|temperature| temperature as f32 / 10.0);
    info
}

// ---------------------------------------------------------------------------
// `df -k <path>` / `df -m <path>`
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsage {
    pub total_mb: u64,
    pub used_mb: u64,
    pub avail_mb: u64,
    pub path: String,
}

/// Parses the last data line of a `df` listing and normalizes 1024-byte block
/// output (Android's `df -k`) to MB. GNU-style `1M-blocks` output is kept as
/// is for compatibility with existing callers and fixtures.
pub fn parse_df(text: &str, path: &str) -> Option<DiskUsage> {
    let is_kib = text.lines().any(|line| {
        let header = line.to_ascii_lowercase();
        header.contains("1k-blocks")
            || header.contains("1024-blocks")
            || header.contains("k-blocks")
    });
    for line in text.lines().rev() {
        let t: Vec<&str> = line.split_whitespace().collect();
        if t.len() >= 6 {
            if let (Ok(total), Ok(used), Ok(avail)) = (
                t[1].parse::<u64>(),
                t[2].parse::<u64>(),
                t[3].parse::<u64>(),
            ) {
                let to_mb = |blocks: u64| if is_kib { blocks / 1024 } else { blocks };
                return Some(DiskUsage {
                    total_mb: to_mb(total),
                    used_mb: to_mb(used),
                    avail_mb: to_mb(avail),
                    path: path.to_string(),
                });
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// `/proc/meminfo`
// ---------------------------------------------------------------------------

pub fn parse_meminfo_total_mb(text: &str) -> Option<u64> {
    for line in text.lines() {
        if let Some(rest) = line.trim_start().strip_prefix("MemTotal:") {
            let num: String = rest
                .trim_start()
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if let Ok(kb) = num.parse::<u64>() {
                return Some(kb / 1024);
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// `pm list packages`
// ---------------------------------------------------------------------------

pub fn parse_pm_packages(text: &str) -> Vec<String> {
    text.lines()
        .filter_map(|l| l.trim().strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

// ---------------------------------------------------------------------------
// `dumpsys package` (global or single package)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PackageMeta {
    pub name: String,
    pub version_name: Option<String>,
    pub version_code: Option<u64>,
    pub uid: Option<String>,
    pub code_path: Option<String>,
    pub first_install: Option<u64>,
    pub last_update: Option<u64>,
}

pub struct PackageIter {
    current: Option<PackageMeta>,
    packages: Vec<PackageMeta>,
}

/// Incremental parser for `dumpsys package`. Feed it all lines; it keeps the
/// `current` package open until the next `Package [` header appears.
pub fn package_parser() -> PackageIter {
    PackageIter {
        current: None,
        packages: Vec::new(),
    }
}

impl PackageIter {
    pub fn feed(&mut self, line: &str) {
        if let Some(rest) = line.trim().strip_prefix("Package [") {
            // "Package [com.foo] (uuid):"
            if let Some(name) = rest.split(']').next() {
                if !name.is_empty() {
                    if let Some(c) = self.current.take() {
                        if !c.name.is_empty() {
                            self.packages.push(c);
                        }
                    }
                    self.current = Some(PackageMeta {
                        name: name.to_string(),
                        ..Default::default()
                    });
                }
            }
        }
        let Some(cur) = self.current.as_mut() else {
            return;
        };
        if let Some(v) = value_of(line, "versionName=") {
            cur.version_name = Some(v);
        } else if let Some(v) = value_of(line, "versionCode=") {
            cur.version_code = v.parse().ok();
        } else if let Some(v) = value_of(line, "userId=") {
            cur.uid = Some(v);
        } else if let Some(v) = value_of(line, "codePath=") {
            cur.code_path = Some(strip_brackets(&v));
        } else if let Some(v) = value_of(line, "firstInstallTime=") {
            cur.first_install = v.parse().ok();
        } else if let Some(v) = value_of(line, "lastUpdateTime=") {
            cur.last_update = v.parse().ok();
        }
    }

    pub fn finish(mut self) -> Vec<PackageMeta> {
        if let Some(c) = self.current.take() {
            if !c.name.is_empty() {
                self.packages.push(c);
            }
        }
        self.packages
    }

    pub fn get(&self, name: &str) -> Option<&PackageMeta> {
        self.packages.iter().find(|p| p.name == name)
    }
}

fn value_of(line: &str, key: &str) -> Option<String> {
    let rest = line.trim().strip_prefix(key)?;
    let v: String = rest.chars().take_while(|c| !c.is_whitespace()).collect();
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

fn strip_brackets(v: &str) -> String {
    v.trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_string()
}

/// `dumpsys package <pkg>` for one package — returns the first package block.
pub fn parse_package_dump(text: &str) -> Option<PackageMeta> {
    let mut it = package_parser();
    for line in text.lines() {
        it.feed(line);
    }
    it.finish().into_iter().next()
}

// ---------------------------------------------------------------------------
// `ip addr` / `ip route` / `/etc/resolv.conf`
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NetIface {
    pub name: String,
    pub ip: String,
    pub prefix: u32,
}

pub fn parse_ip_addr(text: &str) -> Vec<NetIface> {
    let mut out = Vec::new();
    let mut current: Option<String> = None;
    for line in text.lines() {
        let t: Vec<&str> = line.split_whitespace().collect();
        if t.len() >= 2 && t[0].trim_end_matches(':').parse::<u32>().is_ok() && t[1].ends_with(':')
        {
            current = Some(t[1][..t[1].len() - 1].to_string());
            continue;
        }
        if line.trim_start().starts_with("inet ") || line.trim_start().starts_with("inet\t") {
            if let (Some(name), Some(ip_part)) = (current.clone(), t.get(1)) {
                if name != "lo" {
                    if let Some((ip, prefix)) = ip_part.split_once('/') {
                        if let Ok(p) = prefix.parse::<u32>() {
                            out.push(NetIface {
                                name,
                                ip: ip.to_string(),
                                prefix: p,
                            });
                        }
                    }
                }
            }
        }
    }
    out
}

pub fn parse_ip_route(text: &str) -> Option<String> {
    for line in text.lines() {
        if let Some(rest) = line.trim().strip_prefix("default via ") {
            let t: Vec<&str> = rest.split_whitespace().collect();
            if let Some(gw) = t.first() {
                return Some(gw.to_string());
            }
        }
    }
    None
}

pub fn parse_resolv(text: &str) -> Vec<String> {
    text.lines()
        .filter_map(|l| l.trim().strip_prefix("nameserver"))
        .map(|l| l.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

// ---------------------------------------------------------------------------
// `ls -la`
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub is_link: bool,
    pub size: Option<u64>,
    pub modified: Option<String>,
    pub permissions: String,
}

/// Parses `ls -la <dir>` output.
///
/// Two date formats exist in the wild:
///   - GNU:   `perm links owner group size Jan 01 10:00 name...` (8 cols)
///   - toybox:`perm links owner group size 2026-01-01 10:00 name...` (7 cols)
/// The date style is detected from the 6th column (digit => year format).
pub fn parse_ls(text: &str) -> Vec<FileEntry> {
    let mut out = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() || line.starts_with("total ") {
            continue;
        }
        // First pass: collect whitespace-separated tokens to detect format.
        let preview: Vec<&str> = line.split_whitespace().collect();
        if preview.len() < 8 {
            continue;
        }
        if !matches!(
            preview[0].chars().next(),
            Some('d' | '-' | 'l' | 'c' | 'b' | 'p' | 's')
        ) {
            continue;
        }
        let cols = if preview[5]
            .chars()
            .next()
            .map_or(false, |c| c.is_ascii_digit())
        {
            7 // "YYYY-MM-DD HH:MM name"
        } else {
            8 // "Mon DD HH:MM name"
        };

        let mut tokens: Vec<String> = Vec::new();
        let mut rest = line;
        for _ in 0..cols {
            let t = rest.trim_start();
            let Some(sp) = t.find(char::is_whitespace) else {
                break;
            };
            tokens.push(t[..sp].to_string());
            rest = &t[sp..];
        }
        if tokens.len() < cols {
            continue;
        }
        let name = rest.trim_start().to_string();
        if name.is_empty() {
            continue;
        }
        let size = tokens[4].parse::<u64>().ok();
        let modified = Some(format!("{} {}", tokens[5], tokens[6]));
        out.push(FileEntry {
            is_dir: tokens[0].starts_with('d'),
            is_link: tokens[0].starts_with('l'),
            size,
            modified,
            permissions: tokens[0].clone(),
            name,
        });
    }
    out
}

// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn devices_l_parsing() {
        let out = r#"List of devices attached
23021RAA2Y       device usb:1-1 product:speser device:speser model:Redmi_Note_12 transport_id:1
192.168.1.50:5555 device product:pine-eu device:raven transport_id:2
emulator-5554    device product:sdk_gphone64_arm64 device:emu64xa transport_id:3
AA:BB:CC         unauthorized usb:1-2
DD:EE            offline
"#;
        let v = parse_devices_l(out);
        assert_eq!(v.len(), 5);

        assert_eq!(v[0].serial, "23021RAA2Y");
        assert_eq!(v[0].state, "device");
        assert_eq!(
            v[0].attrs.get("model").map(|s| s.as_str()),
            Some("Redmi_Note_12")
        );
        assert_eq!(v[0].attrs.get("usb").map(|s| s.as_str()), Some("1-1"));

        assert_eq!(v[1].serial, "192.168.1.50:5555");
        assert_eq!(v[1].state, "device");

        assert_eq!(v[3].state, "unauthorized");
        assert_eq!(v[4].state, "offline");
    }

    #[test]
    fn devices_l_ignores_noise() {
        let v = parse_devices_l("List of devices attached\n\n* daemon started successfully *\n");
        assert!(v.is_empty());
    }

    #[test]
    fn getprop_parsing() {
        let v = parse_getprop(
            "ro.product.model: Redmi Note 12\nro.build.version.release: 15\nbad line\nro.x: 1\n",
        );
        assert_eq!(
            v.get("ro.product.model").map(|s| s.as_str()),
            Some("Redmi Note 12")
        );
        assert_eq!(
            v.get("ro.build.version.release").map(|s| s.as_str()),
            Some("15")
        );
        assert!(!v.contains_key("bad"));
    }

    #[test]
    fn getprop_parsing_bracketed_real_format() {
        // This is what `adb shell getprop` actually prints.
        let v = parse_getprop("[ro.product.model]: [Redmi Note 12]\n[ro.build.version.release]: [15]\n[init.svc.adbd]: [running]\n");
        assert_eq!(
            v.get("ro.product.model").map(|s| s.as_str()),
            Some("Redmi Note 12")
        );
        assert_eq!(
            v.get("ro.build.version.release").map(|s| s.as_str()),
            Some("15")
        );
        assert_eq!(v.get("init.svc.adbd").map(|s| s.as_str()), Some("running"));
    }

    #[test]
    fn battery_parsing() {
        let out = r#"Current Battery Service state:
  AC powered: false
  USB powered: true
  level: 73
  scale: 100
  health: 2
  status: 2
  voltage: 4101
  temperature: 310
  technology: Li-ion
  plugged: 1
"#;
        let b = parse_dumpsys_battery(out);
        assert_eq!(b.level, Some(73));
        assert_eq!(b.temperature, Some(310));
        assert_eq!(b.temperature_c, Some(31.0));
        assert_eq!(b.voltage_mv, Some(4101));
    }

    #[test]
    fn battery_normalizes_scale() {
        let b = parse_dumpsys_battery("level: 7\nscale: 10\n");
        assert_eq!(b.level, Some(70));
    }

    #[test]
    fn df_parsing() {
        let out = r#"Filesystem      1M-blocks  Used Available Use% Mounted on
/dev/fuse       123456 45678    77778  37% /storage/self/primary
"#;
        let d = parse_df(out, "/sdcard").expect("should parse");
        assert_eq!(d.total_mb, 123456);
        assert_eq!(d.used_mb, 45678);
        assert_eq!(d.avail_mb, 77778);
        assert!(parse_df("Filesystem      1M-blocks\n", "/sdcard").is_none());

        let android = "Filesystem     1024-blocks   Used Available Capacity Mounted on\n/dev/block  1048576 262144 786432 25% /sdcard\n";
        let d = parse_df(android, "/sdcard").expect("should parse Android df");
        assert_eq!(d.total_mb, 1024);
        assert_eq!(d.used_mb, 256);
        assert_eq!(d.avail_mb, 768);
    }

    #[test]
    fn meminfo_parsing() {
        assert_eq!(
            parse_meminfo_total_mb("MemTotal:       7864320 kB\nMemFree:        100 kB\n"),
            Some(7864320 / 1024)
        );
        assert_eq!(parse_meminfo_total_mb("MemFree: 1\n"), None);
    }

    #[test]
    fn pm_packages_parsing() {
        let v = parse_pm_packages("package:com.android.chrome\npackage:com.miui.msa\nnoise\n");
        assert_eq!(v, vec!["com.android.chrome", "com.miui.msa"]);
    }

    #[test]
    fn dumpsys_package_parsing() {
        let out = r#"Packages:
  Package [com.android.chrome] (abc-123):
    userId=10099
    versionCode=1002 minSdk=24 targetSdk=34
    versionName=128.0.6613
    firstInstallTime=2024-01-01 10:00:00
    lastUpdateTime=2024-06-01 09:00:00
    codePath=/data/app/com.android.chrome-abc
    ...
  Package [com.miui.msa] (def-456):
    userId=10055
    versionName=12.0.2
    codePath=[/data/app/com.miui.msa-xyz]
"#;
        let mut it = package_parser();
        for line in out.lines() {
            it.feed(line);
        }
        let pkgs = it.finish();
        assert_eq!(pkgs.len(), 2);
        assert_eq!(pkgs[0].name, "com.android.chrome");
        assert_eq!(pkgs[0].version_name.as_deref(), Some("128.0.6613"));
        assert_eq!(
            pkgs[0].code_path.as_deref(),
            Some("/data/app/com.android.chrome-abc")
        );
        assert_eq!(
            pkgs[1].code_path.as_deref(),
            Some("/data/app/com.miui.msa-xyz")
        );

        let single = parse_package_dump(out).expect("some");
        assert_eq!(single.name, "com.android.chrome");
    }

    #[test]
    fn ip_parsing() {
        let addr = r#"1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
2: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP
    link/ether aa:bb:cc:dd:ee:ff brd ff:ff:ff:ff:ff:ff
    inet 192.168.1.50/24 brd 192.168.1.255 scope global wlan0
"#;
        let ifaces = parse_ip_addr(addr);
        assert_eq!(ifaces.len(), 1);
        assert_eq!(ifaces[0].name, "wlan0");
        assert_eq!(ifaces[0].ip, "192.168.1.50");
        assert_eq!(ifaces[0].prefix, 24);

        assert_eq!(
            parse_ip_route("default via 192.168.1.1 dev wlan0\n192.168.1.0/24 dev wlan0\n"),
            Some("192.168.1.1".into())
        );
        assert_eq!(
            parse_resolv("# comment\nnameserver 8.8.8.8\nnameserver 1.1.1.1\n"),
            vec!["8.8.8.8", "1.1.1.1"]
        );
    }

    #[test]
    fn ls_parsing() {
        let out = r#"total 3
drwxr-xr-x 2 u0   u0       4096 2026-01-01 10:00 .
drwxr-xr-x 2 u0   u0       4096 2026-01-01 10:00 ..
drwx------ 3 u0   u0       4096 2026-01-01 10:00 DCIM
-rw-r--r-- 1 u0   u0       1234 2026-01-01 11:30 photo 1.jpg
lrwxrwxrwx 1 root root         0 2026-01-01 09:00 link to file
"#;
        let v = parse_ls(out);
        // "." and ".." are entry lines too; DCIM dir + photo + link
        let names: Vec<&str> = v.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"DCIM"));
        assert!(names.contains(&"photo 1.jpg"));
        let photo = v.iter().find(|e| e.name == "photo 1.jpg").unwrap();
        assert_eq!(photo.size, Some(1234));
        assert!(!photo.is_dir);
        let dcim = v.iter().find(|e| e.name == "DCIM").unwrap();
        assert!(dcim.is_dir);
    }
}
