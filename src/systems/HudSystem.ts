import Phaser from "phaser";
import { PlayerCar } from "../entities/PlayerCar";
import { RivalState } from "./RaceTracker";
import { sideGunAngleDeg, sideGunMountPosition } from "../entities/weapons";
import {
  WEAPON_SIDEBAR,
  WEAPON_VISUALS,
  WEAPON_METER,
  SIDE_GUN_SWEEP,
  SIDE_GUN_MOUNTS,
  TURRET_STABILITY,
  DEPTHS,
  HEALTH_BAR,
  PLAYER_HEALTH,
  WEAPONS,
  WeaponId,
  weaponSidebarRowRect,
  sidebarOrigin,
} from "../config";
import { ignoreInUiCamera } from "../utils/cameraLayers";

const WEAPON_IDS: WeaponId[] = ["rocket", "sideguns", "turret"];
const WEAPON_LABELS: Record<WeaponId, string> = { rocket: "ROCKET", sideguns: "SIDEGUNS", turret: "TURRET" };

// 11/12/13 stay "th" (not "1st"/"2nd"/"3rd") — the classic exception to the
// last-digit rule.
function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// Owns all HUD rendering: text readouts, the in-world weapon aim meter,
// player/rival health bars, and the bottom-right weapon sidebar. GameScene
// just feeds it per-frame state; all the drawing detail (sidegun dual-mount
// arcs, turret crosshair, etc.) lives here.
export class HudSystem {
  private healthText: Phaser.GameObjects.Text;
  private scoreText: Phaser.GameObjects.Text;
  private speedText: Phaser.GameObjects.Text;
  private weaponText: Phaser.GameObjects.Text;
  private aimText: Phaser.GameObjects.Text;
  private raceDebugText: Phaser.GameObjects.Text;

  private weaponMeter: Phaser.GameObjects.Graphics;
  private healthBars: Phaser.GameObjects.Graphics;
  private weaponSidebarHighlight: Phaser.GameObjects.Graphics;
  private sidebarReloadBars: Phaser.GameObjects.Graphics;
  private sidebarAmmoTexts: Record<WeaponId, Phaser.GameObjects.Text>;
  private restartButton: Phaser.GameObjects.Text;

  // Every screen-anchored (scrollFactor(0)) object this class owns, so
  // GameScene can exclude all of them from the zoomed/scrolling main camera
  // in one call (see utils/cameraLayers.ts) — without this, a non-1 zoom
  // visibly displaces them away from the screen position their own
  // scrollFactor(0) is supposed to pin them to (zoom isn't scroll; setting
  // scrollFactor(0) alone doesn't cancel it out).
  private uiLayer: Phaser.GameObjects.Layer;

  // Resolved once against the scene's actual active canvas size (desktop-
  // landscape or mobile-portrait — see config.ts's MOBILE_CANVAS_WIDTH/
  // HEIGHT comment) rather than a static position, since WEAPON_SIDEBAR is
  // margin-based for exactly this reason.
  private sidebarX: number;
  private sidebarYStart: number;

