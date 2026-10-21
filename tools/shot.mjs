// Screenshots of the game at chosen moments, for checking how things look.
//
//   node tools/shot.mjs --seed 3 --at 800 --view SIDE --zoom 1 --day .3 --out shot.png [--frames 40] [--js "code"] [--game other.html]
// --at teleports the rider to that distance down the track and rides on for --frames frames before the shot;
// --js runs in the page after that, then a few more frames are rendered (for example to start a trick).
import {createRequire} from 'node:module';
import {execSync} from 'node:child_process';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }

const args = process.argv.slice(2), opt = (k, d)=> { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const here = path.dirname(fileURLToPath(import.meta.url));
// --game shoots another copy of the page
const game = pathToFileURL(opt('game') || path.join(here, '..', 'Downhill MTB 3D.html')).href;
const [w, h] = (opt('size', '900x600')).split('x').map(Number);

const browser = await playwright.chromium.launch({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio']});
const page = await browser.newPage({viewport: {width: w, height: h}});
page.on('pageerror', e=> console.log('page error: ' + e));
await page.goto(game + '?seed=' + opt('seed', 1));
await page.waitForFunction(()=> window.__mtb && window.__mtb.info().state == 'title');
await page.evaluate(({at, view, zoom, day, frames, auto})=>
{
    const m = window.__mtb;
    setPaused(true);
    if (view) m.cam(view, zoom);
    if (day !== undefined) m.setDay(day);
    m.autopilot(auto, false);
    if (at)
    {
        m.start();
        m.teleport(at);
        // build the chunks around the rider, then ride on to settle the camera
        m.sim(+frames);
    }
    if (day !== undefined) m.setDay(day);
}, {at: +opt('at', 0), view: opt('view'), zoom: +opt('zoom', 1), day: opt('day') === undefined ? undefined : +opt('day'),
    frames: opt('frames', 40), auto: opt('auto', '1') == '1'});
const js = opt('js');
// whatever the code gives back is printed
if (js) { const r = await page.evaluate(js); if (r !== undefined) console.log(typeof r == 'string' ? r : JSON.stringify(r)); }
// let the engine draw a few frames of the paused scene
await page.waitForTimeout(600);
await page.screenshot({path: opt('out', 'shot.png')});
await browser.close();
