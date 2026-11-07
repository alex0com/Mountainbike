// How much work and garbage a frame makes: whole frames (logic, particles, drawing, HUD) run by hand on autopilot,
// timed, with the JS heap sampled for who allocates what. The GL render itself is left out unless --gl is given
// (in a headless browser it is drawn in software, so its time says nothing about a real GPU).
//   node tools/perf.mjs [--frames 1800] [--seed 5] [--at 300] [--night] [--crash] [--gl] [--top 20] [--size 640x400] [--game other.html]
import {createRequire} from 'node:module';
import {execSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const args = process.argv.slice(2), opt = (k, d)=> { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1] ?? true; }, has = k=> args.includes('--' + k);
const here = path.dirname(fileURLToPath(import.meta.url));
const game = pathToFileURL(path.resolve(here, '..', opt('game', 'Downhill MTB Three.html'))).href;
const N = +opt('frames', 1800), seed = +opt('seed', 5), at = +opt('at', 300), top = +opt('top', 20), [W, H] = opt('size', '640x400').split('x').map(Number);
const browser = await playwright.chromium.launch({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--enable-precise-memory-info']});
const page = await browser.newPage({viewport: {width: W, height: H}});
const errs = []; page.on('pageerror', e=> errs.push(String(e.stack || e).slice(0, 300)));
await page.goto(`${game}?seed=${seed}`);
await page.waitForFunction(()=> window.__mtb && window.__mtb.info().state == 'title');
await page.evaluate(([at, night, crash, gl])=>
{
    const m = window.__mtb; setPaused(true);
    m.cam('3/4', 1); m.setDay(night ? .62 : .3); m.autopilot(true, 'back'); m.start(); m.teleport(at); m.frame(120);
    if (!gl) m.ev('renderer.render = ()=> {}');
    if (crash) m.crash('HIT A ROCK', 'front');
    m.frame(30);
}, [at, has('night'), has('crash'), has('gl')]);
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.startSampling', {samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true});
const r = await page.evaluate(N=>
{
    const m = window.__mtb, t = [];
    let heap = performance.memory.usedJSHeapSize, gcs = 0;
    for (let k = 0; k < N; ++k)
    {
        const a = performance.now(), i = m.frame(1);
        t.push(performance.now() - a);
        const h = performance.memory.usedJSHeapSize;
        if (h < heap) ++gcs;
        heap = h;
        if (i.state == 'results' || i.state == 'crash' && i.crashT > 8) { m.start(); m.teleport(i.px + 40); m.frame(30); }
    }
    return {t, gcs};
}, N);
const {profile} = await cdp.send('HeapProfiler.stopSampling');
const by = {}, byPath = {};
let total = 0;
(function walk(n, stack)
{
    const f = n.callFrame, name = (f.functionName || '(anon)') + ':' + (f.lineNumber + 1);
    total += n.selfSize;
    if (n.selfSize)
    {
        by[name] = (by[name] || 0) + n.selfSize;
        const p = [...stack, name].slice(-3).join(' < ');
        byPath[p] = (byPath[p] || 0) + n.selfSize;
    }
    for (const c of n.children) walk(c, [...stack, name]);
})(profile.head, []);
const t = [...r.t].sort((a, b)=> a - b), q = p=> t[Math.min(t.length - 1, floor(t.length*p))].toFixed(2), mean = t.reduce((s, v)=> s + v, 0)/t.length;
function floor(v) { return Math.floor(v); }
console.log(`${N} frames${has('gl') ? '' : ' (no GL render)'}: mean ${mean.toFixed(2)} ms, p50 ${q(.5)}, p90 ${q(.9)}, p99 ${q(.99)}, max ${t[t.length - 1].toFixed(1)} ms`);
console.log(`allocated ${(total/N/1024).toFixed(1)} KB a frame, ${r.gcs} collections seen`);
console.log('--- by function (KB a frame)');
for (const [k, v] of Object.entries(by).sort((a, b)=> b[1] - a[1]).slice(0, top)) console.log((v/N/1024).toFixed(1).padStart(7), k);
if (has('paths'))
{
    console.log('--- by call path');
    for (const [k, v] of Object.entries(byPath).sort((a, b)=> b[1] - a[1]).slice(0, top)) console.log((v/N/1024).toFixed(1).padStart(7), k);
}
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
