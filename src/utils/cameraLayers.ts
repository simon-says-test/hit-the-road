import Phaser from "phaser";

// GameScene exposes a second, unzoomed/unscrolled `uiCamera` (see
// GameScene.create()) so screen-anchored HUD/touch-control graphics render
// at a true 1:1 screen position regardless of the main camera's zoom/scroll
// — `setScrollFactor(0)` alone only cancels out *scroll*, not *zoom*, so
// without this every scrollFactor(0) object visibly drifts off its intended
// screen position whenever the main camera is zoomed (confirmed: this is
// exactly what broke touch-control hit-testing — the joystick/fire button
// rendered well away from the screen coordinates TouchControls' hit-test
// math checks against). Every world object (cars, projectiles, hazards,
// pickups, the track graphic, explosion fx) calls this once, right after
// `scene.add.existing(this)`, so it's excluded from the UI camera — this
// has to happen per-object at construction time rather than as a one-off
// `camera.ignore(group)` call in GameScene.create(), since these pools grow
// lazily over the course of a race (a one-off call would miss anything
// constructed later). Entities take a plain `Phaser.Scene`, not `GameScene`,
// so this reads `uiCamera` duck-typed off the scene rather than importing
// GameScene's class (which would be a circular import — GameScene imports
// every entity type already).
export function ignoreInUiCamera(scene: Phaser.Scene, obj: Phaser.GameObjects.GameObject): void {
  (scene as Phaser.Scene & { uiCamera?: Phaser.Cameras.Scene2D.Camera }).uiCamera?.ignore(obj);
}
