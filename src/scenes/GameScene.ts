import Phaser from "phaser";
import { PlayerCar } from "../entities/PlayerCar";
import { EnemyCar, NearestRival } from "../entities/EnemyCar";
import {
  generateTrack,
  pointAt,
  nearestPoint,
  wallDistancesAt,
  createSeededRng,
  Track,
  TrackQueryResult,
  WallDistances,
} from "../entities/track";
import { Projectile } from "../entities/Projectile";
import { Hazard, HazardType } from "../entities/Hazard";
import { Pickup } from "../entities/Pickup";
import { FireResult, sideGunAngleDeg, sideGunMountPosition } from "../entities/weapons";
import { angleBetween } from "../utils/angle";
import { SFX_KEYS } from "./BootScene";
import { RaceTracker } from "../systems/RaceTracker";
import { HudSystem } from "../systems/HudSystem";
import { InputHandler } from "../systems/InputHandler";
import { CollisionHandler } from "../systems/CollisionHandler";
import { PickupSystem } from "../systems/PickupSystem";
import { TouchControls } from "../systems/TouchControls";
import { isMobileMode } from "../utils/device";
import {
  SCORE_DISTANCE_DIVISOR,
  WEAPON_VISUALS,
  DEPTHS,
  ROAD_COLORS,
  WALLS,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  ENEMY_ARCHETYPES,
  EnemyArchetypeConfig,
  RIVALS,
  ENEMY_AI,
  TRACK,
  VISUAL_TINTS,
  HAZARDS,
  OBSTACLES,
  OIL_SLICK,
  FINISH_LINE,
  PLAYER_HANDLING,
  CAMERA,
} from "../config";

const HIGH_SCORE_STORAGE_KEY = "hit-the-road:best-distance";

// Dash period/fraction for the centerline's dashed divider line, in arc-
// length px — same dash-then-gap idea as the old scrolling road-divider
// TileSprite, just baked into the static track graphic now.
const DIVIDER_DASH_PERIOD = 80;
const DIVIDER_DASH_FRACTION = 0.5;
const DIVIDER_HALF_WIDTH = 3;

// Orchestrates the race: owns the core game objects (player, track,
// pooled groups) and spawning/firing/drawing logic specific to GameScene,
// while delegating lap/position tracking (RaceTracker), HUD rendering
// (HudSystem), keyboard input (InputHandler), hit-damage resolution
// (CollisionHandler), and pickups (PickupSystem) to their own subsystems.
export class GameScene extends Phaser.Scene {
  private player!: PlayerCar;
  private track!: Track;
  private playerProjectiles!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private enemyProjectiles!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.Group;

  private raceTracker!: RaceTracker;
  private hud!: HudSystem;
  private inputHandler!: InputHandler;
  private collisionHandler!: CollisionHandler;
  private pickupSystem!: PickupSystem;
  private touchControls!: TouchControls;

  // Smoothed look-ahead camera offset (see update()'s camera section) —
  // lerped toward a target each frame rather than snapping, the same
  // ease-toward-target idea the camera's own follow damping uses.
  private cameraLookAhead = { x: 0, y: 0 };

  // Every Math.random() call in this scene goes through this instead — see
  // getSeedFromUrl for why.
  private rng: () => number = Math.random;

  // Set just before player.drive() each frame by an explicit, immediate
  // physics.overlap() check (not a registered create()-time pair) — see
  // handlePlayerHazardOverlap for why that ordering matters here but not
  // for the other overlap pairs.
  private onRoughTerrain = false;
  // Ms remaining of the oil-slick control-loss debuff; refreshed to the
  // full duration every frame still overlapping a slick, then counts down
  // after leaving it so the "harder to control for a bit" effect lingers.
  private oilSlickTimer = 0;
  // Rolled once per activation (when oilSlickTimer goes from inactive to
  // active), not every frame — see OIL_SLICK in config.ts for why.
  private oilDriftBias = 0;

