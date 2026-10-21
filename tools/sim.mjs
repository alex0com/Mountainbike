// Headless test rides: loads the game in Chromium, lets the autopilot ride several seeds and reports
// what happened. The engine is paused and the game stepped by hand, so a run is the same every time.
//
//   node tools/sim.mjs [--seeds 20] [--km 5] [--flips back|front] [--tricks] [--lanes rand|up|down|main] [--turbo]
//                      [--from 1] [--json out.json] [--game other.html] [--salt n] [--bike 0..3]
import {createRequire} from 'node:module';
import {execSync} from 'node:child_process';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const args = process.argv.slice(2), opt = (k, d)=> { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1] ?? true; };
const has = k=> args.includes('--' + k);
const SEEDS = +opt('seeds', 20), KM = +opt('km', 5), FROM = +opt('from', 1);
const FLIPS = opt('flips', false), TRICKS = has('tricks'), LANES = opt('lanes', 'rand'), TURBO = has('turbo');
// the autopilot's own choices (which trick, when to pop) come from this, so a ride can be repeated exactly
const SALT = +opt('salt', 0), BIKE = +opt('bike', 0);
const here = path.dirname(fileURLToPath(import.meta.url));
// --game rides another copy of the page, for comparing against an older version
const game = pathToFileURL(opt('game', false) || path.join(here, '..', 'Downhill MTB 3D.html')).href;

const browser = await playwright.chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio']});
const page = await browser.newPage({viewport: {width: 900, height: 600}});
const errors = [];
page.on('pageerror', e=> errors.push(String(e)));

const all = [];
for (let seed = FROM; seed < FROM + SEEDS; ++seed)
{
    await page.goto(game + '?seed=' + seed);
    await page.waitForFunction(()=> window.__mtb && window.__mtb.info().state == 'title');
    const t0 = Date.now();
    const r = await page.evaluate(async ({KM, FLIPS, TRICKS, LANES, TURBO, SALT, BIKE, seed})=>
    {
        const m = window.__mtb, max = Math.max;
        if (SALT)
        {
            let a = seed*7919 + SALT*104729;
            Math.random = ()=> { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
        }
        setPaused(true);
        m.bike(BIKE);
        m.autopilot(true, FLIPS);
        window.__trickPilot = TRICKS;
        m.lanes(LANES, TURBO);
        m.start();
        const crashes = [], goal = KM*1000;
        // the run's totals are kept through a teleport, so they are read once at the end
        let ridden = 0, segStart = m.info().px, frames = 0, sinceTeleport = 99;
        const stats = {flips: 0, score: 0, lines: 0, turbos: 0, orbs: 0, tricks: {}, airs: [0, 0, 0, 0, 0, 0]};
        const bank = i=>
        {
            stats.flips += i.flipsTotal; stats.score += i.score; stats.lines += i.lines; stats.turbos += i.turbos; stats.orbs += i.orbsGot;
            stats.combos = (stats.combos || 0) + (i.combosBanked || 0); stats.mult = (stats.mult || 0) + (i.multSum || 0); stats.bestCombo = max(stats.bestCombo || 0, i.bestCombo || 0);
            for (const [k, v] of Object.entries(i.trickCounts || {})) stats.tricks[k] = (stats.tricks[k] || 0) + v;
            (i.airHist || []).forEach((v, k)=> stats.airs[k] += v);
            stats.hard = (stats.hard || 0) + (i.hardLandings || 0);
        };
        while (ridden < goal && frames < 400000)
        {
            const i = m.sim(300, ()=> m.info().state != 'ride');
            frames += 300; sinceTeleport += 5;
            if (i.state == 'ride') { if (ridden + i.px - segStart >= goal) { ridden += i.px - segStart; break; } continue; }
            // a crash: note it, then carry on a little past where it happened
            const c = window.__lastCrash || {reason: i.crashReason};
            crashes.push({...c, afterTeleport: sinceTeleport < 3});
            ridden += i.px - segStart;
            m.teleport(i.px + 40);
            segStart = m.info().px; sinceTeleport = 0;
        }
        const end = m.info();
        bank(end);
        return {ridden, rideTime: end.runTime, crashes, stats};
    }, {KM, FLIPS, TRICKS, LANES, TURBO, SALT, BIKE, seed});
    r.seed = seed; r.wall = (Date.now() - t0)/1000;
    all.push(r);
    const reasons = r.crashes.map(c=> c.reason + (c.afterTeleport ? '*' : '')).join(', ');
    console.log(`seed ${seed}: ${(r.ridden/1000).toFixed(2)} km, ${(r.ridden/max1(r.rideTime)).toFixed(1)} m/s avg, ` +
        `${r.crashes.length} crashes${reasons ? ' (' + reasons + ')' : ''}, ${r.stats.flips} flips, ${r.stats.lines} lines, ${r.wall.toFixed(0)} s`);
}
function max1(v) { return v > 1 ? v : 1; }

// totals
const km = all.reduce((s, r)=> s + r.ridden, 0)/1000, reasons = {}, tricks = {};
for (const r of all)
{
    for (const c of r.crashes) if (!c.afterTeleport) reasons[c.reason] = (reasons[c.reason] || 0) + 1;
    for (const [k, v] of Object.entries(r.stats.tricks)) tricks[k] = (tricks[k] || 0) + v;
}
const n = Object.values(reasons).reduce((a, b)=> a + b, 0);
console.log(`\n${km.toFixed(1)} km over ${all.length} seeds, ${n} crashes (${(n/km).toFixed(2)} per km)`);
for (const [k, v] of Object.entries(reasons).sort((a, b)=> b[1] - a[1])) console.log(`  ${v}  ${k}`);
// flights longer than .3 s, by how long they lasted
const airs = [0, 0, 0, 0, 0, 0];
for (const r of all) r.stats.airs.forEach((v, k)=> airs[k] += v);
// how the scoring adds up
{
    const sum = k=> all.reduce((s, r)=> s + (r.stats[k] || 0), 0);
    console.log('score per km ' + (sum('score')/km|0) + ', orbs per km ' + (sum('orbs')/km).toFixed(1) + ', turbos per km ' + (sum('turbos')/km).toFixed(2) +
        ', combos per km ' + (sum('combos')/km).toFixed(1) + ' at x' + (sum('mult')/max1(sum('combos'))).toFixed(1) + ' on average, best combo ' + Math.max(...all.map(r=> r.stats.bestCombo || 0)));
}
console.log('hard landings per km: ' + (all.reduce((s, r)=> s + (r.stats.hard || 0), 0)/km).toFixed(2));
console.log('air time per km:  ' + ['<.5s', '.5-1s', '1-1.5s', '1.5-2s', '2-2.5s', '2.5s+'].map((l, k)=> l + ' ' + (airs[k]/km).toFixed(1)).join('   '));
if (Object.keys(tricks).length)
{
    console.log('tricks landed:');
    for (const [k, v] of Object.entries(tricks).sort((a, b)=> b[1] - a[1])) console.log(`  ${v}  ${k}`);
}
if (errors.length) { console.log('\npage errors:'); for (const e of [...new Set(errors)]) console.log('  ' + e); }
const out = opt('json', false);
if (out) fs.writeFileSync(out, JSON.stringify({opts: {SEEDS, KM, FLIPS, TRICKS, LANES, TURBO}, all, reasons, tricks}, null, 1));
await browser.close();
process.exit(errors.length ? 1 : 0);
