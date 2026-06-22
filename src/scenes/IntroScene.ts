import Phaser from "phaser";
import { GameMode } from "../config";

const MODE_DESCRIPTIONS: Record<GameMode, string> = {
  arcade: "Cars (including you) are destroyed at zero health.",
  repair: "Cars stop to repair at zero health, resuming at half health.",
};

// Shown once, right after BootScene finishes loading — explains controls
// before the player is dropped into traffic. Game-over restarts skip this
// and go straight back into GameScene (see GameScene.endGame()), so it's a
// one-time orientation, not a screen the player has to dismiss every run.
// The mode toggle below always starts back on "arcade" on a fresh visit —
// it's only carried across *restarts* within a session (see GameScene.init).
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

    // Mode toggle: defaults to "arcade" every time this screen is shown
    // (i.e. every fresh page load — see the class comment), tap/click
    // either button to switch before starting. Picked up once by
    // scene.start's data below; GameScene.init carries it through any
    // later in-session restarts on its own.
    let mode: GameMode = "arcade";
    const modeButtonStyle = { fontFamily: "monospace", fontSize: "15px", padding: { x: 12, y: 6 } };
    const modeY = startY + lines.length * rowHeight + 75;

    const arcadeBtn = this.add
      .text(width / 2 - 95, modeY, "ARCADE", modeButtonStyle)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const repairBtn = this.add
      .text(width / 2 + 95, modeY, "REPAIR", modeButtonStyle)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const modeDesc = this.add
      .text(width / 2, modeY + 28, MODE_DESCRIPTIONS[mode], { fontFamily: "monospace", fontSize: "12px", color: "#999999" })
      .setOrigin(0.5);

    const refreshModeButtons = () => {
      arcadeBtn.setStyle({ ...modeButtonStyle, backgroundColor: mode === "arcade" ? "#ffd166" : "#2a261c", color: mode === "arcade" ? "#16140f" : "#dddddd" });
      repairBtn.setStyle({ ...modeButtonStyle, backgroundColor: mode === "repair" ? "#ffd166" : "#2a261c", color: mode === "repair" ? "#16140f" : "#dddddd" });
      modeDesc.setText(MODE_DESCRIPTIONS[mode]);
    };
    refreshModeButtons();
    arcadeBtn.on("pointerdown", () => {
      mode = "arcade";
      refreshModeButtons();
    });
    repairBtn.on("pointerdown", () => {
      mode = "repair";
      refreshModeButtons();
    });

    const prompt = this.add
      .text(width / 2, height - 60, "Press SPACE or tap to start", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });

    // Still "tap anywhere to start" (not just the prompt text) — except
    // over the mode buttons themselves, which need their own tap-to-switch
    // without also immediately starting the race on that same tap. SPACE
    // has no such ambiguity, so it stays an unconditional global binding.
    const start = () => this.scene.start("game", { mode });
    let started = false;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (started) return;
      if (arcadeBtn.getBounds().contains(pointer.x, pointer.y) || repairBtn.getBounds().contains(pointer.x, pointer.y)) return;
      started = true;
      start();
    });
    this.input.keyboard!.once("keydown-SPACE", start);
  }
}
