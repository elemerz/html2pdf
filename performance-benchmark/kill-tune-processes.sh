#!/usr/bin/env bash
set -euo pipefail

# Stop any tuning-related processes so normal runs can start cleanly
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() {
  echo "[$(date +%H:%M:%S)] $*"
}

kill_by_pattern() {
  local pattern="$1"
  local pids=()

  if command -v pgrep >/dev/null 2>&1; then
    mapfile -t pids < <(pgrep -f "$pattern" || true)
  else
    mapfile -t pids < <(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}')
  fi

  for pid in "${pids[@]}"; do
    [[ -z "$pid" ]] && continue
    log "Killing PID $pid (match: $pattern)"
    kill "$pid" 2>/dev/null || true
    sleep 0.3
    kill -9 "$pid" 2>/dev/null || true
  done
}

kill_port() {
  local port="$1"
  local pids=()

  if command -v lsof >/dev/null 2>&1; then
    mapfile -t pids < <(lsof -t -i :"$port" || true)
  elif command -v ss >/dev/null 2>&1; then
    mapfile -t pids < <(ss -ltnp "sport = :$port" 2>/dev/null | awk -F',' '/pid=/ {for(i=1;i<=NF;i++) if($i ~ /pid=/){sub(/pid=/, "", $i); sub(/\"/, "", $i); print $i}}')
  elif command -v netstat >/dev/null 2>&1; then
    mapfile -t pids < <(netstat -anp 2>/dev/null | awk -v port=":$port" '$4 ~ port && /LISTEN/ {split($7,a,"/"); if(a[1]!="-") print a[1]}')
  fi

  for pid in "${pids[@]}"; do
    [[ -z "$pid" ]] && continue
    log "Killing PID $pid listening on port $port"
    kill "$pid" 2>/dev/null || true
    sleep 0.3
    kill -9 "$pid" 2>/dev/null || true
  done
}

log "Stopping tuning-related processes..."

kill_by_pattern "target/benchmarks.jar"
kill_by_pattern "benchmarks.jar"
kill_by_pattern "pdf-creator"
kill_by_pattern "jmh-invoice-bench"

kill_port 6969

rm -rf /tmp/jmh-invoice-bench* 2>/dev/null || true

log "Cleanup complete. You can re-run the invoicing stack."