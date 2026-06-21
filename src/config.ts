// Landscape now rather than the old portrait scroller — a closed-loop track
// that winds and turns sideways (not just up) needs horizontal room, and a
// minimap (added once rivals are back) wants a free corner to live in. This
// is the desktop default — see MOBILE_CANVAS_WIDTH/HEIGHT below for the
// portrait default used on touch devices, and main.ts for where the two get
// picked between.
export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 600;

// Portrait-by-default on mobile: most phones are held vertically, and
// letterboxing the landscape 960x600 canvas into a portrait viewport left
// it tiny with huge black bars top/bottom. A clean inverse of the desktop
// ratio, not an attempt to match any specific device's exact aspect ratio —
// Scale.FIT (see main.ts) letterboxes any mismatch regardless.
//
// main.ts is the only place that calls isMobileMode() to choose between this
// pair and the desktop one above, since config.ts itself has to stay safe to
// import under Vitest's plain-Node test environment (no window/navigator) —
// everywhere else that needs the *actual* active canvas size reads
// `scene.scale.width/height` (always accurate to whichever pair main.ts
// picked) rather than importing a static constant for layout purposes.
export const MOBILE_CANVAS_WIDTH = 600;
export const MOBILE_CANVAS_HEIGHT = 960;

// Paved road width, constant along the whole track (only the rock walls
// beyond its edges meander — see WALLS). Widened from the old 320 now that
// cars have a whole loop to share with rivals and need room to overtake —
// widened further still (360 -> 420) after playtesting the first generated
// loop found the margin for error in a corner too thin.
export const ROAD_WIDTH = 420;

// Procedurally generates one closed-loop spline track per race (see
// entities/track.ts) — control points scattered around a circle, fit with a
// closed Catmull-Rom spline, then resampled at fixed arc-length spacing so
// every consumer (wall rendering, AI lookahead, lap progress) can treat `s`
// as a uniform distance along the loop.
export const TRACK_GEN = {
  controlPoints: 12,
  baseRadius: 1900,
  // Fraction of baseRadius each control point's own radius can deviate by —
  // what actually makes the loop twist/narrow/widen instead of being a
  // perfect circle. Lowered from an initial 0.4 after playtesting found
  // that level of jitter produced local curvature tighter than the car's
  // turn rate could comfortably follow — driving dead straight (no
  // steering at all) went off-road within about a second even on the
  // "easy" parts of the loop.
  radiusJitter: 0.22,
  // Fraction of a control point's own angular segment it can be nudged by.
  // Kept under 1 so consecutive points never reorder, which would make the
  // closed spline self-intersect. Lowered alongside radiusJitter for the
  // same reason — bunched-up control points were producing sharper bends
  // than intended.
  angleJitterFraction: 0.18,
  // Dense Catmull-Rom subdivisions per control-point segment, sampled before
  // the arc-length resampling pass below — not the final centerline itself,
  // since Catmull-Rom's own parameter isn't evenly spaced by distance.
  segmentsPerControlPoint: 24,
  // Spacing, in px, between the final resampled centerline points.
  sampleSpacing: 24,
};

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
  // The whole generated track (road ribbon + rock walls + centerline
  // dashes) is now one static Graphics object drawn once at race start
  // (see GameScene.drawTrack), rather than a separate scrolling road plus a
  // per-frame-redrawn wall layer — so it only needs the one depth.
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
  // Steering now turns the car's heading (deg/sec) rather than setting a
  // lane-drift lateral velocity — sluggish at low speed, sharpest at top
  // speed, same min/max-ramp-by-speed idea as the old lateral model. Raised
  // from an initial 70/170 after playtesting found the car couldn't turn
  // fast enough at speed to comfortably follow the generated loop's curves;
  // lowered back down somewhat (90/230 -> 75/190) after later feedback that
  // steering felt too sensitive/twitchy to control precisely — this applies
  // equally to keyboard and the mobile joystick (both just drive the same
  // left/right booleans into this shared turn rate), unlike the joystick's
  // own deadzone tuning (MOBILE_CONTROLS), which only addresses touch-
  // specific accidental-drift misfires.
  minTurnRateDeg: 75,
  maxTurnRateDeg: 190,
  offroadDrag: 260,
  // How fast the car's actual velocity direction snaps toward its heading
  // each frame while gripping (not drifting) — see DRIFT.slipEase for the
  // much slower equivalent while drifting, which is what makes a drift
  // actually slide rather than just turn sharper.
  velocityGripEase: 0.6,
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
  // How fast the car's actual velocity direction follows its heading while
  // drifting — much slower than PLAYER_HANDLING.velocityGripEase, so the
  // car's momentum keeps carrying it along the old heading for a beat after
  // turning, i.e. an actual slide rather than just a sharper turn.
  slipEase: 0.06,
};

