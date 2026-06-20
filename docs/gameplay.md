# Hit the Road — Gameplay Specification

## Concept

A 2D top-down vehicular combat game set in a dystopian future. The player drives along a hostile road, fending off other vehicles with speed, steering, and weapons. The game is about survival and aggression in equal measure — you can outrun trouble or you can fight it, and the road gets more dangerous the further you go.

## Core loop

Drive forward, manage speed and health, destroy or evade hostile vehicles, and survive as far/long as possible. Score is driven by distance traveled and enemies destroyed. Each run ends when the player's vehicle is destroyed; the player then restarts.

*Open question: purely endless/procedural, or discrete stages/checkpoints with distinct enemy mixes or hazards? The current spawn-rate-scales-with-distance approach in code suggests endless.*

## Vehicle handling

Free movement across the road width — not lane-locked. This is a firm design decision, not a someday-polish item: the current lane-snapping movement in `GameScene` is placeholder/dummy code and is to be replaced by physics-based free movement (acceleration/steering below), not retained as a parallel or fallback mode.

- **W** (or Up) — accelerate forward
- **S** (or Down) — brake while moving forward; once stopped or moving backward, accelerates in reverse
- **A / D** (or Left/Right) — steer left / right
- **1 / 2 / 3** — select equipped weapon (see Weapons)
- **Space** (or click, for the turret — see below) — fire selected weapon
- **Shift** — handbrake/drift: sharper direction change than steering alone, at the cost of speed and weapon stability, while held and steering above a minimum speed

Handling notes:

- Vehicle has acceleration, top speed, and turning rate. Steering authority scales with speed rather than being constant: sluggish at low speed, sharpest at top speed (a linear ramp between a min and max lateral turn rate, keyed off current speed as a fraction of top speed).
- Braking, turning, and off-road driving don't just affect movement — they also destabilize certain weapons (see Weapons), so handling and combat are coupled, not separate systems.
- Drifting carries its own risk/reward: faster direction change (turn rate multiplier), but an ongoing speed drain while active, and it sharply increases turret/side-gun instability on top of whatever turning/off-road instability is already in effect.
- Going off the road edge costs both speed (extra drag) and health (a steady drain per second while off the paved road) rather than simply blocking movement. Driving over a rough-terrain or oil-slick patch costs neither — see Road & hazards for those.
- Colliding with an enemy vehicle never costs the player health directly — it jolts the player's current speed, scaled by how fast the two were closing on each other at the moment of impact (a fast catch-up from a chaser jolts you harder than barely clipping a slow one). Being rammed from behind lurches you forward; being clipped from the side knocks you back — either way it registers even from a standstill, not just as a dent in existing speed. That same impact also damages the *enemy*, scaled the same way — a hard, fast ram can one-shot a weak car outright, but a glancing one just dents its health pool like a weapon hit would, and a brief per-enemy cooldown after each ram stops one continuous overlap from re-damaging it every frame before physics can separate the two cars. Contact is physical, not just a number changing in the background — a car that survives a ram visibly bounces off rather than gliding through the player's position. See Game over & restart for when a run actually ends — only hazards, enemy gunfire, and off-road driving cost the player health, not ramming itself.
- **Landing a hit also costs the victim speed, briefly.** Enemy top speed is set roughly at parity with the player's own (see Enemies below) rather than categorically faster or slower, so a chase is decided by combat and obstacles, not a built-in speed edge: a weapon hit or ram-damage hit that doesn't kill outright knocks the victim's current speed down and caps their top speed for a short window afterward — whoever lands the hit pulls ahead because the other car *actually slowed down*, not because of an inherent rate difference. This applies symmetrically: a player who gets shot is slowed the same way an enemy who gets shot is.

*Future possibility: nitro/boost (a player-triggered speed ability) — still undecided. Distinct from the speed-boost pickup under Pickups, which is a temporary buff from a dropped item, not an on-demand ability.*

## Weapons

The player has **three weapons for a run**, bound to keys **1**, **2** and **3**, all equipped from the start of every run (no loadout selection or partial-roster pickup). Each weapon has its own aiming mechanic, so switching weapons changes how you play, not just what damage you deal:

