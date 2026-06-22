import Phaser from "phaser";
import { PlayerInput } from "../entities/PlayerCar";
import { WeaponId } from "../config";

type KeyName = "W" | "S" | "A" | "D" | "UP" | "DOWN" | "LEFT" | "RIGHT" | "SHIFT" | "SPACE" | "R";

// Per-frame track/hazard context GameScene already has to compute itself
// (wall clamping, the explicit hazard-overlap check) — not something input
// "polls," so it's passed in fresh each call rather than tracked here.
export interface TrackContext {
  onRoughTerrain: boolean;
  oilSlicked: boolean;
  oilDriftBias: number;
  lateralOffset: number;
  pavedHalfWidth: number;
  leftWallDist: number;
  rightWallDist: number;
}

// Owns keyboard key registration/polling and weapon-select key bindings.
// Touch/pointer firing (turret) is read directly off scene.input.activePointer
// by GameScene's firing logic, same as before — there's no separate touch
// path to unify here, just the one pointer.
export class InputHandler {
  private keys: Record<KeyName, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene, onWeaponSelect: (weapon: WeaponId) => void) {
    const kb = scene.input.keyboard!;
    this.keys = {
      W: kb.addKey("W"),
      S: kb.addKey("S"),
      A: kb.addKey("A"),
      D: kb.addKey("D"),
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      LEFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      RIGHT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      SHIFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      SPACE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      R: kb.addKey("R"),
    };
    kb.on("keydown-ONE", () => onWeaponSelect("rocket"));
    kb.on("keydown-TWO", () => onWeaponSelect("sideguns"));
    kb.on("keydown-THREE", () => onWeaponSelect("turret"));
  }

  getPlayerInput(track: TrackContext): PlayerInput {
    return {
      accelerate: this.keys.W.isDown || this.keys.UP.isDown,
      brake: this.keys.S.isDown || this.keys.DOWN.isDown,
      left: this.keys.A.isDown || this.keys.LEFT.isDown,
      right: this.keys.D.isDown || this.keys.RIGHT.isDown,
      drift: this.keys.SHIFT.isDown,
      ...track,
    };
  }

  isFirePressed(): boolean {
    return this.keys.SPACE.isDown;
  }

  // JustDown (not isDown) so holding R through a scene restart can't
  // immediately re-trigger another restart on the new scene's first frame —
  // see GameScene's mid-race restart button for the gating this feeds into.
  isRestartJustPressed(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.R);
  }
}
