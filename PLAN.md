# Downhill MTB 3D: gameplay plan

The goal is more line choice, swipe tricks, bigger features, and Rampage-style slow-downs before big drops. The game stays endless and arcade-style. There's no weather or wind, and the existing controls keep working as they do now.

Line numbers refer to `Downhill MTB 3D.html` as of commit `c1efd23`. All changes are in the game script (lines 59–3052). The bundled LittleJS engine is not touched.

---

## Design summary

| Area | Today | After |
|---|---|---|
| Lines | One optional two-way fork about every 400 m | **Line blocks** every 150–300 m, each offering 2–4 lines (PRO, HIGH, MAIN, LOW), each with its own features |
| Tricks | Hold to flip; second-finger tap cycles 4 style tricks | Same, plus **swipe in the air**: 8 directions, 8 tricks, combinable with flips |
| Pace | Speed always kept between 9.5 and 22 m/s | **Pace zones**: the rider slows automatically before big drop-ins, then gravity takes over |
| Features | Kickers, cliffs, gaps, rocks, rails, bridges, creeks, whoops, arches | Plus **big drop-ins**, step-downs, drop stairs, canyon gaps, wooden drop decks, ridge spines, chutes, **berm curves** |

### Controls (existing ones unchanged)

| Input | On the ground | In the air |
|---|---|---|
| Tap | Jump | — |
| Hold | — | Backflip |
| Second finger hold | — | Front flip |
| Second finger tap | (jump) | Style trick (as now) |
| **Swipe up/down** | **Change target line**, one step per swipe, near a line block | **Trick** (see table below) |
| **Swipe any other direction** | Ignored | **Trick** |
| Keyboard | Space jumps; Up/Down change line near a block | **I J K L** for up/back/down/forward, **U O N ,** for the diagonals (M stays mute) |

### Swipe tricks (proposed mapping, all values to be tuned)

| Swipe | Trick | Duration | Points | Animation |
|---|---|---|---|---|
| ↑ | NO-HANDER | .7 s | 300 | Existing pose |
| ↓ | TABLETOP | .7 s | 400 | Bike and rider roll flat, about 70°, about the bike's long axis |
| ← (back) | TAILWHIP | .6 s | 550 | Frame spins 360° about the steerer; rider holds the bars, feet off the pedals |
| → (forward) | SUPERMAN | .9 s | 450 | Existing pose |
| ↖ | HEEL CLICKER | .7 s | 400 | Existing pose |
| ↗ | BARSPIN | .45 s | 350 | Bars and stem spin 360°; hands let go and catch |
| ↘ | CAN-CAN | .8 s | 350 | Existing pose |
| ↙ | 360 | .8 s | 600 | Whole bike and rider yaw 360° |

**Scoring rules:**
- A different trick in the same air is worth progressively more (×1.25 each). Repeating a trick in one combo halves its value.
- A swipe trick done during a flip gets a combined name and a ×1.5 bonus: FLIP WHIP, SUPERMAN FLIP, 360 BACKFLIP, and so on.
- One swipe can be queued while a trick is still running.
- **Landing tiers, more forgiving than today's all-or-nothing:** a trick at least 80% complete counts. Between 40% and 80% it shows SKETCHY and scores nothing, but you ride on. Under 40% is a crash (e.g. "TANGLED IN THE WHIP"). The 80% and 40% values are to be tuned.

---

## Phase 0: Test harness (small, do first)

A headless test is needed early because later phases change track generation. A crash that can't be avoided would otherwise only show up in play.

- Add `tools/sim.mjs`, a Playwright script using the preinstalled Chromium. It loads the HTML with `?seed=N`, turns on `__mtb.autopilot` and runs `__mtb.sim()`. It reports distance, crash reasons (`window.__lastCrash`), tricks, lines taken and average speed across, for example, 20 seeds × 5 km.
- Add `tools/shot.mjs` to take screenshots at chosen distances, views and times of day, for visual checks.
- Record a **baseline** from the current game: crash rate per km by reason. Later phases must not make it worse.

## Phase 1: Swipe tricks

This phase is self-contained, so it's a quick win and testable on its own.

1. **Gesture recognizer** in the pointer handlers (2446–2492). Track every pointer while in the air, not only near a fork.
   - A finger that moves more than about 28 px within 250 ms is a **swipe**. Its direction picks one of 8 sectors of 45° each. Swipes have no extra speed requirement.
   - **Hold vs. swipe:** in the air, a new press waits up to 90 ms, or until the finger moves about 12 px, before it counts as a hold. Only then does the backflip start. This way a swipe never twitches a flip. `pressInAir` and `airControl` (1399) change to use this.
   - Swipes on the ground go to the line picker (Phase 4). Until then they are ignored.
2. **Trick table:** extend `STYLES` (1325) into `TRICKS` with name, duration, points, pose and spin type. A second-finger tap still throws the next style trick as it does now.
3. **Animation:** split the shared matrix in `RiderView.render3D` (1845) so the bike and the rider can move separately:
   - Tailwhip: the bike matrix turns about the steerer axis.
   - Barspin: the bars and stem turn inside `drawBike` (1693).
   - 360: an extra yaw on both.
   - Tabletop: a roll on both.
   - New poses go in `drawRider` (1764): feet off the pedals for a tailwhip, hands off the bars for a barspin.
4. **Scoring:** `scoreAir` (1503) and `land` (1457) get the variety bonus, the repeat penalty, flip+trick names and the landing tiers above.
5. **Feedback:**
   - A fading swipe trail drawn on the HUD canvas.
   - The trick name pops up as it starts (green), then scores on landing.
   - A short sound per trick family, using ZzFX variations of `whoosh`.
6. **Keyboard:** I/J/K/L and U/O/M/, act as swipes while in the air.
7. **Help text:** update the title screen (2748) and the tutorial hints (2656). Add "SWIPE IN THE AIR FOR TRICKS".
8. **Autopilot:** throws random swipes on long flights, so tests cover the trick landing rules.

**Done when:**
- Every trick can be triggered by touch and by keyboard.
- No accidental backflips from swipes.
- The autopilot completes 20 seeds with tricks on and no crash reasons beyond the baseline, apart from intended under-rotated tricks.

## Phase 2: Pace zones and big drop-ins

This is the Rampage slow-down: roll up to the edge, check speed, drop in, throw tricks.

1. **Speed floor varies along the track.** Replace the fixed `VMIN` floor in `stepGround` (1349), `land` (1468), `jumpNow` (1376) and `startGrind` (1529) with `vMinAt(x)`. Features register **pace zones** `{x0, x1, vTarget}`. Inside a zone the floor drops, and an automatic brake eases speed toward `vTarget`. Outside zones the floor is 9.5 as now.
   - The rider is shown braking and a little dust comes off the rear wheel.
   - Turbo is paused in a brake zone, with the message TURBO HELD. This keeps flights within what the landing is built for.
2. **New feature `addDropIn(d)`**, a generator building block next to `addCliff` (325):
   - A flat, slightly downhill **ledge** (grade about .05, 25–40 m) with a pace zone easing to about 5 m/s.
   - A **lip** with a "SEND IT" sign, then a sheer drop of **10–25 m** (getting bigger with distance).
   - A long **steep landing** (grade .9–1.1, 25–40 m) that blends into a run-out where speed builds again.
   - **Tap at the lip** for a bigger pop and a SEND IT bonus. If you don't tap, the rider rolls off anyway (arcade, never stuck).
   - Physics check: rolling off at 5 m/s from 20 m gives about 1.7 s of air, about 9 m of horizontal travel, and a landing impact of about 13 on a 45° landing (under the 22 hard-landing threshold). That's room for 2–3 swipe tricks or a double flip.
   - The camera pulls back over the drop. `airZoom` in `gameUpdatePost` (2116) starts early when the rider enters a drop-in zone.
   - **Option:** brief slow motion, about 0.6× for the first 0.5 s off the lip. Proposed off by default; your call.
3. **More drop and gap types**, all with generous landings as now:
   - **Step-down:** a kicker onto a long landing 3–6 m lower, with no chasm.
   - **Drop stairs:** 3–4 ledges of 1.5–3 m in a row, each one droppable or hoppable. Points for a clean RHYTHM DROP.
   - **Canyon gap:** a rare big gap with a pace zone before it sized for its own speed. `addGap`'s clearance check (341) uses the zone speed instead of `VMIN`.
   - **Wooden drop deck:** a raised plank runway ending in a drop, built like `makeBridge` (1078). This echoes the wooden features organizers have built at Rampage.
4. **Generator mix:** add these to `genSection` (567) with weights that depend on distance, so the first kilometre stays gentle. Big drop-ins appear about every 600–900 m. All of them respect `launchReach` (428), so nothing lands in a hazard.
5. **New tricks scored:** DROP-IN with height-based points (the existing `DROP` trick is reused for cliffs), SEND IT, and STEP-DOWN.

**Done when:**
- The autopilot clears every drop-in on 20 seeds with no new crash reasons.
- Average speed shows the intended slow-fast rhythm.
- Screenshots show a readable ledge, lip and landing from all four camera views.

## Phase 3: Curves and berms on the main trail

