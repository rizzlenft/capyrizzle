#!/usr/bin/env node
/**
 * Pre-ship audit — DOM wiring, deploy artifacts, meta tags, BUILD string.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

let failed = 0;
function fail(msg) {
  console.error('FAIL:', msg);
  failed++;
}
function ok(msg) {
  console.log('OK:', msg);
}

const html = read('index.html');
const game = read('game.js');
const css = read('style.css');

const buildM = game.match(/const BUILD = '([^']+)'/);
if (!buildM) fail('game.js missing BUILD constant');
else ok('BUILD = ' + buildM[1]);

const syntax = spawnSync(process.execPath, ['--check', resolve(root, 'game.js')], { encoding: 'utf8' });
if (syntax.status !== 0) fail('game.js syntax: ' + (syntax.stderr || '').trim());
else ok('game.js syntax valid');

for (const file of ['index.html', 'style.css', 'game.js', '.nojekyll']) {
  if (!existsSync(resolve(root, file))) fail('missing deploy file: ' + file);
  else ok('deploy artifact present: ' + file);
}

const workflow = read('.github/workflows/pages.yml');
for (const f of ['index.html', 'style.css', 'game.js', '.nojekyll']) {
  if (!workflow.includes(f)) fail('pages.yml does not copy ' + f);
}
ok('pages.yml copies static site files');

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const gameIds = new Set([...game.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
for (const id of gameIds) {
  if (!htmlIds.has(id)) fail('game.js references missing id="' + id + '"');
}
ok(`${gameIds.size} DOM ids wired in index.html`);

const requiredMeta = [
  'game:owner',
  'game:title',
  'game:event',
  'description',
  'og:title',
  'og:description',
];
for (const name of requiredMeta) {
  const re = name.includes(':')
    ? new RegExp(`name="${name.replace(':', '\\:')}"|property="${name.replace(':', '\\:')}"`)
    : new RegExp(`name="${name}"`);
  if (!re.test(html)) fail('missing meta: ' + name);
}
ok('CapyJam + OG meta tags present');

if (!html.includes('game.js')) fail('index.html missing game.js script');
if (!html.includes('style.css')) fail('index.html missing stylesheet');
ok('index.html loads game.js + style.css');

const canvas = html.match(/<canvas[^>]+width="(\d+)"[^>]+height="(\d+)"/);
const wM = game.match(/const W = (\d+)/);
const hM = game.match(/const H = (\d+)/);
if (canvas && wM && hM) {
  if (+canvas[1] !== +wM[1] || +canvas[2] !== +hM[1]) {
    fail(`canvas ${canvas[1]}×${canvas[2]} != game W/H ${wM[1]}×${hM[1]}`);
  } else ok(`canvas ${wM[1]}×${hM[1]} matches game constants`);
}

const totalKb = ['index.html', 'style.css', 'game.js']
  .reduce((n, f) => n + statSync(resolve(root, f)).size, 0) / 1024;
if (totalKb > 800) fail(`bundle ${totalKb.toFixed(0)} KB > 800 KB budget`);
else ok(`static bundle ${totalKb.toFixed(0)} KB`);

if (failed) {
  console.error(`\n✗ release audit: ${failed} failure(s)`);
  process.exit(1);
}
console.log('\n✓ release audit passed — ready to ship');
