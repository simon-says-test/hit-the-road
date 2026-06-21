import Phaser from "phaser";
import { WeaponId, MOBILE_CONTROLS, DEPTHS, weaponSidebarRowRect } from "../config";
import { isMobileMode } from "../utils/device";

const WEAPON_IDS: WeaponId[] = ["rocket", "sideguns", "turret"];

export interface TouchMoveInput {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
}

// Owns every touch-only on-screen control (virtual joystick, fire button)
// plus two platform-agnostic bits that exist for mouse too: tapping the
// weapon sidebar to switch weapons, and resolving which pointer (if any)
// should aim/fire the turret this frame. The joystick/fire-button graphics
// and their pointer handling are only active when isMobileMode() (see
// utils/device.ts), but sidebar-tap and turret-pointer resolution run
// unconditionally — a mouse click on the sidebar should switch weapons
// rather than also being misread as "fire the turret here" (see
// getTurretAimPointer), which was a latent quirk of reading
// scene.input.activePointer.isDown unconditionally for turret fire.
export class TouchControls {
  private readonly enabled = isMobileMode();
  private graphics?: Phaser.GameObjects.Graphics;

  private joystickPointerId: number | null = null;
  private joystickVector = { x: 0, y: 0 };

  private fireButtonPointerId: number | null = null;
  private currentWeapon: WeaponId = "rocket";

  constructor(private scene: Phaser.Scene, private onWeaponSelect: (weapon: WeaponId) => void) {
    if (this.enabled) {
      this.graphics = scene.add.graphics().setDepth(DEPTHS.hud).setScrollFactor(0);
    }
    scene.input.on("pointerdown", this.handlePointerDown, this);
    scene.input.on("pointermove", this.handlePointerMove, this);
    scene.input.on("pointerup", this.handlePointerUp, this);
    scene.input.on("pointerupoutside", this.handlePointerUp, this);
  }

  private weaponRowAt(x: number, y: number): WeaponId | null {
    for (let i = 0; i < WEAPON_IDS.length; i++) {
      const r = weaponSidebarRowRect(i);
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return WEAPON_IDS[i];
    }
    return null;
  }

  private isOverJoystickZone(x: number, y: number): boolean {
    if (!this.enabled) return false;
    return Phaser.Math.Distance.Between(x, y, MOBILE_CONTROLS.joystickBaseX, MOBILE_CONTROLS.joystickBaseY) <= MOBILE_CONTROLS.joystickRadius;
  }

  // The fire button does nothing for the turret (it has its own tap-to-aim
  // fire path), so it's neither drawn nor excluded from turret aim while
  // the turret is equipped — the whole screen outside the sidebar/joystick
  // is fair game to tap-aim at in that mode.
  private isOverFireButton(x: number, y: number): boolean {
    if (!this.enabled || this.currentWeapon === "turret") return false;
    return Phaser.Math.Distance.Between(x, y, MOBILE_CONTROLS.fireButtonX, MOBILE_CONTROLS.fireButtonY) <= MOBILE_CONTROLS.fireButtonRadius;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const weapon = this.weaponRowAt(pointer.x, pointer.y);
    if (weapon) {
      this.onWeaponSelect(weapon);
      return;
    }
    if (this.enabled && this.joystickPointerId === null && this.isOverJoystickZone(pointer.x, pointer.y)) {
      this.joystickPointerId = pointer.id;
      this.updateJoystickVector(pointer);
      return;
    }
    if (this.enabled && this.fireButtonPointerId === null && this.isOverFireButton(pointer.x, pointer.y)) {
      this.fireButtonPointerId = pointer.id;
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joystickPointerId) this.updateJoystickVector(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joystickPointerId) {
      this.joystickPointerId = null;
      this.joystickVector = { x: 0, y: 0 };
    }
    if (pointer.id === this.fireButtonPointerId) this.fireButtonPointerId = null;
  }

