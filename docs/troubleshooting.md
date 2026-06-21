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

## Phaser camera zoom silently breaks `setScrollFactor(0)` HUD/touch hit-testing

Adding a non-1 `cameras.main.setZoom()` (for the mobile/desktop camera look-ahead feature) made every screen-anchored HUD element and the new virtual joystick/fire button render at the *wrong* screen position, even though they all use `setScrollFactor(0)`. `scrollFactor(0)` only cancels out camera **scroll** — `zoom` is a separate multiplicative transform that still applies to scrollFactor(0) objects, displacing them toward/away from the camera's viewport center by `(rawPos - center) * zoom`. Pointer hit-testing (`pointer.x/y`) is *not* affected by zoom (it's always true logical-canvas screen space), so the practical symptom is exactly "the joystick/button render in one place but tapping there does nothing, and the *actual* hit-test zone is somewhere else entirely" — confirmed empirically: `screenX = centerX + (configX - centerX) * zoom` matched the observed displacement to the pixel.

Fix (see `src/utils/cameraLayers.ts`, `GameScene.uiCamera`): add a second camera (`this.cameras.add(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)`, left at its default zoom=1/scroll=(0,0)) dedicated to UI. Every *world* object (cars, projectiles, hazards, pickups, the track graphic, explosion fx) calls `ignoreInUiCamera(scene, this)` once at construction — has to be per-object at construction time, not a one-off `camera.ignore(group)` in `create()`, because pooled groups (projectiles especially) grow lazily over the race and a one-off call would miss anything constructed later. Every *HUD/touch-control* object gets excluded from `cameras.main` instead, once, right after `HudSystem`/`TouchControls`/the overlay are constructed (`cameras.main.ignore(hud.getUiLayer())` etc.) — collecting HudSystem's many individual Text/Graphics objects into one `scene.add.layer()` made this a single call instead of dozens.

**Don't trust a synthetic test that dispatches touches at the exact config coordinate** — it'll pass even with this exact bug present, since the hit-test math and the dispatched coordinate are both the *raw* (unzoomed) value; it never exercises the actual rendered position. This is why it had to be caught by an actual screenshot, not by `window.__GAME_STATE__` assertions — consistent with this project's existing rule that visual/alignment bugs need a manual look, not a state assertion (see CLAUDE.md's Testing section).

## Simulating multi-touch in Playwright (no native multi-finger API)

Playwright's `page.touchscreen.tap(x, y)` only does a single instantaneous tap — no sustained press, no drag, no two simultaneous fingers. For a virtual-joystick-drag-while-a-second-finger-taps-elsewhere test, dispatch real `TouchEvent`s manually via `page.evaluate()`:

```js
const t = new Touch({ identifier, target: canvas, clientX, clientY, pageX, pageY, screenX, screenY });
canvas.dispatchEvent(new TouchEvent("touchstart", { touches: [...], targetTouches: [...], changedTouches: [...], bubbles: true, cancelable: true }));
```

Two traps:

1. **`pageX`/`pageY` (and ideally `screenX`/`screenY`) must be set explicitly** — the `Touch` constructor does *not* derive them from `clientX`/`clientY` automatically the way a real OS-generated touch event would. Omitting them makes Phaser's `TouchManager` resolve every pointer to `(0, 0)` — looks exactly like "touch does nothing," but it's a malformed synthetic event, not a real bug (this is what sent the camera-zoom investigation above down a false lead initially: the *first* synthetic test "failed" purely because of this, before the real zoom bug was found via a second, correctly-modeled pass).
2. **`touches`/`targetTouches` must list every currently-down finger; `changedTouches` must list only the ones changing in *this* event.** Bundling an unchanged finger into `changedTouches` on a later `touchstart` (e.g. for a second finger) misrepresents the sequence — track active touches in a `Map` across calls and rebuild both lists correctly each dispatch (see `e2e/tests/mobile.spec.ts`'s `touchSequence` helper).

Browser-context setup: `hasTouch: true` plus a `viewport` matching the game's logical canvas size (960×600) avoids needing to convert between CSS/page coordinates and game-logical coordinates (no `Scale.FIT` letterboxing to account for).

## Background command exit codes look like failures but aren't

`pkill -f ...` (and similar) can return a nonzero exit code (e.g. 144) even when it did what was asked. If chained with `&&`/`;` in one Bash call, this can silently abort the rest of the chain (e.g. cleanup `rm` commands after a `pkill`) without obvious output explaining why. Run cleanup steps as their own separate Bash calls after anything that stops a background process, and verify with `ls`/`ps`/`curl` rather than trusting the chain ran to completion.
