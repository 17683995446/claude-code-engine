#!/bin/bash
# Robust daemon for resumable long-running test

cd /workspace/claude_code/group_a/code

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

while true; do
  echo "[$(date -Iseconds)] Starting long_run_resume.js..."
  node --expose-gc dist/long_run_resume.js >> "$LOG_DIR/long_run_stdout.log" 2>&1 || true
  EXIT_CODE=$?
  echo "[$(date -Iseconds)] Process exited with code $EXIT_CODE. Restarting in 3s..."
  sleep 3
done
