#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Ciudadan AgentOffice — office supervisor (non-Docker environments).
# A safe tmux/process alternative: PID file, no duplicates, health check.
#
#   scripts/office.sh start    # build (if needed) + start
#   scripts/office.sh stop     # graceful stop
#   scripts/office.sh restart  # stop + start
#   scripts/office.sh status   # process + health info
#   scripts/office.sh health   # exit 0 if healthy
#   scripts/office.sh logs    # tail the log
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/packages/server/.office.pid"
LOG_FILE="$ROOT/packages/server/office.log"
PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"

is_running() {
    [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

cmd_start() {
    if is_running; then
        echo "✅ Already running (pid $(cat "$PID_FILE"))."
        return 0
    fi
    if curl -s -m 2 "http://$HOST:$PORT/api/health" >/dev/null 2>&1; then
        echo "⚠ Port $PORT responds but no PID file — another instance may exist. Not starting a duplicate."
        exit 1
    fi
    echo "📦 Building (if needed)…"
    (cd "$ROOT" && npm run build --workspace=@agent-office/core --workspace=@agent-office/adapters --workspace=@agent-office/ui --workspace=@agent-office/server >/dev/null 2>&1) || true
    echo "🚀 Starting Ciudadan AgentOffice on $HOST:$PORT…"
    (cd "$ROOT/packages/server" && nohup node dist/index.js >> "$LOG_FILE" 2>&1 & echo $! > "$PID_FILE")
    sleep 2
    cmd_health && echo "✅ Started (pid $(cat "$PID_FILE")). Log: $LOG_FILE"
}

cmd_stop() {
    if is_running; then
        local pid; pid="$(cat "$PID_FILE")"
        echo "🛑 Stopping (pid $pid)…"
        kill "$pid" 2>/dev/null || true
        for i in $(seq 1 10); do
            kill -0 "$pid" 2>/dev/null || break
            sleep 1
        done
        kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        rm -f "$PID_FILE"
        echo "✅ Stopped."
    else
        echo "ℹ Not running."
        rm -f "$PID_FILE"
    fi
}

cmd_health() {
    if curl -sf -m 3 "http://$HOST:$PORT/api/health" | grep -q '"ok":true'; then
        return 0
    fi
    return 1
}

cmd_status() {
    if is_running; then
        echo "🟢 Running (pid $(cat "$PID_FILE"))."
    else
        echo "🔴 Not running."
    fi
    if cmd_health; then
        echo "🟢 Health: OK ($(curl -s -m 3 "http://$HOST:$PORT/api/health"))"
    else
        echo "🔴 Health: no response on $HOST:$PORT"
    fi
}

case "${1:-}" in
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    restart) cmd_stop; cmd_start ;;
    status)  cmd_status ;;
    health)  cmd_health && echo "🟢 healthy" || { echo "🔴 unhealthy"; exit 1; } ;;
    logs)    tail -n 100 -f "$LOG_FILE" ;;
    *) echo "Uso: $0 {start|stop|restart|status|health|logs}"; exit 1 ;;
esac
