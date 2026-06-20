export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 720;

export const ROAD_WIDTH = 320;
export const ROAD_X = (CANVAS_WIDTH - ROAD_WIDTH) / 2;

export const PLAYER_Y = CANVAS_HEIGHT - 110;

// Applied to both the player and every enemy archetype's sprite — shrinking
// cars from the source art's native size leaves more road visible and more
// room to react to traffic, instead of the canvas feeling crowded.
export const CAR_SCALE = 0.6;

// Centralized render depths (Phaser draws higher depths on top of lower
// ones) — without explicit values here, pooled entity types default to 0
// and tie-break by creation order, which is what let hazard patches render
// in front of cars depending on spawn order. Ground-level decals sit below
// everything that drives over them; projectiles sit above cars so a shot
// flying over a car right before impact stays visible.
export const DEPTHS = {
  roadBackground: -10,
  hazard: -7,
  pickup: -3,
  enemy: 5,
  projectile: 6,
  player: 10,
  weaponMeter: 11,
  healthBar: 12,
  explosion: 15,
  hud: 20,
  overlay: 30,
};

export const PLAYER_HANDLING = {
  acceleration: 420,
  brakeDeceleration: 600,
  reverseAcceleration: 260,
  coastFriction: 160,
  maxForwardSpeed: 620,
  maxReverseSpeed: 220,
  minTurnSpeed: 160,
  maxTurnSpeed: 360,
  offroadDrag: 260,
};

export const PLAYER_HEALTH = {
  max: 100,
  offroadDamagePerSecond: 6,
};

export const DRIFT = {
  minSpeedToDrift: 80,
  turnMultiplier: 1.8,
  speedDrainPerSecond: 90,
  weaponInstabilityMultiplier: 2.2,
};

export type EnemyArchetypeId = "chaser" | "shooter" | "heavy" | "bomber";

export type ApproachDirection = "behind" | "side";

export interface EnemyArchetypeConfig {
  id: EnemyArchetypeId;
  texture: string;
  tint: number;
  health: number;
  speedMultiplier: number;
  approachFrom: ApproachDirection;
  lateralSpeed: number;
  chasesPlayer: boolean;
  keepsDistance: boolean;
  fireCooldown: number;
  projectileSpeed: number;
  projectileDamage: number;
  scoreValue: number;
}

export const ENEMY_ARCHETYPES: Record<EnemyArchetypeId, EnemyArchetypeConfig> = {
  chaser: {
    id: "chaser",
    texture: "car-enemy-1",
    tint: 0xcc6655,
    health: 45,
    speedMultiplier: 1.05,
    approachFrom: "behind",
    lateralSpeed: 140,
    chasesPlayer: true,
    keepsDistance: false,
    fireCooldown: 0,
    projectileSpeed: 0,
    projectileDamage: 0,
    scoreValue: 15,
  },
  shooter: {
    id: "shooter",
    texture: "car-enemy-2",
    tint: 0xc9c977,
    health: 60,
    speedMultiplier: 0.85,
    approachFrom: "side",
    lateralSpeed: 100,
    chasesPlayer: false,
    keepsDistance: true,
    fireCooldown: 1400,
    projectileSpeed: 480,
    projectileDamage: 8,
    scoreValue: 20,
  },
  heavy: {
    id: "heavy",
    texture: "car-enemy-3",
    tint: 0x7a9466,
    health: 160,
    speedMultiplier: 0.6,
    approachFrom: "side",
    lateralSpeed: 0,
    chasesPlayer: false,
    keepsDistance: false,
    fireCooldown: 0,
    projectileSpeed: 0,
    projectileDamage: 0,
    scoreValue: 30,
  },
  bomber: {
    id: "bomber",
    texture: "car-enemy-4",
    tint: 0xe28a44,
    health: 24,
    speedMultiplier: 1.1,
    approachFrom: "behind",
    lateralSpeed: 200,
    chasesPlayer: true,
    keepsDistance: false,
    fireCooldown: 0,
    projectileSpeed: 0,
    projectileDamage: 0,
    scoreValue: 25,
  },
};

export const ENEMY_UNLOCKS: { minScore: number; id: EnemyArchetypeId; weight: number }[] = [
  { minScore: 0, id: "chaser", weight: 3 },
  { minScore: 120, id: "shooter", weight: 3 },
  { minScore: 260, id: "heavy", weight: 2 },
  { minScore: 420, id: "bomber", weight: 2 },
];

