#!/usr/bin/env bash
# measure-performance.sh — medições PONTUAIS de performance (sem telemetria).
# A spec §15/§40 proíbe coleta contínua; este script roda sob demanda e imprime na saída.

set -u

ADB="$(command -v adb || true)"

if [[ -z "$ADB" ]]; then
  echo "adb não encontrado no PATH — nada a medir."
  exit 1
fi

echo "=== Zittodb: medição pontual (spec §15) ==="

# Tempo de descoberta de dispositivos.
t0=$(date +%s%N)
out=$("$ADB" devices 2>&1)
t1=$(date +%s%N)
echo "adb devices:          $(( (t1 - t0) / 1000000 )) ms"
echo "$out" | sed 's/^/    /'

# get-state por dispositivo (o caminho mais rápido de verificação de saúde).
count=$(echo "$out" | awk 'NR>1 && $2=="device"{c++} END{print c+0}')
if [[ "$count" -gt 0 && "$count" -le 8 ]]; then
  total=0
  while read -r serial _state _; do
    [[ "$_state" == "device" ]] || continue
    a=$(date +%s%N)
    "$ADB" -s "$serial" get-state >/dev/null 2>&1
    b=$(date +%s%N)
    echo "get-state $serial:  $(( (b - a) / 1000000 )) ms"
    total=$(( total + (b - a) ))
  done < <(echo "$out" | awk 'NR>1 && $2=="device" {print $1, $2}')
  echo "média por device:   $(( total / 1000000 / count )) ms  ($count devices)"
else
  echo "nenhum dispositivo 'device' para medir get-state"
fi

# Memória do próprio processo (pico) — sem coletor contínuo.
echo "RSS deste script:     $(awk '/VmRSS/{print $2" kB"}' /proc/$$/status 2>/dev/null || echo "n/d")"

# Dica de modo de desempenho para máquinas modestas.
mem_mb=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}')
if [[ -n "${mem_mb:-}" && "$mem_mb" -le 3072 ]]; then
  echo "ℹ RAM total ≤ 3 GB detectada → use Configurações → Modo de desempenho: 'low' (ou 'ultra')."
fi

echo "=== fim ==="
