import { test, expect, type Page } from '@playwright/test';

const DEFAULT_SEED = 1234;

async function startGame(page: Page, seed: number = DEFAULT_SEED) {
  await page.addInitScript(() => {
    (window as any).__E2E_TEST__ = true;
  });
  await page.goto(`/?e2e=1&seed=${seed}`);
  await page.waitForSelector('#app canvas', { timeout: 20000 });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !!(window as any).__GAME_STATE__, null, { timeout: 20000 });
}

async function getState(page: Page) {
  return await page.evaluate(() => (window as any).__GAME_STATE__);
}

test.beforeEach(async ({ page }) => {
  await startGame(page);
});

test('player accelerates and moves forward', async ({ page }) => {
  const getPlayerSpeed = async () => await page.evaluate(() => (window as any).__GAME_STATE__?.player?.speed ?? null);

  const before = await getPlayerSpeed();
  expect(before).toBeDefined();

  await page.keyboard.down('w');
  await page.waitForTimeout(800);
  await page.keyboard.up('w');

  const after = await getPlayerSpeed();
  expect(after).toBeGreaterThan(before);
});

test('track loads and lap HUD present', async ({ page }) => {
  await page.waitForFunction(() => !!(window as any).__GAME_STATE__ && typeof (window as any).__GAME_STATE__.player?.laps === 'number', null, { timeout: 20000 });
  const laps = await page.evaluate(() => (window as any).__GAME_STATE__.player.laps);
  expect(typeof laps).toBe('number');
});

// Regression test for a real bug: s=0 and s=totalLength are the same point
// on the closed loop, and nearestPoint's tie-break between the two segments
// meeting there could resolve to either — without continuity (see
// nearestPoint's hintS in track.ts), a car sitting at the start line could
// register a phantom completed lap from the representation flip alone,
// with zero real movement. This caught "Lap 2/3" showing at race start
// during manual playtesting before the fix.
test('does not register a phantom lap at race start', async ({ page }) => {
  // No driving at all — just let a few frames of idle physics run.
  await page.waitForTimeout(300);
  const state = await getState(page);
  expect(state.player.laps).toBe(0);
  expect(state.raceDebug).toContain('Lap 1/');
});

test('exactly 5 rivals spawn, all racing the same loop', async ({ page }) => {
  const state = await getState(page);
  expect(state.rivals.length).toBe(5);
  expect(state.rivalsTotal).toBe(5);
  // Every rival should start with full-ish health and at lap 0.
  for (const rival of state.rivals) {
    expect(rival.health).toBeGreaterThan(0);
    expect(rival.laps).toBe(0);
  }
});

test('hazards are placed around the track (rough, oil, and small obstacles)', async ({ page }) => {
  const state = await getState(page);
  expect(state.hazards.rough).toBeGreaterThan(0);
  expect(state.hazards.oil).toBeGreaterThan(0);
  expect(state.hazards.obstacle).toBeGreaterThan(0);
});

test('live race position is always within 1..rivalsTotal+1', async ({ page }) => {
  const state = await getState(page);
  expect(state.player.position).toBeGreaterThanOrEqual(1);
  expect(state.player.position).toBeLessThanOrEqual(state.rivalsTotal + 1);
});

test('switching weapons updates the equipped weapon', async ({ page }) => {
  expect((await getState(page)).player.weapon).toBe('rocket');

  await page.keyboard.press('2');
  await page.waitForTimeout(100);
  expect((await getState(page)).player.weapon).toBe('sideguns');

  await page.keyboard.press('3');
  await page.waitForTimeout(100);
  expect((await getState(page)).player.weapon).toBe('turret');
});

test('firing the rocket consumes ammo', async ({ page }) => {
  const before = (await getState(page)).player.ammo;
  expect(before).toBeGreaterThan(0);

  await page.keyboard.down('Space');
  await page.waitForTimeout(150);
  await page.keyboard.up('Space');

  const after = (await getState(page)).player.ammo;
  expect(after).toBe(before - 1);
});

test('a given seed reproduces the same track and rival start layout', async ({ browser }) => {
  const seed = 4242;
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await startGame(pageA, seed);
  const stateA = await getState(pageA);
  await contextA.close();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await startGame(pageB, seed);
  const stateB = await getState(pageB);
  await contextB.close();

  // A handful of frames of real-clock-driven physics happen between the two
  // separate page loads reaching their "ready" signal (not input-driven —
  // there's no determinism issue here, just two independent processes not
  // ticking in lockstep), and rivals are actively AI-driven at ~500-600px/s
  // the whole time, unlike the idle player — so compare with a tolerance
  // wide enough to absorb a few frames' worth of travel, not exact equality.
  const closeEnough = (a: number, b: number, tolerance: number) => Math.abs(a - b) < tolerance;
  expect(closeEnough(stateA.player.x, stateB.player.x, 15)).toBe(true);
  expect(closeEnough(stateA.player.y, stateB.player.y, 15)).toBe(true);
  for (let i = 0; i < stateA.rivals.length; i++) {
    expect(closeEnough(stateA.rivals[i].x, stateB.rivals[i].x, 80)).toBe(true);
    expect(closeEnough(stateA.rivals[i].y, stateB.rivals[i].y, 80)).toBe(true);
  }
  // Hazard placement has no per-frame movement to introduce drift, so this
  // one *should* match exactly for the same seed.
  expect(stateA.hazards).toEqual(stateB.hazards);
});

// Regression test for a real bug: GameScene.update() returns immediately
// once gameOver/won is set (see the comment there), and that early return
// sat *above* the call that refreshes __GAME_STATE__ — so the very last
// snapshot taken before death stuck around forever, always reporting
// `gameOver: false` even though the run had actually ended. A test (or a
// player) polling for "did the run end" would hang/false-negative forever.
test('gameOver becomes observable in game state once the player is destroyed', async ({ page }) => {
  // Repeatedly ramming straight into a wall is a reliable way to end the
  // run without depending on rival AI/projectiles.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.down('w');
    await page.keyboard.down('a');
    await page.waitForTimeout(200);
    await page.keyboard.up('a');
    await page.keyboard.up('w');
    const state = await getState(page);
    if (state.gameOver) break;
  }
  const state = await getState(page);
  expect(state.gameOver).toBe(true);
  expect(state.player.health).toBe(0);
});

test('a different seed produces a different track layout', async ({ browser }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await startGame(pageA, 1111);
  const stateA = await getState(pageA);
  await contextA.close();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await startGame(pageB, 2222);
  const stateB = await getState(pageB);
  await contextB.close();

  const dx = Math.abs(stateA.player.x - stateB.player.x);
  const dy = Math.abs(stateA.player.y - stateB.player.y);
  expect(dx > 5 || dy > 5).toBe(true);
});
