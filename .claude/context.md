# Hit the Road — Quick-Reference Context

Condensed map of the codebase for fast orientation at session start, so exploration (grep/Explore agents) is only needed for things *not* covered here. Source of truth for anything below is the actual code/docs — if this drifts from what you read in a file, trust the file and flag the drift.

- **Policy/process** (testing requirements, asset rules, commit conventions, prompt-reduction habits): [`CLAUDE.md`](../CLAUDE.md) — not duplicated here.
- **Gameplay/feature spec** (intended behavior, controls, balance intent): [`docs/gameplay.md`](../docs/gameplay.md).
- **Architecture deep-dive** (why things are built the way they are, full reasoning trail): [`docs/high-level-design.md`](../docs/high-level-design.md).
- **Environment gotchas + fixes already solved once**: [`docs/troubleshooting.md`](../docs/troubleshooting.md) — **check this before re-debugging anything environment-related** (e.g. headless Chromium).

## Stack

TypeScript 5.5 (strict, `noUnusedLocals`/`noUnusedParameters`, ES2020 target) + Vite 5.4 + Phaser 3.80 (Arcade Physics). No other runtime deps. 2D top-down vehicular-combat racer, closed-loop procedural track, 960×600 fixed logical canvas (`CANVAS_WIDTH`/`CANVAS_HEIGHT` in `config.ts`), `Scale.FIT` letterboxes it to any real viewport.

## File map (one-liner per file)

```text
src/
  main.ts                 — Phaser.Game config: scale (FIT/CENTER_BOTH), input.activePointers, scene list
  config.ts                — ALL tunable numbers + a few pure helper fns (wallImpactDamage, weaponSidebarRowRect, nextCrateIntervalMs). Check here first for "what's the current value of X."
  utils/
    device.ts               — isMobileMode() touch-capability auto-detect (+ ?mobile=1/0 override)
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
e2e/tests/core.spec.ts      — Playwright, asserts against window.__GAME_STATE__
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

## Mobile touch controls (added recently — see `TouchControls.ts`, `utils/device.ts`)

- Auto-detected via `isMobileMode()`; force with `?mobile=1` / `?mobile=0` (handy for testing without real touch hardware).
- Virtual joystick: fixed bottom-left, drives the *same* `accelerate/brake/left/right` booleans keyboard does (digital threshold against a deadzone, not analog) — `playerPhysics.ts` needed zero changes.
- Fire button: bottom-right, fires rocket/side-guns; hidden while turret equipped (turret doesn't use it).
- Turret aim/fire: resolved via `TouchControls.getTurretAimPointer()` (scans `scene.input.manager.pointers`, excludes the joystick's pointer + UI zones) — works for both mouse (desktop) and multi-touch (mobile, lets one thumb stay on the joystick while the other taps/holds to aim). Requires `input.activePointers: 2` in `main.ts`'s Phaser config.
- Weapon sidebar is tappable/clickable on **both** platforms (`weaponSidebarRowRect()` in `config.ts` is the one shared hit-rect source, used by both the HUD highlight draw and the tap hit-test).
- No touch equivalent for drift (Shift) yet — open question, see high-level-design.md's Open questions.

## Camera (both platforms)

Zoom (`CAMERA.zoom`/`mobileZoom`) set once in `create()`; per-frame look-ahead offset in `GameScene.updateCameraLookAhead()` biases the follow target toward current heading, scaled by speed, via `setFollowOffset(-lookAheadX, -lookAheadY)` (note the **negative** sign — Phaser centers on `target - offset`).

## Impact feel (tuned to favor speed-loss over raw damage)

Three independent impact paths, all in `config.ts`: `OBSTACLES` (small rocks — one-time bump, despawns), `COLLISION_SHUNT` (ramming — closing-speed-derived shunt + enemy damage), `WALLS.impactSpeedPenaltyFactor` (one-time speed cut on the same rising edge as the existing one-time wall damage, on top of the wall's continuous scraping drag). Obstacle texture size is driven entirely by `OBSTACLES.size` — no other hardcoded pixel value or physics-body size to keep in sync.

## Testing — commands & gotchas

- `npm test` — Vitest, pure-logic unit tests (`playerPhysics`, `weapons`, `enemyBehaviors`, `track`, `config`). Fast, no browser.
- `npm run test:e2e` — Playwright against `window.__GAME_STATE__` (needs `?e2e=1` or `window.__E2E_TEST__`). **In this sandboxed/no-sudo/no-GUI environment, headless Chromium fails on missing shared libs (`libnspr4.so` etc.) unless you first run:**

  ``` bash
  bash scripts/setup-headless-chromium.sh
  export LD_LIBRARY_PATH="$HOME/.cache/hit-the-road/headless-chromium-libs/usr/lib/x86_64-linux-gnu"
  ```

  (Setup is idempotent/cached — only slow the very first time per container.) Full detail: `docs/troubleshooting.md`.
- `?seed=N` — deterministic track/AI/hazard rolls for reproducible e2e assertions (`createSeededRng`, every `Math.random()` in `GameScene` goes through `this.rng` instead).
- `playtest` skill — headless-Chromium scripted/visual verification of actual gameplay (not just state assertions); use a fixed scratch script filename across a debugging session, not a new one per iteration (see CLAUDE.md's prompt-reduction notes).
- `npx tsc --noEmit` — typecheck (strict; unused-locals/params errors are real, not noise — parameter properties exempt unused-param checks but you still need to actually use them somewhere if declared `private`).

## When extending this file

Keep entries dense and structural (file → purpose, convention → why), not narrative — that's what the docs/ files are for. If a section here would just restate something `docs/high-level-design.md`/`gameplay.md` already says in depth, link to it instead of re-explaining. Update this file when a new `systems/`/`entities/` module lands or a cross-cutting convention changes, not for routine config-number tuning (config.ts is already the source of truth for current values).