export type EnemyArchetypeId = "chaser" | "shooter" | "heavy" | "bomber";

export interface EnemyArchetypeConfig {
  id: EnemyArchetypeId;
  texture: string;
  tint: number;
  health: number;
  speedMultiplier: number;
  // Relative pick weight when the 5 race rivals are assigned an archetype
  // each at race start (see RIVALS below) — all 4 are available from the
  // start now that rivals are a fixed roster, not a distance-gated unlock.
  weight: number;
  // Own steering authority (deg/sec, same idea as PLAYER_HANDLING's turn
  // rate) — replaces the old lane-drift `lateralSpeed` now that rivals
  // drive a real 2D loop and need to actually turn to follow it, not just
  // shift sideways on a fixed lane.
  maxTurnRateDeg: number;
  // How strongly this archetype steers away from whichever other rival is
  // currently closest (see enemyBehaviors.computeTargetHeading) — replaces
  // the old shared aggressive/passive avoidance weight pair with an
  // explicit per-archetype value, since four distinct archetypes warrant
  // more than a 2-value split. Heavy's near-zero value is what keeps its
  // "doesn't really dodge traffic" identity now that it has *some*
  // steering authority (a literal zero turn rate would crash it into the
  // first bend, unlike the old straight-road model).
  avoidanceWeight: number;
  chasesPlayer: boolean;
  keepsDistance: boolean;
  fireCooldown: number;
  projectileSpeed: number;
  projectileDamage: number;
  scoreValue: number;
}

// No archetype approaches from the road's side margin any more — the
// rocky walls now occupy that space (see WALLS below), so every rival
// closes/falls back along the same ahead/behind axis as the player.
export const ENEMY_ARCHETYPES: Record<EnemyArchetypeId, EnemyArchetypeConfig> = {
  chaser: {
    id: "chaser",
    texture: "car-enemy-1",
    tint: 0xcc6655,
    health: 55,
    speedMultiplier: 1.05,
    weight: 3,
    maxTurnRateDeg: 230,
    avoidanceWeight: 0.25,
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
    health: 75,
    speedMultiplier: 0.85,
    weight: 3,
    maxTurnRateDeg: 200,
    avoidanceWeight: 0.7,
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
    health: 190,
    speedMultiplier: 0.6,
    weight: 2,
    maxTurnRateDeg: 80,
    avoidanceWeight: 0.05,
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
    health: 30,
    speedMultiplier: 1.1,
    weight: 2,
    maxTurnRateDeg: 240,
    avoidanceWeight: 0.2,
    chasesPlayer: true,
    keepsDistance: false,
    fireCooldown: 0,
    projectileSpeed: 0,
    projectileDamage: 0,
    scoreValue: 25,
  },
};

