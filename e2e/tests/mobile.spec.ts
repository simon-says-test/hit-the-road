import { test, expect, type Page } from '@playwright/test';

// Touch controls only render/respond when isMobileMode() is true (see
// src/utils/device.ts) and need real multi-touch (two simultaneous fingers)
// for the joystick-held-while-aiming-turret case — neither is the default
// "Desktop Chrome" project core.spec.ts runs under, so this file overrides
// both per-file. A 600x960 viewport matches MOBILE_CANVAS_WIDTH/HEIGHT
// exactly (mobile defaults to portrait — see config.ts), so Scale.FIT
// applies no letterboxing and game-logical coordinates (e.g.
// MOBILE_CONTROLS.joystickBaseX/Y) are usable directly as page coordinates
// — no scale/offset math needed in the tests below.
test.use({ viewport: { width: 600, height: 960 }, hasTouch: true });

const DEFAULT_SEED = 1234;

async function startMobileGame(page: Page, seed: number = DEFAULT_SEED) {
  await page.addInitScript(() => {
    (window as any).__E2E_TEST__ = true;
  });
  await page.goto(`/?e2e=1&mobile=1&seed=${seed}`);
  await page.waitForSelector('#app canvas', { timeout: 20000 });
  // IntroScene dismisses on pointerdown same as Space — use a touch tap
  // (not keyboard) so this also exercises the intro screen's touch path.
  // Center of the 600x960 canvas — clear of every UI zone below.
  await touchTap(page, 300, 480);
  await page.waitForFunction(() => !!(window as any).__GAME_STATE__, null, { timeout: 20000 });
}

async function getState(page: Page) {
  return await page.evaluate(() => (window as any).__GAME_STATE__);
}

// Tracks every currently-down finger (by id) across calls so each dispatched
// TouchEvent gets a correct `touches`/`targetTouches` (everyone currently
// down) vs `changedTouches` (only the ones this call is updating) split —
// see docs/troubleshooting.md's "Simulating multi-touch in Playwright" for
// why getting this wrong (and why pageX/pageY can't be omitted) silently
// produces a dead-on-arrival synthetic event rather than an obvious failure.
async function touchSequence(page: Page, active: Map<number, { id: number; x: number; y: number }>, phase: string, touches: { id: number; x: number; y: number }[]) {
  for (const t of touches) {
    if (phase === 'touchend' || phase === 'touchcancel') active.delete(t.id);
    else active.set(t.id, t);
  }
  await page.evaluate(
    ({ phase, touches, active }) => {
      const canvas = document.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      const toTouch = (t: { id: number; x: number; y: number }) =>
        new Touch({
          identifier: t.id,
          target: canvas,
          clientX: rect.left + t.x,
          clientY: rect.top + t.y,
          pageX: rect.left + t.x + window.scrollX,
          pageY: rect.top + t.y + window.scrollY,
          screenX: rect.left + t.x,
          screenY: rect.top + t.y,
        });
      const changedTouches = touches.map(toTouch);
      const allTouches = active.map(toTouch);
      const event = new TouchEvent(phase, { touches: allTouches, targetTouches: allTouches, changedTouches, bubbles: true, cancelable: true });
      canvas.dispatchEvent(event);
    },
    { phase, touches, active: [...active.values()] }
  );
}

async function touchTap(page: Page, x: number, y: number) {
  const active = new Map<number, { id: number; x: number; y: number }>();
  await touchSequence(page, active, 'touchstart', [{ id: 1, x, y }]);
  await touchSequence(page, active, 'touchend', [{ id: 1, x, y }]);
}

test('virtual joystick drags forward and accelerates the car', async ({ page }) => {
  await startMobileGame(page);
  const before = (await getState(page)).player.speed;

  const active = new Map<number, { id: number; x: number; y: number }>();
  // MOBILE_CONTROLS.joystickBaseX/Y (config.ts: 110, 960-110=850) — touch
  // down on the base, then drag up past the Y deadzone to register as
  // "accelerate".
  await touchSequence(page, active, 'touchstart', [{ id: 1, x: 110, y: 850 }]);
  await page.waitForTimeout(50);
  await touchSequence(page, active, 'touchmove', [{ id: 1, x: 110, y: 800 }]);
  await page.waitForTimeout(700);
  const after = (await getState(page)).player.speed;
  await touchSequence(page, active, 'touchend', [{ id: 1, x: 110, y: 800 }]);

  expect(after).toBeGreaterThan(before);
});

