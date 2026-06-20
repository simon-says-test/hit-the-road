# Hit the Road

A 2D top-down vehicular combat game built with TypeScript, Vite, and Phaser 3.

Drive freely across a post-apocalyptic wasteland road, dodge or shoot hostile traffic, scavenge pickups, and survive as far as you can. Art/audio are a mix of loaded CC0 assets and procedural generation — see [CREDITS.md](CREDITS.md).

## Controls

- W / Up — accelerate
- S / Down — brake, then reverse
- A / Left — steer left
- D / Right — steer right
- Shift — drift (sharper turns, costs speed)
- 1 / 2 / 3 — select rocket launcher / side guns / turret
- Space — fire (rocket, side guns); click — fire (turret, aims at the pointer)
- Space or tap — restart after a crash

## Getting started

```bash
npm install
npm run dev
```

This starts a local dev server (default http://localhost:5173) with hot reload.

## Build

```bash
npm run build
npm run preview
```

## Tests

```bash
npm test
```

Unit tests (Vitest) cover pure gameplay logic: handling/drift physics, weapon ammo/cooldown/aim state, and enemy AI steering. Phaser scene/rendering behavior is still verified by playing through `npm run dev`.

## Project structure

- [src/main.ts](src/main.ts) — Phaser game config and bootstrap
- [src/config.ts](src/config.ts) — tunable gameplay numbers (handling, enemy archetypes, weapons, pickups, hazards)
- [src/entities/PlayerCar.ts](src/entities/PlayerCar.ts) / [playerPhysics.ts](src/entities/playerPhysics.ts) — handling, health, drift
- [src/entities/weapons.ts](src/entities/weapons.ts) — ammo/cooldown/aim state for all three weapons
- [src/entities/EnemyCar.ts](src/entities/EnemyCar.ts) / [enemyBehaviors.ts](src/entities/enemyBehaviors.ts) — archetypes and their AI steering
- [src/entities/Projectile.ts](src/entities/Projectile.ts), [Pickup.ts](src/entities/Pickup.ts), [Hazard.ts](src/entities/Hazard.ts) — pooled world objects
- [src/scenes/BootScene.ts](src/scenes/BootScene.ts) — loads art/audio assets, procedurally draws the road
- [src/scenes/GameScene.ts](src/scenes/GameScene.ts) — orchestrates spawning, combat, scoring, HUD, input wiring, game over
- [public/assets/](public/assets/) — loaded CC0 art/audio (see [CREDITS.md](CREDITS.md))
