#!/usr/bin/env bash
# Stops the dev server started by scripts/playtest-up.sh. Does not touch the
# Playwright/Chromium caches — those are meant to persist between runs.
set -uo pipefail

if [ -f /tmp/hit-the-road-dev.pid ]; then
  kill "$(cat /tmp/hit-the-road-dev.pid)" 2>/dev/null
  rm -f /tmp/hit-the-road-dev.pid
  echo "Dev server stopped."
else
  echo "No /tmp/hit-the-road-dev.pid found — nothing to stop."
fi
rm -f /tmp/hit-the-road-dev.log