// Exactly 5 persistent rival cars for the whole race, all always active and
// positioned in real 2D world space from the start (no more timed spawn
// pool, and no more on/off-screen activation — with only 5 cars on a finite
// loop there's no need for either). startOffsets place them in a small grid
// just behind the player's own start point: `s` is arc-length offset from
// the player's start (negative = ahead), `lateral` is the signed offset
// from centerline (see track.ts) at that point — a believable grid-start
// look rather than all 5 stacked on the same spot.
export const RIVALS = {
  count: 5,
  // Enemies are meant to be roughly equal to the player in raw speed, not
  // categorically slower or faster — the actual edge in a chase should come
  // from avoiding obstacles and combat (see DAMAGE_SLOW below), not from a
  // hard speed advantage built into config. baseApproachSpeed × the
  // aggressive archetypes' speedMultiplier (chaser 1.05, bomber 1.1) lands
  // close to — bomber just past — the player's own maxForwardSpeed (620),
  // so a flat-out player can usually still out-leg them, but only barely.
  // Raised from an initial 560 after playtesting found rivals felt
  // sluggish/passive even before factoring in archetype multipliers.
  baseApproachSpeed: 600,
  startOffsets: [
    { s: -60, lateral: -100 },
    { s: -60, lateral: 100 },
    { s: -130, lateral: -150 },
    { s: -130, lateral: 0 },
    { s: -130, lateral: 150 },
  ],
};

// Keeps every rival a felt presence for the whole race, in both
// directions — not just "lets a skilled player close a gap" (the old
// ahead-only version): a rival that's pulled clearly ahead occasionally
// slows down, and a rival that's fallen clearly behind occasionally speeds
// up, so a rival's own AI/speed quality doesn't determine whether it stays
// relevant. "Ahead"/"behind" is total race progress (laps × track length +
// arc-length position, the loop-track equivalent of the old screen-relative
// gap). Each rival independently rolls for its own activation, so it reads
// as that car catching a break, not a global rubber band snapping everyone
// to the same gap.
export const RUBBER_BAND = {
  minLeadPx: 250,
  minDeficitPx: 250,
  // Raised from an initial 0.15 (ahead-only) — playtesting found rivals
  // that fell behind (slower archetypes especially) almost never closed
  // the gap again within a typical race, since the old version only ever
  // slowed down a rival that was ahead.
  activationChancePerSecond: 0.4,
  durationMs: 2500,
  aheadSpeedMultiplier: 0.75,
  behindSpeedMultiplier: 1.45,
};

// The race is won by completing a fixed number of laps of the generated
// loop, ranked by finishing order against the 5 rivals — not an endless
// distance chase any more. See RaceTracker.hasPlayerFinished/playerLaps for
// the win condition and GameScene.drawFinishLine for the visual line at the
// s=0 lap boundary this checks against.
export const TRACK = {
  lapsToWin: 3,
};

// A small health top-up for completing a lap — for the player and every
// rival alike (see RaceTracker.playerLaps/RivalState.lastS for how each
// car's own lap count is tracked) — clamped to each car's own max, so it's
// a reward for surviving a lap rather than a way to exceed full health.
export const LAP_HEALTH_BONUS = 15;

// The checkered start/finish line painted across the road at s=0 (see
// GameScene.drawFinishLine) — square-ish blocks alternating dark/light,
// two rows deep so it reads as a checker flag rather than a single stripe.
export const FINISH_LINE = {
  squareSize: 24,
  rows: 2,
  darkColor: 0x111111,
  lightColor: 0xf0f0f0,
};