- **Rocket launcher** — fires straight ahead along the road; limited ammo (6), highest single-target damage, longest cooldown between shots. Fired with Space. Big, slow, bright-orange projectile.
- **Side guns** — twin barrels mounted on the left and right sides of the car (not the front), aiming *outward* to each side rather than forward, within a moderate arc (not swinging all the way back toward the rear); both fire together on a single trigger pull. Aim is controlled by one shared meter that auto-sweeps back and forth; pressing Space locks in a shot at the meter's current position, deflected symmetrically from each side's outward-facing neutral aim toward the front at the meter's extremes — the in-world meter is mirrored on both sides of the car (two arcs curving outward from it) so the timing cue reads the same regardless of which side you're tracking. Steering pushes the meter around with extra jitter, making it harder to time a clean shot while maneuvering hard. Pale-yellow projectiles (one ammo consumed fires both).
- **Turret machine gun** — aimed directly with the mouse/pointer, very high ammo pool, low damage per hit, short cooldown; fired by clicking (not Space, since Space is the other two weapons' fire key). A crosshair follows the pointer so it's clear exactly where a shot will land, separate from the spread-cone meter above the car. Accuracy spread widens with steering, while off-road, and sharply while drifting — it rewards driving smoothly rather than aggressively while it's equipped. Small, fast, cyan tracer.

Each weapon's projectile has a distinct size and tint (see above) so the three are identifiable at a glance mid-fight, not just by the HUD's weapon-name readout. The currently-equipped weapon's aim/readiness also gets a small graphical meter floating just above the player's car — a filling bar for the rocket's reload, twin dots sweeping outward arcs for the side guns' aim angle, a widening/narrowing cone (plus the pointer crosshair) for the turret's spread — in addition to the numeric HUD readout in the corner (see HUD below).

Beyond each weapon's own aiming quirk, **all three guns get shakier together at higher speed and while driving over rough terrain** — the rocket can stray off dead-ahead, the side-gun sweep gets extra jitter on top of the steering-triggered kind, and the turret's spread cone widens further — representing the car itself jolting the driver/turret around, not a per-weapon cause. This stacks with (doesn't replace) each weapon's existing instability triggers (steering, off-road, drift).

Common rules across weapons:

- Enemies have a health value and are destroyed at zero, whether by weapon fire or by ramming them; destroying one may drop a pickup (health, ammo, or a boost — see Pickups).
- The player's own vehicle has health/armor; enemy weapon hits, off-road driving, and hazards reduce it. Ramming an enemy vehicle does not — see Vehicle handling above.

The three weapon types above are the full roster for now — no additional weapon types to design or build yet.

## Enemies

Distinct archetypes give the player different problems to solve, not just more of the same car. All four are implemented, unlocking in turn as distance increases (each new archetype enters the spawn pool past a distance threshold rather than all four being present from the start). Archetypes also differ in where they come from, not just how they move once on screen — **no archetype comes from directly ahead/the front anymore**; everything is either chasing from behind or merging in from the road's side:

- **Chaser** — approaches **from behind**, roughly at parity with the player's own top speed (just a hair faster), steering toward the player's lane to catch up and ram; lowest health of the four, though still enough to usually take more than one hit. With speed at parity, outrunning one for good comes down to combat (a landed hit slows it — see Vehicle handling) rather than just holding the throttle down; it'll still catch a player who's coasting or braking.
- **Shooter** — merges in **from the road's left/right edge**, already roughly level with the player rather than approaching from afar; slower than baseline so it tends to drift back rather than pulling away. Holds a horizontal gap from the player and fires projectiles on a cooldown.
- **Heavy** — merges in **from the road's left/right edge** like Shooter, slow and has no lateral steering at all — it holds its lane at the road edge and can't dodge other traffic either — but has by far the most health; expensive to kill, trivial to outrun.
- **Bomber** — approaches **from behind** like Chaser but a little faster still (the only archetype that can out-leg a flat-out player by a small margin), aggressively steering toward the player; its higher closing speed means a bigger speed-knock on contact than Chaser's, with an explosion sound/fx to match. Still has the least health of the four — a hard ram or one or two weapon hits will usually finish it — but no longer a guaranteed one-hit kill from any contact.

Both spawn styles share the same underlying physics: an enemy's screen-relative motion is its own distance-scaled speed minus the player's current forward speed, so an archetype faster than the player closes the gap (catching up from behind, or pulling ahead from the side) while one slower than the player falls back and eventually despawns off-screen. Chaser/Bomber spawn off the bottom edge; Shooter/Heavy spawn already on-screen at the road's left/right edge, within a band just ahead of the player's current position, rather than crossing the whole screen from a distance. Enemy mix scales with distance: later archetypes unlock into the weighted spawn pool over time.

### Enemy "AI" and traffic

The road is meant to feel like other cars are driving it, not like a swarm spawning at the player:

- **A hard cap on simultaneously active enemies** keeps the road from feeling crowded — a handful of readable opponents rather than a wall of traffic. Spawn interval still shortens with distance like before, but it only fills back up to the cap faster, not past it.
- **Steering has inertia.** An enemy's lateral velocity eases toward its target rather than snapping to it instantly, so lane changes (including the avoidance below) look like a car easing over, not a script teleporting sideways.
- **Enemies physically collide with each other**, not just with the player — two cars that end up in the same space push off each other. Each archetype also tries to steer around whichever other enemy is currently closest, but how *hard* it tries depends on temperament: aggressive, ramming archetypes (Chaser, Bomber) only weakly avoid traffic, since plowing through another car on the way to the player is an acceptable cost to them; Shooter and Heavy try much harder to dodge, since they have no reason to want a collision. Heavy's total lack of lateral steering means it can't dodge at all, consistent with it "not steering at all" above — a parked Heavy at the road edge is just an obstacle other traffic has to get around.
- Contact with the player is also physical, not a same-position pass-through — a car that survives a ram briefly backs off rather than immediately chasing right back into the player, so the bounce-apart reads as reliable rather than hit-or-miss.

## Road & hazards

- Road width and edges as today; off-road driving is penalized (slowed via drag, damaged via a steady health drain) rather than simply blocked.
- Terrain hazards spawn down the road alongside moving enemies, scaling in frequency with distance like enemies do — but unlike the old debris/barrier obstacles, they're irregular patches of road surface the player (and enemies) drive *over*, not solid objects that get "used up" on contact. A patch keeps affecting whoever's on it every frame, and isn't removed by that contact — it scrolls away naturally like any other world object. Neither type costs health; they affect handling instead, for both the player and enemy traffic alike:
  - **Rough/broken road** — extra drag while driving over it, bleeding off speed similar to (but distinct from) off-road drag. Enemies slow their approach the same way while crossing one.
  - **Oil slick** — steering authority is reduced, and the car gets pushed sideways for the duration regardless of steering input — a sustained slide in one direction (rolled once on contact), not a vibration, since that's what actually reads as "losing traction" rather than the car just shaking in place. Strong enough that holding straight ahead with no steering input at all can still carry the car off the road if unaddressed. The effect lingers briefly after leaving the patch rather than ending the instant the car clears it. Enemies get the same loss-of-control push while affected.

*Future possibility: Setting-driven hazards (weather, low visibility, night driving) to reinforce the dystopian theme — still not implemented, distinct from the rough-terrain/oil-slick hazards above.*

## Pickups

Enemies have a chance to drop a pickup on destruction (by any means — weapon or ram). Once dropped, a pickup drifts down the road like any other world object and is collected on contact:

- **Health/repair** — restores a flat amount of health.
- **Ammo** — refills all three weapons' ammo (there's no per-weapon ammo pickup; one pickup tops up the whole loadout). Stands in for "weapon unlock" from the original spec wording, which doesn't apply now that all three weapons are always equipped.
- **Boost** — a single pickup type that grants one of two temporary effects at random: a score multiplier for a few seconds, or a temporary top-speed increase for a few seconds.

Independent of kills, a standalone health-or-ammo crate also spawns down the road on its own infrequent timer (no boosts from this source — boosts stay a kill-drop flavor bonus) — a small trickle of supply so a run isn't entirely dependent on landing kills, without being frequent enough to be a reliable refill loop.

## Scoring & progression

- Score combines distance traveled and a per-archetype value awarded when an enemy is destroyed (by weapon or by ramming) — distance only accrues while actually moving forward, not while braking/reversing, and is multiplied while a score-multiplier boost is active.
- Difficulty (enemy density, speed, archetype mix, hazard density) scales with distance/time. This scaling is deliberately decoupled from the player's own (player-controlled) speed: an enemy's closing speed is the difficulty-scaled approach speed plus the player's current forward speed, so braking/idling doesn't trivially neutralize difficulty ramp-up — the world keeps getting more dangerous even if you sit still.
- Every run is a fresh start — no meta-progression (unlocks, persistent upgrades) between runs for now. The one persistent thing across runs is a best-distance high score (see Game over & restart) — that's a record kept for the player to chase, not a gameplay-affecting unlock.

## Game over & restart

Player health reaches zero — from ramming, hazards, off-road driving, or enemy fire — → vehicle destroyed → game over screen shows final score → restart (Space or tap), matching the current flow. The game-over screen also shows the best distance reached across all previous runs (persisted locally in the browser, not server-side) and flags it explicitly when the just-finished run set a new one.

## HUD

Health, current best distance, equipped weapon and its state (ammo count, plus a cooldown/sweep-angle/spread readout depending on the weapon), speed, and score/distance — all shown as text in the corner. There's also a small graphical meter above the player's car mirroring the current weapon's aim/readiness state (see Weapons above) — the corner text remains the precise numeric readout, the in-world meter is the at-a-glance version. A small graphical health bar floats below the player's car (and above every active enemy car), color-coded (green for the player, red for enemies) and proportional to remaining health — a glanceable supplement to the numeric health readout, same idea as the weapon meter. The player's bar specifically sits below rather than above so it doesn't compete for the same space as the weapon meter.

A persistent sidebar in the dead-ground margin to the road's right lists all three weapons at once — number key, a color swatch matching that weapon's projectile tint, name, and current ammo — with the equipped weapon's row highlighted. This is meant to make the full roster and how to switch between them visible at a glance, rather than only discoverable by reading the single-line "Weapon: X" HUD text or already knowing to press 1/2/3.

## First-run intro screen

Before the first run of a session, a dedicated screen explains the controls (movement, drift, weapon-select keys, fire/aim for each weapon) and the headline tactic ("landing a hit slows them down, getting hit slows you down"), with a pulsing "Press SPACE or tap to start" prompt. This is shown once per page load, not on every restart — dying and restarting (Space/tap on the game-over screen) goes straight back into a new run without re-explaining controls, since by then the player already knows them.

## Art & audio direction

No longer purely procedural — loaded CC0 assets are now allowed (see CLAUDE.md) and used for the highest-impact visuals: cars, projectiles, pickups, and explosion fx are all sourced art (see `CREDITS.md`), tinted at runtime to fit a desaturated wasteland palette. Cars render at 60% of the source art's processed size, leaving more visible road and reaction room on the fixed-size canvas. The road/ground stay procedurally generated and deliberately recolored (dark cracked asphalt, dead-ground margins, dirty-yellow lane markings) rather than using the brighter sourced road tiles that were available, specifically to avoid a style clash with the gritty cars — see high-level-design.md's Rendering & assets section for the reasoning. Terrain hazards (rough road, oil slicks) are also procedural, for the same reason plus the lack of any sourced art shaped like a ground-level patch rather than a discrete object.

Audio is now loaded too (collision, explosion, rocket, gunfire, pickup, game-over), replacing the earlier Web Audio synthesis. There's still no continuous engine hum; only discrete one-shot sound effects, since a looped engine sound is a meaningfully different feature (loop start/stop tied to speed) and wasn't pursued in this pass.
