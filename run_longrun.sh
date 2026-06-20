#!/bin/bash
# Daemon script for 5-hour long-running stability test
set -e

cd /workspace/claude_code/group_a/code

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

# Clean up old long_run logs older than 1 day
find "$LOG_DIR" -name "long_run_*.log" -mtime +1 -delete 2>/dev/null || true

# Run loop: if the process exits for any reason, restart it
while true; do
  echo "[$(date -Iseconds)] Starting long_run.js with node..."
  node --expose-gc dist/long_run.js > "$LOG_DIR/long_run_stdout.log" 2>&1
  EXIT_CODE=$?
  echo "[$(date -Iseconds)] Process exited with code $EXIT_CODE. Restarting in 5s..."
  sleep 5
done
