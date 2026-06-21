import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5173/?seed=7&e2e=1");
await page.waitForTimeout(1500);
console.log("EARLY ERRORS:", JSON.stringify(errors));

await page.keyboard.press("Space");
await page.waitForTimeout(500);

// Start parked at/near the start line to check the finish-line art and the
// new position HUD styling without driving anywhere yet.
await page.screenshot({ path: "/tmp/pt-startline.png" });

await page.keyboard.down("w");
await page.keyboard.down("d");

for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => window.__GAME_STATE__);
  console.log(`t=${(i + 1) * 5}s raceDebug=${JSON.stringify(state.raceDebug)} health=${Math.round(state.player.health)} ammo=${state.player.ammo} gameOver=${state.gameOver}`);
  await page.screenshot({ path: `/tmp/pt2-${i + 1}.png` });
  if (state.gameOver || state.won) break;
}

await page.keyboard.up("w");
await page.keyboard.up("d");
console.log("CONSOLE_ERRORS:", JSON.stringify(errors));
await browser.close();
