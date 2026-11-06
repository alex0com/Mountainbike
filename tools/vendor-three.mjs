// Bundles the parts of three.js the game uses into one minified script that sets a global THREE, and puts it into
// the game's page between <script id="three-js"> and its </script>, so the game stays one self-contained file.
//
//   node tools/vendor-three.mjs [--html "Downhill MTB Three.html"] [--three 0.187.0]
//
// It installs three and esbuild into a temporary folder (npm needs the network), so nothing is added to the repo
// but the bundle inside the page. Add a name to NAMES when the game starts using another part of three.
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const args = process.argv.slice(2), opt = (k, d)=> { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const here = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(here, '..', opt('html', 'Downhill MTB Three.html')), version = opt('three', '0.187.0');

export const NAMES = [
    // the renderer, the scene and the camera
    'WebGLRenderer', 'WebGLRenderTarget', 'DepthTexture', 'Scene', 'Group', 'Object3D', 'PerspectiveCamera', 'OrthographicCamera',
    'Fog', 'Color', 'ColorManagement', 'Vector2', 'Vector3', 'Vector4', 'Matrix3', 'Matrix4', 'Quaternion', 'Euler', 'Frustum', 'Sphere', 'Box3',
    // what is drawn
    'Mesh', 'InstancedMesh', 'Points', 'Sprite', 'BufferGeometry', 'BufferAttribute', 'Float32BufferAttribute', 'Uint16BufferAttribute',
    'Uint32BufferAttribute', 'InstancedBufferAttribute', 'InstancedBufferGeometry', 'DynamicDrawUsage', 'StaticDrawUsage',
    'PlaneGeometry', 'SphereGeometry',
    // how it looks
    'MeshPhongMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial', 'ShaderMaterial', 'PointsMaterial', 'SpriteMaterial', 'ShaderChunk',
    'UniformsLib', 'UniformsUtils', 'CanvasTexture', 'DataTexture', 'Texture',
    'HemisphereLight', 'DirectionalLight', 'PointLight', 'AmbientLight',
    // constants
    'FrontSide', 'BackSide', 'DoubleSide', 'NormalBlending', 'AdditiveBlending', 'NoBlending', 'PCFShadowMap', 'PCFSoftShadowMap', 'BasicShadowMap',
    'LinearSRGBColorSpace', 'SRGBColorSpace', 'NoToneMapping', 'LinearFilter', 'NearestFilter', 'LinearMipmapLinearFilter', 'ClampToEdgeWrapping',
    'RGBAFormat', 'RedFormat', 'UnsignedByteType', 'FloatType', 'UnsignedIntType', 'UnsignedShortType', 'DepthFormat'];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-three-'));
const run = c=> execSync(c, {cwd: tmp, stdio: ['ignore', 'pipe', 'inherit']}).toString();
fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"vendor-three","private":true}');
run(`npm i --silent --no-audit --no-fund three@${version} esbuild@0.25.10`);
fs.writeFileSync(path.join(tmp, 'entry.js'), `export {${NAMES.join(', ')}} from 'three';\nexport const REVISION = '${version}';\n`);
run(`npx esbuild entry.js --bundle --minify --format=iife --global-name=THREE --legal-comments=none --target=es2020 --outfile=three.js`);
const code = fs.readFileSync(path.join(tmp, 'three.js'), 'utf8').trim();
fs.rmSync(tmp, {recursive: true, force: true});

const page = fs.readFileSync(html, 'utf8'), open = '<script id="three-js">', a = page.indexOf(open), b = page.indexOf('</script>', a);
if (a < 0 || b < 0) throw new Error(`no ${open} in ${html}`);
const banner = `// three.js ${version} - MIT License - Copyright 2010-2025 three.js authors - https://threejs.org\n` +
    `// (the parts the game uses, bundled by tools/vendor-three.mjs)\n`;
fs.writeFileSync(html, page.slice(0, a + open.length) + '\n' + banner + code.replace(/<\/script/gi, '<\\/script') + '\n' + page.slice(b));
console.log(`three ${version}: ${(code.length/1024).toFixed(0)} KB into ${path.basename(html)}`);
