import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const errors = [];

async function newDesktopPage() {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  return page;
}

const page = await newDesktopPage();
await page.addInitScript(() => (window.__E2E_TEST__ = true));
await page.goto("http://localhost:5173/?e2e=1&seed=7");
await page.waitForSelector("#app canvas", { timeout: 20000 });
await page.keyboard.press("Space");
await page.waitForFunction(() => !!window.__GAME_STATE__, null, { timeout: 20000 });

// Build a lead on the rivals first so a sudden ram/contact can't reset the
// stationary timer mid-test, then stop completely and watch the timer.
await page.keyboard.down("w");
await page.waitForTimeout(2500);
await page.keyboard.up("w");

for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => window.__GAME_STATE__);
  console.log(`t=${(i + 1) * 500}ms speed=${state.player.speed.toFixed(1)} health=${state.player.health}`);
}

await page.screenshot({ path: "/tmp/pt-restart-button.png" });
const before = await page.evaluate(() => window.__GAME_STATE__.player);
await page.keyboard.press("r");
await page.waitForTimeout(500);
const after = await page.evaluate(() => window.__GAME_STATE__.player);
console.log(`before R: x=${before.x.toFixed(0)} y=${before.y.toFixed(0)} health=${before.health} laps=${before.laps}`);
console.log(`after  R: x=${after.x.toFixed(0)} y=${after.y.toFixed(0)} health=${after.health} laps=${after.laps} (expect health back to 100)`);

console.log("CONSOLE_ERRORS:", JSON.stringify(errors));
await browser.close();
