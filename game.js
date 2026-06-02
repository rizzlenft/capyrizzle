/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CapyRizzle Rush
 *  ───────────────
 *  Strict separation between GAME LOGIC and DECORATION.
 *
 *  ┌─────────────────────────┐    ┌──────────────────────────────────┐
 *  │  Game logic (state +    │    │  Cosmetics                       │
 *  │  physics + spawn +      │    │  • pure decoration               │
 *  │  collision + scoring)   │    │  • never affects collision/score │
 *  │  NEVER reads Cosmetics  │    │  • free to add unlimited         │
 *  │                         │    │    capybara madness later        │
 *  └─────────────────────────┘    └──────────────────────────────────┘
 *           │                                       ▲
 *           ▼                                       │
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  Sprite registry                                                │
 *  │  Sprite.draw('truck', x, y, w, h) — uses a loaded PNG if        │
 *  │  registered, else calls a procedural fallback. Swapping in art  │
 *  │  later is a one-line registration; no game code changes.        │
 *  └─────────────────────────────────────────────────────────────────┘
 * ═══════════════════════════════════════════════════════════════════════════
 */

(() => {
  const BUILD = 'v9.2-skillpass';
  // eslint-disable-next-line no-console
  console.info('%c[CapyRizzle] build ' + BUILD, 'background:#1f2640;color:#9ad1ff;padding:2px 6px;border-radius:4px;');
  // Debug overlay is opt-in via ?debug=1 in the URL. Keeps live HUD/pace
  // diagnostics available for dev without polluting the shipped game.
  const DEBUG = /[?&]debug=1\b/.test(location.search);
  (function paintBuildTag(){
    const tag = document.getElementById('debugTag');
    const stt = document.getElementById('debugState');
    if (!DEBUG) {
      if (tag) tag.style.display = 'none';
      if (stt) stt.style.display = 'none';
      return;
    }
    if (tag) tag.textContent = 'build ' + BUILD;
  })();

  'use strict';

  // ─── DOM ──────────────────────────────────────────────────────────────
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d');
  const W      = canvas.width;   // 960
  const H      = canvas.height;  // 540

  const $ = (id) => document.getElementById(id);
  const elTitle      = $('title');
  const elGameOver   = $('gameover');
  const elHud        = $('hud');
  const elScore      = $('score');
  const elBest       = $('best');
  const elBoost      = $('boost');
  const elBoostLabel = $('boostLabel');
  const elCombo      = $('combo');
  const elComboPop   = $('comboPop');
  const elMilestone  = $('milestonePop');
  const elFinal      = $('finalScore');
  const elFinalSmash = $('finalSmashed');
  const elFinalCombo = $('finalCombo');
  const elFinalBest  = $('finalBest');
  const elNewBest    = $('newBest');
  const btnStart     = $('start');
  const btnRetry     = $('retry');
  const elDebugTag   = $('debugTag');
  const elDebugState = $('debugState');
  const elBestChase  = $('bestChase');

  // ─── TUNING ───────────────────────────────────────────────────────────
  const GROUND_Y = 450;
  const TRUCK_X  = 200;
  const TRUCK_W  = 160;
  const TRUCK_H  = 80;

  // Jump feel
  const GRAVITY        = 2400;     // px/s^2 base
  const JUMP_V         = -920;     // initial jump velocity (held)
  const JUMP_CUT_V     = -380;     // released-early cut velocity (short hop)
  const APEX_GRAV_MUL  = 0.55;     // gravity multiplier near the apex (hang time)
  const APEX_BAND      = 220;      // |vy| below which we're "near apex"
  const CROUCH_TIME    = 0.07;     // seconds of anticipation crouch before liftoff
  const JUMP_BUFFER    = 0.16;     // tap-while-airborne buffer (auto-jumps on landing)

  // Pace — locked warmup, then very gentle ramp
  const BASE_SPEED    = 200;
  const WARMUP_SPEED  = 200;
  const WARMUP_TIME   = 6;         // short on-ramp — player gets moving fast
  const MAX_SPEED     = 480;       // tighter ceiling — game stays controllable
  const RAMP_PER_SEC  = 9;         // px/s gained per second after warmup

  // Boost
  const BOOST_MULT       = 1.55;
  const BOOST_TIME_PER   = 2.6;    // seconds added per water
  const BOOST_MAX_TIME   = 6.5;    // cap
  const BOOST_SCORE_MULT = 2.0;

  // Spawning
  const GRACE_TIME = 1.6;          // seconds with no obstacles at run start
  const OBSTACLE_GAP_MIN_EARLY = 520;
  const OBSTACLE_GAP_MAX_EARLY = 820;
  const OBSTACLE_GAP_MIN_LATE  = 360;
  const OBSTACLE_GAP_MAX_LATE  = 600;
  const PICKUP_GAP_MIN = 380;
  const PICKUP_GAP_MAX = 700;
  const PICKUP_LIFT_MIN = 80;
  const PICKUP_LIFT_MAX = 150;

  // Game over flow
  const HIT_FREEZE   = 0.12;       // freeze frame on hit (short, snappy)
  const HIT_FLASH    = 0.10;       // white flash duration
  const HIT_DELAY    = 0.22;       // delay before showing game-over overlay

  // Combo
  const COMBO_MAX = 20;
  const COMBO_LEVELS = [1, 3, 5, 8, 12, 16, 20]; // thresholds for the big pop
  const COMBO_GRACE  = 5.0;         // seconds of grace before decay starts
  const COMBO_DECAY_STEP = 1.4;     // seconds per -1 combo once decaying
  const NEAR_MISS_PX = 38;          // clearance under which it counts as CLOSE!
  const NEAR_MISS_POINTS = 10;

  // Slow-mo on near-miss
  const SLOWMO_FACTOR   = 0.45;
  const SLOWMO_TIME     = 0.18;

  // Milestones
  const MILESTONE_M = 250;

  const HIGHSCORE_KEY = 'capyrizzlerush_best_v5';
  const TUTORIAL_KEY  = 'capyrizzlerush_tut_v5';

  // ─── UTILITIES ────────────────────────────────────────────────────────
  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
  const lerp  = (a, b, t) => a + (b - a) * t;
  const rand  = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick  = (arr) => arr[(Math.random() * arr.length) | 0];
  const pmod  = (n, m) => ((n % m) + m) % m;
  const aabb  = (ax, ay, aw, ah, bx, by, bw, bh) =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

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
  function strokeShape(color, lw) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  // ═════════════════════════════════════════════════════════════════════
  //   SPRITE REGISTRY
  //   ───────────────
  //   Procedural-first. Register an Image to override the fallback later.
  // ═════════════════════════════════════════════════════════════════════
  const Sprite = {
    images:    {},  // name -> HTMLImageElement (only set once loaded)
    fallbacks: {},  // name -> function(x, y, w, h, opts)

    registerFallback(name, fn) {
      this.fallbacks[name] = fn;
    },

    // To use real art later:
    //   Sprite.registerImage('truck', 'assets/truck.png');
    registerImage(name, src) {
      const img = new Image();
      img.onload  = () => { this.images[name] = img; };
      img.onerror = () => { /* keep using the procedural fallback */ };
      img.src = src;
    },

    draw(name, x, y, w, h, opts) {
      const img = this.images[name];
      if (img) {
        ctx.drawImage(img, x, y, w, h);
        return;
      }
      const fn = this.fallbacks[name];
      if (fn) fn(x, y, w, h, opts || {});
    },
  };

  // ═════════════════════════════════════════════════════════════════════
  //   COSMETIC SCENE SEEDING
  //   ───────────────────────
  //   Decorative furniture that loops behind the gameplay. Drawn through
  //   the Cosmetics registry — game logic never touches anything in here.
  //
  //   Two flavors of cosmetic:
  //     • TILED (`wrap`) — coordinate wraps horizontally on a fixed period.
  //       Use for things that repeat forever (smoke plumes, billboards).
  //     • RESPAWN (`respawnX`) — drifts left, teleports back to respawnX
  //       when off-screen. Use for things you want to randomize positions.
  // ═════════════════════════════════════════════════════════════════════
  function seedCosmetics() {
    // ── Smoke columns rising from the burning city ──────────────────
    const SMOKE_SPACING = 280;
    for (let i = 0; i < 10; i++) {
      Cosmetics.add({
        layer: 'skylineBg',
        x: i * SMOKE_SPACING + rand(-80, 80),
        y: GROUND_Y - 120,
        parallax: 0.18,
        wrap: SMOKE_SPACING * 5,
        scale: rand(0.7, 1.4),
        tint: ['#7a5a8a', '#a36a8a', '#6e4d8e', '#b67c9a'][i % 4],
        draw: drawSmokeColumn,
      });
    }

    // ── Sky NPCs — capybaras spread across the whole sky ─────────────
    // Hot-air balloons at different heights / colors / speeds.
    const BALLOONS = [
      { y:  60, vx: -22, color: '#ff5a8a' },
      { y: 110, vx: -14, color: '#4ec5ff' },
      { y:  90, vx: -18, color: '#ffd24a' },
      { y:  40, vx: -12, color: '#a8e6ff' },
      { y: 130, vx: -16, color: '#ff8a3c' },
    ];
    BALLOONS.forEach((b, i) => {
      Cosmetics.add({
        layer: 'sky',
        x: W + 200 + i * 380, y: b.y,
        vx: b.vx, parallax: 0,
        respawnX: W + rand(1200, 2400),
        balloonColor: b.color,
        bobAmp: rand(4, 8), bobSpeed: rand(0.7, 1.4),
        draw: drawBalloonCapy,
      });
    });
    // Hang-glider capys gliding both directions.
    Cosmetics.add({
      layer: 'sky',
      x: -120, y: 50, vx: 16, parallax: 0,
      respawnX: -rand(900, 1500),
      draw: drawGliderCapy,
    });
    Cosmetics.add({
      layer: 'sky',
      x: W + 600, y: 75, vx: -12, parallax: 0,
      respawnX: W + rand(1000, 1800),
      draw: drawGliderCapy,
    });
    // Lazy capy clouds — capybara-shaped clouds drifting by.
    for (let i = 0; i < 4; i++) {
      Cosmetics.add({
        layer: 'sky',
        x: rand(0, W), y: rand(30, 160),
        vx: rand(-9, -4), parallax: 0,
        respawnX: W + rand(400, 1400),
        cloudScale: rand(0.7, 1.3),
        draw: drawCloudCapy,
      });
    }
    // The flying capy blimp — slow, huge, with a banner.
    Cosmetics.add({
      layer: 'sky',
      x: W + 800, y: 50, vx: -10, parallax: 0,
      respawnX: W + rand(2400, 4000),
      draw: drawCapyBlimp,
    });
    // UFO with capybara abductee.
    Cosmetics.add({
      layer: 'sky',
      x: W + 1500, y: 110, vx: -28, parallax: 0,
      respawnX: W + rand(2200, 3800),
      bobAmp: 14, bobSpeed: 2.8,
      draw: drawUfoCapy,
    });

    // ── Billboards on rooftops in the FG skyline ────────────────────
    // Each is a silly ad. Slow parallax, wraps around so they loop.
    const ADS = [
      'VOTE  CAPY', 'EAT  WATERMELON', 'STAY  WET', 'SOAK  YOUR  ROOTS',
      'NEW  RIVER  IPA', 'CAPY  4  MAYOR', 'TRUST  RIZZLE', 'BIG  TEETH',
      'HOT  TUB  WKLY', 'BLORBO  4  PRES', 'CAPY  CASINO', 'I  ♥  HAY',
    ];
    const BILL_SPACING = 520;
    for (let i = 0; i < 8; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: 200 + i * BILL_SPACING,
        y: GROUND_Y - 110 - (i % 3) * 22,
        parallax: 0.55,
        wrap: BILL_SPACING * 4,
        text: ADS[i % ADS.length],
        accent: ['#ff5a8a', '#ffd24a', '#a8e6ff', '#ff8a3c'][i % 4],
        draw: drawCapyBillboard,
      });
    }

    // ── Window NPC capys peeking out of buildings ───────────────────
    // Many of them, placed deterministically in the fg skyline.
    const WIN_SPACING = 130;
    for (let i = 0; i < 18; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: -60 + i * WIN_SPACING + (i * 71) % 80,
        y: GROUND_Y - 40 - (i % 5) * 22,
        parallax: 0.55,
        wrap: WIN_SPACING * 9,
        wave: (i * 13) % 17 < 8,
        draw: drawWindowCapy,
      });
    }

    // ── Rooftop sign-holders — protesters / cheerleaders for Rizzle ─
    const ROOF_SPACING = 360;
    const ROOF_TEXTS = ['GO  RIZZLE', 'PUT  IT  OUT', 'HERO', 'WE  ♥  CAPY', 'SAVE  US', 'MORE  WATER', 'SPLASH'];
    for (let i = 0; i < 6; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: 380 + i * ROOF_SPACING,
        y: GROUND_Y - 90,
        parallax: 0.55,
        wrap: ROOF_SPACING * 5,
        text: ROOF_TEXTS[i % ROOF_TEXTS.length],
        accent: '#fff7e0',
        draw: drawRooftopCheerCapy,
      });
    }

    // ── Hot-tub capys — chilling in a rooftop hot tub ───────────────
    Cosmetics.add({
      layer: 'skylineFg',
      x: 800, y: GROUND_Y - 105,
      parallax: 0.55, wrap: 2400,
      draw: drawHotTubCapys,
    });
    Cosmetics.add({
      layer: 'skylineFg',
      x: 2200, y: GROUND_Y - 95,
      parallax: 0.55, wrap: 2400,
      draw: drawHotTubCapys,
    });

    // ── Sidewalk capys — many small NPCs at street level ────────────
    const SIDE_SPACING = 260;
    for (let i = 0; i < 9; i++) {
      Cosmetics.add({
        layer: 'sidewalk',
        x: 600 + i * SIDE_SPACING,
        y: GROUND_Y - 16,
        parallax: 0.85,
        wrap: SIDE_SPACING * 6,
        pose: i % 4, // 0=wave 1=cheer 2=panic 3=skate
        draw: drawSidewalkCapy,
      });
    }
    // The KOOL-AID capy — bursts through a wall on the sidewalk occasionally.
    Cosmetics.add({
      layer: 'sidewalk',
      x: 1600, y: GROUND_Y - 28,
      parallax: 0.85, wrap: 3600,
      draw: drawKoolAidCapy,
    });

    // ── Floating embers — drift upward continuously, atmospheric only ────
    // No parallax, no wrap — they respawn at the bottom on their own.
    for (let i = 0; i < 14; i++) {
      Cosmetics.add({
        layer: 'farBg',
        x: rand(0, W), y: rand(GROUND_Y - 200, GROUND_Y),
        vx: rand(-6, 6), vy: rand(-40, -20),
        parallax: 0,
        emberKind: i % 3, // small/medium/large
        emberColor: ['#ff8a3c', '#ffd24a', '#ff5a3c'][i % 3],
        draw: drawFloatingEmber,
        respawnX: NaN, // signal "respawn within bounds"
        ember: true,
      });
    }

    // ── Rizzle fan billboard — full-bleed mascot poster, plural ──────────
    const RIZZLE_SPACING = 1300;
    for (let i = 0; i < 3; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: 900 + i * RIZZLE_SPACING,
        y: GROUND_Y - 130 - (i % 2) * 16,
        parallax: 0.55, wrap: RIZZLE_SPACING * 2,
        draw: drawRizzleFanBillboard,
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────
  //   TINY CAPYBARA — shared helper for cosmetic NPCs
  //   Draws a cute readable capy at given (cx, cy) with size `s` (head radius).
  //   opts: { hat?, eyeOffset?, mouth?, color? }
  // ───────────────────────────────────────────────────────────────────
  function drawTinyCapy(cx, cy, s, opts) {
    opts = opts || {};
    const outline = '#1a0f3a';
    const skin = opts.color || '#b4884f';
    ctx.save();
    // head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 1.05, s * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.16);
    ctx.strokeStyle = outline;
    ctx.stroke();
    // ears
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(cx - s * 0.78, cy - s * 0.5, s * 0.24, s * 0.18, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + s * 0.78, cy - s * 0.5, s * 0.24, s * 0.18,  0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // snout
    ctx.fillStyle = '#8c6730';
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.3, s * 0.55, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.stroke();
    // eyes (just dots)
    ctx.fillStyle = outline;
    const eo = opts.eyeOffset || 0;
    ctx.beginPath(); ctx.arc(cx - s * 0.32, cy - s * 0.08 + eo, s * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.32, cy - s * 0.08 + eo, s * 0.12, 0, Math.PI * 2); ctx.fill();
    // mouth (a little stroke)
    ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.beginPath();
    if (opts.mouth === 'smile') {
      ctx.arc(cx, cy + s * 0.42, s * 0.12, 0.1, Math.PI - 0.1);
    } else if (opts.mouth === 'o') {
      ctx.arc(cx, cy + s * 0.42, s * 0.1, 0, Math.PI * 2);
    } else {
      ctx.moveTo(cx - s * 0.06, cy + s * 0.45);
      ctx.lineTo(cx + s * 0.06, cy + s * 0.45);
    }
    ctx.stroke();
    if (opts.hat) opts.hat(cx, cy, s);
    ctx.restore();
  }

  // ───────────────────────────────────────────────────────────────────
  //   COSMETIC NPC DRAW FUNCTIONS — invoked by Cosmetics.draw(layer)
  // ───────────────────────────────────────────────────────────────────

  function drawBalloonCapy(c) {
    const bobY = Math.sin(c.phase * 1.1) * 6;
    const x = c.x, y = c.y + bobY;
    ctx.save();
    // strings
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 18, y + 38); ctx.lineTo(x - 8,  y + 56);
    ctx.moveTo(x + 18, y + 38); ctx.lineTo(x + 8,  y + 56);
    ctx.stroke();
    // basket
    ctx.fillStyle = '#8c6730';
    rrect(x - 22, y + 56, 44, 22, 4); ctx.fill();
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2;
    ctx.stroke();
    // weave lines
    ctx.lineWidth = 1;
    for (let bx = x - 18; bx < x + 22; bx += 6) {
      ctx.beginPath(); ctx.moveTo(bx, y + 58); ctx.lineTo(bx, y + 76); ctx.stroke();
    }
    // balloon
    ctx.fillStyle = c.balloonColor || '#ff5a8a';
    ctx.beginPath();
    ctx.ellipse(x, y, 28, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // balloon stripe (contrasts with balloon color)
    ctx.fillStyle = c.balloonColor === '#ffd24a' ? '#ff5a8a' : '#ffd24a';
    ctx.fillRect(x - 6, y - 36, 12, 72);
    // sheen
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(x - 10, y - 8, 5, 12, -0.3, 0, Math.PI * 2); ctx.fill();
    // capy peeking out of basket
    drawTinyCapy(x, y + 56, 9, { mouth: 'smile' });
    // tiny waving paw
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2;
    const wave = Math.sin(c.phase * 4) * 0.3;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 52);
    ctx.lineTo(x + 18 + wave * 4, y + 44 + Math.abs(wave) * 4);
    ctx.stroke();
    ctx.restore();
  }

  function drawGliderCapy(c) {
    const bobY = Math.sin(c.phase * 0.8) * 4;
    const x = c.x, y = c.y + bobY;
    ctx.save();
    // hang glider wing (triangular)
    ctx.fillStyle = '#4ec5ff';
    ctx.beginPath();
    ctx.moveTo(x - 56, y - 12);
    ctx.lineTo(x + 56, y - 12);
    ctx.lineTo(x,      y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2;
    ctx.stroke();
    // wing center strut
    ctx.beginPath();
    ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 14);
    ctx.stroke();
    // strings to capy
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 20, y + 4); ctx.lineTo(x - 6, y + 28);
    ctx.moveTo(x + 20, y + 4); ctx.lineTo(x + 6, y + 28);
    ctx.stroke();
    // capy dangling
    drawTinyCapy(x, y + 32, 10, { mouth: 'o' });
    ctx.restore();
  }

  function drawWindowCapy(c) {
    const x = c.x, y = c.y;
    ctx.save();
    // window frame
    ctx.fillStyle = '#1a0f3a';
    rrect(x - 14, y - 14, 28, 28, 2); ctx.fill();
    // warm interior glow
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 16);
    glow.addColorStop(0, 'rgba(255, 200, 120, 0.95)');
    glow.addColorStop(1, 'rgba(255, 200, 120, 0.3)');
    ctx.fillStyle = glow;
    rrect(x - 12, y - 12, 24, 24, 2); ctx.fill();
    // capy peeking
    drawTinyCapy(x, y + 2, 6, { mouth: 'smile' });
    // wave (some windows)
    if (c.wave) {
      const wave = Math.sin(c.phase * 3) * 0.3;
      ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 4);
      ctx.lineTo(x + 12 + wave * 3, y - 4 + Math.abs(wave) * 3);
      ctx.stroke();
    }
    // window cross
    ctx.strokeStyle = 'rgba(26, 15, 58, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14);
    ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawRooftopCheerCapy(c) {
    const x = c.x, y = c.y;
    const bob = Math.sin(c.phase * 4) * 2;
    ctx.save();
    // little capy
    drawTinyCapy(x, y - 4 + bob, 9, { mouth: 'o' });
    // arms up holding sign
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 2 + bob); ctx.lineTo(x - 14, y - 18 + bob);
    ctx.moveTo(x + 6, y + 2 + bob); ctx.lineTo(x + 14, y - 18 + bob);
    ctx.stroke();
    // sign
    ctx.fillStyle = c.accent || '#fff7e0';
    rrect(x - 28, y - 28 + bob, 56, 14, 3); ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#1a0f3a';
    ctx.stroke();
    ctx.fillStyle = '#1a0f3a';
    ctx.font = 'bold 9px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(c.text, x, y - 19 + bob);
    ctx.restore();
  }

  function drawCapyBillboard(c) {
    const x = c.x, y = c.y;
    ctx.save();
    // pole
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x - 2, y, 4, 60);
    // board background
    ctx.fillStyle = c.accent || '#ffd24a';
    rrect(x - 70, y - 38, 140, 44, 6); ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1a0f3a';
    ctx.stroke();
    // tiny capy mascot on the board
    drawTinyCapy(x - 50, y - 16, 10, { mouth: 'smile' });
    // ad text
    ctx.fillStyle = '#1a0f3a';
    ctx.font = 'bold 13px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(c.text, x + 14, y - 12);
    // small subtitle line
    ctx.font = 'bold 8px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(26, 15, 58, 0.7)';
    ctx.fillText('-- CAPY CO --', x + 14, y - 1);
    // little blinker on top
    const blink = (performance.now() / 500 + x * 0.01) % 2 < 1;
    ctx.fillStyle = blink ? '#ff5a3c' : 'rgba(255,90,60,0.3)';
    ctx.beginPath(); ctx.arc(x - 60, y - 40, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 60, y - 40, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawSidewalkCapy(c) {
    const x = c.x, y = c.y;
    ctx.save();
    // body (small oval)
    ctx.fillStyle = '#b4884f';
    ctx.beginPath();
    ctx.ellipse(x, y, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#1a0f3a';
    ctx.stroke();
    // head
    drawTinyCapy(x - 10, y - 6, 7, {
      mouth: c.pose === 2 ? 'o' : 'smile',
    });
    // legs
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x - 6, y + 7, 2, 6);
    ctx.fillRect(x + 4, y + 7, 2, 6);
    // pose
    if (c.pose === 0) {
      // wave — arm raised
      const wave = Math.sin(c.phase * 5) * 0.3;
      ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + 12 + wave * 3, y - 10 + Math.abs(wave) * 3);
      ctx.stroke();
    } else if (c.pose === 1) {
      // cheer — both arms up
      const cheer = Math.abs(Math.sin(c.phase * 6)) * 3;
      ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 2); ctx.lineTo(x - 16, y - 12 - cheer);
      ctx.moveTo(x + 12, y - 2); ctx.lineTo(x + 16, y - 12 - cheer);
      ctx.stroke();
    } else if (c.pose === 2) {
      // panic — arms flailing
      const flail = Math.sin(c.phase * 9) * 4;
      ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 10, y); ctx.lineTo(x - 16 + flail, y - 8 - Math.abs(flail));
      ctx.moveTo(x + 10, y); ctx.lineTo(x + 16 - flail, y - 8 - Math.abs(flail));
      ctx.stroke();
      // sweat drop
      ctx.fillStyle = '#a8e6ff';
      ctx.beginPath();
      ctx.ellipse(x - 16, y - 14 + flail, 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // skateboarding capy — leaning, with board + wheels
      ctx.fillStyle = '#1a0f3a';
      rrect(x - 14, y + 11, 28, 3, 1.5); ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 10, y + 16, 2.5, 0, Math.PI * 2);
      ctx.arc(x + 10, y + 16, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // raised arms holding balance
      ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 2); ctx.lineTo(x - 18, y - 6);
      ctx.moveTo(x + 12, y - 2); ctx.lineTo(x + 18, y - 6);
      ctx.stroke();
      // motion lines
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        ctx.moveTo(x + 18 + i * 3, y + 4); ctx.lineTo(x + 26 + i * 3, y + 4);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Capybara-shaped cloud drifting across the sky.
  function drawCloudCapy(c) {
    const x = c.x, y = c.y;
    const s = c.cloudScale || 1;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#f0e0f8';
    // body puffs
    ctx.beginPath();
    ctx.ellipse(x, y, 40 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 26 * s, y - 4 * s, 18 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 26 * s, y - 4 * s, 18 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 8 * s, y - 14 * s, 22 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // capybara face hint — ears on top, sleepy eyes
    ctx.fillStyle = '#dccef0';
    ctx.beginPath();
    ctx.ellipse(x - 12 * s, y - 22 * s, 6 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 14 * s, y - 22 * s, 6 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x - 14 * s, y - 6 * s, 4 * s, 1.5);
    ctx.fillRect(x + 6  * s, y - 6 * s, 4 * s, 1.5);
    ctx.restore();
  }

  // Giant capybara blimp with banner — slow & majestic.
  function drawCapyBlimp(c) {
    const bobY = Math.sin(c.phase * 0.6) * 5;
    const x = c.x, y = c.y + bobY;
    ctx.save();
    // blimp body
    ctx.fillStyle = '#c9a566';
    ctx.beginPath();
    ctx.ellipse(x, y, 70, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#1a0f3a';
    ctx.stroke();
    // belly band
    ctx.fillStyle = '#8c6730';
    ctx.fillRect(x - 70, y - 4, 140, 8);
    ctx.strokeRect(x - 70, y - 4, 140, 8);
    // little tail fins
    ctx.fillStyle = '#c9a566';
    ctx.beginPath();
    ctx.moveTo(x - 70, y); ctx.lineTo(x - 90, y - 12); ctx.lineTo(x - 90, y + 12); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // capy face on the nose
    drawTinyCapy(x + 56, y, 11, { mouth: 'smile' });
    // banner trailing behind
    ctx.fillStyle = '#fff7e0';
    rrect(x - 200, y + 30, 120, 26, 4); ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1a0f3a';
    ctx.font = 'bold 14px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GO  RIZZLE!', x - 140, y + 48);
    // banner rope
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 70, y + 6); ctx.lineTo(x - 80, y + 30);
    ctx.stroke();
    ctx.restore();
  }

  // UFO with a capybara inside (and a beam below).
  function drawUfoCapy(c) {
    const bobY = Math.sin(c.phase * 2.4) * 8;
    const x = c.x, y = c.y + bobY;
    ctx.save();
    // light beam (subtle)
    const beam = ctx.createLinearGradient(x, y + 10, x, y + 80);
    beam.addColorStop(0, 'rgba(168, 230, 255, 0.4)');
    beam.addColorStop(1, 'rgba(168, 230, 255, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(x - 12, y + 6); ctx.lineTo(x + 12, y + 6);
    ctx.lineTo(x + 32, y + 90); ctx.lineTo(x - 32, y + 90); ctx.closePath();
    ctx.fill();
    // saucer base
    ctx.fillStyle = '#888a9c';
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 36, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#1a0f3a';
    ctx.stroke();
    // dome
    ctx.fillStyle = '#a8e6ff';
    ctx.beginPath();
    ctx.ellipse(x, y, 18, 14, 0, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    // tiny capy inside the dome
    drawTinyCapy(x, y - 2, 6, { mouth: 'o' });
    // saucer lights — blinking
    const blink = Math.floor(c.phase * 6) % 3;
    const lightColors = ['#ff5a3c', '#ffd24a', '#4ec5ff'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === blink ? lightColors[i] : 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(x - 24 + i * 24, y + 12, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Two capybaras chilling in a rooftop hot tub.
  function drawHotTubCapys(c) {
    const x = c.x, y = c.y;
    ctx.save();
    // steam puffs
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 3; i++) {
      const ph = c.phase * 1.4 + i * 1.3;
      const sy = y - 20 - (ph % 2) * 14;
      ctx.beginPath();
      ctx.ellipse(x - 12 + i * 12, sy, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // tub
    ctx.fillStyle = '#6e3c2a';
    rrect(x - 28, y - 4, 56, 18, 3); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#1a0f3a';
    ctx.stroke();
    // water
    ctx.fillStyle = '#4ec5ff';
    rrect(x - 26, y - 2, 52, 8, 2); ctx.fill();
    // capy heads peeking out
    drawTinyCapy(x - 14, y + 1, 6, { mouth: 'smile' });
    drawTinyCapy(x + 12, y + 1, 6, { mouth: 'smile' });
    // tiny rubber duck between them
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 3.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 1, y + 1, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8a3c';
    ctx.fillRect(x + 2, y + 1, 2, 1);
    ctx.restore();
  }

  // Floating ember — drifts upward, slowly fades + flickers.
  function drawFloatingEmber(c) {
    const flicker = 0.6 + 0.4 * Math.sin(c.phase * 6 + c.x);
    const size = c.emberKind === 0 ? 1.5 : c.emberKind === 1 ? 2.5 : 3.4;
    ctx.save();
    ctx.globalAlpha = flicker * 0.9;
    ctx.globalCompositeOperation = 'lighter';
    // glow
    const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, size * 4);
    grad.addColorStop(0, c.emberColor);
    grad.addColorStop(1, 'rgba(255, 90, 60, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(c.x, c.y, size * 4, 0, Math.PI * 2); ctx.fill();
    // core
    ctx.fillStyle = '#fff7e0';
    ctx.beginPath(); ctx.arc(c.x, c.y, size, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Full-bleed Rizzle fan billboard — featuring the hero himself in poster form.
  function drawRizzleFanBillboard(c) {
    const x = c.x, y = c.y;
    ctx.save();
    // double pole
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x - 56, y + 50, 4, 60);
    ctx.fillRect(x + 56, y + 50, 4, 60);
    // poster bg with bevel
    ctx.fillStyle = '#1a0f3a';
    rrect(x - 70, y - 6, 140, 64, 6); ctx.fill();
    ctx.fillStyle = '#ff5a3c';
    rrect(x - 66, y - 2, 132, 56, 4); ctx.fill();
    // sun rays behind portrait
    ctx.save();
    ctx.translate(x - 14, y + 26);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ffd24a';
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(0, -2, 36, 4);
    }
    ctx.restore();
    // Rizzle face on the left
    drawRizzleMini(x - 14, y + 26, 18);
    // text on the right
    ctx.fillStyle = '#fff7e0';
    ctx.font = 'bold 13px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('RIZZLE', x + 12, y + 18);
    ctx.fillText('4  FIRE', x + 12, y + 36);
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 9px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.fillText('CHIEF  2026', x + 12, y + 50);
    // blinker
    const blink = (performance.now() / 400 + x * 0.01) % 2 < 1;
    ctx.fillStyle = blink ? '#ffe24c' : 'rgba(255,226,76,0.3)';
    ctx.beginPath(); ctx.arc(x - 70, y - 6, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 70, y - 6, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Tiny Rizzle portrait — beard, helmet, focused eyes.
  function drawRizzleMini(cx, cy, s) {
    const outline = '#1a0f3a';
    const skin = '#b4884f';
    ctx.save();
    // head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.82, s * 0.74, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.8; ctx.strokeStyle = outline;
    ctx.stroke();
    // beard
    ctx.fillStyle = '#fff7e0';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.55, s * 0.6, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // eyes
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.arc(cx - s * 0.28, cy - s * 0.1, s * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.28, cy - s * 0.1, s * 0.1, 0, Math.PI * 2); ctx.fill();
    // helmet brim
    ctx.fillStyle = '#d94028';
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.6, s * 1.0, s * 0.32, 0, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(cx - s * 0.95, cy - s * 0.6, s * 1.9, 4);
    ctx.strokeRect(cx - s * 0.95, cy - s * 0.6, s * 1.9, 4);
    // shield
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.95);
    ctx.lineTo(cx - s * 0.18, cy - s * 0.85);
    ctx.lineTo(cx - s * 0.18, cy - s * 0.65);
    ctx.lineTo(cx, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.18, cy - s * 0.65);
    ctx.lineTo(cx + s * 0.18, cy - s * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Kool-aid style capybara — big chonky capy "OH YEAH!" on the sidewalk.
  function drawKoolAidCapy(c) {
    const x = c.x, y = c.y;
    const bob = Math.sin(c.phase * 1.5) * 2;
    ctx.save();
    // body — big round
    ctx.fillStyle = '#c9694e';
    ctx.beginPath();
    ctx.ellipse(x, y + bob, 22, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#1a0f3a';
    ctx.stroke();
    // head on top
    drawTinyCapy(x, y - 14 + bob, 11, { mouth: 'o' });
    // arms thrown wide
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x - 18, y + bob); ctx.lineTo(x - 28, y - 6 + bob);
    ctx.moveTo(x + 18, y + bob); ctx.lineTo(x + 28, y - 6 + bob);
    ctx.stroke();
    // little speech burst
    ctx.fillStyle = '#fff7e0';
    ctx.font = 'bold 10px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2.5;
    ctx.strokeText('OH YEAH', x, y - 30 + bob);
    ctx.fillText('OH YEAH', x, y - 30 + bob);
    ctx.restore();
  }

  // Procedural smoke plume — a stack of soft puffs that sway with phase
  // and fade out toward the top.
  function drawSmokeColumn(c) {
    const baseY = GROUND_Y - 60;
    const sx = c.x;
    const scale = c.scale || 1;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    // a hint of ember at the base, sells "something is on fire down there"
    ctx.fillStyle = 'rgba(255, 130, 50, 0.4)';
    ctx.beginPath();
    ctx.ellipse(sx, baseY, 36 * scale, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    // puff stack
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const py = baseY - i * 26 * scale - 8;
      const sway = Math.sin(c.phase * 0.5 + i * 0.6) * (4 + i * 2) * scale;
      const radius = (16 + i * 4) * scale;
      const alpha = (1 - t) * 0.55;
      ctx.fillStyle = c.tint;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sx + sway, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ═════════════════════════════════════════════════════════════════════
  //   COSMETICS REGISTRY
  //   ──────────────────
  //   Anything purely decorative goes here. Game logic NEVER touches it.
  //   This is where future capybara madness gets bolted on — billboards,
  //   sky NPCs, building easter eggs — without any change to gameplay.
  //
  //   Layer order (back → front):
  //     'sky'        — drifts independently
  //     'farBg'      — behind the skyline
  //     'skylineBg'  — behind the skyline silhouette
  //     'skylineFg'  — in front of the skyline silhouette
  //     'sidewalk'   — on the road's sidewalk strip
  //
  //   Each cosmetic spec:
  //     {
  //       layer: 'sky' | 'farBg' | 'skylineBg' | 'skylineFg' | 'sidewalk',
  //       x, y,
  //       vx?, vy?,                     // own velocity (sky usually); 0 means parallax-driven
  //       parallax?: number,            // 0..1, fraction of worldSpeed applied
  //       phase?: number,               // free animation phase
  //       wrap?: number,                // wrap x by this width (for tile-like cosmetics)
  //       respawnX?: number,            // when off-screen-left, respawn at this x
  //       draw(c)                       // c = the full cosmetic spec
  //                                       (use c.x / c.y / c.phase plus any
  //                                       custom fields you stashed on it)
  //     }
  // ═════════════════════════════════════════════════════════════════════
  const Cosmetics = {
    items: [],

    add(spec) {
      spec.phase = spec.phase != null ? spec.phase : Math.random() * Math.PI * 2;
      spec.vx    = spec.vx    || 0;
      spec.vy    = spec.vy    || 0;
      spec.parallax = spec.parallax || 0;
      this.items.push(spec);
      return spec;
    },

    clear() { this.items.length = 0; },

    update(dt, worldSpeed) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const c = this.items[i];
        c.phase += dt;
        c.x += c.vx * dt - worldSpeed * dt * c.parallax;
        c.y += c.vy * dt;
        if (c.ember) {
          // floating embers drift upward and respawn near ground when
          // they cross the top of the world (or drift off-screen).
          if (c.y < -20 || c.x < -40 || c.x > W + 40) {
            c.x = Math.random() * W;
            c.y = GROUND_Y - 10 + Math.random() * 30;
            c.vx = (Math.random() - 0.5) * 12;
            c.vy = -20 - Math.random() * 30;
          }
        } else if (c.wrap) {
          // tile-like: wrap around horizontally
          if (c.x < -c.wrap) c.x += c.wrap * 2;
        } else if (typeof c.respawnX === 'number') {
          if (c.x < -200) c.x = c.respawnX;
        } else if (c.x < -400) {
          this.items.splice(i, 1);
        }
      }
    },

    draw(layer) {
      for (const c of this.items) {
        if (c.layer === layer) c.draw(c);
      }
    },
  };

  // ═════════════════════════════════════════════════════════════════════
  //   AUDIO
  //   Lightweight WebAudio synthesis. One-shots only.
  // ═════════════════════════════════════════════════════════════════════
  let ac = null;
  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ac = new AC();
    }
    return ac;
  }
  function blip(freq, dur, type, vol, slideTo, attack) {
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    const a = attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol) {
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }
  // Combo-aware audio — most sounds rise in pitch with combo for a
  // "leveling up" feel as a run gets hot. Combo expected in [1, 20].
  const sfx = {
    jump(combo = 1) {
      const f = 320 + Math.min(20, combo) * 18;
      blip(f, 0.16, 'square', 0.05, f * 2.1);
    },
    land()   { noise(0.10, 0.05); blip(140, 0.08, 'sine', 0.05, 80); },
    pickup(combo = 1) {
      const a = 560 + Math.min(20, combo) * 22;
      blip(a, 0.08, 'triangle', 0.06, a * 1.6);
      blip(a * 1.5, 0.10, 'triangle', 0.05, a * 2.3);
    },
    nearMiss(combo = 1) {
      // Quick high "ting" with a tiny swell so close jumps feel satisfying.
      const f = 1100 + Math.min(20, combo) * 30;
      blip(f, 0.06, 'sine', 0.04, f * 1.4, 0.002);
      blip(f * 1.5, 0.04, 'triangle', 0.03, f * 1.2);
    },
    boost()  { blip(220, 0.30, 'sawtooth', 0.07, 880); blip(660, 0.18, 'square', 0.05, 1320); noise(0.20, 0.04); },
    smash(combo = 1) {
      const c = Math.min(20, combo);
      blip(110 + c * 12, 0.18, 'sawtooth', 0.08, 60 + c * 4);
      noise(0.12, 0.08);
      blip(860 + c * 28, 0.06, 'square', 0.04, 220);
    },
    crash()  { blip( 80, 0.50, 'sawtooth', 0.10,  40); noise(0.35, 0.12); },
  };

  // ═════════════════════════════════════════════════════════════════════
  //   GAME STATE
  // ═════════════════════════════════════════════════════════════════════
  /** @type {'title'|'playing'|'dying'|'gameover'} */
  let mode = 'title';

  const state = {
    runTime: 0,
    distance: 0,
    score: 0,
    best: parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0,
    speed: BASE_SPEED,

    boostTime: 0,
    boosting: false,
    boostUsed: 0,           // total boost time used this run

    // run stats for the game-over screen
    firesSmashed: 0,
    watersGrabbed: 0,
    nearMisses: 0,
    shieldsGrabbed: 0,
    combo: 1,
    bestCombo: 1,           // best combo this run
    comboLevelShown: 0,     // last threshold index we celebrated
    // Combo decay — resets to COMBO_GRACE seconds whenever the combo
    // increases. Once it hits zero, combo erodes by 1 per COMBO_DECAY_STEP
    // seconds. Adds tension to lulls without snapping a long combo on
    // a single quiet pattern.
    comboGrace: 0,
    comboDecayClock: 0,

    // Shield (one-hit immunity). Acquired from rare gold-star pickups.
    // Consumed by the next fire collision: pop a SAVED! popup + spark burst
    // and smash the fire instead of dying.
    shield: false,
    shieldFlash: 0,         // visual fade after consuming

    // brief slow-mo on near-miss (timer is decremented in REAL time)
    slowMo: 0,

    // milestone tracking
    nextMilestone: MILESTONE_M,

    // Cumulative bonus pool — all scoring bonuses (smash, near-miss, pickup,
    // milestone) accumulate here instead of being injected into `distance`.
    // Previously bonuses bumped `distance`, which inflated `score` next frame,
    // which crossed more milestones, which gave bigger distance bonuses…
    // exponential snowball that froze the JS thread once combo > 5.
    bonusScore: 0,

    // truck
    truck: {
      x: TRUCK_X, y: GROUND_Y - TRUCK_H, vy: 0,
      onGround: true,
      squash: 1, stretch: 1,           // y/x scale
      crouchT: 0,                      // anticipation timer; while >0, queued jump pending
      pendingJump: false,
      jumpBuffer: 0,                   // input-buffer countdown for taps-while-airborne
      jumpHeld: false,                 // is the jump button currently held? (variable jump)
      bob: 0,                          // continuous road-bob phase
      blinkT: rand(2, 4),              // seconds until next blink
      blinking: 0,                     // remaining blink animation
    },

    // entities
    obstacles: [],   // {x,y,w,h,kind:'fire',phase}
    pickups: [],     // {x,y,w,h,kind:'water',phase,taken?}
    particles: [],
    popups: [],

    // spawn timers
    nextObstacleDist: 900,
    nextPickupDist: 700,

    // screen effects
    shake: { mag: 0, time: 0 },
    flashWhite: 0,
    freezeT: 0,
    deathT: 0,             // post-hit countdown before showing overlay
    cameraBob: 0,

    // tutorial
    hint: {
      jumpA: 0, waterA: 0, shieldA: 0,
      jumpDone: false, waterDone: false, shieldDone: false,
    },

    // parallax offsets
    bg: { sky: 0, farSkyline: 0, road: 0 },
  };

  // ═════════════════════════════════════════════════════════════════════
  //   INPUT
  // ═════════════════════════════════════════════════════════════════════
  function press(e) {
    if (e && e.cancelable) e.preventDefault();
    audio(); // unlock on first interaction
    state.truck.jumpHeld = true;
    if (mode === 'title' || mode === 'gameover') {
      const t = e && e.target;
      if (!t || (t !== btnStart && t !== btnRetry)) startGame();
      return;
    }
    if (mode === 'playing') queueJump();
  }
  // Release a held jump early — cuts the rising velocity to JUMP_CUT_V so
  // tap = short hop, hold = full jump. Adds a real skill ceiling without
  // changing the difficulty floor.
  function release() {
    state.truck.jumpHeld = false;
    if (mode !== 'playing') return;
    const t = state.truck;
    if (!t.onGround && t.vy < JUMP_CUT_V) t.vy = JUMP_CUT_V;
  }
  canvas.addEventListener('pointerdown', press);
  elTitle.addEventListener('pointerdown', press);
  elGameOver.addEventListener('pointerdown', press);
  canvas.addEventListener('pointerup',     release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') press(e);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') release();
  });
  btnStart.addEventListener('click', () => startGame());
  btnRetry.addEventListener('click', () => startGame());

  function queueJump() {
    const t = state.truck;
    // Already on the ground? Start the anticipation crouch immediately.
    if (t.onGround && t.crouchT <= 0) {
      t.crouchT = CROUCH_TIME;
      t.pendingJump = true;
      t.squash = 0.62;
      t.stretch = 1.18;
      return;
    }
    // Already crouching this jump? Tap is no-op (don't restart the crouch).
    if (t.crouchT > 0) return;
    // Airborne: stash the press in a short buffer so it auto-fires the
    // moment we land. Makes the controls feel forgiving and snappy.
    t.jumpBuffer = JUMP_BUFFER;
  }
  function actuallyJump() {
    const t = state.truck;
    t.vy = JUMP_V;
    t.onGround = false;
    t.squash = 0.72;
    t.stretch = 1.30;
    // Variable jump: if the player ALREADY released the button before the
    // crouch finished, this is a tap → apply the cut immediately so the
    // hop is short. (Held tap → full -920 ascent.)
    if (!t.jumpHeld) t.vy = JUMP_CUT_V;
    spawnDust(t.x + TRUCK_W * 0.5, GROUND_Y, 9, '#fff7e0');
    sfx.jump(state.combo);
    if (!state.hint.jumpDone) state.hint.jumpDone = true;
  }

  // ═════════════════════════════════════════════════════════════════════
  //   LIFECYCLE
  // ═════════════════════════════════════════════════════════════════════
  function setMode(m) {
    mode = m;
    elTitle.classList.toggle('hidden', m !== 'title');
    elGameOver.classList.toggle('hidden', m !== 'gameover');
    elHud.classList.toggle('hidden', m === 'title');
  }

  function resetRun() {
    const tutSeen = localStorage.getItem(TUTORIAL_KEY) === '1';

    state.runTime = 0;
    state.distance = 0;
    state.score = 0;
    state.speed = WARMUP_SPEED;

    state.boostTime = 0;
    state.boosting = false;
    state.boostUsed = 0;
    state.firesSmashed = 0;
    state.watersGrabbed = 0;
    state.nearMisses = 0;
    state.shieldsGrabbed = 0;
    state.shield = false;
    state.shieldFlash = 0;
    state.comboGrace = 0;
    state.comboDecayClock = 0;
    state.combo = 1;
    state.bestCombo = 1;
    state.comboLevelShown = 0;
    state.slowMo = 0;
    state.nextMilestone = MILESTONE_M;
    state.bonusScore = 0;

    Object.assign(state.truck, {
      x: TRUCK_X, y: GROUND_Y - TRUCK_H, vy: 0,
      onGround: true, squash: 1, stretch: 1,
      crouchT: 0, pendingJump: false, jumpBuffer: 0, bob: 0, jumpHeld: false,
      blinkT: rand(2, 4), blinking: 0,
    });

    state.obstacles.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.popups.length = 0;

    state.nextObstacleDist = 900;
    state.nextPickupDist   = 700;
    state.patternCount     = 0;

    state.shake.mag = 0; state.shake.time = 0;
    state.flashWhite = 0;
    state.freezeT = 0;
    state.deathT = 0;
    state.cameraBob = 0;

    state.hint.jumpDone   = tutSeen;
    state.hint.waterDone  = tutSeen;
    state.hint.shieldDone = localStorage.getItem(TUTORIAL_KEY + '_shield') === '1';
    state.hint.jumpA     = tutSeen ? 0 : 1;
    state.hint.waterA    = tutSeen ? 0 : 1;
    state.hint.shieldA   = 0; // pops on first pickup, not on boot

    // Wipe + reseed cosmetic furniture (smoke columns, billboards, capys, …).
    Cosmetics.clear();
    seedCosmetics();
  }

  function startGame() {
    resetRun();
    setMode('playing');
  }

  function die(cause) {
    state.freezeT  = HIT_FREEZE;
    state.flashWhite = HIT_FLASH;
    state.deathT    = HIT_DELAY;
    state.shake.mag = Math.max(state.shake.mag, 18);
    state.shake.time = Math.max(state.shake.time, 0.45);
    state.slowMo = 0;            // never let near-miss slow-mo stretch the death sequence
    resetCombo();
    // big particle burst
    spawnCrash(state.truck.x + TRUCK_W * 0.5, state.truck.y + TRUCK_H * 0.4);
    sfx.crash();
    mode = 'dying'; // suspended state — entities frozen, particles continue
  }

  // Run rank — gives the player a clear progression target across runs.
  // Tuned against typical scores observed in playtest:
  //   distance-only 30s run        ≈    900
  //   solid jumping 60s run        ≈  5,000
  //   with a couple boost smashes  ≈ 15,000
  //   long boost-chain run         ≈ 40,000+
  //   master run                   ≈100,000+
  const RANK_TIERS = [
    { min: 100000, label: 'S', color: '#ffe24c' },
    { min:  40000, label: 'A', color: '#ff8a3c' },
    { min:  15000, label: 'B', color: '#a8e6ff' },
    { min:   5000, label: 'C', color: '#8c6bff' },
    { min:      0, label: 'D', color: '#9ad1ff' },
  ];
  function rankFor(score) {
    for (const t of RANK_TIERS) if (score >= t.min) return t;
    return RANK_TIERS[RANK_TIERS.length - 1];
  }

  function finishDeath() {
    // Tally + present results
    const final = state.score;
    let newBest = false;
    if (final > state.best) {
      state.best = final;
      newBest = true;
      try { localStorage.setItem(HIGHSCORE_KEY, String(state.best)); } catch {}
    }
    setText(elFinal,      final.toLocaleString());
    setText(elFinalSmash, String(state.firesSmashed));
    setText(elFinalCombo, '×' + state.bestCombo);
    setText(elFinalBest,  state.best.toLocaleString());
    if (elNewBest) elNewBest.classList.toggle('hidden', !newBest);
    // Rank
    const rank = rankFor(final);
    const elRank = $('finalRank');
    if (elRank) {
      elRank.textContent = rank.label;
      elRank.style.color = rank.color;
      elRank.style.textShadow = '0 0 24px ' + rank.color + '88';
    }
    // Mini stats — secondary detail strip
    const dist = Math.floor(state.distance / 10);
    setText($('finalDist'),   dist.toLocaleString() + 'm');
    const t = Math.max(0, state.runTime);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    setText($('finalTime'),   m + ':' + s);
    setText($('finalNear'),   String(state.nearMisses || 0));
    setText($('finalBoosts'), String(state.watersGrabbed || 0));
    const shieldsEl = $('finalShields');
    const shieldStat = document.querySelector('.mini-shield');
    const shieldSep  = document.querySelector('.mini-shield-sep');
    if (state.shieldsGrabbed > 0) {
      setText(shieldsEl, String(state.shieldsGrabbed));
      shieldStat && shieldStat.classList.remove('hidden');
      shieldSep && shieldSep.classList.remove('hidden');
    } else {
      shieldStat && shieldStat.classList.add('hidden');
      shieldSep && shieldSep.classList.add('hidden');
    }
    setMode('gameover');
  }

  // Defensive DOM helper — guarantees a missing element can never freeze the
  // frame loop. (Stale browser HTML caches have bitten us before.)
  function setText(el, text) { if (el) el.textContent = text; }
  function setStyleWidth(el, w) { if (el) el.style.width = w; }

  // ═════════════════════════════════════════════════════════════════════
  //   SPAWNING — authored patterns instead of random obstacles
  //   Each pattern is a list of items with dx (px from leading edge),
  //   plus its total span so the spawn timer can give breathing room.
  //
  //   Variants are visual-only; the collider is always a fire-shaped box.
  // ═════════════════════════════════════════════════════════════════════
  // Tuning math reference — VERIFIED by tools/playtest.mjs on every run.
  //   Jump airtime:           ~0.916s (with apex hang)
  //   Peak height:             ~184 px above ground
  //   Jump-to-jump cycle:     ~1.016s minimum (land + crouch + relaunch)
  //   Single fire clear time: (truck_hb + fire_hb) / speed
  //     • At WARMUP 200 px/s: ~0.62s
  //     • At MAX    520 px/s: ~0.24s  (always fits in 0.916s airtime)
  //   Multi-fire spacing required (dx between consecutive fires):
  //     • At WARMUP 200 px/s: dx ≥ 204 px
  //     • At MAX    520 px/s: dx ≥ 530 px
  //   We use dx ≥ 600 between fires so EVERY multi-fire pattern is jumpable
  //   at every speed the game ever reaches (verified by playtest).
  // All fire variants are warm-spectrum (red/orange/magenta) so they can
  // never be mistaken for the cool-blue water pickup. Previously we had a
  // 'blue' flame variant which confused players (cool-colored hazard looked
  // pickup-like) — replaced with a magenta 'ember' flame.
  const FIRE_VARIANTS = {
    // name        w    h    color1     color2     core
    torch:     { w: 60, h: 92,  color1: '#ff5a3c', color2: '#ffb14c', core: '#ffe9a8' },
    tall:      { w: 54, h: 108, color1: '#ff3a2a', color2: '#ffd24a', core: '#fff7e0' },
    ember:     { w: 56, h: 96,  color1: '#ff3a8a', color2: '#ffb14c', core: '#ffe9a8' },
    pit:       { w: 64, h: 50,  color1: '#ff5a3c', color2: '#ffb14c', core: '#ffe9a8' },
    short:     { w: 62, h: 68,  color1: '#ff8a3c', color2: '#ffd24a', core: '#fff7e0' },
  };

  // Reference: a fire's collider takes ~ (truckHitboxW + fireHitboxW)/speed
  // seconds of overlap with the truck hitbox. With pad 10 on each side,
  // hitbox widths are (w − 20). At base speed 200 px/s a single jump
  // (~0.92s airtime) can clear a fire whose hitbox + truck hitbox < 184 px,
  // i.e. fire w ≤ ~70 px. All our fire variants satisfy this with margin.
  //
  // Multi-fire patterns: minimum dx between two fires must be >= one full
  // "jump-and-land-and-jump-again" cycle distance at the current speed
  // (cycle ≈ jump airtime 0.92s + crouch 0.07s = ~1.0s = ~200 px @ start).
  // So we use dx ≥ 240 between separate fires in a pattern.
  const PATTERNS = [
    // ── Easy (phase 1) ──
    { name: 'single',     phase: 1, weight: 5, items: [{ kind: 'fire', dx: 0, variant: 'torch' }] },
    { name: 'singleShort',phase: 1, weight: 3, items: [{ kind: 'fire', dx: 0, variant: 'short' }] },
    { name: 'easyWater',  phase: 1, weight: 2, items: [{ kind: 'water', dx: 0, lift: 90 }] },

    // ── Medium (phase 2) ──
    { name: 'tall',       phase: 2, weight: 3, items: [{ kind: 'fire', dx: 0, variant: 'tall' }] },
    { name: 'ember',      phase: 2, weight: 2, items: [{ kind: 'fire', dx: 0, variant: 'ember' }] },
    { name: 'pit',        phase: 2, weight: 2, items: [{ kind: 'fire', dx: 0, variant: 'pit'  }] },
    { name: 'doubleWide', phase: 2, weight: 3, items: [
        { kind: 'fire', dx: 0,   variant: 'short' },
        { kind: 'fire', dx: 600, variant: 'short' },
    ]},
    // Mid-jump water reward — water lifted to ~jump peak height
    // (truck top reaches GROUND_Y - TRUCK_H - 184 = 186; we want truck top
    // to just touch the water bottom at peak. water y = GROUND_Y - 52 - lift.
    // lift = 220 puts the water cleanly within the jump arc.)
    { name: 'jumpReward', phase: 2, weight: 2, items: [
        { kind: 'fire',  dx: 0,   variant: 'short' },
        { kind: 'water', dx: 110, lift: 140 },
    ]},

    // Pit then a low water pickup — reward for nailing a precise jump.
    { name: 'pitWater',   phase: 2, weight: 2, items: [
        { kind: 'fire',  dx: 0,   variant: 'pit' },
        { kind: 'water', dx: 90,  lift: 60 },
    ]},
    // Chain of waters for a quick boost top-up.
    { name: 'waterChain', phase: 1, weight: 2, items: [
        { kind: 'water', dx: 0,   lift: 60 },
        { kind: 'water', dx: 200, lift: 90 },
    ]},

    // ── Hard (phase 3) ──
    { name: 'triple',     phase: 3, weight: 2, items: [
        { kind: 'fire', dx: 0,    variant: 'short' },
        { kind: 'fire', dx: 600,  variant: 'short' },
        { kind: 'fire', dx: 1200, variant: 'short' },
    ]},
    { name: 'pit+tall',   phase: 3, weight: 2, items: [
        { kind: 'fire', dx: 0,   variant: 'pit' },
        { kind: 'fire', dx: 620, variant: 'tall' },
    ]},
    { name: 'rewardRun',  phase: 3, weight: 1, items: [
        { kind: 'fire',  dx: 0,    variant: 'torch' },
        { kind: 'water', dx: 110,  lift: 140 },
        { kind: 'fire',  dx: 640,  variant: 'torch' },
    ]},
    // Iron run — four fires, hardest single pattern. Spacing 600px
    // each so still single-jumpable at MAX speed (verified in playtest).
    { name: 'ironRun',    phase: 3, weight: 1, items: [
        { kind: 'fire', dx: 0,    variant: 'short' },
        { kind: 'fire', dx: 600,  variant: 'tall'  },
        { kind: 'fire', dx: 1200, variant: 'short' },
        { kind: 'fire', dx: 1800, variant: 'torch' },
    ]},

    // ── New patterns (playability pass) ──

    // The "high jump" — an ember fire flanked by lifted waters so the player
    // is rewarded for the long arc.
    { name: 'emberDance', phase: 2, weight: 2, items: [
        { kind: 'water', dx: 0,   lift: 140 },
        { kind: 'fire',  dx: 320, variant: 'ember' },
        { kind: 'water', dx: 620, lift: 80 },
    ]},

    // Tight pit + tall combo from short distance — emphasizes commit timing.
    { name: 'commit',     phase: 3, weight: 2, items: [
        { kind: 'fire', dx: 0,   variant: 'short' },
        { kind: 'fire', dx: 620, variant: 'pit'  },
    ]},

    // A pure water river — bonus boost top-up. Easy to skip if you're already
    // boosting, valuable if you're not.
    { name: 'riverRun',   phase: 2, weight: 2, items: [
        { kind: 'water', dx: 0,   lift: 60  },
        { kind: 'water', dx: 200, lift: 100 },
        { kind: 'water', dx: 400, lift: 70  },
    ]},

    // The "tease" — fake out: one tall fire then a wide gap, so the player
    // has to slow their jump cadence.
    { name: 'breather',   phase: 1, weight: 2, items: [
        { kind: 'fire',  dx: 0,   variant: 'short' },
        { kind: 'water', dx: 480, lift: 30  },
    ]},

    // Ember + reward — high jump into a high water = a satisfying chain.
    { name: 'emberWater', phase: 3, weight: 1, items: [
        { kind: 'fire',  dx: 0,   variant: 'ember' },
        { kind: 'water', dx: 220, lift: 180 },
    ]},

    // Late game spectacle — pit, then tall, then ember. Hardest authored.
    { name: 'gauntlet',   phase: 3, weight: 1, items: [
        { kind: 'fire', dx: 0,    variant: 'pit'   },
        { kind: 'fire', dx: 640,  variant: 'tall'  },
        { kind: 'fire', dx: 1280, variant: 'ember' },
    ]},

    // RARE: shield pickup, dropped between two safe fires. Player decides
    // whether to risk an extra jump for a one-hit immunity buff.
    { name: 'shieldDrop', phase: 2, weight: 1, items: [
        { kind: 'fire',   dx: 0,   variant: 'short' },
        { kind: 'shield', dx: 320, lift: 140 },
        { kind: 'fire',   dx: 640, variant: 'short' },
    ]},
    // RARE: lone shield gift on a breather. Always grabbable.
    { name: 'shieldGift', phase: 3, weight: 1, items: [
        { kind: 'shield', dx: 0, lift: 110 },
    ]},
  ];

  function currentPhase() {
    // Tuned to the new speed curve (WARMUP_TIME 6, RAMP 9, MAX 480):
    //   t= 6s → speed 200 (warmup ends)
    //   t=15s → speed 281 (phase 1→2: introduce multi-fire + water reward)
    //   t=35s → speed 461 (phase 2→3: triple, pit+tall, rewardRun unlock)
    //   t≈37s → MAX_SPEED reached
    if (state.runTime < 15) return 1;
    if (state.runTime < 35) return 2;
    return 3;
  }

  function pickPattern() {
    const phase = currentPhase();
    const candidates = PATTERNS.filter(p => p.phase <= phase);
    let total = 0;
    for (const p of candidates) total += p.weight;
    let r = Math.random() * total;
    for (const p of candidates) {
      if ((r -= p.weight) <= 0) return p;
    }
    return candidates[0];
  }

  function spawnPattern() {
    const p = pickPattern();
    let span = 0;
    for (const it of p.items) {
      const baseX = W + 80 + it.dx;
      if (it.kind === 'fire') {
        const v = FIRE_VARIANTS[it.variant] || FIRE_VARIANTS.torch;
        const w = v.w, h = v.h;
        state.obstacles.push({
          x: baseX,
          y: GROUND_Y - h,
          w, h,
          kind: 'fire',
          variant: it.variant || 'torch',
          phase: Math.random() * Math.PI * 2,
          passed: false,
        });
        if (it.dx + w > span) span = it.dx + w;
      } else if (it.kind === 'water') {
        const w = 48, h = 52;
        const lift = it.lift != null ? it.lift : rand(PICKUP_LIFT_MIN, PICKUP_LIFT_MAX);
        state.pickups.push({
          x: baseX, y: GROUND_Y - h - lift, w, h,
          kind: 'water',
          phase: Math.random() * Math.PI * 2,
        });
        if (it.dx + w > span) span = it.dx + w;
      } else if (it.kind === 'shield') {
        const w = 44, h = 44;
        const lift = it.lift != null ? it.lift : 120;
        state.pickups.push({
          x: baseX, y: GROUND_Y - h - lift, w, h,
          kind: 'shield',
          phase: Math.random() * Math.PI * 2,
        });
        if (it.dx + w > span) span = it.dx + w;
      }
    }
    // Add breathing room after the pattern based on speed/phase.
    const phase = currentPhase();
    const breathe = phase === 1 ? rand(540, 760) : phase === 2 ? rand(420, 620) : rand(360, 540);
    // Every Nth pattern is a guaranteed breather — gives the run a heartbeat
    // rhythm (intense / calm / intense) instead of a flat wall of obstacles.
    state.patternCount = (state.patternCount || 0) + 1;
    const isBreather = state.patternCount % 5 === 0;
    state.nextObstacleDist = span + breathe + (isBreather ? rand(420, 640) : 0);
  }

  function spawnLooseWater() {
    const w = 48, h = 52;
    const y = GROUND_Y - h - rand(PICKUP_LIFT_MIN, PICKUP_LIFT_MAX);
    state.pickups.push({
      x: W + 80, y, w, h,
      kind: 'water',
      phase: Math.random() * Math.PI * 2,
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  //   PARTICLES & POPUPS
  // ═════════════════════════════════════════════════════════════════════
  function spawnDust(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      state.particles.push({
        x: x + rand(-14, 14), y: y - 2,
        vx: rand(-220, 220), vy: -rand(20, 110),
        life: rand(0.35, 0.55), max: 0.55,
        size: rand(4, 8), color, kind: 'dust', grav: -10,
      });
    }
  }
  function spawnSpark(x, y, n, palette) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(180, 420);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.4, 0.7), max: 0.7,
        size: rand(3, 6), color: pick(palette), kind: 'spark', grav: 700,
      });
    }
  }
  function spawnFireFlick(x, y) {
    if (Math.random() > 0.45) return;
    state.particles.push({
      x: x + rand(-8, 8), y: y + rand(-4, 4),
      vx: rand(-30, 30), vy: -rand(70, 130),
      life: 0.5, max: 0.5,
      size: rand(4, 7), color: Math.random() < 0.5 ? '#ffb14c' : '#ff5a3c',
      kind: 'flame', grav: -100,
    });
  }
  function spawnBoostFlame() {
    for (let n = 0; n < 2; n++) {
      state.particles.push({
        x: state.truck.x - rand(0, 24),
        y: state.truck.y + rand(TRUCK_H * 0.45, TRUCK_H * 0.85),
        vx: -rand(260, 420), vy: rand(-30, 30),
        life: 0.34, max: 0.34,
        size: rand(7, 13),
        color: Math.random() < 0.5 ? '#ffe24c' : '#ff5a3c',
        kind: 'flame', grav: 0,
      });
    }
  }
  function spawnCrash(x, y) {
    spawnSpark(x, y, 32, ['#ff5a3c', '#ffb14c', '#ffe24c', '#fff7e0', '#1a0f3a']);
    for (let i = 0; i < 12; i++) {
      state.particles.push({
        x: x + rand(-10, 10), y: y - 6,
        vx: rand(-160, 160), vy: -rand(120, 260),
        life: rand(0.6, 1.0), max: 1.0,
        size: rand(8, 14), color: pick(['#1a0f3a', '#5a607a']),
        kind: 'dust', grav: 600,
      });
    }
  }
  function popup(text, x, y, color) {
    state.popups.push({ x, y, text, color: color || '#fff7e0', life: 0.95, max: 0.95, vy: -56 });
  }

  function shake(mag, dur) {
    state.shake.mag  = Math.max(state.shake.mag, mag);
    state.shake.time = Math.max(state.shake.time, dur);
  }

  // ── Combo ──────────────────────────────────────────────────────────
  function addCombo(n) {
    const before = state.combo;
    state.combo = Math.min(COMBO_MAX, state.combo + n);
    if (state.combo > state.bestCombo) state.bestCombo = state.combo;
    // celebrate threshold jumps with a screen pop + sound
    for (let i = state.comboLevelShown + 1; i < COMBO_LEVELS.length; i++) {
      if (state.combo >= COMBO_LEVELS[i]) {
        state.comboLevelShown = i;
        showComboPop('×' + COMBO_LEVELS[i] + '!');
        state.flashWhite = Math.max(state.flashWhite, 0.08);
        shake(5, 0.16);
        // gentle ascending bleep per threshold
        blip(440 + i * 80, 0.16, 'triangle', 0.06, 880 + i * 80);
      }
    }
    if (state.combo !== before) bumpComboPill();
    // Any combo gain refreshes the decay grace window.
    state.comboGrace = COMBO_GRACE;
    state.comboDecayClock = 0;
  }
  function resetCombo() {
    state.combo = 1;
    state.comboLevelShown = 0;
    state.comboGrace = 0;
    state.comboDecayClock = 0;
  }

  // Centralized bonus accumulator. All score bonuses (smash, near-miss,
  // pickup, milestone) MUST go through this — never write directly to
  // state.distance, which would inflate next-frame score and risk a
  // milestone-feedback freeze.
  function awardBonus(pts) {
    if (pts <= 0) return;
    state.bonusScore += pts;
  }
  function bumpComboPill() {
    if (!elCombo) return;
    elCombo.classList.remove('bumped');
    void elCombo.offsetWidth;
    elCombo.classList.add('bumped');
    setTimeout(() => elCombo.classList.remove('bumped'), 140);
  }
  function showComboPop(text) {
    if (!elComboPop) return;
    elComboPop.textContent = text;
    elComboPop.classList.remove('hidden');
    elComboPop.style.animation = 'none';
    void elComboPop.offsetWidth;
    elComboPop.style.animation = '';
    setTimeout(() => elComboPop.classList.add('hidden'), 750);
  }
  function showMilestone(text) {
    if (!elMilestone) return;
    elMilestone.textContent = text;
    elMilestone.classList.remove('hidden');
    elMilestone.style.animation = 'none';
    void elMilestone.offsetWidth;
    elMilestone.style.animation = '';
    setTimeout(() => elMilestone.classList.add('hidden'), 1100);
  }

  // ═════════════════════════════════════════════════════════════════════
  //   UPDATE
  // ═════════════════════════════════════════════════════════════════════
  function update(dt) {
    // Always-on background drift
    state.bg.sky += dt * 4;

    // Particles + popups always tick (so the crash burst plays out on death)
    updateParticles(dt);

    // Screen shake decays always
    if (state.shake.time > 0) {
      state.shake.time -= dt;
      state.shake.mag *= 0.9;
      if (state.shake.time <= 0) state.shake.mag = 0;
    }
    if (state.flashWhite > 0) state.flashWhite = Math.max(0, state.flashWhite - dt);

    if (mode === 'title') {
      // Title screen: world drifts slowly so the art is alive behind the menu.
      const idleSpeed = 110;
      Cosmetics.update(dt, idleSpeed * 0.5);
      state.bg.farSkyline += idleSpeed * dt * 0.06;
      state.bg.road       += idleSpeed * dt * 0.6;
      // truck idles with subtle bob
      state.truck.bob += dt * 6;
      return;
    }

    // Hit freeze frame
    if (state.freezeT > 0) { state.freezeT -= dt; return; }

    if (mode === 'dying') {
      state.deathT -= dt;
      // continue scrolling cosmetic stuff a bit so it doesn't snap
      Cosmetics.update(dt, state.speed * 0.5);
      state.bg.farSkyline += state.speed * dt * 0.06;
      state.bg.road       += state.speed * dt * 0.6;
      if (state.deathT <= 0) finishDeath();
      return;
    }

    if (mode !== 'playing') return;

    state.runTime += dt;

    // Pace: locked warmup, then gentle ramp
    if (state.runTime > WARMUP_TIME) {
      state.speed = Math.min(MAX_SPEED, WARMUP_SPEED + RAMP_PER_SEC * (state.runTime - WARMUP_TIME));
    }

    // Boost handling — track edge transitions so we can play a small
    // "boost ended" cue instead of silently dropping the player out.
    const wasBoosting = state.boosting;
    state.boosting = state.boostTime > 0;
    if (state.boosting) {
      state.boostTime = Math.max(0, state.boostTime - dt);
      state.boostUsed += dt;
      spawnBoostFlame();
    } else if (wasBoosting) {
      // boost just ran out — gentle audio + tiny dust puff
      blip(540, 0.10, 'triangle', 0.05, 240);
      blip(220, 0.16, 'sine',     0.04, 110);
      spawnDust(state.truck.x + TRUCK_W * 0.5, GROUND_Y - 6, 6, '#a8c3ff');
    }
    const worldSpeed = state.boosting ? state.speed * BOOST_MULT : state.speed;
    const scoreMul   = state.boosting ? BOOST_SCORE_MULT : 1;

    state.distance += worldSpeed * dt * scoreMul;
    // score = real distance (m) + cumulative bonuses (smash, near-miss,
    // pickup, milestone). Keeping bonuses out of `distance` prevents the
    // milestone-feedback freeze.
    state.score = Math.floor(state.distance / 10) + state.bonusScore;

    // ── Truck physics ────────────────────────────────────────────────
    const t = state.truck;
    // Jump-input buffer decays in real time (so airborne taps within
    // JUMP_BUFFER seconds of touchdown still register).
    if (t.jumpBuffer > 0) t.jumpBuffer = Math.max(0, t.jumpBuffer - dt);

    if (t.crouchT > 0) {
      t.crouchT -= dt;
      if (t.crouchT <= 0 && t.pendingJump) {
        t.pendingJump = false;
        actuallyJump();
      }
    }
    if (!t.onGround) {
      // gravity (with hang-time near the apex)
      const grav = Math.abs(t.vy) < APEX_BAND ? GRAVITY * APEX_GRAV_MUL : GRAVITY;
      t.vy += grav * dt;
      t.y  += t.vy * dt;
      // stretch toward rising / squash toward falling slightly
      t.stretch = lerp(t.stretch, t.vy < 0 ? 1.18 : 1.0,  Math.min(1, dt * 6));
      t.squash  = lerp(t.squash,  t.vy < 0 ? 0.86 : 1.05, Math.min(1, dt * 6));
      if (t.y >= GROUND_Y - TRUCK_H) {
        t.y = GROUND_Y - TRUCK_H;
        t.vy = 0;
        t.onGround = true;
        t.squash = 0.64; t.stretch = 1.36;
        spawnDust(t.x + TRUCK_W * 0.5, GROUND_Y, 12, '#e9dbb8');
        shake(4, 0.10);
        sfx.land();
        // Buffered jump: if the player tapped within the buffer window
        // while still airborne, fire the next jump immediately on landing.
        if (t.jumpBuffer > 0) {
          t.jumpBuffer = 0;
          queueJump();
        }
      }
    } else {
      t.bob += dt * 8;
      t.squash  = lerp(t.squash,  1, Math.min(1, dt * 10));
      t.stretch = lerp(t.stretch, 1, Math.min(1, dt * 10));
    }
    // blink timer
    t.blinkT -= dt;
    if (t.blinkT <= 0) {
      t.blinking = 0.14;
      t.blinkT = rand(2.5, 5.5);
    }
    if (t.blinking > 0) t.blinking -= dt;

    // ── Spawn timers (after grace) ───────────────────────────────────
    if (state.runTime > GRACE_TIME) {
      state.nextObstacleDist -= worldSpeed * dt;
      state.nextPickupDist   -= worldSpeed * dt;

      if (state.nextObstacleDist <= 0) {
        spawnPattern();   // sets state.nextObstacleDist internally
      }
      if (state.nextPickupDist <= 0) {
        spawnLooseWater();
        state.nextPickupDist = rand(PICKUP_GAP_MIN, PICKUP_GAP_MAX);
      }
    }

    // ── Move + collide obstacles ─────────────────────────────────────
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.x -= worldSpeed * dt;
      o.phase += dt * 6;
      spawnFireFlick(o.x + o.w * 0.5, o.y + 8);
      const hb = truckHitbox();
      const pad = 6;
      const hit = aabb(
        hb.x + pad, hb.y + pad, hb.w - pad * 2, hb.h - pad * 2,
        o.x + 10, o.y + 10, o.w - 20, o.h - 20,
      );
      if (hit) {
        if (state.boosting) {
          state.firesSmashed += 1;
          addCombo(1);
          const pts = 10 * state.combo;
          awardBonus(pts);
          spawnSpark(o.x + o.w / 2, o.y + o.h / 2, 24, ['#ff5a3c', '#ffb14c', '#ffe24c', '#fff7e0']);
          popup('SMASH +' + pts, o.x + o.w / 2, o.y - 4, '#ffe24c');
          shake(8, 0.18);
          sfx.smash(state.combo);
          state.obstacles.splice(i, 1);
          continue;
        } else if (state.shield) {
          // Shield save — consume the shield, smash the fire, brief immunity.
          state.shield = false;
          state.shieldFlash = 0.6;
          state.firesSmashed += 1;
          // Keep the combo intact + small bonus.
          const pts = 15 * state.combo;
          awardBonus(pts);
          spawnSpark(o.x + o.w / 2, o.y + o.h / 2, 28, ['#ffd24a', '#ffe24c', '#fff7e0', '#ff5a3c']);
          popup('SAVED!  +' + pts, o.x + o.w / 2, o.y - 4, '#ffd24a');
          state.flashWhite = Math.max(state.flashWhite, 0.22);
          shake(12, 0.22);
          blip(720, 0.18, 'triangle', 0.08, 360);
          state.obstacles.splice(i, 1);
          continue;
        } else {
          die('fire');
          return;
        }
      }
      // Near-miss / clean-jump credit: when the obstacle's trailing edge
      // crosses the truck's leading edge AND we cleared it.
      if (!o.passed && o.x + o.w < state.truck.x + 18) {
        o.passed = true;
        const clearance = o.y - (state.truck.y + TRUCK_H); // px above obstacle top
        if (clearance >= 0) {
          // It's a clean jump. Always +1 combo.
          addCombo(1);
          if (clearance < NEAR_MISS_PX) {
            // CLOSE! near-miss bonus
            state.nearMisses += 1;
            const pts = NEAR_MISS_POINTS * state.combo;
            awardBonus(pts);
            popup('CLOSE! +' + pts, o.x + o.w * 0.5 + 14, o.y - 8, '#ffe24c');
            spawnSpark(state.truck.x + TRUCK_W * 0.4, state.truck.y + TRUCK_H, 10,
                       ['#ffe24c', '#fff7e0', '#ffb14c']);
            state.slowMo = Math.max(state.slowMo, SLOWMO_TIME);
            shake(3, 0.1);
            sfx.nearMiss(state.combo);
          }
        }
      }
      if (o.x + o.w < -60) state.obstacles.splice(i, 1);
    }

    // ── Move + collect pickups ───────────────────────────────────────
    for (let i = state.pickups.length - 1; i >= 0; i--) {
      const p = state.pickups[i];
      p.x -= worldSpeed * dt;
      p.phase += dt * 5;
      const hb = truckHitbox();
      if (!p.taken && aabb(hb.x, hb.y, hb.w, hb.h, p.x, p.y, p.w, p.h)) {
        p.taken = true;
        if (p.kind === 'shield') {
          // Gold star — one-hit immunity. Replacing an existing shield
          // grants the player a small consolation bonus instead.
          if (state.shield) {
            const pts = 25 * state.combo;
            awardBonus(pts);
            popup('+' + pts, p.x + p.w / 2, p.y, '#ffd24a');
          } else {
            state.shield = true;
            popup('SHIELD!', p.x + p.w / 2, p.y, '#ffd24a');
            blip(880, 0.12, 'triangle', 0.06, 1320);
            blip(1200, 0.18, 'sine',     0.05, 1760);
            // First-time tutorial hint — fades after a few seconds.
            if (!state.hint.shieldDone) {
              state.hint.shieldA = 1;
              state.hint.shieldDone = true;
              try { localStorage.setItem(TUTORIAL_KEY + '_shield', '1'); } catch {}
            }
          }
          state.shieldsGrabbed += 1;
          addCombo(1);
          spawnSpark(p.x + p.w / 2, p.y + p.h / 2, 22, ['#ffd24a', '#ffe24c', '#fff7e0']);
          state.flashWhite = Math.max(state.flashWhite, 0.14);
          shake(7, 0.14);
        } else {
          state.watersGrabbed += 1;
          addCombo(1);
          const wasBoosting = state.boostTime > 0;
          state.boostTime = Math.min(BOOST_MAX_TIME, state.boostTime + BOOST_TIME_PER);
          // small score from water too, multiplied by combo
          const pts = 5 * state.combo;
          awardBonus(pts);
          spawnSpark(p.x + p.w / 2, p.y + p.h / 2, 14, ['#4ec5ff', '#a8e6ff', '#fff7e0']);
          popup(wasBoosting ? '+SIREN' : 'SIREN!', p.x + p.w / 2, p.y, '#a8e6ff');
          state.flashWhite = Math.max(state.flashWhite, wasBoosting ? 0.04 : 0.10);
          shake(wasBoosting ? 3 : 6, 0.14);
          sfx.pickup(state.combo);
          if (!wasBoosting) sfx.boost();
          if (!state.hint.waterDone) {
            state.hint.waterDone = true;
            try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch {}
          }
        }
      }
      if (p.taken || p.x + p.w < -60) state.pickups.splice(i, 1);
    }

    // shield flash decay
    if (state.shieldFlash > 0) state.shieldFlash = Math.max(0, state.shieldFlash - dt);

    // Combo decay — drop by 1 every COMBO_DECAY_STEP once grace expires.
    // Stops at combo 1 (never resets the run to 0, that's reserved for hits).
    if (state.combo > 1) {
      if (state.comboGrace > 0) {
        state.comboGrace = Math.max(0, state.comboGrace - dt);
      } else {
        state.comboDecayClock += dt;
        if (state.comboDecayClock >= COMBO_DECAY_STEP) {
          state.comboDecayClock -= COMBO_DECAY_STEP;
          state.combo = Math.max(1, state.combo - 1);
          // Cool dim of the pill so the player notices it dropping.
          bumpComboPill();
          if (state.combo === 1) state.comboLevelShown = 0;
          else state.comboLevelShown = Math.max(0,
            COMBO_LEVELS.findIndex(v => v > state.combo) - 1);
        }
      }
    }

    // ── Cosmetics drift ──────────────────────────────────────────────
    Cosmetics.update(dt, worldSpeed);

    // ── Parallax ─────────────────────────────────────────────────────
    state.bg.farSkyline += worldSpeed * dt * 0.06;
    state.bg.road       += worldSpeed * dt;

    // ── Camera bob — subtle truck-ride feel ──────────────────────────
    state.cameraBob = Math.sin(state.runTime * 6) * 1.4;

    // ── Tutorial hint fade ───────────────────────────────────────────
    if (state.hint.jumpDone)  state.hint.jumpA  = Math.max(0, state.hint.jumpA  - dt * 1.4);
    if (state.hint.waterDone) state.hint.waterA = Math.max(0, state.hint.waterA - dt * 1.4);
    // Shield hint lingers a bit longer (~5s) so the player has time to read it.
    if (state.hint.shieldA > 0) state.hint.shieldA = Math.max(0, state.hint.shieldA - dt * 0.65);

    // ── Distance milestones ──────────────────────────────────────────
    // Milestones track METERS traveled, NOT score. This decouples them from
    // the bonus-score feedback loop entirely — milestones fire on a clean,
    // predictable distance cadence (every MILESTONE_M meters of actual
    // forward travel). Always fires at most once per frame.
    const distMeters = Math.floor(state.distance / 10);
    if (distMeters >= state.nextMilestone) {
      const m = state.nextMilestone;
      addCombo(1);
      const pts = 25 * state.combo;
      awardBonus(pts);
      // Snap past current distance — distance is pure (no feedback).
      const steps = Math.max(1, Math.floor((distMeters - m) / MILESTONE_M) + 1);
      state.nextMilestone = m + steps * MILESTONE_M;
      showMilestone(m.toLocaleString() + 'm — +' + pts);
      state.flashWhite = Math.max(state.flashWhite, 0.06);
      shake(4, 0.18);
      blip(680, 0.20, 'triangle', 0.06, 1320);
    }

    // ── HUD ── (defensive — missing elements must never freeze the loop)
    setText(elScore, state.score.toLocaleString());
    setText(elBest,  'BEST ' + Math.max(state.best, state.score).toLocaleString());
    setText(elCombo, '×' + state.combo);
    if (elCombo) {
      elCombo.classList.toggle('hot',   state.combo >= 8  && state.combo < 16);
      elCombo.classList.toggle('blaze', state.combo >= 16);
    }
    setStyleWidth(elBoost, clamp((state.boostTime / BOOST_MAX_TIME) * 100, 0, 100).toFixed(1) + '%');
    setText(elBoostLabel, state.boosting ? 'SIREN!' : 'SIREN');

    // Beat-your-best indicator. Hidden when there's no best to chase or
    // when far from it. Appears within 80% of best, turns into a juicy
    // "NEW BEST!" pulse the moment we cross.
    if (elBestChase) {
      if (state.best <= 0) {
        elBestChase.classList.add('hidden');
      } else if (state.score >= state.best) {
        elBestChase.classList.remove('hidden');
        elBestChase.classList.add('beat');
        elBestChase.textContent = 'NEW BEST  +' + (state.score - state.best).toLocaleString();
      } else if (state.score >= state.best * 0.8) {
        elBestChase.classList.remove('hidden');
        elBestChase.classList.remove('beat');
        elBestChase.textContent = (state.best - state.score).toLocaleString() + ' TO BEST';
      } else {
        elBestChase.classList.add('hidden');
        elBestChase.classList.remove('beat');
      }
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) { state.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      if (p.kind === 'dust') {
        p.size += dt * 14;
        p.vx *= (1 - dt * 1.6);
      }
    }
    for (let i = state.popups.length - 1; i >= 0; i--) {
      const p = state.popups[i];
      p.life -= dt;
      p.y += p.vy * dt;
      p.vy *= (1 - dt * 0.9);
      if (p.life <= 0) state.popups.splice(i, 1);
    }
  }

  function truckHitbox() {
    // Slightly tighter than the visible truck for forgiving collision.
    return {
      x: state.truck.x + 14,
      y: state.truck.y + 14,
      w: TRUCK_W - 28,
      h: TRUCK_H - 18,
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  //   RENDER
  // ═════════════════════════════════════════════════════════════════════
  function render() {
    ctx.save();

    // Camera transform: shake + subtle truck-ride bob
    const sx = (Math.random() - 0.5) * state.shake.mag;
    const sy = (Math.random() - 0.5) * state.shake.mag + state.cameraBob;
    ctx.translate(sx, sy);

    drawSky();
    Cosmetics.draw('sky');

    drawFarSkyline();
    Cosmetics.draw('farBg');
    Cosmetics.draw('skylineBg');
    drawSkylineFg();
    Cosmetics.draw('skylineFg');

    drawRoad();
    Cosmetics.draw('sidewalk');
    drawDangerVignette();

    drawPickups();
    drawObstacles();
    drawTruck();

    drawParticles();
    drawPopups();
    drawBoostOverlay();
    drawHints();

    ctx.restore();

    // Slow-mo cool vignette (drawn outside the shake transform)
    if (state.slowMo > 0) {
      const a = clamp(state.slowMo / SLOWMO_TIME, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.3, W * 0.5, H * 0.5, H * 0.95);
      g.addColorStop(0, 'rgba(168, 230, 255, 0)');
      g.addColorStop(1, `rgba(78, 197, 255, ${0.35 * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // White-flash overlay
    if (state.flashWhite > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(state.flashWhite / HIT_FLASH, 0, 1) * 0.8;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // ─── Background ───────────────────────────────────────────────────────
  // Burning-city sunset. Reads top-down as:
  //   deep navy night → indigo → magenta → ember orange → smoke band on horizon
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0.00, '#0c0830');
    g.addColorStop(0.32, '#1d104f');
    g.addColorStop(0.58, '#4a1d7a');
    g.addColorStop(0.82, '#b34186');
    g.addColorStop(0.94, '#ff7a3c');
    g.addColorStop(1.00, '#ffb060');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND_Y);

    // Stars — slow twinkle. Procedural & deterministic so they don't pop.
    ctx.save();
    const tw = performance.now() / 900;
    for (let i = 0; i < 70; i++) {
      // Cheap deterministic pseudorandom from i.
      const sx = (i * 97.13)  % W;
      const sy = (i * 53.71)  % (GROUND_Y * 0.55);
      const tw2 = 0.4 + 0.6 * Math.abs(Math.sin(tw + i * 0.7));
      ctx.fillStyle = 'rgba(255, 247, 224, ' + (tw2 * 0.7) + ')';
      ctx.fillRect(sx, sy, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
    }
    ctx.restore();

    // Moon — crescent with a few crater dots.
    ctx.save();
    const mcx = W * 0.74, mcy = 130, mr = 44;
    // glow halo
    const halo = ctx.createRadialGradient(mcx, mcy, mr * 0.4, mcx, mcy, mr * 2.4);
    halo.addColorStop(0,   'rgba(255, 230, 160, 0.55)');
    halo.addColorStop(0.5, 'rgba(255, 200, 120, 0.18)');
    halo.addColorStop(1,   'rgba(255, 200, 120, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(mcx, mcy, mr * 2.4, 0, Math.PI * 2); ctx.fill();
    // full disc
    ctx.fillStyle = '#ffe6a0';
    ctx.beginPath(); ctx.arc(mcx, mcy, mr, 0, Math.PI * 2); ctx.fill();
    // shadow disc making a crescent
    ctx.fillStyle = 'rgba(76, 35, 100, 0.78)';
    ctx.beginPath(); ctx.arc(mcx + mr * 0.32, mcy - mr * 0.05, mr * 0.92, 0, Math.PI * 2); ctx.fill();
    // a few craters on the lit side
    ctx.fillStyle = 'rgba(180, 130, 60, 0.45)';
    ctx.beginPath(); ctx.arc(mcx - mr * 0.32, mcy - mr * 0.18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mcx - mr * 0.50, mcy + mr * 0.10, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mcx - mr * 0.18, mcy + mr * 0.35, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Distant flame glow on the horizon — the rest of the city is on fire,
    // sells the firefighter premise without the player having to read it.
    ctx.save();
    const horizonY = GROUND_Y - 14;
    const flicker = 0.78 + 0.22 * Math.sin(performance.now() / 220);
    const glow = ctx.createRadialGradient(W * 0.5, horizonY, 40, W * 0.5, horizonY, W * 0.7);
    glow.addColorStop(0,   'rgba(255, 165, 70,  ' + (0.55 * flicker) + ')');
    glow.addColorStop(0.5, 'rgba(255, 110, 60,  ' + (0.18 * flicker) + ')');
    glow.addColorStop(1,   'rgba(255, 90, 60,   0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.fillRect(0, horizonY - 80, W, 80);
    ctx.restore();
  }

  // Building palette — drawn as silhouettes against the sunset.
  // Each entry: width range, height range, roof type, window pattern.
  const BUILDING_ROOFS = ['flat', 'flat', 'dome', 'spire', 'water-tower', 'antenna', 'sign'];

  // Deterministic per-tile pseudo-random. Same seed = same layout, every
  // tile is unique but the city repeats predictably as it scrolls.
  function tileRand(seed, salt) {
    const s = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  // Mid-distance skyline — varied silhouettes, flickering window grid,
  // medium parallax. This is the visual workhorse layer.
  function drawFarSkyline() {
    const TILE = 280;
    const baseY = GROUND_Y - 12;
    const scroll = state.bg.farSkyline;
    const start = Math.floor(scroll / TILE) - 1;
    const offset = -(scroll - start * TILE);
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const tileIdx = start + i;
      const tileX = offset + i * TILE;
      drawSkylineTile(tileX, baseY, TILE, tileIdx, {
        color: '#2a1a5a',
        windowColor: 'rgba(255, 200, 100, 0.55)',
        minH: 80, maxH: 180,
        flicker: true,
      });
    }
    ctx.restore();
  }

  // Closer silhouette — taller, denser, slower parallax. Reads as
  // "the city in front of the painted backdrop."
  function drawSkylineFg() {
    const TILE = 360;
    const baseY = GROUND_Y - 2;
    const scroll = state.bg.farSkyline * 0.55;
    const start = Math.floor(scroll / TILE) - 1;
    const offset = -(scroll - start * TILE);
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const tileIdx = start + i;
      const tileX = offset + i * TILE;
      drawSkylineTile(tileX, baseY, TILE, tileIdx + 1000, {
        color: '#150827',
        windowColor: 'rgba(255, 170, 80, 0.45)',
        minH: 60, maxH: 130,
        flicker: false,
      });
    }
    ctx.restore();
  }

  // Renders one tile of skyline. Generates 3-5 buildings with seeded
  // randomness so each tile is consistent but the line as a whole varies.
  function drawSkylineTile(tileX, baseY, tileW, seed, opts) {
    const buildingCount = 3 + Math.floor(tileRand(seed, 1) * 3);
    const widths = [];
    let totalW = 0;
    for (let b = 0; b < buildingCount; b++) {
      const w = 40 + tileRand(seed, 2 + b) * 90;
      widths.push(w);
      totalW += w;
    }
    // scale widths to fit the tile
    const sx = tileW / totalW;
    let cursor = tileX;
    for (let b = 0; b < buildingCount; b++) {
      const w = widths[b] * sx;
      const h = opts.minH + tileRand(seed, 20 + b) * (opts.maxH - opts.minH);
      const top = baseY - h;
      const roof = BUILDING_ROOFS[Math.floor(tileRand(seed, 40 + b) * BUILDING_ROOFS.length)];
      // building body
      ctx.fillStyle = opts.color;
      rrect(cursor, top, w, h, Math.min(8, w * 0.12)); ctx.fill();
      // roof details
      drawBuildingRoof(cursor, top, w, roof, opts.color, seed * 7 + b);
      // window grid
      ctx.fillStyle = opts.windowColor;
      const wsX = 6 + tileRand(seed, 60 + b) * 6;
      const wsY = 12 + tileRand(seed, 80 + b) * 6;
      const winW = 4, winH = 6;
      const winColPitch = winW + wsX;
      const winRowPitch = winH + wsY;
      for (let wy = top + 10; wy < baseY - 6; wy += winRowPitch) {
        for (let wx = cursor + 6; wx < cursor + w - 6; wx += winColPitch) {
          const lit = tileRand(seed, wx + wy * 13);
          if (lit > 0.62) {
            let a = 1;
            if (opts.flicker) {
              // gentle flicker on ~1/8 of lit windows
              const flickerHash = (Math.floor(wx) ^ Math.floor(wy * 31)) & 7;
              if (flickerHash === 0) a = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 300 + wx * 0.07));
            }
            ctx.globalAlpha = a;
            ctx.fillRect(wx, wy, winW, winH);
            ctx.globalAlpha = 1;
          }
        }
      }
      cursor += w;
    }
  }

  function drawBuildingRoof(x, top, w, kind, color, seed) {
    ctx.fillStyle = color;
    if (kind === 'dome') {
      ctx.beginPath();
      ctx.arc(x + w / 2, top, w * 0.4, Math.PI, 0);
      ctx.fill();
    } else if (kind === 'spire') {
      ctx.fillRect(x + w / 2 - 2, top - 22, 4, 22);
      ctx.beginPath();
      ctx.moveTo(x + w / 2, top - 32);
      ctx.lineTo(x + w / 2 - 4, top - 20);
      ctx.lineTo(x + w / 2 + 4, top - 20);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'water-tower') {
      ctx.fillRect(x + w * 0.62 - 2, top - 18, 4, 18);
      ctx.fillRect(x + w * 0.38 - 2, top - 18, 4, 18);
      rrect(x + w * 0.34, top - 28, w * 0.32, 12, 3); ctx.fill();
    } else if (kind === 'antenna') {
      ctx.fillRect(x + w * 0.5 - 1, top - 26, 2, 26);
      // red blinker — uses seed so they don't all blink in sync
      const blink = (performance.now() / 600 + seed) % 2 < 1;
      ctx.fillStyle = blink ? '#ff5a3c' : 'rgba(255,90,60,0.25)';
      ctx.beginPath(); ctx.arc(x + w * 0.5, top - 26, 3, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'sign') {
      rrect(x + w * 0.1, top - 18, w * 0.8, 12, 2); ctx.fill();
      // sign face — neon-ish blink
      const on = (performance.now() / 800 + seed) % 2 < 1;
      ctx.fillStyle = on ? '#ff5a8a' : '#5a2a4a';
      rrect(x + w * 0.16, top - 16, w * 0.68, 8, 2); ctx.fill();
    }
    // 'flat' is the no-op default
  }

  function drawRoad() {
    // Sidewalk strip
    ctx.fillStyle = '#3b2a7a';
    ctx.fillRect(0, GROUND_Y, W, 10);
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(0, GROUND_Y + 8, W, 3);
    // road
    ctx.fillStyle = '#0a0623';
    ctx.fillRect(0, GROUND_Y + 11, W, H - GROUND_Y - 11);
    // dashed lane line
    ctx.fillStyle = '#fff7e0';
    const dashW = 64, gap = 44;
    const period = dashW + gap;
    const offset = -pmod(state.bg.road, period);
    const laneY = GROUND_Y + (H - GROUND_Y) * 0.55;
    for (let x = offset - period; x < W + period; x += period) {
      ctx.fillRect(x, laneY, dashW, 7);
    }
    // soft ground shadow under the truck
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(state.truck.x + TRUCK_W * 0.5, GROUND_Y + 6, TRUCK_W * 0.55, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Dark vignette above the road so ground obstacles always pop visually.
  function drawDangerVignette() {
    ctx.save();
    const g = ctx.createLinearGradient(0, GROUND_Y - 80, 0, GROUND_Y);
    g.addColorStop(0, 'rgba(10, 6, 35, 0)');
    g.addColorStop(1, 'rgba(10, 6, 35, 0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND_Y - 80, W, 80);
    ctx.restore();
  }

  // ─── Obstacles & pickups ──────────────────────────────────────────────
  function drawObstacles() {
    for (const o of state.obstacles) {
      Sprite.draw('fire', o.x, o.y, o.w, o.h, { phase: o.phase, variant: o.variant });
    }
  }
  function drawPickups() {
    for (const p of state.pickups) {
      const bob = Math.sin(p.phase) * 5;
      if (p.kind === 'shield') {
        drawPickupHalo(p.x + p.w / 2, p.y + p.h / 2 + bob, p.w, p.phase, '#ffd24a');
        drawShieldStar(p.x + p.w / 2, p.y + p.h / 2 + bob, p.w * 0.55, p.phase);
      } else {
        drawPickupHalo(p.x + p.w / 2, p.y + p.h / 2 + bob, p.w, p.phase, '#4ec5ff');
        Sprite.draw('water', p.x, p.y + bob, p.w, p.h, { phase: p.phase });
      }
    }
  }

  // Five-pointed gold star with capybara mascot center.
  function drawShieldStar(cx, cy, r, phase) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(phase * 0.6) * 0.12);
    // glow
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 2);
    g.addColorStop(0, 'rgba(255, 226, 76, 0.9)');
    g.addColorStop(1, 'rgba(255, 226, 76, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // star body
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#1a0f3a';
    ctx.stroke();
    // tiny capy face center
    drawTinyCapy(0, 0, r * 0.32, { mouth: 'smile' });
    ctx.restore();
  }
  function drawPickupHalo(cx, cy, w, phase, color) {
    const pulse = 0.5 + 0.5 * Math.sin(phase * 1.6);
    const r = w * (1.05 + pulse * 0.3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, w * 0.1, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // dashed tether
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy + w * 0.42);
    ctx.lineTo(cx, GROUND_Y - 4);
    ctx.stroke();
    ctx.restore();
  }

  function drawTruck() {
    const t = state.truck;
    const cx = t.x + TRUCK_W * 0.5;
    const cy = t.y + TRUCK_H * 0.5;
    // boost aura
    if (state.boosting) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 60);
      const r = TRUCK_W * 1.0 * pulse;
      const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, r);
      g.addColorStop(0, 'rgba(255, 226, 76, 0.9)');
      g.addColorStop(0.5, 'rgba(255, 90, 60, 0.45)');
      g.addColorStop(1, 'rgba(255, 90, 60, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // shield aura — gold rotating ring
    if (state.shield || state.shieldFlash > 0) {
      ctx.save();
      const now = performance.now();
      const alphaActive = state.shield ? 0.85 : Math.max(0, state.shieldFlash / 0.6);
      ctx.globalAlpha = alphaActive;
      ctx.globalCompositeOperation = 'lighter';
      const rr = TRUCK_W * 0.7 + Math.sin(now / 220) * 4;
      // arc dashes
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 4;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -now / 50;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
      // soft fill
      const g = ctx.createRadialGradient(cx, cy, rr * 0.5, cx, cy, rr * 1.1);
      g.addColorStop(0, 'rgba(255, 226, 76, 0)');
      g.addColorStop(0.7, 'rgba(255, 226, 76, 0.18)');
      g.addColorStop(1, 'rgba(255, 226, 76, 0)');
      ctx.fillStyle = g;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(cx, cy, rr * 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // bob (subtle vertical wobble while grounded)
    const bobOffset = t.onGround ? Math.sin(t.bob) * 1.6 : 0;
    ctx.save();
    ctx.translate(cx, cy + bobOffset);
    ctx.scale(t.stretch, t.squash);
    ctx.translate(-cx, -cy);
    Sprite.draw('truck', t.x, t.y, TRUCK_W, TRUCK_H, {
      blink: t.blinking > 0,
      airborne: !t.onGround,
      boost: state.boosting,
    });
    ctx.restore();
  }

  // ─── Particles & popups ───────────────────────────────────────────────
  function drawParticles() {
    for (const p of state.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'dust' || p.kind === 'flame') {
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
    for (const p of state.popups) {
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

  function drawBoostOverlay() {
    if (!state.boosting) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(W * 0.5, H * 0.55, H * 0.25, W * 0.5, H * 0.55, H * 0.95);
    g.addColorStop(0, 'rgba(255, 210, 80, 0)');
    g.addColorStop(1, 'rgba(255, 90, 60, 0.32)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawHints() {
    if (mode !== 'playing') return;
    if (state.hint.jumpA   > 0) hintCard(W * 0.5, 120, 'TAP / SPACE to JUMP',          state.hint.jumpA,   '#fff7e0');
    if (state.hint.waterA  > 0) hintCard(W * 0.5, 162, 'Grab WATER for SIREN BOOST',   state.hint.waterA,  '#a8e6ff');
    if (state.hint.shieldA > 0) hintCard(W * 0.5, 204, 'SHIELD: survive ONE hit',      state.hint.shieldA, '#ffd24a');
  }
  function hintCard(cx, cy, text, alpha, accent) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 18px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const padX = 18, padY = 9;
    const m = ctx.measureText(text);
    const w = m.width + padX * 2;
    const h = 28 + padY;
    ctx.fillStyle = 'rgba(26, 15, 58, 0.78)';
    rrect(cx - w / 2, cy - h / 2, w, h, 14); ctx.fill();
    strokeShape(accent, 2);
    ctx.fillStyle = accent;
    ctx.fillText(text, cx, cy + 5);
    ctx.restore();
  }

  // ═════════════════════════════════════════════════════════════════════
  //   PROCEDURAL FALLBACK SPRITES
  //   Registered with Sprite.registerFallback so they can be replaced by
  //   loaded PNGs later with zero code changes outside this block.
  // ═════════════════════════════════════════════════════════════════════
  Sprite.registerFallback('fire', (x, y, w, h, opts) => {
    const variant = opts.variant || 'torch';
    const phase   = opts.phase   || 0;
    const v = FIRE_VARIANTS[variant] || FIRE_VARIANTS.torch;
    if (variant === 'pit') {
      drawFirePitSprite(x, y, w, h, phase, v);
    } else {
      drawFlameSprite(x, y, w, h, phase, v, variant);
    }
  });

  function drawFlameSprite(x, y, w, h, phase, v, variant) {
    const wob = Math.sin(phase) * 4;
    ctx.save();
    // base shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 3, w * 0.55, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // little log base for upright flames (sells it as "thing burning")
    ctx.fillStyle = '#1a0f3a';
    rrect(x + 6, y + h - 10, w - 12, 10, 4); ctx.fill();
    ctx.fillStyle = '#5a3a1a';
    rrect(x + 10, y + h - 8, w - 20, 5, 2); ctx.fill();
    // outer flame
    ctx.fillStyle = v.color1;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h - 6);
    ctx.bezierCurveTo(x - 6 + wob, y + h * 0.5,  x + w * 0.18, y + h * 0.12, x + w / 2, y);
    ctx.bezierCurveTo(x + w * 0.82, y + h * 0.12, x + w + 6 - wob, y + h * 0.5,  x + w / 2, y + h - 6);
    ctx.closePath();
    ctx.fill();
    strokeShape('#1a0f3a', 3);
    // inner flame
    ctx.fillStyle = v.color2;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h - 6);
    ctx.bezierCurveTo(x + 10,    y + h * 0.6,  x + w * 0.3, y + h * 0.25, x + w / 2, y + h * 0.18);
    ctx.bezierCurveTo(x + w * 0.7, y + h * 0.25, x + w - 10, y + h * 0.6,  x + w / 2, y + h - 6);
    ctx.closePath();
    ctx.fill();
    // hot core
    ctx.fillStyle = v.core;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.55, w * 0.18, h * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    // tall variant gets extra wisp on top
    if (variant === 'tall') {
      ctx.fillStyle = v.core;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(x + w / 2 + Math.sin(phase * 1.3) * 4, y - 6, w * 0.16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawFirePitSprite(x, y, w, h, phase, v) {
    ctx.save();
    // base shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 4, w * 0.6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // pit rim
    ctx.fillStyle = '#1a0f3a';
    rrect(x, y + h - 14, w, 14, 6); ctx.fill();
    ctx.fillStyle = '#5a3a1a';
    rrect(x + 6, y + h - 12, w - 12, 8, 4); ctx.fill();
    // row of flames across
    const count = Math.max(3, Math.floor(w / 36));
    for (let i = 0; i < count; i++) {
      const cx = x + 16 + i * ((w - 32) / Math.max(1, count - 1));
      const wob = Math.sin(phase + i) * 3;
      const flameH = 32 + Math.sin(phase * 1.4 + i) * 4;
      // outer
      ctx.fillStyle = v.color1;
      ctx.beginPath();
      ctx.moveTo(cx, y + h - 14);
      ctx.bezierCurveTo(cx - 14 + wob, y + h - 30, cx - 8, y + h - 50, cx, y + h - 14 - flameH);
      ctx.bezierCurveTo(cx + 8, y + h - 50, cx + 14 - wob, y + h - 30, cx, y + h - 14);
      ctx.closePath();
      ctx.fill();
      strokeShape('#1a0f3a', 2);
      // inner
      ctx.fillStyle = v.color2;
      ctx.beginPath();
      ctx.moveTo(cx, y + h - 14);
      ctx.bezierCurveTo(cx - 6, y + h - 30, cx - 4, y + h - 42, cx, y + h - 18 - flameH * 0.6);
      ctx.bezierCurveTo(cx + 4, y + h - 42, cx + 6, y + h - 30, cx, y + h - 14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  Sprite.registerFallback('water', (x, y, w, h) => {
    ctx.save();
    // bucket body
    ctx.fillStyle = '#4ec5ff';
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 14);
    ctx.lineTo(x + w - 4, y + 14);
    ctx.lineTo(x + w - 8, y + h);
    ctx.lineTo(x + 8, y + h);
    ctx.closePath();
    ctx.fill();
    strokeShape('#1a0f3a', 3);
    // water surface
    ctx.fillStyle = '#a8e6ff';
    rrect(x + 4, y + 10, w - 8, 8, 4); ctx.fill();
    strokeShape('#1a0f3a', 2.5);
    // handle
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 10, w * 0.42, Math.PI, 0);
    ctx.stroke();
    // sheen
    ctx.fillStyle = 'rgba(255, 247, 224, 0.7)';
    ctx.fillRect(x + 12, y + 20, 4, h - 24);
    // big "H2O" mark
    ctx.fillStyle = '#1a0f3a';
    ctx.font = 'bold 12px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('H₂O', x + w / 2, y + h - 10);
    ctx.restore();
  });

  Sprite.registerFallback('truck', (x, y, w, h, opts) => {
    drawTruckProcedural(x, y, w, h, opts);
  });

  // ─── Procedural truck + Rizzle ────────────────────────────────────────
  function drawTruckProcedural(x, y, w, h, opts) {
    const blink = !!opts.blink;
    const airborne = !!opts.airborne;
    const boost = !!opts.boost;
    const now = performance.now();

    // exhaust puff trail behind the truck (only while grounded)
    if (!airborne) {
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const off = i * 9 + ((now / 60) % 9);
        const alpha = 0.45 - i * 0.13;
        ctx.fillStyle = 'rgba(180, 170, 200, ' + alpha + ')';
        ctx.beginPath();
        ctx.arc(x - 6 - off, y + h - 14, 4 + i * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // chassis drop shadow on truck
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    rrect(x + 6, y + h - 6, w - 12, 8, 4); ctx.fill();

    // CARGO TANK (left two-thirds)
    ctx.fillStyle = '#d94028';
    rrect(x + 4, y + 28, w * 0.62, h - 34, 8); ctx.fill();
    strokeShape('#1a0f3a', 3);
    // tank shading on bottom
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    rrect(x + 4, y + h - 18, w * 0.62, 10, 6); ctx.fill();
    // ladder on top
    ctx.strokeStyle = '#fff7e0'; ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 12, y + 22, w * 0.55, 7);
    for (let lx = x + 14; lx < x + w * 0.62; lx += 10) {
      ctx.beginPath(); ctx.moveTo(lx, y + 22); ctx.lineTo(lx, y + 29); ctx.stroke();
    }
    // gold reflective stripe with checker
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(x + 6, y + h * 0.55, w * 0.6, 6);
    ctx.fillStyle = '#1a0f3a';
    for (let cx = x + 8; cx < x + w * 0.6; cx += 12) {
      ctx.fillRect(cx, y + h * 0.55, 6, 6);
    }
    // hose reel on the cargo tank side
    ctx.save();
    ctx.translate(x + w * 0.20, y + h * 0.42);
    ctx.fillStyle = '#1a0f3a';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 1.5;
    // hose coils
    for (let r = 2; r <= 6; r += 2) {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // "FD" decal on tank
    ctx.fillStyle = '#fff7e0';
    ctx.font = 'bold 16px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FD', x + w * 0.42, y + h * 0.48);

    // CAB (right side)
    ctx.fillStyle = '#ff5a3c';
    rrect(x + w * 0.56, y + 30, w * 0.42, h - 38, 10); ctx.fill();
    strokeShape('#1a0f3a', 3);
    // cab side window
    ctx.fillStyle = '#a8e6ff';
    rrect(x + w * 0.62, y + 36, w * 0.32, 18, 4); ctx.fill();
    strokeShape('#1a0f3a', 2.5);
    // window sheen
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.64, y + 38); ctx.lineTo(x + w * 0.7, y + 38);
    ctx.lineTo(x + w * 0.66, y + 52); ctx.lineTo(x + w * 0.62, y + 52);
    ctx.closePath(); ctx.fill();

    // RIZZLE — sits in the cab, head pokes WAY above
    const capCx = x + w * 0.78;
    const capCy = y + 4 - (airborne ? 2 : 0);
    drawRizzle(capCx, capCy, 38, { blink, arm: 'wheel' });

    // SIREN — base dome + rotating beam (more dramatic during boost)
    const sirenPulse = (now / 220) % (Math.PI * 2);
    const sirenOn = (now / 200) % 2 < 1;
    const beamLen = boost ? 80 : 40;
    ctx.save();
    ctx.translate(x + w * 0.56 + 7, y + 22);
    // beam glow (rotating)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const a = sirenPulse + i * Math.PI;
      ctx.strokeStyle = i === 0 ? 'rgba(255,226,76,0.55)' : 'rgba(78,197,255,0.55)';
      ctx.lineWidth = boost ? 14 : 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * beamLen, Math.sin(a) * beamLen - 12);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // siren housing
    ctx.fillStyle = sirenOn ? '#ffe24c' : '#4ec5ff';
    rrect(-7, 0, 14, 8, 2); ctx.fill();
    strokeShape('#1a0f3a', 1.5);
    // dome on top
    ctx.fillStyle = sirenOn ? '#fff7e0' : '#a8e6ff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 4, 0, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // bumper
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x + w - 8, y + h - 22, 8, 10);
    // bumper headlight
    ctx.fillStyle = boost ? '#fff7e0' : '#ffd24a';
    ctx.beginPath();
    ctx.arc(x + w - 4, y + h - 17, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 1.5;
    ctx.stroke();

    // wheels (with rotating spokes already inside drawWheel)
    drawWheel(x + 30,      y + h - 2, 16);
    drawWheel(x + w - 36,  y + h - 2, 16);
    // muddy splash near wheels while grounded
    if (!airborne) {
      ctx.fillStyle = 'rgba(140,103,48,0.55)';
      for (let i = 0; i < 3; i++) {
        const px = x + 18 - i * 4 - (now / 90) % 8;
        const py = y + h + 1 - (i % 2) * 2;
        ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawWheel(cx, cy, r) {
    ctx.save();
    ctx.fillStyle = '#1a0f3a';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff7e0';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2); ctx.fill();
    const spin = state.bg.road * 0.08;
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = spin + i * (Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.1, cy + Math.sin(a) * r * 0.1);
      ctx.lineTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }

  // The hero capybara. Procedural — replace with a sprite later via
  // Sprite.registerImage('rizzle', '...') and a new fallback hook if needed.
  function drawRizzle(cx, cy, s, opts) {
    opts = opts || {};
    const blink = !!opts.blink;
    const outline = '#1a0f3a';
    const skin = '#b4884f';
    const beard = '#fff7e0';

    ctx.save();

    // HEAD (squashed wide ellipse)
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.82, s * 0.74, 0, 0, Math.PI * 2);
    ctx.fill();
    strokeShape(outline, Math.max(1.6, s * 0.05));

    // EARS
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(cx - s * 0.66, cy - s * 0.48, s * 0.2, s * 0.16, -0.3, 0, Math.PI * 2); ctx.fill();
    strokeShape(outline, Math.max(1.2, s * 0.04));
    ctx.beginPath(); ctx.ellipse(cx + s * 0.66, cy - s * 0.48, s * 0.2, s * 0.16, 0.3, 0, Math.PI * 2); ctx.fill();
    strokeShape(outline, Math.max(1.2, s * 0.04));
    ctx.fillStyle = '#7a5230';
    ctx.beginPath(); ctx.ellipse(cx - s * 0.64, cy - s * 0.46, s * 0.09, s * 0.07, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + s * 0.64, cy - s * 0.46, s * 0.09, s * 0.07, 0.3, 0, Math.PI * 2); ctx.fill();

    // BEARD
    ctx.fillStyle = beard;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.58, cy + s * 0.05);
    ctx.bezierCurveTo(cx - s * 0.8,  cy + s * 0.6, cx - s * 0.32, cy + s * 1.0, cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx + s * 0.32, cy + s * 1.0, cx + s * 0.8,  cy + s * 0.6, cx + s * 0.58, cy + s * 0.05);
    ctx.bezierCurveTo(cx + s * 0.32, cy + s * 0.2, cx - s * 0.32, cy + s * 0.2, cx - s * 0.58, cy + s * 0.05);
    ctx.closePath();
    ctx.fill();
    strokeShape(outline, Math.max(1.4, s * 0.05));
    // beard wisps
    ctx.strokeStyle = '#d6c9a0'; ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.3, cy + s * 0.38); ctx.lineTo(cx - s * 0.2, cy + s * 0.75);
    ctx.moveTo(cx,            cy + s * 0.42); ctx.lineTo(cx + s * 0.04, cy + s * 0.9);
    ctx.moveTo(cx + s * 0.3,  cy + s * 0.38); ctx.lineTo(cx + s * 0.25, cy + s * 0.75);
    ctx.stroke();

    // EYES (sclera bumps poking through beard)
    ctx.fillStyle = '#dff3b0';
    ctx.beginPath(); ctx.arc(cx - s * 0.3, cy - s * 0.05, s * 0.2, 0, Math.PI * 2); ctx.fill();
    strokeShape(outline, Math.max(1.2, s * 0.04));
    ctx.beginPath(); ctx.arc(cx + s * 0.3, cy - s * 0.05, s * 0.22, 0, Math.PI * 2); ctx.fill();
    strokeShape(outline, Math.max(1.2, s * 0.04));
    // half-closed left eye (sleepy/derpy)
    ctx.fillStyle = skin;
    ctx.fillRect(cx - s * 0.48, cy - s * 0.24, s * 0.36, s * 0.18);
    // pupils — blink hides them
    if (!blink) {
      ctx.fillStyle = outline;
      ctx.beginPath(); ctx.arc(cx - s * 0.30, cy + s * 0.00, s * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.32, cy - s * 0.05, s * 0.07, 0, Math.PI * 2); ctx.fill();
      // gleam
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx + s * 0.34, cy - s * 0.08, s * 0.025, 0, Math.PI * 2); ctx.fill();
    } else {
      // blink line
      ctx.strokeStyle = outline; ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.40, cy - s * 0.03); ctx.lineTo(cx - s * 0.20, cy - s * 0.03);
      ctx.moveTo(cx + s * 0.20, cy - s * 0.05); ctx.lineTo(cx + s * 0.42, cy - s * 0.05);
      ctx.stroke();
    }

    // Mouth corner
    ctx.fillStyle = outline;
    ctx.fillRect(cx - s * 0.04, cy + s * 0.18, s * 0.08, s * 0.04);

    // HELMET
    drawFireHelmet(cx, cy, s, outline);

    // ARMS gripping wheel
    if (opts.arm === 'wheel') {
      ctx.strokeStyle = outline;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, s * 0.17);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35, cy + s * 0.55);
      ctx.quadraticCurveTo(cx, cy + s * 0.98, cx + s * 0.55, cy + s * 0.88);
      ctx.stroke();
      ctx.fillStyle = '#1a0f3a';
      ctx.beginPath(); ctx.arc(cx + s * 0.6, cy + s * 0.88, s * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff7e0';
      ctx.beginPath(); ctx.arc(cx + s * 0.6, cy + s * 0.88, s * 0.08, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

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
    strokeShape(outline, Math.max(1.4, s * 0.05));
    // front bill
    ctx.fillStyle = '#ff3a2a';
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.15, cy - s * 0.42);
    ctx.quadraticCurveTo(cx + s * 1.15, cy - s * 0.6, cx + s * 1.1, cy - s * 0.18);
    ctx.quadraticCurveTo(cx + s * 0.6, cy - s * 0.25, cx + s * 0.4, cy - s * 0.32);
    ctx.closePath(); ctx.fill();
    strokeShape(outline, Math.max(1.4, s * 0.05));
    // yellow shield
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.18, cy - s * 0.95);
    ctx.lineTo(cx + s * 0.18, cy - s * 0.95);
    ctx.lineTo(cx + s * 0.22, cy - s * 0.7);
    ctx.lineTo(cx,            cy - s * 0.6);
    ctx.lineTo(cx - s * 0.22, cy - s * 0.7);
    ctx.closePath(); ctx.fill();
    strokeShape(outline, Math.max(1.1, s * 0.04));
    // bee mark
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.78, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(cx - s * 0.05, cy - s * 0.83, s * 0.1, s * 0.02);
    ctx.restore();
  }

  // ═════════════════════════════════════════════════════════════════════
  //   COSMETICS: register layered cosmetic slots ready for future content.
  //   Today, nothing is added — the world stays clean. Later, drop in
  //   capybara billboards / sky parade / sidewalk easter eggs here:
  //
  //     Cosmetics.add({
  //       layer: 'sky', x: 200, y: 80, vx: -20, parallax: 0,
  //       draw: ({x, y, phase}) => { drawCapybaraBalloon(x, y, phase); }
  //     });
  //
  //   The game loop already calls Cosmetics.update + draw on every layer;
  //   adding content is purely additive.
  // ═════════════════════════════════════════════════════════════════════

  // ═════════════════════════════════════════════════════════════════════
  //   MAIN LOOP
  // ═════════════════════════════════════════════════════════════════════
  let lastT = performance.now();
  function frame(now) {
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.05) dt = 0.05;
    // slow-mo: gameplay dt is scaled down, but slowMo timer decrements in real time.
    // Only applies while actively playing — never extends death/freeze windows.
    let gameDt = dt;
    if (state.slowMo > 0) {
      state.slowMo = Math.max(0, state.slowMo - dt);
      if (mode === 'playing') gameDt = dt * SLOWMO_FACTOR;
    }
    try {
      update(gameDt);
      render();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CapyRizzle] frame error:', err);
      showErrorBanner(err);
    }
    // Live debug readout — bottom-right corner (opt-in via ?debug=1).
    if (DEBUG && elDebugState) {
      const fz  = state.freezeT > 0 ? state.freezeT.toFixed(2) : '-';
      const dy  = state.deathT  > 0 ? state.deathT.toFixed(2)  : '-';
      const sm  = state.slowMo  > 0 ? state.slowMo.toFixed(2)  : '-';
      const fps = dt > 0 ? Math.round(1 / dt) : 0;
      const ty  = Math.round(state.truck ? state.truck.y : 0);
      const og  = state.truck && state.truck.onGround ? '1' : '0';
      const sp  = Math.round(state.speed || 0);
      const rt  = (state.runTime || 0).toFixed(1);
      elDebugState.innerHTML =
        'mode:' + mode + ' fps:' + fps + ' rt:' + rt + 's<br>' +
        'truckY:' + ty + ' onGround:' + og + ' speed:' + sp + '<br>' +
        'freeze:' + fz + ' death:' + dy + ' slowMo:' + sm +
        ' obs:' + state.obstacles.length;
    }
    requestAnimationFrame(frame);
  }

  // On-screen error banner — much easier to diagnose than a silent freeze.
  let _bannerShown = false;
  function showErrorBanner(err) {
    if (_bannerShown) return;
    _bannerShown = true;
    try {
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;padding:10px 14px;background:#3b0d0d;color:#ffd6d6;font:13px/1.4 ui-monospace,monospace;border:1px solid #ff6b6b;border-radius:8px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.5);';
      div.textContent = '[CapyRizzle] crash — ' + (err && err.message ? err.message : String(err)) + ' — hard refresh (⌘⇧R) and check console';
      document.body.appendChild(div);
    } catch {}
  }

  // Boot
  setText(elBest, 'BEST ' + state.best.toLocaleString());
  // Show best on the title screen too (motivation hook on subsequent loads).
  const elTitleBest = $('titleBest');
  if (elTitleBest) {
    if (state.best > 0) {
      const r = rankFor(state.best);
      elTitleBest.textContent = 'BEST  ' + state.best.toLocaleString() + '   ·   RANK ' + r.label;
      elTitleBest.classList.remove('hidden');
    } else {
      elTitleBest.classList.add('hidden');
    }
  }
  // Seed the world once at boot so the title screen has a live, scrolling
  // capybara-stuffed backdrop while the player decides to hit PLAY.
  resetRun();
  setMode('title');
  requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
})();
