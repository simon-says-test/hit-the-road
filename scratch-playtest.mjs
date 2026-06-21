import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5173/?seed=1&e2e=1");
await page.waitForTimeout(1500);
console.log("EARLY ERRORS:", JSON.stringify(errors));

await page.keyboard.press("Space");
await page.waitForTimeout(500);

async function press(keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

// Drive forward continuously in the background while we poll, so the player
// stays in the mix with rivals (proximity matters for chase/shooter
// behavior) instead of sitting still at the start line.
let driving = true;
(async () => {
  while (driving) {
    await page.keyboard.down("w");
    await page.waitForTimeout(150);
  }
})();

const samples = [];
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(250);
  const state = await page.evaluate(() => window.__GAME_STATE__);
  samples.push({ t: i * 250, rivals: state.rivals.map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), heading: Math.round(r.heading) })), hazards: state.hazards });
}
driving = false;
await page.keyboard.up("w");

// Per-rival heading delta between consecutive samples (250ms apart) — the
// old bug added the oil drift bias every single render tick (not scaled by
// delta), so during the ~1.4s oil effect it would spin at roughly
// turnRate-independent multiple-rotations-per-second; a fixed-rate AI
// should never show a 250ms heading jump anywhere near that.
const rivalCount = samples[0].rivals.length;
for (let r = 0; r < rivalCount; r++) {
  let maxJump = 0;
  let maxJumpAt = -1;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].rivals[r]?.heading;
    const b = samples[i].rivals[r]?.heading;
    if (a === undefined || b === undefined) continue;
    let diff = Math.abs(((b - a + 540) % 360) - 180);
    if (diff > maxJump) {
      maxJump = diff;
      maxJumpAt = samples[i].t;
    }
  }
  console.log(`rival ${r} max heading jump per 250ms: ${maxJump.toFixed(1)} deg (at t=${maxJumpAt}ms)`);
}

console.log("HAZARD COUNTS OVER TIME:", JSON.stringify(samples.map((s) => s.hazards)));
console.log("LAST SAMPLE RIVALS:", JSON.stringify(samples[samples.length - 1].rivals));

const finalState = await page.evaluate(() => window.__GAME_STATE__);
console.log("FINAL STATE SUMMARY:", JSON.stringify({ player: finalState.player, gameOver: finalState.gameOver }));

await page.screenshot({ path: "/tmp/playtest-ai.png" });

console.log("CONSOLE_ERRORS:", JSON.stringify(errors));
await browser.close();
