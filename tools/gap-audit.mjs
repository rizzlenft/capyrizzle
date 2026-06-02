import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'game.js'), 'utf8');
function num(name) {
  return parseFloat(SRC.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\-\\d.]+)'))[1]);
}
function array(name) {
  const m = SRC.match(new RegExp('const\\s+' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\n  \\])\\s*;'));
  const minDx = num('MIN_MULTI_FIRE_DX');
  return Function('const MIN_MULTI_FIRE_DX = ' + minDx + '; return (' + m[1] + ');')();
}

const PATTERNS = array('PATTERNS');
const TRUCK_W = num('TRUCK_W');
const GRAVITY = num('GRAVITY');
const JUMP_V = num('JUMP_V');
const APEX_GRAV_MUL = num('APEX_GRAV_MUL');
const APEX_BAND = num('APEX_BAND');
const CROUCH_TIME = num('CROUCH_TIME');
const ABS = num('ABSOLUTE_MAX_SPEED');
const SURGE = num('SURGE_SPEED_MUL');
const HB_INNER = 6;
const effTruckW = () => TRUCK_W - 28 - HB_INNER * 2;

function simulateJump() {
  let y = 0, vy = JUMP_V, t = 0, peakUp = 0;
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

const J = simulateJump();
const cycle = J.airtime + CROUCH_TIME + 0.05;
const speeds = [
  { label: 'WARMUP', speed: 200 },
  { label: 'MAX', speed: 480 },
  { label: 'ABS', speed: ABS },
  { label: 'SURGE', speed: ABS * SURGE },
];

const failures = [];
for (const pat of PATTERNS) {
  const fires = pat.items.filter((i) => i.kind === 'fire');
  for (let i = 1; i < fires.length; i++) {
    const dx = fires[i].dx - fires[i - 1].dx;
    for (const { label, speed } of speeds) {
      if (dx / speed < cycle) {
        failures.push({
          pattern: pat.name,
          dx,
          label,
          speed,
          need: Math.ceil(speed * cycle),
          have: dx,
        });
      }
    }
  }
}

console.log('Jump cycle:', cycle.toFixed(3), 's  peak:', J.peakUp.toFixed(0), 'px');
console.log('Min dx @ ABS:', Math.ceil(ABS * cycle), '@ SURGE:', Math.ceil(ABS * SURGE * cycle));
console.log('Failures:', failures.length);
for (const f of failures) {
  console.log(`  ${f.pattern} dx=${f.dx} @ ${f.label} (${f.speed}) need≥${f.need} have=${f.have}`);
}
