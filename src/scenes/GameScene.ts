import Phaser from "phaser";
import { PlayerCar, PlayerInput } from "../entities/PlayerCar";
import { EnemyCar, NearestRival } from "../entities/EnemyCar";
import { Projectile } from "../entities/Projectile";
import { Pickup, PickupType } from "../entities/Pickup";
import { Hazard, HazardType } from "../entities/Hazard";
import { FireResult } from "../entities/weapons";
import { SFX_KEYS } from "./BootScene";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  ROAD_X,
  ROAD_WIDTH,
  PLAYER_Y,
  PLAYER_HEALTH,
  ENEMY_SPAWN,
  ENEMY_UNLOCKS,
  ENEMY_ARCHETYPES,
  EnemyArchetypeConfig,
  SCORE_DISTANCE_DIVISOR,
  PICKUPS,
  HAZARDS,
  OIL_SLICK,
  COLLISION_SHUNT,
  WeaponId,
  WEAPONS,
  VISUAL_TINTS,
  WEAPON_VISUALS,
  WEAPON_METER,
  SIDE_GUN_SWEEP,
  SIDE_GUN_MOUNTS,
  TURRET_STABILITY,
  DEPTHS,
  HEALTH_BAR,
  CRATE_SPAWN,
  WEAPON_SIDEBAR,
} from "../config";

type KeyName = "W" | "S" | "A" | "D" | "UP" | "DOWN" | "LEFT" | "RIGHT" | "SHIFT" | "SPACE";

const WEAPON_IDS: WeaponId[] = ["rocket", "sideguns", "turret"];
const WEAPON_LABELS: Record<WeaponId, string> = { rocket: "ROCKET", sideguns: "SIDEGUNS", turret: "TURRET" };
const HIGH_SCORE_STORAGE_KEY = "hit-the-road:best-distance";

export class GameScene extends Phaser.Scene {
  private player!: PlayerCar;
  private enemies!: Phaser.Physics.Arcade.Group;
  private playerProjectiles!: Phaser.Physics.Arcade.Group;
  private enemyProjectiles!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.Group;
  private roadDivider!: Phaser.GameObjects.TileSprite;

  private score = 0;
  private enemyApproachSpeed = ENEMY_SPAWN.baseApproachSpeed;
  private spawnTimer = 0;
  private spawnInterval = ENEMY_SPAWN.spawnIntervalInitial;
  private lastSpawnX = -1;
  private hazardTimer = 0;
  private hazardInterval = HAZARDS.spawnIntervalInitial;
  private crateTimer = 0;
  private crateInterval = CRATE_SPAWN.intervalMs;
  private scoreMultiplier = 1;
  private scoreMultiplierTimer = 0;
  private gameOver = false;
  private highScore = 0;
  // Set just before player.drive() each frame by an explicit, immediate
  // physics.overlap() check (not a registered create()-time pair) — calling
  // it ourselves at a known point in update() avoids depending on whether
  // Phaser's own physics step happens to run before or after our update()
  // that same frame (see handleHazardOverlap for why that ordering matters
  // here but not for the other overlap pairs).
  private onRoughTerrain = false;
  // Ms remaining of the oil-slick control-loss debuff; refreshed to the full
  // duration every frame still overlapping a slick, then counts down after
  // leaving it so the "harder to control for a bit" effect lingers.
  private oilSlickTimer = 0;
  // Rolled once per activation (when oilSlickTimer goes from inactive to
  // active), not every frame — see OIL_SLICK in config.ts for why.
  private oilDriftBias = 0;

  private healthText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private aimText!: Phaser.GameObjects.Text;
  private weaponMeter!: Phaser.GameObjects.Graphics;
  private healthBars!: Phaser.GameObjects.Graphics;
  private weaponSidebarHighlight!: Phaser.GameObjects.Graphics;
  private sidebarAmmoTexts!: Record<WeaponId, Phaser.GameObjects.Text>;
  private overlay!: Phaser.GameObjects.Container;
  private keys!: Record<KeyName, Phaser.Input.Keyboard.Key>;

  constructor() {
    super("game");
  }