// Enemy "AI": each rival's target heading blends (a) a lookahead point on
// the track centerline (the baseline "stay on the road" behavior every
// archetype now needs, see enemyBehaviors.computeTargetHeading), (b) a pull
// toward or away from the player depending on archetype, and (c) a push
// away from whichever other rival is currently closest, within
// avoidanceRadius (Euclidean, world space) — weighted per archetype via
// EnemyArchetypeConfig.avoidanceWeight. The car then turns toward that
// blended target at its own maxTurnRateDeg, the same rate-limited-turn
// idea PLAYER_HANDLING uses, which is what gives steering its inertia (a
// turn rate cap, not an exponential smoothing factor).
export const ENEMY_AI = {
  avoidanceRadius: 70,
  // How far ahead along the track (arc-length px) a rival aims its
  // baseline steering target — short enough to hug the centerline through
  // tight bends, long enough not to read as twitchy on straights.
  lookaheadDistPx: 220,
  // How strongly chasesPlayer archetypes blend a direct pull toward the
  // player's actual position into their target heading, scaled down by
  // distance beyond chaseRange so a chaser far from the player mostly just
  // races the track instead of cutting blindly toward a player it can't
  // see around the next bend. Raised from an initial 0.6/260 after
  // playtesting found chasers read as too passive/track-bound, rarely
  // committing to an actual ram attempt.
  chaseWeight: 0.8,
  chaseRange: 380,
  // A keepsDistance archetype (Shooter) steers slightly away from the
  // player when closer than this, instead of holding its line — on top of
  // (not instead of) slowing its approach speed, see EnemyCar.drive.
  shooterPreferredGapPx: 140,
  shooterAvoidWeight: 0.3,
  // canFire() only allows a shot within this distance — without it, a
  // shooter that's fallen far behind/ahead on the track (no line-of-sight
  // logic exists, so nothing else stops it) keeps firing blind, ammo-wasting
  // shots toward a player it has no realistic chance of hitting. Set a bit
  // past chaseRange so a shooter that's just lost ground can still take a
  // shot before the gap closes again.
  shooterFireRangePx: 500,
  // Speed bleeds off ahead of a sharp upcoming bend (the heading difference
  // between a rival's current heading and its own lookahead target) so AI
  // doesn't take corners at a flat-out speed no turn rate could follow —
  // scales linearly from full speed at 0° up to minSpeedFactor at
  // maxAngleDeg and beyond.
  curvatureSlowdown: {
    maxAngleDeg: 70,
    minSpeedFactor: 0.55,
  },
};

export const SCORE_DISTANCE_DIVISOR = 10;

// The world is now much larger than the camera viewport (a full closed-loop
// track, with the camera following the player around it), so projectiles
// can no longer be culled by "off the edge of the canvas" the way the old
// fixed-camera scroller did — a fixed lifetime after firing is the
// generalized equivalent regardless of travel direction. Raised from an
// initial 2000ms — at Shooter's projectileSpeed (480), that capped its
// effective range at ~960px, well under typical gaps once it fell behind
// the player, so its shots were timing out before they could ever land
// (read as "enemies only fire when in front," since that's the only
// situation close enough for a shot to reach).
export const PROJECTILE_LIFETIME_MS = 2800;

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

// In-world meter floating just ahead of the player car (along its current
// heading) showing the current weapon's aim state (sweep angle or spread) —
// rocket has no entry here any more since dead-ahead-only firing has no aim
// state worth showing in-world; its reload progress lives inline with its
// ammo count in WEAPON_SIDEBAR instead (see GameScene.updateWeaponSidebar).
export const WEAPON_METER = {
  offsetY: 22,
  arcRadius: 30,
};

// A persistent sidebar pinned to the bottom-right corner of the screen
// listing all three weapons, their select key, current ammo, and a reload/
// readiness bar (cooldownRemaining / fireCooldown, the same value the old
// in-world rocket meter showed) inline with the ammo count — with the
// equipped weapon's row highlighted. Bottom-right keeps it clear of the
// main camera's followed action in the middle of the screen, now that the
// world scrolls in every direction rather than just vertically past a
// fixed lane.
// Margins, not absolute positions — this sidebar renders on both the
// desktop (landscape) and mobile (portrait) canvas, which are different
// sizes (see MOBILE_CANVAS_WIDTH/HEIGHT above), so it can't bake in either
// one. rightMargin/bottomMargin reproduce the original desktop position
// exactly (960-160=800, 600-200=400) — see sidebarOrigin() below, which
// HudSystem/TouchControls call with the scene's actual live
// scale.width/height to get real on-screen coordinates.
export const WEAPON_SIDEBAR = {
  rightMargin: 160,
  bottomMargin: 200,
  rowHeight: 64,
  swatchSize: 14,
  reloadBarWidth: 40,
  reloadBarHeight: 6,
};

