// How smooth a ride looks: the autopilot rides a frame at a time and this measures the jolts, as second differences
// from one frame to the next, of the rider on screen, the camera's eye and aim, the rider's line across the trail
// and the bike's pitch on the ground, and counts the little hops off the ground (flights under a quarter second).
//
//   node tools/smooth.mjs [--view 3/4] [--size 900x600] [--seeds 3] [--km 2] [--lanes main] [--game other.html]
import {createRequire} from 'node:module';
import {execSync} from 'node:child_process';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), opt = (k, d)=> { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
// --game measures another copy of the page, for comparing against an older version
const game = pathToFileURL(opt('game') || path.join(here, '..', 'Downhill MTB 3D.html')).href;
const [W, H] = opt('size', '900x600').split('x').map(Number), view = opt('view', '3/4'), seeds = +opt('seeds', 3), km = +opt('km', 2), lanes = opt('lanes', 'main');
const browser = await playwright.chromium.launch({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio']});
const page = await browser.newPage({viewport: {width: W, height: H}});
const errs = []; page.on('pageerror', e=> errs.push(String(e)));
const rms = a=> a.length ? Math.sqrt(a.reduce((s, v)=> s + v*v, 0)/a.length) : 0;
const pct = (a, q)=> { if (!a.length) return 0; const b = a.map(Math.abs).sort((x, y)=> x - y); return b[Math.min(b.length - 1, Math.floor(b.length*q))]; };
const tot = {scr: [], eye: [], look: [], pitch: [], side: [], hops: 0, airs: 0, m: 0};
for (let seed = 1; seed <= seeds; ++seed)
{
    await page.goto(game + '?seed=' + seed);
    await page.waitForFunction(()=> window.__mtb && window.__mtb.info().state == 'title');
    const rec = await page.evaluate(({view, km, lanes})=>
    {
        const m = window.__mtb; setPaused(true); m.cam(view, 1); m.setDay(.3); m.autopilot(true, false); m.lanes(lanes); m.start();
        m.sim(240);
        const out = [], x0 = m.info().px;
        while (m.info().px < x0 + km*1000 && out.length < 60*300)
        {
            const i = m.sim(1, null, 1/60);
            if (i.state != 'ride') { out.push(null); m.teleport(i.px + 40); m.sim(120); out.push(null); continue; }
            out.push(m.camState());
        }
        return {out, metres: m.info().px - x0};
    }, {view, km, lanes});
    tot.m += rec.metres;
    const f = rec.out;
    let air = 0;
    for (let i = 2; i < f.length; ++i)
    {
        const a = f[i - 2], b = f[i - 1], c = f[i];
        if (!a || !b || !c) continue;
        if (c.sx != null && b.sx != null && a.sx != null) tot.scr.push(Math.hypot(c.sx - 2*b.sx + a.sx, c.sy - 2*b.sy + a.sy)/H*100);
        tot.eye.push(Math.hypot(c.ex - 2*b.ex + a.ex, c.ey - 2*b.ey + a.ey, c.ez - 2*b.ez + a.ez));
        tot.side.push(c.rz - 2*b.rz + a.rz);
        const dir = q=> { const x = q.lx - q.ex, y = q.ly - q.ey, z = q.lz - q.ez, n = Math.hypot(x, y, z); return [x/n, y/n, z/n]; };
        const [A, B, C] = [dir(a), dir(b), dir(c)];
        tot.look.push(Math.hypot(C[0] - 2*B[0] + A[0], C[1] - 2*B[1] + A[1], C[2] - 2*B[2] + A[2])*180/Math.PI);
        if (a.grounded && b.grounded && c.grounded) tot.pitch.push((c.pitch - 2*b.pitch + a.pitch)*180/Math.PI);
        // a flight ends: how long it was
        if (!b.grounded) air += 1/60;
        if (!b.grounded && c.grounded) { ++tot.airs; if (air < .25) ++tot.hops; air = 0; }
    }
}
const k = tot.m/1000;
console.log(`${view} ${W}x${H}  ${k.toFixed(1)} km`);
console.log(`  rider on screen  rms ${rms(tot.scr).toFixed(3)} %H/frame²   p99 ${pct(tot.scr, .99).toFixed(3)}   max ${pct(tot.scr, 1).toFixed(2)}`);
console.log(`  camera eye       rms ${(rms(tot.eye)*100).toFixed(2)} cm/frame²  p99 ${(pct(tot.eye, .99)*100).toFixed(2)}`);
console.log(`  camera aim       rms ${rms(tot.look).toFixed(4)} °/frame²   p99 ${pct(tot.look, .99).toFixed(4)}`);
console.log(`  rider sideways   rms ${(rms(tot.side)*100).toFixed(2)} cm/frame²  p99 ${(pct(tot.side, .99)*100).toFixed(2)}   max ${(pct(tot.side, 1)*100).toFixed(2)}`);
console.log(`  bike pitch       rms ${rms(tot.pitch).toFixed(3)} °/frame²   p99 ${pct(tot.pitch, .99).toFixed(3)}`);
console.log(`  hops under .25 s ${(tot.hops/k).toFixed(1)} per km of ${(tot.airs/k).toFixed(1)} flights per km`);
if (errs.length) console.log('errors', errs.slice(0, 3));
await browser.close();
