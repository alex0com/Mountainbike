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
| Keyboard | Space jumps; Up/Down change line near a block | **I J K L** for up/back/down/forward, **U O M ,** for the diagonals |

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

## Open questions

1. 8 swipe directions, or 4 (up/down/back/forward) for reliability on small phones?
2. Slow motion off big drop-in lips: yes or no?
3. At a drop-in lip: tap to SEND IT for a bonus with auto roll-off (proposed), or must tap to go?
4. Keep the eBike turbo as is (proposed, held only in brake zones)?
5. Is the trick mapping table right, or are there tricks you want added or swapped?