  create(): void {
    this.score = 0;
    this.enemyApproachSpeed = ENEMY_SPAWN.baseApproachSpeed;
    this.spawnTimer = 0;
    this.spawnInterval = ENEMY_SPAWN.spawnIntervalInitial;
    this.lastSpawnX = -1;
    this.hazardTimer = 0;
    this.hazardInterval = HAZARDS.spawnIntervalInitial;
    this.crateTimer = 0;
    this.crateInterval = CRATE_SPAWN.intervalMs;
    this.scoreMultiplier = 1;
    this.scoreMultiplierTimer = 0;
    this.gameOver = false;
    this.onRoughTerrain = false;
    this.oilSlickTimer = 0;
    this.oilDriftBias = 0;
    this.highScore = Number(localStorage.getItem(HIGH_SCORE_STORAGE_KEY) ?? 0);

    this.add.image(0, 0, "road-background").setOrigin(0, 0).setDepth(DEPTHS.roadBackground);
    this.roadDivider = this.add
      .tileSprite(ROAD_X, 0, ROAD_WIDTH, CANVAS_HEIGHT, "road-divider")
      .setOrigin(0, 0);

    this.player = new PlayerCar(this, ROAD_X + ROAD_WIDTH / 2, PLAYER_Y, "car-player");

    this.enemies = this.physics.add.group({ classType: EnemyCar, maxSize: 30, runChildUpdate: false });
    this.playerProjectiles = this.physics.add.group({ classType: Projectile, maxSize: 40, runChildUpdate: false });
    this.enemyProjectiles = this.physics.add.group({ classType: Projectile, maxSize: 40, runChildUpdate: false });
    this.pickups = this.physics.add.group({ classType: Pickup, maxSize: 20, runChildUpdate: false });
    this.hazards = this.physics.add.group({ classType: Hazard, maxSize: 20, runChildUpdate: false });

    // Player vs. enemies is a *collider*, not an overlap — Arcade Physics
    // then physically separates the two bodies every step they touch, on
    // top of invoking our ram-damage callback. With ramming no longer an
    // instant kill (see handlePlayerEnemyCollision), a surviving enemy needs
    // that separation or it just glides straight through the player's fixed
    // screen position with nothing to stop it — overlap alone never did.
    this.physics.add.collider(this.player, this.enemies, (_p, e) => this.handlePlayerEnemyCollision(e as EnemyCar), undefined, this);
    this.physics.add.overlap(this.player, this.enemyProjectiles, (_p, proj) => this.handlePlayerHitByProjectile(proj as Projectile), undefined, this);
    this.physics.add.overlap(this.playerProjectiles, this.enemies, (proj, e) => this.handleEnemyHitByProjectile(e as EnemyCar, proj as Projectile), undefined, this);
    this.physics.add.overlap(this.player, this.pickups, (_p, pk) => this.handlePickupCollected(pk as Pickup), undefined, this);
    // Hazard overlaps are checked explicitly in update()/updateEnemies()
    // instead of registered here — see those methods for why.
    // Enemies physically collide with each other (not just the player) —
    // their AI tries to steer around nearby traffic (see enemyBehaviors.ts)
    // but isn't always able to, especially when an aggressive archetype is
    // ramming through; this collider provides the actual physical pushback
    // when avoidance fails.
    this.physics.add.collider(this.enemies, this.enemies);

    this.healthText = this.add.text(16, 16, "Health: 100", { fontFamily: "monospace", fontSize: "18px", color: "#ffffff" }).setDepth(DEPTHS.hud);
    this.scoreText = this.add.text(16, 38, "Distance: 0 m", { fontFamily: "monospace", fontSize: "18px", color: "#ffffff" }).setDepth(DEPTHS.hud);
    this.add
      .text(16, 60, `Best: ${this.highScore} m`, { fontFamily: "monospace", fontSize: "14px", color: "#cccccc" })
      .setDepth(DEPTHS.hud);
    this.speedText = this.add.text(16, 82, "Speed: 0", { fontFamily: "monospace", fontSize: "14px", color: "#cccccc" }).setDepth(DEPTHS.hud);
    this.weaponText = this.add.text(16, 102, "Weapon: ROCKET (6)", { fontFamily: "monospace", fontSize: "14px", color: "#cccccc" }).setDepth(DEPTHS.hud);
    this.aimText = this.add.text(16, 122, "Ready", { fontFamily: "monospace", fontSize: "14px", color: "#cccccc" }).setDepth(DEPTHS.hud);
    this.weaponMeter = this.add.graphics().setDepth(DEPTHS.weaponMeter);
    this.healthBars = this.add.graphics().setDepth(DEPTHS.healthBar);

    // Persistent sidebar in the road's right margin listing all three
    // weapons, their select key, and current ammo, with the equipped one
    // highlighted — see WEAPON_SIDEBAR in config.ts for why it lives there.
    this.weaponSidebarHighlight = this.add.graphics().setDepth(DEPTHS.hud - 1);
    this.sidebarAmmoTexts = {} as Record<WeaponId, Phaser.GameObjects.Text>;
    WEAPON_IDS.forEach((id, i) => {
      const y = WEAPON_SIDEBAR.yStart + i * WEAPON_SIDEBAR.rowHeight;
      const x = WEAPON_SIDEBAR.x;
      const swatch = WEAPON_SIDEBAR.swatchSize;
      this.add.rectangle(x, y, swatch, swatch, WEAPON_VISUALS[id].tint).setOrigin(0, 0).setDepth(DEPTHS.hud);
      this.add
        .text(x + swatch + 4, y - 2, `${i + 1}`, { fontFamily: "monospace", fontSize: "12px", color: "#ffffff" })
        .setDepth(DEPTHS.hud);
      this.add
        .text(x, y + swatch + 4, WEAPON_LABELS[id], { fontFamily: "monospace", fontSize: "9px", color: "#dddddd" })
        .setDepth(DEPTHS.hud);
      this.sidebarAmmoTexts[id] = this.add
        .text(x, y + swatch + 16, "", { fontFamily: "monospace", fontSize: "9px", color: "#aaaaaa" })
        .setDepth(DEPTHS.hud);
    });

    const kb = this.input.keyboard!;
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
    };
    kb.on("keydown-ONE", () => this.player.selectWeapon("rocket"));
    kb.on("keydown-TWO", () => this.player.selectWeapon("sideguns"));
    kb.on("keydown-THREE", () => this.player.selectWeapon("turret"));