  constructor(scene: Phaser.Scene, highScore: number, onRestartRequested: () => void) {
    this.uiLayer = scene.add.layer();
    const origin = sidebarOrigin(scene.scale.width, scene.scale.height);
    this.sidebarX = origin.x;
    this.sidebarYStart = origin.yStart;

    this.healthText = scene.add
      .text(16, 16, "Health: 100", { fontFamily: "monospace", fontSize: "18px", color: "#ffffff" })
      .setDepth(DEPTHS.hud)
      .setScrollFactor(0);
    this.scoreText = scene.add
      .text(16, 38, "Distance: 0 m", { fontFamily: "monospace", fontSize: "18px", color: "#ffffff" })
      .setDepth(DEPTHS.hud)
      .setScrollFactor(0);
    const bestText = scene.add
      .text(16, 60, `Best: ${highScore} m`, { fontFamily: "monospace", fontSize: "14px", color: "#cccccc" })
      .setDepth(DEPTHS.hud)
      .setScrollFactor(0);
    this.speedText = scene.add
      .text(16, 82, "Speed: 0", { fontFamily: "monospace", fontSize: "14px", color: "#cccccc" })
      .setDepth(DEPTHS.hud)
      .setScrollFactor(0);
    this.weaponText = scene.add
      .text(16, 102, "Weapon: ROCKET (6)", { fontFamily: "monospace", fontSize: "14px", color: "#cccccc" })
      .setDepth(DEPTHS.hud)
      .setScrollFactor(0);
    this.aimText = scene.add
      .text(16, 122, "Ready", { fontFamily: "monospace", fontSize: "14px", color: "#cccccc" })
      .setDepth(DEPTHS.hud)
      .setScrollFactor(0);
    this.raceDebugText = scene.add
      .text(scene.scale.width - 16, 16, "", {
        fontFamily: "monospace",
        fontSize: "26px",
        fontStyle: "bold",
        color: "#ffd166",
        stroke: "#000000",
        strokeThickness: 4,
        align: "right",
      })
      .setOrigin(1, 0)
      .setDepth(DEPTHS.hud)
      .setScrollFactor(0);
    // Hidden until GameScene's stationary timer (see RESTART_BUTTON in
    // config.ts) decides the player has actually stopped — see
    // setRestartButtonVisible. Click/tap works natively via Phaser's pointer
    // input (no separate touch path needed, unlike the joystick/sidebar,
    // since there's no concurrent multi-touch concern here).
    this.restartButton = scene.add
      .text(scene.scale.width / 2, 16, "RESTART (R)", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#ffffff",
        backgroundColor: "#cc3333",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTHS.hud)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.restartButton.on("pointerdown", onRestartRequested);

    this.uiLayer.add([this.healthText, this.scoreText, bestText, this.speedText, this.weaponText, this.aimText, this.raceDebugText, this.restartButton]);

    // World-anchored (no scrollFactor override) — these float near the
    // player/rivals in world space and must keep tracking the main camera's
    // zoom/scroll normally, unlike everything else in this class, so they're
    // deliberately *not* added to uiLayer.
    this.weaponMeter = scene.add.graphics().setDepth(DEPTHS.weaponMeter);
    this.healthBars = scene.add.graphics().setDepth(DEPTHS.healthBar);
    ignoreInUiCamera(scene, this.weaponMeter);
    ignoreInUiCamera(scene, this.healthBars);

    this.weaponSidebarHighlight = scene.add
      .graphics()
      .setDepth(DEPTHS.hud - 1)
      .setScrollFactor(0);
    this.sidebarReloadBars = scene.add.graphics().setDepth(DEPTHS.hud).setScrollFactor(0);
    this.uiLayer.add([this.weaponSidebarHighlight, this.sidebarReloadBars]);

    this.sidebarAmmoTexts = {} as Record<WeaponId, Phaser.GameObjects.Text>;
    WEAPON_IDS.forEach((id, i) => {
      const y = this.sidebarYStart + i * WEAPON_SIDEBAR.rowHeight;
      const x = this.sidebarX;
      const swatch = WEAPON_SIDEBAR.swatchSize;
      const swatchRect = scene.add.rectangle(x, y, swatch, swatch, WEAPON_VISUALS[id].tint).setOrigin(0, 0).setDepth(DEPTHS.hud).setScrollFactor(0);
      const numberText = scene.add
        .text(x + swatch + 4, y - 2, `${i + 1}`, { fontFamily: "monospace", fontSize: "12px", color: "#ffffff" })
        .setDepth(DEPTHS.hud)
        .setScrollFactor(0);
      const nameText = scene.add
        .text(x, y + swatch + 4, WEAPON_LABELS[id], { fontFamily: "monospace", fontSize: "9px", color: "#dddddd" })
        .setDepth(DEPTHS.hud)
        .setScrollFactor(0);
      this.sidebarAmmoTexts[id] = scene.add
        .text(x, y + swatch + 16, "", { fontFamily: "monospace", fontSize: "9px", color: "#aaaaaa" })
        .setDepth(DEPTHS.hud)
        .setScrollFactor(0);
      this.uiLayer.add([swatchRect, numberText, nameText, this.sidebarAmmoTexts[id]]);
    });
  }

  // GameScene calls cameras.main.ignore(this) once, right after construction
  // — see this class's uiLayer field comment for why.
  getUiLayer(): Phaser.GameObjects.Layer {
    return this.uiLayer;
  }

