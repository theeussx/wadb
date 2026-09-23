//! Local security layer (spec §12, §20, §43, §71).
//!
//! - Input validation for every value that will reach an external process.
//! - `quote_shell` for values embedded in a *device-side* shell command
//!   (POSIX single quoting). We never use a host-side shell.
//! - Conservative package risk classification for debloat. Anything the app
//!   does not know is `Unknown` — the UI must then warn, never guess.

pub mod risk;

use crate::error::{AppError, ErrorCode};

/// ADB serials we accept: USB serials (alphanumeric), network serials
/// (`192.168.1.100:5555`), emulators (`emulator-5554`), ADB over Wi-Fi.
/// Anything with whitespace or shell metacharacters is rejected.
pub fn validate_serial(serial: &str) -> Result<(), AppError> {
    let ok = !serial.is_empty()
        && serial.len() <= 128
        && serial
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | ':' | '_' | '-'));
    if ok {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::InvalidSerial,
            format!("invalid serial: {serial:?}"),
        ))
    }
}

/// Android package names: `a.b.c` — alphanumerics plus `_`, at least two
/// segments, each segment starting with a letter.
pub fn validate_package(pkg: &str) -> Result<(), AppError> {
    let ok = pkg.len() >= 3
        && pkg.len() <= 300
        && pkg
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
        && pkg.split('.').count() >= 2
        && pkg
            .split('.')
            .all(|s| !s.is_empty() && s.chars().next().map_or(false, |c| c.is_ascii_alphabetic()));
    if ok {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::InvalidPackage,
            format!("invalid package name: {pkg:?}"),
        ))
    }
}

/// Hosts for `adb connect`: IPv4, IPv6, or dotted hostname.
pub fn validate_host(host: &str) -> Result<(), AppError> {
    let ok = !host.is_empty()
        && host.len() <= 128
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | ':' | '-'));
    if ok {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::InvalidArgument,
            format!("invalid host: {host:?}"),
        ))
    }
}

/// Local filesystem paths chosen by the user: non-empty, no NUL/control
/// bytes, sane length. (We do not sandbox the local FS: this is a local
/// desktop tool and the user is trusted on their own machine.)
pub fn validate_local_path(path: &str) -> Result<(), AppError> {
    let ok = !path.is_empty()
        && path.len() <= 4096
        && !path.contains('\0')
        && !path
            .chars()
            .any(|c| (c as u32) < 0x20 || c == '\u{7f}');
    if ok {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::InvalidPath,
            format!("invalid local path: {:?} (length {})", path, path.len()),
        ))
    }
}

/// Device-side paths: must be absolute, no NUL/control bytes.
/// `..` segments are rejected to avoid accidental traversal into
/// manufacturer-private areas.
pub fn validate_device_path(path: &str) -> Result<(), AppError> {
    let ok = path.starts_with('/')
        && path.len() <= 1024
        && !path.contains('\0')
        && !path
            .chars()
            .any(|c| (c as u32) < 0x20 || c == '\u{7f}')
        && !path.split('/').any(|seg| seg == "..");
    if ok {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::InvalidPath,
            format!("invalid device path: {path:?}"),
        ))
    }
}

/// Fastboot partition names: identifier-like.
pub fn validate_partition(name: &str) -> Result<(), AppError> {
    let ok = !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_'));
    if ok {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::InvalidArgument,
            format!("invalid partition name: {name:?}"),
        ))
    }
}

/// `getvar` key: identifier-like.
pub fn validate_getvar(key: &str) -> Result<(), AppError> {
    let ok = !key.is_empty()
        && key.len() <= 32
        && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if ok {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::InvalidArgument,
            format!("invalid getvar key: {key:?}"),
        ))
    }
}

/// scrcpy bitrate: `2M`, `1.5M`, `800k` …
pub fn validate_bitrate(bitrate: &str) -> Result<(), AppError> {
    let ok = !bitrate.is_empty()
        && bitrate.len() <= 8
        && bitrate
            .chars()
            .all(|c| c.is_ascii_digit() || c == '.' || c == 'k' || c == 'M' || c == 'G')
        && bitrate
            .chars()
            .next()
            .map_or(false, |c| c.is_ascii_digit())
        && bitrate
            .chars()
            .last()
            .map_or(false, |c| matches!(c, 'k' | 'M' | 'G'));
    if ok {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::InvalidArgument,
            format!("invalid bitrate: {bitrate:?}"),
        ))
    }
}

/// POSIX single-quoting for embedding a value in a *device-side* shell
/// command string. Single quotes inside the value are escaped as `'\''`.
///
/// Only values that have already passed one of the validators above should
/// be quoted this way (for paths, spaces are the main real-world case).
pub fn quote_shell(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('\'');
    for c in value.chars() {
        if c == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(c);
        }
    }
    out.push('\'');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serials() {
        assert!(validate_serial("23021RAA2Y").is_ok());
        assert!(validate_serial("emulator-5554").is_ok());
        assert!(validate_serial("192.168.1.100:5555").is_ok());
        assert!(validate_serial("127.0.0.1:5555").is_ok());
        assert!(validate_serial("").is_err());
        assert!(validate_serial("a b").is_err());
        assert!(validate_serial("a|b").is_err());
        assert!(validate_serial("$(reboot)").is_err());
        assert!(validate_serial("a;b").is_err());
        assert!(validate_serial("a/b").is_err());
        assert!(validate_serial("a\nb").is_err());
    }

    #[test]
    fn packages() {
        assert!(validate_package("com.android.chrome").is_ok());
        assert!(validate_package("com.miui.msa.global").is_ok());
        assert!(validate_package("android").is_err()); // single segment
        assert!(validate_package("com.foo;rm").is_err());
        assert!(validate_package("com..foo").is_err());
        assert!(validate_package("1com.foo").is_err());
        assert!(validate_package("com.1foo").is_ok());
    }

    #[test]
    fn device_paths() {
        assert!(validate_device_path("/sdcard/DCIM").is_ok());
        assert!(validate_device_path("/sdcard/my folder/file name.txt").is_ok());
        assert!(validate_device_path("sdcard").is_err()); // relative
        assert!(validate_device_path("/sdcard/../data").is_err());
        assert!(validate_device_path("/a\nb").is_err());
    }

    #[test]
    fn local_paths() {
        assert!(validate_local_path("/home/user/Downloads/app.apk").is_ok());
        assert!(validate_local_path("").is_err());
        assert!(validate_local_path("/a\0b").is_err());
    }

    #[test]
    fn quoting_escapes_single_quotes() {
        assert_eq!(quote_shell("plain"), "'plain'");
        assert_eq!(quote_shell("a b"), "'a b'");
        assert_eq!(quote_shell("it's"), "'it'\\''s'");
        // The round-trip through a real shell must return the original value.
        let quoted = quote_shell("a b'c");
        let out = crate::processes::run_captured(
            "/bin/sh",
            &["-c".into(), format!("echo {quoted}")],
            std::time::Duration::from_secs(5),
        )
        .unwrap();
        assert_eq!(out.text().trim(), "a b'c");
    }

    #[test]
    fn bitrate_and_partition() {
        assert!(validate_bitrate("2M").is_ok());
        assert!(validate_bitrate("1.5M").is_ok());
        assert!(validate_bitrate("2m").is_err()); // only k/M/G suffixes
        assert!(validate_bitrate("M").is_err());
        assert!(validate_partition("boot").is_ok());
        assert!(validate_partition("system_a").is_ok());
        assert!(validate_partition("a b").is_err());
        assert!(validate_partition("A").is_err());
    }
}
