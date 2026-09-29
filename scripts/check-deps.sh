#!/usr/bin/env bash
# check-deps.sh — verifica adb, scrcpy e fastboot (mesma ordem de descoberta do app:
# manual → PATH → ANDROID_HOME/ANDROID_SDK_ROOT → ~/Android/Sdk → /usr/lib|opt/android-sdk).
# Uso:  scripts/check-deps.sh
#       ZITTODB_PATH="adb=/usr/bin/adb;scrcpy=/opt/scrcpy" scripts/check-deps.sh

set -u

find_tool() {
  local name="$1" manual="$2"
  if [[ -n "$manual" && -x "$manual" ]]; then
    printf '%s' "$manual"; return 0
  fi
  local p
  p="$(command -v "$name" 2>/dev/null || true)"
  if [[ -n "$p" ]]; then printf '%s' "$p"; return 0; fi

  local roots=()
  [[ -n "${ANDROID_HOME:-}" ]] && roots+=("$ANDROID_HOME")
  [[ -n "${ANDROID_SDK_ROOT:-}" ]] && roots+=("$ANDROID_SDK_ROOT")
  roots+=("$HOME/Android/Sdk" "/usr/lib/android-sdk" "/opt/android-sdk")
  local r c
  for r in "${roots[@]}"; do
    for c in "$r/$name" "$r/platform-tools/$name"; do
      if [[ -x "$c" ]]; then printf '%s' "$c"; return 0; fi
    done
  done
  return 1
}

manual_for() {
  local tool="$1"
  [[ -n "${ZITTODB_PATH:-}" ]] || return 0
  printf '%s' "$ZITTODB_PATH" | tr ';' '\n' | awk -F= -v t="$tool" '$1==t{print $2}'
}

rc=0
echo "=== Zittodb: verificação de dependências ==="

for tool in adb scrcpy fastboot; do
  path="$(find_tool "$tool" "$(manual_for "$tool")" || true)"
  if [[ -z "$path" ]]; then
    echo "[ERRO] $tool: não encontrado"
    case "$tool" in
      adb|fastboot) echo "       → sudo apt install adb   (platform-tools)" ;;
      scrcpy) echo "       → sudo apt install scrcpy   (ou release do Genymobile/scrcpy)" ;;
    esac
    rc=1
    continue
  fi
  ver=""
  case "$tool" in
    adb) ver="$("$path" version 2>/dev/null | head -n1)" ;;
    scrcpy) ver="$("$path" --version 2>/dev/null | head -n1)" ;;
  esac
  echo "[OK]   $tool: $path${ver:+  — $ver}"
done

echo "=== fim (exit $rc) ==="
exit $rc
