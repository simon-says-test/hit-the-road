// One-off-but-repeatable preprocessing for the FieraRyan "Futuristic Wasteland
// Top-down Cars" CC0 pack (https://fieraryan.itch.io/futuristic-post-apocalyptic-top-down-cars).
// Source sprites are landscape (car facing left/right) and far larger than this
// game's scale; this rotates them to portrait (car facing up/down the road),
// resizes down, and flips "oncoming" roles so they visually face the player.
//
// Usage: node scripts/process-car-sprites.mjs <path-to-extracted-pack>/processed
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error("Usage: node scripts/process-car-sprites.mjs <path-to-pack>/processed");
  process.exit(1);
}

const TARGET_HEIGHT = 90; // final in-game display height in px

// id = which numbered sprite in the pack, role = our in-game key, oncoming = flip
// so the car visually faces the player (front-approaching archetypes).
const SELECTIONS = [
  { id: 4, role: "car-player", oncoming: false },
  { id: 1, role: "car-enemy-1", oncoming: false }, // chaser — scrappy buggy, behind
  { id: 8, role: "car-enemy-2", oncoming: true }, // shooter — sedan, oncoming
  { id: 6, role: "car-enemy-3", oncoming: true }, // heavy — boxy hauler, oncoming
  { id: 9, role: "car-enemy-4", oncoming: false }, // bomber — battle-damaged, behind
];

const outDir = path.resolve("public/assets/cars");
fs.mkdirSync(outDir, { recursive: true });

for (const { id, role, oncoming } of SELECTIONS) {
  const src = path.join(sourceDir, `${id}.png`);
  const dest = path.join(outDir, `${role}.png`);
  let pipeline = sharp(src).rotate(90);
  if (oncoming) pipeline = pipeline.flip(); // vertical flip post-rotation: reverse facing
  await pipeline.resize({ height: TARGET_HEIGHT }).png().toFile(dest);
  console.log(`${src} -> ${dest}`);
}
