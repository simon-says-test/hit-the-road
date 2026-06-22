# Hit the Road — Quick-Reference Context

Condensed map of the codebase for fast orientation at session start, so exploration (grep/Explore agents) is only needed for things *not* covered here. Source of truth for anything below is the actual code/docs — if this drifts from what you read in a file, trust the file and flag the drift.

- **Policy/process** (testing requirements, asset rules, commit conventions, prompt-reduction habits): [`CLAUDE.md`](../CLAUDE.md) — not duplicated here.
- **Gameplay/feature spec** (intended behavior, controls, balance intent): [`docs/gameplay.md`](../docs/gameplay.md).
- **Architecture deep-dive** (why things are built the way they are, full reasoning trail): [`docs/high-level-design.md`](../docs/high-level-design.md).
- **Environment gotchas + fixes already solved once**: [`docs/troubleshooting.md`](../docs/troubleshooting.md) — **check this before re-debugging anything environment-related** (e.g. headless Chromium).

## Stack

TypeScript 5.5 (strict, `noUnusedLocals`/`noUnusedParameters`, ES2020 target) + Vite 5.4 + Phaser 3.80 (Arcade Physics). No other runtime deps. 2D top-down vehicular-combat racer, closed-loop procedural track. Fixed logical canvas, but **two sizes**: 960×600 landscape on desktop (`CANVAS_WIDTH`/`CANVAS_HEIGHT`), 600×960 portrait on mobile (`MOBILE_CANVAS_WIDTH`/`MOBILE_CANVAS_HEIGHT`) — `main.ts` picks between them via `isMobileMode()` at boot. `Scale.FIT` letterboxes whichever one to the real viewport. **Layout code should read `scene.scale.width/height`, not import a static constant** — see the convention bullet below, it's an easy trap.

## File map (one-liner per file)

```text
src/
  main.ts                 — Phaser.Game config: scale (FIT/CENTER_BOTH), input.activePointers, scene list; ONLY place that calls isMobileMode() to pick the desktop vs. mobile canvas size
  config.ts                — ALL tunable numbers + a few pure helper fns (wallImpactDamage, weaponSidebarRowRect, sidebarOrigin, nextCrateIntervalMs). Check here first for "what's the current value of X."
  utils/
    device.ts               — isMobileMode() touch-capability auto-detect (+ ?mobile=1/0 override)
    cameraLayers.ts          — ignoreInUiCamera(scene, obj): excludes a world object from GameScene.uiCamera (see Camera/UI-camera section below)
  entities/
    PlayerCar.ts             — Phaser wrapper: heading/speed/health/drift/weapon-select, applies playerPhysics to the sprite
    playerPhysics.ts          — pure handling math (Phaser-free, unit-tested): accel/brake/reverse, heading-based steer, drift slip, off-road/wall/terrain drag
    weapons.ts                — WeaponController: pure ammo/cooldown/sweep/turret-spread state machine (Phaser-free, unit-tested)
    EnemyCar.ts               — Phaser wrapper: archetype, health, AI-driven 2D movement, fire timer, ram cooldown/recoil
    enemyBehaviors.ts          — pure per-archetype target-heading + turn-rate-cap + curvature-slowdown fns (Phaser-free, unit-tested)
    track.ts                  — pure closed-loop generation (Catmull-Rom → arc-length resample) + pointAt/nearestPoint/wallDistancesAt (Phaser-free, unit-tested)
    Projectile.ts / Pickup.ts / Hazard.ts — pooled sprites, no non-trivial logic of their own (driven by config + systems/)
  systems/                  — cross-cutting concerns pulled out of GameScene; each constructed once in create(), fed per-frame from update()
    RaceTracker.ts             — lap counting, live race position, bidirectional rubber-band, start/finish-seam continuity (hintS)
    HudSystem.ts               — every HUD Text/Graphics: text readouts, in-world weapon meter, health bars, weapon sidebar
    InputHandler.ts            — keyboard polling + keydown-ONE/TWO/THREE weapon-select bindings
    TouchControls.ts           — mobile virtual joystick + fire button (gated by isMobileMode()); weapon-sidebar tap-to-switch + turret aim-pointer resolution (these two run on BOTH desktop and mobile)
    CollisionHandler.ts        — pure damage/physics-resolution math for ram + weapon hits on enemies
    PickupSystem.ts            — kill-drop + timed standalone-crate spawn, collection effects, score-multiplier window
  scenes/
    BootScene.ts             — loads art/audio, procedurally draws hazard-patch/obstacle textures (road itself is drawn fresh per-race, not pre-baked)
    IntroScene.ts             — one-time controls screen → GameScene
    GameScene.ts              — orchestrates everything: spawns, per-frame update, firing, collisions, camera, game-over/finish. Reads config + delegates to systems/.
e2e/tests/core.spec.ts      — Playwright, asserts against window.__GAME_STATE__ (keyboard/mouse, default desktop viewport, 960x600 landscape)
e2e/tests/mobile.spec.ts    — Playwright, touch-emulated (test.use({hasTouch:true, viewport:600x960})), exercises TouchControls against the portrait mobile canvas
scripts/setup-headless-chromium.sh — fixes headless Chromium for this sandboxed/no-sudo environment (see Testing below)
```

