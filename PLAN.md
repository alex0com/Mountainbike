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

## Running the tools

    node tools/sim.mjs [--seeds 20] [--km 5] [--flips back|front] [--tricks] [--lanes rand|up|down|main] [--turbo] [--json out.json] [--salt n] [--game other.html]
    node tools/shot.mjs --seed 3 --at 800 --view SIDE --zoom 1 --day .3 --out shot.png [--size 390x844] [--js "code"] [--game other.html]

`--lanes` takes rand, up, down, main, pro, high or none.
