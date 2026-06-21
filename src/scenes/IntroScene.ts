import Phaser from "phaser";

// Shown once, right after BootScene finishes loading — explains controls
// before the player is dropped into traffic. Game-over restarts skip this
// and go straight back into GameScene (see GameScene.endGame()), so it's a
// one-time orientation, not a screen the player has to dismiss every run.
export class IntroScene extends Phaser.Scene {
  constructor() {
    super("intro");
  }

  create(): void {
    // scale.width/height (not a static CANVAS_WIDTH/HEIGHT import) — the
    // active canvas is desktop-landscape or mobile-portrait depending on
    // what main.ts picked at boot (see config.ts's MOBILE_CANVAS_WIDTH/
    // HEIGHT comment), and this has to lay out correctly for either.
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x16140f, 1).setOrigin(0, 0);

    this.add
      .text(width / 2, 70, "HIT THE ROAD", {
        fontFamily: "monospace",
        fontSize: "36px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    const lines = [
      ["W / Up", "Accelerate"],
      ["S / Down", "Brake / reverse"],
      ["A/D or Left/Right", "Steer"],
      ["Shift (steering)", "Drift: sharper turns"],
      ["1 / 2 / 3", "Switch weapon"],
      ["Space", "Fire Rocket/Side guns"],
      ["Mouse + Click", "Aim & fire Turret"],
    ];

    const startY = 150;
    const rowHeight = 34;
    lines.forEach(([key, desc], i) => {
      const y = startY + i * rowHeight;
      this.add.text(60, y, key, { fontFamily: "monospace", fontSize: "15px", color: "#ffd166" });
      this.add.text(260, y, desc, { fontFamily: "monospace", fontSize: "15px", color: "#dddddd" });
    });

    this.add
      .text(
        width / 2,
        startY + lines.length * rowHeight + 30,
        "Landing hits slows them down. Getting hit slows you.",
        { fontFamily: "monospace", fontSize: "12px", color: "#999999" }
      )
      .setOrigin(0.5);

    const prompt = this.add
      .text(width / 2, height - 60, "Press SPACE or tap to start", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });

    this.input.keyboard!.once("keydown-SPACE", () => this.scene.start("game"));
    this.input.once("pointerdown", () => this.scene.start("game"));
  }
}