// Resolves WEAPON_SIDEBAR's margins against the actual active canvas size —
// see WEAPON_SIDEBAR's comment for why this can't be a static position.
export function sidebarOrigin(canvasWidth: number, canvasHeight: number): { x: number; yStart: number } {
  return { x: canvasWidth - WEAPON_SIDEBAR.rightMargin, yStart: canvasHeight - WEAPON_SIDEBAR.bottomMargin };
}

// Shared by HudSystem's per-frame selected-row highlight and TouchControls'
// tap-to-switch hit-testing — one source of truth for the row rect so a tap
// always lands exactly where the highlight is drawn. Takes the sidebar's
// already-resolved origin (see sidebarOrigin) rather than reading
// WEAPON_SIDEBAR.x/yStart directly, since those no longer exist as absolute
// positions.
export function weaponSidebarRowRect(index: number, originX: number, originYStart: number): { x: number; y: number; width: number; height: number } {
  return {
    x: originX - 6,
    y: originYStart + index * WEAPON_SIDEBAR.rowHeight - 6,
    width: WEAPON_SIDEBAR.reloadBarWidth + 56,
    height: WEAPON_SIDEBAR.rowHeight - 10,
  };
}

// Fixed-position virtual joystick (bottom-left) and fire button (bottom-
// center-right, clear of both the joystick and the weapon sidebar) shown
// only when isMobileMode() — see utils/device.ts and
// systems/TouchControls.ts. Positions here are plain numbers (not derived
// from a canvas-size variable) because this whole block only ever renders
// against the one fixed mobile canvas size, MOBILE_CANVAS_WIDTH/HEIGHT
// (600x960) — unlike WEAPON_SIDEBAR above, which has to work on both the
// desktop and mobile canvas and so can't bake in either one.
export const MOBILE_CONTROLS = {
  joystickBaseX: 110,
  joystickBaseY: MOBILE_CANVAS_HEIGHT - 110,
  // Smaller travel radius than the original 60 — playtesting feedback was
  // that the full range made steering imprecise (a small thumb drift
  // sideways covered a lot of relative distance). A tighter zone needs less
  // thumb travel to reach its extremes, which alone would make every axis
  // *more* sensitive (same deadzone fraction over a shorter absolute
  // distance) — countered below by raising joystickDeadzoneX specifically.
  joystickRadius: 48,
  joystickThumbRadius: 24,
  // Deadzones are a fraction of joystickRadius, split per axis rather than
  // one shared value — steering (X) needs a deliberately larger push than
  // accelerate/brake (Y) to register, so small left/right wobble while
  // pushing straight up doesn't read as an unintended turn. Absolute pixel
  // thresholds: X = 48*0.55 = 26.4px (vs. the old single 60*0.35 = 21px),
  // Y = 48*0.3 = 14.4px (more responsive than before).
  joystickDeadzoneX: 0.55,
  joystickDeadzoneY: 0.3,
  // Bottom-center-right rather than bottom-right — on the narrower portrait
  // canvas, the true bottom-right corner is the weapon sidebar's footprint
  // (sidebarOrigin(600, 960) lands it around x:434-530), so the fire button
  // sits just to the left of that instead, at the same height as the
  // joystick for a comfortable symmetric two-thumb hold.
  fireButtonX: 300,
  fireButtonY: MOBILE_CANVAS_HEIGHT - 110,
  fireButtonRadius: 48,
  baseAlpha: 0.3,
  activeAlpha: 0.55,
};

