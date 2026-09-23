//! Package risk classification for debloat (spec §20–21).
//!
//! HONESTY RULES (enforced in the UI, encoded here):
//! 1. A package is only `Safe`/`LowRisk` if it is explicitly listed in this
//!    table. Names alone are never enough.
//! 2. Anything not listed is `Unknown` — the UI must show
//!    "⚠ Desconhecido — o ADB Studio não possui informações suficientes".
//! 3. Profiles never silently include `Unknown` or higher-risk packages.
//! 4. Even `Safe` packages are always shown in the pre-execution preview.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum RiskLevel {
    Safe = 0,
    LowRisk = 1,
    Caution = 2,
    Dangerous = 3,
    Critical = 4,
    Unknown = 5,
}

impl RiskLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            RiskLevel::Safe => "SAFE",
            RiskLevel::LowRisk => "LOW_RISK",
            RiskLevel::Caution => "CAUTION",
            RiskLevel::Dangerous => "DANGEROUS",
            RiskLevel::Critical => "CRITICAL",
            RiskLevel::Unknown => "UNKNOWN",
        }
    }

    /// True when a profile that allows up to `max` may include this risk.
    pub fn allowed_by(self, max: RiskLevel) -> bool {
        matches!(
            self,
            r if r != RiskLevel::Unknown && r <= max
        )
    }
}

/// Explicit packages considered critical: removing/disabling them breaks the
/// system or leaves the user locked out of core functions.
const CRITICAL: &[&str] = &[
    "android",
    "com.android.systemui",
    "com.android.settings",
    "com.android.phone",
    "com.android.shell",
    "com.android.providers.telephony",
    "com.android.providers.contacts",
    "com.android.providers.calendar",
    "com.android.providers.settings",
    "com.android.providers.media",
    "com.android.providers.userdictionary",
    "com.android.server.telecom",
    "com.android.providers.deviceconfig",
];

/// Disabling these severely degrades daily use (calls, messages, keyboard…).
const DANGEROUS: &[&str] = &[
    "com.android.dialer",
    "com.android.incallui",
    "com.android.contacts",
    "com.android.mms",
    "com.android.packageinstaller",
    "com.android.permissioncontroller",
    "com.android.bluetooth",
    "com.android.nfc",
    "com.android.phone",
    "com.android.inputmethod.latin",
    "com.google.android.inputmethod.latin",
    "com.google.android.dialer",
    "com.google.android.contacts",
    "com.google.android.apps.messaging",
    "com.android.cellbroadcastreceiver",
    "com.android.storagemanager",
    "com.android.providers.media.module",
    "com.android.rkpdapp",
];

/// Services important enough to warn about (Google ecosystem, OEM services).
const CAUTION: &[&str] = &[
    "com.google.android.gms",
    "com.google.android.gsf",
    "com.android.vending",
    "com.google.android.apps.maps",
    "com.android.vpndialogs",
    "com.google.android.tts",
    "com.google.android.apps.wellbeing",
    "com.android.backupconfirm",
    "com.miui.securitycenter",
    "com.android.networkstack",
    "com.android.stk",
    "com.android.ons",
    "com.google.android.apps.tachyon",
    "com.google.android.webview",
    "com.android.captiveportallogin",
    "com.google.android.apps.search",
];

/// Explicitly removable OEM promo/ads/duplicate apps. This list is
/// intentionally conservative — when in doubt, the package stays Unknown.
const SAFE: &[&str] = &[
    // Xiaomi / MIUI ads & analytics
    "com.miui.msa",
    "com.miui.msa.global",
    "com.miui.analytics",
    "com.miui.da",
    "com.xiaomi.ad",
    "com.lbe.xiaomi",
    "com.miui.miservice",
    "com.xiaomi.ab",
    // Common OEM promo / preloads
    "com.lge.ln",
    "com.samsung.android.app.rexdialog",
];

