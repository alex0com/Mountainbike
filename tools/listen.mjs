// A recording of the game's sound, for listening to outside the game: the tune with the ride's sounds over it,
// rendered offline in Chromium to a WAV file, with how loud it is.
//
//   node tools/listen.mjs [--out sound.wav] [--seconds 44] [--parts "music loops chimes thumps"] [--game other.html]
import {createRequire} from 'node:module';
import {execSync} from 'node:child_process';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const args = process.argv.slice(2), opt = (k, d)=> { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const here = path.dirname(fileURLToPath(import.meta.url));
const game = pathToFileURL(opt('game') || path.join(here, '..', 'Downhill MTB 3D.html')).href;
const out = opt('out', 'sound.wav'), seconds = +opt('seconds', 44), parts = opt('parts', 'music loops chimes thumps');

const browser = await playwright.chromium.launch({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio']});
const page = await browser.newPage({viewport: {width: 400, height: 300}});
const errors = []; page.on('pageerror', e=> errors.push(String(e)));
await page.goto(game + '?seed=1');
await page.waitForFunction(()=> window.__mtb && window.__mtb.info().state == 'title');
const r = await page.evaluate(([s, p])=> window.__mtb.audioPreview(s, p), [seconds, parts]);
const wav = Buffer.from(r.wav, 'base64');
fs.writeFileSync(out, wav);
console.log(`${out}: ${seconds} s of ${parts}, peak ${r.peak.toFixed(3)}, rms ${(20*Math.log10(r.rms)).toFixed(1)} dBFS`);
if (errors.length) console.log('page errors', errors);
await browser.close();