1. **Berm turns:** a new feature `addBermTurns(d)` registers S-curve offsets that are added to `weaveZ` (156), e.g. ±6–10 m over 25–40 m. The whole world near the trail bends, as with the existing weave, so the camera and scenery follow automatically. Curves are generated before chunks are built, since generation runs 680 m ahead and chunk building 400 m ahead.
2. **Banking:** `rowY` 'trail' and 'edge' rows (742) raise the outside of a turn in proportion to how sharply it bends (`wzK`). This reuses the berm idea from `bermAt`/`bermLift` (1047). The rider already leans with `wzK` (2055); the lean is increased to match.
3. **Scoring and feel:** BERM points (reusing the trick) when you carve a turn on the ground, plus a small speed boost on exit (PUMP), so curves feel good rather than slow. Big spray as on branch berms (2289).
4. Rocks, rails and gaps are not placed inside a curve. A flat, open curve before a drop-in is encouraged, for the Rampage feel.

**Done when:** curves read clearly in SIDE, 3/4 and CHASE views; no ground folds over itself (the `weaveK` falloff still holds); and the frame rate is unchanged.

## Phase 4: Multiple lines (the big one)

1. **Lines as a first-class concept.** Today a branch (`buildBranch`, 513) has only a height profile, and rocks, rails, gaps and features exist only on the main trail. Collision code skips them when `onBranch` is true (1444, 1451, 1561, 2381). The change:
   - Every rock, rail, gap, feature, orb and pace zone gets a `line` field (`null` for the main trail).
   - Physics checks filter by the rider's current line (`ride`).
   - Rendering places objects at the line's height and z position, using `brY`/`brZ`.
2. **Line blocks replace forks.** `openFork`/`closeFork` (492–512) become `openBlock`/`closeBlock`.
   - A block is 150–300 m long and starts after 30–80 m of main-trail-only riding.
   - It offers MAIN plus 1–3 of the following:

     | Line | Lane z | Character |
     |---|---|---|
     | **PRO** | −20 | Ridge traverse, slow and exposed: flatter, pace zone, spine. Ends in a **big drop-in** or canyon gap. Most points. Unlocked after 500 m. |
     | **HIGH** | −10 | Rollers, step-downs, a wooden drop deck, rails |
     | **LOW** | +9 | Steep fast chute, kickers, gap jumps, whoops |
3. **Line generator:** each line's height is built as main-trail smoothed height (`wideY`) **plus an offset profile**. Flatter stretches raise the offset; drops and chutes lower it. Rules:
   - The offset starts and ends at 0, so every line merges back cleanly.
   - The line's own grade never goes uphill (at least .05).
   - Features on a line are the same building blocks as Phases 2–3, written once against a small generator cursor `{ys, gapF, base, grade}` instead of the globals in `addRun`/`addKicker` (288–322). This part is a refactor of those functions, which the main trail then uses too.
4. **Ground mesh:**
   - Add `ROWS` (707) near z −20 (about −17 to −23) and +18, so lines can be cut into the hillside.
   - `carve` (717) learns to cut a chasm under a line's gap, and a cliff face under a line's drop. A PRO line well above the hillside naturally becomes a ridge spine.
   - `clearOf` (871) generalizes to any lane.
   - Expect about 20% more ground vertices. Check the frame rate on the quality ladder (2334).
5. **Choosing a line:**
   - Within about 70 m of a block, **swipe up/down on the ground** moves the target one step (PRO ↔ HIGH ↔ MAIN ↔ LOW, skipping lines not offered). Keyboard Up/Down does the same.
   - At the split the rider berms onto the target.
   - The tap-delay trick for telling a swipe from a jump (`swipeP`, 2436) only applies inside that window, as now.
6. **HUD:** `drawForkPrompt` (2702) becomes a **line ladder**: one pill per offered line, each with icons for what's on it (drop, gap, rail, speed) and the points for finishing it. The target is highlighted.
7. **Scoring:** PRO LINE 600, HIGH LINE / LOW LINE 300, plus an ALL LINES bonus the first time a run has ridden every line type. The results card gets "Pro lines".
8. **Camera:** check framing at z −20 for each view. `camZ` easing (2139) may need a wider follow.
9. **Autopilot:** `__lanePilot` (2985) learns the 4 lanes, so tests can force each line.

**Done when:**
- 20 seeds × 5 km per lane setting (up, down, main, pro, random) with no crash reasons that aren't the rider's fault.
- Lines visibly separate and merge without ground artifacts.
- Frame rate stays at quality level 3 on a desktop headless run, compared against the baseline.

## Phase 5: Tuning and polish

- Balance trick points against distance and orbs. Combo ×10 cap and battery charge rate (`charge`, 1310).
- Difficulty ramp: drop height, gap width and how often PRO lines appear, by distance.
- Sounds for new features: lip creak and brake squeal at drop-ins, deck rumble on wood (reuse `S_WOOD`).
- Results card: best trick of the run, lines ridden. Save best combo alongside best distance and score.
- Clean up dead code found earlier: `updateMid`/`updateFar` stubs, `midChunks`.

---

## Order and reasoning

Tricks first (Phase 1): they're independent and the most immediately fun. Then drop-ins and pace (Phase 2) and curves (Phase 3) on the main trail, where they're easy to test. Then multiple lines (Phase 4), which reuse those features on each line. Phase 4 is the largest and riskiest refactor, so it builds on pieces that already work.

Each phase is a separate commit (or a few), tested with the Phase 0 harness before pushing.

## Decisions

1. **8 swipe directions.**
2. **No slow motion** off drop-in lips.
3. **Drop-in lips roll off automatically**; a tap at the lip gives a SEND IT pop and bonus.
4. **eBike turbo stays as it is** (held only in brake zones).
5. **Trick table as proposed.**

## Progress

- **Phase 0: done.** `tools/sim.mjs` (headless autopilot rides) and `tools/shot.mjs` (screenshots).
  Baseline: 0 crashes over 101 km (20 seeds × 5 km) with no flips, with backflips and with front flips.
- **Phase 1: done.** Swipe tricks, landing tiers, scoring, animations, HUD, keyboard, help text, autopilot.
  0 crashes over 101 km in each of: tricks, tricks + backflips, tricks + front flips. Changes from the plan, found in testing:
  - A trick starts only once the bike has been in the air for 0.1 s. A swipe on the ground waits 0.3 s for the takeoff. A trick that hasn't got going on a hop under 0.4 s is quietly dropped. Without these, a swipe during a crest hop too small to see would crash the rider at once.
  - A swipe on the ground (away from a fork) still jumps, as any press does, so a ground flick works as "jump and trick".

- **Feedback round 1: done.**
  - *Fork choice by swipe was broken.* At a fork, up/down only picked the line while the bike was touching the ground. The approach usually includes jumps and crest hops, so most swipes became tricks. Now, within the fork window, up/down always picks the line, in the air too. Other directions still throw tricks. The line choice leaves an arrow in the line's colour.
  - *Bigger jumps.*
    - New **big kicker**: a 2.2–3 m ramp onto a long steep landing (grade .55–.75) laid along the flight of a fast rider. Every speed lands on the slope. Air time is about 1.5–3 s. One every 150–340 m, the first at about 200 m.
    - The larger regular kickers now get their own landing (grade .42–.5) too.
    - Rock sections start 14 m in, so a crest before them can't throw the bike into a rock.
    - Air time per km, before → after (no flips):

      | Flight length | Before | After |
      |---|---|---|
      | 1.5–2 s | 1.6 | 0.8 |
      | 2–2.5 s | 1.7 | 1.4 |
      | 2.5 s or more | 0.2 | 2.0 |

      Time in flights of 1.5 s or longer: about 7 → 10 s per km. Hard landings: 0.58 → 0.35 per km. Crashes: 0 in every mode.

- **Feedback round 2: done.** *Tricks while holding a flip.* A flick used to count as "not holding", so the flip stopped, and a touch could only flick once, within 0.26 s of going down.
  - A finger can now flick at any time it's down, and the flip carries on under it.
  - It can flick again once it has slowed (under 120 px/s), paused, or turned back. A single long swipe is still one trick.
  - A flick before the hold has started a flip delays the flip instead of cancelling it.
  - Same for the second finger and front flips. At a fork, up/down flicks still pick the line.
  - Checked with real pointer events: hold + flick, a second flick after a pause, a long swipe, flick-then-hold, flick-and-lift, slow drift, zig-zag.

- **Feedback round 3: built, partly re-tested.**
  - *Day and night.* The time of day used to carry over from run to run, so a later run could start in the dark. Every run now starts in the morning, and night can't begin before 60 s of riding. Measured: dusk at about 106 s, night at about 136 s.
  - *Seasons.* Longer zones: the first 1000–1500 m, later ones 1500–2600 m. Snowfields never start before 2080 m (about 90 s); the earliest over 400 seeds was 2.7 km. Alpine night snowfall waits until 90 s too.
  - *Phase 2 drop-ins:*
    - A banked bend onto a 34 m ledge, where the rider skids to about 7 m/s and the turbo pauses.
    - A "SEND IT" sign and lip flags, then a 10–24 m sheer face onto a long landing (grade 1.0–1.15), with about 2 s of air.
    - A tap at the lip pops higher and scores SEND IT; otherwise the rider rolls off automatically. Scores DROP-IN by height.
    - About one per km.
    - From the ledge until after the landing, the camera comes in close and low from in front of the rider, then eases back.
  - *Banking:* every turn in the trail tilts, outside edge up.
  - *Testing:*
    - Standard suite: 0 crashes in no-flip, flips + tricks and turbo modes (about 100 km each), apart from one rock crash in one turbo run that didn't repeat. 60 new seeds with turbo (303 km): 0 crashes.
    - Not yet re-run after the last two small edits: smaller lip flags, and resetting the braking flag on takeoff.

