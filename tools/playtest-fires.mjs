#!/usr/bin/env node
/**
 * Fire playability audit — parsed from game.js (no browser).
 * Ensures multi-fire patterns use readable variants and spacing.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'game.js'), 'utf8');

function extractBlock(name) {
  const re = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`);
  const m = src.match(re);
  if (!m) throw new Error(`missing ${name}`);
  return m[1];
}

function parseFireVariants() {
  const body = extractBlock('FIRE_VARIANTS');
  const out = {};
  for (const m of body.matchAll(/(\w+):\s*\{\s*w:\s*(\d+),\s*h:\s*(\d+)/g)) {
    out[m[1]] = { w: +m[2], h: +m[3] };
  }
  return out;
}

function parseVisScale() {
  const m = src.match(/const FIRE_VIS_SCALE = (\{[^}]+\})/);
  if (!m) throw new Error('missing FIRE_VIS_SCALE');
  return Function(`return ${m[1]}`)();
}

function parseMinDx() {
  const m = src.match(/const MIN_MULTI_FIRE_DX = (\d+)/);
  if (!m) throw new Error('missing MIN_MULTI_FIRE_DX');
  return +m[1];
}

function parsePatterns() {
  const start = src.indexOf('const PATTERNS = [');
  const end = src.indexOf('];', start);
  const block = src.slice(start, end);
  const patterns = [];
  const re = /\{\s*name:\s*'([^']+)'[\s\S]*?items:\s*\[([\s\S]*?)\]\s*\}/g;
  let m;
  while ((m = re.exec(block))) {
    const items = [];
    for (const it of m[2].matchAll(/kind:\s*'fire'[^}]*variant:\s*'(\w+)'/g)) {
      items.push(it[1]);
    }
    if (items.length) patterns.push({ name: m[1], variants: items });
  }
  return patterns;
}

const variants = parseFireVariants();
const visScale = parseVisScale();
const minDx = parseMinDx();
const patterns = parsePatterns();

const MIN_TRIPLE_H = 108;
const MIN_DOUBLE_H = 100;
let failed = false;

function fail(msg) {
  console.error('FAIL:', msg);
  failed = true;
}

function scaledSize(variant, fireCount) {
  const v = variants[variant] || variants.torch;
  const mul = visScale[Math.min(4, fireCount)] || 1;
  return { w: Math.round(v.w * mul), h: Math.round(v.h * mul) };
}

for (const p of patterns) {
  const n = p.variants.length;
  if (n < 2) continue;
  const minH = Math.min(...p.variants.map((v) => scaledSize(v, n).h));
  if (n >= 3 && p.variants.includes('short')) {
    fail(`${p.name}: triple+ pattern uses squat "short" variant`);
  }
  if (n >= 3 && minH < MIN_TRIPLE_H) {
    fail(`${p.name}: smallest fire h=${minH} (need >= ${MIN_TRIPLE_H})`);
  }
  if (n === 2 && minH < MIN_DOUBLE_H) {
    fail(`${p.name}: double smallest h=${minH} (need >= ${MIN_DOUBLE_H})`);
  }
  const maxW = Math.max(...p.variants.map((v) => scaledSize(v, n).w));
  if (minDx < maxW + 80) {
    fail(`${p.name}: MIN_MULTI_FIRE_DX ${minDx} tight vs fire w ${maxW}`);
  }
}

const tripleNames = patterns.filter((p) => p.variants.length >= 3).map((p) => p.name);
console.log(`Fire audit: ${patterns.length} patterns, ${tripleNames.length} triple+ sets`);
console.log('Triple+ patterns:', tripleNames.join(', '));
console.log('Vis scale:', visScale);
console.log('Variants:', variants);

if (failed) process.exit(1);
console.log('OK — fire sizes and spacing pass playability thresholds.');
