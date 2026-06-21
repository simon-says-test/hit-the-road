import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });

// --- Desktop (unchanged landscape) ---
{
  const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await context.newPage();
  await page.goto("http://localhost:5173/?e2e=1&seed=42");
  await page.waitForTimeout(1500);
  await page.mouse.click(480, 300);
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/screenshot-desktop.png" });
  await context.close();
}

// --- Mobile (new portrait default) ---
{
  const context = await browser.newContext({ viewport: { width: 600, height: 960 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto("http://localhost:5173/?mobile=1&e2e=1&seed=42");
  await page.waitForTimeout(1500);
  await page.mouse.click(300, 480);
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/screenshot-mobile-portrait.png" });

  // Hold the joystick + show fire button active state for a clearer check.
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    const t = (x, y) => new Touch({ identifier: 1, target: canvas, clientX: rect.left + x, clientY: rect.top + y, pageX: rect.left + x, pageY: rect.top + y });
    canvas.dispatchEvent(new TouchEvent("touchstart", { touches: [t(110, 850)], targetTouches: [t(110, 850)], changedTouches: [t(110, 850)], bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    const t = (x, y) => new Touch({ identifier: 1, target: canvas, clientX: rect.left + x, clientY: rect.top + y, pageX: rect.left + x, pageY: rect.top + y });
    canvas.dispatchEvent(new TouchEvent("touchmove", { touches: [t(110, 800)], targetTouches: [t(110, 800)], changedTouches: [t(110, 800)], bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/tmp/screenshot-mobile-portrait-joystick-held.png" });
  await context.close();
}

await browser.close();
console.log("done");
