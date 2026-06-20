#!/usr/bin/env bash
# Idempotent setup for driving this game with headless Playwright Chromium in
# environments with no GUI and no sudo (e.g. this WSL container): installs the
# Playwright Chromium build, then downloads (via `apt-get download`, no install)
# the handful of shared libraries Ubuntu's base image is missing and extracts
# them locally rather than system-wide.
set -euo pipefail

if ! command -v npx >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # This container doesn't source nvm in non-interactive shells by default.
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi

LIBS_DIR="$HOME/.cache/hit-the-road/headless-chromium-libs"
LIB_PATH="$LIBS_DIR/usr/lib/x86_64-linux-gnu"

CHROMIUM_EXE=""
if command -v node >/dev/null 2>&1; then
  CHROMIUM_EXE=$(node -e "try{process.stdout.write(require('playwright').chromium.executablePath())}catch(e){}" 2>/dev/null || true)
fi

if [ -n "$CHROMIUM_EXE" ] && [ -x "$CHROMIUM_EXE" ]; then
  echo "Playwright Chromium binary already present at $CHROMIUM_EXE"
else
  echo "Installing Playwright Chromium browser binary..."
  npx playwright install chromium
fi

if [ ! -f "$LIB_PATH/libnspr4.so" ]; then
  echo "Fetching missing shared libraries (no sudo, extracted to $LIBS_DIR)..."
  mkdir -p "$LIBS_DIR"
  workdir=$(mktemp -d)
  (cd "$workdir" && apt-get download \
    libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libasound2 libatspi2.0-0 \
    libxrender1 libwayland-server0 libxcb-randr0 libxi6)
  for f in "$workdir"/*.deb; do dpkg-deb -x "$f" "$LIBS_DIR"; done
  rm -rf "$workdir"
else
  echo "Shared libraries already present at $LIB_PATH"
fi

echo ""
echo "Setup complete. Before launching headless Chromium, export:"
echo "  export LD_LIBRARY_PATH=\"$LIB_PATH\""
