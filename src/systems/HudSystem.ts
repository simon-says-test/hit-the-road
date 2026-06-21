import Phaser from "phaser";
import { PlayerCar } from "../entities/PlayerCar";
import { RivalState } from "./RaceTracker";
import { sideGunAngleDeg, sideGunMountPosition } from "../entities/weapons";
import {
  CANVAS_WIDTH,
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
} from "../config";

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

  constructor(private scene: Phaser.Scene, highScore: number) {
    this.healthText = scene.add
      .text(16, 16, "Health: 100", { fontFamily: "monospace", fontSize: "18px", color: "#ffffff" })
      .setDepth(DEPTHS.hud)
      .setScrollFactor(0);
    this.scoreText = scene.add
      .text(16, 38, "Distance: 0 m", { fontFamily: "monospace", fontSize: "18px", color: "#ffffff" })
      .setDepth(DEPTHS.hud)
      .setScrollFactor(0);
    scene.add
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
      .text(CANVAS_WIDTH - 16, 16, "", {
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

    this.weaponMeter = scene.add.graphics().setDepth(DEPTHS.weaponMeter);
    this.healthBars = scene.add.graphics().setDepth(DEPTHS.healthBar);
    this.weaponSidebarHighlight = scene.add
      .graphics()
      .setDepth(DEPTHS.hud - 1)
      .setScrollFactor(0);
    this.sidebarReloadBars = scene.add.graphics().setDepth(DEPTHS.hud).setScrollFactor(0);

    this.sidebarAmmoTexts = {} as Record<WeaponId, Phaser.GameObjects.Text>;
    WEAPON_IDS.forEach((id, i) => {
      const y = WEAPON_SIDEBAR.yStart + i * WEAPON_SIDEBAR.rowHeight;
      const x = WEAPON_SIDEBAR.x;
      const swatch = WEAPON_SIDEBAR.swatchSize;
      scene.add.rectangle(x, y, swatch, swatch, WEAPON_VISUALS[id].tint).setOrigin(0, 0).setDepth(DEPTHS.hud).setScrollFactor(0);
      scene.add
        .text(x + swatch + 4, y - 2, `${i + 1}`, { fontFamily: "monospace", fontSize: "12px", color: "#ffffff" })
        .setDepth(DEPTHS.hud)
        .setScrollFactor(0);
      scene.add
        .text(x, y + swatch + 4, WEAPON_LABELS[id], { fontFamily: "monospace", fontSize: "9px", color: "#dddddd" })
        .setDepth(DEPTHS.hud)
        .setScrollFactor(0);
      this.sidebarAmmoTexts[id] = scene.add
        .text(x, y + swatch + 16, "", { fontFamily: "monospace", fontSize: "9px", color: "#aaaaaa" })
        .setDepth(DEPTHS.hud)
        .setScrollFactor(0);
    });
  }

  updateText(player: PlayerCar, distanceTraveled: number, forwardSpeed: number): void {
    this.healthText.setText(`Health: ${Math.ceil(player.health)}`);
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

  drawWeaponMeter(player: PlayerCar): void {
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
      // of its own — draw a crosshair at the pointer's world position so
      // it's clear exactly where a shot would land.
      const pointer = this.scene.input.activePointer;
      g.lineStyle(2, visuals.meterColor, 0.8);
      g.strokeCircle(pointer.worldX, pointer.worldY, 8);
      g.beginPath();
      g.moveTo(pointer.worldX - 12, pointer.worldY);
      g.lineTo(pointer.worldX + 12, pointer.worldY);
      g.moveTo(pointer.worldX, pointer.worldY - 12);
      g.lineTo(pointer.worldX, pointer.worldY + 12);
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
      const rowY = WEAPON_SIDEBAR.yStart + i * WEAPON_SIDEBAR.rowHeight;
      const barX = WEAPON_SIDEBAR.x + 50;
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
    const y = WEAPON_SIDEBAR.yStart + idx * WEAPON_SIDEBAR.rowHeight - 6;
    g.fillStyle(0xffffff, 0.15).fillRect(WEAPON_SIDEBAR.x - 6, y, WEAPON_SIDEBAR.reloadBarWidth + 56, WEAPON_SIDEBAR.rowHeight - 10);
  }
}