/// Prefix-based rules, checked in order (first match wins).
const PREFIX_RULES: &[( &str, RiskLevel)] = &[
    ("com.android.providers.", RiskLevel::Critical),
    ("com.android.systemui", RiskLevel::Critical),
    ("com.android.settings", RiskLevel::Critical),
    ("com.google.android.gms", RiskLevel::Caution),
    ("com.google.android.gsf", RiskLevel::Caution),
    ("com.miui.", RiskLevel::LowRisk),
    ("com.xiaomi.", RiskLevel::LowRisk),
    ("com.google.android.feedprovider", RiskLevel::LowRisk),
    ("com.google.android.apps.turbo", RiskLevel::LowRisk),
    ("com.android.browser", RiskLevel::LowRisk),
    ("com.google.android.apps.books", RiskLevel::LowRisk),
    ("com.google.android.calculator", RiskLevel::LowRisk),
    ("com.google.android.deskclock", RiskLevel::LowRisk),
    ("com.google.android.calendar", RiskLevel::LowRisk),
    ("com.android.calculator2", RiskLevel::LowRisk),
];

/// Classifies a package. Everything not explicitly known is `Unknown`.
pub fn classify_package(pkg: &str) -> RiskLevel {
    if CRITICAL.contains(&pkg) {
        return RiskLevel::Critical;
    }
    if DANGEROUS.contains(&pkg) {
        return RiskLevel::Dangerous;
    }
    if CAUTION.contains(&pkg) {
        return RiskLevel::Caution;
    }
    if SAFE.contains(&pkg) {
        return RiskLevel::Safe;
    }
    for (prefix, level) in PREFIX_RULES {
        if pkg == prefix || pkg.starts_with(&format!("{prefix}.")) {
            return *level;
        }
    }
    RiskLevel::Unknown
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebloatProfile {
    pub id: String,
    pub name: String,
    /// Packages with this risk (or lower, and not Unknown) are eligible.
    pub max_risk: RiskLevel,
    pub description: String,
}

/// Built-in profiles (spec §21). `custom` is handled by the UI, not here.
pub fn profiles() -> Vec<DebloatProfile> {
    vec![
        DebloatProfile {
            id: "conservative".into(),
            name: "Conservador".into(),
            max_risk: RiskLevel::Safe,
            description: "Only packages explicitly listed as safe (ads/analytics/preload).".into(),
        },
        DebloatProfile {
            id: "balanced".into(),
            name: "Equilibrado".into(),
            max_risk: RiskLevel::LowRisk,
            description: "Safe + low-risk OEM apps. Critical components are kept.".into(),
        },
        DebloatProfile {
            id: "minimal".into(),
            name: "Minimal".into(),
            max_risk: RiskLevel::LowRisk,
            description: "Aggressive OEM bloat removal, critical components kept.".into(),
        },
        DebloatProfile {
            id: "advanced".into(),
            name: "Avançado".into(),
            max_risk: RiskLevel::Caution,
            description: "Includes caution-level packages (Google services, OEM frameworks). Review each item.".into(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn critical_packages() {
        assert_eq!(classify_package("android"), RiskLevel::Critical);
        assert_eq!(classify_package("com.android.systemui"), RiskLevel::Critical);
        assert_eq!(classify_package("com.android.providers.telephony"), RiskLevel::Critical);
    }

    #[test]
    fn known_safe_packages() {
        assert_eq!(classify_package("com.miui.msa"), RiskLevel::Safe);
        assert_eq!(classify_package("com.lbe.xiaomi"), RiskLevel::Safe);
    }

    #[test]
    fn unknown_is_never_assumed_safe() {
        assert_eq!(classify_package("com.example.totallyunknown"), RiskLevel::Unknown);
        assert_eq!(classify_package("com.foo.ads"), RiskLevel::Unknown);
    }

    #[test]
    fn prefix_rules() {
        assert_eq!(classify_package("com.miui.videoplayer"), RiskLevel::LowRisk);
        assert_eq!(classify_package("com.android.providers.settings.extra"), RiskLevel::Critical);
        assert_eq!(classify_package("com.google.android.gms.update"), RiskLevel::Caution);
    }

    #[test]
    fn profiles_exclude_unknown() {
        let p = profiles()
            .iter()
            .find(|p| p.id == "balanced")
            .unwrap();
        assert!(RiskLevel::LowRisk.allowed_by(p.max_risk));
        assert!(!RiskLevel::Unknown.allowed_by(p.max_risk));
        assert!(!RiskLevel::Dangerous.allowed_by(p.max_risk));
    }
}