  setRestartButtonVisible(visible: boolean): void {
    this.restartButton.setVisible(visible);
  }

  updateText(player: PlayerCar, distanceTraveled: number, forwardSpeed: number): void {
    const healthLabel = player.isRepairing
      ? `Health: ${Math.ceil(player.health)} (Repairing ${player.repairSecondsRemaining}s)`
      : `Health: ${Math.ceil(player.health)}`;
    this.healthText.setText(healthLabel);
    this.scoreText.setText(`Distance: ${Math.floor(distanceTraveled)} m`);
    this.speedText.setText(`Speed: ${Math.floor(forwardSpeed)}`);

    const weapon = player.weapons.current;
    const state = player.weapons.getState(weapon);
    this.weaponText.setText(`Weapon: ${weapon.toUpperCase()} (${state.ammo})`);

    let aimLabel: string;
    if (weapon === "sideguns") {
      aimLabel = `Aim: ${state.sweepAngleDeg.toFixed(0)}°`;
    } else if (weapon === "turret") {
      aimLabel = `Spread: ±${state.turretSpreadDeg.toFixed(0)}°`;
    } else {
      aimLabel = state.cooldownRemaining > 0 ? `Reloading ${Math.ceil(state.cooldownRemaining)}ms` : "Ready";
    }
    this.aimText.setText(aimLabel);
  }

  updateRaceDebugText(lapDisplay: number, lapsToWin: number, position: number, total: number): void {
    this.raceDebugText.setText(`${ordinal(position)}/${total}\nLap ${lapDisplay}/${lapsToWin}`);
  }

  getRaceDebugText(): string {
    return this.raceDebugText.text;
  }

  // Canvas-angle convention shared with the firing math: 0deg is straight
  // ahead along the car's heading, positive degrees deflect clockwise.
  private aimPointOnArc(player: PlayerCar, cx: number, cy: number, radius: number, relativeAngleDeg: number): { x: number; y: number } {
    const worldAngleDeg = player.heading + relativeAngleDeg;
    const rad = -Math.PI / 2 + Phaser.Math.DegToRad(worldAngleDeg);
    return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
  }

  drawWeaponMeter(player: PlayerCar, aimPointer: Phaser.Input.Pointer): void {
    const g = this.weaponMeter;
    g.clear();

    const weapon = player.weapons.current;
    const state = player.weapons.getState(weapon);
    const visuals = WEAPON_VISUALS[weapon];
    // The meter floats just ahead of the car along its current heading
    // (rather than a fixed screen-up offset) so it stays readable as the
    // car turns instead of pinning to one side mid-corner.
    const anchorDist = player.displayHeight / 2 + WEAPON_METER.offsetY;
    const anchor = this.aimPointOnArc(player, player.x, player.y, anchorDist, 0);
    const cx = anchor.x;
    const cy = anchor.y;

    // Rocket has no in-world meter of its own any more — its reload
    // progress lives inline with its ammo count in the sidebar instead.

    if (weapon === "sideguns") {
      const r = WEAPON_METER.arcRadius;
      const maxRad = Phaser.Math.DegToRad(SIDE_GUN_SWEEP.maxAngleDeg);
      for (const side of [-1, 1] as const) {
        // Mounts sit at the car's own sides, not at the forward-offset
        // meter anchor — matching spawnPlayerProjectile exactly.
        const { x: mcx, y: mcy } = sideGunMountPosition(player.x, player.y, player.heading, player.displayWidth, side);
        const centerDeg = side < 0 ? -SIDE_GUN_MOUNTS.centerAngleDeg : SIDE_GUN_MOUNTS.centerAngleDeg;
        const centerRad = -Math.PI / 2 + Phaser.Math.DegToRad(player.heading + centerDeg);
        g.lineStyle(2, visuals.meterColor, 0.35);
        g.beginPath();
        g.arc(mcx, mcy, r, centerRad - maxRad, centerRad + maxRad);
        g.strokePath();
        const marker = this.aimPointOnArc(player, mcx, mcy, r, sideGunAngleDeg(side, state.sweepAngleDeg));
        g.fillStyle(visuals.meterColor, 1).fillCircle(marker.x, marker.y, 4);
      }
    } else if (weapon === "turret") {
      const r = WEAPON_METER.arcRadius * 0.7;
      const spreadDeg = Math.max(state.turretSpreadDeg, TURRET_STABILITY.baseSpreadDeg);
      const spreadRad = Phaser.Math.DegToRad(spreadDeg);
      const headingRad = (player.heading * Math.PI) / 180;
      const centerRad = -Math.PI / 2 + headingRad;
      g.lineStyle(2, visuals.meterColor, 0.35);
      g.beginPath();
      g.arc(cx, cy, r, centerRad - spreadRad, centerRad + spreadRad);
      g.strokePath();
      const tip = this.aimPointOnArc(player, cx, cy, r, 0);
      g.fillStyle(visuals.meterColor, 1).fillCircle(tip.x, tip.y, 3);

      // Turret aim follows the mouse/pointer with no other on-screen cursor
      // of its own — draw a crosshair at the aim pointer's world position
      // so it's clear exactly where a shot would land. GameScene resolves
      // which pointer that is (see TouchControls.getTurretAimPointer) so
      // this stays correct under multi-touch, not just the plain mouse.
      g.lineStyle(2, visuals.meterColor, 0.8);
      g.strokeCircle(aimPointer.worldX, aimPointer.worldY, 8);
      g.beginPath();
      g.moveTo(aimPointer.worldX - 12, aimPointer.worldY);
      g.lineTo(aimPointer.worldX + 12, aimPointer.worldY);
      g.moveTo(aimPointer.worldX, aimPointer.worldY - 12);
      g.lineTo(aimPointer.worldX, aimPointer.worldY + 12);
      g.strokePath();
    }
  }

