---
description: Launch Hit the Road's Vite dev server and drive it with headless Playwright Chromium to visually verify gameplay changes. Use this whenever asked to run, playtest, or verify the game in this sandboxed Linux/WSL container (no GUI, no sudo).
---

# Playtesting Hit the Road headlessly

This is a Phaser/Canvas game: there's no DOM text or API to assert against, so
"verify it works" means launch the dev server, drive a headless browser with
real keyboard/mouse input, and read back screenshots + console errors.

## Launch

```bash
./scripts/playtest-up.sh
```

One command does everything: sources `nvm` if needed, runs the Chromium
setup (see below), starts the Vite dev server in the background, and waits
for it to answer on `:5173`. It prints the `LD_LIBRARY_PATH` line to export
before launching headless Chromium — copy that into your driver script's
shell, or just `export` it directly:

```bash
export LD_LIBRARY_PATH="$HOME/.cache/hit-the-road/headless-chromium-libs/usr/lib/x86_64-linux-gnu"
```

Stop everything with `./scripts/playtest-down.sh` when done (or the next run
hits `EADDRINUSE`). This only kills the dev server — it never touches the
Chromium/shared-lib caches below, those are meant to survive.

### What `playtest-up.sh` does under the hood (and why it's fast after the first run)

`scripts/setup-headless-chromium.sh` installs the Playwright Chromium build
and — since this container has no `sudo` and is missing several shared
libraries Chromium needs (`libnspr4`, `libnss3`, `libgbm1`, etc.) — downloads
those `.deb` packages with `apt-get download` (no install) and extracts them
into `~/.cache/hit-the-road/headless-chromium-libs`, *not* system-wide.

Both the Chromium binary (`~/.cache/ms-playwright/`) and the extracted libs
(`~/.cache/hit-the-road/headless-chromium-libs/`) persist on disk and are
reused on every later call **within the same container** — the script checks
for them first and skips straight past the download/install work if they're
already there (confirmed: a no-op re-run finishes in ~1-2s). The only time
this is actually slow is the very first run in a brand-new container, where
there's a real ~650MB download; that's an environment cost, not something
the script can avoid. If a run feels slow, check whether `~/.cache/ms-playwright`
already has a `chromium-*` directory before assuming something's broken.

## Drive

`playwright` is already a devDependency. Write a small script and run it with
`node` *from the repo root* (so it resolves `playwright` from
`node_modules` — running from `/tmp` will fail to resolve the import).
Minimal template:

```js
import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:5173");
await page.waitForTimeout(1500); // BootScene texture+audio generation

async function press(keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

// ...drive with press(["w"], ms), page.mouse.move(x, y), page.mouse.down()/up()...

await page.screenshot({ path: "/tmp/screenshot.png" });
console.log("CONSOLE_ERRORS:", JSON.stringify(errors));
await browser.close();
```

Then `Read` the screenshot PNG(s) to inspect the result visually.

## Gotchas

- `node`/`npm`/`npx` aren't on `PATH` in a fresh non-interactive shell here — `nvm` is installed but not auto-sourced. `playtest-up.sh` sources it for itself, but your own driver-script invocation still needs `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"` first.
- Game state lives only on the Phaser canvas — there's no DOM text to read
  (e.g. "Game Over" is canvas-drawn, not an HTML element). Verify via
  screenshots, not `page.textContent()` / `wait-for text=...`.
- Playwright key names: lowercase single chars (`"w"`, `"a"`, `"1"`), but
  named keys are capitalized (`"Shift"`, `"Space"`).
- The turret weapon aims at the pointer position every frame regardless of
  button state, but only fires while held down — use `page.mouse.move(x, y)`
  to aim, then `page.mouse.down()` to fire.
- Always `await page.waitForTimeout(~1500)` after `goto()` before interacting
  — `BootScene` loads all art/audio assets before starting `GameScene`.