test('releasing the joystick stops driving it (no stuck input)', async ({ page }) => {
  await startMobileGame(page);
  const active = new Map<number, { id: number; x: number; y: number }>();
  await touchSequence(page, active, 'touchstart', [{ id: 1, x: 110, y: 850 }]);
  await touchSequence(page, active, 'touchmove', [{ id: 1, x: 110, y: 800 }]);
  await page.waitForTimeout(800); // long enough to build real speed first
  await touchSequence(page, active, 'touchend', [{ id: 1, x: 110, y: 800 }]);

  const justAfterRelease = (await getState(page)).player.speed;
  expect(justAfterRelease).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  const later = (await getState(page)).player.speed;
  // Coast friction should bleed speed off once the joystick is no longer
  // held — a stuck "accelerate" would instead keep climbing toward max.
  expect(later).toBeLessThan(justAfterRelease);
});

test('fire button fires the equipped weapon (rocket)', async ({ page }) => {
  await startMobileGame(page);
  const before = (await getState(page)).player.ammo;

  // MOBILE_CONTROLS.fireButtonX/Y (config.ts: 300, 960-110=850).
  const active = new Map<number, { id: number; x: number; y: number }>();
  await touchSequence(page, active, 'touchstart', [{ id: 1, x: 300, y: 850 }]);
  await page.waitForTimeout(150);
  await touchSequence(page, active, 'touchend', [{ id: 1, x: 300, y: 850 }]);

  const after = (await getState(page)).player.ammo;
  expect(after).toBeLessThan(before);
});

test('tapping a weapon-sidebar row switches the equipped weapon', async ({ page }) => {
  await startMobileGame(page);
  expect((await getState(page)).player.weapon).toBe('rocket');

  // weaponSidebarRowRect(1)/(2) centers — sidebarOrigin(600, 960) is
  // {x: 600-160=440, yStart: 960-200=760}, rows are 54 tall starting 6px
  // above yStart+i*64, centered at x=440+48-6=482.
  await touchTap(page, 482, 845);
  expect((await getState(page)).player.weapon).toBe('sideguns');

  await touchTap(page, 482, 909);
  expect((await getState(page)).player.weapon).toBe('turret');
});

test('turret can be aimed and fired by a second finger while the joystick is held', async ({ page }) => {
  await startMobileGame(page);
  await touchTap(page, 482, 909); // switch to turret
  expect((await getState(page)).player.weapon).toBe('turret');

  const active = new Map<number, { id: number; x: number; y: number }>();
  // Finger A: joystick, held down and dragged — proves movement still works
  // simultaneously with the second finger below.
  await touchSequence(page, active, 'touchstart', [{ id: 1, x: 110, y: 850 }]);
  await page.waitForTimeout(50);
  await touchSequence(page, active, 'touchmove', [{ id: 1, x: 110, y: 820 }]);
  await page.waitForTimeout(50);

  const beforeAmmo = (await getState(page)).player.ammo;
  // Finger B: a separate touch elsewhere on the field, held down, to aim
  // and fire the turret — this is the whole point of TouchControls'
  // multi-pointer resolution (see getTurretAimPointer in TouchControls.ts).
  // (300, 300) is clear of the joystick/fire-button/sidebar zones.
  await touchSequence(page, active, 'touchstart', [{ id: 2, x: 300, y: 300 }]);
  await page.waitForTimeout(400);
  const state = await getState(page);
  await touchSequence(page, active, 'touchend', [{ id: 1, x: 110, y: 820 }]);
  await touchSequence(page, active, 'touchend', [{ id: 2, x: 300, y: 300 }]);

  expect(state.player.ammo).toBeLessThan(beforeAmmo);
  expect(state.player.speed).toBeGreaterThan(0);
});

test('restarting after game over leaves touch controls working (no leaked camera/listener state)', async ({ page }) => {
  await startMobileGame(page);

  // Same pulsed ram-into-wall technique core.spec.ts's gameOver test uses.
  let state = await getState(page);
  for (let i = 0; i < 80 && !state.gameOver; i++) {
    await page.keyboard.down('w');
    await page.keyboard.down('a');
    await page.waitForTimeout(200);
    await page.keyboard.up('a');
    await page.keyboard.up('w');
    state = await getState(page);
  }
  expect(state.gameOver).toBe(true);

  await touchTap(page, 300, 480); // restart (dual-path: Space or tap)
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);

  const before = (await getState(page)).player.speed;
  const active = new Map<number, { id: number; x: number; y: number }>();
  await touchSequence(page, active, 'touchstart', [{ id: 1, x: 110, y: 850 }]);
  await touchSequence(page, active, 'touchmove', [{ id: 1, x: 110, y: 800 }]);
  await page.waitForTimeout(700);
  const after = (await getState(page)).player.speed;
  await touchSequence(page, active, 'touchend', [{ id: 1, x: 110, y: 800 }]);

  expect(after).toBeGreaterThan(before);
});