  // Cosmetic accumulator for the existing "Distance" HUD line/high-score —
  // not the actual win condition (see RaceTracker.playerLaps/TRACK.lapsToWin).
  private distanceTraveled = 0;
  private gameOver = false;
  private won = false;
  private highScore = 0;

  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super("game");
  }

  create(): void {
    this.distanceTraveled = 0;
    this.gameOver = false;
    this.won = false;
    this.onRoughTerrain = false;
    this.oilSlickTimer = 0;
    this.oilDriftBias = 0;
    this.cameraLookAhead = { x: 0, y: 0 };
    this.highScore = Number(localStorage.getItem(HIGH_SCORE_STORAGE_KEY) ?? 0);

    this.rng = this.getSeedFromUrl() ?? Math.random;
    this.track = generateTrack(this.rng);
    this.cameras.main.setBackgroundColor(ROAD_COLORS.ground);
    this.drawTrack(this.track);

    const start = pointAt(this.track, 0);
    const startHeadingDeg = (start.headingRad * 180) / Math.PI;
    this.player = new PlayerCar(this, start.x, start.y, "car-player", startHeadingDeg);

    const bounds = this.track.bounds;
    this.physics.world.setBounds(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    this.cameras.main.setBounds(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    // Zoomed out a bit further on mobile, whose smaller/touch-occluded
    // screen needs more margin to read an upcoming bend in time — see
    // update()'s look-ahead offset for the heading/speed-based half of this.
    this.cameras.main.setZoom(isMobileMode() ? CAMERA.mobileZoom : CAMERA.zoom);

    this.raceTracker = new RaceTracker(this.track, this.rng);
    this.raceTracker.initializePlayer(this.player.x, this.player.y);

    this.playerProjectiles = this.physics.add.group({ classType: Projectile, maxSize: 40, runChildUpdate: false });
    this.enemyProjectiles = this.physics.add.group({ classType: Projectile, maxSize: 40, runChildUpdate: false });
    this.enemies = this.physics.add.group({ classType: EnemyCar, maxSize: RIVALS.count, runChildUpdate: false });
    this.spawnRivals();
    this.hazards = this.physics.add.group({
      classType: Hazard,
      maxSize: HAZARDS.roughCount + HAZARDS.oilCount + OBSTACLES.count,
      runChildUpdate: false,
    });
    this.spawnHazards();

    this.pickupSystem = new PickupSystem(this, this.track, this.rng);
    this.collisionHandler = new CollisionHandler();
    this.hud = new HudSystem(this, this.highScore);
    this.inputHandler = new InputHandler(this, (weapon) => this.player.selectWeapon(weapon));
    this.touchControls = new TouchControls(this, (weapon) => this.player.selectWeapon(weapon));

    // Player vs. enemies is a *collider*, not an overlap — Arcade Physics
    // then physically separates the two bodies every step they touch, on
    // top of invoking our ram-damage callback (see Collision shunt in
    // high-level-design.md).
    this.physics.add.collider(this.player, this.enemies, (_p, e) => this.handlePlayerEnemyCollision(e as EnemyCar), undefined, this);
    this.physics.add.overlap(this.player, this.enemyProjectiles, (_p, proj) => this.handlePlayerHitByProjectile(proj as Projectile), undefined, this);
    this.physics.add.overlap(
      this.playerProjectiles,
      this.enemies,
      (proj, e) => this.handleEnemyHitByProjectile(e as EnemyCar, proj as Projectile),
      undefined,
      this
    );
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(
      this.player,
      this.pickupSystem.getGroup(),
      (_p, pk) => this.pickupSystem.handlePickupCollection(this.player, pk as Pickup),
      undefined,
      this
    );

    this.overlay = this.buildOverlay();
    this.overlay.setVisible(false);

    // Test hooks: when `?e2e=1` is present or `window.__E2E_TEST__` is set,
    // expose a lightweight `__GAME_STATE__` for E2E assertions. This is
    // intentionally minimal and optional for CI/debugging.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("e2e") === "1" || (window as any).__E2E_TEST__) {
        (window as any).__E2E_TEST__ = true;
        this.updateE2EGameState(0);
      }
    } catch (e) {
      // ignore in environments without a window/search
    }
  }

  // A `?seed=` URL param gets the same track *and* the same archetype
  // picks/hazard placement/rubber-band-and-oil-slick rolls every load —
  // every Math.random() call in this file goes through `this.rng` instead,
  // so a seeded race is fully reproducible end to end, not just the track
  // shape. Used by the e2e suite (see e2e/tests/) so position/outcome
  // assertions don't flake from race to race. Absent or non-numeric falls
  // back to Math.random, same as ordinary play.
  private getSeedFromUrl(): (() => number) | undefined {
    const raw = new URLSearchParams(window.location.search).get("seed");
    if (raw === null) return undefined;
    const seed = Number(raw);
    return Number.isFinite(seed) ? createSeededRng(seed) : undefined;
  }

  // Builds all RIVALS.count rivals at once, positioned in a small grid just
  // behind the player's own start point (see RIVALS.startOffsets) — unlike
  // the old timed/gap-tracked spawn model, every rival is a real, always-
  // active 2D car from the very first frame.
  private spawnRivals(): void {
    for (const offset of RIVALS.startOffsets) {
      const point = pointAt(this.track, offset.s);
      const nx = Math.cos(point.headingRad);
      const ny = Math.sin(point.headingRad);
      const x = point.x + nx * offset.lateral;
      const y = point.y + ny * offset.lateral;
      const headingDeg = (point.headingRad * 180) / Math.PI;
      const archetype = this.pickArchetype();
      const car = this.enemies.get(x, y, archetype.texture) as EnemyCar | null;
      if (!car) continue;
      car.spawn(archetype, x, y, headingDeg);
      this.raceTracker.addRival(car, x, y);
    }
  }

  // Picks one archetype by weight (with replacement) — used once per rival
  // when the roster is assembled at race start.
  private pickArchetype(): EnemyArchetypeConfig {
    const all = Object.values(ENEMY_ARCHETYPES);
    const totalWeight = all.reduce((sum, a) => sum + a.weight, 0);
    let roll = this.rng() * totalWeight;
    for (const a of all) {
      if (roll < a.weight) return a;
      roll -= a.weight;
    }
    return ENEMY_ARCHETYPES.chaser;
  }

  // Places every hazard once around the loop at race start — the track is
  // fixed for the whole race now, so there's no continuous spawn-and-scroll
  // pool the way the old endless-runner model needed. Roughly evenly
  // spaced slots around the track (skipping a clearance zone right at the
  // start/finish line) with random jitter within each slot keep placements
  // from clustering while still avoiding a perfectly mechanical grid.
  private spawnHazards(): void {
    const types: HazardType[] = [
      ...Array<HazardType>(HAZARDS.roughCount).fill("rough"),
      ...Array<HazardType>(HAZARDS.oilCount).fill("oil"),
      ...Array<HazardType>(OBSTACLES.count).fill("obstacle"),
    ];
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }

    const usableLength = this.track.totalLength - HAZARDS.startClearancePx;
    const slotSpacing = usableLength / types.length;
    const maxLateral = this.track.pavedHalfWidth - HAZARDS.lateralMargin;

    types.forEach((type, i) => {
      const jitter = (this.rng() - 0.5) * slotSpacing * 0.5;
      const s = HAZARDS.startClearancePx + i * slotSpacing + jitter;
      const lateral = (this.rng() * 2 - 1) * maxLateral;
      const point = pointAt(this.track, s);
      const nx = Math.cos(point.headingRad);
      const ny = Math.sin(point.headingRad);
      const x = point.x + nx * lateral;
      const y = point.y + ny * lateral;
      const texture = type === "rough" ? "hazard-rough" : type === "oil" ? "hazard-oil" : "hazard-obstacle";
      const hazard = this.hazards.get(x, y, texture) as Hazard | null;
      if (!hazard) return;
      hazard.spawn(type, x, y, texture);
    });
  }

  // Drawn once at race start into a single static Graphics object — the
  // track is fixed for the whole race now, so there's no need to redraw it
  // every frame the way the old scrolling-road model had to.
  private drawTrack(track: Track): void {
    const g = this.add.graphics().setDepth(DEPTHS.roadBackground);
    const n = track.samples.length;

    for (let i = 0; i < n; i++) {
      const a = track.samples[i];
      const b = track.samples[(i + 1) % n];
      const aSide = this.sideEdges(track, a);
      const bSide = this.sideEdges(track, b);

      g.fillStyle(ROAD_COLORS.road, 1);
      g.fillPoints([aSide.pavedLeft, aSide.pavedRight, bSide.pavedRight, bSide.pavedLeft], true);

      g.fillStyle(WALLS.rockColor, 1);
      g.fillPoints([aSide.pavedLeft, aSide.wallLeft, bSide.wallLeft, bSide.pavedLeft], true);
      g.fillPoints([aSide.pavedRight, aSide.wallRight, bSide.wallRight, bSide.pavedRight], true);

      if (a.s % DIVIDER_DASH_PERIOD < DIVIDER_DASH_PERIOD * DIVIDER_DASH_FRACTION) {
        const nx = Math.cos(a.headingRad);
        const ny = Math.sin(a.headingRad);
        g.fillStyle(ROAD_COLORS.divider, 1);
        g.fillPoints(
          [
            { x: a.x - nx * DIVIDER_HALF_WIDTH, y: a.y - ny * DIVIDER_HALF_WIDTH },
            { x: a.x + nx * DIVIDER_HALF_WIDTH, y: a.y + ny * DIVIDER_HALF_WIDTH },
            { x: b.x + nx * DIVIDER_HALF_WIDTH, y: b.y + ny * DIVIDER_HALF_WIDTH },
            { x: b.x - nx * DIVIDER_HALF_WIDTH, y: b.y - ny * DIVIDER_HALF_WIDTH },
          ],
          true
        );
      }
    }

    this.drawFinishLine(g, track);
  }

  // A checkered start/finish line painted across the road at s=0, the same
  // point lap counting treats as the loop boundary (see RaceTracker) —
  // painted last into the shared track Graphics object so it sits on top
  // of the road fill it's drawn over. Squares alternate in both directions
  // (row + column parity) for a real checker-flag look rather than a single
  // stripe, sized in world px via FINISH_LINE so it scales with the road.
  private drawFinishLine(g: Phaser.GameObjects.Graphics, track: Track): void {
    const origin = pointAt(track, 0);
    const fx = Math.sin(origin.headingRad);
    const fy = -Math.cos(origin.headingRad);
    const nx = Math.cos(origin.headingRad);
    const ny = Math.sin(origin.headingRad);

    const { squareSize, rows, darkColor, lightColor } = FINISH_LINE;
    const columns = Math.ceil((track.pavedHalfWidth * 2) / squareSize);
    const rowStart = -(rows * squareSize) / 2;
    const colStart = -track.pavedHalfWidth;

    for (let row = 0; row < rows; row++) {
      const along0 = rowStart + row * squareSize;
      const along1 = along0 + squareSize;
      for (let col = 0; col < columns; col++) {
        const lateral0 = colStart + col * squareSize;
        const lateral1 = Math.min(lateral0 + squareSize, track.pavedHalfWidth);
        if (lateral1 <= lateral0) continue;

        const corners = [
          { along: along0, lateral: lateral0 },
          { along: along0, lateral: lateral1 },
          { along: along1, lateral: lateral1 },
          { along: along1, lateral: lateral0 },
        ].map(({ along, lateral }) => ({
          x: origin.x + fx * along + nx * lateral,
          y: origin.y + fy * along + ny * lateral,
        }));

        g.fillStyle((row + col) % 2 === 0 ? darkColor : lightColor, 1);
        g.fillPoints(corners, true);
      }
    }
  }

  private sideEdges(
    track: Track,
    sample: { x: number; y: number; headingRad: number; s: number }
  ): { pavedLeft: { x: number; y: number }; pavedRight: { x: number; y: number }; wallLeft: { x: number; y: number }; wallRight: { x: number; y: number } } {
    const { leftWallDist, rightWallDist } = wallDistancesAt(track, sample.s);
    const nx = Math.cos(sample.headingRad);
    const ny = Math.sin(sample.headingRad);
    return {
      pavedLeft: { x: sample.x - nx * track.pavedHalfWidth, y: sample.y - ny * track.pavedHalfWidth },
      pavedRight: { x: sample.x + nx * track.pavedHalfWidth, y: sample.y + ny * track.pavedHalfWidth },
      wallLeft: { x: sample.x - nx * leftWallDist, y: sample.y - ny * leftWallDist },
      wallRight: { x: sample.x + nx * rightWallDist, y: sample.y + ny * rightWallDist },
    };
  }

  // Belt-and-suspenders position guard, same idea the old straight-road
  // version used (clamping player.x into the wall bounds every frame) —
  // pushes a car back along the track-normal direction if anything (e.g. a
  // ram shunt) ever puts it past a wall the velocity itself didn't catch.
  // Shared by the player and every rival.
  private clampToTrackBounds(car: { x: number; y: number }, query: TrackQueryResult, wallDist: WallDistances): TrackQueryResult {
    const clampedOffset = Phaser.Math.Clamp(query.lateralOffset, -wallDist.leftWallDist, wallDist.rightWallDist);
    if (clampedOffset === query.lateralOffset) return query;
    const point = pointAt(this.track, query.s);
    const nx = Math.cos(point.headingRad);
    const ny = Math.sin(point.headingRad);
    car.x = point.x + nx * clampedOffset;
    car.y = point.y + ny * clampedOffset;
    return { ...query, lateralOffset: clampedOffset };
  }

  update(_time: number, delta: number): void {
    if (this.gameOver || this.won) {
      // Still refresh the e2e snapshot even once the run has ended — without
      // this, __GAME_STATE__ keeps whatever it last held the frame *before*
      // endGame()/finishRace() flipped the flag (this method returns before
      // ever reaching updateE2EGameState below), so an e2e test waiting on
      // `state.gameOver` would never see it become true.
      this.updateE2EGameState(0);
      return;
    }

    let trackQuery = nearestPoint(this.track, this.player.x, this.player.y, this.raceTracker.getPlayerLastS());
    const wallDist = wallDistancesAt(this.track, trackQuery.s);
    trackQuery = this.clampToTrackBounds(this.player, trackQuery, wallDist);

    // Checked explicitly (not via a registered create()-time overlap pair)
    // so we control exactly when it runs relative to building this frame's
    // input — see handlePlayerHazardOverlap for why that ordering matters
    // here but not for the other overlap pairs.
    this.onRoughTerrain = false;
    this.physics.overlap(this.player, this.hazards, (_p, hz) => this.handlePlayerHazardOverlap(hz as Hazard));

    const input = this.inputHandler.getPlayerInput({
      onRoughTerrain: this.onRoughTerrain,
      oilSlicked: this.oilSlickTimer > 0,
      oilDriftBias: this.oilDriftBias,
      lateralOffset: trackQuery.lateralOffset,
      pavedHalfWidth: this.track.pavedHalfWidth,
      leftWallDist: wallDist.leftWallDist,
      rightWallDist: wallDist.rightWallDist,
    });
    // OR-combine with the virtual joystick the same way InputHandler already
    // OR-combines WASD with the arrow keys — touch and keyboard are just two
    // alternate sources for the same booleans, not a separate input model.
    const touchMove = this.touchControls.getMoveInput();
    input.accelerate ||= touchMove.accelerate;
    input.brake ||= touchMove.brake;
    input.left ||= touchMove.left;
    input.right ||= touchMove.right;

    const forwardSpeed = this.player.drive(input, delta);
    if (this.oilSlickTimer > 0) this.oilSlickTimer -= delta;
    this.raceTracker.updatePlayerS(trackQuery.s);

    this.handleFiring();
    this.touchControls.update(this.player.weapons.current);
    this.updateCameraLookAhead(forwardSpeed, delta);

    this.pickupSystem.update(delta);
    this.distanceTraveled += ((Math.max(0, forwardSpeed) * delta) / 1000 / SCORE_DISTANCE_DIVISOR) * this.pickupSystem.getScoreMultiplier();

    this.updateRivals(delta);
    this.raceTracker.applyLapHealthBonuses(this.player);
    this.hud.updateText(this.player, this.distanceTraveled, forwardSpeed);
    this.hud.drawWeaponMeter(this.player, this.touchControls.getTurretAimPointer() ?? this.input.activePointer);
    this.hud.drawHealthBars(this.player, this.raceTracker.getRivals());
    this.hud.updateWeaponSidebar(this.player);
    this.updateProjectiles();
    this.updateRaceDebugText();
    this.updateE2EGameState(forwardSpeed);

    if (this.player.health <= 0) {
      this.endGame();
    } else if (this.raceTracker.hasPlayerFinished()) {
      this.finishRace();
    }
  }

  // Unlike the continuous rough/oil patches, this fires once per overlap
  // and despawns the hazard — it's a discrete object you clip, not ground
  // you drive over (see HazardType in Hazard.ts).
  private handlePlayerHazardOverlap(hazard: Hazard): void {
    if (!hazard.active) return;
    if (hazard.type === "rough") {
      this.onRoughTerrain = true;
    } else if (hazard.type === "oil") {
      if (this.oilSlickTimer <= 0) this.oilDriftBias = this.rng() * 2 - 1;
      this.oilSlickTimer = OIL_SLICK.effectDurationMs;
    } else {
      this.damagePlayer(OBSTACLES.damage);
      this.player.applyObstacleHit(OBSTACLES.speedPenaltyFactor);
      this.playSfx(SFX_KEYS.collision);
      hazard.despawn();
    }
  }

  // Drives every still-active rival for one frame: track position/lap
  // bookkeeping (delegated to RaceTracker), the blended steering target
  // (track lookahead + chase/avoid + nearest-rival avoidance — see
  // enemyBehaviors.ts), firing, and wall/elimination handling.
  private updateRivals(delta: number): void {
    const rivals = this.raceTracker.getRivals();
    const activeRivals = rivals.filter((r) => r.car.active);

    activeRivals.forEach((r) => (r.car.onRoughTerrainThisFrame = false));
    this.physics.overlap(this.enemies, this.hazards, (eObj, hzObj) => this.handleRivalHazardOverlap(eObj as EnemyCar, hzObj as Hazard));

    for (const rival of rivals) {
      if (!rival.car.active) continue;
      const car = rival.car;

      let trackQuery = nearestPoint(this.track, car.x, car.y, rival.lastS);
      const wallDist = wallDistancesAt(this.track, trackQuery.s);
      trackQuery = this.clampToTrackBounds(car, trackQuery, wallDist);

      const rubberBandMultiplier = this.raceTracker.updateRival(rival, trackQuery.s, delta);

      const lookaheadPoint = pointAt(this.track, trackQuery.s + ENEMY_AI.lookaheadDistPx);
      const lookaheadHeadingDeg = angleBetween(car.x, car.y, lookaheadPoint.x, lookaheadPoint.y);

      let nearestRival: NearestRival | undefined;
      let nearestDist = Infinity;
      for (const other of activeRivals) {
        if (other.car === car) continue;
        const dist = Phaser.Math.Distance.Between(car.x, car.y, other.car.x, other.car.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestRival = { awayFromNearestRivalDeg: angleBetween(other.car.x, other.car.y, car.x, car.y), dist };
        }
      }

      const died = car.drive({
        baseApproachSpeed: RIVALS.baseApproachSpeed,
        rubberBandMultiplier,
        playerX: this.player.x,
        playerY: this.player.y,
        delta,
        lookaheadHeadingDeg,
        lateralOffset: trackQuery.lateralOffset,
        pavedHalfWidth: this.track.pavedHalfWidth,
        leftWallDist: wallDist.leftWallDist,
        rightWallDist: wallDist.rightWallDist,
        rival: nearestRival,
      });

      if (died) {
        this.playSfx(SFX_KEYS.explosion);
        this.destroyEnemy(car);
        continue;
      }

      if (car.canFire()) {
        this.spawnEnemyProjectile(car);
        car.resetFireTimer();
      }
    }
  }

  private updateRaceDebugText(): void {
    const { position, total } = this.raceTracker.computeRacePosition();
    const lapDisplay = Math.min(this.raceTracker.playerLaps() + 1, TRACK.lapsToWin);
    this.hud.updateRaceDebugText(lapDisplay, TRACK.lapsToWin, position, total);
  }

  // Exposes a lightweight `window.__GAME_STATE__` snapshot for the e2e
  // suite (see e2e/tests/) — gated behind `window.__E2E_TEST__` (set by
  // create()'s `?e2e=1` detection) so this never runs, or costs anything,
  // during ordinary play. Intentionally minimal: enough to assert on
  // without exposing internals the tests shouldn't be coupled to.
  private updateE2EGameState(forwardSpeed: number): void {
    try {
      if (!(window as any).__E2E_TEST__) return;
      const weapon = this.player.weapons.current;
      const { position, total } = this.raceTracker.computeRacePosition();
      (window as any).__GAME_STATE__ = {
        player: {
          x: this.player.x,
          y: this.player.y,
          health: this.player.health,
          laps: this.raceTracker.playerLaps(),
          speed: forwardSpeed,
          weapon,
          ammo: this.player.weapons.getState(weapon).ammo,
          position,
        },
        rivals: this.raceTracker.getActiveRivals().map((r) => ({
          x: r.car.x,
          y: r.car.y,
          health: r.car.health,
          heading: r.car.heading,
          laps: Math.floor((r.lastS - r.startS) / this.track.totalLength),
        })),
        rivalsTotal: total - 1,
        hazards: this.countActiveHazardsByType(),
        gameOver: this.gameOver,
        won: this.won,
        raceDebug: this.hud.getRaceDebugText(),
      };
    } catch (e) {
      // ignore in environments without a window
    }
  }

  private countActiveHazardsByType(): Record<HazardType, number> {
    const counts: Record<HazardType, number> = { rough: 0, oil: 0, obstacle: 0 };
    this.hazards.getChildren().forEach((obj) => {
      const hazard = obj as Hazard;
      if (hazard.active) counts[hazard.type]++;
    });
    return counts;
  }

  private handleFiring(): void {
    const weapon = this.player.weapons.current;
    if (weapon === "turret") {
      // Resolved through TouchControls rather than reading
      // this.input.activePointer directly — on mobile that's whichever
      // non-joystick finger is down outside the UI (so a tap can aim+fire
      // even while the other thumb is still on the joystick); on desktop
      // it's the mouse, unless it's hovering the weapon sidebar.
      const pointer = this.touchControls.getTurretAimPointer();
      if (!pointer) return;
      const turretAimDeg = this.computeTurretAimDeg(pointer);
      const shot = this.player.tryFire(turretAimDeg);
      if (shot) this.spawnPlayerProjectile(shot);
      return;
    }

    const wantsFire = this.inputHandler.isFirePressed() || this.touchControls.isFireButtonHeld();
    if (!wantsFire) return;
    const shot = this.player.tryFire();
    if (shot) this.spawnPlayerProjectile(shot);
  }

  // Biases the camera's follow target toward wherever the player is
  // currently heading, scaled by current speed (stationary/slow = no bias,
  // flat-out = full CAMERA.lookAheadMaxPx) and smoothed via
  // CAMERA.lookAheadLerp so it eases rather than snaps as heading/speed
  // change. Phaser's Camera.setFollowOffset(x, y) centers the view on
  // (target.x - x, target.y - y), so the offset passed in is the *negative*
  // of the desired look-ahead vector — shifting the camera's center ahead
  // of the player puts more of the upcoming road in view, with the player
  // riding nearer the trailing edge of the screen.
  private updateCameraLookAhead(forwardSpeed: number, delta: number): void {
    const headingRad = (this.player.heading * Math.PI) / 180;
    const speedFraction = Math.min(1, Math.abs(forwardSpeed) / PLAYER_HANDLING.maxForwardSpeed);
    const targetX = Math.sin(headingRad) * CAMERA.lookAheadMaxPx * speedFraction;
    const targetY = -Math.cos(headingRad) * CAMERA.lookAheadMaxPx * speedFraction;
    const ease = 1 - Math.pow(1 - CAMERA.lookAheadLerp, delta / 16.67);
    this.cameraLookAhead.x += (targetX - this.cameraLookAhead.x) * ease;
    this.cameraLookAhead.y += (targetY - this.cameraLookAhead.y) * ease;
    this.cameras.main.setFollowOffset(-this.cameraLookAhead.x, -this.cameraLookAhead.y);
  }

  // Turret aim is absolute (aimed directly at the world position under the
  // pointer), independent of the car's own heading — same math as before,
  // now resolved through the camera since pointer.worldX/Y already accounts
  // for wherever the camera has scrolled to follow the player.
  private computeTurretAimDeg(pointer: Phaser.Input.Pointer): number {
    const dx = pointer.worldX - this.player.x;
    const dy = pointer.worldY - this.player.y;
    return Phaser.Math.RadToDeg(Math.atan2(dx, -dy));
  }

  // Rocket/side-guns angles from WeaponController are relative to the car's
  // own forward direction (0 = dead ahead) — now that the car can face any
  // direction, "ahead" means the car's current heading, not a fixed "up".
  // Turret's angle is already absolute (aimed at the pointer), so it's
  // returned unchanged.
  private fireAngleDeg(shot: FireResult): number {
    return shot.weapon === "turret" ? shot.angleDeg : this.player.heading + shot.angleDeg;
  }

  private spawnPlayerProjectile(shot: FireResult): void {
    const texture = shot.weapon === "rocket" ? "projectile-rocket" : "projectile-bullet";
    const visuals = WEAPON_VISUALS[shot.weapon];
    const headingRad = (this.player.heading * Math.PI) / 180;

    if (shot.weapon === "sideguns") {
      // Twin mounts on the left/right of the car relative to its current
      // heading (not a fixed world x-offset any more — see fireAngleDeg).
      for (const side of [-1, 1] as const) {
        const { x, y } = sideGunMountPosition(this.player.x, this.player.y, this.player.heading, this.player.displayWidth, side);
        const angleDeg = this.player.heading + sideGunAngleDeg(side, shot.angleDeg);
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

    const angleDeg = this.fireAngleDeg(shot);
    const rad = Phaser.Math.DegToRad(angleDeg);
    const vx = Math.sin(rad) * shot.projectileSpeed;
    const vy = -Math.cos(rad) * shot.projectileSpeed;
    const x = this.player.x + Math.sin(headingRad) * 30;
    const y = this.player.y - Math.cos(headingRad) * 30;
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

  private updateProjectiles(): void {
    const now = this.time.now;
    [this.playerProjectiles, this.enemyProjectiles].forEach((group) => {
      group.getChildren().forEach((obj) => {
        const projectile = obj as Projectile;
        if (!projectile.active) return;
        if (now >= projectile.despawnAt) projectile.despawn();
      });
    });
  }

  // Spawns a pickup drop (chance-gated) and rolls the score-multiplier
  // bonus into the kill's score value — see PickupSystem.
  private destroyEnemy(enemy: EnemyCar): void {
    this.spawnExplosion(enemy.x, enemy.y);
    this.distanceTraveled += enemy.archetype.scoreValue * this.pickupSystem.getScoreMultiplier();
    this.pickupSystem.spawnOnEnemyDestroy(enemy.x, enemy.y);
    enemy.despawn();
  }

  // Covers all active rivals in one overlap call per frame (see
  // updateRivals) — rough/oil set per-frame flags/timers the same way
  // handlePlayerHazardOverlap does; obstacle is a one-time hit resolved
  // through CollisionHandler, same as a weapon/ram hit.
  private handleRivalHazardOverlap(enemy: EnemyCar, hazard: Hazard): void {
    if (!enemy.active || !hazard.active) return;
    if (hazard.type === "rough") {
      enemy.onRoughTerrainThisFrame = true;
    } else if (hazard.type === "oil") {
      if (enemy.oilSlickTimer <= 0) enemy.oilDriftBias = this.rng() * 2 - 1;
      enemy.oilSlickTimer = OIL_SLICK.effectDurationMs;
    } else {
      hazard.despawn();
      const dead = this.collisionHandler.damageEnemy(enemy, OBSTACLES.damage);
      if (dead) {
        this.playSfx(SFX_KEYS.explosion);
        this.destroyEnemy(enemy);
      }
    }
  }

  private handlePlayerEnemyCollision(enemy: EnemyCar): void {
    if (!enemy.active || this.gameOver || this.won || enemy.ramCooldown > 0) return;
    const dead = this.collisionHandler.resolveRamCollision(this.player, enemy);
    if (dead) {
      this.playSfx(SFX_KEYS.explosion);
      this.destroyEnemy(enemy);
    } else {
      this.playSfx(SFX_KEYS.collision);
    }
  }

  private damagePlayer(amount: number): void {
    const destroyed = this.player.takeDamage(amount);
    this.player.applyDamageSlow();
    if (destroyed) this.endGame();
  }

  private handlePlayerHitByProjectile(projectile: Projectile): void {
    if (!projectile.active || projectile.owner !== "enemy" || this.gameOver || this.won) return;
    this.playSfx(SFX_KEYS.collision);
    this.damagePlayer(projectile.damage);
    projectile.despawn();
  }

  private handleEnemyHitByProjectile(enemy: EnemyCar, projectile: Projectile): void {
    if (!enemy.active || !projectile.active || projectile.owner !== "player") return;
    projectile.despawn();
    const dead = this.collisionHandler.damageEnemy(enemy, projectile.damage);
    if (dead) {
      this.playSfx(SFX_KEYS.explosion);
      this.destroyEnemy(enemy);
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
    if (this.gameOver || this.won) return;
    this.gameOver = true;
    this.physics.pause();
    this.player.setTint(0x888888);
    this.playSfx(SFX_KEYS.gameOver);
    this.showEndOverlay("Game Over");
  }

  // Reaching TRACK.lapsToWin ends the run in a win/finish screen instead of
  // the death game-over screen — distinct title, no gray death tint, but
  // otherwise the same best-distance persistence and restart flow.
  private finishRace(): void {
    if (this.gameOver || this.won) return;
    this.won = true;
    this.physics.pause();
    this.showEndOverlay("Finished!");
  }

  private showEndOverlay(title: string): void {
    const finalScore = Math.floor(this.distanceTraveled);
    const isNewBest = finalScore > this.highScore;
    if (isNewBest) {
      this.highScore = finalScore;
      localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(this.highScore));
    }

    (this.overlay.getByName("title") as Phaser.GameObjects.Text).setText(title);
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
    title.setName("title");

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
    container.setScrollFactor(0);
    return container;
  }
}
