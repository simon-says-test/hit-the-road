import Phaser from "phaser";
import { HAZARDS, OBSTACLES, TERRAIN_COLORS, WALLS } from "../config";

export const SFX_KEYS = {
  collision: "sfx-collision",
  explosion: "sfx-explosion",
  rocket: "sfx-rocket",
  gunfire: "sfx-gunfire",
  pickup: "sfx-pickup",
  gameOver: "sfx-gameover",
} as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    // Loaded assets (all CC0): cars from FieraRyan's "Futuristic Wasteland
    // Top-down Cars" pack, fx/hazards from Kenney's Particle Pack and Racing
    // Pack, audio from Kenney's Impact Sounds / Sci-fi Sounds / Interface
    // Sounds. See docs/high-level-design.md for the full breakdown + credits.

    // Error handling for asset loading
    this.load.on("loaderror", (fileObj: any) => {
      console.error("Failed to load asset:", fileObj.key, fileObj.url);
    });

    this.load.image("car-player", "assets/cars/car-player.png");
    this.load.image("car-enemy-1", "assets/cars/car-enemy-1.png");
    this.load.image("car-enemy-2", "assets/cars/car-enemy-2.png");
    this.load.image("car-enemy-3", "assets/cars/car-enemy-3.png");
    this.load.image("car-enemy-4", "assets/cars/car-enemy-4.png");

    this.load.image("explosion", "assets/fx/explosion.png");
    this.load.image("projectile-rocket", "assets/fx/projectile-rocket.png");
    this.load.image("projectile-bullet", "assets/fx/projectile-bullet.png");
    this.load.image("projectile-enemy", "assets/fx/projectile-enemy.png");
    this.load.image("pickup-health", "assets/fx/pickup-health.png");
    this.load.image("pickup-ammo", "assets/fx/pickup-ammo.png");
    this.load.image("pickup-boost", "assets/fx/pickup-boost.png");

    this.load.audio(SFX_KEYS.collision, "assets/audio/sfx-collision.ogg");
    this.load.audio(SFX_KEYS.explosion, "assets/audio/sfx-explosion.ogg");
    this.load.audio(SFX_KEYS.rocket, "assets/audio/sfx-rocket.ogg");
    this.load.audio(SFX_KEYS.gunfire, "assets/audio/sfx-gunfire.ogg");
    this.load.audio(SFX_KEYS.pickup, "assets/audio/sfx-pickup.ogg");
    this.load.audio(SFX_KEYS.gameOver, "assets/audio/sfx-gameover.ogg");

    // The track itself (road ribbon, rock walls, dashed centerline) is no
    // longer a pre-baked fixed-size texture — it's a different shape every
    // race now (see entities/track.ts), so GameScene draws it directly into
    // a Graphics object at race start instead of BootScene generating a
    // reusable texture for it.

    // Terrain hazards (rough road, oil slicks) are ground-level patches the
    // player drives over, not discrete objects — there's no sourced art for
    // that shape, so these stay procedural too, same reasoning as the road.
    this.drawRoughPatchTexture();
    this.drawOilSlickTexture();
    // Small discrete rock/debris obstacle — a one-time bump, not a patch
    // you linger on, so it's a distinct (smaller, jagged) silhouette rather
    // than reusing the rough-patch shape at a smaller scale.
    this.drawObstacleTexture();
  }

  create(): void {
    this.scene.start("intro");
  }

  // A jagged, organic-looking silhouette instead of a clean rectangle/ellipse
  // — N points around (cx, cy) at a randomized fraction of the base radius,
  // filled as one polygon. Used for both terrain patch textures below.
  private drawIrregularBlob(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    radiusX: number,
    radiusY: number,
    points: number,
    irregularity: number
  ): void {
    const verts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = 1 + (Math.random() * 2 - 1) * irregularity;
      verts.push(new Phaser.Math.Vector2(cx + Math.cos(angle) * radiusX * r, cy + Math.sin(angle) * radiusY * r));
    }
    g.fillPoints(verts, true);
  }

  private drawRoughPatchTexture(): void {
    const g = this.add.graphics();
    const w = HAZARDS.patchWidth;
    const h = HAZARDS.patchHeight;
    const radiusX = w * 0.46;
    const radiusY = h * 0.46;
    g.fillStyle(TERRAIN_COLORS.roughBase, 1);
    this.drawIrregularBlob(g, w / 2, h / 2, radiusX, radiusY, 14, 0.35);
    g.fillStyle(TERRAIN_COLORS.roughSpeckle, 0.85);
    for (let i = 0; i < 20; i++) {
      // Polar placement, capped well inside the blob's nominal radius, so
      // speckles don't bleed past the irregular edge into the transparent
      // margin around it.
      const angle = Math.random() * Math.PI * 2;
      const radiusFactor = Math.random() * 0.8;
      const sx = w / 2 + Math.cos(angle) * radiusX * radiusFactor;
      const sy = h / 2 + Math.sin(angle) * radiusY * radiusFactor;
      g.fillRect(sx - 3, sy - 3, Phaser.Math.Between(3, 8), Phaser.Math.Between(3, 8));
    }
    g.generateTexture("hazard-rough", w, h);
    g.destroy();
  }

  private drawOilSlickTexture(): void {
    const g = this.add.graphics();
    const w = HAZARDS.patchWidth;
    const h = HAZARDS.patchHeight;
    g.fillStyle(TERRAIN_COLORS.oilBase, 0.92);
    this.drawIrregularBlob(g, w / 2, h / 2, w * 0.42, h * 0.32, 12, 0.4);
    g.fillStyle(TERRAIN_COLORS.oilSheen, 0.5);
    this.drawIrregularBlob(g, w * 0.42, h * 0.42, w * 0.16, h * 0.11, 10, 0.45);
    g.generateTexture("hazard-oil", w, h);
    g.destroy();
  }

  private drawObstacleTexture(): void {
    const g = this.add.graphics();
    const size = OBSTACLES.size;
    g.fillStyle(WALLS.rockColor, 1);
    this.drawIrregularBlob(g, size / 2, size / 2, size * 0.46, size * 0.46, 9, 0.4);
    g.fillStyle(WALLS.rockSpeckleColor, 0.8);
    this.drawIrregularBlob(g, size * 0.42, size * 0.42, size * 0.16, size * 0.16, 7, 0.4);
    g.generateTexture("hazard-obstacle", size, size);
    g.destroy();
  }
}
