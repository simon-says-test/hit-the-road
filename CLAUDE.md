# Hit the Road — Claude Guidelines

2D top-down driving game: TypeScript + Vite + Phaser 3. This is an early, minimal build — expect it to grow into a more sophisticated game (more enemy types, power-ups, levels, etc.), so favor structure that scales over the current flat style.

## Specification

The `docs` folder contains specification documents (e.g. `specification.md`) describing intended gameplay, controls, and features. Code and spec must be kept in sync in both directions: if you change behavior in code, update the spec to match in the same change; if the spec is edited — by you or by the user — to describe new or changed behavior, treat that as a task to implement in code, not just documentation, and call out explicitly if you're updating the spec without implementing it yet (or vice versa). If you notice the two have already drifted apart, flag the mismatch rather than silently picking one side.

## Assets

- Loaded image/audio assets are allowed — this project no longer requires staying purely procedural. Prefer one coherent, consistently-licensed pack (e.g. CC0) over mixing sources with different art styles/resolutions; visual consistency matters more than using every available source.
- Keep the existing separation regardless of source: gameplay scenes and entities (`GameScene.ts`, `PlayerCar.ts`, etc.) should only ever reference texture/sound keys, never load or generate art/audio themselves. `BootScene.ts` remains the single place that does so — via `this.load.image()`/`this.load.audio()` for loaded assets, or `Graphics.generateTexture()`/runtime synthesis for anything still generated procedurally (placeholders, quick prototyping, simple UI/VFX not worth sourcing).
- Store loaded asset files under `public/assets/` so Vite serves them as static files, referenced by path from `BootScene.preload()`.
- Track license/attribution requirements for anything that isn't CC0/public domain (e.g. a `CREDITS.md`).

## Code organization

- Once a game object has non-trivial behavior (movement, state, collision response), give it its own class instead of inlining it in a scene — e.g. `src/entities/PlayerCar.ts`, `EnemyCar.ts`. Scene files orchestrate (spawning, lifecycle, input wiring); entities own their behavior.
- Centralize tunable gameplay numbers (speeds, spawn rates, lane geometry, scoring curve) in one config module (e.g. `src/config.ts`) rather than scattering constants across scene files, so balancing the game doesn't require hunting through code.

## Phaser specifics

- Drive all movement/timing off `update(time, delta)`'s `delta`, never frame counts — already done in `GameScene`, keep it that way as new mechanics are added.
- Enemies, projectiles, pickups, and hazards are all pooled Arcade Physics groups (`group.get()` + `setActive`/`setVisible` + a `spawn()`/`despawn()` reset method instead of destroy/recreate) — keep new spawned-object types in this pattern rather than reverting to per-spawn `destroy()`.

## Input

- Keep new controls working through both existing input paths (keyboard: arrows/A/D/Space, and touch/pointer) rather than adding keyboard-only or touch-only features.

## Testing

- Use Vitest for unit tests (TS-native, shares the Vite config/transform pipeline). Add tests for extracted pure logic — entity movement/handling math, AI behaviors, weapon aim/fire math, scoring/difficulty curve — as that logic lands in `src/entities/`/`src/config.ts`, rather than deferring indefinitely.
- Phaser scene wiring, rendering, and input plumbing aren't worth unit-testing — verify those by running `npm run dev` and playing through the affected behavior (movement, collisions, scoring, restart) plus any new feature's edge cases.

## Troubleshooting

- If you hit any issues debugging, testing etc. make a note of your solution in `docs/troubleshooting.md` to help you next time.
- Reference `docs/troubleshooting.md`  for techniques on how to solve issues encountered.
