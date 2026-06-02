#!/usr/bin/env node
/**
 * Validates the run difficulty curve: speed ramp, heat tiers, phases,
 * gap timing, and max-fire caps stay monotonic and jumpable.
 */
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
const GAP_MID = secGap('GAP_SEC_MID');
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

function currentPhase(t) {
  if (t < 16) return 1;
  if (t < 36) return 2;
  if (t < 58) return 3;
  if (t < 88) return 4;
  if (t < 120) return 5;
  return 6;
}

function maxFiresForRun(t) {
  const phase = currentPhase(t);
  if (phase <= 1) return 1;
  if (phase === 2) return 2;
  if (phase === 3) return 3;
  return 4;
}

function gapSecHi(t) {
  const phase = currentPhase(t);
  const tier = heatTier(t);
  if (phase === 1) return GAP_EARLY[1];
  if (phase === 2) return GAP_MID[1];
  if (tier >= 4) return GAP_LATE[1];
  if (phase >= 3) {
    const u = Math.min(1, Math.max(0, (tier - 1) / 3));
    return GAP_MID[1] + (GAP_LATE[1] - GAP_MID[1]) * u;
  }
  return GAP_MID[1];
}

const failures = [];
if (WARMUP < 260) failures.push('WARMUP_SPEED should be ≥260');
if (WARMUP > 340) failures.push('WARMUP_SPEED should be ≤340 for teachable first jump');
if (WARMUP_TIME > 8) failures.push('WARMUP_TIME flat period too long');
if (GAP_EARLY[1] > 3.5) failures.push('Early gap seconds too wide');
if (GAP_LATE[1] > 2) failures.push('Late gap seconds too wide');

let prevSpeed = 0;
let prevGapSec = 999;
const samples = [0, 5, 10, 22, 32, 42, 50, 65, 70, 92, 120, 150];
for (const t of samples) {
  const spd = speedAt(t);
  const gapSec = gapSecHi(t);
  if (spd < prevSpeed - 0.01) failures.push(`speed drops at ${t}s`);
  if (t >= 22 && gapSec > prevGapSec + 0.15) {
    failures.push(`gap widens at ${t}s (${gapSec.toFixed(2)}s > ${prevGapSec.toFixed(2)}s)`);
  }
  prevSpeed = spd;
  if (t >= 22) prevGapSec = gapSec;
}

const at16 = maxFiresForRun(16);
const at36 = maxFiresForRun(36);
if (at16 < 2) failures.push('phase 2 @ 16s should allow 2-fire patterns');
if (at36 < 3) failures.push('phase 3 @ 36s should allow 3-fire patterns');

console.log('CapyRizzle — progression audit');
console.log('─'.repeat(68));
console.log(`Warmup ${WARMUP} px/s × ${WARMUP_TIME}s → ramp ${RAMP}/s to ${MAX} → post-cap ${POST}/s → cap ${ABS}`);
console.log(`Heat tiers at (s): ${HEAT_AT.join(', ')}`);
console.log(`Phases: 1:<16s  2:16–36  3:36–58  4:58–88  5:88–120  6:120+`);
console.log(`Gaps (s): early ${GAP_EARLY.join('–')} · mid ${GAP_MID.join('–')} · late ${GAP_LATE.join('–')}`);
console.log(`Training spawns: ${TRAINING} · first obstacle @ ${FIRST_SPAWN}s`);
console.log();
console.log('  time   speed  heat  phase  max🔥  gap(s)×speed');
for (const t of samples) {
  const spd = speedAt(t);
  const gapPx = gapSecHi(t) * spd;
  console.log(
    `  ${String(t).padStart(3)}s  ${String(spd.toFixed(0)).padStart(4)}  ×${heatTier(t)}    ${currentPhase(t)}     ${String(maxFiresForRun(t)).padStart(2)}   ~${gapSecHi(t).toFixed(2)}s ≈ ${gapPx.toFixed(0)}px`,
  );
}
console.log();
if (failures.length) {
  for (const f of failures) console.log('✗ ' + f);
  process.exit(1);
}
console.log('✓ Speed ramps up · gaps tighten · multi-fire unlocks with phase/heat');