export const ENEMY_SPAWN = {
  // Enemies are meant to be roughly equal to the player in raw speed, not
  // categorically slower or faster — the actual edge in a chase should come
  // from avoiding obstacles and combat (see DAMAGE_SLOW below), not from a
  // hard speed advantage built into the spawn config. baseApproachSpeed is
  // comfortably below typical cruising speed early on (outrunning a passive
  // chaser stays easy), and maxApproachSpeed × the aggressive archetypes'
  // speedMultiplier (chaser 1.05, bomber 1.1) lands close to — bomber just
  // past — the player's own maxForwardSpeed (620) at peak difficulty, so a
  // flat-out player can usually still out-leg them, but only barely.
  baseApproachSpeed: 260,
  maxApproachSpeed: 580,
  approachSpeedPerScore: 1.0,
  // Slower cadence than before, plus the hard concurrency cap below — fewer
  // cars on screen at once so each one reads as an opponent to out-drive
  // rather than part of an undifferentiated swarm.
  spawnIntervalInitial: 2200,
  spawnIntervalMin: 1000,
  spawnIntervalScoreFactor: 1.5,
  // Hard cap on simultaneously active enemies, checked before every spawn
  // attempt (a maxed-out group just skips that attempt) — independent of
  // spawn interval, so late-game interval shrinkage can't pack the road full.
  maxConcurrent: 5,
  minSpawnXGap: 70,
  spawnMargin: 24,
  despawnMarginY: 80,
  // "side" archetypes (shooter, heavy) merge in from the road's left/right
  // edge already level with the player, rather than spawning off the top of
  // the screen like old front-oncoming traffic — these bound how far ahead
  // of the player's current y they can appear.
  sideSpawnAheadMin: 40,
  sideSpawnAheadMax: 260,
};

// Enemy "AI": steering toward a target lateral velocity is smoothed (inertia,
// so cars drift into a line change rather than snapping sideways like a
// robot) and nudged away from whichever other enemy is currently closest
// (Euclidean, in screen space) so they don't simply stack on top of each
// other. Aggressive archetypes (chasesPlayer: true) only weakly avoid —
// they're trying to ram, so a collision with another car is an acceptable
// side effect, not something they steer hard to prevent.
export const ENEMY_AI = {
  steeringSmoothing: 0.12,
  avoidanceRadius: 70,
  aggressiveAvoidanceWeight: 0.3,
  passiveAvoidanceWeight: 0.75,
};

export const SCORE_DISTANCE_DIVISOR = 10;

export type WeaponId = "rocket" | "sideguns" | "turret";

export interface WeaponConfig {
  id: WeaponId;
  maxAmmo: number;
  damage: number;
  projectileSpeed: number;
  fireCooldown: number;
}

// Side guns fire one projectile from each side mount per trigger pull (see
// SIDE_GUN_MOUNTS / GameScene.spawnPlayerProjectile) — damage is per
// projectile, so a clean double-hit deals ~2x this value; tuned down from
// the old single-shot 18 to keep total output comparable now that landing
// both is easier than landing the old single centered shot.
export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  rocket: { id: "rocket", maxAmmo: 6, damage: 60, projectileSpeed: 700, fireCooldown: 700 },
  sideguns: { id: "sideguns", maxAmmo: 30, damage: 10, projectileSpeed: 600, fireCooldown: 180 },
  turret: { id: "turret", maxAmmo: 999, damage: 10, projectileSpeed: 650, fireCooldown: 150 },
};

// Per-weapon look, so the three weapons read as different at a glance instead
// of all firing the same tinted dot: rocket is the big slow red-orange one,
// side guns a mid pale-yellow round, turret a small fast cyan tracer.
//
// Rocket uses "normal" blend rather than "add" — its default firing lane is
// dead center on the road, which is exactly where the tan road-divider dashes
// scroll past, and an additive light-colored glow washes out to near-white
// (i.e. invisible against the similarly pale divider) every time it crosses
// one. A normally-blended saturated tint stays visibly red-orange against
// both the dark road and the divider. Side guns/turret keep "add" — they're
// small/fast enough, and fire often enough, that the occasional faint frame
// over the divider doesn't read as "did that even fire?" the way a single
// rare rocket shot does.
export const WEAPON_VISUALS: Record<
  WeaponId,
  { tint: number; scale: number; meterColor: number; blend: "normal" | "add" }