- **Phase 2: done.** The drop-ins came in round 3; this round adds the rest.
  - **Step-down:** a small kicker off a ledge onto a landing 3–8 m lower.
  - **Drop stairs:** 3–4 ledges ridden at about 12 m/s, a 1.5–3 m drop off each. Scores DROP STAIRS ×n.
  - **Canyon gap:** the run-in sets the speed (a slow rider pedals up, a fast one brakes). The gap is sized so that speed clears it rolling. About 16 m wide, with a long landing for a popped lip. Uses the close camera, framed wider. Scores CANYON GAP.
  - **Drop deck:** a North Shore plank trestle out over a steepening slope. The rider rolls it like ground (not a grind), braking to about 11 m/s, then drops 8–14 m off the end. Scores SHORE and DECK DROP.
  - **Generator:** 28% of sections after 300 m are one of these: step-downs from 300 m, the rest from 500 m, canyons from 900 m and at most one per 700–1200 m. Together with drop-ins and big kickers, average speed is about 19 m/s, down from 21, with the slow-fast rhythm intended.
  - **Fairness fixes found in testing:**
    - A bike over the face of a down-step keeps falling to the ground below it instead of "landing" on the face.
    - Clipping the very edge of a step while moving forward carries on off it.
    - The bike never rides down a drop face or a chasm wall on the ground. At turbo speed it once rode down into a chasm, along its floor and up the far wall. It now flies off the edge, and riding into a wall is a crash.
  - **Testing:**
    - Every mode (no flips, flips + tricks both ways, turbo, turbo + flips), about 100 km each, plus extra seeded runs (well over 1500 km in all): 0 crashes after these fixes.
    - Touch-control tests (forks, flick while holding) still pass.
    - `sim.mjs --salt n` makes the autopilot's random choices repeatable, so a rare crash can be replayed.

- **Phase 3: done.**
  - Berm turns: three or four turns as one smooth wave (±6.5–10 m over 62–78 m per wave), banked on the outside.
  - A grounded carve through each turn (or a hop of under 0.3 s) scores BERM with a small speed pump. Carving all of them scores BERM RUN.
  - About one run of turns per km after 250 m.
- **Phase 4: done.**
  - **Line blocks:**
    - Every 40–100 m of main-trail-only riding, a block of 210–300 m opens.
    - It offers MAIN plus 1–3 of: **PRO** (z −20, from 500 m), **HIGH** (z −10), **LOW** (z +9).
    - About 70% of the trail is in a block.
  - **Line features:** a line is the main trail smoothed, plus an offset that starts and ends at 0. Flatter stretches raise the offset; drops and steep landings lower it. A final stretch brings it back, never uphill, using the downhill each metre has to spare.

    | Line | Features | Points |
    |---|---|---|
    | PRO | Slow ridge traverse onto a ledge (pace about 7 m/s), drop-in of 5–20 m, steep landing (grade set from the local fall) | 600 |
    | HIGH | Rollers, a steady 14–16 m/s, a kicker off a 3–5 m step-down | 300 |
    | LOW | Steep chute (grade .6), speed set to 15–17 m/s, kicker over a chasm sized to clear rolling | 300 |

    Riding all three kinds in a run scores ALL LINES +1000. If a line's features don't fit, they shrink, down to a plain line. About 96% of lines get theirs.
  - **Line-aware physics:** features, pace zones and chasms belong to a line and only apply while the rider is on it. That covers takeoff scoring, chasm crashes, the drop-in camera, warnings and the autopilot's lip pops.
  - **Ground:** seven more rows on the hillside around z −20, so the PRO line is cut into the ridge (about 21% more ground vertices). A worst-case frame (building a chunk) is about 7% slower. Lines' gaps are carved as slots, their drops as faces.
  - **Choosing:**
    - Within 80 m of a block, each flick up or down steps one line, skipping lines not offered. It works in the air too. Keyboard Up/Down do the same.
    - The old drag-from-touch-start lane rule was removed, because together with the flick it stepped twice.
    - A ladder HUD shows each offered line with what's on it and its points; the chosen one is lit.
    - The signpost shows an arrow and name per line.
  - **Results card:** adds "Pro lines".
  - **Changes from the plan:**
    - Drop-ins stay off the main trail inside a block, because a drop-in's face came through the smoothed lines beside it. Big kickers and the other set pieces do appear inside blocks.
    - The track is now laid out 950 m ahead (was 680), so a block's lines exist before its ground is built.
  - **Bugs found and fixed in testing:**
    - Line layouts failed where the main trail was flat or had a cliff.
    - A line's kicker followed a steep path and didn't rise.
    - The autopilot hopped main-trail rocks while on a line.
    - The run-in to a gap now sets the speed faster (25 m/s² down, 20 up).
  - **Testing:**
    - Each lane forced (pro, high, low, main, random), about 48 km each: 0 crashes. 61 LOW-line chasms cleared.
    - Full regression (flips + tricks both ways, turbo, all-up, turbo all-down; 500 km): 0 crashes.
    - Fork test with real pointer events: each result matches the lines on offer.

- **Phase 5: done.**
  - **Balance:** each trick now charges the battery by its points, capped at 2000 (up to 12.5%). Orbs charge less (0.5%, or 0.9% in the air) but score more (20, or 50 in the air).

    | Per km | Before | After |
    |---|---|---|
    | Turbos, trick-heavy riding | 2.8 | about 1.2 |
    | Turbos, plain riding | 1.7 | about 0.75 |

    Combos stay at ×10 max, averaging ×3 plain and ×5 trick-heavy. Score: about 22–25k per km plain, about 95–105k trick-heavy.
  - **Difficulty ramp:** PRO lines go from 40% to 75% of blocks over 6 km. Set pieces go from 24% to 36% of sections. Drop, gap and step sizes already grew with distance.
  - **Sounds:**
    - SEND IT pop; a spray on each carved berm; a chime on finishing a line.
    - A skid (the grit loop, brighter and louder) while braking on a ledge or run-in.
    - A hollow, lower rumble on a wooden deck in place of the grind.
  - **Feedback:** taking a line shows its name and what's on it.
  - **Results card:**
    - Best single trick with its points, and lines including PRO ones.
    - Rows close up on short screens so the button never covers them.
    - The best combo is saved with the best distance and score, shown on the title and counted for NEW BEST.
  - **Title screen:** the help uses three columns on short landscape screens and spaces out to fill the room.
  - **Cleanup:** removed the unused mid/far layer stubs (`updateMid`, `updateFar`, `midChunks`, `farLayers`). Added test hooks: `wipe()` and the scoring figures in `info()`.
  - **Testing:**
    - 600 km over six modes (flips + tricks both ways, turbo + tricks, all-PRO, turbo all-LOW, plain): 0 crashes.
    - Fork and flick-while-holding tests pass. The second-finger style cycle checked directly.
    - Results card and title checked at 390×844, 844×390, 667×375 and 1280×800.
    - Sounds can't be heard in the headless tests; they ran without page errors.

- **Feedback round 4: done.** *The rider got lost behind the terrain on line step-downs, in SIDE and other views.*
  - **Cause:** lines up the hill (HIGH, PRO) could sink below the main trail after a step-down or drop-in landing, up to 16 m below at the PRO landing. The hillside and main trail then stood between the camera and the rider. In CHASE the camera also went inside the hill: its "not underground" check measured the line being ridden, not the ground under the camera.
  - **Lines:**
    - A line up the hill has a floor 1 m above the highest main trail nearby. The floor never rises going down the mountain, so the line still falls all the way. A drop-in onto it gets a shorter face, and the ladder shows the real height.
    - HIGH traverses flatter before its step-down, so it sits higher on the hillside.
    - The slope in front of the LOW line is cut to fall away from it, with no trees there.
  - **Camera:**
    - It never goes below the real ground under itself (`terrainAt`, matching the ground mesh).
    - It checks its line of sight to the bike's wheels against the terrain each frame and rises (up to 25 m) to see over anything in the way, quickly, settling back slowly.
    - Measured over 4 km: lifted 30% of the time in SIDE (mostly under 5 m, as banked turns raise the near edge), 19% in 3/4, 8% in CHASE, 7% in HIGH. Average movement 0.2–2.2 cm per frame, about 0.02 ms per frame.
  - **Checked:**
    - Screenshots of HIGH, LOW and PRO landings and airs in SIDE, 3/4 and CHASE: the rider is in view in all.
    - Lines with features: about 96% as before.
    - Regression over 500 km (pro, high, low lanes, plain, turbo): 0 crashes. Fork and flick tests pass.

