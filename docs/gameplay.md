# Hit the Road — Gameplay Specification

## Concept

A 2D top-down vehicular combat racer set in a dystopian future. The player drives a procedurally generated, winding canyon loop, racing and fighting **5 rival vehicles** over a fixed number of laps. The game is about survival and aggression in equal measure — you can outrun trouble or you can fight it — combined with actually having to drive the loop well, since the canyon turns sharply enough that careless driving costs you against the rock walls as much as against rivals.

**Status:** this is a major rework in progress (vertical endless scroller → closed-loop lap race), landing in phases. Currently implemented: the procedurally generated closed-loop track, free 2D movement with rotation-based steering (Phase 1); 5 always-active rivals racing and fighting the player around the loop with lap counting, bidirectional rubber-banding, and a finish condition (Phase 2); a checkered finish line marking the start/finish point on the loop; a prominent lap/position HUD readout; terrain hazards/obstacles placed around the loop (pulled forward from later-phase scope at your request); and pickups, both kill-drops and the independent timed standalone crate spawn. **Not yet implemented:** the minimap — lands in a later phase, flagged inline below where the current build doesn't have it yet.

## Core loop

Drive a procedurally generated closed-loop canyon track for a fixed number of laps (3), racing and fighting exactly **5 rival vehicles** doing the same loop. A run ends one of two ways: the player's vehicle is destroyed (game over), or the player completes the lap count (finish screen, ranked by finishing order against the rivals) — either way, the player then restarts, generating a fresh track. See Track & race below for the lap/rival model, and Enemies for what the 5 rivals are.

## Vehicle handling

Free 2D movement, Micro-Machines-style: steering turns the car's heading rather than shifting it sideways on a fixed lane, and the car's actual position/orientation move freely around the track rather than being pinned to a fixed screen row while the world scrolls past.