> = {
  rocket: { tint: 0xff3300, scale: 2.4, meterColor: 0xff3300, blend: "normal" },
  sideguns: { tint: 0xfff2a0, scale: 1.3, meterColor: 0xfff2a0, blend: "add" },
  turret: { tint: 0x66e0ff, scale: 0.9, meterColor: 0x66e0ff, blend: "add" },
};

// Side guns now mount on the car's left/right sides and aim outward rather
// than forward — centerAngleDeg is the neutral aim direction for each side
// (left = -centerAngleDeg, right = +centerAngleDeg, using the shared
// canvas-angle convention where 0 = straight ahead, positive = clockwise),
// with the shared sweep meter (SIDE_GUN_SWEEP) deflecting both mounts
// symmetrically toward the front at its extremes. extraOffsetPx pushes the
// mount points out a bit further than the car's own half-width so the twin
// barrels visibly poke out past the body instead of reading as one cluster.
export const SIDE_GUN_MOUNTS = {
  centerAngleDeg: 90,
  extraOffsetPx: 6,
};

// In-world meter drawn above the player car showing the current weapon's
// aim/readiness state (sweep angle, spread, or reload) — separate from the
// numeric HUD text, which stays as a precise readout in the corner.
export const WEAPON_METER = {
  offsetY: 22,
  barWidth: 44,
  barHeight: 6,
  arcRadius: 30,
};

// A persistent sidebar in the dead-ground margin to the road's right (the
// only mostly-empty stretch of the canvas) listing all three weapons, their
// select key, and current ammo, with the equipped one highlighted — added
// so the weapon roster and how to switch is visible at a glance rather than
// only discoverable via the 1/2/3 keys and the single-line HUD text.
export const WEAPON_SIDEBAR = {
  x: 406,
  yStart: 220,
  rowHeight: 64,
  swatchSize: 14,
};

export const SIDE_GUN_SWEEP = {
  periodMs: 1400,
  maxAngleDeg: 40,
  handlingJitterDegPerSecond: 70,
};

export const TURRET_STABILITY = {
  baseSpreadDeg: 2,
  turningSpreadDeg: 14,
  offroadSpreadDeg: 10,
  smoothing: 0.15,
};

// Beyond each weapon's own per-mechanic instability (turret's steering/
// off-road/drift spread, side guns' steering-triggered sweep jitter), all
// three guns get shakier together at higher speed and on rough/broken road
// — the car itself bouncing the driver/turret around, not a per-weapon
// cause, so it's shared across rocket/side-guns/turret rather than
// duplicated per weapon.
export const WEAPON_INSTABILITY = {
  speedSpreadDeg: 10,
  roughTerrainSpreadDeg: 16,
  smoothing: 0.15,
};

export const PICKUPS = {
  dropChanceOnKill: 0.35,
  healthRestore: 30,
  ammoRestore: { rocket: 2, sideguns: 10, turret: 200 } as Record<WeaponId, number>,
  scoreMultiplier: 2,
  scoreMultiplierDurationMs: 8000,
  speedBoostAmount: 160,
  speedBoostDurationMs: 5000,
};

// Ramming an enemy no longer costs the player health directly — it knocks
// the player's speed around, scaled by the actual relative closing speed of
// the impact (how fast the gap was closing when they hit), not a flat
// per-archetype number. A chaser catching up at speed jolts you harder than
// a heavy you barely clipped while pulling away from it.
//
// The same impact magnitude now also damages the *enemy*, through its
// regular health pool (ramDamageFactor) rather than destroying it outright
// on any contact — a hard, fast ram can still kill a weak car in one hit,
// but a glancing one just dents it. ramCooldownMs guards against the same
// enemy taking repeated ram damage across consecutive frames of overlap
// before physics has had a chance to separate the two cars.
//
// recoilSpeed drives that separation directly: for ramCooldownMs after a
// hit, the enemy ignores its normal AI and instead moves away from the
// player at this speed. Without it, an enemy that survives a ram (chasing
// the player faster than the player can move) just gets driven straight
// back into contact the very next frame, fighting the physics collider's
// separation every step — which is what made the bounce-apart feel
// inconsistent (sometimes the cars visibly separated, sometimes they didn't)
// rather than reliable.
export const COLLISION_SHUNT = {
  speedFactor: 0.4,
  minShunt: 30,
  ramDamageFactor: 0.08,
  ramCooldownMs: 500,
  recoilSpeed: 160,
};