- **Performance and smoothness: done.**
  - **Findings:**
    - It already used WebGL2 (LittleJS 3D plugin), with frustum culling and automatic instancing. Repeated draws of a mesh are batched by the engine, the rider's parts included, so batching the rider by hand gained nothing and was taken back out.
    - About 80–125 draws and 85k–235k triangles per frame: ground about half, trees and rocks 35–45%, shadows about a quarter.
    - Game logic about 0.1 ms per frame.
  - **The hitch:** each new 64 m stretch of ground took 15 ms on average, up to 51 ms, all in one frame, about every 3 s.
    - Values that only change along the trail are now worked out per column.
    - The lighting comes straight from the grid, using the neighbouring stretches' heights at each edge (the engine's generic smoothing was 45% of the cost).
    - The build runs as small steps, at most 3 ms of each frame. Nothing enters the scene until the last step.
    - The sky's day colours are recoloured in place every 12 frames instead of rebuilt every other frame.
    - **Result over three 3 km rides:** frames over 16 ms 5 → 0, over 8 ms 38–41 → 1–5, worst frame 19–22 → 9–10 ms. The few remaining spikes are garbage-collection pauses spread across small steps.
  - **The bike's shake:**
    - The body and rider now ride the ground smoothed over 2 m, kept within 6 cm of the real ground so lips and drops still read.
    - The wheels follow the real ground: the axles move, and the fork and swingarm with them.
    - The suspension springs are driven by the smoothed body and now extend in the air too.
    - **Result:** body-height buzz above 8 Hz 1.39 → 0.46 mm; pitch buzz 0.026° → 0.010°. Physics unchanged.
  - **Variable timestep:** the game steps once per screen frame by its real length (`setEngineVariableStep`), so it moves evenly on 90/120 Hz screens. The riding itself still runs in steps of at most 1/60 s, so a slow frame can't skip past a rock. 4 seeds × 3 km at 60, 120, 30 and uneven 40–110 fps: 0 crashes, flights and ride times alike.
  - **Quality step-down:** looks after 1.2 s, on the summit as well as riding, and drops two levels at once below 28 fps. Before, it took 3 s per level and only while riding.
  - **Not done:** thinning distant ground rows. Measured at about 7% of triangles, not worth the visual cost.
  - **Visuals:** side-by-side shots at the title, SIDE, CHASE, 3/4 and HIGH show the same quality. Pixel differences come from the camera following the smoothed body (a pixel's shift), not from shading.
  - **Regression:** 500 km over five modes and lanes: 0 crashes. Fork and flick tests pass.

- **Crash ragdoll and quick restart: done.**
  - **Ragdoll:**
    - On a crash the rider becomes a ragdoll of 15 joints, starting from their riding pose: a braced torso and head, with loose arms and legs.
    - It is thrown on at the bike's speed, tumbling head over heels.
    - The hands and feet windmill for the first 3.5 s. They are steered round circles about the chest rather than pushed, so the body isn't flung about.
    - Simple position-based physics: 3 substeps, the bones pulled back to length, and bounce and friction on the real ground mesh.
  - **The bike falls apart:**
    - The bike bursts into 7 pieces: both wheels, frame, fork, bars, seat and crank. Each piece tumbles and bounces on its own.
    - The wheels roll on downhill on their rims, then tip over.
    - Hard hits make a thud or a clank, at most one every 0.09 s.
    - The pieces end up scattered within about 20 m of the rider.
  - **Camera:** it eases into a close crash view (8.5–10 m), a little in front of and above the rider, and follows them down. It blends over the drop-in view, so a wipeout on a big drop is framed close too.
  - **Restart:**
    - **Crash screen:** shows "YARD SALE!" with the reason. After 0.35 s, "TAP TO RIDE AGAIN" pulses and any tap or key rides a new run straight away. The run's bests are saved first.
    - **Results screen:** a tap anywhere restarts immediately. The 0.8 s wait is gone.
    - The tumble now lasts 2.4 s before the results appear.
  - **Fix: rider shooting into the sky.**
    - **Cause:** two bugs.
      - Joints pushed out of the ground turned into upward speed, because velocity was worked out from position. This was worst landing on the head, which starts with joints inside the ground.
      - The windmilling limbs added momentum. Feet paddling the dirt drove the body backwards and up the hill.
    - **Fix:**
      - Ground contact is solved inside the bone loop and only bounces back 30% of the impact speed.
      - Upward speed is capped at 8 m/s and any joint at 30 m/s.
      - The body is lifted clear of the ground at the start.
      - The flailing is momentum-neutral, and only in the air with limbs clear of the ground.
      - The bike parts carry on at closer to the rider's speed, so they tumble down beside him.
    - **Result over 86 forced and head-first crashes:** highest rise above the crash point 100 m → 2.4 m. The rider tumbles 9–37 m down the trail, with the parts mostly within about 15 m either side.
  - **Checks:**
    - Forced crashes over 5 seeds in 3/4, SIDE, CHASE and portrait views.
    - An early tap is ignored and a later tap restarts, both paused and in real time.
    - Regression: 18 km with tricks and flips, 0 crashes and no page errors.

- **Sprockets, battery cells and their boosts: done.**
  - **Sprockets:** the yellow orbs are now spinning gold chainrings (`meshSprocket`), each turned to face the camera so its teeth read from every view.
  - **Sets:** every collectible belongs to a set (`orbSet`, `addOrb`). The HUD shows a pip for each pickup in the set being collected, and "MISSED ONE" if you ride past with any left.
  - **Pedal power** (a full set of 5 or more sprockets):
    - **Where the sets are:** rows along the trail, along rails, and in tens along the lines.
    - **The boost:** 3 s of hard pedalling, with +10 m/s² and +6 m/s top speed. The cranks spin fast and speed lines show.
    - **Scoring:** tricks ×1.5, plus a SPROCKET SET bonus. Another set while the boost is running just extends it.
    - **The arcs over jumps** are still sprockets, as a guide to the flight, but not a set: they come with every jump.
  - **Supercharge** (a full set of 6 blue battery cells):
    - **Where the cells are:** on the run-in to a **mega booter**, every 450–850 m, whenever the trail isn't split into lines.
    - **The boost:** 10 s, harder than the turbo (+24 m/s²). It smashes rocks like the turbo.
    - **Scoring:** tricks ×2, plus a FULL CHARGE bonus. The battery reads SUPER x2.
    - **The super send:** off the mega booter the rider leaves the lip at 30 m/s and keeps that speed across. The flight lasts about 4 s and covers about 95 m, against 2.5 s and 38 m off a normal booter.
    - **The mega booter itself:** its landing is laid out for that flight. The sprocket arc over it traces the super flight, and a rider who missed a cell lands higher on the same slope.
  - **Camera on a super send:** watches the rider rather than the landing far below, leads less and stands back a little.
  - **Points:** the multiplier is the one at takeoff or now, whichever is higher, so a boost that runs out mid-air still pays. Set bonuses join the combo but don't count as a run's best trick.
  - **Kept:** the turbo (fill the battery, tap the bolt) works as before; sprockets and cells also charge it.
  - **Results:** the screen lists sprockets with the sets and supers. The title help has two new lines.
  - **Rock gardens:** the boosts raise average speed (18.9 → 21.4 m/s on one seed), so rocks now sit 18 m past their crest, up from 14 m, to leave room for a faster flight off it.
  - **Regression:** 500 km over five modes (plain, tricks and flips, turbo, pro, high with tricks): 0 crashes. The autopilot gets 1–2 supercharges per 3 km.

- **Rider lost from view over the LOW line's chute + gap: fixed.**
  - **Cause:** the camera frames the ground a little ahead of the rider. Over a chasm that ground is the bottom of the pit, about 45 m down, so the camera dived toward it. In 3/4, SIDE and CHASE the rider went off the top of the screen for 25–69 frames on every chute + gap.
  - **Fix:** the camera frames a chasm as the straight line from its lip to its far edge (`camGround`).
  - **Landing past the far edge:** the rider could drop out of sight behind it. The sight check now tests 24 points along the line to the rider instead of 10, and in the air it also checks where the rider will be 0.3 s ahead, so the camera is already lifting.
  - **Portrait 3/4 (found on the way):** the rider was often at or past the left edge, on any line. The look-ahead runs partly across the screen at that angle and brings the rider nearer the camera than what it aims at, and the weave shifts the trail ahead sideways. The look-ahead is now shortened until the rider is within 60% of the way to the edge. Landscape views are unchanged.
  - **New test hook:** `__mtb.view()` reports how far off-centre the rider is (1 = the screen edge) and how much of them terrain hides.
  - **Result:** LOW lines over 6 seeds and the main trail over 3 seeds, in all four views, landscape and portrait, are clean. A few 3–4 frame wheel clips remain, plus the summit start in portrait SIDE.
  - **Regression:** 40 km with tricks: 0 crashes.

- **Bluecow Rager: name, 3D logo menu, moo: done.**
  - **Name:** the game is now Bluecow Rager, in the page title and the header comment. The file keeps its name so existing links still work.
  - **Logo:**
    - **Source:** `art/bluecow-rager-logo.png`, the original.
    - **Embedded copy:** the white background flood-filled out from the edges (so the white lettering stays), cropped and stored as an 84 KB WebP in its own script tag (`BLUECOW_LOGO`).
  - **The 3D logo** (`buildLogo`), made at load from the picture:
    - **Front:** a 160-wide relief grid. The black plaque stays flat; anything bright or coloured stands 0.3 m proud, blurred so the edges slope, with normals from the height. The texture's own alpha cuts the outline smoothly, because the renderer discards alpha under 0.5 on opaque meshes.
    - **Back:** a dark back face with the same cut-out.
    - **Sides:** 0.45 m walls traced round the outline by marching squares.
    - **Stand:** 8 m wide on two posts, 20 m down from the start and turned toward the camera.
  - **Menu camera:** stands a little to one side and above, fits the logo into the top of the screen above the buttons, and drifts slowly. On PLAY it blends into the ride camera over 1.3 s while the logo is flung up and away.
  - **The show:** after 0.8 s the rider pedals off the summit and smacks into the logo. A synthesised moo, a bonk and a crash play; the logo rocks on its posts, and the rider goes down in a ragdoll yard sale, kept off the logo face and on the trail in front of it.
    - **Replay:** a tap on the scene runs it again.
    - **About the moo:** a browser only allows sound after a first touch, so on a fresh load the first smack may be silent; the next tap's replay moos.
  - **The moo** (`moo`): a sawtooth plus a sub-octave square through a low-pass "mouth" that opens from mmm to ooo and closes again, with a throat peak at 620 Hz. The pitch rises 95 → 146 Hz, holds with a 5 Hz wobble, and slides down to 72 Hz over 1.7 s.
  - **Menu:**
    - **PLAY / HELP / ABOUT:** a column on a tall screen, a row on a wide one, with the best run above.
    - **HELP:** the touch controls plus the keyboard keys.
    - **ABOUT:** the game, the contact alex@alex0.com, and an EMAIL button that opens a mail to it.
    - **Keys:** Space or Enter plays; Escape goes back.
  - **Results screen:** gains a MENU button.
  - **New test hooks:** `__mtb.buttons()` (the buttons on screen) and `__mtb.moo()`.
  - **Checks:**
    - Menu, help, about, PLAY and MENU checked in landscape and portrait.
    - `moo()` runs with sound allowed and no page errors.
    - Regression: 40 km with tricks: 0 crashes.

- **The Bluecow rider: done.** After the concept sheet in `art/bluecow-rider-concept.png`.
  - **The look:** faceted low-poly parts (`meshFTube`, `meshFBall`, flat shaded) in place of the smooth jersey and helmet.
  - **The rider:**
    - **Body:** a broad blue body with white patches on the chest, shoulders and forearms.
    - **Kit:** a black backpack, black pants with dark knee pads, blue shins with white socks, black gloves and shoes.
    - **Tail:** a blue tail with a white tuft, swinging as the bike goes and lifting in the air. It takes the red scarf's place, and the scarf is gone.
    - **Head** (`cowHead`, shared by rider and ragdoll):
      - A blue skull, white muzzle, blue nose with nostrils, and the white flame on the brow.
      - Cream horns curling up and in, and blue ears with pale insides.
      - Orange-to-yellow goggle lenses in a black frame and strap.
  - **The bike:** a royal-blue frame, a navy shock with a gold coil, the gold stanchions kept, and knobbly tyres (two staggered rows of 30 blocks round the tread).
  - **The ragdoll:** wears the same kit; its head is turned with a basis matrix built from the body.
  - **New test hooks:** `__mtb.riderAt()`, and `window.__camAt = {pos, look}` to hold the camera for close-ups.
  - **Checks:**
    - Close-ups from the side, front 3/4, rear 3/4 and front.
    - Gameplay in SIDE and 3/4, the crash, and the menu smack.
    - Regression: 24 km with tricks: 0 crashes, no page errors.

- **Portrait scoring, two-tap crash, funny score card, spare tyres and brakes: done.**
  - **Portrait:**
    - The combo, trick pops, in-air tricks, banked combo and messages now sit in a band from 68% of the screen down, below the rider, at 75% size.
    - They stay clear of the turbo and brake buttons at the sides.
  - **The crash:**
    - It no longer moves on to the results by itself.
    - **The hurt rider:** lies there under a ring of stars, a hand waving feebly, legs kicking and head lifting. Every 4–6 s it gives a low groaning moo and a message ("OUCH...", "MOO-CH!", "NOT THE HORNS"...).
    - **Taps:** the first tap (after 0.6 s) shows the score card; the next (after 0.5 s more) rides again.
    - **Bests:** saved at the moment of the crash.
  - **The score card:**
    - **Top:** a joke for how the run ended ("THE ROCK WON", "HORNS FIRST. BOLD.", "GRAVITY 1, COW 0"...) and a rating from CALF IN TRAINING to LEGEN-DAIRY.
    - **Stats:** distance, hard landings, cased jumps, sketchy saves, perfect landings, flips and tricks, longest hang time, top speed and sprockets; rocks smashed, power slides and lines when there are any; best trick and best combo.
    - **Bottom:** the points.
    - **New counts:** cased (landing within 4 m of a built landing's lip, with a CASED IT! message), sketchy, perfects, maxAir, topSpeed, smashes, slides.
  - **Spare tyres and the brakes:**
    - **The tyres:** one every 110–270 m, lying on a run. Three fill the brakes with 5 s of grip.
    - **The BRAKE button:** on the left; hold it with one thumb while the other rides (B, A or the left arrow on a keyboard).
    - **Braking:** −24 m/s², down to 3 m/s. The back wheel steps out, dust flies, and the wheels nearly stop.
    - **Scoring:** a slide over 0.6 s scores POWER SLIDE.
    - **Speed afterwards:** a slow bike gets back up to cruising speed over about a second.
  - **Fixed in testing:** a crash when braking away from a drop-in ledge.
  - **Checks:**
    - A crash stays down for 7 s; the first tap shows the card; an immediate second tap is ignored; a later tap rides.
    - Braking slows the bike and scores a slide.
    - Regression with tricks: 0 crashes.

- **A downhill racer on a downhill bike: done.** The bull look is dropped; the Bluecow logo and its moo stay on the menu as the brand.
  - **The rider:**
    - **Helmet** (`helmetHead`, shared with the ragdoll): a white full-face shell with a red band and peak, a chin bar with its vent, and orange mirrored goggles on a black strap.
    - **Kit:** a black jersey with a red chest panel, red shoulders and sleeves and white cuffs; red gloves; a slim hydration pack; grey pants over black knee pads; flat shoes with gum soles.
  - **The bike:**
    - **Frame:** race red, with a brace from the top tube to the down tube and a white decal on the top tube. The eBike battery is painted into the down tube.
    - **Suspension:** gold stanchions on the dual-crown fork; an orange coil shock with a gold piggyback reservoir.
    - **Drivetrain and brakes:** a chain from the ring to the cassette and back through the mech, a chain guide, and callipers on both rotors.
    - **Wheels:** grey spokes, and yellow lettering marks on the knobbly tyres' sidewalls.
  - **Words:** the crash groans and score-card jokes no longer talk about horns or cows ("HEAD FIRST. BOLD.", "GRAVITY 1, YOU 0", "THAT WILL BRUISE").

- **Kits and bikes, picked in a garage: done.**
  - **Kits** (`KITS`, applied over `PAL_BASE` by `setKit`): Electric Citrus (the default), Retro Pop, Clown Pajamas, Fire, Ice Lime, and Stealth (the old black and red). Each sets the jersey, sleeves, cuffs, pants, pads, gloves, helmet and pack, and the bike's frame, decal and coil.
  - **Bikes** (`BIKES`, `setBike`), each riding differently through `bike.*`:

    | Bike | Speed | Pop | Flips | Landings | Turbo × charge | Build |
    |---|---|---|---|---|---|---|
    | All-Rounder | 0 | 1 | 1 | 1 | 1 × 1 | dual crown, coil, brace |
    | DH Sled | +1.2 | .9 | .85 | 1.25 | 1 × 1 | fat tubes, skid plate |
    | Dirt Jumper | −1.5 | 1.15 | 1.22 | .8 | .8 × 1.1 | hardtail, single crown, thin tubes, low seat |
    | E-Beast | +.5 | .95 | .9 | 1.1 | 1.6 × 1.5 | big battery and motor, air shock, single crown |

  - **What the numbers change:**
    - **Speed:** added to the top speed, on the ground, on grinds and in the air.
    - **Pop:** scales the jump pop.
    - **Flips:** scales the flip rate.
    - **Landings:** scales the landing angle allowed (up to 1 rad) and the hard-landing impact.
    - **Turbo:** scales its length; **charge** scales how fast the battery fills.
  - **The garage:**
    - **On the menu:** a GARAGE button opens a panel with the bike (name, what it is, bars for speed, pop, flips, landings and turbo) and the kit (name and swatches), each with arrows either side.
    - **The rider:** the camera swings round onto the rider standing at the start, and the show waits.
    - **Saving:** choices are stored (`bcr.kit`, `bcr.bike`).
  - **Tests:**
    - `tools/sim.mjs --bike n`. 24 km each with tricks and flips: All-Rounder 0 crashes; DH Sled 1 (a flip it was too slow for); Dirt Jumper 0, with 0.74 hard landings per km against 0.20; E-Beast 0.
    - The choices survive a reload, and the ride starts on the chosen bike.

- **The logo falls over instead of flying away: done.** On PLAY the sign tips over backwards about the back edge of its foot (`stepLogoFall`): slowly at first, faster as it leans, then a thud, dust and a little bounce. It lies face up beside the trail, stopped where its top meets the hillside (`logoRest`). Its posts come out of the ground with it.

## Smoothness: done
The ride felt jittery and snappy, and a trick during a turn flew round the bend. The aim was a ride as smooth as Alto's Adventure.

- **Measured first** (`tools/smooth.mjs`): frame-to-frame jolts of the rider on screen, the camera's eye and aim, the rider's line across the trail and the bike's pitch, plus a count of little hops.
  - The old ride left the ground about 116 times per km, and 105 of those were hops under a quarter second. That was the "skipping parts of the trail".
- **The trail goes straight-ish:**
  - The bends into drop-ins and the berm turns are gone. They turned as tight as a 7.7 m radius.
  - The weave keeps its long swings. The second, tighter swing is down from 7 m to 2.5 m. Nothing turns tighter than about 90 m now.
  - The turn-offs onto the lines are about twice as long: PRO 56 m (and up the hill by 18 m, not 20); HIGH and LOW 44 m.
    - They ease in and out of the turn with no sudden change in how hard it turns (`sstep5`).
    - The blocks of lines are 40 m longer to make room.
    - Berm walls are scaled to the gentler turns.
- **Flights go straight:** in the air the bike carries on the way it was heading.
  - Its sideways position follows a smooth curve from where it left the ground to where it will land, met the way the trail runs there (a Hermite curve to `flightEndX`).
  - The bike turns along that curve too, and doesn't lean into a turn it isn't making.
  - The rider's offset up a berm wall eases in and out, instead of snapping when the wheels leave the ground.
- **The ground rolls:**
  - The surface noise is long low swells. The old version had 5 cm lumps every 2.7 m and 2.5 cm ones every 0.8 m.
  - Rollers are capped at a curvature a fast bike rolls over.
  - A change of grade eases over a distance that grows with the change, both on the trail (`addRun`) and on the lines (`run`, and the corner where a landing gives way to the way back).
  - **Stays down over little crests** (`wouldFly`): where the ground falls away, the bike only takes off if the flight would last more than 0.2 s or rise more than 10 cm. Lips, drops, chasms and real crests still throw it.
  - **Pace zones brake evenly:** a drop-in's ledge or a gap's run-in sets its speed over the way in, reaching it a few metres before the end. It used to brake at up to 25 m/s².
- **The camera rides on springs** (critically damped, `spring`):
  - Along the trail it keeps right up with the rider. Up and down it follows a little behind, so landings and crests are soft swings.
  - Its lead ahead of the rider shrinks smoothly when the rider would go off-screen, instead of in jumps.
  - Zoom follows a smoothed speed.
  - The look ahead at the ground averages over about 12 m, so a lip or drop slides into view.
  - The drop-in, crash, send and big-air views ease in and out over a second or two.
  - Its floor looks ahead along where the camera is going and rises smoothly.
  - The lift to see over a crest is a spring too.
  - A shake is a smooth wobble that dies away, not random jitter, and only a big one shows much.
  - The bike's yaw and lean are on springs as well.
- **Results** (3/4 landscape, 6 km; SIDE portrait 390×844, 6 km), before → after:

    | | 3/4 | SIDE portrait | CHASE | HIGH |
    |---|---|---|---|---|
    | camera eye, rms cm/frame² | 6.84 → 1.19 | 8.21 → 1.20 | 8.03 → 0.55 | 4.86 → 0.59 |
    | camera aim, rms °/frame² | 0.139 → 0.013 | 0.094 → 0.007 | 0.211 → 0.012 | 0.140 → 0.010 |
    | rider on screen, rms %H/frame² | 0.121 → 0.068 | 0.069 → 0.036 | 0.184 → 0.076 | 0.104 → 0.051 |
    | bike pitch, rms °/frame² | 0.285 → 0.184 | 0.254 → 0.190 | | |
    | hops under 0.25 s, per km | 105 → 0.7 | 103 → 0.7 | | |

  - CHASE and HIGH are over 3 km each.
  - Rider sideways on the upper lines: 7.9 → 1.25 cm/frame² rms, with the worst frame 190 → 19. Before the bike's yaw and lean went onto springs.
  - Real flights are unchanged: about 11 per km, both before and after.
- **Tests:** `tools/sim.mjs`.
  - 49 km plain and 49 km with tricks and flips: 0 crashes, as before. Hard landings per km 0.16 → 0.06.
  - 32 km each on every bike with tricks and flips, up the lines with turbo, and down them with front flips: 0 crashes. The autopilot now waits for a longer flight before flipping a bike that flips slower.
  - Every line still gets its feature (none plain, where a few were before).
- **Gone:** BERM RUN scoring, with the berm turns. BERM points on the lines' turn-offs stay.

## Sound: done
The pedal power's chain sound screeched, and the wind was a loud hiss of static.
- **First try:** a slow, warm tune with bell chimes. It sounded like an adventure game.
- **Second try:** a bright chiptune tune. It didn't land either.
- **Now:** big beat, after the Crystal Method's High Roller, with arcade jingles over it.

- **The tune** (`makeMusic`, `musicBar`): a breakbeat at 112 beats a minute in F minor, scheduled a bar ahead.
  - **The break:** two bars of sixteenths with a little swing: a kick that drops in pitch with a click on the front, a fat snare of noise and tone, ghost snares, and closed and open hats.
    - The drums go through a filter, a soft clip and a hard compressor.
  - **The bass:** a sawtooth through a resonant low pass that snaps shut after each note (the acid squelch), with a sine an octave under it, through its own soft clip.
    - The riff is F, F, Ab, F, Eb, C, Bb over two bars.
  - **The hook:** two sawtooths a few cents apart and a square an octave down, through a closing low pass and an echo.
  - **The order:**
    - Four bars of drums coming in through an opening filter.
    - Then round and round: the groove; the hook; the riff moving through F, F, Db and Eb under a second hook; and a breakdown.
    - **The breakdown:** the drums drop to hats under a dark F minor pad that opens up. A sawtooth riser and a snare roll build back into the drop.
    - One time round is about a minute.
  - **The mix:** the drums and the bass about level, the hook a few dB under, and a last compressor over the whole band.
- **The MUSIC button** (`toggleMusic`):
  - Off by default. The choice is remembered (`bcr.music`), and N on a keyboard does the same.
  - It sits under SND on the menu and while riding; on a tall screen in a ride with a friend, below the room box.
  - Turned on, the tune starts from the top with the drums filtering in. While it is off, no bars are laid out at all.
  - The jingles, loops and thumps go on regardless; SND still mutes everything.
- **Arcade jingles** (`JINGLES`, `blip`, `note`): pulse waves in F minor, the fanfares in its relative major (Ab), louder than the music so they pop.
  - **A sprocket:** a coin's two quick notes a fourth apart, climbing the scale as a run is picked up.
  - **A battery cell:** a zap up an octave.
  - **A jump:** a square-wave bwoop up. **A trick starting:** a fwip, pitched by the swipe.
  - **Short fanfares:** tricks, combos, lines, perfect landings, the start and TURBO READY.
  - **PEDAL POWER:** the power-up climb, up through the chord three times.
  - **TURBO and SEND IT:** a motor winding up, then a fanfare.
  - **A spare tyre:** a boing.
  - **A crash:** the wah, wah, wahhh of losing a life, over the thud.
- **The noise loops, soft and low** (`soundLoops`):
  - **The wind:** deep brown noise through a low pass, coming and going in slow gusts. It used to be white noise through a wide band pass.
  - **The tyres:** the crunch is pink noise, lower and quieter, on snow too. The roll is quieter.
  - **The eBike motor:** a soft hum of a low note and its octave, instead of a sawtooth whine.
  - Above 1.5 kHz, where the hiss was, the loops are 28–35 dB quieter than before.
- **The thumps** (ZzFX): landings, crashes, splashes and grinds, each through a low pass, with no bit crush.
- **Listening:** `tools/listen.mjs` renders the sound offline to a WAV file (`__mtb.audioPreview`): the tune, the loops at riding speed, and the jingles and thumps over them.
  - A check on the rendering: rendered with only the hook, its notes come out at the right pitches. Rendered a part at a time, the drums, bass and hook measure −24, −23 and −27 dB over the hook section.

## Cel shaded look: done
A second look for the game, cartoon style, and the default since it was added. It's picked on the menu with CEL ON / CEL OFF under the MUSIC button.
- **Turning it on:**
  - The choice is remembered (`bcr.cel`), and L on a keyboard toggles it.
  - A link with `?look=cel` or `?look=smooth` opens the game in that look without changing what was saved.
  - Off, the game looks exactly as before.
- **The light in flat bands:** the 3D renderer's shader is patched before it is built (`render3DFragmentSource`), with a `celShade` uniform set on every use of a program (`render3DUseProgram`).
  - **The sun:** shadow, half lit and fully lit, with a pixel-soft edge between them. Cast shadows come out as flat shapes.
  - **The headlamp at night:** the same bands, so it throws a hard-edged pool of light.
  - **The sky's light from above and the ground's from below:** two tones.
  - **Highlights:** a hard edge.
- **Ink** (`CEL_INK`, a post process):
  - **The lines:** thin dark lines, about a pixel, wherever the scene's depth jumps or folds. That covers the rider and bike, rocks, trees, ridgelines and the trail's edges. They were twice that at first, which was too heavy.
  - **Fading:** the lines fade out between 150 m and 1.4 km, so the far mountains stay soft.
  - **Colour:** a touch more saturation.
  - Sprockets glow in this look, so the ink round their teeth doesn't dull them.
- **Cost:** a depth pass of the scene and a full-screen pass, both only while it is on. In the software renderer used for testing, a frame took about 12% longer.
- **Tried and dropped:** stepping the colours into a few flat tones. On the smooth hillsides it made blotches.

## Performance pass: done
On an iPhone 17 Pro Max the game hiccupped now and then. All numbers below were measured headless, in Chromium with software GL, so only the ratios mean much.

- **Perf meter (`?perf=1`):**
  - Frame times as bars against 16.7 and 33 ms lines, with the game's logic and render time stacked inside each bar.
  - The worst frame, p95, hitches over 25 ms, and the quality level.
  - Marks where a chunk was finished, track was laid out, the music was rendered, or the quality changed.
- **Terrain chunks without spikes:**
  - **The ground mesh:** written straight into the renderer's packed vertex layout (`render3DWriteVertex`, 36 bytes a vertex, indices wound the way the renderer winds them), with no object for each point, normal or colour. It renders pixel for pixel the same as before.
  - **Uploads:** the GPU upload and bounds are steps of their own (`preUpload`). Before, they happened at a mesh's first draw, in the middle of a frame.
  - **The last step** is split: one step per tree set, each placed as it's made, and one per sign, deck, bridge or arch. A chunk given up part way takes down what it had made (`dropChunkJob`).
  - **The scheduler** learns each step's usual cost and only starts one that fits what's left of a 2 ms slice.
  - 3D text is built once per string (`text3D`), and `branchesNear` no longer allocates.
- **Results:**
  - Logic per frame: p99 3.1 → 2.0 ms, p99.9 about 6.5 → 3.2 ms, frames over 4 ms 25–36 → 3–9 per 10,000.
  - A rare 6–13 ms garbage-collection outlier remains, in both versions.
  - Laying out a block of lines still takes about 3.5 ms here, once every 25 s or so.
- **Audio:**
  - The noise loops only touch a parameter when its target has moved by more than 2%, every other frame: about 10× fewer `setTargetAtTime` calls.
  - **The music** is rendered once (`renderMusicLoop`), off the main thread, at 32 kHz with the band on one channel and the hook on the other. It's the intro plus one time round, about 70 s.
    - It's played as a loop, replacing about 100 nodes a bar.
    - Until it's ready (a few seconds on a phone), the bars play live, and the loop takes over at the start of a bar.
- **Glows on the GPU:**
  - Sprocket, cell and tyre glows, the turbo glow, and the stars and moon are now instanced quads with the soft-dot texture (`drawGlows`), which has the same falloff.
  - Before, each was a 100-vertex fan of new objects every frame.
  - Streamed vertex data went from 44–101 KB a frame to 0, along with thousands of short-lived objects a frame.
- **Render budget:**
  - Phones use a 1024 shadow map.
  - The sky dome is re-coloured when the day has moved on, not every 12 frames.
  - Quality also steps down when one frame in twenty runs over 24 ms, and steps back up after 12 s with room to spare (not after three drops).
  - Dust is capped lower, and HUD numbers come from one cached formatter (`fmt`).
- **Not done:**
  - Pooling the dust-burst emitters (small).
  - A ring of stream buffers: nothing is streamed now.
  - Render interpolation for 120 Hz: check `?perf=1` on the phone first.

## Flow: done
Speed as a reward: riding clean fills a FLOW meter beside the battery, and the more of it, the quicker the ride.

- **What fills it:**
  - a perfect landing, +0.12;
  - a clean landing after more than 0.5 s of air, +0.05;
  - each trick or flip landed, +0.06;
  - a combo banked, +0.04 per trick in it, up to 5;
  - a line finished, +0.15;
  - a BERM, +0.03;
  - a sprocket set, +0.08.
- **What empties it:**
  - a sketchy landing, −0.25;
  - a hard landing, −0.1;
  - braking, −0.2 a second;
  - a crash empties it;
  - and it ebbs away by itself, −0.02 a second.
- **Four levels**, at 0.25, 0.5, 0.75 and 0.97, with a little give before dropping back.
  - Each level shows a message ("FLOW x1.25" up to "FULL FLOW!").
  - Each level is worth 1.125× more on tricks (`boostMult`), up to 1.5×.
- **Speed:**
  - The top speed on the ground is up to 15% higher at full flow, with a small push toward it and a higher cruise (`vFloor`).
  - The air speed cap is unchanged, so jumps still land where the trail was built for them.
- **Feel:**
  - The view widens by up to 8% with the flow.
  - Speed lines from level 3.
  - With the music on, the hook only comes in from level 2 while riding.
- **Tests:** `tools/sim.mjs`, 18 km on each bike with tricks and flips, plus up the lines with turbo, and plain.
  - 0 crashes everywhere.
  - Average speed with tricks went from 21.3 to 23.8 m/s on the All-Rounder. The other bikes ride at 22.7–24.7 m/s.
  - Plain rides went from 21.0 to 23.4 m/s.
  - Score per km with tricks went from 176k to 248k.
  - `tools/smooth.mjs` is unchanged.

## Speed, and no forced slow-downs: done
The game slowed the rider by itself on the ledges before drop-ins and on the run-in to chutes, so the brake did nothing useful. And the speed from flow wasn't felt; only turbo and pedal power were.

- **Drop-ins** (main trail and the PRO line):
  - **No forced slow-down.** On the ledge the brakes are free (`brakeZones`, `freeBrakeAt`): the BRAKE button shows and pulses, uses no tyres, and costs no flow.
  - **Braked:** a precise drop onto the steep top of the landing, and the close drop-in camera comes in.
  - **Ridden in fast:** a huge send. The camera stays as it is. The landing eases off (to 0.62 on the main trail, 0.42 on the PRO line) and runs on past where the fastest rider comes down (`extendLanding`, `flightLand`, `landingFar`).
- **Chutes (LOW line) and canyon gaps:**
  - The run-in no longer brakes (`up` paces): it only pedals a slower rider up to the speed that clears the chasm.
  - A faster rider keeps their speed and flies further, onto a landing that runs on for them.
- **The drop-in camera** only zooms in when the rider has slowed on the way in: below the drop's speed plus 4 m/s, latched until the landing.
- **Speed:**
  - **Base:** top speed 22 → 24 m/s, cruise 9.5 → 11.
  - **Flow on the ground:** up to +7 m/s at full flow, like pedal power, with a stronger push (5 m/s² at full).
  - **Flow in the air:** the speed allowed rises by up to 4 m/s, so a fast takeoff isn't braked mid-air.
  - **Pickups** feed the flow now: sprockets +0.012, cells +0.03, tyres +0.03.
  - **Feel:** the view widens up to 14% with flow, and speed lines show from level 2.
  - **Landings for the speed:** every built landing (jumps, booters, decks, drop-ins, gaps) is laid out for the fastest flight, `V_FLY` = 32.2 m/s (it was 24). Kicker and booter landings are longer, and blocks of lines are longer (400–440 m with a PRO line, otherwise 330–380 m) so each line's feature still fits.
- **The autopilot** brakes for half the drop-ins and sends the rest.

## Next: proposals
- **More fun:**
  - pumping (hold on a downslope for speed);
  - missions with unlocks for bikes and kits;
  - a ghost of your best run, and a daily mountain with a leaderboard on the relay;
  - slow motion on a mega send or a perfect landing, and near-miss bonuses;
  - a 2 km race mode.
- **Architecture, still one HTML file to deploy:**
  - Write in `src/` modules and build with esbuild or Vite plus `vite-plugin-singlefile`.
  - Separate the simulation from the view.
  - Generate the world in an inline Web Worker.
  - Fixed-step simulation with interpolated rendering.
- **If the single file goes:**
  - **Three.js + TypeScript + Vite as an installable PWA (recommended for the web):**
    - WebGPU, with WebGL2 as the fallback;
    - instancing and level of detail;
    - `MeshToonMaterial` and an outline pass for the cel look;
    - keeps the link sharing and the relay.
  - **Godot 4 for a native iPhone app:**
    - Metal and 120 Hz;
    - GPU particles and toon shaders;
    - a full rewrite.

## Two players: built (core)
Decisions: the server can run Node; online only; the match just keeps going; a crash costs time rather than the run; a breakaway wins and restarts. The slipstream is on, and each player keeps their own collectibles.

- **Relay** (`server/relay.js`, `ws`):
  - Rooms with four-letter codes; it passes each player's messages to the other.
  - When one leaves, the other stays in the room as its host. Idle rooms are dropped after 30 minutes, and dead connections are pinged out.
  - `server/README.md` has the systemd unit and the Apache lines (`proxy_wstunnel`, `ProxyPass /mp ws://127.0.0.1:8090/`).
- **Joining:**
  - Menu → 2 PLAYERS → HOST A RIDE (starts riding with a room open), or INVITE while riding alone. Either shows the code and a SHARE button.
  - The friend uses the link `?join=CODE` or JOIN WITH A CODE.
  - The host answers with the seed, its distance, speed, ride time and time of day. The joiner builds the mountain up to there and drops in a few metres back, on solid ground.
  - If the host was off the bike at the time, both start over together.
- **Riding together:**
  - **Snapshots:** each game sends its rider 20 times a second (`mpPose`). Riding: position, angle, line, flip pivot, yaw, lean, the trick and its progress, suspension, wheels, crank, crouch, kit, bike, turbo, score. Crashed: the ragdoll's points and the pieces' transforms.
  - **Drawing the rival** (`RemoteView`): 120 ms behind real time, between the snapshots either side; angles taken the short way round. The same drawing code as the local rider, in the rival's kit and bike (`asRemote`), 0.8 m to the side. It cannot be hit.
  - **On screen:** a RIVAL tag over them, or an arrow at the screen edge with the gap.
  - **Slipstream:** within 25 m behind the rival, +4 m/s² and +2 m/s on the top speed, with a SLIPSTREAM label.
- **Rounds** (the host's clock):
  - Every 30 s, one star each for more distance, more points, and a clean round while the other crashed. The round goes to the one with more stars, or more points if tied.
  - A banner on both screens ("ROUND 4: YOU WIN IT, faster by 38 m · +2,400 style"). Stars total up in the round box at the top.
- **Breakaway:**
  - 150 m or more ahead for 30 s straight wins. Both get "BREAKAWAY! YOU WIN" or "RIVAL BROKE AWAY", and 3 s later both start over on the same new seed at the top, with a 3-2-1 countdown.
  - The wins are counted (1-0, 2-1...).
  - For 6 s after a restart the clock and the breakaway wait, while the other game catches up.
- **A crash in a match** (`mpRecoverStep`), about 4 s lost:
  - The ragdoll tumbles for 2 s.
  - Then the rider is posed up onto their feet beside the trail, with a line like "SHAKE IT OFF" or "STILL GOT IT".
  - They shake their head and flap their hands while the bike's pieces fly back together beside them.
  - At 4.2 s they're back on, rolling away at 5 m/s from solid ground (out of any chasm, off any wall).
  - The rival sees all of it through the snapshots. No score card in a match.
- **Tests:**
  - Two headless browsers through a local relay: host, join from the link, ride on autopilot, a round decided, the joiner crashes and gets back on, a forced breakaway, both restart on the same seed with no false breakaway, the host leaves and the joiner keeps the room as host.
  - Portrait and landscape HUD checked. Solo regression unchanged: 0 crashes.
- **Still to come:** each bike's own power, and the head-to-head crates (below).

## Two players: the plan

A second player joins a run already under way and rides the same mountain alongside the first. Neither can hit the other. Each has their own power-ups and uses them their own way. Every 30 seconds a round is decided, on who went faster and who scored more.

### 1. Why it is cheap to sync
- The mountain is built from its seed (`trackInit(seed)`). Every feature, line, rock, sprocket, cell and tyre comes from the seeded generator.
- `Math.random` only touches crash effects, sound, music, camera shake, the autopilot and picking a new seed.
- So both players share the seed and each builds the same world locally. The network carries only the riders: about 20 small messages a second each way, a few kB/s.

### 2. The server on Linux and Apache
Apache serves the game file as now. Live play needs a connection that stays open. Two ways to get one:

- **A. Recommended: a small WebSocket relay behind Apache.**
  - **The relay:** a Node.js process (the `ws` package, about 100 lines), run by systemd on 127.0.0.1:8090.
  - **What it does:** keeps rooms keyed by a 4-letter code, relays each player's messages to the other, drops rooms that go quiet, and answers pings.
  - **Apache:** enable `mod_proxy`, `mod_proxy_wstunnel` and `mod_rewrite`, then add `ProxyPass /mp ws://127.0.0.1:8090/` and `ProxyPassReverse /mp ws://127.0.0.1:8090/`.
  - **TLS:** Apache's HTTPS gives `wss://yoursite/mp` with no extra setup.
  - **Load:** tiny; one small VPS handles thousands of rooms.
  - **The relay is not the referee:** the host's game decides the rounds.
- **B. If only PHP can run (no long-lived process): WebRTC peer-to-peer.**
  - A PHP script and a small table (or files) pass the connection offer and answer between the two browsers.
  - After that the games talk directly over a data channel, through public STUN servers.
  - Some networks (strict NAT, mobile carriers) need a TURN relay, which means running coturn anyway.
  - More moving parts and more failure cases than A.

### 3. Joining a run under way
- **Opening a room:** while riding solo, an INVITE button (on the pause and results screens, and on the menu under a new 2 PLAYERS option) opens a room. It shows a code and a link (`...?join=ABCD`), and a QR code on the menu.
- **What the joiner gets:** the seed, the host's distance, line and time of day.
  - They build the track up to that point. This is fast, because only the data is built; ground meshes are built only near the camera.
  - They drop in beside the host, with a 3-2-1 and a DROP IN! of their own.
- **On the host's side:** the host sees "PLAYER 2 JOINED" and the rounds start.
  - Either player can leave at any time, and the other carries on solo.

### 4. Riding together
- **What each game sends, about 20 times a second:**
  - x, y and line, pitch and flip angle, speed, grounded or not;
  - the trick under way and its progress, crank and wheel angles, suspension;
  - turbo, pedal power or brakes on, state (riding or crashed), and running score and distance;
  - kit and bike, once.
- **Smoothing:** the other rider is drawn 120 ms behind real time, between the two latest states, and carried on along its speed if a message is late. It snaps if it drifts more than 2 m.
- **Crashes:** a crash goes as an event carrying the ragdoll's starting state. The other game plays the same wreck itself.
- **Drawing the other rider:**
  - The same model in their own kit and bike, half a metre to the side so the two never overlap. On a line they ride their line's own z.
  - No collisions; the other rider is a ghost.
  - A name tag over them.
  - When they are off screen, an arrow at the screen edge with the gap ("RED  +42 m").
- **Keeping it close:** an optional slipstream. Riding within 25 m behind the other player gives +2 m/s, and the leader gets nothing extra. Faster riders still pull away; it just stops one mistake from ending the race.
- **Sprockets, cells and tyres:** each player keeps their own, so both see and can collect everything. Stealing goes through a power-up instead (below).
- **Crashing in a two-player run** does not end it. The rider is down for 2.5 s (the score card waits for the end of the match), then drops back in where they fell, with the combo lost. That is the penalty.

### 5. Different power-ups, used differently
Two kinds, so the players have different powers and different choices:

- **Each bike's own power**, on a button that fills by riding:

  | Bike | Power |
  |---|---|
  | DH Sled | BULLDOZE: 5 s of smashing straight through rocks and logs, with no slowdown on hard landings |
  | Dirt Jumper | DOUBLE POP: one jump in mid-air |
  | E-Beast | OVERCHARGE: the next turbo is a supercharge |
  | All-Rounder | SECOND WIND: refills pedal power and saves the combo through one hard landing |

- **Head-to-head pickups:** "?" crates on the trail, held one at a time and fired with a tap.
  - **DUST CLOUD:** the other player's view is hazy for 3 s.
  - **MUD PATCH:** a patch of mud on the other player's trail 40 m ahead of them, which slows them unless they jump it.
  - **POINT THIEF:** takes 10% of the other player's round points.
  - **SHIELD:** blocks the next one thrown back.
- **How attacks arrive:** an attack goes as an event, and the target's game applies it (it lays its own mud), so it is the same on both screens.
- **Comeback rule:** the loser of each round gets a crate straight away.

### 6. A round every 30 seconds
- **The host's game keeps the clock,** shown as a ring in the HUD with a countdown over the last 5 s.
- **At the bell**, each game reports what it did in the 30 s:
  - metres gained;
  - trick points banked;
  - its best single trick;
  - its crashes.
- **Stars:** the host awards up to three.
  - **SPEED:** more distance.
  - **STYLE:** more trick points.
  - **CLEAN:** no crash, and the other player crashed.
- **The result:** the round winner has the most stars, with ties going to the higher trick points. A banner shows it ("ROUND 3 — RED: faster and +12,400 style"), the tally of stars goes up, and the loser's comeback crate drops.
- **A match** is first to 5 rounds, or 10 rounds; or endless, if wanted.
- **At the end, a shared score card:** both riders side by side with their rounds, hard landings, cased jumps, top speed and best trick, a winner, and REMATCH with the same seed or a new one.

### 7. What changes in the code
- **Rider state into an object.**
  - The rider is drawn from globals now (`px`, `py`, `ang`, `rot`, `style`, `pz`, `yawV`...).
  - Collect the drawing state into `{x, y, z, ang, rot, trick, crank, wheel, susp, kit, bike, ...}`.
  - `bikeMatrix`, `RiderView` and `drawRagdoll` then draw from it.
  - The local rider fills it from the physics, the remote one from the network.
  - This is the biggest refactor; the physics itself stays as it is.
- **Per-rider colours:** the kit is applied per draw, by swapping the palette just before drawing each rider.
- **A `net` module:** connect, room, send at 20 Hz, receive into a buffer, events (join, leave, crash, round, attack), and reconnect.
- **New screens and HUD:**
  - the 2 PLAYERS menu with HOST and JOIN, a code entry, and the invite;
  - the round ring, the off-screen arrow and the name tag;
  - the power and crate buttons;
  - the round banner and the match card.
- **The server:** `server/relay.js`, plus a systemd unit and the Apache lines, in the repo with a short README.

### 8. Order of work
1. Rider state into an object, a second rider drawn from a recording (no network yet), the arrow and name tag.
2. The relay and `net`: rooms, codes, join a run under way, the other rider moving smoothly. Tested with two headless browsers on one machine through a local relay, and then over real Wi-Fi and mobile.
3. Rounds: the clock, the reports, stars, banner, match end and card.
4. Power-ups: each bike's own, then the crates and attacks, and the comeback rule.
5. Polish: slipstream, sounds, reconnecting after a dropped connection, a host leaving, and two phones in portrait and landscape.

### 9. Decisions to make
- **Server:** can a small Node process run on the server (option A), or only PHP (option B)?
- **Players:** online only, or also two on one device (split screen)?
- **Match length:** first to 5 rounds, a fixed 10, or endless?
- **Slipstream:** on, off, or an option?
- **Collectibles:** each player their own, or one shared set where the first to reach a sprocket takes it from the other?

## Running the tools

    node tools/sim.mjs [--seeds 20] [--km 5] [--flips back|front] [--tricks] [--lanes rand|up|down|main] [--turbo] [--json out.json] [--salt n] [--game other.html] [--bike 0..3]
    node tools/shot.mjs --seed 3 --at 800 --view SIDE --zoom 1 --day .3 --out shot.png [--size 390x844] [--js "code"] [--game other.html]
    node tools/smooth.mjs [--view 3/4] [--size 900x600] [--seeds 3] [--km 2] [--lanes main] [--game other.html]
    node tools/listen.mjs [--out sound.wav] [--seconds 44] [--parts "music loops jingles thumps"] [--game other.html]

Open the game with `?perf=1` for the frame meter, and `?look=smooth` or `?look=cel` to pick the look (cel is the default).

`--lanes` takes rand, up, down, main, pro, high or none.
