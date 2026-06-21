import { RUBBER_BAND, TRACK, LAP_HEALTH_BONUS } from "../config";
import { Track, nearestPoint } from "../entities/track";
import { EnemyCar } from "../entities/EnemyCar";
import { PlayerCar } from "../entities/PlayerCar";

// One persistent rival: its EnemyCar plus the race-progress bookkeeping
// needed to compute lap counts and live position (see updateRival/
// computeRacePosition) — the always-active 2D equivalent of the old
// RivalSlot's gapPx tracking, which only existed to simulate an off-screen
// rival's position; with just 5 cars on a finite loop, every rival can just
// stay a real positioned car for the whole race.
//
// `lastS` is a *continuously unwrapped* arc-length position, not normalized
// into [0, totalLength) — each frame's nearestPoint call is hinted with the
// previous frame's lastS (see track.ts's nearestPoint), so it drifts
// smoothly even right at the start/finish seam instead of ever jumping by a
// full lap from a representation flip. `startS` is the unhinted baseline
// captured once at spawn; laps is always (lastS - startS) / totalLength,
// so it's correct regardless of which seam representation that baseline
// happened to land on.
export interface RivalState {
  car: EnemyCar;
  startS: number;
  lastS: number;
  rubberBandTimer: number;
  // The multiplier currently in effect while rubberBandTimer > 0 — either
  // RUBBER_BAND.aheadSpeedMultiplier (this rival pulled ahead, slow down)
  // or .behindSpeedMultiplier (fell behind, catch up). Stored rather than
  // re-derived each frame since the timer alone doesn't say which
  // direction triggered it.
  rubberBandMultiplier: number;
  // Lap count as of the last applyLapHealthBonuses call — compared against
  // the freshly computed lap count each frame so the health top-up fires
  // once on the frame a lap actually rolls over, not every frame for the
  // rest of the lap.
  lastLap: number;
}

// Owns lap counting, live race position, and rubber-banding for the player
// and every rival — the bookkeeping GameScene used to keep directly on
// playerStartS/playerLastS/rivals fields.
export class RaceTracker {
  private rivals: RivalState[] = [];
  private playerStartS = 0;
  private playerLastS = 0;
  private lastPlayerLap = 0;

  constructor(private track: Track, private rng: () => number = Math.random) {}

  // The unhinted baseline for lap counting (see RivalState above for why a
  // separate baseline matters — laps is always relative to wherever this
  // lands, not to an assumed 0).
  initializePlayer(x: number, y: number): void {
    this.playerStartS = nearestPoint(this.track, x, y).s;
    this.playerLastS = this.playerStartS;
    this.lastPlayerLap = 0;
  }

  addRival(car: EnemyCar, x: number, y: number): void {
    const startS = nearestPoint(this.track, x, y).s;
    this.rivals.push({ car, startS, lastS: startS, rubberBandTimer: 0, rubberBandMultiplier: 1, lastLap: 0 });
  }

  getRivals(): RivalState[] {
    return this.rivals;
  }

  getActiveRivals(): RivalState[] {
    return this.rivals.filter((r) => r.car.active);
  }

  getPlayerLastS(): number {
    return this.playerLastS;
  }

  updatePlayerS(s: number): void {
    this.playerLastS = s;
  }

  private get playerProgress(): number {
    return this.playerLastS - this.playerStartS;
  }

  // laps is always relative to wherever the player's own spawn-time
  // baseline landed on the seam's two equally-valid representations, not to
  // an assumed 0 — see RivalState's comment for why.
  playerLaps(): number {
    return Math.floor(this.playerProgress / this.track.totalLength);
  }

  hasPlayerFinished(): boolean {
    return this.playerLaps() >= TRACK.lapsToWin;
  }

  // Tops up the player's and every rival's health by LAP_HEALTH_BONUS the
  // frame their own lap count rolls over — call once per frame, after
  // updatePlayerS/updateRival have already moved lastS for this frame.
  // Heals are clamped to each car's own max (PlayerCar.heal/EnemyCar.heal),
  // so this is a survival reward, not a way to bank health above full.
  applyLapHealthBonuses(player: PlayerCar): void {
    const currentPlayerLap = this.playerLaps();
    if (currentPlayerLap > this.lastPlayerLap) {
      player.heal(LAP_HEALTH_BONUS);
      this.lastPlayerLap = currentPlayerLap;
    }

    for (const rival of this.rivals) {
      if (!rival.car.active) continue;
      const currentLap = Math.floor((rival.lastS - rival.startS) / this.track.totalLength);
      if (currentLap > rival.lastLap) {
        rival.car.heal(LAP_HEALTH_BONUS);
        rival.lastLap = currentLap;
      }
    }
  }

  // Updates one rival's tracked position and rubber-band state for this
  // frame, returning the speed multiplier currently in effect (1 if none).
  // `s` is this rival's just-computed (hinted) track position for the
  // frame — same nearestPoint result GameScene already needed for wall
  // clamping, passed in rather than recomputed here.
  updateRival(rival: RivalState, s: number, delta: number): number {
    rival.lastS = s;
    const rivalProgress = rival.lastS - rival.startS;
    const lead = rivalProgress - this.playerProgress;
    const dtSeconds = delta / 1000;

    if (rival.rubberBandTimer > 0) {
      rival.rubberBandTimer = Math.max(0, rival.rubberBandTimer - delta);
    } else if (this.rng() < RUBBER_BAND.activationChancePerSecond * dtSeconds) {
      if (lead > RUBBER_BAND.minLeadPx) {
        rival.rubberBandTimer = RUBBER_BAND.durationMs;
        rival.rubberBandMultiplier = RUBBER_BAND.aheadSpeedMultiplier;
      } else if (lead < -RUBBER_BAND.minDeficitPx) {
        rival.rubberBandTimer = RUBBER_BAND.durationMs;
        rival.rubberBandMultiplier = RUBBER_BAND.behindSpeedMultiplier;
      }
    }
    return rival.rubberBandTimer > 0 ? rival.rubberBandMultiplier : 1;
  }

  // Sorted purely among currently-active cars (player + surviving rivals)
  // by total race progress (laps × track length + arc-length position) — a
  // destroyed rival simply drops out of the count.
  computeRacePosition(): { position: number; total: number } {
    const rivalProgresses = this.getActiveRivals().map((r) => r.lastS - r.startS);
    const ahead = rivalProgresses.filter((p) => p > this.playerProgress).length;
    return { position: ahead + 1, total: rivalProgresses.length + 1 };
  }
}
