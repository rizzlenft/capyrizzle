/* CapyRizzle Rush — main game */
(() => {
  'use strict';

  // ───────────────────────────────────────────────────────────────────────
  // Setup
  // ───────────────────────────────────────────────────────────────────────
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;   // 960
  const H = canvas.height;  // 540

  const $ = (id) => document.getElementById(id);
  const elTitle = $('title');
  const elGameOver = $('gameover');
  const elHud = $('hud');
  const elScore = $('score');
  const elBest = $('best');
  const elBoost = $('boost');
  const elFinal = $('finalScore');
  const elFinalBest = $('finalBest');
  const btnStart = $('start');
  const btnRetry = $('retry');

  // ───────────────────────────────────────────────────────────────────────
  // Constants (tuning)
  // ───────────────────────────────────────────────────────────────────────
  const GROUND_Y = 440;             // top of the road surface
  const TRUCK_X  = 200;             // truck screen x (stays fixed)
  const TRUCK_W  = 130;
  const TRUCK_H  = 80;
  const GRAVITY  = 2400;            // px/s^2
  const JUMP_V   = -900;            // initial jump velocity

  const BASE_SPEED = 300;           // starting world speed (px/s)
  const MAX_SPEED  = 980;
  const SPEED_RAMP = 1.05;          // speed gained per second of play

  const BOOST_MULT = 1.55;          // speed multiplier while boosting
  const BOOST_TIME_PER_WATER = 2.5; // seconds of boost per water pickup
  const BOOST_MAX_TIME = 6.0;       // cap total boost time
  const BOOST_SCORE_MULT = 2.0;     // score multiplier while boosting

  const GRACE_TIME = 1.2;           // seconds before first obstacles can spawn
  // Pickups always hover above ground so they can never be mistaken for enemies.
  const PICKUP_MIN_LIFT = 70;       // px above ground for a "low" pickup
  const PICKUP_MAX_LIFT = 170;      // px above ground for a "high" pickup

  const HIGHSCORE_KEY = 'capyrizzlerush_best_v2';

  // ───────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────
  /** @type {'title'|'playing'|'gameover'} */
  let mode = 'title';

  const input = { down: false, pressedAt: 0, released: true };

  const truck = {
    x: TRUCK_X,
    y: GROUND_Y - TRUCK_H,
    vy: 0,
    onGround: true,
    squash: 1,         // y-scale for squash & stretch
    stretch: 1,        // x-scale
    rot: 0,            // rotation while airborne
    spin: 0,           // spin velocity
  };

  let speed = BASE_SPEED;
  let distance = 0;          // total world distance traveled (px)
  let score = 0;             // distance/10 = meters
  let best = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;

  let boostTime = 0;         // seconds of boost remaining
  let boosting = false;
  let runTime = 0;           // seconds since run started (grace + hints)

  let shakeT = 0;            // remaining seconds of shake
  let shakeMag = 0;          // current magnitude

  /** @type {Array<{x:number,y:number,w:number,h:number,kind:string,phase:number}>} */
  const obstacles = [];
  /** @type {Array<{x:number,y:number,w:number,h:number,kind:string,phase:number,taken?:boolean}>} */
  const pickups = [];
  /** @type {Array<{x:number,y:number,vx:number,vy:number,life:number,max:number,color:string,size:number,kind:string,grav?:number}>} */
  const particles = [];
  /** @type {Array<{x:number,y:number,life:number,max:number,text:string,color:string,vy:number}>} */
  const popups = [];

  let nextSpawnDist = 200;    // distance until next obstacle spawn
  let nextPickupDist = 350;

  // Parallax layers (offsets)
  const bg = {
    sky: 0,
    far: 0,
    mid: 0,
    near: 0,
    road: 0,
  };

  // ───────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────
  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
  const lerp  = (a, b, t) => a + (b - a) * t;
  const rand  = (lo, hi) => lo + Math.random() * (hi - lo);
  const randi = (lo, hi) => Math.floor(rand(lo, hi + 1));
  const pick  = (arr) => arr[(Math.random() * arr.length) | 0];
  // Positive modulo (JS % keeps the sign of the dividend, which breaks
  // building heights at negative indices).
  const pmod  = (n, m) => ((n % m) + m) % m;

  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function shake(mag, dur) {
    shakeMag = Math.max(shakeMag, mag);
    shakeT   = Math.max(shakeT, dur);
  }

  function popup(text, x, y, color) {
    popups.push({ x, y, life: 0.9, max: 0.9, text, color: color || '#fff7e0', vy: -60 });
  }

  function setMode(m) {
    mode = m;
    elTitle.classList.toggle('hidden', m !== 'title');
    elGameOver.classList.toggle('hidden', m !== 'gameover');
    elHud.classList.toggle('hidden', m !== 'playing');
  }

  // ───────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ───────────────────────────────────────────────────────────────────────
  function resetRun() {
    truck.x = TRUCK_X;
    truck.y = GROUND_Y - TRUCK_H;
    truck.vy = 0;
    truck.onGround = true;
    truck.squash = 1;
    truck.stretch = 1;
    truck.rot = 0;
    truck.spin = 0;

    speed = BASE_SPEED;
    distance = 0;
    score = 0;
    boostTime = 0;
    boosting = false;
    runTime = 0;

    obstacles.length = 0;
    pickups.length = 0;
    particles.length = 0;
    popups.length = 0;

    // Initial spawn timing uses a grace period so the player isn't
    // ambushed on frame 1. The first obstacle is also pushed further out.
    nextSpawnDist = 700;
    nextPickupDist = 500;

    shakeT = 0;
    shakeMag = 0;
  }

  function startGame() {
    resetRun();
    setMode('playing');
  }

  function gameOver() {
    if (score > best) {
      best = score;
      try { localStorage.setItem(HIGHSCORE_KEY, String(best)); } catch {}
    }
    elFinal.textContent = String(score);
    elFinalBest.textContent = String(best);
    shake(14, 0.5);
    spawnCrashBurst(truck.x + TRUCK_W * 0.5, truck.y + TRUCK_H * 0.5);
    setMode('gameover');
  }

  // ───────────────────────────────────────────────────────────────────────
  // Input
  // ───────────────────────────────────────────────────────────────────────
  function pressDown(e) {
    if (e && e.cancelable) e.preventDefault();
    input.down = true;
    input.released = false;
    input.pressedAt = performance.now();

    if (mode === 'title') {
      // tap-anywhere to start (but the visible PLAY button works too)
      // Only react if event is on canvas / stage, not on UI buttons
      const t = e && e.target;
      if (!t || (t !== btnStart && t !== btnRetry)) startGame();
      return;
    }
    if (mode === 'gameover') {
      const t = e && e.target;
      if (!t || (t !== btnStart && t !== btnRetry)) startGame();
      return;
    }
    if (mode === 'playing') {
      tryJump();
    }
  }

  function pressUp(e) {
    if (e && e.cancelable) e.preventDefault();
    input.down = false;
    input.released = true;
  }

  function tryJump() {
    if (truck.onGround) {
      truck.vy = JUMP_V;
      truck.onGround = false;
      truck.squash = 0.7;
      truck.stretch = 1.25;
      truck.spin = -3.2;
      spawnJumpPuff();
      sfxJump();
    }
  }

  // Pointer/touch
  canvas.addEventListener('pointerdown', pressDown);
  window.addEventListener('pointerup', pressUp);
  window.addEventListener('pointercancel', pressUp);
  // overlay tap also starts
  elTitle.addEventListener('pointerdown', pressDown);
  elGameOver.addEventListener('pointerdown', pressDown);
  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') pressDown(e);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') pressUp(e);
  });
  // Buttons
  btnStart.addEventListener('click', () => startGame());
  btnRetry.addEventListener('click', () => startGame());

  // ───────────────────────────────────────────────────────────────────────
  // Spawning
  // ───────────────────────────────────────────────────────────────────────
  function spawnObstacle() {
    const kind = pick(['fire', 'fire', 'hydrant', 'cone', 'firepit']);
    let w, h, y;
    switch (kind) {
      case 'fire':    w = 46; h = 70; y = GROUND_Y - h; break;
      case 'hydrant': w = 44; h = 56; y = GROUND_Y - h; break;
      case 'cone':    w = 40; h = 52; y = GROUND_Y - h; break;
      case 'firepit': w = 110; h = 36; y = GROUND_Y - h; break;
      default:        w = 40; h = 60; y = GROUND_Y - h;
    }
    obstacles.push({ x: W + 60, y, w, h, kind, phase: Math.random() * Math.PI * 2 });
  }

  function spawnPickup() {
    const kind = Math.random() < 0.75 ? 'water' : 'donut';
    let w, h, y;
    // ALWAYS lifted off the ground so pickups can't be visually
    // mistaken for ground-level obstacles.
    if (kind === 'water') {
      w = 40; h = 44;
      y = GROUND_Y - h - rand(PICKUP_MIN_LIFT, PICKUP_MIN_LIFT + 40);
    } else {
      w = 46; h = 46;
      y = GROUND_Y - h - rand(PICKUP_MIN_LIFT + 50, PICKUP_MAX_LIFT);
    }
    pickups.push({ x: W + 60, y, w, h, kind, phase: Math.random() * Math.PI * 2 });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Particles
  // ───────────────────────────────────────────────────────────────────────
  function spawnExhaust() {
    if (Math.random() > 0.6) return;
    particles.push({
      x: truck.x + 8,
      y: truck.y + TRUCK_H - 14,
      vx: -rand(40, 90),
      vy: -rand(20, 60),
      life: 0.7, max: 0.7,
      color: boosting ? '#ffd24a' : '#cdbfe6',
      size: rand(6, 12),
      kind: 'smoke',
      grav: -40,
    });
  }
  function spawnJumpPuff() {
    for (let i = 0; i < 7; i++) {
      particles.push({
        x: truck.x + 10 + rand(0, TRUCK_W - 20),
        y: GROUND_Y - 2,
        vx: rand(-120, 120),
        vy: -rand(20, 90),
        life: 0.5, max: 0.5,
        color: '#fff7e0',
        size: rand(4, 9),
        kind: 'smoke',
        grav: -20,
      });
    }
  }
  function spawnPickupBurst(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(120, 260);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.55, max: 0.55,
        color,
        size: rand(3, 6),
        kind: 'spark',
        grav: 600,
      });
    }
  }
  function spawnCrashBurst(x, y) {
    for (let i = 0; i < 36; i++) {
      const a = rand(-Math.PI, 0);
      const s = rand(180, 540);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.6, 1.0), max: 1.0,
        color: pick(['#ff5a3c', '#ffb14c', '#fff7e0', '#1a0f3a']),
        size: rand(4, 9),
        kind: 'spark',
        grav: 900,
      });
    }
  }
  function spawnFireFlick(x, y) {
    if (Math.random() > 0.35) return;
    particles.push({
      x: x + rand(-6, 6),
      y: y + rand(-4, 4),
      vx: rand(-20, 20),
      vy: -rand(40, 90),
      life: 0.45, max: 0.45,
      color: Math.random() < 0.5 ? '#ffb14c' : '#ff5a3c',
      size: rand(3, 6),
      kind: 'flame',
      grav: -120,
    });
  }

  function spawnBoostFlame() {
    // fat flame trail behind the truck while boosting
    for (let n = 0; n < 2; n++) {
      particles.push({
        x: truck.x - rand(2, 18),
        y: truck.y + rand(TRUCK_H * 0.45, TRUCK_H * 0.85),
        vx: -rand(220, 360),
        vy: rand(-30, 30),
        life: 0.35, max: 0.35,
        color: Math.random() < 0.5 ? '#ffe24c' : '#ff5a3c',
        size: rand(6, 12),
        kind: 'flame',
        grav: 0,
      });
    }
  }

  function spawnSmashBurst(x, y, kind) {
    const palette = kind === 'fire' || kind === 'firepit'
      ? ['#ff5a3c', '#ffb14c', '#ffe24c', '#fff7e0']
      : kind === 'hydrant'
        ? ['#a8e6ff', '#4ec5ff', '#fff7e0', '#cfd6e6']
        : ['#ffb14c', '#fff7e0', '#1a0f3a', '#ffe24c'];
    for (let i = 0; i < 26; i++) {
      const a = rand(-Math.PI, Math.PI);
      const s = rand(220, 520);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60,
        life: rand(0.45, 0.8), max: 0.8,
        color: pick(palette),
        size: rand(3, 8),
        kind: 'spark',
        grav: 700,
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Update
  // ───────────────────────────────────────────────────────────────────────
  function update(dt) {
    if (mode !== 'playing') {
      // Still animate background subtly on menus
      bg.sky += dt * 4;
      // Update particles so the crash burst plays out on game-over
      updateParticles(dt);
      updateShake(dt);
      return;
    }

    runTime += dt;

    // ── Speed ramps with distance/time
    speed = Math.min(MAX_SPEED, speed + SPEED_RAMP * dt * 60);

    // ── Boost handling: auto-activates whenever boostTime > 0
    boosting = boostTime > 0;
    if (boosting) {
      boostTime = Math.max(0, boostTime - dt);
      // continuous boost flame trail
      spawnBoostFlame();
    }
    const worldSpeed = boosting ? speed * BOOST_MULT : speed;

    const scoreMult = boosting ? BOOST_SCORE_MULT : 1;
    distance += worldSpeed * dt * scoreMult;
    score = Math.floor(distance / 10);

    // ── Truck physics
    if (!truck.onGround) {
      truck.vy += GRAVITY * dt;
      truck.y += truck.vy * dt;
      truck.rot += truck.spin * dt;

      if (truck.y >= GROUND_Y - TRUCK_H) {
        truck.y = GROUND_Y - TRUCK_H;
        truck.vy = 0;
        truck.onGround = true;
        truck.squash = 0.6;
        truck.stretch = 1.3;
        truck.rot = 0;
        truck.spin = 0;
        // landing dust
        for (let i = 0; i < 8; i++) {
          particles.push({
            x: truck.x + 10 + rand(0, TRUCK_W - 20),
            y: GROUND_Y - 2,
            vx: rand(-160, 160),
            vy: -rand(10, 70),
            life: 0.45, max: 0.45,
            color: '#e9dbb8',
            size: rand(3, 7),
            kind: 'smoke',
            grav: -10,
          });
        }
        shake(3, 0.08);
      }
    }
    // ease squash/stretch back to 1
    truck.squash = lerp(truck.squash, 1, Math.min(1, dt * 10));
    truck.stretch = lerp(truck.stretch, 1, Math.min(1, dt * 10));

    // ── Spawning (suppressed during the start-of-run grace period)
    if (runTime > GRACE_TIME) {
      nextSpawnDist  -= worldSpeed * dt;
      nextPickupDist -= worldSpeed * dt;
      if (nextSpawnDist <= 0) {
        spawnObstacle();
        // gap shrinks with speed, but stays generous
        const t = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
        const minGap = lerp(440, 280, t);
        const maxGap = lerp(720, 460, t);
        nextSpawnDist = rand(minGap, maxGap);
      }
      if (nextPickupDist <= 0) {
        spawnPickup();
        nextPickupDist = rand(380, 720);
      }
    }

    // ── Move obstacles & collide
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= worldSpeed * dt;
      o.phase += dt * 6;
      // flame flicks for fire-y obstacles
      if (o.kind === 'fire' || o.kind === 'firepit') {
        spawnFireFlick(o.x + o.w * 0.5, o.y + 6);
      }
      // collision (slightly forgiving hitbox)
      const hb = truckHitbox();
      const pad = 4;
      const hit = aabb(
        hb.x + pad, hb.y + pad, hb.w - pad * 2, hb.h - pad * 2,
        o.x + 6, o.y + 6, o.w - 12, o.h - 12,
      );
      if (hit) {
        if (boosting) {
          // smash through it
          spawnSmashBurst(o.x + o.w / 2, o.y + o.h / 2, o.kind);
          popup('+SMASH', o.x + o.w / 2, o.y - 4, '#ffe24c');
          score += 25;
          distance += 250;
          shake(8, 0.18);
          sfxSmash();
          obstacles.splice(i, 1);
          continue;
        } else {
          gameOver();
          return;
        }
      }
      if (o.x + o.w < -40) obstacles.splice(i, 1);
    }

    // ── Pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.x -= worldSpeed * dt;
      p.phase += dt * 5;
      const hb = truckHitbox();
      if (!p.taken && aabb(hb.x, hb.y, hb.w, hb.h, p.x, p.y, p.w, p.h)) {
        p.taken = true;
        if (p.kind === 'water') {
          const wasBoosting = boostTime > 0;
          boostTime = Math.min(BOOST_MAX_TIME, boostTime + BOOST_TIME_PER_WATER);
          spawnPickupBurst(p.x + p.w / 2, p.y + p.h / 2, '#4ec5ff');
          popup(wasBoosting ? '+SIREN' : 'SIREN ON', p.x + p.w / 2, p.y, '#4ec5ff');
          sfxPickup(660);
          if (!wasBoosting) shake(4, 0.12);
        } else {
          score += 50;
          distance += 500;
          spawnPickupBurst(p.x + p.w / 2, p.y + p.h / 2, '#ffb14c');
          popup('+50', p.x + p.w / 2, p.y, '#ffe24c');
          sfxPickup(880);
        }
      }
      if (p.taken || p.x + p.w < -40) pickups.splice(i, 1);
    }

    // ── Exhaust
    spawnExhaust();

    // ── Background parallax
    bg.sky  += dt * 4;
    bg.far  += worldSpeed * dt * 0.05;
    bg.mid  += worldSpeed * dt * 0.18;
    bg.near += worldSpeed * dt * 0.45;
    bg.road += worldSpeed * dt;

    // ── Particles & shake
    updateParticles(dt);
    updateShake(dt);

    // ── HUD
    elScore.textContent = score + ' m';
    elBest.textContent  = 'BEST ' + best + ' m';
    elBoost.style.width = clamp((boostTime / BOOST_MAX_TIME) * 100, 0, 100).toFixed(1) + '%';
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      if (p.kind === 'smoke') {
        p.size += dt * 12;
        p.vx *= (1 - dt * 1.4);
      }
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= dt;
      p.y += p.vy * dt;
      p.vy *= (1 - dt * 0.8);
      if (p.life <= 0) popups.splice(i, 1);
    }
  }

  function updateShake(dt) {
    if (shakeT > 0) {
      shakeT -= dt;
      shakeMag *= 0.9;
      if (shakeT <= 0) shakeMag = 0;
    }
  }

  function truckHitbox() {
    return { x: truck.x + 8, y: truck.y + 8, w: TRUCK_W - 16, h: TRUCK_H - 12 };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────
  function render() {
    // shake offset
    const sx = (Math.random() - 0.5) * shakeMag;
    const sy = (Math.random() - 0.5) * shakeMag;

    ctx.save();
    ctx.translate(sx, sy);

    drawSky();
    drawFarBuildings();
    drawMidBuildings();
    drawNearProps();
    drawRoad();
    drawPickups();
    drawObstacles();
    drawTruck();
    drawParticles();
    drawPopups();

    // intensity vignette when boosting
    if (boosting) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const grd = ctx.createRadialGradient(W*0.5, H*0.5, H*0.25, W*0.5, H*0.5, H*0.85);
      grd.addColorStop(0, 'rgba(255,210,80,0)');
      grd.addColorStop(1, 'rgba(255,90,60,0.35)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawSky() {
    // base gradient: deep purple to hot ember at the bottom (matches Rizzle pfp vibes)
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0,    '#1b0f4a');
    sky.addColorStop(0.55, '#3a1d77');
    sky.addColorStop(0.9,  '#8a3a8c');
    sky.addColorStop(1,    '#ff8a3c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND_Y);

    // soft "flame lick" pattern à la pfp background
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#8c6bff';
    const t = bg.sky;
    for (let i = 0; i < 7; i++) {
      const cx = ((i * 160 - (t * 6) % 160) + W) % (W + 160) - 80;
      const cy = 80 + (i % 3) * 60;
      flame(cx, cy, 80 + (i % 2) * 30);
    }
    ctx.restore();

    // distant sun/moon disc
    ctx.save();
    ctx.fillStyle = 'rgba(255, 220, 120, 0.85)';
    ctx.beginPath(); ctx.arc(W * 0.78, 120, 38, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(W * 0.78, 120, 70, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function flame(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.4);
    ctx.bezierCurveTo(x - s * 0.6, y + s * 0.2,  x - s * 0.4, y - s * 0.6, x, y - s);
    ctx.bezierCurveTo(x + s * 0.4, y - s * 0.6,  x + s * 0.6, y + s * 0.2, x, y + s * 0.4);
    ctx.closePath();
    ctx.fill();
  }

  function drawFarBuildings() {
    ctx.save();
    ctx.fillStyle = '#2a1b6b';
    const baseY = GROUND_Y - 10;
    const offset = -pmod(bg.far, 220);
    for (let i = -1; i < 7; i++) {
      const x = offset + i * 220;
      const h = 90 + pmod(i * 53, 60);
      rrect(x, baseY - h, 180, h, 6);
      ctx.fill();
      // windows
      ctx.fillStyle = 'rgba(255, 200, 90, 0.35)';
      for (let wy = baseY - h + 14; wy < baseY - 12; wy += 18) {
        for (let wx = x + 14; wx < x + 168; wx += 22) {
          if (((wx + wy) | 0) % 3 === 0) ctx.fillRect(wx, wy, 8, 8);
        }
      }
      ctx.fillStyle = '#2a1b6b';
    }
    ctx.restore();
  }

  function drawMidBuildings() {
    ctx.save();
    ctx.fillStyle = '#1a0f3a';
    const baseY = GROUND_Y - 2;
    const offset = -pmod(bg.mid, 180);
    for (let i = -1; i < 8; i++) {
      const x = offset + i * 180;
      const h = 60 + pmod(i * 71, 80);
      // building
      rrect(x, baseY - h, 140, h, 4); ctx.fill();
      // roof flag (red — fire dept vibe)
      ctx.fillStyle = '#ff5a3c';
      ctx.fillRect(x + 60, baseY - h - 16, 4, 16);
      ctx.beginPath();
      ctx.moveTo(x + 64, baseY - h - 16);
      ctx.lineTo(x + 86, baseY - h - 12);
      ctx.lineTo(x + 64, baseY - h - 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a0f3a';
    }
    ctx.restore();
  }

  function drawNearProps() {
    // bushes / hydrant silhouettes along the sidewalk
    ctx.save();
    const baseY = GROUND_Y;
    const offset = -pmod(bg.near, 260);
    for (let i = -1; i < 6; i++) {
      const x = offset + i * 260;
      ctx.fillStyle = '#0e0828';
      ctx.beginPath();
      ctx.ellipse(x + 30, baseY - 6, 36, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 70, baseY - 4, 28, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRoad() {
    // sidewalk strip
    ctx.fillStyle = '#3b2a7a';
    ctx.fillRect(0, GROUND_Y, W, 10);
    // road
    ctx.fillStyle = '#0a0623';
    ctx.fillRect(0, GROUND_Y + 10, W, H - (GROUND_Y + 10));
    // road edge highlight
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(0, GROUND_Y + 10, W, 4);
    // dashed lane lines moving with road speed
    ctx.fillStyle = '#fff7e0';
    const dashW = 60, gap = 40;
    const period = dashW + gap;
    const offset = -pmod(bg.road, period);
    const laneY = GROUND_Y + (H - GROUND_Y) * 0.55;
    for (let x = offset - period; x < W + period; x += period) {
      ctx.fillRect(x, laneY, dashW, 6);
    }
    // ground shadow under truck area
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(truck.x + TRUCK_W * 0.5, GROUND_Y + 6, TRUCK_W * 0.55, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawObstacles() {
    for (const o of obstacles) {
      switch (o.kind) {
        case 'fire':    drawFire(o); break;
        case 'firepit': drawFirePit(o); break;
        case 'hydrant': drawHydrant(o); break;
        case 'cone':    drawCone(o); break;
      }
    }
  }
  function drawFire(o) {
    const x = o.x, y = o.y, w = o.w, h = o.h;
    const wob = Math.sin(o.phase) * 3;
    // outer flame
    ctx.save();
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.moveTo(x + w/2, y + h);
    ctx.bezierCurveTo(x - 4 + wob, y + h*0.5, x + w*0.2, y + h*0.1, x + w/2, y);
    ctx.bezierCurveTo(x + w*0.8, y + h*0.1, x + w + 4 - wob, y + h*0.5, x + w/2, y + h);
    ctx.closePath();
    ctx.fill();
    // inner
    ctx.fillStyle = '#ffb14c';
    ctx.beginPath();
    ctx.moveTo(x + w/2, y + h);
    ctx.bezierCurveTo(x + 8, y + h*0.6, x + w*0.3, y + h*0.25, x + w/2, y + h*0.18);
    ctx.bezierCurveTo(x + w*0.7, y + h*0.25, x + w - 8, y + h*0.6, x + w/2, y + h);
    ctx.closePath();
    ctx.fill();
    // outline
    outlineLast(ctx, '#1a0f3a', 2);
    ctx.restore();
  }
  function drawFirePit(o) {
    const x = o.x, y = o.y, w = o.w, h = o.h;
    // base pit
    ctx.fillStyle = '#1a0f3a';
    rrect(x, y + h - 16, w, 16, 6); ctx.fill();
    // flames across
    for (let i = 0; i < 4; i++) {
      const cx = x + 14 + i * (w - 28) / 3;
      const cy = y + h - 22;
      const s = 20 + Math.sin(o.phase + i) * 4;
      ctx.fillStyle = '#ff5a3c';
      flame(cx, cy, s);
      ctx.fillStyle = '#ffb14c';
      flame(cx, cy + 4, s * 0.55);
    }
    // outline pit
    ctx.lineWidth = 2; ctx.strokeStyle = '#ff8a3c';
    ctx.strokeRect(x + 0.5, y + h - 16, w - 1, 16);
  }
  function drawHydrant(o) {
    const x = o.x, y = o.y, w = o.w, h = o.h;
    ctx.save();
    // body — chrome steel so it clearly reads as "object" not "fire"
    ctx.fillStyle = '#c7cbd6';
    rrect(x + 4, y + 10, w - 8, h - 16, 6); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // dark stripe
    ctx.fillStyle = '#5a607a';
    ctx.fillRect(x + 4, y + h * 0.5, w - 8, 6);
    // top cap (deep teal)
    ctx.fillStyle = '#2f6f7a';
    rrect(x + 8, y, w - 16, 14, 4); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // side nozzles
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x - 2, y + h * 0.55, 6, 8);
    ctx.fillRect(x + w - 4, y + h * 0.55, 6, 8);
    // base
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x + 2, y + h - 8, w - 4, 8);
    // tiny highlight
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#fff7e0';
    ctx.fillRect(x + 10, y + 16, 4, h - 30);
    ctx.restore();
  }
  function drawCone(o) {
    const x = o.x, y = o.y, w = o.w, h = o.h;
    ctx.save();
    ctx.fillStyle = '#ffb14c';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y);
    ctx.lineTo(x + w, y + h - 6);
    ctx.lineTo(x, y + h - 6);
    ctx.closePath(); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // stripes
    ctx.fillStyle = '#fff7e0';
    ctx.fillRect(x + 6, y + h * 0.45, w - 12, 5);
    ctx.fillRect(x + 4, y + h * 0.65, w - 8, 5);
    // base
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x - 2, y + h - 6, w + 4, 6);
    ctx.restore();
  }

  function drawPickups() {
    for (const p of pickups) {
      const bob = Math.sin(p.phase) * 4;
      // pulsing glow halo — makes pickups unmistakably distinct
      // from ground-level obstacles.
      const haloColor = p.kind === 'water' ? '#4ec5ff' : '#ffe24c';
      drawPickupHalo(p.x + p.w / 2, p.y + p.h / 2 + bob, p.w, p.phase, haloColor);
      if (p.kind === 'water') drawWater(p.x, p.y + bob, p.w, p.h);
      else drawDonut(p.x, p.y + bob, p.w, p.h);
    }
  }

  function drawPickupHalo(cx, cy, w, phase, color) {
    const pulse = 0.5 + 0.5 * Math.sin(phase * 1.5);
    const radius = w * (0.95 + pulse * 0.25);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createRadialGradient(cx, cy, w * 0.1, cx, cy, radius);
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // tether line to ground so it reads as "floating thing", not "wall"
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy + w * 0.4);
    ctx.lineTo(cx, GROUND_Y - 4);
    ctx.stroke();
    ctx.restore();
  }
  function drawWater(x, y, w, h) {
    ctx.save();
    // bucket body
    ctx.fillStyle = '#4ec5ff';
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 10);
    ctx.lineTo(x + w - 4, y + 10);
    ctx.lineTo(x + w - 8, y + h);
    ctx.lineTo(x + 8, y + h);
    ctx.closePath(); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // water top
    ctx.fillStyle = '#a8e6ff';
    rrect(x + 4, y + 8, w - 8, 6, 3); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // handle
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 8, w * 0.4, Math.PI, 0);
    ctx.stroke();
    // sheen
    ctx.fillStyle = '#fff7e0';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x + 10, y + 16, 4, 16);
    ctx.restore();
  }
  function drawDonut(x, y, w, h) {
    ctx.save();
    const cx = x + w / 2, cy = y + h / 2;
    // shadow ring
    ctx.fillStyle = '#a3582d';
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2); ctx.fill();
    // icing
    ctx.fillStyle = '#ff8ec3';
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.42, 0, Math.PI * 2); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // hole
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // sprinkles
    const sp = ['#fff', '#ffe24c', '#4ec5ff', '#ff5a3c'];
    for (let i = 0; i < 6; i++) {
      const a = i * (Math.PI / 3) + 0.4;
      const r = w * 0.3;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.rotate(a);
      ctx.fillStyle = sp[i % sp.length];
      ctx.fillRect(-3, -1, 6, 2);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawTruck() {
    const cx = truck.x + TRUCK_W * 0.5;
    const cy = truck.y + TRUCK_H * 0.5;

    // boost aura — pulsing radial glow underneath the truck
    if (boosting) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 60);
      const r = TRUCK_W * 0.9 * pulse;
      const grd = ctx.createRadialGradient(cx, cy, 8, cx, cy, r);
      grd.addColorStop(0, 'rgba(255, 226, 76, 0.85)');
      grd.addColorStop(0.6, 'rgba(255, 90, 60, 0.45)');
      grd.addColorStop(1, 'rgba(255, 90, 60, 0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(truck.rot * 0.1);
    ctx.scale(truck.stretch, truck.squash);
    ctx.translate(-cx, -cy);
    drawFireTruck(truck.x, truck.y, TRUCK_W, TRUCK_H);
    ctx.restore();
  }

  function drawFireTruck(x, y, w, h) {
    // chassis shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    rrect(x + 4, y + h - 6, w - 8, 8, 4); ctx.fill();

    // rear cargo (water tank)
    ctx.fillStyle = '#d94028';
    rrect(x + 2, y + 18, w * 0.62, h - 26, 6); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // ladder on top
    ctx.strokeStyle = '#fff7e0';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 8, y + 14, w * 0.55, 6);
    for (let lx = x + 10; lx < x + w * 0.6; lx += 8) {
      ctx.beginPath(); ctx.moveTo(lx, y + 14); ctx.lineTo(lx, y + 20); ctx.stroke();
    }
    // gold side stripe
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(x + 4, y + h * 0.55, w * 0.6, 5);

    // cab
    ctx.fillStyle = '#ff5a3c';
    rrect(x + w * 0.58, y + 24, w * 0.4, h - 32, 8); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);

    // windshield
    ctx.fillStyle = '#a8e6ff';
    rrect(x + w * 0.66, y + 30, w * 0.28, 22, 4); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);

    // RIZZLE in the windshield (placeholder portrait)
    drawRizzleHead(x + w * 0.78, y + 38, 18);

    // siren light
    const sirenFlash = (performance.now() / 200) % 2 < 1;
    ctx.fillStyle = sirenFlash ? '#ffe24c' : '#4ec5ff';
    ctx.fillRect(x + w * 0.62, y + 18, 10, 6);
    outlineLast(ctx, '#1a0f3a', 1.5);

    // bumper
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x + w - 8, y + h - 22, 8, 10);

    // wheels
    drawWheel(x + 18,        y + h - 4, 14);
    drawWheel(x + w - 24,    y + h - 4, 14);
  }

  function drawWheel(cx, cy, r) {
    ctx.save();
    // tire
    ctx.fillStyle = '#1a0f3a';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // hub
    ctx.fillStyle = '#fff7e0';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2); ctx.fill();
    // spokes (rotate w/ distance)
    const spin = bg.road * 0.08;
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = spin + i * (Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.1, cy + Math.sin(a) * r * 0.1);
      ctx.lineTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }

  // tiny placeholder portrait of Rizzle inside the windshield
  function drawRizzleHead(cx, cy, r) {
    ctx.save();
    // helmet
    ctx.fillStyle = '#ff3a2a';
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.4, r, Math.PI, 0);
    ctx.lineTo(cx + r * 1.1, cy - r * 0.2);
    ctx.lineTo(cx - r * 1.1, cy - r * 0.2);
    ctx.closePath(); ctx.fill();
    // helmet front shield
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.35, cy - r * 0.9);
    ctx.lineTo(cx + r * 0.35, cy - r * 0.9);
    ctx.lineTo(cx + r * 0.25, cy - r * 0.55);
    ctx.lineTo(cx - r * 0.25, cy - r * 0.55);
    ctx.closePath(); ctx.fill();
    // face (tan)
    ctx.fillStyle = '#b4884f';
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.1, r * 0.8, 0, Math.PI * 2); ctx.fill();
    // beard
    ctx.fillStyle = '#fff7e0';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.45, r * 0.7, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = '#1a0f3a';
    ctx.beginPath(); ctx.arc(cx - r * 0.32, cy - r * 0.05, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.28, cy - r * 0.05, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'smoke' || p.kind === 'flame') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
  }
  function drawPopups() {
    for (const p of popups) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'bold 22px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1a0f3a';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Canvas drawing utilities
  // ───────────────────────────────────────────────────────────────────────
  function rrect(x, y, w, h, r) {
    if (w <= 0 || h <= 0) { ctx.beginPath(); return; }
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function outlineLast(ctx, color, lw) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  // ───────────────────────────────────────────────────────────────────────
  // Audio (lightweight WebAudio bleeps)
  // ───────────────────────────────────────────────────────────────────────
  let audioCtx = null;
  function ac() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }
  function tone(freq, dur, type = 'square', vol = 0.06, slideTo = null) {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo != null) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function sfxJump() { tone(440, 0.12, 'square', 0.05, 880); }
  function sfxPickup(f) { tone(f || 720, 0.10, 'triangle', 0.07, (f || 720) * 1.6); }
  function sfxSmash() {
    tone(180, 0.18, 'sawtooth', 0.08, 60);
    tone(900, 0.08, 'square',   0.05, 220);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Main loop
  // ───────────────────────────────────────────────────────────────────────
  let lastT = performance.now();
  function frame(now) {
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.05) dt = 0.05; // clamp big jumps (tab switches, etc.)
    try {
      update(dt);
      render();
    } catch (err) {
      // Never let a single bad frame freeze the game silently.
      // eslint-disable-next-line no-console
      console.error('[CapyRizzle] frame error:', err);
    }
    requestAnimationFrame(frame);
  }

  // Initial UI state
  elBest.textContent = 'BEST ' + best + ' m';
  setMode('title');
  requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
})();