  private updateJoystickVector(pointer: Phaser.Input.Pointer): void {
    const { joystickBaseX, joystickBaseY, joystickRadius } = MOBILE_CONTROLS;
    const dx = pointer.x - joystickBaseX;
    const dy = pointer.y - joystickBaseY;
    const dist = Math.min(joystickRadius, Math.hypot(dx, dy));
    if (dist === 0) {
      this.joystickVector = { x: 0, y: 0 };
      return;
    }
    const angle = Math.atan2(dy, dx);
    this.joystickVector = { x: (Math.cos(angle) * dist) / joystickRadius, y: (Math.sin(angle) * dist) / joystickRadius };
  }

  // Digital thresholds (not raw analog magnitude) so the joystick drives
  // the exact same accelerate/brake/left/right booleans keyboard input
  // does — playerPhysics.ts's computeDrive needs no changes for this.
  getMoveInput(): TouchMoveInput {
    if (!this.enabled) return { accelerate: false, brake: false, left: false, right: false };
    const { joystickDeadzone } = MOBILE_CONTROLS;
    return {
      accelerate: this.joystickVector.y < -joystickDeadzone,
      brake: this.joystickVector.y > joystickDeadzone,
      left: this.joystickVector.x < -joystickDeadzone,
      right: this.joystickVector.x > joystickDeadzone,
    };
  }

  isFireButtonHeld(): boolean {
    return this.fireButtonPointerId !== null;
  }

  // Returns whichever active pointer should aim/fire the turret this frame:
  // the first pointer that's down, isn't the joystick's or fire button's
  // tracked finger, and isn't currently over the sidebar/joystick/fire-
  // button zones. On desktop that's just "the mouse, unless it's over the
  // sidebar"; on mobile it's "whichever non-joystick finger is down outside
  // the UI" — which is what lets a tap aim+fire the turret even while the
  // other thumb is still on the joystick.
  getTurretAimPointer(): Phaser.Input.Pointer | null {
    for (const pointer of this.scene.input.manager.pointers) {
      if (!pointer.isDown) continue;
      if (pointer.id === this.joystickPointerId || pointer.id === this.fireButtonPointerId) continue;
      if (this.weaponRowAt(pointer.x, pointer.y)) continue;
      if (this.isOverJoystickZone(pointer.x, pointer.y)) continue;
      if (this.isOverFireButton(pointer.x, pointer.y)) continue;
      return pointer;
    }
    return null;
  }

  // Redraws the joystick/fire-button graphics (no-op when !enabled) and
  // records the equipped weapon for the fire-button-hidden-while-turret and
  // pointer-exclusion checks above.
  update(weapon: WeaponId): void {
    this.currentWeapon = weapon;
    if (!this.enabled || !this.graphics) return;

    const { joystickBaseX, joystickBaseY, joystickRadius, joystickThumbRadius, fireButtonX, fireButtonY, fireButtonRadius, baseAlpha, activeAlpha } =
      MOBILE_CONTROLS;
    const g = this.graphics;
    g.clear();

    const joystickActive = this.joystickPointerId !== null;
    g.fillStyle(0xffffff, joystickActive ? activeAlpha * 0.5 : baseAlpha * 0.5).fillCircle(joystickBaseX, joystickBaseY, joystickRadius);
    g.lineStyle(2, 0xffffff, joystickActive ? activeAlpha : baseAlpha).strokeCircle(joystickBaseX, joystickBaseY, joystickRadius);
    const thumbX = joystickBaseX + this.joystickVector.x * joystickRadius;
    const thumbY = joystickBaseY + this.joystickVector.y * joystickRadius;
    g.fillStyle(0xffffff, joystickActive ? activeAlpha : baseAlpha).fillCircle(thumbX, thumbY, joystickThumbRadius);

    if (weapon !== "turret") {
      const fireActive = this.fireButtonPointerId !== null;
      g.fillStyle(0xff5544, fireActive ? activeAlpha : baseAlpha).fillCircle(fireButtonX, fireButtonY, fireButtonRadius);
      g.lineStyle(2, 0xffffff, baseAlpha).strokeCircle(fireButtonX, fireButtonY, fireButtonRadius);
    }
  }
}