## Core conventions (apply everywhere, easy to violate by accident)

- **Canvas-angle convention**: 0° = up/forward, positive = clockwise. Shared by heading, weapon aim, camera math. `vx = sin(rad)*speed`, `vy = -cos(rad)*speed`.
- **Heading vs. velocity direction are separate**: `headingDeg` (where the car points) vs `velocityHeadingDeg` (where it's actually moving) — they diverge during drift/oil-slick (slip), converge while gripping. Don't conflate them.
- **Everything timing-related uses `delta` (ms), never frame counts** — `update(time, delta)`. Any new per-frame easing/lerp should be delta-normalized (see `GameScene.updateCameraLookAhead`'s `1 - Math.pow(1 - lerp, delta/16.67)` pattern), not a flat per-frame multiply.
- **Pooling**: enemies/projectiles/hazards/pickups are all pooled Arcade groups — `group.get()` + `spawn()`/`despawn()` (reset state), never `destroy()`/recreate.
- **Render depth** is centralized in `DEPTHS` (`config.ts`) — set once per type in each entity's constructor, never left at default 0.
- **Pure logic lives in Phaser-free modules** (`playerPhysics.ts`, `weapons.ts`, `enemyBehaviors.ts`, `track.ts`) with their own `*.test.ts`; the `*Car`/entity classes are thin Phaser wrappers around them. Follow this split for new gameplay rules rather than inlining math into a scene/entity class.
- **`src/systems/`** is for scene-level cross-cutting orchestration (HUD, input, collision math, pickups) constructed once in `GameScene.create()` — extract a new one once a second instance of a concern shows up, same reasoning as the archetype/weapon data-over-subclass pattern.
- **Asset loading is BootScene-only** — gameplay/entity/scene code references texture/sound keys, never loads or generates art itself (procedural placeholders via `Graphics.generateTexture()` are also BootScene's job).
- **`setScrollFactor(0)` cancels camera *scroll*, not *zoom*.** Any new screen-anchored object (HUD/touch-control) still drifts off its intended position once `cameras.main` is zoomed unless it's also excluded from `cameras.main` (and rendered via `GameScene.uiCamera` instead, which is never zoomed/scrolled). Conversely, any new *world* object (pooled entity, ad-hoc fx) must call `ignoreInUiCamera(scene, this)` right after `scene.add.existing(this)`, or it'll double-render through the UI camera too. See Camera/UI-camera section below and `docs/troubleshooting.md` — this exact gap is what made the mobile joystick/fire button visually render in the wrong place while their hit-test math (which isn't zoom-affected) stayed correct, i.e. "looks unresponsive" without any logic bug.
- **Never import the static `CANVAS_WIDTH`/`CANVAS_HEIGHT` for layout positioning in a Scene/system.** They're the desktop-only default; mobile uses `MOBILE_CANVAS_WIDTH/HEIGHT` instead (picked in `main.ts`, the only place allowed to call `isMobileMode()` — `config.ts` itself must stay importable under Vitest's plain-Node test environment, no `window`/`navigator`). Read `scene.scale.width`/`scene.scale.height` instead — always accurate to whichever pair `main.ts` actually chose. See Portrait-by-default section below.

## Mobile touch controls (see `TouchControls.ts`, `utils/device.ts`)

- Auto-detected via `isMobileMode()`; force with `?mobile=1` / `?mobile=0` (handy for testing without real touch hardware).
- Virtual joystick: fixed bottom-left, drives the *same* `accelerate/brake/left/right` booleans keyboard does (digital threshold against a deadzone, not analog) — `playerPhysics.ts` needed zero changes. Deadzone is **per-axis** and asymmetric (`joystickDeadzoneX` 0.55 > `joystickDeadzoneY` 0.3) — steering needs a deliberately bigger push than accelerate/brake so small sideways wobble while pushing straight up doesn't misfire as a turn. `PLAYER_HANDLING.minTurnRateDeg`/`maxTurnRateDeg` were also lowered — that one's shared physics, affecting keyboard steering too, not just touch.
- Fire button: bottom-*center*-right (not the literal bottom-right corner — that's the weapon sidebar's footprint on the narrower mobile canvas), fires rocket/side-guns; hidden while turret equipped (turret doesn't use it).
- Turret aim/fire: resolved via `TouchControls.getTurretAimPointer()` (scans `scene.input.manager.pointers`, excludes the joystick's pointer + UI zones) — works for both mouse (desktop) and multi-touch (mobile, lets one thumb stay on the joystick while the other taps/holds to aim). Requires `input.activePointers: 2` in `main.ts`'s Phaser config.
- Weapon sidebar is tappable/clickable on **both** platforms (`weaponSidebarRowRect(index, originX, originYStart)` in `config.ts` is the one shared hit-rect source, used by both the HUD highlight draw and the tap hit-test — `originX/originYStart` come from `sidebarOrigin(scene.scale.width, scene.scale.height)`, resolved once per `HudSystem`/`TouchControls` construction).
- No touch equivalent for drift (Shift) yet — open question, see high-level-design.md's Open questions.

## Portrait-by-default on mobile

Mobile defaults to a portrait canvas (`MOBILE_CANVAS_WIDTH/HEIGHT`, 600×960); desktop stays landscape (`CANVAS_WIDTH/HEIGHT`, 960×600) — `main.ts` is the only place that decides which, via `isMobileMode()`. See the "never import the static CANVAS_WIDTH/HEIGHT for layout" convention bullet above and `docs/high-level-design.md`'s "Portrait-by-default on mobile" section for the full reasoning (the short version: `config.ts` can't call `isMobileMode()` itself without breaking Vitest, since it's plain Node with no `window`/`navigator`).

## Camera (both platforms) + UI camera

Zoom (`CAMERA.zoom`/`mobileZoom`) set once in `create()`; per-frame look-ahead offset in `GameScene.updateCameraLookAhead()` biases the follow target toward current heading, scaled by speed, via `setFollowOffset(-lookAheadX, -lookAheadY)` (note the **negative** sign — Phaser centers on `target - offset`).

`GameScene.uiCamera` is a second camera (zoom 1, no scroll, created first thing in `create()`) dedicated to screen-anchored HUD/touch-control rendering — see the convention bullet above for why it exists. Two-sided exclusion: world entities exclude themselves from `uiCamera` at construction (`ignoreInUiCamera`); `HudSystem`/`TouchControls`/the overlay get excluded from `cameras.main` once each, right after construction (`cameras.main.ignore(hud.getUiLayer())` etc. in `GameScene.create()`). `HudSystem.weaponMeter`/`healthBars` are the one in-`HudSystem` exception — they're world-anchored (no scrollFactor override), so they call `ignoreInUiCamera` instead of joining `hud.getUiLayer()`.

## Impact feel (tuned to favor speed-loss over raw damage)

Three independent impact paths, all in `config.ts`: `OBSTACLES` (small rocks — one-time bump, despawns), `COLLISION_SHUNT` (ramming — closing-speed-derived shunt + enemy damage), `WALLS.impactSpeedPenaltyFactor` (one-time speed cut on the same rising edge as the existing one-time wall damage, on top of the wall's continuous scraping drag). Obstacle texture size is driven entirely by `OBSTACLES.size` — no other hardcoded pixel value or physics-body size to keep in sync. **Off-road (the shoulder short of the wall) is drag-only, never a health cost** — the canyon wall itself is the only terrain that damages on contact.

## Game modes (`GameMode`, `config.ts`) and the mid-race restart button

`"arcade"` (destroy-at-zero, default) vs `"repair"` (zero health → forced stop + `REPAIR_MODE` timer → resume at half health, no destruction) — chosen once on `IntroScene`, carried through every `scene.restart()` this session via `GameScene.init(data)` falling back to its own `this.mode` field. Lives entirely inside `PlayerCar`/`EnemyCar.takeDamage()` (returns `false` instead of the destroyed/`true` signal when repairing) and the top of `drive()` (forced-stop branch) — every existing kill-handling call site (`CollisionHandler`, `GameScene.damagePlayer`/`endGame`) is unchanged, since they already just branch on `takeDamage`'s boolean. See high-level-design.md's "Game modes" section for the full reasoning, including the mid-race RESTART button (HUD + `R` key, gated on `GameScene.stationaryTimer`, independent of `GameMode`).

## Testing — commands & gotchas

- `npm test` — Vitest, pure-logic unit tests (`playerPhysics`, `weapons`, `enemyBehaviors`, `track`, `config`). Fast, no browser.
- `npm run test:e2e` — Playwright against `window.__GAME_STATE__` (needs `?e2e=1` or `window.__E2E_TEST__`). **In this sandboxed/no-sudo/no-GUI environment, headless Chromium fails on missing shared libs (`libnspr4.so` etc.) unless you first run:**

  ``` bash
  bash scripts/setup-headless-chromium.sh
  export LD_LIBRARY_PATH="$HOME/.cache/hit-the-road/headless-chromium-libs/usr/lib/x86_64-linux-gnu"
  ```

  (Setup is idempotent/cached — only slow the very first time per container.) Full detail: `docs/troubleshooting.md`.
- `?seed=N` — deterministic track/AI/hazard rolls for reproducible e2e assertions (`createSeededRng`, every `Math.random()` in `GameScene` goes through `this.rng` instead).
- `e2e/playwright.config.ts` pins `workers: 1` — tests assert on real-time-driven physics deltas over a fixed `waitForTimeout`, and concurrent headless Chromium instances in this resource-constrained sandbox starve each other's event loop enough to make that flaky. Don't remove this to "speed things up" without re-verifying stability across several runs.
- `playtest` skill — headless-Chromium scripted/visual verification of actual gameplay (not just state assertions); use a fixed scratch script filename across a debugging session, not a new one per iteration (see CLAUDE.md's prompt-reduction notes).
- `npx tsc --noEmit` — typecheck (strict; unused-locals/params errors are real, not noise — parameter properties exempt unused-param checks but you still need to actually use them somewhere if declared `private`).

## When extending this file

Keep entries dense and structural (file → purpose, convention → why), not narrative — that's what the docs/ files are for. If a section here would just restate something `docs/high-level-design.md`/`gameplay.md` already says in depth, link to it instead of re-explaining. Update this file when a new `systems/`/`entities/` module lands or a cross-cutting convention changes, not for routine config-number tuning (config.ts is already the source of truth for current values).
