#!/usr/bin/env bash
# One-command launch for headless playtesting: sources nvm if needed, runs the
# (idempotent, fast-after-first-run) Chromium setup, starts the Vite dev
# server in the background, and waits for it to respond. Prints the
# LD_LIBRARY_PATH a driver script needs to export before calling
# `chromium.launch()`. Pair with scripts/playtest-down.sh when done.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v npx >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi

./scripts/setup-headless-chromium.sh

export LD_LIBRARY_PATH="$HOME/.cache/hit-the-road/headless-chromium-libs/usr/lib/x86_64-linux-gnu"

npm run dev > /tmp/hit-the-road-dev.log 2>&1 &
echo $! > /tmp/hit-the-road-dev.pid
timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'

echo ""
echo "Dev server ready at http://localhost:5173 (pid $(cat /tmp/hit-the-road-dev.pid), log /tmp/hit-the-road-dev.log)"
echo "Before running a Playwright driver script, export:"
echo "  export LD_LIBRARY_PATH=\"$LD_LIBRARY_PATH\""
echo "Stop everything with scripts/playtest-down.sh"
