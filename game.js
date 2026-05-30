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
  const TRUCK_X  = 180;             // truck screen x (stays fixed)
  const TRUCK_W  = 150;
  const TRUCK_H  = 76;
  const GRAVITY  = 2200;            // px/s^2
  const JUMP_V   = -880;            // initial jump velocity

  const BASE_SPEED = 180;           // starting world speed (px/s) — chill opening
  const MAX_SPEED  = 540;
  const SPEED_RAMP = 0.28;          // speed gained per second of play

  const BOOST_MULT = 1.55;          // speed multiplier while boosting
  const BOOST_TIME_PER_WATER = 2.6; // seconds of boost per water pickup
  const BOOST_MAX_TIME = 6.5;       // cap total boost time
  const BOOST_SCORE_MULT = 2.0;     // score multiplier while boosting

  const GRACE_TIME = 2.2;           // seconds before first obstacles can spawn
  // Pickups always hover above ground so they can never be mistaken for enemies.
  const PICKUP_MIN_LIFT = 70;       // px above ground for a "low" pickup
  const PICKUP_MAX_LIFT = 175;      // px above ground for a "high" pickup

  // Score values
  const SCORE_RESCUE = 100;
  const SCORE_ORANGE = 25;

  const HIGHSCORE_KEY = 'capyrizzlerush_best_v3';
  const TUTORIAL_SEEN_KEY = 'capyrizzlerush_tutorial_seen_v3';

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
  let rescuedCount = 0;      // capybaras rescued this run (stacked on truck)
  let totalRescued = parseInt(localStorage.getItem('capyrizzlerush_total_rescued') || '0', 10) || 0;

  // Tutorial state — fades hints out after the player has actually done each thing
  const tutorialSeen = localStorage.getItem(TUTORIAL_SEEN_KEY) === '1';
  let hintJumpAlpha   = tutorialSeen ? 0 : 1;
  let hintWaterAlpha  = tutorialSeen ? 0 : 1;
  let hintJumpDone    = tutorialSeen;
  let hintWaterDone   = tutorialSeen;

  let shakeT = 0;            // remaining seconds of shake
  let shakeMag = 0;          // current magnitude

  /** @type {Array<{x:number,y:number,w:number,h:number,kind:string,phase:number}>} */
  const obstacles = [];
  /** @type {Array<{x:number,y:number,w:number,h:number,kind:string,phase:number,taken?:boolean}>} */
  const pickups = [];
  /** @type {Array<{x:number,y:number,phase:number,kind:string,vx?:number,vy?:number}>} */
  const npcs = [];           // background capybara NPCs (sidewalk, hot tub, rooftop, balloon, plane, ufo, cloud, koolaid)
  /** @type {Array<{x:number,y:number,life:number,max:number}>} */
  const telegraphs = [];     // incoming-obstacle alert chevrons on the right edge
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
    npcs.length = 0;
    telegraphs.length = 0;
    rescuedCount = 0;

    // Initial spawn timing uses a grace period so the player isn't
    // ambushed on frame 1. The first obstacle is also pushed further out.
    nextSpawnDist = 900;
    nextPickupDist = 520;

    shakeT = 0;
    shakeMag = 0;

    // Reset hint visibility only if the player hasn't completed the tutorial
    if (!hintJumpDone)  hintJumpAlpha  = 1;
    if (!hintWaterDone) hintWaterAlpha = 1;
  }

  function startGame() {
    resetRun();
    // Seed all NPC layers immediately so the world feels alive on frame 1.
    for (let i = 0; i < 2; i++) spawnNpc('sidewalk');
    for (let i = 0; i < 2; i++) spawnNpc('hottub');
    for (let i = 0; i < 2; i++) spawnNpc('rooftop');
    spawnNpc('koolaid');
    spawnNpc('balloon');
    spawnNpc('plane');
    spawnNpc('cloud');
    spawnNpc('cloud');
    // Distribute everyone across the screen instead of stacking at the right
    npcs.forEach((n, i) => { n.x = (i + 0.5) * (W / npcs.length); });
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
      if (!hintJumpDone) hintJumpDone = true;
    }
  }

  function countNpc(kind) {
    let n = 0;
    for (const x of npcs) if (x.kind === kind) n++;
    return n;
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
    // Bigger silhouettes than v2 so they're more readable at any speed.
    switch (kind) {
      case 'fire':    w = 60; h = 88; y = GROUND_Y - h; break;
      case 'hydrant': w = 56; h = 70; y = GROUND_Y - h; break;
      case 'cone':    w = 54; h = 66; y = GROUND_Y - h; break;
      case 'firepit': w = 140; h = 44; y = GROUND_Y - h; break;
      default:        w = 50; h = 70; y = GROUND_Y - h;
    }
    obstacles.push({ x: W + 80, y, w, h, kind, phase: Math.random() * Math.PI * 2 });
  }

  function spawnPickup() {
    // 55% water (boost), 30% orange (snack), 15% capybara rescue (jackpot)
    const r = Math.random();
    const kind = r < 0.55 ? 'water' : (r < 0.85 ? 'orange' : 'rescue');
    let w, h, y;
    if (kind === 'water') {
      w = 44; h = 48;
      y = GROUND_Y - h - rand(PICKUP_MIN_LIFT, PICKUP_MIN_LIFT + 40);
    } else if (kind === 'orange') {
      w = 42; h = 42;
      y = GROUND_Y - h - rand(PICKUP_MIN_LIFT + 30, PICKUP_MAX_LIFT);
    } else {
      // Rescue capybara: always at a height that requires a jump but is
      // very reachable, and visually obvious.
      w = 52; h = 56;
      y = GROUND_Y - h - rand(PICKUP_MIN_LIFT + 10, PICKUP_MIN_LIFT + 60);
    }
    pickups.push({ x: W + 80, y, w, h, kind, phase: Math.random() * Math.PI * 2 });
  }

  function spawnNpc(kind) {
    const n = { x: 0, y: 0, phase: Math.random() * Math.PI * 2, kind, vx: 0, vy: 0 };
    switch (kind) {
      case 'sidewalk':
        n.x = W + rand(0, 200); n.y = 0; break;
      case 'hottub':
        n.x = W + rand(0, 200); n.y = 0; break;
      case 'rooftop':
        n.x = W + rand(0, 200); n.y = 0; break;
      case 'koolaid':
        // Big capybara head bursting from a building window — uses mid layer.
        n.x = W + rand(80, 240); n.y = rand(120, 230); break;
      case 'balloon':
        n.x = W + 60; n.y = rand(40, 140); n.vx = -rand(12, 22); break;
      case 'plane':
        n.x = W + 80; n.y = rand(50, 120); n.vx = -rand(80, 110); break;
      case 'ufo':
        n.x = W + 80; n.y = rand(60, 160); n.vx = -rand(30, 50); break;
      case 'cloud':
        n.x = W + 100; n.y = rand(30, 100); n.vx = -rand(8, 16); break;
    }
    npcs.push(n);
  }

  function spawnTelegraph(y) {
    telegraphs.push({ x: W - 6, y, life: 1.0, max: 1.0 });
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
        // visual telegraph at the spawn y so the player gets a moment of warning
        const last = obstacles[obstacles.length - 1];
        if (last) spawnTelegraph(last.y + last.h * 0.5);
        // gap shrinks with speed, but stays generous
        const t = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
        const minGap = lerp(480, 320, t);
        const maxGap = lerp(760, 520, t);
        nextSpawnDist = rand(minGap, maxGap);
      }
      if (nextPickupDist <= 0) {
        spawnPickup();
        nextPickupDist = rand(360, 700);
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
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        if (p.kind === 'water') {
          const wasBoosting = boostTime > 0;
          boostTime = Math.min(BOOST_MAX_TIME, boostTime + BOOST_TIME_PER_WATER);
          spawnPickupBurst(cx, cy, '#4ec5ff');
          popup(wasBoosting ? '+SIREN' : 'SIREN ON', cx, p.y, '#4ec5ff');
          sfxPickup(660);
          if (!wasBoosting) shake(5, 0.14);
          if (!hintWaterDone) {
            hintWaterDone = true;
            try { localStorage.setItem(TUTORIAL_SEEN_KEY, '1'); } catch {}
          }
        } else if (p.kind === 'orange') {
          score += SCORE_ORANGE;
          distance += SCORE_ORANGE * 10;
          spawnPickupBurst(cx, cy, '#ffb14c');
          popup('+' + SCORE_ORANGE, cx, p.y, '#ffe24c');
          sfxPickup(880);
        } else if (p.kind === 'rescue') {
          rescuedCount += 1;
          totalRescued += 1;
          try { localStorage.setItem('capyrizzlerush_total_rescued', String(totalRescued)); } catch {}
          score += SCORE_RESCUE;
          distance += SCORE_RESCUE * 10;
          spawnPickupBurst(cx, cy, '#fff7e0');
          spawnPickupBurst(cx, cy, '#ffd24a');
          popup('RESCUED +' + SCORE_RESCUE, cx, p.y, '#ffd24a');
          shake(6, 0.18);
          sfxPickup(540);
          sfxPickup(720);
        }
      }
      if (p.taken || p.x + p.w < -40) pickups.splice(i, 1);
    }

    // ── Background NPCs: each kind moves at its own pace
    for (let i = npcs.length - 1; i >= 0; i--) {
      const n = npcs[i];
      let dx = 0, dy = 0;
      switch (n.kind) {
        case 'sidewalk': dx = -worldSpeed * dt * 0.45; break;
        case 'hottub':   dx = -worldSpeed * dt * 0.18; break;
        case 'rooftop':  dx = -worldSpeed * dt * 0.18; break;
        case 'koolaid':  dx = -worldSpeed * dt * 0.18; break;
        // Sky NPCs drift independently of world speed for a dreamier feel
        case 'balloon':  dx = (n.vx || -16) * dt; dy = Math.sin(n.phase * 0.6) * 6 * dt; break;
        case 'plane':    dx = (n.vx || -95) * dt; break;
        case 'ufo':      dx = (n.vx || -40) * dt; dy = Math.sin(n.phase * 1.4) * 14 * dt; break;
        case 'cloud':    dx = (n.vx || -12) * dt; break;
      }
      n.x += dx; n.y += dy;
      n.phase += dt * 4;
      // wider cull margin for plane (long banner) and koolaid (large head)
      const cull = n.kind === 'plane' ? 320 : n.kind === 'koolaid' ? 200 : 140;
      if (n.x < -cull) npcs.splice(i, 1);
    }
    // Continuously top up NPC populations so the world is never empty.
    // Ground / mid layer:
    if (countNpc('sidewalk') < 2 && Math.random() < dt * 0.6) spawnNpc('sidewalk');
    if (countNpc('hottub')   < 2 && Math.random() < dt * 0.4) spawnNpc('hottub');
    if (countNpc('rooftop')  < 2 && Math.random() < dt * 0.3) spawnNpc('rooftop');
    if (countNpc('koolaid')  < 1 && Math.random() < dt * 0.08) spawnNpc('koolaid');
    // Sky layer (rarer, the silly memey ones):
    if (countNpc('balloon')  < 1 && Math.random() < dt * 0.18) spawnNpc('balloon');
    if (countNpc('plane')    < 1 && Math.random() < dt * 0.12) spawnNpc('plane');
    if (countNpc('ufo')      < 1 && Math.random() < dt * 0.08) spawnNpc('ufo');
    if (countNpc('cloud')    < 2 && Math.random() < dt * 0.25) spawnNpc('cloud');

    // ── Telegraphs (incoming-obstacle alerts on the right edge)
    for (let i = telegraphs.length - 1; i >= 0; i--) {
      const t = telegraphs[i];
      t.life -= dt;
      if (t.life <= 0) telegraphs.splice(i, 1);
    }

    // ── Tutorial hint fades
    if (hintJumpDone)  hintJumpAlpha  = Math.max(0, hintJumpAlpha  - dt * 1.5);
    if (hintWaterDone) hintWaterAlpha = Math.max(0, hintWaterAlpha - dt * 1.5);

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
    drawSkyNpcs();         // balloon, plane, ufo, cloud — silly memey stuff
    drawFarBuildings();
    drawRooftopNpcs();     // capybara squads on building tops
    drawMidBuildings();
    drawKoolaidNpcs();     // giant capybara head bursting out a window
    drawHotTubNpcs();
    drawNearProps();
    drawSidewalkNpcs();
    drawRoad();
    drawDangerLane();      // subtle tint that makes ground obstacles pop
    drawPickups();
    drawObstacles();
    drawTelegraphs();      // incoming-obstacle alerts on the right edge
    drawTruck();
    drawParticles();
    drawPopups();
    drawHints();

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
    ctx.save();
    // dark base shadow on the road for extra contrast
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x + w/2, y + h + 4, w * 0.55, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // outer flame
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.moveTo(x + w/2, y + h);
    ctx.bezierCurveTo(x - 4 + wob, y + h*0.5, x + w*0.2, y + h*0.1, x + w/2, y);
    ctx.bezierCurveTo(x + w*0.8, y + h*0.1, x + w + 4 - wob, y + h*0.5, x + w/2, y + h);
    ctx.closePath();
    ctx.fill();
    outlineLast(ctx, '#1a0f3a', 3);
    // inner
    ctx.fillStyle = '#ffb14c';
    ctx.beginPath();
    ctx.moveTo(x + w/2, y + h);
    ctx.bezierCurveTo(x + 8, y + h*0.6, x + w*0.3, y + h*0.25, x + w/2, y + h*0.18);
    ctx.bezierCurveTo(x + w*0.7, y + h*0.25, x + w - 8, y + h*0.6, x + w/2, y + h);
    ctx.closePath();
    ctx.fill();
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
    // base shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x + w/2, y + h + 4, w * 0.55, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // body — chrome steel so it clearly reads as "object" not "fire"
    ctx.fillStyle = '#c7cbd6';
    rrect(x + 4, y + 10, w - 8, h - 16, 6); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 3);
    // dark stripe
    ctx.fillStyle = '#5a607a';
    ctx.fillRect(x + 4, y + h * 0.5, w - 8, 6);
    // top cap (deep teal)
    ctx.fillStyle = '#2f6f7a';
    rrect(x + 8, y, w - 16, 14, 4); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 3);
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
    // base shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x + w/2, y + h + 4, w * 0.55, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb14c';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y);
    ctx.lineTo(x + w, y + h - 6);
    ctx.lineTo(x, y + h - 6);
    ctx.closePath(); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 3);
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
      const haloColor =
        p.kind === 'water'  ? '#4ec5ff' :
        p.kind === 'orange' ? '#ffe24c' :
        /* rescue */          '#ffffff';
      drawPickupHalo(p.x + p.w / 2, p.y + p.h / 2 + bob, p.w, p.phase, haloColor);
      if      (p.kind === 'water')  drawWater(p.x, p.y + bob, p.w, p.h);
      else if (p.kind === 'orange') drawOrange(p.x, p.y + bob, p.w, p.h);
      else                          drawRescueCapy(p.x, p.y + bob, p.w, p.h, p.phase);
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
  function drawOrange(x, y, w, h) {
    ctx.save();
    const cx = x + w / 2, cy = y + h / 2;
    // body
    ctx.fillStyle = '#ff8a1f';
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.45, 0, Math.PI * 2); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // dimples
    ctx.fillStyle = '#e07212';
    ctx.beginPath(); ctx.arc(cx - w * 0.12, cy + w * 0.08, w * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + w * 0.18, cy - w * 0.04, w * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + w * 0.05, cy + w * 0.2, w * 0.04, 0, Math.PI * 2); ctx.fill();
    // sheen
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.ellipse(cx - w * 0.18, cy - w * 0.18, w * 0.12, w * 0.07, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // leaf
    ctx.fillStyle = '#3fae3a';
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.05, cy - w * 0.42);
    ctx.quadraticCurveTo(cx + w * 0.3, cy - w * 0.55, cx + w * 0.32, cy - w * 0.3);
    ctx.quadraticCurveTo(cx + w * 0.15, cy - w * 0.3, cx + w * 0.05, cy - w * 0.42);
    ctx.closePath(); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 1.5);
    // stem
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy - w * 0.42); ctx.lineTo(cx + w * 0.05, cy - w * 0.45); ctx.stroke();
    ctx.restore();
  }

  function drawRescueCapy(x, y, w, h, phase) {
    const cx = x + w / 2, cy = y + h / 2;
    // flashing "HELP" text bubble above
    ctx.save();
    const blink = (Math.sin(phase * 2) * 0.5 + 0.5);
    ctx.globalAlpha = 0.4 + blink * 0.6;
    ctx.fillStyle = '#ffd24a';
    rrect(cx - 22, y - 16, 44, 14, 4); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 1.5);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1a0f3a';
    ctx.font = 'bold 10px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HELP!', cx, y - 6);
    ctx.restore();
    // capybara with one arm waving
    drawCapybara(cx, cy + 2, Math.min(w, h) * 0.42, { helmet: 'none', arm: 'wave', skin: '#a87544' });
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

    // rear cargo (water tank) — keep lower so capybara dominates
    ctx.fillStyle = '#d94028';
    rrect(x + 2, y + 24, w * 0.60, h - 30, 6); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // ladder on top of tank
    ctx.strokeStyle = '#fff7e0';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 8, y + 20, w * 0.55, 6);
    for (let lx = x + 10; lx < x + w * 0.6; lx += 9) {
      ctx.beginPath(); ctx.moveTo(lx, y + 20); ctx.lineTo(lx, y + 26); ctx.stroke();
    }
    // gold side stripe
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(x + 4, y + h * 0.6, w * 0.6, 5);

    // rescued capybaras stacked on the back of the truck (visual reward)
    drawRescuedStack(x, y, w, h);

    // cab (lower / shorter — capybara sits in it and pokes way up)
    ctx.fillStyle = '#ff5a3c';
    rrect(x + w * 0.56, y + 28, w * 0.42, h - 36, 8); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);

    // side window of cab
    ctx.fillStyle = '#a8e6ff';
    rrect(x + w * 0.62, y + 34, w * 0.32, 16, 3); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);

    // BIG RIZZLE — sits in the cab, head and helmet poking far above the roof
    const capCx = x + w * 0.78;
    const capCy = y + 6;
    drawCapybara(capCx, capCy, 34, { arm: 'wheel' });

    // siren light on top of cab (in front of capybara)
    const sirenFlash = (performance.now() / 200) % 2 < 1;
    ctx.fillStyle = sirenFlash ? '#ffe24c' : '#4ec5ff';
    rrect(x + w * 0.56, y + 22, 14, 8, 2); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 1.5);

    // bumper
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x + w - 8, y + h - 22, 8, 10);

    // wheels
    drawWheel(x + 22,        y + h - 4, 16);
    drawWheel(x + w - 30,    y + h - 4, 16);
  }

  function drawRescuedStack(x, y, w, h) {
    if (rescuedCount <= 0) return;
    const maxVisible = Math.min(rescuedCount, 4);
    for (let i = 0; i < maxVisible; i++) {
      const px = x + 14 + i * 20;
      const py = y + 12 - 6 + Math.sin(performance.now() / 220 + i) * 1.5;
      drawCapybara(px, py, 10, { helmet: 'none', skin: i % 2 ? '#a87544' : '#b08252' });
    }
    if (rescuedCount > 4) {
      ctx.save();
      ctx.font = 'bold 12px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.fillStyle = '#fff7e0';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1a0f3a';
      const t = '+' + (rescuedCount - 4);
      ctx.strokeText(t, x + 14 + 4 * 20 + 2, y + 12);
      ctx.fillText(t, x + 14 + 4 * 20 + 2, y + 12);
      ctx.restore();
    }
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

  // Full Rizzle character drawing — head, beard, helmet, optional body/arms.
  // Use opts.size to scale (1.0 = ~120px tall hero on the truck).
  // opts.helmet = 'fire' (default red firefighter) or 'none'.
  // opts.arm = 'wave' (arm raised), 'wheel' (gripping steering), or null.
  // opts.outline draws strong outlines (default true).
  function drawCapybara(cx, cy, size, opts) {
    opts = opts || {};
    const s = size;
    const outline = opts.outline !== false ? '#1a0f3a' : null;
    const skin = opts.skin || '#b4884f';
    const beard = opts.beard || '#fff7e0';

    ctx.save();

    // Body (under the head if we draw one)
    if (opts.body) {
      ctx.fillStyle = opts.bodyColor || '#7a4a2a';
      // chunky rounded torso
      rrect(cx - s * 0.55, cy + s * 0.35, s * 1.1, s * 0.85, s * 0.25);
      ctx.fill();
      if (outline) outlineLast(ctx, outline, Math.max(1.5, s * 0.04));
      // reflective firefighter stripe
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(cx - s * 0.5, cy + s * 0.6, s * 1.0, s * 0.09);
    }

    // Head base (tan circle, slightly squashed wide like a capybara)
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.78, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (outline) outlineLast(ctx, outline, Math.max(1.5, s * 0.05));

    // tiny rounded ears
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(cx - s * 0.62, cy - s * 0.45, s * 0.18, s * 0.14, -0.3, 0, Math.PI * 2); ctx.fill();
    if (outline) outlineLast(ctx, outline, Math.max(1.2, s * 0.04));
    ctx.beginPath(); ctx.ellipse(cx + s * 0.62, cy - s * 0.45, s * 0.18, s * 0.14, 0.3, 0, Math.PI * 2); ctx.fill();
    if (outline) outlineLast(ctx, outline, Math.max(1.2, s * 0.04));
    // inner ear
    ctx.fillStyle = '#7a5230';
    ctx.beginPath(); ctx.ellipse(cx - s * 0.6, cy - s * 0.43, s * 0.08, s * 0.06, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + s * 0.6, cy - s * 0.43, s * 0.08, s * 0.06, 0.3, 0, Math.PI * 2); ctx.fill();

    // White beard / fluffy chin — Rizzle's signature
    ctx.fillStyle = beard;
    ctx.beginPath();
    // wavy beard outline
    ctx.moveTo(cx - s * 0.55, cy + s * 0.05);
    ctx.bezierCurveTo(cx - s * 0.75, cy + s * 0.55, cx - s * 0.3, cy + s * 0.95, cx, cy + s * 0.85);
    ctx.bezierCurveTo(cx + s * 0.3, cy + s * 0.95, cx + s * 0.75, cy + s * 0.55, cx + s * 0.55, cy + s * 0.05);
    ctx.bezierCurveTo(cx + s * 0.3, cy + s * 0.2, cx - s * 0.3, cy + s * 0.2, cx - s * 0.55, cy + s * 0.05);
    ctx.closePath();
    ctx.fill();
    if (outline) outlineLast(ctx, outline, Math.max(1.4, s * 0.05));
    // beard texture wisps
    ctx.strokeStyle = '#cfc4a3';
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.3, cy + s * 0.35); ctx.lineTo(cx - s * 0.2, cy + s * 0.7);
    ctx.moveTo(cx, cy + s * 0.4);            ctx.lineTo(cx + s * 0.05, cy + s * 0.85);
    ctx.moveTo(cx + s * 0.3, cy + s * 0.35); ctx.lineTo(cx + s * 0.25, cy + s * 0.7);
    ctx.stroke();

    // Eyes (one half-closed, one wide — derpy Rizzle energy)
    // sclera bumps poking through the beard
    ctx.fillStyle = '#dff3b0';
    ctx.beginPath(); ctx.arc(cx - s * 0.3, cy - s * 0.05, s * 0.18, 0, Math.PI * 2); ctx.fill();
    if (outline) outlineLast(ctx, outline, Math.max(1.2, s * 0.04));
    ctx.fillStyle = '#dff3b0';
    ctx.beginPath(); ctx.arc(cx + s * 0.3, cy - s * 0.05, s * 0.2, 0, Math.PI * 2); ctx.fill();
    if (outline) outlineLast(ctx, outline, Math.max(1.2, s * 0.04));
    // half-closed left eye — flat top
    ctx.fillStyle = skin;
    ctx.fillRect(cx - s * 0.48, cy - s * 0.23, s * 0.36, s * 0.18);
    // pupils
    ctx.fillStyle = outline || '#1a0f3a';
    ctx.beginPath(); ctx.arc(cx - s * 0.30, cy + s * 0.00, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.32, cy - s * 0.05, s * 0.07, 0, Math.PI * 2); ctx.fill();
    // eye gleams
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx + s * 0.34, cy - s * 0.08, s * 0.025, 0, Math.PI * 2); ctx.fill();

    // Tiny mouth corner peeking out of beard
    ctx.fillStyle = outline || '#1a0f3a';
    ctx.fillRect(cx - s * 0.04, cy + s * 0.18, s * 0.08, s * 0.04);

    // Helmet
    if (opts.helmet !== 'none') {
      drawFireHelmet(cx, cy, s, outline);
    }

    // Arms
    if (opts.arm === 'wave') {
      // raised arm waving
      ctx.fillStyle = skin;
      ctx.lineCap = 'round';
      ctx.strokeStyle = outline || '#1a0f3a';
      ctx.lineWidth = Math.max(2, s * 0.16);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.5, cy + s * 0.6);
      ctx.quadraticCurveTo(cx + s * 1.0, cy + s * 0.2, cx + s * 1.1, cy - s * 0.4);
      ctx.stroke();
      // paw
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(cx + s * 1.1, cy - s * 0.45, s * 0.16, 0, Math.PI * 2); ctx.fill();
      if (outline) outlineLast(ctx, outline, Math.max(1.2, s * 0.04));
    } else if (opts.arm === 'wheel') {
      // both arms forward gripping steering wheel
      ctx.strokeStyle = outline || '#1a0f3a';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, s * 0.16);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35, cy + s * 0.55);
      ctx.quadraticCurveTo(cx + s * 0.0, cy + s * 0.95, cx + s * 0.55, cy + s * 0.85);
      ctx.stroke();
      // wheel
      ctx.fillStyle = '#1a0f3a';
      ctx.beginPath(); ctx.arc(cx + s * 0.6, cy + s * 0.85, s * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff7e0';
      ctx.beginPath(); ctx.arc(cx + s * 0.6, cy + s * 0.85, s * 0.08, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  // Red firefighter helmet (the iconic Rizzle hat)
  function drawFireHelmet(cx, cy, s, outline) {
    ctx.save();
    // back brim
    ctx.fillStyle = '#1a0f3a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.38, s * 0.95, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    // red dome
    ctx.fillStyle = '#ff3a2a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.55, s * 0.78, s * 0.55, 0, Math.PI, 0);
    ctx.fill();
    if (outline) outlineLast(ctx, outline, Math.max(1.4, s * 0.05));
    // front bill / brim (cap-style going forward over right side, like the pfp)
    ctx.fillStyle = '#ff3a2a';
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.15, cy - s * 0.42);
    ctx.quadraticCurveTo(cx + s * 1.1, cy - s * 0.6, cx + s * 1.05, cy - s * 0.18);
    ctx.quadraticCurveTo(cx + s * 0.6, cy - s * 0.25, cx + s * 0.4, cy - s * 0.32);
    ctx.closePath();
    ctx.fill();
    if (outline) outlineLast(ctx, outline, Math.max(1.4, s * 0.05));
    // yellow shield with bee
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.18, cy - s * 0.95);
    ctx.lineTo(cx + s * 0.18, cy - s * 0.95);
    ctx.lineTo(cx + s * 0.22, cy - s * 0.7);
    ctx.lineTo(cx, cy - s * 0.6);
    ctx.lineTo(cx - s * 0.22, cy - s * 0.7);
    ctx.closePath();
    ctx.fill();
    if (outline) outlineLast(ctx, outline, Math.max(1.1, s * 0.04));
    // bee marking
    ctx.fillStyle = outline || '#1a0f3a';
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.78, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(cx - s * 0.05, cy - s * 0.83, s * 0.1, s * 0.02);
    ctx.restore();
  }

  // ─── Silly sky capybaras ───────────────────────────────────────────────
  function drawSkyNpcs() {
    for (const n of npcs) {
      switch (n.kind) {
        case 'cloud':   drawCloudCapy(n.x, n.y, n.phase); break;
        case 'balloon': drawBalloonCapy(n.x, n.y, n.phase); break;
        case 'plane':   drawPlaneCapy(n.x, n.y, n.phase); break;
        case 'ufo':     drawUfoCapy(n.x, n.y, n.phase); break;
      }
    }
  }

  function drawCloudCapy(cx, cy, phase) {
    // Cloud shaped like a capybara head — three big white puffs forming the silhouette
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#fff7e0';
    // body of the cloud
    ctx.beginPath(); ctx.ellipse(cx, cy, 50, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - 22, cy - 8, 18, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 22, cy - 8, 18, 14, 0, 0, Math.PI * 2); ctx.fill();
    // ears
    ctx.beginPath(); ctx.ellipse(cx - 30, cy - 18, 8, 6, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 30, cy - 18, 8, 6, 0.3, 0, Math.PI * 2); ctx.fill();
    // eyes + lazy mouth
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#3a1d77';
    ctx.beginPath(); ctx.arc(cx - 12, cy - 4, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 12, cy - 4, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a1d77';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 6);
    ctx.quadraticCurveTo(cx, cy + 10, cx + 5, cy + 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawBalloonCapy(cx, cy, phase) {
    ctx.save();
    // bobbing rope sway
    const sway = Math.sin(phase * 0.7) * 4;

    // balloon: capybara face shape (giant tan ellipse) with ears
    const bx = cx + sway * 0.4, by = cy;
    ctx.fillStyle = '#c79a5e';
    ctx.beginPath(); ctx.ellipse(bx, by, 46, 52, 0, 0, Math.PI * 2); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2.5);
    // ears
    ctx.fillStyle = '#c79a5e';
    ctx.beginPath(); ctx.ellipse(bx - 36, by - 36, 14, 10, -0.4, 0, Math.PI * 2); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    ctx.beginPath(); ctx.ellipse(bx + 36, by - 36, 14, 10, 0.4, 0, Math.PI * 2); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // beard
    ctx.fillStyle = '#fff7e0';
    ctx.beginPath(); ctx.ellipse(bx, by + 22, 30, 18, 0, 0, Math.PI * 2); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // eyes
    ctx.fillStyle = '#1a0f3a';
    ctx.beginPath(); ctx.arc(bx - 16, by - 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx + 16, by - 4, 3, 0, Math.PI * 2); ctx.fill();
    // tiny smile
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx - 6, by + 10); ctx.quadraticCurveTo(bx, by + 14, bx + 6, by + 10);
    ctx.stroke();
    // ropes
    const ropeX = bx, ropeY = by + 40;
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ropeX - 14, ropeY); ctx.lineTo(ropeX - 14, ropeY + 18);
    ctx.moveTo(ropeX + 14, ropeY); ctx.lineTo(ropeX + 14, ropeY + 18);
    ctx.stroke();
    // basket
    ctx.fillStyle = '#7a4a2a';
    rrect(ropeX - 18, ropeY + 18, 36, 14, 3); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // basket weave
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(ropeX - 18 + i * 9, ropeY + 18);
      ctx.lineTo(ropeX - 18 + i * 9, ropeY + 32);
      ctx.stroke();
    }
    // passenger capybara peeking out
    drawCapybara(ropeX, ropeY + 12, 9, { helmet: 'none', skin: '#a87544' });
    ctx.restore();
  }

  function drawPlaneCapy(cx, cy, phase) {
    ctx.save();
    // plane body
    ctx.fillStyle = '#fff7e0';
    rrect(cx - 18, cy - 8, 36, 16, 6); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // nose
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.moveTo(cx + 18, cy - 8);
    ctx.lineTo(cx + 28, cy);
    ctx.lineTo(cx + 18, cy + 8);
    ctx.closePath(); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // tail fin
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy - 8);
    ctx.lineTo(cx - 26, cy - 18);
    ctx.lineTo(cx - 14, cy - 8);
    ctx.closePath(); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // wing
    ctx.fillStyle = '#cccccc';
    rrect(cx - 8, cy + 2, 18, 5, 2); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 1.5);
    // cockpit window with tiny capybara
    ctx.fillStyle = '#a8e6ff';
    ctx.beginPath(); ctx.arc(cx + 6, cy - 2, 6, 0, Math.PI * 2); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 1.5);
    drawCapybara(cx + 6, cy - 1, 5, { helmet: 'none', skin: '#a87544' });
    // propeller spinning
    const spin = (phase * 3) % (Math.PI * 2);
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 28 + Math.cos(spin) * 6,        cy + Math.sin(spin) * 6);
    ctx.lineTo(cx + 28 + Math.cos(spin + Math.PI) * 6, cy + Math.sin(spin + Math.PI) * 6);
    ctx.stroke();
    // BANNER — towed behind the plane
    const bannerX = cx - 18 - 80;
    const bannerY = cy;
    // tow line
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy);
    ctx.lineTo(bannerX + 80, bannerY);
    ctx.stroke();
    // banner background
    ctx.fillStyle = '#ffe24c';
    rrect(bannerX, bannerY - 11, 80, 22, 4); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // banner text
    ctx.fillStyle = '#1a0f3a';
    ctx.font = 'bold 12px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RIZZLE 4 PREZ', bannerX + 40, bannerY + 4);
    ctx.restore();
  }

  function drawUfoCapy(cx, cy, phase) {
    ctx.save();
    // dome
    ctx.fillStyle = '#a8e6ff';
    ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.ellipse(cx, cy - 4, 18, 14, 0, Math.PI, 0); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    ctx.globalAlpha = 1;
    // capybara at the controls
    drawCapybara(cx, cy - 4, 10, { helmet: 'none', skin: '#a87544' });
    // saucer body
    ctx.fillStyle = '#cfd6e6';
    ctx.beginPath(); ctx.ellipse(cx, cy + 2, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 2);
    // lights
    const lightOn = ((performance.now() / 150) | 0) % 2 === 0;
    ctx.fillStyle = lightOn ? '#ffe24c' : '#ff5a3c';
    ctx.beginPath(); ctx.arc(cx - 18, cy + 2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx,      cy + 4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 18, cy + 2, 2.5, 0, Math.PI * 2); ctx.fill();
    // tractor beam abducting an orange
    ctx.fillStyle = 'rgba(168, 230, 255, 0.35)';
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy + 8);
    ctx.lineTo(cx - 22, cy + 50);
    ctx.lineTo(cx + 22, cy + 50);
    ctx.lineTo(cx + 12, cy + 8);
    ctx.closePath(); ctx.fill();
    // orange being beamed up (small)
    const bob = Math.sin(phase * 2) * 3;
    ctx.fillStyle = '#ff8a1f';
    ctx.beginPath(); ctx.arc(cx, cy + 36 + bob, 7, 0, Math.PI * 2); ctx.fill();
    outlineLast(ctx, '#1a0f3a', 1.5);
    ctx.fillStyle = '#3fae3a';
    ctx.beginPath();
    ctx.moveTo(cx + 1, cy + 30 + bob);
    ctx.quadraticCurveTo(cx + 5, cy + 26 + bob, cx + 6, cy + 30 + bob);
    ctx.quadraticCurveTo(cx + 3, cy + 30 + bob, cx + 1, cy + 30 + bob);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ─── Rooftop squads & koolaid heads ───────────────────────────────────
  function drawRooftopNpcs() {
    // Plant capybara squads on a virtual rooftop line above mid buildings.
    // We don't perfectly attach to a specific building since they parallax
    // at a slightly different cadence — the eye reads it fine.
    for (const n of npcs) {
      if (n.kind !== 'rooftop') continue;
      const x = n.x;
      const roofY = GROUND_Y - 160;
      // little roof platform under them so they don't appear to float
      ctx.save();
      ctx.fillStyle = '#1a0f3a';
      ctx.fillRect(x - 6, roofY + 8, 64, 3);
      ctx.restore();
      // 3 capybara silhouettes side-by-side
      for (let i = 0; i < 3; i++) {
        drawCapybara(x + i * 18, roofY - 2, 11, {
          helmet: i === 1 ? 'fire' : 'none',
          arm: i === 2 ? 'wave' : null,
          skin: ['#a87544', '#b0855a', '#9e6c3e'][i],
        });
      }
    }
  }

  function drawKoolaidNpcs() {
    for (const n of npcs) {
      if (n.kind !== 'koolaid') continue;
      // window frame
      ctx.save();
      ctx.fillStyle = '#1a0f3a';
      ctx.fillRect(n.x - 38, n.y - 38, 76, 76);
      ctx.fillStyle = '#a8e6ff';
      ctx.fillRect(n.x - 34, n.y - 34, 68, 68);
      // shards of broken window
      ctx.fillStyle = '#fff7e0';
      ctx.beginPath();
      ctx.moveTo(n.x - 34, n.y - 34); ctx.lineTo(n.x - 18, n.y - 28); ctx.lineTo(n.x - 30, n.y - 18);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(n.x + 34, n.y - 34); ctx.lineTo(n.x + 18, n.y - 30); ctx.lineTo(n.x + 30, n.y - 16);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // GIANT capybara head bursting out, screaming "OH YEAH!"
      drawCapybara(n.x, n.y + 4, 32, { helmet: 'none', arm: 'wave', skin: '#b08252' });
      // shout bubble
      ctx.save();
      const blink = (Math.sin(n.phase * 1.5) * 0.5 + 0.5);
      ctx.globalAlpha = 0.5 + blink * 0.5;
      ctx.fillStyle = '#ffe24c';
      rrect(n.x + 28, n.y - 30, 64, 22, 5); ctx.fill();
      outlineLast(ctx, '#1a0f3a', 1.5);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#1a0f3a';
      ctx.font = 'bold 13px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OH YEAH!', n.x + 60, n.y - 16);
      ctx.restore();
    }
  }

  // ─── Danger lane + telegraph chevrons ─────────────────────────────────
  function drawDangerLane() {
    // Subtle vignette directly above the road surface so ground-level
    // obstacles read clearly against the busy mid background.
    ctx.save();
    const grd = ctx.createLinearGradient(0, GROUND_Y - 60, 0, GROUND_Y);
    grd.addColorStop(0, 'rgba(10, 6, 35, 0)');
    grd.addColorStop(1, 'rgba(10, 6, 35, 0.55)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, GROUND_Y - 60, W, 60);
    ctx.restore();
  }

  function drawTelegraphs() {
    for (const t of telegraphs) {
      const a = clamp(t.life / t.max, 0, 1);
      const blink = 0.5 + 0.5 * Math.sin(performance.now() / 60);
      ctx.save();
      ctx.globalAlpha = a * (0.6 + blink * 0.4);
      ctx.fillStyle = '#ffe24c';
      // chevron pointing left ◀
      ctx.beginPath();
      ctx.moveTo(W - 6,  t.y);
      ctx.lineTo(W - 20, t.y - 12);
      ctx.lineTo(W - 14, t.y);
      ctx.lineTo(W - 20, t.y + 12);
      ctx.closePath();
      ctx.fill();
      outlineLast(ctx, '#1a0f3a', 1.5);
      ctx.restore();
    }
  }

  function drawHotTubNpcs() {
    // capybaras chilling in window-mounted hot tubs in the mid building layer
    for (const n of npcs) {
      if (n.kind !== 'hottub') continue;
      const baseY = GROUND_Y - 2;
      const y = baseY - 110;
      const x = n.x;
      // hot tub bowl
      ctx.save();
      ctx.fillStyle = '#4ec5ff';
      rrect(x, y + 8, 56, 24, 6); ctx.fill();
      outlineLast(ctx, '#1a0f3a', 1.5);
      // steam wisps
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff7e0';
      for (let i = 0; i < 3; i++) {
        const wy = y - 6 - Math.sin(n.phase + i) * 4;
        ctx.beginPath(); ctx.arc(x + 14 + i * 14, wy, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      // capybara head peeking out
      drawCapybara(x + 28, y + 8, 10, { helmet: 'none', skin: '#a87544' });
    }
  }

  function drawSidewalkNpcs() {
    for (const n of npcs) {
      if (n.kind !== 'sidewalk') continue;
      const x = n.x;
      const y = GROUND_Y - 4;
      // tiny capybara waving from the sidewalk
      drawCapybara(x, y - 10, 12, { helmet: 'none', arm: 'wave', skin: '#a87544' });
    }
  }

  function drawHints() {
    if (mode !== 'playing') return;
    if (hintJumpAlpha <= 0 && hintWaterAlpha <= 0) return;
    if (hintJumpAlpha > 0)  drawHintCard(W * 0.5, 120, 'TAP / SPACE to JUMP', hintJumpAlpha, '#fff7e0');
    if (hintWaterAlpha > 0) drawHintCard(W * 0.5, 168, 'Grab WATER to trigger SIREN BOOST', hintWaterAlpha, '#4ec5ff');
  }

  function drawHintCard(cx, cy, text, alpha, accent) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 18px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const padX = 18, padY = 8;
    const m = ctx.measureText(text);
    const w = m.width + padX * 2;
    const h = 28 + padY;
    ctx.fillStyle = 'rgba(26, 15, 58, 0.78)';
    rrect(cx - w / 2, cy - h / 2, w, h, 14); ctx.fill();
    outlineLast(ctx, accent, 2);
    ctx.fillStyle = accent;
    ctx.fillText(text, cx, cy + 5);
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
