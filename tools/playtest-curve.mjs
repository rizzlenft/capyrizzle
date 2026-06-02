#!/usr/bin/env node
/**
 * playtest-curve.mjs — difficulty curve + jump-math audit.
 * Complements playtest.mjs (pattern fairness at speed tiers).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'game.js'), 'utf8');

function num(name) {
  const m = SRC.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\-\\d.]+)\\s*;'));
  if (!m) throw new Error('missing: ' + name);
  return parseFloat(m[1]);
}
function array(name) {
  const m = SRC.match(new RegExp('const\\s+' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\n  \\])\\s*;'));
  const minDx = num('MIN_MULTI_FIRE_DX');
  return Function('const MIN_MULTI_FIRE_DX = ' + minDx + '; return (' + m[1] + ');')();
}
function obj(name) {
  const m = SRC.match(new RegExp('const\\s+' + name + '\\s*=\\s*(\\{[\\s\\S]*?\\n  \\})\\s*;'));
  return Function('return (' + m[1] + ');')();
}

const GRAVITY = num('GRAVITY');
const JUMP_V = num('JUMP_V');
const JUMP_CUT_V = num('JUMP_CUT_V');
const APEX_GRAV_MUL = num('APEX_GRAV_MUL');
const APEX_BAND = num('APEX_BAND');
const CROUCH_TIME = num('CROUCH_TIME');
const WARMUP = num('WARMUP_SPEED');
const MAX = num('MAX_SPEED');
const ABS = num('ABSOLUTE_MAX_SPEED');
const SURGE = num('SURGE_SPEED_MUL');
const BOOST = num('BOOST_MULT');
const MIN_DX = num('MIN_MULTI_FIRE_DX');
const WARMUP_TIME = num('WARMUP_TIME');
const RAMP = num('RAMP_PER_SEC');
const POST = num('POST_CAP_RAMP');
const FIRE_VARIANTS = obj('FIRE_VARIANTS');
const PATTERNS = array('PATTERNS');

function simulateJump(vy0) {
  let y = 0, vy = vy0, t = 0, peakUp = 0;
  const dt = 0.001;
  while (true) {
    const grav = Math.abs(vy) < APEX_BAND ? GRAVITY * APEX_GRAV_MUL : GRAVITY;
    vy += grav * dt;
    y += vy * dt;
    t += dt;
    if (y < peakUp) peakUp = y;
    if (y >= 0) break;
  }
  return { airtime: t, peakUp: -peakUp };
}

const FULL = simulateJump(JUMP_V);
const SHORT = simulateJump(JUMP_CUT_V);
const cycle = FULL.airtime + CROUCH_TIME + 0.05;

function speedAtTime(t) {
  if (t <= WARMUP_TIME) return WARMUP;
  const elapsed = t - WARMUP_TIME;
  const capElapsed = (MAX - WARMUP) / RAMP;
  let spd;
  if (elapsed <= capElapsed) spd = WARMUP + RAMP * elapsed;
  else spd = MAX + POST * (elapsed - capElapsed);
  return Math.min(ABS, spd);
}

const failures = [];
const surgeSpd = ABS * SURGE;

if (MIN_DX < Math.ceil(surgeSpd * cycle)) {
  failures.push(
    `MIN_MULTI_FIRE_DX ${MIN_DX} < surge need ${Math.ceil(surgeSpd * cycle)}`,
  );
}

const speeds = [
  ['WARMUP', WARMUP],
  ['MAX', MAX],
  ['ABS', ABS],
  ['SURGE', surgeSpd],
  ['BOOST@MAX', MAX * BOOST],
  ['BOOST@ABS', ABS * BOOST],
];

for (const [label, speed] of speeds) {
  for (const [variant, v] of Object.entries(FIRE_VARIANTS)) {
    const overlap = (num('TRUCK_W') - 28 - 12 + (v.w - 20 - 12)) / speed;
    if (FULL.airtime < overlap) {
      failures.push(`[full ${variant}] @ ${label}: overlap ${overlap.toFixed(3)}s > ${FULL.airtime.toFixed(3)}s`);
    }
  }
}

for (const pat of PATTERNS) {
  const fires = pat.items.filter((i) => i.kind === 'fire');
  for (let i = 1; i < fires.length; i++) {
    const dx = fires[i].dx - fires[i - 1].dx;
    for (const [label, speed] of speeds.filter((s) => !s[0].startsWith('BOOST'))) {
      if (dx / speed < cycle) {
        failures.push(`[${pat.name}] dx=${dx} @ ${label}: ${(dx / speed).toFixed(3)}s < ${cycle.toFixed(3)}s`);
      }
    }
  }
}

// Short hop is late-run only in game.js (canShortHop); log, do not fail.
const shortOverlap = (num('TRUCK_W') - 28 - 12 + (FIRE_VARIANTS.short.w - 20 - 12)) / WARMUP;
const shortHopNote = SHORT.airtime < shortOverlap
  ? ` (early run uses full hops — OK)`
  : '';

console.log('CapyRizzle — curve audit');
console.log('─'.repeat(50));
console.log(`Full jump: ${FULL.airtime.toFixed(3)}s  peak ${FULL.peakUp.toFixed(0)}px`);
console.log(`Short hop: ${SHORT.airtime.toFixed(3)}s  peak ${SHORT.peakUp.toFixed(0)}px${shortHopNote}`);
console.log(`Cycle @ surge: ${cycle.toFixed(3)}s  min dx: ${Math.ceil(surgeSpd * cycle)} (have ${MIN_DX})`);
console.log('Speed milestones:');
for (const t of [0, 10, 18, 30, 45, 60, 90, 120]) {
  console.log(`  t=${t}s → ${speedAtTime(t).toFixed(0)} px/s`);
}
console.log();
if (failures.length) {
  console.log(`✗ ${failures.length} issue(s):`);
  for (const f of failures) console.log('  • ' + f);
  process.exit(1);
}
console.log('✓ Jump math + MIN_MULTI_FIRE_DX OK at all tiers');
process.exit(0);
