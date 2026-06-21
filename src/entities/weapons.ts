import {
  WeaponId,
  WEAPONS,
  SIDE_GUN_SWEEP,
  SIDE_GUN_MOUNTS,
  TURRET_STABILITY,
  WEAPON_INSTABILITY,
  DRIFT,
} from "../config";

export interface WeaponState {
  ammo: number;
  cooldownRemaining: number;
  sweepAngleDeg: number;
  turretSpreadDeg: number;
}

export interface WeaponUpdateParams {
  steering: boolean;
  offRoad: boolean;
  drifting: boolean;
  // Beyond steering/off-road/drift (each weapon's own pre-existing
  // instability triggers), all three guns also get shakier together at
  // speed and on rough terrain — see WEAPON_INSTABILITY in config.ts.
  // Optional so existing callers/tests that don't care can omit them.
  speedFraction?: number;
  onRoughTerrain?: boolean;
}

export interface FireResult {
  weapon: WeaponId;
  angleDeg: number;
  damage: number;
  projectileSpeed: number;
}

// Side-gun mount geometry — shared by GameScene's projectile spawn point and
// HudSystem's in-world aim meter, which both need the exact same mount
// position/angle so the meter accurately previews where a shot will appear.
export function sideGunAngleDeg(side: -1 | 1, sweepAngleDeg: number): number {
  return side < 0 ? -SIDE_GUN_MOUNTS.centerAngleDeg + sweepAngleDeg : SIDE_GUN_MOUNTS.centerAngleDeg - sweepAngleDeg;
}

export function sideGunMountPosition(
  x: number,
  y: number,
  headingDeg: number,
  displayWidth: number,
  side: -1 | 1
): { x: number; y: number } {
  const headingRad = (headingDeg * Math.PI) / 180;
  const offset = side * (displayWidth / 2 + SIDE_GUN_MOUNTS.extraOffsetPx);
  return { x: x + offset * Math.cos(headingRad), y: y + offset * Math.sin(headingRad) };
}

const WEAPON_IDS: WeaponId[] = ["rocket", "sideguns", "turret"];

export class WeaponController {
  private states: Record<WeaponId, WeaponState>;
  private selected: WeaponId = "rocket";
  private sweepDirection = 1;

  constructor() {
    this.states = {
      rocket: { ammo: WEAPONS.rocket.maxAmmo, cooldownRemaining: 0, sweepAngleDeg: 0, turretSpreadDeg: 0 },
      sideguns: { ammo: WEAPONS.sideguns.maxAmmo, cooldownRemaining: 0, sweepAngleDeg: 0, turretSpreadDeg: 0 },
      turret: {
        ammo: WEAPONS.turret.maxAmmo,
        cooldownRemaining: 0,
        sweepAngleDeg: 0,
        turretSpreadDeg: TURRET_STABILITY.baseSpreadDeg,
      },
    };
  }

  get current(): WeaponId {
    return this.selected;
  }

  select(weapon: WeaponId): void {
    this.selected = weapon;
  }

  getState(weapon: WeaponId): WeaponState {
    return this.states[weapon];
  }

  update(deltaMs: number, params: WeaponUpdateParams): void {
    for (const id of WEAPON_IDS) {
      const state = this.states[id];
      state.cooldownRemaining = Math.max(0, state.cooldownRemaining - deltaMs);
    }

    const sharedInstabilityDeg =
      (params.speedFraction ?? 0) * WEAPON_INSTABILITY.speedSpreadDeg +
      (params.onRoughTerrain ? WEAPON_INSTABILITY.roughTerrainSpreadDeg : 0);

    const sg = this.states.sideguns;
    const dtSeconds = deltaMs / 1000;
    const sweepSpeed = (SIDE_GUN_SWEEP.maxAngleDeg * 2) / (SIDE_GUN_SWEEP.periodMs / 1000);
    sg.sweepAngleDeg += this.sweepDirection * sweepSpeed * dtSeconds;
    if (params.steering) {
      sg.sweepAngleDeg += deterministicJitter(sg.sweepAngleDeg) * SIDE_GUN_SWEEP.handlingJitterDegPerSecond * dtSeconds;
    }
    if (sharedInstabilityDeg > 0) {
      sg.sweepAngleDeg += deterministicJitter(sg.sweepAngleDeg + 31.7) * sharedInstabilityDeg * dtSeconds;
    }
    if (sg.sweepAngleDeg >= SIDE_GUN_SWEEP.maxAngleDeg) {
      sg.sweepAngleDeg = SIDE_GUN_SWEEP.maxAngleDeg;
      this.sweepDirection = -1;
    } else if (sg.sweepAngleDeg <= -SIDE_GUN_SWEEP.maxAngleDeg) {
      sg.sweepAngleDeg = -SIDE_GUN_SWEEP.maxAngleDeg;
      this.sweepDirection = 1;
    }

    const turret = this.states.turret;
    let targetSpread = TURRET_STABILITY.baseSpreadDeg + sharedInstabilityDeg;
    if (params.steering) targetSpread += TURRET_STABILITY.turningSpreadDeg;
    if (params.offRoad) targetSpread += TURRET_STABILITY.offroadSpreadDeg;
    if (params.drifting) targetSpread *= DRIFT.weaponInstabilityMultiplier;
    turret.turretSpreadDeg = lerp(turret.turretSpreadDeg, targetSpread, TURRET_STABILITY.smoothing);
  }

  tryFire(weapon: WeaponId, turretAimDeg = 0): FireResult | null {
    const state = this.states[weapon];
    const config = WEAPONS[weapon];
    if (state.ammo <= 0 || state.cooldownRemaining > 0) return null;

    state.ammo -= 1;
    state.cooldownRemaining = config.fireCooldown;

    let angleDeg = 0;
    if (weapon === "sideguns") {
      angleDeg = state.sweepAngleDeg;
    } else if (weapon === "turret") {
      const spreadRoll = (pseudoRandom(state.cooldownRemaining + state.ammo) - 0.5) * 2 * state.turretSpreadDeg;
      angleDeg = turretAimDeg + spreadRoll;
    }
    // rocket — always dead ahead, per gameplay.md ("fires straight ahead
    // along the road"); unlike the other two it has no instability mechanic.

    return { weapon, angleDeg, damage: config.damage, projectileSpeed: config.projectileSpeed };
  }

  addAmmo(weapon: WeaponId, amount: number): void {
    const state = this.states[weapon];
    state.ammo = Math.min(WEAPONS[weapon].maxAmmo, state.ammo + amount);
  }
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function deterministicJitter(seed: number): number {
  return Math.sin(seed * 12.9898) % 1;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
