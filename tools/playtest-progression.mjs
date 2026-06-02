#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'game.js'), 'utf8');
function num(name) {
  const m = SRC.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\-\\d.]+)\\s*;'));
  if (!m) throw new Error('missing ' + name);
  return parseFloat(m[1]);
}
function secGap(name) {
  const m = SRC.match(new RegExp('const\\s+' + name + '\\s*=\\s*\\[([^\\]]+)\\]'));
  if (!m) throw new Error('missing ' + name);
  return m[1].split(',').map((s) => parseFloat(s.trim()));
}
function nums(name) {
  const m = SRC.match(new RegExp('const\\s+' + name + '\\s*=\\s*\\[([^\\]]+)\\]'));
  return m[1].split(',').map((s) => parseFloat(s.trim()));
}

const WARMUP = num('WARMUP_SPEED');
const WARMUP_TIME = num('WARMUP_TIME');
const RAMP = num('RAMP_PER_SEC');
const MAX = num('MAX_SPEED');
const POST = num('POST_CAP_RAMP');
const ABS = num('ABSOLUTE_MAX_SPEED');
const HEAT_AT = nums('HEAT_AT');
const TRAINING = num('TRAINING_SPAWNS');
const FIRST_SPAWN = num('FIRST_SPAWN_AT');
const GAP_EARLY = secGap('GAP_SEC_EARLY');
const GAP_LATE = secGap('GAP_SEC_LATE');

function speedAt(t) {
  if (t <= WARMUP_TIME) return WARMUP;
  const e = t - WARMUP_TIME;
  const cap = (MAX - WARMUP) / RAMP;
  let s = e <= cap ? WARMUP + RAMP * e : MAX + POST * (e - cap);
  return Math.min(ABS, s);
}

function heatTier(t) {
  let tier = 0;
  for (let i = HEAT_AT.length - 1; i >= 0; i--) {
    if (t >= HEAT_AT[i]) { tier = i; break; }
  }
  return tier;
}

const failures = [];
if (WARMUP < 260) failures.push('WARMUP_SPEED should be ≥260 (slow jumps feel harder)');
if (WARMUP > 340) failures.push('WARMUP_SPEED should be ≤340 for teachable first jump');
if (WARMUP_TIME > 8) failures.push('WARMUP_TIME flat period too long');
if (GAP_EARLY[1] > 3.5) failures.push('Early gap seconds too wide (dead time)');
if (GAP_LATE[1] > 2) failures.push('Late gap seconds too wide');

console.log('CapyRizzle — progression audit');
console.log('─'.repeat(52));
console.log(`Start ${WARMUP} px/s (${WARMUP_TIME}s flat) · gaps in seconds×speed`);
console.log(`Early ${GAP_EARLY[0]}–${GAP_EARLY[1]}s · late ${GAP_LATE[0]}–${GAP_LATE[1]}s between patterns`);
console.log();
for (const t of [0, 5, 10, 22, 42, 70, 95, 120]) {
  const spd = speedAt(t);
  const gapPx = GAP_EARLY[1] * spd;
  console.log(
    `  ${String(t).padStart(3)}s  ${String(spd.toFixed(0)).padStart(3)} px/s  heat×${heatTier(t)}  ` +
    `~${GAP_EARLY[1].toFixed(1)}s early gap ≈ ${gapPx.toFixed(0)}px`,
  );
}
console.log(`  First spawn ${FIRST_SPAWN}s · training patterns ${TRAINING}`);
console.log();
if (failures.length) {
  for (const f of failures) console.log('✗ ' + f);
  process.exit(1);
}
console.log('✓ Pace curve: faster start, tighter time-based gaps');
process.exit(0);
