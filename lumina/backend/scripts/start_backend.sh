#!/usr/bin/env bash
# Start both backend services for Lumina (web HTTP + OpenClaw MCP).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")/app"

cd "$APP_DIR"

if [[ ! -d "../.venv" ]]; then
  echo "Create a venv first: python -m venv ../.venv && source ../.venv/bin/activate && pip install -r ../requirements.txt"
  exit 1
fi

source "../.venv/bin/activate"

export MCP_TRANSPORT="${MCP_TRANSPORT:-streamable-http}"
export MCP_HOST="${MCP_HOST:-0.0.0.0}"
export MCP_PORT="${MCP_PORT:-8001}"

echo "Starting MCP server on http://${MCP_HOST}:${MCP_PORT}/mcp"
python server.py &
MCP_PID=$!

echo "Starting HTTP API on http://0.0.0.0:8000"
uvicorn http_api:app --host 0.0.0.0 --port 8000 &
HTTP_PID=$!

cleanup() {
  kill "$MCP_PID" "$HTTP_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "MCP PID=$MCP_PID  HTTP PID=$HTTP_PID"
echo "Press Ctrl+C to stop both."
wait