    this.overlay = this.buildOverlay();
    this.overlay.setVisible(false);
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;

    // The player's sprite is meant to stay at a fixed screen y — the world
    // scrolls past it, only x moves (steering) — but the new player↔enemy
    // *collider* (see create()) physically separates overlapping bodies by
    // nudging their positions directly, which can drift the player off
    // PLAYER_Y over repeated rams if left uncorrected. Re-pinning it here
    // each frame is the standard Phaser idiom for locking an axis.
    this.player.setY(PLAYER_Y);

    // Checked explicitly (not via a registered create()-time overlap pair)
    // so we control exactly when it runs relative to building this frame's
    // input — a registered pair's callback timing relative to our own
    // update() isn't something we want this effect's correctness to depend
    // on, unlike the other overlaps here, none of which feed back into the
    // same frame's player-input construction the way terrain does.
    this.onRoughTerrain = false;
    this.physics.overlap(this.player, this.hazards, (_p, hz) => this.handleHazardOverlap(hz as Hazard));

    const input: PlayerInput = {
      accelerate: this.keys.W.isDown || this.keys.UP.isDown,
      brake: this.keys.S.isDown || this.keys.DOWN.isDown,
      left: this.keys.A.isDown || this.keys.LEFT.isDown,
      right: this.keys.D.isDown || this.keys.RIGHT.isDown,
      drift: this.keys.SHIFT.isDown,
      onRoughTerrain: this.onRoughTerrain,
      oilSlicked: this.oilSlickTimer > 0,
      oilDriftBias: this.oilDriftBias,
    };
    const forwardSpeed = this.player.drive(input, delta);
    if (this.oilSlickTimer > 0) this.oilSlickTimer -= delta;

    this.handleFiring();

    if (this.scoreMultiplierTimer > 0) {
      this.scoreMultiplierTimer -= delta;
      if (this.scoreMultiplierTimer <= 0) this.scoreMultiplier = 1;
    }
    this.score += (Math.max(0, forwardSpeed) * delta) / 1000 / SCORE_DISTANCE_DIVISOR * this.scoreMultiplier;
    this.enemyApproachSpeed = Math.min(
      ENEMY_SPAWN.maxApproachSpeed,
      ENEMY_SPAWN.baseApproachSpeed + this.score * ENEMY_SPAWN.approachSpeedPerScore
    );

    this.updateHud(forwardSpeed);
    this.drawWeaponMeter();
    this.drawHealthBars();
    this.updateWeaponSidebar();

    this.roadDivider.tilePositionY -= (forwardSpeed * delta) / 1000;