  private drawHealthBar(g: Phaser.GameObjects.Graphics, cx: number, cy: number, ratio: number, color: number): void {
    const w = HEALTH_BAR.width;
    const h = HEALTH_BAR.height;
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    g.fillStyle(0x000000, 0.5).fillRect(cx - w / 2 - 1, cy - h / 2 - 1, w + 2, h + 2);
    g.fillStyle(color, 1).fillRect(cx - w / 2, cy - h / 2, w * clamped, h);
  }

  drawHealthBars(player: PlayerCar, rivals: RivalState[]): void {
    const g = this.healthBars;
    g.clear();
    this.drawHealthBar(g, player.x, player.y + player.displayHeight / 2 + HEALTH_BAR.offsetY, player.health / PLAYER_HEALTH.max, 0x55ff77);
    for (const rival of rivals) {
      if (!rival.car.active) continue;
      this.drawHealthBar(
        g,
        rival.car.x,
        rival.car.y - rival.car.displayHeight / 2 - HEALTH_BAR.offsetY,
        rival.car.health / rival.car.archetype.health,
        0xff5544
      );
    }
  }

  updateWeaponSidebar(player: PlayerCar): void {
    const reloadBars = this.sidebarReloadBars;
    reloadBars.clear();
    WEAPON_IDS.forEach((id, i) => {
      const state = player.weapons.getState(id);
      this.sidebarAmmoTexts[id].setText(`(${state.ammo})`);

      // Reload/readiness bar inline with the ammo count — the
      // cooldownRemaining/fireCooldown ratio.
      const rowY = this.sidebarYStart + i * WEAPON_SIDEBAR.rowHeight;
      const barX = this.sidebarX + 50;
      const barY = rowY + WEAPON_SIDEBAR.swatchSize + 13;
      const w = WEAPON_SIDEBAR.reloadBarWidth;
      const h = WEAPON_SIDEBAR.reloadBarHeight;
      const pct = Phaser.Math.Clamp(1 - state.cooldownRemaining / WEAPONS[id].fireCooldown, 0, 1);
      reloadBars.fillStyle(0x000000, 0.5).fillRect(barX - 1, barY - 1, w + 2, h + 2);
      reloadBars.fillStyle(WEAPON_VISUALS[id].meterColor, 1).fillRect(barX, barY, w * pct, h);
    });

    const g = this.weaponSidebarHighlight;
    g.clear();
    const idx = WEAPON_IDS.indexOf(player.weapons.current);
    const rect = weaponSidebarRowRect(idx, this.sidebarX, this.sidebarYStart);
    g.fillStyle(0xffffff, 0.15).fillRect(rect.x, rect.y, rect.width, rect.height);
  }
}