- **W** (or Up) — accelerate forward
- **S** (or Down) — brake while moving forward; once stopped or moving backward, accelerates in reverse
- **A / D** (or Left/Right) — steer left / right (turns the car's heading; reversing flips the turn direction, the same as backing up a real car)
- **1 / 2 / 3** — select equipped weapon (see Weapons)
- **Space** (or click, for the turret — see below) — fire selected weapon
- **Shift** — handbrake/drift: sharper turning than steering alone, at the cost of speed and weapon stability, while held and steering above a minimum speed — and lets the car's actual direction of travel lag behind its heading for a beat (a slide), rather than snapping instantly the way a non-drifting turn does

Handling notes:

- Vehicle has acceleration, top speed, and turning rate (deg/sec). Steering authority scales with speed rather than being constant: sluggish at low speed, sharpest at top speed (a linear ramp between a min and max turn rate, keyed off current speed as a fraction of top speed).
- Braking, turning, and off-road driving don't just affect movement — they also destabilize certain weapons (see Weapons), so handling and combat are coupled, not separate systems.
- Drifting carries its own risk/reward: faster turning, but an ongoing speed drain while active, and it sharply increases turret/side-gun instability on top of whatever turning/off-road instability is already in effect.
- Going off the paved road costs both speed (extra drag) and health (a steady drain per second) rather than simply blocking movement. Driving over a rough-terrain or oil-slick patch costs neither — see Road & hazards for those.
- Colliding with an enemy vehicle never costs the player health directly — it jolts the player's current speed, scaled by how fast the two were closing on each other at the moment of impact (a fast catch-up from a chaser jolts you harder than barely clipping a slow one). Being rammed from behind lurches you forward; being clipped from the side knocks you back — either way it registers even from a standstill, not just as a dent in existing speed. That same impact also damages the *enemy*, scaled the same way — a hard, fast ram can one-shot a weak car outright, but a glancing one just dents its health pool like a weapon hit would, and a brief per-enemy cooldown after each ram stops one continuous overlap from re-damaging it every frame before physics can separate the two cars. Contact is physical, not just a number changing in the background — a car that survives a ram visibly bounces off rather than gliding through the player's position. See Game over & restart for when a run actually ends — only hazards, enemy gunfire, and off-road driving cost the player health, not ramming itself.
- **Landing a hit also costs the victim speed, briefly.** Enemy top speed is set roughly at parity with the player's own (see Enemies below) rather than categorically faster or slower, so a chase is decided by combat and obstacles, not a built-in speed edge: a weapon hit or ram-damage hit that doesn't kill outright knocks the victim's current speed down and caps their top speed for a short window afterward — whoever lands the hit pulls ahead because the other car *actually slowed down*, not because of an inherent rate difference. This applies symmetrically: a player who gets shot is slowed the same way an enemy who gets shot is.

*Future possibility: nitro/boost (a player-triggered speed ability) — still undecided. Distinct from the speed-boost pickup under Pickups, which is a temporary buff from a dropped item, not an on-demand ability.*

## Weapons

The player has **three weapons for a run**, bound to keys **1**, **2** and **3**, all equipped from the start of every run (no loadout selection or partial-roster pickup). Each weapon has its own aiming mechanic, so switching weapons changes how you play, not just what damage you deal:

- **Rocket launcher** — always fires straight ahead along the road, regardless of speed, steering, or terrain; limited ammo (6), highest single-target damage, longest cooldown between shots. Fired with Space. Big, slow, bright-orange projectile. Unlike the other two weapons, it has no instability mechanic of its own — dead-ahead is the whole point of equipping it.
- **Side guns** — twin barrels mounted on the left and right sides of the car (not the front), aiming *outward* to each side rather than forward, within a moderate arc (not swinging all the way back toward the rear); both fire together on a single trigger pull. Aim is controlled by one shared meter that auto-sweeps back and forth; pressing Space locks in a shot at the meter's current position, deflected symmetrically from each side's outward-facing neutral aim toward the front at the meter's extremes — the in-world meter is mirrored on both sides of the car (two arcs curving outward from it) so the timing cue reads the same regardless of which side you're tracking. Steering pushes the meter around with extra jitter, making it harder to time a clean shot while maneuvering hard. Pale-yellow projectiles (one ammo consumed fires both).
- **Turret machine gun** — aimed directly with the mouse/pointer, very high ammo pool, low damage per hit, short cooldown; fired by clicking (not Space, since Space is the other two weapons' fire key). A crosshair follows the pointer so it's clear exactly where a shot will land, separate from the spread-cone meter ahead of the car. Accuracy spread widens with steering, while off-road, and sharply while drifting — it rewards driving smoothly rather than aggressively while it's equipped. Small, fast, cyan tracer.

Each weapon's projectile has a distinct size and tint (see above) so the three are identifiable at a glance mid-fight, not just by the HUD's weapon-name readout. The currently-equipped weapon's aim state also gets a small graphical meter floating just ahead of the player's car along its current heading — twin dots sweeping outward arcs for the side guns' aim angle, a widening/narrowing cone (plus the pointer crosshair) for the turret's spread. The rocket has no in-world meter (dead-ahead-only firing has no aim state to show); its reload progress instead shows as a bar inline with its ammo count in the weapon sidebar (see HUD below), the same place all three weapons' reload/readiness state lives alongside the numeric HUD readout in the corner.

Beyond each weapon's own aiming quirk, **the side guns and turret get shakier together at higher speed and while driving over rough terrain** — the side-gun sweep gets extra jitter on top of the steering-triggered kind, and the turret's spread cone widens further — representing the car itself jolting the driver/turret around, not a per-weapon cause. This stacks with (doesn't replace) each weapon's existing instability triggers (steering, off-road, drift). The rocket is exempt — it stays dead-ahead no matter what.

Common rules across weapons:

- Enemies have a health value and are destroyed at zero, whether by weapon fire or by ramming them; destroying one has a chance to drop a pickup (health, ammo, or a boost — see Pickups). A destroyed rival also adds to the placeholder distance/score number — see Scoring & progression.
- The player's own vehicle has health/armor; enemy weapon hits, off-road driving, and hazards reduce it. Ramming an enemy vehicle does not — see Vehicle handling above.

The three weapon types above are the full roster for now — no additional weapon types to design or build yet.

## Enemies

Distinct archetypes give the player different problems to solve, not just more of the same car. All four are implemented and all are available from the start of every race — see Track & race below for how the 5 rival slots are filled, since there's no more distance-gated unlock (that only made sense for an endless spawn pool, not a fixed roster). **No archetype approaches from the side any more** — the road's shoulder is now occupied by the rocky canyon walls (see Road & hazards), so every rival closes or falls back along the same ahead/behind axis as the player, never merging in from the left/right edge:

- **Chaser** — roughly at parity with the player's own top speed (just a hair faster), steering toward the player's actual position to catch up and ram once close; lowest health of the four, though still enough to usually take more than one hit. With speed at parity, outrunning one for good comes down to combat (a landed hit slows it — see Vehicle handling) rather than just holding the throttle down; it'll still catch a player who's coasting or braking.
- **Shooter** — slower than baseline so it tends to drift back rather than pulling away. Steers away slightly when the player gets too close instead of holding its line, and fires projectiles on a cooldown, but only while the player is within its firing range — it won't waste shots toward a player that's too far down the track to realistically hit.
- **Heavy** — slow and steers only sluggishly, with almost no traffic-avoidance instinct — it can't really dodge — but has by far the most health; expensive to kill, trivial to outrun.
- **Bomber** — a little faster than Chaser (the only archetype that can out-leg a flat-out player by a small margin), aggressively steering toward the player; its higher closing speed means a bigger speed-knock on contact than Chaser's, with an explosion sound/fx to match. Still has the least health of the four — a hard ram or one or two weapon hits will usually finish it — but no longer a guaranteed one-hit kill from any contact.

Every rival is a real car with its own position on the loop, not a screen-relative gap the way the old endless-runner model tracked it — racing the same track as the player, AI included, rather than approaching from off-screen. A rival's own pace (archetype speed, slowed further around sharp bends so it doesn't run itself into a wall — see Enemy "AI" and traffic below) is independent of the player's; falling behind or pulling ahead doesn't despawn it, since it's just racing the loop on its own line until it catches back up or gets caught (see Track & race).

### Enemy "AI" and traffic

The road is meant to feel like other cars are driving it, not like a swarm spawning at the player:

- **Exactly 5 rivals, ever** — a handful of readable opponents to learn, not a wall of traffic or an unbounded spawn pool.
- **Every archetype follows the track first.** Each rival aims at a point some distance ahead of it on the centerline as its baseline steering target — the same "stay on the road" job the player has to do manually — slowing down for sharp upcoming bends. Archetype personality (chasing, keeping distance, traffic avoidance) blends into that baseline rather than replacing it, so even an aggressive Chaser is still racing the loop, not just beelining at the player regardless of what's in front of it.
- **Steering has inertia**, via the same kind of turn-rate cap the player's own steering uses (each archetype has its own, see Vehicle handling) rather than an instant snap — lane changes and avoidance swerves look like a car easing into a turn, not a script teleporting sideways.
- **Enemies physically collide with each other**, not just with the player — two cars that end up in the same space push off each other. Each archetype also tries to steer around whichever other enemy is currently closest, but how *hard* it tries depends on temperament: aggressive, ramming archetypes (Chaser, Bomber) only weakly avoid traffic, since plowing through another car on the way to the player is an acceptable cost to them; Shooter tries much harder to dodge, since it has no reason to want a collision. Heavy barely avoids at all, consistent with it "can't really dodge" above.
- Contact with the player is also physical, not a same-position pass-through — a car that survives a ram briefly backs off (moving directly away from the player, rather than its normal AI) rather than immediately chasing right back into the player, so the bounce-apart reads as reliable rather than hit-or-miss.

## Track & race

The track is a **procedurally generated closed loop** — a winding canyon that twists around and joins back up with itself — generated fresh at the start of every race, not an infinite straight road. The race is won by completing a **fixed number of laps (3)** of the loop, ranked by finishing order against exactly **5 rival cars** (one of each archetype, plus one repeat, picked at random when the race starts) rather than an endless stream of spawned traffic.

- Every rival is positioned in real 2D world space from the start (a small grid just behind the player's own starting line) and stays active for the whole race — there's no more on/off-screen activation or a 1D "ahead/behind" gap the way the old straight-road model tracked it. Each navigates the track's curves while still pursuing its own archetype behavior (chasing, keeping distance, etc.) against the player.
- Destroying a rival (by weapon fire or by ramming) removes it **permanently** — that rival is gone for the rest of the race, not respawned, so a fight won early pays off for the whole run.
- **Rubber-banding:** a rival that's pulled clearly ahead of the player (in total race progress — laps plus how far around the current lap) occasionally goes through a brief slower patch, at random — enough that a player driving well (avoiding walls, landing hits, not braking unnecessarily) has a real chance to close the gap and catch up, without making the race trivial for a player who isn't keeping up. This never affects a rival that's behind or only slightly ahead.
- Live finishing position (current place out of 6) is tracked continuously by total race progress — shown via a prominent HUD readout (see HUD below).
- The start/finish point on the loop (where lap counting rolls over) is marked with a painted checkered line across the road, visible every time a car passes it.
- A **minimap** shows the whole loop and the live positions of every car on it, since the track is too large to see in full from the main following camera. *(Not yet implemented.)*

## Road & hazards

- The paved road is a constant width along the whole loop; off-road driving is penalized (slowed via drag, damaged via a steady health drain) rather than simply blocked.
- **Rocky canyon walls** flank the road just off its paved edges, at a distance that meanders along the length of the loop rather than staying fixed — sometimes a wide shoulder, sometimes a tight squeeze. The walls are a hard boundary: a car (player or rival) pushed into one can't drive through it. Drag is continuous for as long as contact lasts (steeper than plain off-road), but health damage is a one-time hit on the frame contact begins, scaled by how fast the car was going at that instant — scraping along a wall while steering back onto the road doesn't keep costing health, only the initial impact does. No enemy archetype approaches from the side any more (see Enemies) — everything closes or falls back along the same ahead/behind axis as the player, now measured along the loop rather than straight up the screen.
- Terrain hazards are placed around the loop alongside the rivals — irregular patches of road surface the player (and rivals) drive *over*, not solid objects that get "used up" on contact. A patch keeps affecting whoever's on it every frame, and isn't removed by that contact. Neither type costs health; they affect handling instead, for both the player and rivals alike.
  - **Rough/broken road** — extra drag while driving over it, bleeding off speed similar to (but distinct from) off-road drag. Enemies slow their approach the same way while crossing one.
  - **Oil slick** — steering authority is reduced, and the car gets pushed sideways for the duration regardless of steering input — a sustained slide in one direction (rolled once on contact), not a vibration, since that's what actually reads as "losing traction" rather than the car just shaking in place. Strong enough that holding straight ahead with no steering input at all can still carry the car off the road if unaddressed. The effect lingers briefly after leaving the patch rather than ending the instant the car clears it. Enemies get the same loss-of-control push while affected.

*Future possibility: Setting-driven hazards (weather, low visibility, night driving) to reinforce the dystopian theme — still not implemented, distinct from the rough-terrain/oil-slick hazards above.*

## Pickups

Enemies have a chance to drop a pickup on destruction (by any means — weapon or ram). Once dropped, a pickup sits at that point on the loop and is collected on contact:

- **Health/repair** — restores a flat amount of health.
- **Ammo** — refills one of the three weapons' ammo, picked at random per drop (each weapon has its own restore amount); there's no way to target a specific weapon with a drop. Stands in for "weapon unlock" from the original spec wording, which doesn't apply now that all three weapons are always equipped.
- **Boost** — a single pickup type that grants one of two temporary effects at random: a score multiplier for a few seconds, or a temporary top-speed increase for a few seconds.

Independent of kills, a standalone health-or-ammo crate also spawns down the road on its own infrequent timer (no boosts from this source — boosts stay a kill-drop flavor bonus) — a small trickle of supply so a run isn't entirely dependent on landing kills, without being frequent enough to be a reliable refill loop.

## Scoring & progression

The eventual model is finishing order + lap time, replacing distance/kill scoring (see Status at the top of this doc; lands in a later phase). Until then, the current build keeps the legacy distance-based numbers as a placeholder:

- A "distance traveled" number accrues while actually moving forward (not while braking/reversing) — purely a placeholder HUD readout for now, not a win condition.
- Every run is a fresh start — no meta-progression (unlocks, persistent upgrades) between runs. The one persistent thing across runs is a best-distance high score (see Game over & restart) — a record kept for the player to chase, not a gameplay-affecting unlock. This will become a best-lap/race-time record once laps land.

## Game over & restart

A run ends one of two ways:

- Player health reaches zero — from canyon walls, off-road driving, ramming, or enemy fire — → vehicle destroyed → **game over** screen.
- The player completes the lap count (`TRACK.lapsToWin`, 3) → **finish/win** screen, distinct from game over (different title, no destroyed-vehicle tint) but otherwise the same flow. Finishing order/place isn't shown on this screen yet — see HUD below for the in-race position readout.

Either way, the screen shows the final distance → restart (Space or tap), generating a fresh track. It also shows the best distance reached across all previous runs of either outcome (persisted locally in the browser, not server-side) and flags it explicitly when the just-finished run set a new one.

## HUD

Health, current best distance, equipped weapon and its state (ammo count, plus a cooldown/sweep-angle/spread readout depending on the weapon), speed, and score/distance — all shown as text in the top-left corner (this text HUD is a known placeholder — a later phase replaces health/distance/speed/aim-angle text with something less debug-y). There's also a small graphical meter floating just ahead of the player's car along its current heading, showing the sweep angle (side guns) or spread cone + pointer crosshair (turret) — it now turns with the car instead of staying pinned above a fixed-orientation sprite. The rocket has no in-world meter of its own any more, since dead-ahead-only firing has no aim state worth showing there — its reload progress lives in the sidebar instead (see below). A small graphical health bar floats below the player's car (and above every active rival car), color-coded (green for the player, red for rivals) and proportional to remaining health — a glanceable supplement to the numeric health readout. The player's bar specifically sits below rather than above so it doesn't compete for the same space as the weapon meter.

A bold, gold, top-right readout shows finishing position and current lap on two lines (e.g. "3rd/6" over "Lap 2/3") — ordinal-formatted position over the loop's win condition, sized and styled to read at a glance during a race rather than as a debug aside.

A minimap showing the whole loop and every car's live position is planned for a later phase (see Track & race) — not implemented yet.

A persistent sidebar pinned to the bottom-right corner of the screen lists all three weapons at once — number key, a color swatch matching that weapon's projectile tint, name, current ammo, and a reload/readiness bar inline with the ammo count (the cooldown-remaining-vs-fire-cooldown ratio, the same value the rocket's old in-world bar showed) — with the equipped weapon's row highlighted. This is meant to make the full roster, its current state, and how to switch between them visible at a glance in one place, rather than split between the corner text and an in-world meter.

## First-run intro screen

Before the first run of a session, a dedicated screen explains the controls (movement, drift, weapon-select keys, fire/aim for each weapon) and the headline tactic ("landing a hit slows them down, getting hit slows you down"), with a pulsing "Press SPACE or tap to start" prompt. This is shown once per page load, not on every restart — dying and restarting (Space/tap on the game-over screen) goes straight back into a new run without re-explaining controls, since by then the player already knows them.

## Art & audio direction

No longer purely procedural — loaded CC0 assets are now allowed (see CLAUDE.md) and used for the highest-impact visuals: cars, projectiles, pickups, and explosion fx are all sourced art (see `CREDITS.md`), tinted at runtime to fit a desaturated wasteland palette. Cars render at 60% of the source art's processed size, leaving more visible road and reaction room on the fixed-size canvas. The road/ground stay procedurally generated and deliberately recolored (dark cracked asphalt, dead-ground margins, dirty-yellow lane markings) rather than using the brighter sourced road tiles that were available, specifically to avoid a style clash with the gritty cars — see high-level-design.md's Rendering & assets section for the reasoning. Terrain hazards (rough road, oil slicks) are also procedural, for the same reason plus the lack of any sourced art shaped like a ground-level patch rather than a discrete object.

Audio is now loaded too (collision, explosion, rocket, gunfire, pickup, game-over), replacing the earlier Web Audio synthesis. There's still no continuous engine hum; only discrete one-shot sound effects, since a looped engine sound is a meaningfully different feature (loop start/stop tied to speed) and wasn't pursued in this pass.
