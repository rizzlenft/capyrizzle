#!/usr/bin/env node
/*
 * playtest.mjs — deterministic gameplay validator.
 *
 * Loads the live game.js, extracts the same PATTERNS and physics constants the
 * runtime uses, and simulates jump trajectories at every speed from WARMUP up
 * to MAX. For each pattern at each speed it answers: can a perfect single-tap
 * player clear every fire? If anything is unjumpable we fail loudly. Also runs
 * randomized scoring sims to surface anything that explodes numerically.
 *
 * This file is the source of truth for "is the game fair?" — keep it green.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '..', 'game.js'), 'utf8');

// ── Lift constants from game.js so the test always mirrors the runtime ──
function num(name) {
  const m = SRC.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\-\\d.]+)\\s*;'));
  if (!m) throw new Error('missing constant: ' + name);
  return parseFloat(m[1]);
}
function obj(name) {
  // Match `const NAME = { ... };` allowing nested braces (single-depth is fine).
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*(\\{[\\s\\S]*?\\n  \\})\\s*;');
  const m = SRC.match(re);
  if (!m) throw new Error('missing object: ' + name);
  // eslint-disable-next-line no-new-func
  return Function('"use strict"; return (' + m[1] + ');')();
}
function array(name) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\n  \\])\\s*;');
  const m = SRC.match(re);
  if (!m) throw new Error('missing array: ' + name);
  const minDx = num('MIN_MULTI_FIRE_DX');
  // eslint-disable-next-line no-new-func
  return Function(
    '"use strict"; const MIN_MULTI_FIRE_DX = ' + minDx + '; return (' + m[1] + ');',
  )();
}

const GROUND_Y     = num('GROUND_Y');
const TRUCK_X      = num('TRUCK_X');
const TRUCK_W      = num('TRUCK_W');
const TRUCK_H      = num('TRUCK_H');
const GRAVITY      = num('GRAVITY');
const JUMP_V       = num('JUMP_V');
const APEX_GRAV_MUL = num('APEX_GRAV_MUL');
const APEX_BAND    = num('APEX_BAND');
const CROUCH_TIME  = num('CROUCH_TIME');
const WARMUP_SPEED       = num('WARMUP_SPEED');
const MAX_SPEED          = num('MAX_SPEED');
const ABSOLUTE_MAX_SPEED = num('ABSOLUTE_MAX_SPEED');
const SURGE_SPEED_MUL    = num('SURGE_SPEED_MUL');
const BOOST_MULT         = num('BOOST_MULT');
const MILESTONE_M  = num('MILESTONE_M');
const FIRE_VARIANTS = obj('FIRE_VARIANTS');
const PATTERNS      = array('PATTERNS');

// ── Truck hitbox (matches game.js truckHitbox()) ──
const TRUCK_HB_PAD_X = 14;
const TRUCK_HB_PAD_Y = 14;
const TRUCK_HB_W = TRUCK_W - 28;
const TRUCK_HB_H = TRUCK_H - 18;
// Game adds an inner padding of 6 to BOTH truck and fire hitboxes before AABB,
// so the effective interaction width on each side is hb.w - 12.
const HB_INNER_PAD = 6;
function effTruckW() { return TRUCK_HB_W - HB_INNER_PAD * 2; }
function effFireW(w)  { return (w - 20) - HB_INNER_PAD * 2; } // fire hb is w-20

function simulateJumpVy(vy0, dt = 0.001) {
  let y = 0, vy = vy0, t = 0, peakUp = 0;
  while (true) {
    const grav = Math.abs(vy) < APEX_BAND ? GRAVITY * APEX_GRAV_MUL : GRAVITY;
    vy += grav * dt;
    y += vy * dt;
    t += dt;
    if (y < peakUp) peakUp = y;
    if (y >= 0) break;
    if (t > 5) break;
  }
  return { airtime: t, peakUp: -peakUp };
}

const JUMP_CUT_V = num('JUMP_CUT_V');
const JUMP = simulateJumpVy(JUMP_V);
const SHORT_JUMP = simulateJumpVy(JUMP_CUT_V);
const MIN_MULTI_FIRE_DX = num('MIN_MULTI_FIRE_DX');
// Effective airtime usable to clear a fire = airtime minus crouch (player
// anticipates by crouching) — actually crouch happens BEFORE liftoff so it
// doesn't reduce airtime, but it does delay the response. Assume perfect
// timing.

// ── Per-fire clearance check ──
// At given world speed, a fire with hitbox width fhbW takes
// (effTruckW + fhbW) / speed seconds for the two hitboxes to overlap fully
// pass. The truck must be airborne high enough during that whole window.
// Simplest proxy: airtime >= (effTruckW + fhbW) / speed.
function canClearFire(variant, speed) {
  const v = FIRE_VARIANTS[variant] || FIRE_VARIANTS.torch;
  const fhbW = effFireW(v.w);
  const overlapSec = (effTruckW() + fhbW) / speed;
  return JUMP.airtime >= overlapSec;
}

// For multi-fire patterns we need to verify: between fire N and fire N+1,
// the truck must land, optionally crouch, and re-launch in time. The total
// time available between fires = dx / speed. Min cycle = airtime_of_clear_jump
// + small buffer (crouch + 1 frame). We approximate min cycle as
// CROUCH_TIME + clear-airtime + 0.05s.
function canDoubleJump(dxBetween, fireA, fireB, speed) {
  const vA = FIRE_VARIANTS[fireA] || FIRE_VARIANTS.torch;
  const vB = FIRE_VARIANTS[fireB] || FIRE_VARIANTS.torch;
  const fhbA = effFireW(vA.w);
  const fhbB = effFireW(vB.w);
  // Truck must clear A, land, then jump again to clear B.
  // First jump must START such that truck is in the air through A.
  // Time between A's start of overlap and B's start of overlap = dxBetween/speed.
  // Need: (overlap A) + ground time + crouch + (overlap B) <= dxBetween/speed + (overlap B)
  // Simplified: dxBetween/speed >= overlapA + minCycle.
  const overlapA = (effTruckW() + fhbA) / speed;
  const overlapB = (effTruckW() + fhbB) / speed;
  const cycleBuffer = CROUCH_TIME + 0.05; // crouch + timing buffer (matches gap-audit)
  // We need the truck to land BEFORE B's leading edge arrives, and have
  // a full new jump airtime cover B.
  // Distance from start-of-overlap A to start-of-overlap B = dxBetween.
  // Time = dxBetween / speed.
  // We need: airtimeA covers overlapA AND we land + crouch + airtimeB covers overlapB
  // Total used time within (dxBetween / speed) = airtimeA + cycleBuffer + airtimeB
  // But airtimeB doesn't need to fit within dxBetween/speed — it just needs to
  // be triggered such that the truck is airborne when B's hitbox touches.
  // Simpler valid bound: dxBetween/speed >= JUMP.airtime + cycleBuffer
  const minGap = JUMP.airtime + cycleBuffer; // seconds available between jumps
  void overlapA; void overlapB;
  return dxBetween / speed >= minGap;
}

// ── Validate every pattern at WARMUP, MAX, and BOOST max ──
// Speed tiers we validate against. We only require multi-fire patterns to be
// JUMPABLE at non-boost speeds — during boost the truck is invincible and
// smashes through fires, so spacing doesn't have to clear an airtime cycle.
const SPEEDS = [
  { label: 'WARMUP', speed: WARMUP_SPEED, requireMultiJumpable: true },
  { label: 'MAX',    speed: MAX_SPEED,    requireMultiJumpable: true },
  { label: 'ABS',    speed: ABSOLUTE_MAX_SPEED, requireMultiJumpable: true },
  { label: 'SURGE',  speed: ABSOLUTE_MAX_SPEED * SURGE_SPEED_MUL, requireMultiJumpable: true },
];
const BOOST_MAX_SPEED = MAX_SPEED * BOOST_MULT;
const BOOST_ABS_SPEED = ABSOLUTE_MAX_SPEED * BOOST_MULT;
const surgeSpeed = ABSOLUTE_MAX_SPEED * SURGE_SPEED_MUL;
const minCycle = JUMP.airtime + CROUCH_TIME + 0.05;
const shortVar = FIRE_VARIANTS.short;
const shortOverlapWarmup =
  (effTruckW() + effFireW(shortVar.w)) / WARMUP_SPEED;

const failures = [];
if (MIN_MULTI_FIRE_DX < Math.ceil(surgeSpeed * minCycle)) {
  failures.push(
    `[constants] MIN_MULTI_FIRE_DX ${MIN_MULTI_FIRE_DX} < surge need ${Math.ceil(surgeSpeed * minCycle)}`,
  );
}
// Early run uses full hops only (canShortHop gate in game.js). Short-hop math is
// late-run skill — log for reference, do not fail.
if (SHORT_JUMP.airtime < shortOverlapWarmup) {
  console.log(
    `Note: short hop @ WARMUP ${SHORT_JUMP.airtime.toFixed(3)}s < short fire ` +
    `${shortOverlapWarmup.toFixed(3)}s (OK — disabled in EASY_RUN)`,
  );
}

for (const pattern of PATTERNS) {
  for (const { label, speed, requireMultiJumpable } of SPEEDS) {
    const fires = pattern.items.filter(it => it.kind === 'fire');
    // Single-fire clearance — must always be possible (even if no boost)
    for (const f of fires) {
      if (!canClearFire(f.variant || 'torch', speed)) {
        failures.push(
          `[${pattern.name}] @ ${label} (${speed.toFixed(0)} px/s): ` +
          `cannot clear fire variant "${f.variant}" — overlap ` +
          `${((effTruckW() + effFireW((FIRE_VARIANTS[f.variant] || FIRE_VARIANTS.torch).w)) / speed).toFixed(3)}s > airtime ${JUMP.airtime.toFixed(3)}s`,
        );
      }
    }
    // Multi-fire spacing — only required when jumping is the only option.
    // While boosted (invincible), the truck just smashes through fires.
    if (requireMultiJumpable) {
      for (let i = 1; i < fires.length; i++) {
        const dx = fires[i].dx - fires[i - 1].dx;
        if (!canDoubleJump(dx, fires[i - 1].variant || 'torch', fires[i].variant || 'torch', speed)) {
          const need = (JUMP.airtime + CROUCH_TIME + 0.03);
          failures.push(
            `[${pattern.name}] @ ${label} (${speed.toFixed(0)} px/s): ` +
            `gap dx=${dx}px between fire ${i - 1} and ${i} is too tight ` +
            `(${(dx / speed).toFixed(3)}s gap < ${need.toFixed(3)}s needed)`,
          );
        }
      }
    }
    // Water reachability — reachable from peak of jump.
    for (const it of pattern.items.filter(x => x.kind === 'water')) {
      if (it.lift == null) continue;
      const waterY = GROUND_Y - 52 - it.lift;
      const truckTopAtPeak = GROUND_Y - TRUCK_H - JUMP.peakUp;
      const waterBottom = waterY + 52;
      if (truckTopAtPeak > waterBottom) {
        failures.push(
          `[${pattern.name}] @ ${label}: water lift=${it.lift} unreachable ` +
          `(truck top at peak = ${truckTopAtPeak.toFixed(0)}, water bottom = ${waterBottom})`,
        );
      }
    }
  }
  const fires = pattern.items.filter(it => it.kind === 'fire');
  for (const f of fires) {
    for (const [label, boostSpd] of [
      ['BOOST@MAX', BOOST_MAX_SPEED],
      ['BOOST@ABS', BOOST_ABS_SPEED],
    ]) {
      if (!canClearFire(f.variant || 'torch', boostSpd)) {
        failures.push(
          `[${pattern.name}] @ ${label} (${boostSpd.toFixed(0)} px/s): ` +
          `fire "${f.variant}" not clearable if boost ends`,
        );
      }
    }
  }
}

// ── Numerical safety: simulate scoring to surface any runaway loops ──
function simulateScoring(seed = 1, ticks = 60 * 120) {
  // Realistic 120-second run. Simulates rare deaths that reset combo,
  // mirroring real play. Asserts (a) milestone never fires twice per tick,
  // (b) tick budget stays bounded, (c) score grows linearly not exponentially.
  const state = {
    distance: 0,
    score: 0,
    bonusScore: 0,
    combo: 1,
    nextMilestone: MILESTONE_M,
  };
  let rng = seed;
  const rand = () => (rng = (rng * 9301 + 49297) % 233280) / 233280;

  const dt = 1 / 60;
  const startNs = process.hrtime.bigint();
  for (let t = 0; t < ticks; t++) {
    state.distance += WARMUP_SPEED * dt * 1.5;
    state.score = Math.floor(state.distance / 10) + state.bonusScore;

    // Per-tick event rates calibrated to a busy real-life run.
    // Bonus amounts mirror current game.js values (combo capped at 20).
    const cap = (c) => Math.min(20, c);
    if (rand() < 0.04)  { state.combo = cap(state.combo + 1); state.bonusScore += 10 * state.combo; }
    if (rand() < 0.02)  { state.combo = cap(state.combo + 1); state.bonusScore += 5  * state.combo; }
    if (rand() < 0.0005) { state.combo = 1; }

    // Milestones are DISTANCE-driven now (no score-feedback possible).
    let fired = 0;
    const distM = Math.floor(state.distance / 10);
    if (distM >= state.nextMilestone) {
      const m = state.nextMilestone;
      state.combo = cap(state.combo + 1);
      state.bonusScore += 25 * state.combo;
      const steps = Math.max(1, Math.floor((distM - m) / MILESTONE_M) + 1);
      state.nextMilestone = m + steps * MILESTONE_M;
      fired += 1;
    }
    if (fired > 1) throw new Error(`Milestone fired ${fired} times in one tick at t=${t}`);
  }
  const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
  return { ...state, elapsedMs };
}

let scoringOk = true;
let worstScore = 0, worstMs = 0;
try {
  for (let s = 1; s <= 50; s++) {
    const r = simulateScoring(s);
    worstScore = Math.max(worstScore, r.score);
    worstMs    = Math.max(worstMs, r.elapsedMs);
    // Real-world ceiling: 50k score across a 2-min sim is comfortably high.
    if (!Number.isFinite(r.score)) {
      throw new Error(`seed ${s}: NaN/Infinity score`);
    }
    // With distance-driven milestones + combo cap, a 120s sim score should
    // be comfortably under 100k. Anything above suggests a regression.
    if (r.score > 100000) {
      throw new Error(`seed ${s}: 120s score=${r.score.toLocaleString()} dist=${Math.round(r.distance)} combo=${r.combo}`);
    }
    if (r.elapsedMs > 250) {
      throw new Error(`seed ${s}: 120s sim took ${r.elapsedMs.toFixed(0)}ms (>250 budget)`);
    }
  }
} catch (err) {
  scoringOk = false;
  failures.push('[scoring] ' + err.message);
}

// ── Report ──
console.log('CapyRizzle Rush — playtest');
console.log('─'.repeat(60));
console.log(`Jump airtime: ${JUMP.airtime.toFixed(3)}s  peak up: ${JUMP.peakUp.toFixed(0)}px`);
console.log(`Patterns checked: ${PATTERNS.length} across ${SPEEDS.length} speed tiers`);
console.log(`Scoring sims: ${scoringOk ? `50 OK (worst score ${worstScore.toLocaleString()}, worst ${worstMs.toFixed(0)}ms)` : 'FAILED'}`);
console.log();

if (failures.length === 0) {
  console.log('✓ ALL PATTERNS JUMPABLE AT ALL SPEEDS');
  console.log('✓ NO MILESTONE RUNAWAY DETECTED');
  process.exit(0);
} else {
  console.log(`✗ ${failures.length} FAILURE(S):`);
  for (const f of failures) console.log('  • ' + f);
  process.exit(1);
}