// With enemy and player top speeds roughly at parity (see ENEMY_SPAWN
// above), a discrete combat hit — not off-road drain, not the ram shunt,
// just landing a weapon shot or ram damage — also temporarily caps the
// victim's top speed. This is what actually creates separation in a chase:
// land a hit and the gap opens because *they* slowed, not because of a
// built-in speed edge; get hit yourself and the gap closes the same way.
export const DAMAGE_SLOW = {
  durationMs: 900,
  // One-time multiply applied to the player's *current* speed at the
  // instant of a hit (enemies don't have an equivalent persistent speed
  // value to multiply — their own approach speed is recomputed fresh every
  // frame, so maxSpeedFactor alone is enough for them).
  speedMultiplier: 0.6,
  maxSpeedFactor: 0.7,
};

// Terrain hazards are zones the player drives over/through, not one-shot
// obstacles — no health cost, no despawn-on-contact. "rough" is broken
// road/rough ground (extra drag while inside it, see ROUGH_TERRAIN below);
// "oil" is a slick (temporarily impairs steering, see OIL_SLICK below).
export const HAZARDS = {
  spawnIntervalInitial: 4200,
  spawnIntervalMin: 1800,
  spawnIntervalScoreFactor: 3,
  spawnMargin: 24,
  patchWidth: 110,
  patchHeight: 150,
};

export const ROUGH_TERRAIN = {
  dragPerSecond: 220,
  // Enemies don't have an accel/drag model like the player — instead their
  // own approach speed is simply scaled down while overlapping a patch, the
  // same "slows you down" outcome via a cheaper mechanism.
  enemySpeedMultiplier: 0.55,
};

// A drift *bias* (a single random value in [-1, 1]) is rolled once per
// activation — when the timer goes from inactive to active, not re-rolled
// every frame — and held for the whole effect, rather than re-randomized
// every frame. A fresh random value every single frame averages out to a
// vibration in place (an early version of this did exactly that, and
// playtesting found it didn't read as "slippery" at all); holding one
// random direction for the whole activation reads as the car actually
// sliding/being pushed one way for a bit, the way losing traction feels.
export const OIL_SLICK = {
  // How long the slip effect lingers after leaving the patch; re-armed to
  // this same value every frame still inside one, so crossing a wide patch
  // doesn't shorten the post-exit effect.
  effectDurationMs: 1400,
  controlMultiplier: 0.3,
  driftStrength: 200,
  // Enemies don't steer via turnSpeed like the player — instead the same
  // drift-bias kick is added directly to their velocity for the duration,
  // for the same "harder to control" read.
  enemyDriftStrength: 140,
};

// Small graphical health bars drawn above the player and every active
// enemy (see GameScene.drawHealthBars) — a glanceable supplement to the
// numeric HUD health readout, same idea as WEAPON_METER for weapons.
export const HEALTH_BAR = {
  width: 28,
  height: 4,
  offsetY: 8,
};

// Standalone ammo/health pickups that spawn on a timer, independent of
// enemy kills (see PICKUPS for the kill-drop chance) — a trickle of supply
// so a run isn't entirely dependent on landing kills, but infrequent enough
// to stay a minor bonus rather than a reliable refill loop.
export const CRATE_SPAWN = {
  intervalMs: 16000,
  intervalJitterMs: 6000,
};

// Loaded fx/hazard art comes from packs with brighter house palettes than this
// game's wasteland look (see CLAUDE.md's Assets section) — these tints pull
// them into a consistent grimmer range via Phaser's multiply-tint rather than
// re-editing the source files.
export const VISUAL_TINTS = {
  explosion: 0xffaa33,
  enemyBullet: 0xff3333,
  boostPickup: 0xffd166,
  healthPickup: 0x55ff77,
  ammoPickup: 0x99aabb,
};

// Procedurally drawn in BootScene (see ROAD_COLORS for the same pattern) —
// rough/cracked road colors and a dark glossy oil-slick color.
export const TERRAIN_COLORS = {
  roughBase: 0x3a3528,
  roughSpeckle: 0x26221a,
  oilBase: 0x14121c,
  oilSheen: 0x35324a,
};

export const ROAD_COLORS = {
  ground: 0x4a4636,
  road: 0x232323,
  edge: 0xc9c4b0,
  divider: 0xb8a96a,
};