    this.spawnTimer += delta;
    this.spawnInterval = Math.max(
      ENEMY_SPAWN.spawnIntervalMin,
      ENEMY_SPAWN.spawnIntervalInitial - this.score * ENEMY_SPAWN.spawnIntervalScoreFactor
    );
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }

    this.hazardTimer += delta;
    this.hazardInterval = Math.max(
      HAZARDS.spawnIntervalMin,
      HAZARDS.spawnIntervalInitial - this.score * HAZARDS.spawnIntervalScoreFactor
    );
    if (this.hazardTimer >= this.hazardInterval) {
      this.hazardTimer = 0;
      this.spawnHazard();
    }

    this.crateTimer += delta;
    if (this.crateTimer >= this.crateInterval) {
      this.crateTimer = 0;
      this.crateInterval = CRATE_SPAWN.intervalMs + Phaser.Math.Between(-CRATE_SPAWN.intervalJitterMs, CRATE_SPAWN.intervalJitterMs);
      this.spawnCrate();
    }

    this.updateEnemies(forwardSpeed, delta);
    this.updateProjectiles();
    this.updateWorldProps(this.pickups, forwardSpeed);
    this.updateWorldProps(this.hazards, forwardSpeed);
  }

  private handleFiring(): void {
    const weapon = this.player.weapons.current;
    const pointer = this.input.activePointer;
    const wantsFire = weapon === "turret" ? pointer.isDown : this.keys.SPACE.isDown;
    if (!wantsFire) return;

    const turretAimDeg = this.computeTurretAimDeg(pointer);
    const shot = this.player.tryFire(turretAimDeg);
    if (shot) this.spawnPlayerProjectile(shot);
  }

  private computeTurretAimDeg(pointer: Phaser.Input.Pointer): number {
    const dx = pointer.worldX - this.player.x;
    const dy = pointer.worldY - this.player.y;
    return Phaser.Math.RadToDeg(Math.atan2(dx, -dy));
  }

  // Mount offset (beyond the car's own half-width) shared by firing and the
  // in-world meter (drawWeaponMeter) so the visible barrel position and the
  // shot's actual origin always agree.
  private sideGunMountOffsetX(): number {
    return this.player.displayWidth / 2 + SIDE_GUN_MOUNTS.extraOffsetPx;
  }

  // Side guns aim outward from each side rather than forward — left mount
  // centered at -90°, right at +90° (canvas-angle convention: 0 = ahead,
  // positive = clockwise) — with the one shared sweep value deflecting both
  // mounts symmetrically toward the front at its extremes. See
  // SIDE_GUN_MOUNTS in config.ts for the centerAngleDeg this mirrors around.
  private static sideGunAngleDeg(side: -1 | 1, sweepAngleDeg: number): number {
    return side < 0 ? -SIDE_GUN_MOUNTS.centerAngleDeg + sweepAngleDeg : SIDE_GUN_MOUNTS.centerAngleDeg - sweepAngleDeg;
  }

  private spawnPlayerProjectile(shot: FireResult): void {
    const texture = shot.weapon === "rocket" ? "projectile-rocket" : "projectile-bullet";
    const visuals = WEAPON_VISUALS[shot.weapon];

    if (shot.weapon === "sideguns") {
      // Twin mounts on the left/right of the car instead of one front-center
      // barrel — both fire together on a single trigger pull, aimed outward
      // and mirrored around the one shared sweep meter (see drawWeaponMeter).
      const mountOffsetX = this.sideGunMountOffsetX();
      const y = this.player.y;
      for (const side of [-1, 1] as const) {
        const x = this.player.x + side * mountOffsetX;
        const angleDeg = GameScene.sideGunAngleDeg(side, shot.angleDeg);
        const rad = Phaser.Math.DegToRad(angleDeg);
        const vx = Math.sin(rad) * shot.projectileSpeed;
        const vy = -Math.cos(rad) * shot.projectileSpeed;
        const projectile = this.playerProjectiles.get(x, y, texture) as Projectile | null;
        if (!projectile) continue;
        projectile.fire(x, y, texture, vx, vy, shot.damage, "player");
        projectile.setBlendMode(visuals.blend === "add" ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
        projectile.setTint(visuals.tint);
        projectile.setScale(visuals.scale);
      }
      this.playSfx(SFX_KEYS.gunfire);
      return;
    }

    const rad = Phaser.Math.DegToRad(shot.angleDeg);
    const vx = Math.sin(rad) * shot.projectileSpeed;
    const vy = -Math.cos(rad) * shot.projectileSpeed;
    const x = this.player.x;
    const y = this.player.y - 30;
    const projectile = this.playerProjectiles.get(x, y, texture) as Projectile | null;
    if (!projectile) return;
    projectile.fire(x, y, texture, vx, vy, shot.damage, "player");
    projectile.setBlendMode(visuals.blend === "add" ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    projectile.setTint(visuals.tint);
    projectile.setScale(visuals.scale);
    this.playSfx(shot.weapon === "rocket" ? SFX_KEYS.rocket : SFX_KEYS.gunfire);
  }

  private spawnEnemyProjectile(enemy: EnemyCar): void {
    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const speed = enemy.archetype.projectileSpeed;
    const vx = (dx / len) * speed;
    const vy = (dy / len) * speed;
    const projectile = this.enemyProjectiles.get(enemy.x, enemy.y, "projectile-enemy") as Projectile | null;
    if (!projectile) return;
    projectile.fire(enemy.x, enemy.y, "projectile-enemy", vx, vy, enemy.archetype.projectileDamage, "enemy");
    projectile.setBlendMode(Phaser.BlendModes.ADD);
    projectile.setTint(VISUAL_TINTS.enemyBullet);
  }

  private updateEnemies(forwardSpeed: number, delta: number): void {
    const active = this.enemies.getChildren().filter((obj) => (obj as EnemyCar).active) as EnemyCar[];

    active.forEach((enemy) => (enemy.onRoughTerrainThisFrame = false));
    this.physics.overlap(this.enemies, this.hazards, (eObj, hzObj) => {
      const enemy = eObj as EnemyCar;
      const hazard = hzObj as Hazard;
      if (hazard.type === "rough") {
        enemy.onRoughTerrainThisFrame = true;
      } else {
        if (enemy.oilSlickTimer <= 0) enemy.oilDriftBias = Math.random() * 2 - 1;
        enemy.oilSlickTimer = OIL_SLICK.effectDurationMs;
      }
    });

    active.forEach((enemy) => {
      let rival: NearestRival | undefined;
      for (const other of active) {
        if (other === enemy) continue;
        const dx = other.x - enemy.x;
        const dy = other.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (!rival || dist < rival.dist) rival = { dx, dist };
      }
      enemy.drive(this.enemyApproachSpeed, forwardSpeed, this.player.x, delta, rival);
      if (
        enemy.y > CANVAS_HEIGHT + ENEMY_SPAWN.despawnMarginY ||
        enemy.y < -ENEMY_SPAWN.despawnMarginY
      ) {
        enemy.despawn();
        return;
      }
      if (enemy.canFire()) {
        this.spawnEnemyProjectile(enemy);
        enemy.resetFireTimer();
      }
    });
  }

  private updateProjectiles(): void {
    [this.playerProjectiles, this.enemyProjectiles].forEach((group) => {
      group.getChildren().forEach((obj) => {
        const projectile = obj as Projectile;
        if (!projectile.active) return;
        if (
          projectile.y < -40 ||
          projectile.y > CANVAS_HEIGHT + 40 ||
          projectile.x < -40 ||
          projectile.x > CANVAS_WIDTH + 40
        ) {
          projectile.despawn();
        }
      });
    });
  }

  private updateWorldProps(group: Phaser.Physics.Arcade.Group, forwardSpeed: number): void {
    group.getChildren().forEach((obj) => {
      const prop = obj as Pickup | Hazard;
      if (!prop.active) return;
      prop.drive(forwardSpeed);
      if (prop.y > CANVAS_HEIGHT + 80 || prop.y < -300) {
        prop.despawn();
      }
    });
  }

  private updateHud(forwardSpeed: number): void {
    this.healthText.setText(`Health: ${Math.ceil(this.player.health)}`);
    this.scoreText.setText(`Distance: ${Math.floor(this.score)} m`);
    this.speedText.setText(`Speed: ${Math.floor(forwardSpeed)}`);

    const weapon = this.player.weapons.current;
    const state = this.player.weapons.getState(weapon);
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

  // Canvas-angle convention shared with the firing math in spawnPlayerProjectile:
  // 0deg is straight ahead (up), positive degrees deflect clockwise (toward +x).
  private static aimPointOnArc(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
    const rad = -Math.PI / 2 + Phaser.Math.DegToRad(angleDeg);
    return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
  }

  private drawWeaponMeter(): void {
    const g = this.weaponMeter;
    g.clear();

    const weapon = this.player.weapons.current;
    const state = this.player.weapons.getState(weapon);
    const visuals = WEAPON_VISUALS[weapon];
    const cx = this.player.x;
    const cy = this.player.y - this.player.displayHeight / 2 - WEAPON_METER.offsetY;

    if (weapon === "rocket") {
      const w = WEAPON_METER.barWidth;
      const h = WEAPON_METER.barHeight;
      const pct = 1 - state.cooldownRemaining / WEAPONS.rocket.fireCooldown;
      g.fillStyle(0x000000, 0.5).fillRect(cx - w / 2 - 1, cy - h / 2 - 1, w + 2, h + 2);
      g.fillStyle(visuals.meterColor, 1).fillRect(cx - w / 2, cy - h / 2, w * Phaser.Math.Clamp(pct, 0, 1), h);
    }

    if (weapon === "sideguns") {
      // Twin mounts, twin meters — both arcs are centered outward (mirrored
      // around ±SIDE_GUN_MOUNTS.centerAngleDeg) and show the same shared
      // sweep value, since both barrels fire together at it (see
      // spawnPlayerProjectile/sideGunAngleDeg for the matching firing math).
      const r = WEAPON_METER.arcRadius;
      const maxRad = Phaser.Math.DegToRad(SIDE_GUN_SWEEP.maxAngleDeg);
      const mountOffsetX = this.sideGunMountOffsetX();
      for (const side of [-1, 1] as const) {
        const mcx = cx + side * mountOffsetX;
        const centerDeg = side < 0 ? -SIDE_GUN_MOUNTS.centerAngleDeg : SIDE_GUN_MOUNTS.centerAngleDeg;
        const centerRad = -Math.PI / 2 + Phaser.Math.DegToRad(centerDeg);
        g.lineStyle(2, visuals.meterColor, 0.35);
        g.beginPath();
        g.arc(mcx, cy, r, centerRad - maxRad, centerRad + maxRad);
        g.strokePath();
        const marker = GameScene.aimPointOnArc(mcx, cy, r, GameScene.sideGunAngleDeg(side, state.sweepAngleDeg));
        g.fillStyle(visuals.meterColor, 1).fillCircle(marker.x, marker.y, 4);
      }
    } else if (weapon === "turret") {
      const r = WEAPON_METER.arcRadius * 0.7;
      const spreadDeg = Math.max(state.turretSpreadDeg, TURRET_STABILITY.baseSpreadDeg);
      const spreadRad = Phaser.Math.DegToRad(spreadDeg);
      g.lineStyle(2, visuals.meterColor, 0.35);
      g.beginPath();
      g.arc(cx, cy, r, -Math.PI / 2 - spreadRad, -Math.PI / 2 + spreadRad);
      g.strokePath();
      const tip = GameScene.aimPointOnArc(cx, cy, r, 0);
      g.fillStyle(visuals.meterColor, 1).fillCircle(tip.x, tip.y, 3);

      // Turret aim follows the mouse/pointer with no other on-screen cursor
      // of its own — draw a crosshair at the pointer position so it's clear
      // where a shot would actually land, not just the spread cone above
      // the car.
      const pointer = this.input.activePointer;
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

  private drawHealthBars(): void {
    const g = this.healthBars;
    g.clear();
    // Below the car, not above — the area above is reserved for the
    // current weapon's aim/readiness meter (drawWeaponMeter), so the two
    // don't compete for the same space (the rocket's reload bar used to be
    // mistakable for a health bar before they were separated like this).
    this.drawHealthBar(
      g,
      this.player.x,
      this.player.y + this.player.displayHeight / 2 + HEALTH_BAR.offsetY,
      this.player.health / PLAYER_HEALTH.max,
      0x55ff77
    );
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as EnemyCar;
      if (!enemy.active) return;
      this.drawHealthBar(
        g,
        enemy.x,
        enemy.y - enemy.displayHeight / 2 - HEALTH_BAR.offsetY,
        enemy.health / enemy.archetype.health,
        0xff5544
      );
    });
  }

  private drawHealthBar(g: Phaser.GameObjects.Graphics, cx: number, cy: number, ratio: number, color: number): void {
    const w = HEALTH_BAR.width;
    const h = HEALTH_BAR.height;
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    g.fillStyle(0x000000, 0.5).fillRect(cx - w / 2 - 1, cy - h / 2 - 1, w + 2, h + 2);
    g.fillStyle(color, 1).fillRect(cx - w / 2, cy - h / 2, w * clamped, h);
  }

  private updateWeaponSidebar(): void {
    WEAPON_IDS.forEach((id) => {
      this.sidebarAmmoTexts[id].setText(`(${this.player.weapons.getState(id).ammo})`);
    });

    const g = this.weaponSidebarHighlight;
    g.clear();
    const idx = WEAPON_IDS.indexOf(this.player.weapons.current);
    const y = WEAPON_SIDEBAR.yStart + idx * WEAPON_SIDEBAR.rowHeight - 6;
    g.fillStyle(0xffffff, 0.15).fillRect(WEAPON_SIDEBAR.x - 6, y, 70, WEAPON_SIDEBAR.rowHeight - 10);
  }

  private pickArchetype(): EnemyArchetypeConfig {
    const unlocked = ENEMY_UNLOCKS.filter((u) => u.minScore <= this.score);
    const totalWeight = unlocked.reduce((sum, u) => sum + u.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const u of unlocked) {
      if (roll < u.weight) return ENEMY_ARCHETYPES[u.id];
      roll -= u.weight;
    }
    return ENEMY_ARCHETYPES.chaser;
  }

  private spawnEnemy(): void {
    if (this.enemies.countActive(true) >= ENEMY_SPAWN.maxConcurrent) return;

    const minX = ROAD_X + ENEMY_SPAWN.spawnMargin;
    const maxX = ROAD_X + ROAD_WIDTH - ENEMY_SPAWN.spawnMargin;
    const archetype = this.pickArchetype();

    let x: number;
    let y: number;
    if (archetype.approachFrom === "behind") {
      x = Phaser.Math.Between(minX, maxX);
      if (this.lastSpawnX >= 0 && Math.abs(x - this.lastSpawnX) < ENEMY_SPAWN.minSpawnXGap) {
        x =
          x < this.lastSpawnX
            ? Math.max(minX, this.lastSpawnX - ENEMY_SPAWN.minSpawnXGap)
            : Math.min(maxX, this.lastSpawnX + ENEMY_SPAWN.minSpawnXGap);
      }
      this.lastSpawnX = x;
      y = CANVAS_HEIGHT + 60;
    } else {
      // "side" — merges in from the road's left/right edge, already level
      // with (or just ahead of) the player, instead of oncoming from off
      // the top of the screen.
      x = Math.random() < 0.5 ? minX : maxX;
      y = PLAYER_Y - Phaser.Math.Between(ENEMY_SPAWN.sideSpawnAheadMin, ENEMY_SPAWN.sideSpawnAheadMax);
    }

    const enemy = this.enemies.get(x, y, archetype.texture) as EnemyCar | null;
    if (!enemy) return;
    enemy.spawn(archetype, x, y);
  }

  private spawnHazard(): void {
    const minX = ROAD_X + HAZARDS.spawnMargin;
    const maxX = ROAD_X + ROAD_WIDTH - HAZARDS.spawnMargin;
    const x = Phaser.Math.Between(minX, maxX);
    const type: HazardType = Math.random() < 0.5 ? "rough" : "oil";
    const texture = type === "rough" ? "hazard-rough" : "hazard-oil";
    const hazard = this.hazards.get(x, -40, texture) as Hazard | null;
    if (!hazard) return;
    hazard.spawn(type, x, -40, texture);
  }

  private maybeDropPickup(x: number, y: number): void {
    if (Math.random() > PICKUPS.dropChanceOnKill) return;

    const roll = Math.random();
    let type: PickupType;
    if (roll < 0.4) type = "health";
    else if (roll < 0.75) type = "ammo";
    else if (roll < 0.875) type = "boost-score";
    else type = "boost-speed";

    this.spawnPickup(type, x, y);
  }

  // Standalone crates spawn on a timer (CRATE_SPAWN), independent of kills —
  // health/ammo only, no boosts, since boosts are meant to be a kill-drop
  // flavor bonus rather than part of the baseline supply trickle.
  private spawnCrate(): void {
    const minX = ROAD_X + HAZARDS.spawnMargin;
    const maxX = ROAD_X + ROAD_WIDTH - HAZARDS.spawnMargin;
    const x = Phaser.Math.Between(minX, maxX);
    const type: PickupType = Math.random() < 0.5 ? "health" : "ammo";
    this.spawnPickup(type, x, -40);
  }

  private spawnPickup(type: PickupType, x: number, y: number): void {
    const texture = type === "boost-score" || type === "boost-speed" ? "pickup-boost" : `pickup-${type}`;
    const pickup = this.pickups.get(x, y, texture) as Pickup | null;
    if (!pickup) return;
    pickup.spawn(type, x, y, texture);
    if (type === "health") {
      pickup.setBlendMode(Phaser.BlendModes.ADD);
      pickup.setTint(VISUAL_TINTS.healthPickup);
    } else if (type === "boost-score" || type === "boost-speed") {
      pickup.setBlendMode(Phaser.BlendModes.ADD);
      pickup.setTint(VISUAL_TINTS.boostPickup);
    } else {
      pickup.setBlendMode(Phaser.BlendModes.NORMAL);
      pickup.setTint(VISUAL_TINTS.ammoPickup);
    }
  }

  private destroyEnemy(enemy: EnemyCar): void {
    this.spawnExplosion(enemy.x, enemy.y);
    this.score += enemy.archetype.scoreValue;
    this.maybeDropPickup(enemy.x, enemy.y);
    enemy.despawn();
  }

  private damagePlayer(amount: number): void {
    const destroyed = this.player.takeDamage(amount);
    this.player.applyDamageSlow();
    if (destroyed) this.endGame();
  }

  private handlePlayerEnemyCollision(enemy: EnemyCar): void {
    if (!enemy.active || this.gameOver || enemy.ramCooldown > 0) return;
    const impactSpeed = Math.abs((enemy.body as Phaser.Physics.Arcade.Body).velocity.y);
    const magnitude = Math.max(COLLISION_SHUNT.minShunt, impactSpeed * COLLISION_SHUNT.speedFactor);
    // "behind" archetypes ram from the rear, jolting the player forward;
    // "side" archetypes clip the player from alongside, jolting them back.
    const direction = enemy.archetype.approachFrom === "behind" ? 1 : -1;
    this.player.applyImpactShunt(direction * magnitude);
    enemy.ramCooldown = COLLISION_SHUNT.ramCooldownMs;

    // Ramming now damages the enemy through its normal health pool, scaled
    // by the same impact magnitude as the player's speed-shunt, instead of
    // destroying it outright on any contact — a hard, fast ram can still
    // one-shot a weak car, but a glancing one just dents it.
    const dead = enemy.takeDamage(magnitude * COLLISION_SHUNT.ramDamageFactor);
    if (dead) {
      this.playSfx(SFX_KEYS.explosion);
      this.destroyEnemy(enemy);
    } else {
      enemy.applyDamageSlow();
      this.playSfx(SFX_KEYS.collision);
    }
  }

  private handlePlayerHitByProjectile(projectile: Projectile): void {
    if (!projectile.active || projectile.owner !== "enemy" || this.gameOver) return;
    this.playSfx(SFX_KEYS.collision);
    this.damagePlayer(projectile.damage);
    projectile.despawn();
  }

  private handleEnemyHitByProjectile(enemy: EnemyCar, projectile: Projectile): void {
    if (!enemy.active || !projectile.active || projectile.owner !== "player") return;
    projectile.despawn();
    const dead = enemy.takeDamage(projectile.damage);
    if (dead) {
      this.playSfx(SFX_KEYS.explosion);
      this.destroyEnemy(enemy);
    } else {
      enemy.applyDamageSlow();
    }
  }

  private handlePickupCollected(pickup: Pickup): void {
    if (!pickup.active) return;
    switch (pickup.type) {
      case "health":
        this.player.heal(PICKUPS.healthRestore);
        break;
      case "ammo":
        WEAPON_IDS.forEach((id) => this.player.weapons.addAmmo(id, PICKUPS.ammoRestore[id]));
        break;
      case "boost-score":
        this.scoreMultiplier = PICKUPS.scoreMultiplier;
        this.scoreMultiplierTimer = PICKUPS.scoreMultiplierDurationMs;
        break;
      case "boost-speed":
        this.player.applySpeedBoost(PICKUPS.speedBoostDurationMs);
        break;
    }
    this.playSfx(SFX_KEYS.pickup);
    pickup.despawn();
  }

  // Unlike the old debris/barrier obstacles, terrain patches aren't "used
  // up" on contact — this fires every frame the player overlaps one (see
  // Hazard.ts), setting state that update() reads into the next drive()
  // call rather than applying an effect directly here.
  private handleHazardOverlap(hazard: Hazard): void {
    if (!hazard.active || this.gameOver) return;
    if (hazard.type === "rough") {
      this.onRoughTerrain = true;
    } else {
      if (this.oilSlickTimer <= 0) this.oilDriftBias = Math.random() * 2 - 1;
      this.oilSlickTimer = OIL_SLICK.effectDurationMs;
    }
  }

  private spawnExplosion(x: number, y: number): void {
    const fx = this.add
      .image(x, y, "explosion")
      .setDepth(DEPTHS.explosion)
      .setScale(0.4)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(VISUAL_TINTS.explosion);
    this.tweens.add({
      targets: fx,
      scale: 1.1,
      alpha: 0,
      duration: 280,
      onComplete: () => fx.destroy(),
    });
  }

  private playSfx(key: string): void {
    if (this.cache.audio.exists(key)) {
      this.sound.play(key);
    }
  }

  private endGame(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.physics.pause();
    this.player.setTint(0x888888);
    this.playSfx(SFX_KEYS.gameOver);

    const finalScore = Math.floor(this.score);
    const isNewBest = finalScore > this.highScore;
    if (isNewBest) {
      this.highScore = finalScore;
      localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(this.highScore));
    }

    const final = this.overlay.getByName("finalScore") as Phaser.GameObjects.Text;
    final.setText(`Distance: ${finalScore} m`);
    const best = this.overlay.getByName("bestScore") as Phaser.GameObjects.Text;
    best.setText(isNewBest ? "New Best!" : `Best: ${this.highScore} m`);
    this.overlay.setVisible(true);

    this.input.keyboard!.once("keydown-SPACE", () => this.scene.restart());
    this.input.once("pointerdown", () => this.scene.restart());
  }

  private buildOverlay(): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x000000, 0.6);
    bg.setOrigin(0, 0);

    const title = this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60, "Game Over", {
      fontFamily: "monospace",
      fontSize: "40px",
      color: "#ffffff",
    });
    title.setOrigin(0.5);

    const final = this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, "Distance: 0 m", {
      fontFamily: "monospace",
      fontSize: "22px",
      color: "#ffffff",
    });
    final.setOrigin(0.5);
    final.setName("finalScore");

    const best = this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 26, "Best: 0 m", {
      fontFamily: "monospace",
      fontSize: "18px",
      color: "#ffd166",
    });
    best.setOrigin(0.5);
    best.setName("bestScore");

    const hint = this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70, "Press SPACE or tap to restart", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#cccccc",
    });
    hint.setOrigin(0.5);

    const container = this.add.container(0, 0, [bg, title, final, best, hint]);
    container.setDepth(DEPTHS.overlay);
    return container;
  }
}
