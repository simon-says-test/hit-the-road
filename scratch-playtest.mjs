import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 960, height: 600 }, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5173/?mobile=1&e2e=1&seed=1");
await page.waitForTimeout(1500);
await page.mouse.click(480, 300);
await page.waitForTimeout(300);

async function touchTap(x, y) {
  await page.evaluate(
    ({ x, y }) => {
      const canvas = document.querySelector("canvas");
      const rect = canvas.getBoundingClientRect();
      const t = (phase) =>
        new Touch({ identifier: 1, target: canvas, clientX: rect.left + x, clientY: rect.top + y, pageX: rect.left + x, pageY: rect.top + y });
      canvas.dispatchEvent(new TouchEvent("touchstart", { touches: [t()], targetTouches: [t()], changedTouches: [t()], bubbles: true, cancelable: true }));
      canvas.dispatchEvent(new TouchEvent("touchend", { touches: [], targetTouches: [], changedTouches: [t()], bubbles: true, cancelable: true }));
    },
    { x, y }
  );
}

// Same pulsed ram-into-wall technique e2e/tests/core.spec.ts's gameOver test
// already uses reliably.
let state;
for (let i = 0; i < 80; i++) {
  await page.keyboard.down("w");
  await page.keyboard.down("a");
  await page.waitForTimeout(200);
  await page.keyboard.up("a");
  await page.keyboard.up("w");
  state = await page.evaluate(() => window.__GAME_STATE__);
  if (state.gameOver) break;
}
console.log("gameOver reached:", state.gameOver, "after", state.player.health, "health");

// Restart via tap (dual-path restart, same as keyboard) and confirm the
// joystick still works exactly once afterward — no doubled/leaked camera.
await touchTap(480, 300);
await page.waitForTimeout(500);

console.log("canvas count (should stay 1):", await page.evaluate(() => document.querySelectorAll("canvas").length));

const before = await page.evaluate(() => window.__GAME_STATE__.player.speed);
await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const rect = canvas.getBoundingClientRect();
  const t = (x, y) =>
    new Touch({ identifier: 1, target: canvas, clientX: rect.left + x, clientY: rect.top + y, pageX: rect.left + x, pageY: rect.top + y });
  canvas.dispatchEvent(
    new TouchEvent("touchstart", { touches: [t(110, 490)], targetTouches: [t(110, 490)], changedTouches: [t(110, 490)], bubbles: true, cancelable: true })
  );
});
await page.waitForTimeout(60);
await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const rect = canvas.getBoundingClientRect();
  const t = (x, y) =>
    new Touch({ identifier: 1, target: canvas, clientX: rect.left + x, clientY: rect.top + y, pageX: rect.left + x, pageY: rect.top + y });
  canvas.dispatchEvent(
    new TouchEvent("touchmove", { touches: [t(110, 440)], targetTouches: [t(110, 440)], changedTouches: [t(110, 440)], bubbles: true, cancelable: true })
  );
});
await page.waitForTimeout(800);
const after = await page.evaluate(() => window.__GAME_STATE__.player.speed);
console.log("joystick after restart: before=", before, "after=", after, "(expect after > before)");

await page.screenshot({ path: "/tmp/screenshot-after-restart.png" });
console.log("CONSOLE_ERRORS:", JSON.stringify(errors));
await browser.close();
