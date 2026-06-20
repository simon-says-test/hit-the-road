# Troubleshooting

Notes on issues hit while working in this environment, kept so future sessions don't re-derive them from scratch.

## `node`/`npm`/`npx` not found in a fresh shell

This container has `nvm` installed but doesn't source it in non-interactive bash shells. Every command needs:

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
```

`scripts/setup-headless-chromium.sh` does this for itself already.

## Headless Chromium (Playwright) for visual verification — no sudo, no GUI

This is WSL with no GUI and no passwordless `sudo`, so `npx playwright install --with-deps` fails (can't apt-install system libs), and even a plain `chromium.launch()` fails with `error while loading shared libraries: libnspr4.so: ...` (and several more, one at a time as each is resolved).

Fix: `scripts/setup-headless-chromium.sh` downloads the Playwright Chromium build, then fetches the missing `.deb`s with `apt-get download` (no `sudo`, no system install) and extracts them to `~/.cache/hit-the-road/headless-chromium-libs`. Export `LD_LIBRARY_PATH` to that path before launching. Don't run any of this by hand — `scripts/playtest-up.sh` / `scripts/playtest-down.sh` wrap the whole setup+launch+teardown dance into two commands; see `.claude/skills/playtest/SKILL.md`.

The missing-libs list (found by iterating `ldd` against the binary one error at a time): `libnspr4`, `libnss3`, `libatk1.0-0`, `libatk-bridge2.0-0`, `libxcomposite1`, `libxdamage1`, `libxfixes3`, `libxrandr2`, `libgbm1`, `libxkbcommon0`, `libasound2`, `libatspi2.0-0`, `libxrender1`, `libwayland-server0`, `libxcb-randr0`, `libxi6`. If a future Playwright/Chromium version needs others, run `ldd <path-to-chrome-headless-shell> | grep "not found"` and add them to the script.

**This setup felt like it was "taking ages every time"**, but it wasn't actually re-downloading anything — `~/.cache/ms-playwright/` (the ~650MB Chromium binary) and `~/.cache/hit-the-road/headless-chromium-libs/` (the extracted `.deb`s) both persist on disk and survive across calls within the same container. What was actually slow was unconditionally shelling out to `npx playwright install chromium` every time just to have it say "already installed" — `setup-headless-chromium.sh` now checks `require('playwright').chromium.executablePath()` first and skips `npx` entirely when that file already exists, which cut a re-run from ~1.5s+npx-startup-overhead down to near-instant. The real ~650MB download only happens once per fresh container; if it ever feels slow again, check `ls ~/.cache/ms-playwright` before assuming the script regressed.

## Downloading a free asset from itch.io programmatically

itch.io's download button is JS-driven, not a plain link — `curl` alone won't get the file. Two traps, in order:

1. A cookie-consent overlay covers the page on first load and silently blocks clicks even though Playwright reports the click as successful. Dismiss it first (`page.locator("text=Consent").click()`).
2. There are *two* download buttons in the DOM: `.direct_download_btn` (hidden, a fallback) and `.download_btn` (the real, visible one, an `<a>` tag). Click `.download_btn` and `await page.waitForEvent("download")` around it.

Kenney.nl, by contrast, has plain direct-download URLs on its asset pages (e.g. `kenney.nl/media/pages/assets/<slug>/<hash>/kenney_<slug>.zip`) that work with a plain `curl` — no browser automation needed. Prefer Kenney-style sources when an equivalent CC0 pack exists; only reach for the Playwright dance when the source requires it.

## No image processing tools preinstalled

No `ImageMagick`/`convert`, no `ffmpeg`, no `pip3`/Pillow in this container. For one-off or repeatable image work (resize/rotate/recolor source art), `npm install -D sharp` and write a small Node script (see `scripts/process-car-sprites.mjs`) rather than hunting for a CLI tool that isn't there.

## Background command exit codes look like failures but aren't

`pkill -f ...` (and similar) can return a nonzero exit code (e.g. 144) even when it did what was asked. If chained with `&&`/`;` in one Bash call, this can silently abort the rest of the chain (e.g. cleanup `rm` commands after a `pkill`) without obvious output explaining why. Run cleanup steps as their own separate Bash calls after anything that stops a background process, and verify with `ls`/`ps`/`curl` rather than trusting the chain ran to completion.