// Camera follow zoom + look-ahead, applied on both desktop and mobile (see
// GameScene.create()/update()) — zooming out and biasing the view toward
// wherever the player is currently heading gives more time to react to an
// upcoming bend than a plain centered follow. Mobile gets an extra zoom-out
// on top of the shared baseline, since its smaller/touch-occluded screen
// needs more margin to read the road in time.
export const CAMERA = {
  zoom: 0.92,
  mobileZoom: 0.78,
  lookAheadMaxPx: 90,
  // Smoothing factor (0-1, higher = snappier) applied each frame toward the
  // target look-ahead offset, the same lerp-toward-target idea as the
  // camera's own follow damping, so the offset eases rather than snaps as
  // speed/heading change.
  lookAheadLerp: 0.08,
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
// speedFactor/minShunt raised and ramDamageFactor lowered from an initial
// 0.4/30/0.08 — playtesting feedback was that a ram read more like a number
// changing than a physical hit; trading a bit of ram damage for a bigger,
// more reliable speed jolt is what actually sells the impact.
export const COLLISION_SHUNT = {
  speedFactor: 0.55,
  minShunt: 45,
  ramDamageFactor: 0.06,
  ramCooldownMs: 500,
  recoilSpeed: 160,
};

// With enemy and player top speeds roughly at parity (see RIVALS above), a
// discrete combat hit — not off-road drain, not the ram shunt,
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

// Terrain hazards are zones the player (and rivals) drive over/through, not
// one-shot obstacles — no health cost, no despawn-on-contact. "rough" is
// broken road/rough ground (extra drag while inside it, see ROUGH_TERRAIN
// below); "oil" is a slick (temporarily impairs steering, see OIL_SLICK
// below). The track is generated once and fixed for the whole race now, so
// hazards are placed once around the loop at race start (see
// GameScene.spawnHazards) rather than spawned continuously down a
// scrolling road — these counts are per-race totals, not a spawn rate.
export const HAZARDS = {
  roughCount: 10,
  oilCount: 8,
  patchWidth: 110,
  patchHeight: 150,
  // Minimum arc-length gap between any two placements (including the
  // start/finish line itself) so patches don't cluster unreadably and the
  // player never spawns directly on top of one.
  minSpacingPx: 220,
  startClearancePx: 320,
  // Placed within the paved width, margin in from each edge so a patch is
  // never flush against the rock wall.
  lateralMargin: 30,
};

// A small discrete rock/debris pile — unlike rough/oil's continuous
// "you're standing on it" effect, this is a one-time bump: a flat
// damage+speed hit on first contact, then it's gone (despawned), the same
// "physical obstacle you clip" read the old debris/barrier model had before
// the rough-terrain/oil-slick rework, now as a third hazard type alongside
// (not instead of) the continuous patches.
// Bigger (size 30->44) and a harder one-time speed cut, trading some of the
// old flat damage for it (12->8, 0.5->0.32 speedPenaltyFactor) — playtesting
// found the old small rock barely registered as a real obstacle.
export const OBSTACLES = {
  count: 6,
  size: 44,
  damage: 8,
  // One-time multiply applied to current speed on contact (player) or to
  // that frame's ownSpeed (enemy) — a hard bump should cost real speed, not
  // just a glancing scrape.
  speedPenaltyFactor: 0.32,
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
  // Degrees the player's velocity direction is biased away from heading
  // while oil-slicked (was a raw px/sec lateral push under the old
  // lane-drift model — now expressed as an angle since velocity direction
  // is heading-relative, see playerPhysics.ts).
  driftStrengthDeg: 45,
  // Enemies get the same reduced-steering-authority treatment (their own
  // turn rate × controlMultiplier) plus a degree-based veer added on top of
  // their normal turn-toward-target heading, the 2D equivalent of the old
  // px/sec lateral kick now that heading is the thing being perturbed.
  enemyDriftStrengthDeg: 35,
};

// Rocky canyon walls flank the road just off its paved edges, at a distance
// that meanders over the course of the race (see track.ts's wallBoundsAt) —
// a hard boundary any car (player or rival) can be pushed into, not just
// open shoulder. Contact applies extra drag for as long as it lasts (like
// off-road driving but harsher), and the outward component of lateral
// movement is clamped so a car can't drive/get shoved straight through the
// rock — but health damage is a one-time hit on the frame contact begins
// (see PlayerCar.drive/EnemyCar.drive and wallImpactDamage below), scaled by
// how fast the car was going at that instant. Scraping along a wall while
// steering back onto the road doesn't keep costing health the way the old
// per-second drain did; only the initial impact does.
export const WALLS = {
  minOffset: 40,
  maxOffset: 110,
  // Wavelength of the canyon's meander, in arc-length px along the track
  // centerline (see track.ts) — left/right use different frequency+phase so
  // the canyon narrows/widens asymmetrically rather than both walls
  // mirroring each other.
  meanderFreqLeft: 1 / 900,
  meanderFreqRight: 1 / 700,
  rightPhaseOffset: 2.1,
  dragPerSecondPlayer: 280,
  // Below this speed, clipping the wall is just a slow nudge — no damage,
  // same idea as a real car grazing a barrier at a crawl vs. into it at speed.
  minImpactSpeed: 150,
  // Damage dealt for an impact at or above each car's own max speed; scales
  // linearly down to 0 at minImpactSpeed (see wallImpactDamage). Lowered
  // again (22->16, 35->26) alongside adding impactSpeedPenaltyFactor below —
  // a wall clip now costs more speed and a bit less health than before.
  maxImpactDamagePlayer: 16,
  maxImpactDamageEnemy: 26,
  // One-time multiply applied to current/own speed on the same rising edge
  // as the one-time damage above (see PlayerCar.drive/EnemyCar.drive) — on
  // top of (not instead of) the continuous scraping drag, since a real
  // impact happens in the instant of contact, not over the following second
  // of sliding along it.
  impactSpeedPenaltyFactor: 0.65,
  enemySpeedMultiplier: 0.4,
  // Clearly darker/more saturated than ROAD_COLORS.ground (0x4a4636) — an
  // earlier pass used a much closer tone (0x554a3c) that was technically
  // rendering correctly but unreadable at a glance against the ground;
  // playtesting (a screenshot pixel-sample, not just eyeballing) caught it.
  rockColor: 0x2e2418,
  rockSpeckleColor: 0x9c8a65,
};

// One-time wall-impact damage, linear in speed from 0 at minImpactSpeed up
// to maxDamage at maxSpeed (clamped at both ends) — shared by
// PlayerCar.drive and EnemyCar.drive so a player clip and a rival clip are
// judged by the same rule, just against each side's own max speed and own
// damage cap.
export function wallImpactDamage(speed: number, maxDamage: number, maxSpeed: number): number {
  const { minImpactSpeed } = WALLS;
  if (speed <= minImpactSpeed) return 0;
  const t = Math.min(1, (speed - minImpactSpeed) / (maxSpeed - minImpactSpeed));
  return maxDamage * t;
}

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

// Random interval until the next standalone crate spawn, jittered evenly
// around CRATE_SPAWN.intervalMs so crates don't land on an exact, learnable
// metronome — shared by PickupSystem's initial timer and every re-arm after
// a spawn.
export function nextCrateIntervalMs(rng: () => number = Math.random): number {
  return CRATE_SPAWN.intervalMs + (rng() * 2 - 1) * CRATE_SPAWN.intervalJitterMs;
}

// Loaded fx/hazard art comes from packs with brighter house palettes than this
// game's wasteland look (see CLAUDE.md's Assets section) — these tints pull
// them into a consistent grimmer range via Phaser's multiply-tint rather than
// re-editing the source files.
export const VISUAL_TINTS = {
  explosion: 0xffaa33,
  enemyBullet: 0xff3333,
  boostPickup: 0xffd166,
  healthPickup: 0x55ff77,
  // Brighter cyan than the old muted grayish-blue, and rendered with the
  // same additive blend as the other pickup types (see PickupSystem) — the
  // old NORMAL-blend gray tint was the only pickup that didn't glow, making
  // it the easiest of the three to miss against the road/ground colors.
  ammoPickup: 0x66ddff,
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
