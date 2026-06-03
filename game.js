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
  const BUILD = 'v27.8-mobile-quality';
  const MOBILE_MAX_PARTICLES = 56;
  const MOBILE_LITE_MAX_PARTICLES = 40;
  const DESKTOP_MAX_PARTICLES = 120;
  const MAX_POPUPS = { mobile: 10, desktop: 16 };
  let frameTime = 0;
  let mobileFpsEma = 58;
  const framePerf = { mobile: false, mobileLite: false };
  const skyGradCache = { key: '', grad: null };

  // ═════════════════════════════════════════════════════════════════════
  //   TIME-OF-DAY MOODS
  // ═════════════════════════════════════════════════════════════════════
  // Each mood overrides the sky gradient, horizon flame glow, and a few
  // accent colors. Picked at random on each run so consecutive games
  // feel visually distinct without changing gameplay at all.
  const MOODS = {
    dusk: {
      label: 'DUSK',
      sky: [
        [0.00, '#0c0830'], [0.32, '#1d104f'], [0.58, '#4a1d7a'],
        [0.82, '#b34186'], [0.94, '#ff7a3c'], [1.00, '#ffb060'],
      ],
      glow: ['#ffa546', '#ff6e3c', '#ff5a3c'],
      moonTint: '#ffe6a0',
      starTint: '#fff7e0',
    },
    dawn: {
      label: 'DAWN',
      sky: [
        [0.00, '#10174c'], [0.30, '#3c2675'], [0.55, '#a14079'],
        [0.78, '#ff8a6a'], [0.92, '#ffc06a'], [1.00, '#ffe09a'],
      ],
      glow: ['#ffbb6a', '#ff9054', '#ff7050'],
      moonTint: '#ffe8d0',
      starTint: '#ffe9bd',
    },
    night: {
      label: 'NIGHT',
      sky: [
        [0.00, '#04062b'], [0.32, '#0b1654'], [0.62, '#1a2b88'],
        [0.85, '#3d3f9a'], [0.95, '#6c5cff'], [1.00, '#8b6fff'],
      ],
      glow: ['#7fb8ff', '#5070ff', '#4060ff'],
      moonTint: '#e6f0ff',
      starTint: '#cce8ff',
    },
    inferno: {
      label: 'INFERNO',
      sky: [
        [0.00, '#1c0408'], [0.30, '#4a0a18'], [0.58, '#841830'],
        [0.78, '#d52f3a'], [0.92, '#ff6a3c'], [1.00, '#ffaa55'],
      ],
      glow: ['#ffaa55', '#ff6a3c', '#ff3030'],
      moonTint: '#ffd095',
      starTint: '#ffd09a',
    },
  };
  function pickMood() {
    const ids = Object.keys(MOODS);
    let id;
    do {
      id = ids[Math.floor(Math.random() * ids.length)];
    } while (ids.length > 1 && state.mood && state.mood.id === id);
    return Object.assign({ id }, MOODS[id]);
  }

  // Costume season — new palette + city tint each run (cosmetic only).
  const COSTUME_SEASONS = {
    summer: {
      label: 'SUMMER SOAK', emoji: '☀️', accent: '#4ec5ff',
      hat: 'sunglasses', prop: 'icecream',
      skyWash: 'rgba(78, 197, 255, 0.22)',
      sidewalk: '#3d5a9a', road: '#0c1438',
      smokeTints: ['#6a9abf', '#8ab8d8', '#5a8aaa', '#7ac0e8'],
      balloons: ['#4ec5ff', '#ffd24a', '#ff8a3c', '#a8e6ff'],
      confetti: ['#4ec5ff', '#ffd24a', '#fff7e0'],
      neon: ['#4ec5ff', '#ffd24a'],
    },
    winter: {
      label: 'WINTER CHONK', emoji: '❄️', accent: '#a8e6ff',
      hat: null, prop: 'scarf',
      skyWash: 'rgba(168, 230, 255, 0.2)',
      sidewalk: '#2a3a6a', road: '#060a1a',
      smokeTints: ['#8aa0c8', '#a8b8d8', '#6a80aa', '#c8d8f0'],
      balloons: ['#a8e6ff', '#fff7e0', '#8c6bff', '#4ec5ff'],
      confetti: ['#a8e6ff', '#fff7e0', '#c8d8f0'],
      neon: ['#a8e6ff', '#fff7e0'],
    },
    spring: {
      label: 'SPRING SPLASH', emoji: '🌸', accent: '#ff8a8a',
      hat: 'flower', prop: 'bouquet',
      skyWash: 'rgba(255, 138, 138, 0.16)',
      sidewalk: '#4a3a7a', road: '#10082a',
      smokeTints: ['#b88aaa', '#d8a8c8', '#9a7a9a', '#e8b8d0'],
      balloons: ['#ff8a8a', '#ffd24a', '#8c6bff', '#4ec5ff'],
      confetti: ['#ff8a8a', '#ffd24a', '#ff5a8a'],
      neon: ['#ff8a8a', '#ffd24a'],
    },
    autumn: {
      label: 'AUTUMN NAP', emoji: '🍂', accent: '#ff8a3c',
      hat: null, prop: 'leaves',
      skyWash: 'rgba(255, 138, 60, 0.2)',
      sidewalk: '#4a3528', road: '#140a08',
      smokeTints: ['#aa7a5a', '#c89a6a', '#8a6a4a', '#d8aa7a'],
      balloons: ['#ff8a3c', '#ffd24a', '#d94028', '#c9a566'],
      confetti: ['#ff8a3c', '#ffd24a', '#d94028'],
      neon: ['#ff8a3c', '#ffd24a'],
    },
    festival: {
      label: 'CAPY FEST', emoji: '🎉', accent: '#ffd24a',
      hat: 'party', prop: 'glowsticks',
      skyWash: 'rgba(255, 210, 74, 0.18)',
      sidewalk: '#4a3a6a', road: '#0e0828',
      smokeTints: ['#aa8ac8', '#c8a8e8', '#9a7ab8', '#dab8f0'],
      balloons: ['#ff5a8a', '#4ec5ff', '#ffd24a', '#8c6bff'],
      confetti: ['#ff5a8a', '#4ec5ff', '#ffd24a', '#8c6bff'],
      neon: ['#ff5a8a', '#ffd24a'],
    },
    capyjam: {
      label: 'CAPYJAM 2026', emoji: '🚒', accent: '#ff5a8a',
      hat: 'fd', prop: 'badge',
      skyWash: 'rgba(255, 90, 138, 0.14)',
      sidewalk: '#3b2a7a', road: '#0a0623',
      smokeTints: ['#7a5a8a', '#a36a8a', '#6e4d8e', '#b67c9a'],
      balloons: ['#ff5a8a', '#ffd24a', '#d94028', '#4ec5ff'],
      confetti: ['#ff5a8a', '#ffd24a', '#4ec5ff'],
      neon: ['#ff5a8a', '#ffd24a'],
    },
  };
  function pickCostumeSeason() {
    const ids = Object.keys(COSTUME_SEASONS);
    let id;
    do {
      id = ids[Math.floor(Math.random() * ids.length)];
    } while (ids.length > 1 && state.costumeSeason && state.costumeSeason.id === id);
    return Object.assign({ id }, COSTUME_SEASONS[id]);
  }
  function getCostumeSeason() {
    return state.costumeSeason || COSTUME_SEASONS.capyjam;
  }
  function truncateHudText(text, maxLen) {
    if (!text || text.length <= maxLen) return text;
    return text.slice(0, Math.max(0, maxLen - 1)) + '…';
  }
  function syncThemeHud() {
    const season = getCostumeSeason();
    const mood = state.mood || MOODS.dusk;
    const seasonText = (season.emoji || '') + ' ' + season.label;
    const moodText = mood.label || 'DUSK';
    const fullTheme = seasonText + ' · ' + moodText;
    const nodes = [
      { el: elTitleTheme, text: fullTheme, color: season.accent },
      { el: elGoTheme, text: 'This run: ' + fullTheme, color: season.accent },
      { el: elSeasonPill, text: season.emoji || '☀️', color: season.accent, title: fullTheme },
    ];
    for (const n of nodes) {
      if (!n.el) continue;
      n.el.textContent = n.text;
      n.el.style.color = n.color;
      n.el.style.borderColor = n.color;
      if (n.title != null) n.el.title = n.title;
    }
    if (elSeasonPill) elSeasonPill.classList.toggle('hidden', mode !== 'playing' || isNarrowHud());
    if (elTitleTheme) elTitleTheme.classList.remove('hidden');
  }
  function isTouchUi() {
    return window.matchMedia('(pointer: coarse)').matches
      || window.matchMedia('(hover: none)').matches
      || 'ontouchstart' in window
      || window.innerWidth < 900;
  }

  function isNarrowHud() {
    return isTouchUi();
  }

  function isPortraitMobile() {
    if (!isTouchUi()) return false;
    return window.matchMedia('(orientation: portrait)').matches
      || window.innerHeight >= window.innerWidth;
  }

  /** True phones / narrow portrait — not desktop browsers or wide touch laptops. */
  function isMobilePlay() {
    const coarse = window.matchMedia('(pointer: coarse)').matches
      || window.matchMedia('(hover: none)').matches
      || 'ontouchstart' in window;
    if (!coarse) return false;
    if (window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 1024) return false;
    return window.innerWidth < 768
      || (window.innerWidth < 900 && window.innerHeight >= window.innerWidth);
  }

  function syncUiMode() {
    const frame = document.getElementById('frame');
    const short = frame ? frame.clientHeight < 420 : window.innerHeight < 480;
    document.documentElement.classList.toggle('touch-ui', isTouchUi());
    document.documentElement.classList.toggle('short-frame', short);
    document.documentElement.classList.toggle('portrait-mobile', isPortraitMobile());
    document.documentElement.classList.toggle('mobile-play', isMobilePlay());
    document.documentElement.dataset.mode = mode;
  }

  /** Fewer / wider skyline props on narrow desktop viewports only. */
  function isCompactWorld() {
    const w = typeof window !== 'undefined' ? window.innerWidth : W;
    const h = typeof window !== 'undefined' ? window.innerHeight : H;
    return w < 520 || (w < 900 && h > w);
  }

  function particleBurst(n) {
    if (!framePerf.mobile) return n;
    const mul = framePerf.mobileLite ? 0.38 : 0.52;
    return Math.max(1, Math.round(n * mul));
  }

  function trimParticles() {
    let max = DESKTOP_MAX_PARTICLES;
    if (framePerf.mobileLite) max = MOBILE_LITE_MAX_PARTICLES;
    else if (framePerf.mobile) max = MOBILE_MAX_PARTICLES;
    if (state.particles.length > max) state.particles.length = max;
  }

  function syncPlayHints() {
    if (!elPlayHints) return;
    const jumpOn = state.hint.jumpA > 0.04;
    const waterOn = state.hint.waterA > 0.04;
    const shieldOn = state.hint.shieldA > 0.04;
    const any = jumpOn || waterOn || shieldOn;
    const narrow = isNarrowHud();
    elPlayHints.classList.toggle('hidden', mode !== 'playing' || !any);
    elPlayHints.classList.toggle('play-hints--narrow', narrow);
    const soloHint = narrow && (shieldOn || waterOn || jumpOn);
    if (elHintJump) {
      elHintJump.classList.toggle('hidden', !jumpOn || (soloHint && (shieldOn || waterOn)));
      elHintJump.style.opacity = String(clamp(state.hint.jumpA, 0, 1));
      elHintJump.textContent = hasJumpAssist()
        ? (narrow ? 'TAP — full jump' : 'TAP — full jump')
        : (narrow ? 'TAP — jump fires' : 'TAP to jump every fire');
    }
    if (elHintWater) {
      elHintWater.classList.toggle('hidden', !waterOn || (soloHint && shieldOn));
      elHintWater.style.opacity = String(clamp(state.hint.waterA, 0, 1));
      elHintWater.textContent = narrow
        ? 'BOOST — still jump!'
        : 'BOOST bucket = speed — still jump fires!';
    }
    if (elHintShield) {
      elHintShield.classList.toggle('hidden', !shieldOn);
      elHintShield.style.opacity = String(clamp(state.hint.shieldA, 0, 1));
      elHintShield.textContent = narrow
        ? 'ARMOR — one save'
        : 'ARMOR star = one save this run';
    }
  }

  const hudDomCache = {
    score: -1,
    combo: -1,
    bestLabel: '',
    boostPct: -1,
    boostReadout: '',
    boostReadoutMode: '',
    armorMode: '',
    heatLabel: '',
    heatSurge: false,
    narrowDock: null,
    chaseKey: '',
  };

  function syncPowerHud() {
    const boostCap = getBoostCap();
    const boostFill = clamp(state.boostTime / boostCap, 0, 1);
    const boostPct = Math.round(boostFill * 100);
    if (elBoost && hudDomCache.boostPct !== boostPct) {
      hudDomCache.boostPct = boostPct;
      setStyleWidth(elBoost, boostPct + '%');
    }
    const fuelLeft = state.boostTime > 0.05;
    const activeBoost = !!state.boosting;
    if (elBoostRow) {
      elBoostRow.classList.toggle('active-boost', fuelLeft);
      elBoostRow.title = activeBoost
        ? 'Boost active — faster truck, 2× scoring'
        : fuelLeft
          ? 'Boost fuel — jump fires still required'
          : 'Boost — grab blue buckets';
    }
    if (elBoostReadout) {
      const mode = activeBoost ? '2x' : (fuelLeft ? 'fuel' : 'off');
      if (hudDomCache.boostReadoutMode !== mode) {
        hudDomCache.boostReadoutMode = mode;
        if (activeBoost) {
          elBoostReadout.classList.remove('hidden');
          elBoostReadout.setAttribute('aria-label', 'Boost active, double points');
          setText(elBoostReadout, '2×');
          hudDomCache.boostReadout = '2×';
        } else if (fuelLeft) {
          elBoostReadout.classList.remove('hidden');
        } else {
          elBoostReadout.classList.add('hidden');
          elBoostReadout.removeAttribute('aria-label');
          hudDomCache.boostReadout = '';
        }
      }
      if (fuelLeft && !activeBoost) {
        const tenths = Math.round(state.boostTime * 10);
        const label = (tenths / 10).toFixed(1) + 's';
        if (hudDomCache.boostReadout !== label) {
          hudDomCache.boostReadout = label;
          elBoostReadout.setAttribute('aria-label', 'Boost fuel ' + label);
          setText(elBoostReadout, label);
        }
      }
    }
    if (elArmorRow) {
      const armed = !!state.shield;
      const canTake = state.armorSlots > 0;
      elArmorRow.classList.toggle('active-armor', armed);
      elArmorRow.classList.toggle('power-ready', !armed && canTake);
      elArmorRow.classList.toggle('power-spent', !armed && !canTake);
      elArmorRow.title = armed
        ? 'Armor — blocks the next hit'
        : canTake
          ? 'Armor ready — one pickup per run'
          : 'Armor used this run';
      if (elArmorReadout) {
        if (armed) {
          elArmorReadout.classList.remove('hidden');
          elArmorReadout.setAttribute('aria-label', 'Armor ready to block next hit');
          setText(elArmorReadout, 'SAVE');
        } else if (canTake) {
          elArmorReadout.classList.add('hidden');
          elArmorReadout.removeAttribute('aria-label');
        } else {
          elArmorReadout.classList.remove('hidden');
          elArmorReadout.setAttribute('aria-label', 'Armor used this run');
          setText(elArmorReadout, '—');
        }
      }
    }
  }

  // eslint-disable-next-line no-console
  console.info('%c[CapyRizzle] build ' + BUILD, 'background:#1f2640;color:#9ad1ff;padding:2px 6px;border-radius:4px;');
  function logRunTheme() {
    const s = getCostumeSeason();
    const m = state.mood || MOODS.dusk;
    console.info('[CapyRizzle] run theme: ' + s.label + ' (' + s.id + ') · mood: ' + m.label);
  }
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
  if (ctx) ctx.imageSmoothingEnabled = false;
  const W      = canvas.width;   // 960
  const H      = canvas.height;  // 540

  function refreshFrameClock(now) {
    frameTime = now;
    framePerf.mobile = isMobilePlay();
    framePerf.mobileLite = false;
  }

  function trackMobileFps(dt) {
    if (!framePerf.mobile) return;
    const fps = 1 / Math.max(dt, 0.001);
    mobileFpsEma = mobileFpsEma * 0.9 + fps * 0.1;
    framePerf.mobileLite = mobileFpsEma < 50;
  }

  function cosmeticCullPad() {
    if (framePerf.mobileLite) return 72;
    if (framePerf.mobile) return 120;
    return 160;
  }

  function useLighterBlend() {
    return !framePerf.mobile && !framePerf.mobileLite;
  }

  /** Desktop narrow windows only — never fold mobile into this path. */
  function seedCount(desktop, compact, mobile) {
    if (isMobilePlay()) return mobile;
    if (isCompactWorld()) return compact;
    return desktop;
  }

  function getSkyGradient() {
    const mood = state.mood || MOODS.dusk;
    const key = (mood.id || 'dusk') + '|' + GROUND_Y;
    if (skyGradCache.key !== key) {
      skyGradCache.key = key;
      const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      for (const [stop, color] of mood.sky) g.addColorStop(stop, color);
      skyGradCache.grad = g;
    }
    return skyGradCache.grad;
  }

  const $ = (id) => document.getElementById(id);
  const elTitle      = $('title');
  const elGameOver   = $('gameover');
  const elHud        = $('hud');
  const elScore      = $('score');
  const elBest       = $('best');
  const elBoost         = $('boost');
  const elBoostReadout  = $('boostReadout');
  const elBoostRow      = $('boostRow');
  const elArmorReadout  = $('armorReadout');
  const elArmorRow    = $('armorRow');
  const elHeatPill   = $('heatPill');
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
  const elDebugState = $('debugState');
  const elBestChase  = $('bestChase');
  const elTitleTheme = $('titleTheme');
  const elGoTheme    = $('goTheme');
  const elSeasonPill = $('seasonPill');
  const elPlayHints  = $('playHints');
  const elHintJump   = $('hintJump');
  const elHintWater  = $('hintWater');
  const elHintShield = $('hintShield');
  const elMuteBtn     = $('muteBtn');

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
  const JUMP_BUFFER    = 0.16;
  const JUMP_ASSIST_TIME   = 40;
  const JUMP_ASSIST_COUNT  = 20;
  const EASY_RUN_TIME      = 38;
  const TRAINING_SPAWNS    = 4;
  const POST_TRAIN_DOUBLE  = true;  // one scripted double right after training
  const TRAINING_LEAD_PX   = 340;
  const FIRST_FLAME_LEAD_PX = 260;

  // Pace targets (gaps use seconds × speed so rhythm stays fair as speed climbs):
  //   0–5s    300 px/s flat — jump timing matches mid-run feel, not sluggish 200
  //   5–30s   ramp → 480; singles; ~2.5–3s between patterns early
  //   30–55s  doubles; ~1.8–2.2s between patterns
  //   55s+    triples/surges; ~1.3–1.7s between patterns at high speed
  const BASE_SPEED         = 300;
  const WARMUP_SPEED       = 300;
  const WARMUP_TIME        = 5;
  const MAX_SPEED          = 480;
  const ABSOLUTE_MAX_SPEED = 640;
  const RAMP_PER_SEC       = 8;
  const POST_CAP_RAMP      = 7;

  const HEAT_AT = [0, 32, 50, 70, 92, 118, 150];
  const SURGE_AFTER_TIER = 4;
  const SURGE_INTERVAL   = 16;
  const SURGE_DURATION   = 6;
  const SURGE_SPEED_MUL  = 1.14;  // capped so in-pattern fire spacing stays jumpable
  const SURGE_GAP_MUL    = 0.72;

  // BOOST = faster truck + 2× points. You ALWAYS jump fires (no invincibility).
  const BOOST_MULT         = 1.42;
  const BOOST_TIME_PER     = 1.35;  // first pickup
  const BOOST_TOPOFF_MUL   = 0.35;  // topping off while already boosted
  const BOOST_MAX_BASE     = 3.8;   // cap shrinks with heat via getBoostCap()
  const BOOST_SCORE_MULT   = 2.0;
  const BOOST_DRAIN_BASE   = 0.22;  // fuel burns while active — can't coast forever
  const BOOST_DRAIN_HEAT   = 0.06;  // extra drain per heat tier

  // ARMOR — one charge per run. Second star = bonus points only.
  const ARMOR_PER_RUN = 1;

  const FIRST_SPAWN_AT = 3.8;
  // Min horizontal px between consecutive fires in one pattern.
  // cycle ≈ jump airtime + crouch + buffer ≈ 1.04s @ ABS 640 + surge 1.14 → need ≥ 756px.
  const MIN_MULTI_FIRE_DX = 780;
  // Seconds between patterns (multiplied by current speed in spawnPattern).
  const GAP_SEC_EARLY  = [2.35, 3.05];
  const GAP_SEC_MID    = [1.75, 2.35];
  const GAP_SEC_LATE   = [1.25, 1.65];
  const GAP_SEC_TRAIN  = [2.5, 3.1];
  const GAP_SEC_CALM   = [0.35, 0.65];
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
  const SLOWMO_TIME     = 0.24;
  const RUN_START_TIME  = 1.05;
  const COMBO_CHEERS    = ['SOAKY!', 'NICE!', 'WET HERO', 'CHONK', 'RIZZLE RUSH', 'UNSTOPPABLE', 'MAX CAPY'];
  const NEAR_MISS_LINES = ['CLOSE!', 'WHEW!', 'EDGE!', 'SPLASH BY!'];

  // Milestones
  const MILESTONE_M = 250;
  const SPECIAL_MILESTONES = {
    500:  'HALF K!',
    1000: '1KM HERO!',
    2000: '2KM BLAZE!',
  };

  // Clean-jump streak — Subway/Temple Run style micro-rewards for rhythm.
  const STREAK_EVERY = 5;
  const STREAK_BONUS_MUL = 1.35;  // score multiplier window after ON FIRE pop
  const STREAK_MUL_TIME = 4.0;

  // Wave director — themed 12–18s blocks so the run has acts, not one flat loop.
  const WAVES = {
    calm: {
      id: 'calm', tag: 'calm', tele: 'BREATHER', color: '#a8e6ff',
      patternsMin: 2, patternsMax: 3, gapMul: 1.4,
    },
    reward: {
      id: 'reward', tag: 'reward', tele: 'REWARD RUN', color: '#4ec5ff',
      patternsMin: 2, patternsMax: 4, gapMul: 1.0,
    },
    pressure: {
      id: 'pressure', tag: 'pressure', tele: 'HEATING UP', color: '#ff8a3c',
      patternsMin: 3, patternsMax: 5, gapMul: 0.82,
    },
    spectacle: {
      id: 'spectacle', tag: 'spectacle', tele: 'WATCH OUT!', color: '#ff5a3c',
      patternsMin: 1, patternsMax: 2, gapMul: 1.05,
    },
  };

  const HIGHSCORE_KEY = 'capyrizzlerush_best_v5';
  const TUTORIAL_KEY  = 'capyrizzlerush_tut_v5';
  const ACHIEVE_KEY   = 'capyrizzlerush_ach_v1';
  const MUTE_KEY      = 'capyrizzlerush_mute_v1';
  // First-time accomplishment definitions. Each fires at most once
  // across runs (persisted via localStorage as a bitmap).
  const runMeters = (s) => Math.floor(s.distance / 10);
  const ACHIEVEMENTS = [
    { id: 'firstKm',       label: 'FIRST KILOMETER',  test: (s) => runMeters(s) >= 1000 },
    { id: 'firstX10',      label: 'COMBO x10',        test: (s) => s.combo    >= 10 },
    { id: 'firstX20',      label: 'COMBO x20 MAX!',   test: (s) => s.combo    >= 20 },
    { id: 'firstSaved',    label: 'FIRST SAVE!',      test: (s) => s.everSaved },
    { id: 'firstBoost',    label: 'FIRST BOOST!',    test: (s) => s.watersGrabbed >= 1 },
    { id: 'first5km',      label: '5 KILOMETERS',     test: (s) => runMeters(s) >= 5000 },
    { id: 'firstRankC',    label: 'RANK C OR BETTER', test: (s) => s.score >= 5000 },
    { id: 'firstRankB',    label: 'RANK B HERO',      test: (s) => s.score >= 15000 },
    { id: 'firstRankA',    label: 'RANK A LEGEND',    test: (s) => s.score >= 40000 },
    { id: 'firstRankS',    label: 'RANK S CAPY GOD',  test: (s) => s.score >= 100000 },
  ];

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
    const season = getCostumeSeason();
    const smokeTints = season.smokeTints || COSTUME_SEASONS.capyjam.smokeTints;
    const balloons = season.balloons || COSTUME_SEASONS.capyjam.balloons;
    const confettiColors = season.confetti || COSTUME_SEASONS.capyjam.confetti;
    const neonPair = season.neon || COSTUME_SEASONS.capyjam.neon;
    const billAccents = [season.accent, neonPair[0], neonPair[1], '#ffd24a', '#ff8a3c', '#8c6bff'];
    const layoutOx = { summer: 0, winter: 95, spring: 190, autumn: 285, festival: 380, capyjam: 475 }[season.id] || 0;
    const mp = isMobilePlay();
    const cp = !mp && isCompactWorld();

    // ── Smoke columns rising from the burning city ──────────────────
    const SMOKE_SPACING = mp ? 280 : 240;
    const smokeN = seedCount(14, 8, 6);
    for (let i = 0; i < smokeN; i++) {
      Cosmetics.add({
        layer: 'skylineBg',
        x: layoutOx * 0.4 + i * SMOKE_SPACING + rand(-80, 80),
        y: GROUND_Y - 120,
        parallax: 0.18,
        wrap: SMOKE_SPACING * 6,
        scale: rand(0.7, 1.5),
        tint: smokeTints[i % smokeTints.length],
        draw: drawSmokeColumn,
      });
    }

    // ── Murals on mid-rise walls (skyline bg) ───────────────────────
    const MURAL_TAGS = ['WET  IS  BEST', 'CAPY  PRIDE', 'SOAK  DAILY', 'HAY  O  CLOCK', 'RIVAL  BEAVER?  NO'];
    const MURAL_SPACING = mp ? 480 : 420;
    const muralN = seedCount(7, 5, 4);
    for (let i = 0; i < muralN; i++) {
      Cosmetics.add({
        layer: 'skylineBg',
        x: layoutOx + 300 + i * MURAL_SPACING,
        y: GROUND_Y - 75 - (i % 2) * 18,
        parallax: 0.35,
        wrap: MURAL_SPACING * 5,
        tagline: MURAL_TAGS[i % MURAL_TAGS.length],
        draw: drawMuralCapy,
      });
    }

    // ── Colossal capy statues on the horizon ────────────────────────
    const statueN = seedCount(3, 2, 2);
    for (let i = 0; i < statueN; i++) {
      Cosmetics.add({
        layer: 'farBg',
        x: 500 + i * 1100,
        y: GROUND_Y - 140,
        parallax: 0.08,
        wrap: 3200,
        draw: drawGiantCapyStatue,
      });
    }

    // ── Sky NPCs — capybaras spread across the whole sky ─────────────
    const BALLOONS = [
      { y:  55, vx: -24, color: balloons[0] },
      { y: 100, vx: -14, color: balloons[1] },
      { y:  85, vx: -19, color: balloons[2] },
      { y:  38, vx: -11, color: balloons[3] },
      { y: 125, vx: -17, color: balloons[0] },
      { y:  70, vx: -20, color: balloons[1] },
      { y: 145, vx: -13, color: balloons[2] },
      { y:  48, vx: -15, color: balloons[3] },
    ];
    const balloonList = mp ? BALLOONS.slice(0, 6) : BALLOONS;
    balloonList.forEach((b, i) => {
      Cosmetics.add({
        layer: 'sky',
        x: W + 200 + i * 320, y: b.y,
        vx: b.vx, parallax: 0,
        respawnX: W + rand(1100, 2200),
        balloonColor: b.color,
        draw: drawBalloonCapy,
      });
    });
    const gliders = [
      { x: -120, y: 48, vx: 18, respawn: -rand(800, 1400) },
      { x: W + 500, y: 72, vx: -14, respawn: W + rand(900, 1600) },
      { x: W + 1200, y: 38, vx: -10, respawn: W + rand(1400, 2200) },
    ];
    gliders.forEach((g) => {
      Cosmetics.add({
        layer: 'sky',
        x: g.x, y: g.y, vx: g.vx, parallax: 0,
        respawnX: g.respawn,
        draw: drawGliderCapy,
      });
    });
    const cloudN = seedCount(6, 4, 4);
    for (let i = 0; i < cloudN; i++) {
      Cosmetics.add({
        layer: 'sky',
        x: rand(0, W), y: rand(28, 150),
        vx: rand(-10, -3), parallax: 0,
        respawnX: W + rand(400, 1200),
        cloudScale: rand(0.65, 1.35),
        draw: drawCloudCapy,
      });
    }
    const blimpN = seedCount(2, 2, 2);
    for (let i = 0; i < blimpN; i++) {
      Cosmetics.add({
        layer: 'sky',
        x: W + 600 + i * 900, y: 44 + i * 18, vx: -9 - i * 2, parallax: 0,
        respawnX: W + rand(2200, 3600),
        draw: drawCapyBlimp,
      });
    }
    if (!mp) {
      for (let i = 0; i < 2; i++) {
        Cosmetics.add({
          layer: 'sky',
          x: W + 1400 + i * 700, y: 95 + i * 25, vx: -26 - i * 4, parallax: 0,
          respawnX: W + rand(2000, 3400),
          draw: drawUfoCapy,
        });
      }
    }
    const cableN = mp ? 1 : 2;
    for (let i = 0; i < cableN; i++) {
      Cosmetics.add({
        layer: 'sky',
        x: W + 400 + i * 500, y: 88, vx: -8, parallax: 0,
        respawnX: W + rand(1800, 2800),
        draw: drawCableCarCapy,
      });
    }
    const confettiN = seedCount(10, 6, 5);
    for (let i = 0; i < confettiN; i++) {
      Cosmetics.add({
        layer: 'sky',
        x: rand(0, W), y: rand(-20, 80),
        vx: rand(-4, 4), vy: rand(18, 32),
        parallax: 0,
        confetti: true,
        tint: confettiColors[i % confettiColors.length],
        spinOff: rand(0, 6),
        draw: drawCapyConfetti,
      });
    }

    // ── Billboards on rooftops in the FG skyline ────────────────────
    const ADS = [
      'VOTE  CAPY', 'EAT  WATERMELON', 'STAY  WET', 'SOAK  YOUR  ROOTS',
      'NEW  RIVER  IPA', 'CAPY  4  MAYOR', 'TRUST  RIZZLE', 'BIG  TEETH',
      'HOT  TUB  WKLY', 'BLORBO  4  PRES', 'CAPY  CASINO', 'I  ♥  HAY',
      'NAP  APPROVED', 'CHONK  ENERGY', 'WET  DOG  VIBES', 'MELON  KING',
    ];
    const compactWorld = cp || mp;
    const BILL_SPACING = mp ? 620 : compactWorld ? 640 : 480;
    const billCount = seedCount(12, 8, 7);
    for (let i = 0; i < billCount; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: 200 + i * BILL_SPACING,
        y: GROUND_Y - 82 - (i % 4) * 26,
        parallax: 0.55,
        wrap: BILL_SPACING * 5,
        text: ADS[i % ADS.length],
        accent: billAccents[i % billAccents.length],
        draw: drawCapyBillboard,
      });
    }

    const WIN_SPACING = mp ? 220 : compactWorld ? 130 : 100;
    const winCount = seedCount(36, 22, 6);
    for (let i = 0; i < winCount; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: -80 + i * WIN_SPACING + (i * 71) % 70,
        y: GROUND_Y - 38 - (i % 6) * 20,
        parallax: 0.55,
        wrap: WIN_SPACING * 14,
        wave: (i * 13) % 17 < 9,
        blinds: i % 3 !== 2,
        blindOff: (i * 0.37) % (Math.PI * 2),
        hatType: i % 5 === 0 ? ['party', 'fd', 'melon', 'flower'][i % 4] : undefined,
        draw: drawWindowCapy,
      });
    }

    const ROOF_SPACING = 300;
    const ROOF_TEXTS = [
      'GO  RIZZLE', 'PUT  IT  OUT', 'HERO', 'WE  ♥  CAPY', 'SAVE  US',
      'MORE  WATER', 'SPLASH', 'CAPY  FD', 'HONK  HONK', 'SOAK  CITY',
    ];
    const roofN = seedCount(10, 7, 6);
    for (let i = 0; i < roofN; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: 320 + i * ROOF_SPACING,
        y: GROUND_Y - 88 - (i % 2) * 8,
        parallax: 0.55,
        wrap: ROOF_SPACING * 6,
        text: ROOF_TEXTS[i % ROOF_TEXTS.length],
        accent: '#fff7e0',
        draw: drawRooftopCheerCapy,
      });
    }

    const ESC_SPACING = mp ? 320 : 280;
    const escN = seedCount(8, 6, 5);
    for (let i = 0; i < escN; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: 500 + i * ESC_SPACING,
        y: GROUND_Y - 72,
        parallax: 0.55,
        wrap: ESC_SPACING * 5,
        hat: i % 2 === 0 ? 'fd' : 'party',
        draw: drawFireEscapeCapy,
      });
    }

    const tubN = seedCount(4, 3, 3);
    for (let i = 0; i < tubN; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: 650 + i * 580,
        y: GROUND_Y - 102 - (i % 2) * 12,
        parallax: 0.55, wrap: 2400,
        draw: drawHotTubCapys,
      });
    }

    const PARADE_SPACING = mp ? 800 : 720;
    const paradeN = seedCount(4, 3, 3);
    for (let i = 0; i < paradeN; i++) {
      Cosmetics.add({
        layer: 'sidewalk',
        x: 400 + i * PARADE_SPACING,
        y: GROUND_Y - 42,
        parallax: 0.75,
        wrap: PARADE_SPACING * 3,
        inflatableColor: balloons[i % balloons.length],
        hat: [season.hat, 'party', 'melon', 'fd'][i % 4] || 'party',
        draw: drawParadeFloatCapy,
      });
    }

    const SIDE_SPACING = mp ? 240 : 200;
    const sideN = seedCount(16, 12, 10);
    for (let i = 0; i < sideN; i++) {
      Cosmetics.add({
        layer: 'sidewalk',
        x: layoutOx * 0.6 + 450 + i * SIDE_SPACING,
        y: GROUND_Y - 16,
        parallax: 0.85,
        wrap: SIDE_SPACING * 8,
        pose: i % 7,
        draw: drawSidewalkCapy,
      });
    }
    const MELON_SPACING = mp ? 540 : 480;
    const melonN = seedCount(5, 3, 3);
    for (let i = 0; i < melonN; i++) {
      Cosmetics.add({
        layer: 'sidewalk',
        x: 900 + i * MELON_SPACING,
        y: GROUND_Y - 20,
        parallax: 0.85,
        wrap: MELON_SPACING * 4,
        draw: drawMelonCartCapy,
      });
    }
    const koolN = seedCount(3, 2, 2);
    for (let i = 0; i < koolN; i++) {
      Cosmetics.add({
        layer: 'sidewalk',
        x: 1200 + i * 900,
        y: GROUND_Y - 26,
        parallax: 0.85, wrap: 2800,
        draw: drawKoolAidCapy,
      });
    }
    const papN = seedCount(4, 3, 3);
    for (let i = 0; i < papN; i++) {
      Cosmetics.add({
        layer: 'sidewalk',
        x: 700 + i * 650,
        y: GROUND_Y - 18,
        parallax: 0.85,
        wrap: 2600,
        draw: drawPaparazziCapy,
      });
    }

    const emberN = seedCount(18, 14, 10);
    for (let i = 0; i < emberN; i++) {
      Cosmetics.add({
        layer: 'farBg',
        x: rand(0, W), y: rand(GROUND_Y - 220, GROUND_Y),
        vx: rand(-8, 8), vy: rand(-48, -18),
        parallax: 0,
        emberKind: i % 3,
        emberColor: ['#ff8a3c', '#ffd24a', '#ff5a3c', '#8c6bff'][i % 4],
        draw: drawFloatingEmber,
        respawnX: NaN,
        ember: true,
      });
    }

    const RIZZLE_SPACING = mp ? 1300 : compactWorld ? 1400 : 1100;
    const rizzleCount = seedCount(5, 3, 3);
    for (let i = 0; i < rizzleCount; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: 750 + i * RIZZLE_SPACING,
        y: GROUND_Y - 128 - (i % 3) * 14,
        parallax: 0.55, wrap: RIZZLE_SPACING * 3,
        draw: drawRizzleFanBillboard,
      });
    }

    // ── Pass 2: neon rooftops, balcony parties, searchlights ─────────
    const narrowWorld = compactWorld;
    const NEON_SPACING = mp ? 520 : narrowWorld ? 560 : 400;
    const NEON_MSGS = ['CAPY SPA', 'SOAK BAR', 'RIZZLE FM', 'CHONK HQ', 'WET DOG'];
    const neonCount = seedCount(8, 5, 4);
    for (let i = 0; i < neonCount; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: 360 + i * NEON_SPACING,
        y: GROUND_Y - 178 - (i % 3) * 18,
        parallax: 0.55,
        wrap: NEON_SPACING * 5,
        text: NEON_MSGS[i % NEON_MSGS.length],
        palette: [neonPair, [neonPair[1], season.accent], [season.accent, neonPair[0]]][i % 3],
        draw: drawNeonRooftopSign,
      });
    }
    const BALCONY_SPACING = mp ? 280 : 240;
    const balconyN = seedCount(12, 8, 5);
    for (let i = 0; i < balconyN; i++) {
      Cosmetics.add({
        layer: 'skylineFg',
        x: 180 + i * BALCONY_SPACING,
        y: GROUND_Y - 52 - (i % 4) * 16,
        parallax: 0.55,
        wrap: BALCONY_SPACING * 8,
        draw: drawBalconyParty,
      });
    }
    if (!mp) {
      for (let i = 0; i < 4; i++) {
        Cosmetics.add({
          layer: 'skylineBg',
          x: 400 + i * 700,
          y: GROUND_Y - 160 - i * 20,
          parallax: 0.25,
          wrap: 2800,
          spinOff: rand(0, Math.PI * 2),
          draw: drawSearchlightSweep,
        });
      }
    }

    // ── Pass 3: street-level capy life (hydrants, manholes, puddles) ─
    const HYDRANT_SPACING = mp ? 380 : 340;
    const hydrantN = seedCount(7, 5, 5);
    for (let i = 0; i < hydrantN; i++) {
      Cosmetics.add({
        layer: 'sidewalk',
        x: 300 + i * HYDRANT_SPACING,
        y: GROUND_Y - 12,
        parallax: 0.9,
        wrap: HYDRANT_SPACING * 5,
        draw: drawHydrantCapy,
      });
    }
    const HOLE_SPACING = mp ? 460 : 420;
    const holeN = seedCount(6, 4, 4);
    for (let i = 0; i < holeN; i++) {
      Cosmetics.add({
        layer: 'sidewalk',
        x: 550 + i * HOLE_SPACING,
        y: GROUND_Y - 4,
        parallax: 0.9,
        wrap: HOLE_SPACING * 4,
        draw: drawManholeCapy,
      });
    }
    const puddleN = seedCount(8, 5, 5);
    for (let i = 0; i < puddleN; i++) {
      Cosmetics.add({
        layer: 'sidewalk',
        x: 200 + i * 280,
        y: GROUND_Y + 2,
        parallax: 0.88,
        wrap: 2240,
        draw: drawPuddleReflection,
      });
    }
    const chalkN = seedCount(6, 4, 4);
    for (let i = 0; i < chalkN; i++) {
      Cosmetics.add({
        layer: 'sidewalk',
        x: 480 + i * 360,
        y: GROUND_Y - 2,
        parallax: 0.88,
        wrap: 2160,
        draw: drawChalkCapyArt,
      });
    }

    // ── Pass 4: sky spectacle (shooting capys, orbiters) ──────────────
    if (!mp) {
      for (let i = 0; i < 3; i++) {
        Cosmetics.add({
          layer: 'sky',
          x: W + rand(200, 600),
          y: rand(40, 120),
          vx: -180 - i * 40,
          vy: rand(20, 50),
          parallax: 0,
          shootStar: true,
          draw: drawShootingCapyStar,
        });
      }
      for (let i = 0; i < 5; i++) {
        Cosmetics.add({
          layer: 'sky',
          x: rand(100, W - 100),
          y: rand(60, 140),
          vx: 0,
          parallax: 0,
          orbitR: rand(18, 36),
          hatType: ['party', 'melon', 'fd'][i % 3],
          draw: drawOrbitMiniCapy,
        });
      }
    }

    // ── Pass 5: mega capy skyscrapers (wide cosmetic landmarks) ───────
    const MEGA_SPACING = mp ? 2200 : 2000;
    const megaN = seedCount(4, 2, 2);
    for (let i = 0; i < megaN; i++) {
      Cosmetics.add({
        layer: 'skylineBg',
        x: 400 + i * MEGA_SPACING,
        y: GROUND_Y - 12,
        parallax: 0.12,
        wrap: MEGA_SPACING * 2,
        megaW: 520 + (i % 2) * 80,
        megaSeed: 1000 + i * 77,
        draw: drawMegaCapyTowerCosmetic,
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
    if (opts.hatType) drawCapyHatPreset(cx, cy, s, opts.hatType);
    else if (opts.hat) opts.hat(cx, cy, s);
    ctx.restore();
  }

  function drawCapyHatPreset(cx, cy, s, type) {
    const o = '#1a0f3a';
    ctx.save();
    if (type === 'fd') {
      ctx.fillStyle = '#d94028';
      ctx.beginPath();
      ctx.ellipse(cx, cy - s * 0.72, s * 0.95, s * 0.28, 0, Math.PI, 2 * Math.PI);
      ctx.fill();
      ctx.lineWidth = Math.max(1, s * 0.12);
      ctx.strokeStyle = o;
      ctx.stroke();
      ctx.fillRect(cx - s * 0.9, cy - s * 0.72, s * 1.8, 3);
      ctx.strokeRect(cx - s * 0.9, cy - s * 0.72, s * 1.8, 3);
    } else if (type === 'party') {
      ctx.fillStyle = '#ff5a8a';
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 1.35);
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
        ctx.lineTo(cx + Math.cos(a) * s * 0.55, cy - s * 1.05 + Math.sin(a) * s * 0.55);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(cx - s * 0.08, cy - s * 1.5, s * 0.16, s * 0.35);
    } else if (type === 'melon') {
      ctx.fillStyle = '#3d8f4a';
      ctx.beginPath();
      ctx.ellipse(cx, cy - s * 0.95, s * 0.75, s * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#2a6a35';
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 1.45);
      ctx.quadraticCurveTo(cx + s * 0.2, cy - s * 1.1, cx, cy - s * 0.7);
      ctx.stroke();
    } else if (type === 'chef') {
      ctx.fillStyle = '#fff7e0';
      ctx.beginPath();
      ctx.ellipse(cx, cy - s * 0.88, s * 0.7, s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1a0f3a';
      ctx.fillRect(cx - s * 0.55, cy - s * 0.95, s * 1.1, s * 0.12);
    } else if (type === 'sunglasses') {
      ctx.fillStyle = '#1a0f3a';
      ctx.fillRect(cx - s * 0.62, cy - s * 0.12, s * 0.5, s * 0.22);
      ctx.fillRect(cx + s * 0.12, cy - s * 0.12, s * 0.5, s * 0.22);
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.12, cy - s * 0.02);
      ctx.lineTo(cx + s * 0.12, cy - s * 0.02);
      ctx.stroke();
    } else if (type === 'flower') {
      ctx.fillStyle = '#ff8a8a';
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * s * 0.55, cy - s * 1.0 + Math.sin(a) * s * 0.35, s * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.arc(cx, cy - s * 1.0, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Seasonal sidewalk props — tied to state.costumeSeason, never gameplay.
  function drawSeasonProp(x, y, season, pose) {
    if (!season || !season.prop) return;
    ctx.save();
    const prop = season.prop;
    if (prop === 'icecream') {
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(x + 10, y - 2, 4, 10);
      ctx.fillStyle = '#ff8a8a';
      ctx.beginPath();
      ctx.arc(x + 12, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop === 'scarf') {
      ctx.strokeStyle = season.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 2);
      ctx.quadraticCurveTo(x, y + 6, x + 10, y);
      ctx.stroke();
      ctx.fillStyle = '#fff7e0';
      ctx.beginPath();
      ctx.arc(x + 12, y + 4, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop === 'bouquet') {
      ctx.fillStyle = '#ff8a8a';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + 12 + i * 2, y - 6 - i, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#3d8f4a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 14, y); ctx.lineTo(x + 14, y - 8);
      ctx.stroke();
    } else if (prop === 'leaves') {
      const colors = ['#ff8a3c', '#ffd24a', '#d94028'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = colors[i % 3];
        ctx.beginPath();
        ctx.ellipse(x - 14 + i * 5, y + 10, 4, 2, i * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (prop === 'glowsticks') {
      const t = frameTime / 200;
      const colors = ['#ff5a8a', '#4ec5ff', '#ffd24a'];
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = colors[(i + Math.floor(t)) % 3];
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t + i);
        ctx.beginPath();
        ctx.moveTo(x + 10 + i * 6, y);
        ctx.lineTo(x + 16 + i * 6, y - 12 - Math.sin(t + i) * 3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (prop === 'badge') {
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.arc(x - 14, y - 4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1a0f3a';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#1a0f3a';
      ctx.font = 'bold 5px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('26', x - 14, y - 2);
    }
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
    if (framePerf.mobile) {
      ctx.save();
      ctx.fillStyle = '#1a0f3a';
      rrect(x - 14, y - 14, 28, 28, 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 200, 120, 0.8)';
      rrect(x - 12, y - 12, 24, 24, 2); ctx.fill();
      drawTinyCapy(x, y + 2, 5.5, { mouth: 'smile', hatType: c.hatType });
      ctx.restore();
      return;
    }
    const blinds = c.blinds !== false;
    const open = 0.42 + 0.58 * Math.sin(c.phase * 0.85 + (c.blindOff || 0));
    ctx.save();
    ctx.fillStyle = '#1a0f3a';
    rrect(x - 14, y - 14, 28, 28, 2); ctx.fill();
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 16);
    glow.addColorStop(0, 'rgba(255, 200, 120, 0.95)');
    glow.addColorStop(1, 'rgba(255, 200, 120, 0.25)');
    ctx.fillStyle = glow;
    rrect(x - 12, y - 12, 24, 24, 2); ctx.fill();

    if (blinds) {
      // Capy shadow on the wall behind the blinds.
      ctx.fillStyle = 'rgba(26, 15, 58, 0.72)';
      ctx.beginPath();
      ctx.ellipse(x + 1, y + 5, 7, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - 7, y - 5, 3.5, 3, -0.2, 0, Math.PI * 2);
      ctx.ellipse(x + 9, y - 5, 3.5, 3, 0.2, 0, Math.PI * 2);
      ctx.fill();
      for (let sy = y - 11; sy <= y + 10; sy += 3.5) {
        const lift = Math.sin(c.phase * 0.85 + sy * 0.15) * open * 2.5;
        ctx.fillStyle = 'rgba(26, 15, 58, 0.88)';
        ctx.fillRect(x - 12, sy + lift, 24, 2.2);
      }
      if (open > 0.52) {
        drawTinyCapy(x, y + 2, 5.5, {
          mouth: open > 0.75 ? 'o' : 'smile',
          hatType: c.hatType,
        });
        if (c.wave && open > 0.6) {
          const wave = Math.sin(c.phase * 3) * 0.3;
          ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x + 5, y + 3);
          ctx.lineTo(x + 11 + wave * 3, y - 5);
          ctx.stroke();
        }
      }
    } else {
      drawTinyCapy(x, y + 2, 6, { mouth: 'smile', hatType: c.hatType });
      if (c.wave) {
        const wave = Math.sin(c.phase * 3) * 0.3;
        ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 4);
        ctx.lineTo(x + 12 + wave * 3, y - 4 + Math.abs(wave) * 3);
        ctx.stroke();
      }
    }
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

  function drawOutlinedLabel(text, x, y, fill, font) {
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff7e0';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function fitFontSize(text, maxW, basePx, minPx) {
    let size = basePx;
    ctx.font = 'bold ' + size + 'px ui-rounded, Nunito, system-ui, sans-serif';
    while (size > minPx && ctx.measureText(text).width > maxW) {
      size -= 1;
      ctx.font = 'bold ' + size + 'px ui-rounded, Nunito, system-ui, sans-serif';
    }
    return size;
  }

  function drawCapyBillboard(c) {
    const x = c.x, y = c.y;
    const label = (c.text && String(c.text).trim()) || 'CAPY  RUSH';
    const bw = 168;
    const bh = 46;
    const bx = x - bw / 2;
    const by = y - 38;
    ctx.save();
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x - 2, y, 4, 62);
    ctx.fillStyle = c.accent || '#ffd24a';
    rrect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1a0f3a';
    ctx.stroke();
    drawTinyCapy(bx + 20, by + bh / 2, 8, { mouth: 'smile', hatType: 'party' });
    const textPad = 6;
    const textX = bx + 40;
    const textW = bw - 44;
    const textH = bh - 8;
    ctx.fillStyle = 'rgba(26, 15, 58, 0.82)';
    rrect(textX - textPad, by + 4, textW + textPad * 2, textH, 4);
    ctx.fill();
    const headSize = fitFontSize(label, textW, 13, 9);
    drawOutlinedLabel(label, textX, by + 17, '#fff7e0', 'bold ' + headSize + 'px ui-rounded, Nunito, system-ui, sans-serif');
    drawOutlinedLabel('-- CAPY CO --', textX, by + 32, 'rgba(255, 247, 224, 0.75)', 'bold 8px ui-rounded, Nunito, system-ui, sans-serif');
    const blink = (frameTime / 500 + x * 0.01) % 2 < 1;
    ctx.fillStyle = blink ? '#ff5a3c' : 'rgba(255,90,60,0.3)';
    ctx.beginPath(); ctx.arc(bx + 4, by + 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx + bw - 4, by + 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawSidewalkCapy(c) {
    const x = c.x, y = c.y;
    const season = getCostumeSeason();
    ctx.save();
    // body (small oval)
    ctx.fillStyle = '#b4884f';
    ctx.beginPath();
    ctx.ellipse(x, y, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#1a0f3a';
    ctx.stroke();
    // head (pose 6 draws head after newspaper)
    const headOpts = {
      mouth: (c.pose === 2 || c.pose === 6) ? 'o' : 'smile',
    };
    if (c.pose === 4) headOpts.hatType = 'sunglasses';
    else if (season.hat && c.pose !== 5) headOpts.hatType = season.hat;
    if (c.pose !== 6) {
      drawTinyCapy(x - 10, y - 6, 7, headOpts);
    }
    drawSeasonProp(x, y, season, c.pose);
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
    } else if (c.pose === 4) {
      // selfie — phone + flash
      ctx.fillStyle = '#1a0f3a';
      rrect(x + 8, y - 8, 8, 12, 2); ctx.fill();
      const flash = Math.sin(c.phase * 10) > 0.85;
      if (flash) {
        ctx.fillStyle = 'rgba(255, 247, 224, 0.9)';
        ctx.beginPath();
        ctx.arc(x + 12, y - 14, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (c.pose === 5) {
      // tuba busker
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.ellipse(x + 14, y + 2, 10, 14, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2; ctx.stroke();
      const toot = Math.sin(c.phase * 7) * 2;
      ctx.fillStyle = 'rgba(255, 247, 224, 0.5)';
      for (let n = 0; n < 3; n++) {
        ctx.beginPath();
        ctx.arc(x + 22 + n * 5, y - 8 - toot, 3 + n, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (c.pose === 6) {
      // newspaper capy
      ctx.fillStyle = '#fff7e0';
      rrect(x - 14, y - 4, 28, 18, 2); ctx.fill();
      ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#1a0f3a';
      ctx.font = 'bold 7px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CAPY TIMES', x, y + 6);
      drawTinyCapy(x, y - 12, 7, { mouth: 'o', hatType: 'fd' });
    } else if (c.pose === 3) {
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
    const blink = (frameTime / 400 + x * 0.01) % 2 < 1;
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

  // Building mural — giant painted capy on a brick wall.
  function drawMuralCapy(c) {
    const x = c.x, y = c.y;
    ctx.save();
    ctx.fillStyle = '#4a3555';
    rrect(x - 48, y - 52, 96, 72, 4); ctx.fill();
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2; ctx.stroke();
    // brick lines
    ctx.strokeStyle = 'rgba(26, 15, 58, 0.25)'; ctx.lineWidth = 1;
    for (let row = 0; row < 5; row++) {
      const ry = y - 48 + row * 14;
      ctx.beginPath();
      ctx.moveTo(x - 44, ry); ctx.lineTo(x + 44, ry);
      ctx.stroke();
    }
    // painted capy — huge flat style
    ctx.fillStyle = '#c9694e';
    ctx.beginPath();
    ctx.ellipse(x, y - 8, 34, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2.5; ctx.stroke();
    drawTinyCapy(x, y - 20, 12, { mouth: 'smile', hatType: 'melon' });
    ctx.fillStyle = 'rgba(26, 15, 58, 0.72)';
    rrect(x - 44, y + 12, 88, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#fff7e0';
    ctx.font = 'bold 9px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.tagline || 'WET  IS  BEST', x, y + 20);
    ctx.restore();
  }

  // Parade float — flatbed truck hauling a giant inflatable capy.
  function drawParadeFloatCapy(c) {
    const x = c.x, y = c.y;
    const wob = Math.sin(c.phase * 1.2) * 2;
    ctx.save();
    // wheels + chassis
    ctx.fillStyle = '#1a0f3a';
    ctx.beginPath();
    ctx.arc(x - 28, y + 18, 7, 0, Math.PI * 2);
    ctx.arc(x + 28, y + 18, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d94028';
    rrect(x - 42, y + 4, 84, 14, 4); ctx.fill();
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2; ctx.stroke();
    // giant inflatable
    ctx.fillStyle = c.inflatableColor || '#ff8a8a';
    ctx.beginPath();
    ctx.ellipse(x, y - 22 + wob, 38, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawTinyCapy(x, y - 28 + wob, 12, { mouth: 'o', hatType: c.hat || 'party' });
    // confetti streamers
    const colors = ['#ffd24a', '#4ec5ff', '#ff5a8a'];
    for (let i = 0; i < 5; i++) {
      const ph = c.phase * 3 + i;
      ctx.strokeStyle = colors[i % 3];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 30 + i * 12, y - 50 + wob);
      ctx.lineTo(x - 34 + i * 12 + Math.sin(ph) * 4, y - 62 + Math.cos(ph) * 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Fire escape with a capy climbing down (or up).
  function drawFireEscapeCapy(c) {
    const x = c.x, y = c.y;
    const climb = Math.sin(c.phase * 0.9) * 6;
    ctx.save();
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 2.5;
    // ladder rails
    ctx.beginPath();
    ctx.moveTo(x - 18, y - 40); ctx.lineTo(x - 18, y + 20);
    ctx.moveTo(x + 18, y - 40); ctx.lineTo(x + 18, y + 20);
    ctx.stroke();
    for (let r = 0; r < 5; r++) {
      const ry = y - 36 + r * 12;
      ctx.beginPath();
      ctx.moveTo(x - 18, ry); ctx.lineTo(x + 18, ry);
      ctx.stroke();
    }
    // platform
    ctx.fillStyle = '#5a4a6a';
    rrect(x - 22, y - 8, 44, 6, 2); ctx.fill();
    ctx.stroke();
    drawTinyCapy(x, y - 18 + climb, 7, {
      mouth: 'o',
      hatType: c.hat || 'fd',
    });
    ctx.restore();
  }

  // Sidewalk melon cart — capy vendor with watermelons.
  function drawMelonCartCapy(c) {
    const x = c.x, y = c.y;
    ctx.save();
    ctx.fillStyle = '#8c6730';
    rrect(x - 22, y + 2, 44, 10, 3); ctx.fill();
    ctx.strokeStyle = '#1a0f3a'; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#3d8f4a';
      ctx.beginPath();
      ctx.ellipse(x - 12 + i * 12, y - 2, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    drawTinyCapy(x - 30, y - 2, 7, { mouth: 'smile', hatType: 'chef' });
    ctx.fillStyle = 'rgba(26, 15, 58, 0.75)';
    rrect(x - 4, y - 22, 52, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#fff7e0';
    ctx.font = 'bold 8px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MELON  $2', x + 22, y - 16);
    ctx.restore();
  }

  // Cable car with capy passengers peeking out.
  function drawCableCarCapy(c) {
    const x = c.x, y = c.y + Math.sin(c.phase * 0.7) * 4;
    ctx.save();
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 40, y - 30); ctx.lineTo(x + 40, y - 30);
    ctx.stroke();
    ctx.fillStyle = '#d94028';
    rrect(x - 32, y - 22, 64, 28, 6); ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4ec5ff';
    rrect(x - 28, y - 18, 56, 14, 4); ctx.fill();
    drawTinyCapy(x - 14, y - 10, 5, { mouth: 'smile' });
    drawTinyCapy(x, y - 10, 5, { mouth: 'o', hatType: 'sunglasses' });
    drawTinyCapy(x + 14, y - 10, 5, { mouth: 'smile', hatType: 'party' });
    ctx.restore();
  }

  // Distant colossal capy statue silhouette.
  function drawGiantCapyStatue(c) {
    const x = c.x, y = c.y;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#2a1848';
    ctx.beginPath();
    ctx.ellipse(x, y, 55, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 70, y + 50, 140, 12);
    ctx.globalAlpha = 0.55;
    ctx.font = 'bold 11px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 247, 224, 0.5)';
    ctx.fillText('CAPY  MONUMENT', x, y - 85);
    ctx.restore();
  }

  // Paparazzi sidewalk cluster — camera flashes.
  function drawPaparazziCapy(c) {
    const x = c.x, y = c.y;
    const flash = Math.sin(c.phase * 8) > 0.6;
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const ox = x - 20 + i * 20;
      drawTinyCapy(ox, y - 6, 6, { mouth: 'o', hatType: i === 1 ? 'sunglasses' : undefined });
      ctx.fillStyle = '#1a0f3a';
      rrect(ox + 4, y + 2, 10, 6, 2); ctx.fill();
    }
    if (flash) {
      if (useLighterBlend()) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = framePerf.mobile ? 'rgba(255, 247, 224, 0.65)' : 'rgba(255, 247, 224, 0.85)';
      ctx.beginPath();
      ctx.arc(x, y - 20, framePerf.mobile ? 22 : 28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Sky confetti — tiny capy-shaped paper bits drifting down.
  function drawCapyConfetti(c) {
    const x = c.x, y = c.y;
    const spin = c.phase * 2 + c.spinOff;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.fillStyle = c.tint || '#ffd24a';
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(-2, -1, 1.5, 1);
    ctx.fillRect(1, -1, 1.5, 1);
    ctx.restore();
  }

  const SIGN_ICON_W = 32;

  // Icon column + text column — keeps mascots off the lettering.
  function drawIconTextPlate(cx, cy, w, h, plateFill) {
    rrect(cx - w / 2, cy - h / 2, w, h, 5);
    ctx.fillStyle = plateFill || '#150827';
    ctx.fill();
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 247, 224, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + SIGN_ICON_W, cy - h / 2 + 3);
    ctx.lineTo(cx - w / 2 + SIGN_ICON_W, cy + h / 2 - 3);
    ctx.stroke();
  }

  function signTextColumnCenter(cx, cy, w) {
    const bx = cx - w / 2;
    return bx + SIGN_ICON_W + (w - SIGN_ICON_W) / 2;
  }

  function signIconCenter(cx, cy, w) {
    return cx - w / 2 + SIGN_ICON_W / 2;
  }

  // Shared neon text — flickering glow for rooftops & signs.
  function drawNeonText(cx, cy, text, seed, colors, opts) {
    colors = colors || ['#ff5a8a', '#ffd24a'];
    opts = opts || {};
    let fontPx = opts.fontPx || 11;
    const maxW = opts.maxW;
    if (maxW) fontPx = fitFontSize(text, maxW, fontPx, 7);
    ctx.save();
    ctx.font = 'bold ' + fontPx + 'px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    if (framePerf.mobile) {
      if (opts.backdrop) {
        ctx.fillStyle = 'rgba(12, 6, 32, 0.88)';
        rrect(cx - tw / 2 - 5, cy - fontPx * 0.55, tw + 10, fontPx + 5, 3);
        ctx.fill();
      }
      ctx.fillStyle = colors[0];
      ctx.fillText(text, cx, cy);
      ctx.restore();
      return;
    }
    const flick = 0.65 + 0.35 * Math.abs(Math.sin(frameTime / 90 + seed * 2.1));
    const dim = (frameTime / 350 + seed * 1.7) % 2 > 1.92;
    if (opts.backdrop) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(12, 6, 32, 0.9)';
      rrect(cx - tw / 2 - 6, cy - fontPx * 0.55, tw + 12, fontPx + 6, 3);
      ctx.fill();
    }
    if (useLighterBlend()) ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = colors[0];
    ctx.shadowBlur = 14 * flick;
    ctx.fillStyle = dim ? 'rgba(90, 40, 120, 0.5)' : colors[0];
    ctx.fillText(text, cx, cy);
    ctx.shadowBlur = 6;
    ctx.fillStyle = dim ? 'rgba(40, 20, 60, 0.6)' : colors[1];
    ctx.fillText(text, cx, cy + 1);
    ctx.restore();
  }

  function drawNeonRooftopSign(c) {
    const x = c.x, y = c.y;
    const narrowWorld = framePerf.mobile || (typeof window !== 'undefined' && window.innerWidth < 520);
    const bw = narrowWorld ? 100 : 124;
    const bh = narrowWorld ? 34 : 40;
    const cy = y + 12;
    ctx.save();
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(x - 3, y, 6, 70);
    const msgs = ['CAPY SPA', 'SOAK 24/7', 'RIZZLE FM', 'HOT TUB', 'CHONK HQ'];
    const msg = (c.text && String(c.text).trim()) || msgs[Math.floor(c.phase) % msgs.length];
    const pal = c.palette || ['#4ec5ff', '#a8e6ff'];
    const textCx = signTextColumnCenter(x, cy, bw);
    const textW = bw - SIGN_ICON_W - 10;
    drawIconTextPlate(x, cy, bw, bh, '#150827');
    drawTinyCapy(signIconCenter(x, cy, bw), cy + 1, 5.5, { mouth: 'smile', hatType: 'party' });
    drawNeonText(textCx, cy + 1, msg, x * 0.01, pal, { backdrop: true, maxW: textW, fontPx: 10 });
    ctx.restore();
  }

  function drawBalconyParty(c) {
    const x = c.x, y = c.y;
    const bob = Math.sin(c.phase * 2.5) * 2;
    ctx.save();
    ctx.fillStyle = '#3b2a7a';
    rrect(x - 36, y, 72, 8, 3);
    ctx.fill();
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      drawTinyCapy(x - 20 + i * 20, y - 8 + bob, 6, {
        mouth: i === 1 ? 'o' : 'smile',
        hatType: ['party', 'melon', 'sunglasses'][i],
      });
    }
    const twinkle = (frameTime / 200 + x) % 1;
    for (let i = 0; i < 5; i++) {
      const on = (i + twinkle * 5) % 5 < 2.5;
      ctx.fillStyle = on ? '#ffd24a' : 'rgba(255,210,74,0.25)';
      ctx.beginPath();
      ctx.arc(x - 28 + i * 14, y - 16 + bob, 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (i < 4) {
        ctx.strokeStyle = 'rgba(255,247,224,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 28 + i * 14, y - 16 + bob);
        ctx.lineTo(x - 14 + i * 14, y - 16 + bob);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawSearchlightSweep(c) {
    const x = c.x, y = c.y;
    const ang = c.phase * 0.45 + (c.spinOff || 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(x, y, x + Math.cos(ang) * 220, y + Math.sin(ang) * 180);
    beam.addColorStop(0, 'rgba(255, 247, 224, 0.35)');
    beam.addColorStop(1, 'rgba(168, 230, 255, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang - 0.22) * 240, y + Math.sin(ang - 0.22) * 200);
    ctx.lineTo(x + Math.cos(ang + 0.22) * 240, y + Math.sin(ang + 0.22) * 200);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawShootingCapyStar(c) {
    const x = c.x, y = c.y;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tail = ctx.createLinearGradient(x, y, x + 70, y + 20);
    tail.addColorStop(0, 'rgba(255, 247, 224, 0.9)');
    tail.addColorStop(1, 'rgba(168, 230, 255, 0)');
    ctx.strokeStyle = tail;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 55, y - 8);
    ctx.lineTo(x, y);
    ctx.stroke();
    drawTinyCapy(x, y, 5, { mouth: 'o' });
    ctx.restore();
  }

  function drawHydrantCapy(c) {
    const x = c.x, y = c.y;
    const squirt = Math.sin(c.phase * 6) * 0.5 + 0.5;
    ctx.save();
    ctx.fillStyle = '#d94028';
    rrect(x - 8, y - 4, 16, 18, 4);
    ctx.fill();
    ctx.strokeStyle = '#1a0f3a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(x - 10, y - 8, 20, 5);
    drawTinyCapy(x, y - 14, 7, { mouth: 'smile', hatType: 'fd' });
    if (squirt > 0.4) {
      ctx.strokeStyle = 'rgba(78, 197, 255, 0.75)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 6, y - 6);
        ctx.quadraticCurveTo(x + 18 + i * 4, y - 20 - i * 3, x + 24 + i * 5, y - 8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawManholeCapy(c) {
    const x = c.x, y = c.y;
    const slide = (Math.sin(c.phase * 0.8) * 0.5 + 0.5) * 10;
    ctx.save();
    ctx.fillStyle = '#1a0f3a';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a3555';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x + Math.cos(a) * 14, y + 4 + Math.sin(a) * 5);
      ctx.stroke();
    }
    ctx.fillStyle = '#2a1848';
    ctx.beginPath();
    ctx.ellipse(x, y + 4 - slide, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawTinyCapy(x, y - 6 - slide * 0.3, 6, { mouth: 'o' });
    ctx.restore();
  }

  function drawPuddleReflection(c) {
    const x = c.x, y = c.y;
    const ripple = Math.sin(c.phase * 2) * 1.5;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#4ec5ff';
    ctx.beginPath();
    ctx.ellipse(x, y + ripple, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.scale(1, -0.65);
    drawTinyCapy(x, -(y + 8) + ripple, 5, { mouth: 'smile' });
    ctx.restore();
  }

  function drawChalkCapyArt(c) {
    const x = c.x, y = c.y;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#fff7e0';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.ellipse(x, y, 16, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    drawTinyCapy(x, y - 8, 7, { mouth: 'smile', color: 'rgba(255,247,224,0.85)' });
    ctx.font = 'bold 8px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,247,224,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('♥  RIZZLE', x, y + 6);
    ctx.restore();
  }

  function drawOrbitMiniCapy(c) {
    const x = c.x + Math.cos(c.phase * 1.2) * (c.orbitR || 28);
    const y = c.y + Math.sin(c.phase * 1.2) * (c.orbitR || 14);
    ctx.save();
    drawTinyCapy(x, y, 5, { mouth: 'smile', hatType: c.hatType });
    ctx.restore();
  }

  // Boss-scale capy skyscraper — spans ~2–3 skyline tiles (cosmetic only).
  function drawMegaCapyBuilding(anchorX, baseY, totalW, seed, opts) {
    const scale = opts.scale || 1;
    const w = totalW * scale;
    const h = (220 + tileRand(seed, 2) * 100) * scale;
    const top = baseY - h;
    const cx = anchorX + w / 2;
    const color = opts.color || '#2a1a5a';
    const win = opts.windowColor || 'rgba(255, 200, 100, 0.55)';
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(anchorX + w * 0.06, baseY);
    ctx.lineTo(anchorX + w * 0.94, baseY);
    ctx.lineTo(anchorX + w * 0.82, top + h * 0.18);
    ctx.lineTo(anchorX + w * 0.18, top + h * 0.18);
    ctx.closePath();
    ctx.fill();
    const earW = w * 0.14;
    const earH = h * 0.22;
    ctx.beginPath();
    ctx.ellipse(anchorX + w * 0.14, top + earH * 0.55, earW, earH, 0, 0, Math.PI * 2);
    ctx.ellipse(anchorX + w * 0.86, top + earH * 0.55, earW, earH, 0, 0, Math.PI * 2);
    ctx.fill();
    const blink = Math.sin(frameTime / 500 + seed) > 0.92;
    ctx.fillStyle = win;
    const eyeY = top + h * 0.38;
    const eyeW = w * 0.14;
    const eyeH = h * 0.08;
    ctx.fillRect(cx - w * 0.22, eyeY, eyeW, eyeH);
    ctx.fillRect(cx + w * 0.08, eyeY, eyeW, eyeH);
    if (blink) {
      ctx.fillStyle = color;
      ctx.fillRect(cx - w * 0.22, eyeY + eyeH * 0.35, eyeW, eyeH * 0.3);
      ctx.fillRect(cx + w * 0.08, eyeY + eyeH * 0.35, eyeW, eyeH * 0.3);
    }
    ctx.fillStyle = 'rgba(140, 103, 48, 0.55)';
    rrect(cx - w * 0.12, top + h * 0.52, w * 0.24, h * 0.06, 4 * scale);
    ctx.fill();
    const neon = opts.neon || getCostumeSeason().neon || ['#ff5a8a', '#ffd24a'];
    drawNeonText(cx, top + h * 0.08, 'MEGA  CAPY', seed, neon, { backdrop: true });
    drawNeonText(cx, top + h * 0.16, 'SOAK  HQ', seed + 3, [neon[1], neon[0]], { backdrop: true });
    const winStep = framePerf.mobile ? 2 : 1;
    for (let row = 0; row < 4; row += winStep) {
      for (let col = 0; col < 5; col += winStep) {
        if (tileRand(seed, row * 10 + col) < 0.35) continue;
        const wx = anchorX + w * 0.22 + col * (w * 0.11);
        const wy = top + h * 0.62 + row * (h * 0.07);
        if (tileRand(seed, wx + wy) > 0.55) {
          drawProceduralBlindWindow(wx, wy, w * 0.06, h * 0.04, seed + wx);
        } else {
          ctx.fillStyle = win;
          ctx.globalAlpha = 0.35 + tileRand(seed, wy) * 0.5;
          ctx.fillRect(wx, wy, w * 0.05, h * 0.035);
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();
  }

  function drawMegaCapyTowerCosmetic(c) {
    drawMegaCapyBuilding(c.x, GROUND_Y - 12, c.megaW || 520, c.megaSeed || 0, {
      color: '#2a1a5a',
      windowColor: 'rgba(255, 210, 120, 0.6)',
    });
  }

  function drawMegaCapySkyline(scroll, period, baseY, seedOff, opts) {
    const start = Math.floor(scroll / period) - 1;
    const offset = -(scroll - start * period);
    const towerW = period * 0.92;
    for (let i = 0; i < 3; i++) {
      const idx = start + i;
      if (tileRand(idx + seedOff, 66) < 0.48) continue;
      const bx = offset + i * period + period * 0.04;
      if (bx > W + 220 || bx + towerW < -220) continue;
      drawMegaCapyBuilding(bx, baseY, towerW, idx + seedOff, opts);
    }
  }

  function drawProceduralBlindWindow(wx, wy, ww, wh, seed) {
    const open = 0.45 + 0.55 * Math.sin(frameTime / 380 + seed * 8);
    ctx.fillStyle = 'rgba(255, 200, 120, 0.35)';
    ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = 'rgba(10, 6, 35, 0.75)';
    ctx.beginPath();
    ctx.ellipse(wx + ww / 2, wy + wh / 2, ww * 0.75, wh * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let sy = wy; sy < wy + wh; sy += Math.max(1.5, wh * 0.35)) {
      ctx.fillStyle = 'rgba(26, 15, 58, 0.92)';
      ctx.fillRect(wx, sy + open * 1.2, ww, Math.max(1, wh * 0.22));
    }
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
    const puffN = framePerf.mobileLite ? 5 : framePerf.mobile ? 7 : 9;
    for (let i = 0; i < puffN; i++) {
      const t = i / Math.max(1, puffN - 1);
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
        } else if (c.confetti) {
          if (c.y > GROUND_Y + 30 || c.x < -50 || c.x > W + 50) {
            c.x = Math.random() * W;
            c.y = rand(-20, 50);
            c.vx = rand(-5, 5);
            c.vy = rand(16, 34);
          }
        } else if (c.shootStar) {
          if (c.x < -120 || c.y > GROUND_Y - 40) {
            c.x = W + rand(80, 400);
            c.y = rand(30, 140);
            c.vx = -rand(160, 240);
            c.vy = rand(15, 55);
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
      const cullPad = cosmeticCullPad();
      for (const c of this.items) {
        if (c.layer !== layer) continue;
        if (c.x < -cullPad || c.x > W + cullPad) continue;
        c.draw(c);
      }
    },
  };

  // ═════════════════════════════════════════════════════════════════════
  //   AUDIO — WebAudio SFX + procedural looped soundtrack
  // ═════════════════════════════════════════════════════════════════════
  let ac = null;
  let masterBus = null;
  let sfxBus = null;
  let musicBus = null;
  let musicMuted = false;
  let musicStep = 0;
  let musicNextAt = 0;

  try { musicMuted = localStorage.getItem(MUTE_KEY) === '1'; } catch { musicMuted = false; }

  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ac = new AC();
    }
    return ac;
  }

  let html5AudioPrimed = false;
  let audioGestureUnlocked = false;

  /** Safari often needs a silent HTML5 play() in the same gesture as Web Audio. */
  function primeHtml5Audio() {
    if (html5AudioPrimed) return;
    html5AudioPrimed = true;
    try {
      const el = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      el.setAttribute('playsinline', '');
      el.volume = 0.001;
      el.muted = false;
      const p = el.play();
      if (p && typeof p.then === 'function') p.catch(() => {});
    } catch (_) {}
  }

  function hideSoundHint() {
    const hint = document.getElementById('soundHint');
    if (hint) hint.classList.add('hidden');
  }

  function setAudioSessionPlayback() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (_) {}
  }

  /** iOS needs resume + a started node in the *same* user-gesture stack. */
  function unlockAudioSync() {
    primeHtml5Audio();
    setAudioSessionPlayback();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!ac) ac = new AC();
    initAudioBuses();
    if (ac.state === 'suspended') {
      try { ac.resume(); } catch (_) { /* still try ping below */ }
    }
    if (!musicMuted) {
      if (!audioGestureUnlocked) {
        audioGestureUnlocked = true;
        try {
          const buf = ac.createBuffer(1, 1, ac.sampleRate);
          const src = ac.createBufferSource();
          src.buffer = buf;
          src.connect(masterBus || ac.destination);
          src.start(0);
          blip(523, 0.07, 'sine', 0.09, 784);
        } catch (_) {}
      }
      startSoundtrack();
      hideSoundHint();
    }
    applyAudioLevels();
    syncMuteHint();
    return ac.state === 'running' || ac.state === 'suspended';
  }

  function unlockAudioAsync() {
    unlockAudioSync();
    const c = audio();
    if (!c) return Promise.resolve(false);
    if (c.state === 'suspended') {
      return c.resume().then(() => {
        applyAudioLevels();
        if (!musicMuted) {
          startSoundtrack();
          hideSoundHint();
        }
        syncMuteHint();
        return c.state === 'running';
      }).catch(() => false);
    }
    return Promise.resolve(c.state === 'running');
  }

  function unlockAudio() {
    return unlockAudioAsync();
  }

  function syncMuteHint() {
    if (!elMuteBtn) return;
    const show = isTouchUi() && musicMuted && (mode === 'playing' || mode === 'title');
    elMuteBtn.classList.toggle('mute-needs-tap', show);
  }

  function bindAudioUnlock() {
    const prime = () => { unlockAudioSync(); };
    document.addEventListener('touchstart', prime, { capture: true, passive: true });
    document.addEventListener('touchend', prime, { capture: true, passive: true });
    document.addEventListener('pointerdown', prime, { capture: true });
    document.addEventListener('keydown', prime, { capture: true });
  }

  function initAudioBuses() {
    const c = audio();
    if (!c || masterBus) return;
    masterBus = c.createGain();
    sfxBus = c.createGain();
    musicBus = c.createGain();
    sfxBus.connect(masterBus);
    musicBus.connect(masterBus);
    masterBus.connect(c.destination);
    applyAudioLevels();
  }

  function applyAudioLevels() {
    const c = audio();
    if (!c || !masterBus) return;
    if (musicMuted) {
      masterBus.gain.setTargetAtTime(0, c.currentTime, 0.04);
      return;
    }
    masterBus.gain.setTargetAtTime(1, c.currentTime, 0.04);
    sfxBus.gain.setTargetAtTime(1.0, c.currentTime, 0.04);
    const musicVol = mode === 'playing' ? MUSIC_VOL_PLAY : MUSIC_VOL_TITLE;
    musicBus.gain.setTargetAtTime(musicVol, c.currentTime, 0.08);
  }

  function sfxDest() {
    initAudioBuses();
    return sfxBus || (audio() && audio().destination);
  }

  function blip(freq, dur, type, vol, slideTo, attack) {
    const c = audio(); if (!c || musicMuted) return;
    initAudioBuses();
    const dest = sfxDest();
    if (!dest) return;
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
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol) {
    const c = audio(); if (!c || musicMuted) return;
    initAudioBuses();
    const dest = sfxDest();
    if (!dest) return;
    const t = c.currentTime;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g); g.connect(dest);
    src.start(t); src.stop(t + dur + 0.02);
  }

  const MUSIC_BPM = 116;
  const MUSIC_STEP = 60 / MUSIC_BPM / 2;
  const MUSIC_VOL_TITLE = 0.36;
  const MUSIC_VOL_PLAY  = 0.42;
  const MUSIC_BASS = [82.4, 82.4, 73.4, 82.4, 65.4, 65.4, 73.4, 82.4];
  const MUSIC_MELODY = [329.6, 392, 440, 392, 329.6, 293.7, 329.6, 392, 440, 523.3, 440, 392];

  function playMusicNote(freq, at, dur, type, vol) {
    const c = audio();
    if (!c || musicMuted || !musicBus) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(musicBus);
    o.start(at); o.stop(at + dur + 0.04);
  }

  function tickSoundtrack() {
    if (musicMuted) return;
    const c = audio();
    if (!c) return;
    initAudioBuses();
    if (musicNextAt < c.currentTime) musicNextAt = c.currentTime + 0.04;
    const lookAhead = 0.14;
    while (musicNextAt < c.currentTime + lookAhead) {
      const step = musicStep % 32;
      if (step % 4 === 0) {
        playMusicNote(MUSIC_BASS[(step / 4) % MUSIC_BASS.length], musicNextAt, MUSIC_STEP * 3.2, 'triangle', 0.08);
      }
      if (step % 2 === 0) {
        playMusicNote(MUSIC_MELODY[step % MUSIC_MELODY.length], musicNextAt, MUSIC_STEP * 1.4, 'square', 0.024);
      }
      if (step % 16 === 0) {
        playMusicNote(164.8, musicNextAt, MUSIC_STEP * 6, 'sine', 0.016);
        playMusicNote(196, musicNextAt + 0.01, MUSIC_STEP * 6, 'sine', 0.013);
      }
      musicStep++;
      musicNextAt += MUSIC_STEP;
    }
  }

  function startSoundtrack() {
    audio();
    initAudioBuses();
    const c = audio();
    if (!c || musicMuted) return;
    if (musicNextAt < c.currentTime) musicNextAt = c.currentTime + 0.05;
  }

  function toggleMute() {
    unlockAudioAsync().then(() => {
      musicMuted = !musicMuted;
      try { localStorage.setItem(MUTE_KEY, musicMuted ? '1' : '0'); } catch {}
      applyAudioLevels();
      syncMuteButton();
      if (!musicMuted) {
        audioGestureUnlocked = true;
        blip(440, 0.08, 'sine', 0.07, 660);
        startSoundtrack();
        hideSoundHint();
      }
    });
  }

  function syncMuteButton() {
    if (!elMuteBtn) return;
    elMuteBtn.setAttribute('aria-pressed', musicMuted ? 'true' : 'false');
    elMuteBtn.setAttribute('aria-label', musicMuted ? 'Unmute sound' : 'Mute sound');
    elMuteBtn.textContent = musicMuted ? '🔇' : '🔊';
    elMuteBtn.title = musicMuted ? 'Tap to turn sound on' : 'Mute sound';
    elMuteBtn.classList.toggle('muted', musicMuted);
    syncMuteHint();
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
    scoreDist: 0,           // distance credit toward score (2× while boosting)
    score: 0,
    best: parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0,
    speed: BASE_SPEED,

    boostTime: 0,
    boosting: false,
    boostUsed: 0,           // total boost time used this run

    // run stats for the game-over screen
    firesCleared: 0,
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

    // Armor (one-hit save). Gold-star pickup; next fire hit consumes it.
    shield: false,
    shieldFlash: 0,
    armorSlots: 1,           // armor pickups allowed this run (Chrome Dino: one extra life max)

    // brief slow-mo on near-miss (timer is decremented in REAL time)
    slowMo: 0,

    // milestone tracking
    nextMilestone: MILESTONE_M,

    // Cumulative bonus pool — all scoring bonuses (near-miss, pickup,
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
    telegraphs: [],  // {text, color, x, y, life, max}
    telegraphQuietT: 0,  // suppress lane banners after act / center pops
    achievements: [],// {label, life, max} — first-time celebrations
    achUnlocked: null, // Set of unlocked achievement ids (lazy-loaded)
    everSaved: false,  // run-local flag, used by achievement test
    mood: null,        // current time-of-day mood (set by resetRun)
    costumeSeason: null, // sidewalk outfit theme (cosmetic only)

    // Wave director + anti-repetition
    wave: null,              // active WAVES entry + patternsLeft
    recentPatterns: [],    // last N pattern names (no immediate repeats)
    cleanStreak: 0,          // consecutive clean obstacle clears
    streakMul: 1,            // brief score multiplier after ON FIRE
    streakMulT: 0,
    streakFlash: 0,          // HUD pop decay
    heatTier: 0,
    surgeT: 0,
    nextSurgeAt: 45,
    particles: [],
    popups: [],

    // spawn timers
    nextObstacleDist: 900,

    // screen effects
    shake: { mag: 0, time: 0 },
    flashWhite: 0,
    freezeT: 0,
    deathT: 0,             // post-hit countdown before showing overlay
    cameraBob: 0,
    camPunch: 0,           // extra screen kick decay (cosmetic)
    runStartT: 0,          // "GO!" opener countdown
    jumpAssistLeft: 0,     // forgiving full jumps while learning
    blockSpawnUntilFirstClear: true,
    pendingFirstSpawn: true,
    obstacleSpawns: 0,
    postTrainDouble: POST_TRAIN_DOUBLE,
    lastAnnouncedPhase: 0,
    patternQueue: [],
    patternsSinceReward: 0,
    patternsSinceWater: 0,

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
  function isPointerEvent(e) {
    if (!e) return false;
    const t = e.type || '';
    return t === 'pointerdown' || t === 'mousedown' || t === 'touchstart';
  }

  function focusGameSurface() {
    if (isTouchUi() || !canvas || mode !== 'playing') return;
    try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
  }

  function press(e) {
    if (e && e.cancelable) e.preventDefault();
    unlockAudioSync();
    if (mode === 'title' || mode === 'gameover') {
      if (isPointerEvent(e) && e.target && e.target.closest && e.target.closest('.bigbtn')) return;
      startGame();
      return;
    }
    state.truck.jumpHeld = true;
    if (mode === 'playing') queueJump();
  }
  // Release a held jump early — cuts the rising velocity to JUMP_CUT_V so
  // tap = short hop, hold = full jump. Adds a real skill ceiling without
  // changing the difficulty floor.
  function release() {
    state.truck.jumpHeld = false;
    if (mode !== 'playing') return;
    // Quick tap-release was cutting jumps short during the tutorial window.
    if (!canShortHop()) return;
    const t = state.truck;
    if (!t.onGround && t.vy < JUMP_CUT_V) t.vy = JUMP_CUT_V;
  }
  canvas.addEventListener('pointerdown', press);
  elTitle.addEventListener('pointerdown', press);
  elGameOver.addEventListener('pointerdown', press);
  canvas.addEventListener('pointerup',     release);
  window.addEventListener('pointercancel', release);
  function isJumpKey(e) {
    return e && (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW');
  }

  window.addEventListener('keydown', (e) => {
    if (!isJumpKey(e)) return;
    if (mode === 'playing' || mode === 'title' || mode === 'gameover') e.preventDefault();
    if (e.repeat && mode === 'playing') {
      state.truck.jumpHeld = true;
      return;
    }
    if (e.repeat) return;
    press(e);
  }, { capture: true });
  window.addEventListener('keyup', (e) => {
    if (!isJumpKey(e)) return;
    if (mode === 'playing') e.preventDefault();
    release();
  }, { capture: true });
  function bindPlayButton(btn) {
    if (!btn) return;
    const go = (e) => {
      e.stopPropagation();
      unlockAudioSync();
      startGame();
    };
    btn.addEventListener('click', go);
    btn.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      unlockAudioSync();
    }, { passive: true });
    btn.addEventListener('touchend', (e) => {
      e.stopPropagation();
      unlockAudioAsync();
    }, { passive: true });
  }
  bindPlayButton(btnStart);
  bindPlayButton(btnRetry);
  if (elMuteBtn) {
    elMuteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      unlockAudioSync();
      toggleMute();
    });
    elMuteBtn.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      unlockAudioSync();
    }, { passive: true });
  }

  function queueJump() {
    const t = state.truck;
    if (hasJumpAssist() && t.onGround && t.crouchT <= 0) {
      actuallyJump();
      return;
    }
    if (t.onGround && t.crouchT <= 0) {
      t.crouchT = currentPhase() <= 2 ? CROUCH_TIME * 0.35 : CROUCH_TIME;
      t.pendingJump = true;
      t.squash = 0.62;
      t.stretch = 1.18;
      return;
    }
    // Already crouching this jump? Tap is no-op (don't restart the crouch).
    if (t.crouchT > 0) return;
    t.jumpBuffer = hasJumpAssist() ? 0.26 : JUMP_BUFFER;
  }
  function actuallyJump() {
    const t = state.truck;
    t.vy = JUMP_V;
    t.onGround = false;
    t.squash = 0.72;
    t.stretch = 1.30;
    const assist = hasJumpAssist();
    if (state.jumpAssistLeft > 0) state.jumpAssistLeft -= 1;
    // Short hop is a late-run skill — early taps always get full height.
    if (!assist && canShortHop() && !t.jumpHeld) t.vy = JUMP_CUT_V;
    spawnDust(t.x + TRUCK_W * 0.5, GROUND_Y, 9, '#fff7e0');
    spawnCapySpark(t.x + TRUCK_W * 0.5, GROUND_Y - 8, 3, getCostumeSeason().accent);
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
    elHud.classList.toggle('hidden', m === 'title' || m === 'gameover');
    if (elTitle) elTitle.inert = m !== 'title';
    if (elGameOver) elGameOver.inert = m !== 'gameover';
    syncUiMode();
    syncThemeHud();
    applyAudioLevels();
    if (m === 'playing') focusGameSurface();
  }

  function resetRun() {
    const tutSeen = localStorage.getItem(TUTORIAL_KEY) === '1';

    state.runTime = 0;
    state.distance = 0;
    state.scoreDist = 0;
    state.score = 0;
    state.speed = WARMUP_SPEED;

    state.boostTime = 0;
    state.boosting = false;
    state.boostUsed = 0;
    state.firesCleared = 0;
    state.watersGrabbed = 0;
    state.nearMisses = 0;
    state.shieldsGrabbed = 0;
    state.shield = false;
    state.shieldFlash = 0;
    state.armorSlots = ARMOR_PER_RUN;
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
      crouchT: 0, pendingJump: false, jumpBuffer: 0, jumpHeld: false, bob: 0,
      blinkT: rand(2, 4), blinking: 0,
    });

    state.obstacles.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.popups.length = 0;
    state.telegraphs.length = 0;
    state.telegraphQuietT = 0;
    state.achievements.length = 0;
    state.everSaved = false;
    state.achUnlocked = loadAchievements();
    state.mood = pickMood();
    state.costumeSeason = pickCostumeSeason();

    state.nextObstacleDist = 99999;
    state.pendingFirstSpawn = true;
    state.obstacleSpawns = 0;
    state.postTrainDouble = POST_TRAIN_DOUBLE;
    state.lastAnnouncedPhase = 0;
    state.patternQueue = [];
    state.patternsSinceReward = 0;
    state.patternsSinceWater = 0;
    state.jumpAssistLeft = JUMP_ASSIST_COUNT;
    state.blockSpawnUntilFirstClear = true;
    state.patternCount     = 0;
    state.recentPatterns.length = 0;
    state.cleanStreak = 0;
    state.streakMul = 1;
    state.streakMulT = 0;
    state.streakFlash = 0;
    state.heatTier = 0;
    state.surgeT = 0;
    state.nextSurgeAt = HEAT_AT[SURGE_AFTER_TIER] || 45;
    startNextWave(true);

    state.shake.mag = 0; state.shake.time = 0;
    state.flashWhite = 0;
    state.freezeT = 0;
    state.deathT = 0;
    state.cameraBob = 0;
    state.camPunch = 0;
    state.runStartT = 0;
    hudDomCache.score = -1;
    hudDomCache.combo = -1;
    hudDomCache.bestLabel = '';
    hudDomCache.boostPct = -1;
    hudDomCache.boostReadout = '';
    hudDomCache.boostReadoutMode = '';
    hudDomCache.heatLabel = '';
    hudDomCache.heatSurge = false;

    state.hint.jumpDone   = tutSeen;
    state.hint.waterDone  = tutSeen;
    state.hint.shieldDone = localStorage.getItem(TUTORIAL_KEY + '_shield') === '1';
    state.hint.jumpA     = tutSeen ? 0 : 1;
    state.hint.waterA    = tutSeen ? 0 : 1;
    state.hint.shieldA   = 0; // pops on first pickup, not on boot

    // Wipe + reseed cosmetic furniture (palette follows costume season).
    Cosmetics.clear();
    seedCosmetics();
    syncThemeHud();
    logRunTheme();
  }

  function startGame() {
    if (isTouchUi()) {
      musicMuted = false;
      try { localStorage.setItem(MUTE_KEY, '0'); } catch {}
      syncMuteButton();
    }
    unlockAudioAsync().then(() => {
      resetRun();
      state.runStartT = RUN_START_TIME;
      startSoundtrack();
      setMode('playing');
      const season = getCostumeSeason();
      if (!musicMuted) blip(520, 0.12, 'triangle', 0.05, 780);
      popup((season.emoji || '') + ' ' + season.label, W * 0.5, H * 0.32, season.accent, { big: true, life: 1.1, vy: -28 });
    });
  }

  function die(cause) {
    state.freezeT  = HIT_FREEZE;
    state.flashWhite = HIT_FLASH;
    state.deathT    = HIT_DELAY;
    state.shake.mag = Math.max(state.shake.mag, 18);
    state.shake.time = Math.max(state.shake.time, 0.45);
    state.slowMo = 0;            // never let near-miss slow-mo stretch the death sequence
    resetCombo();
    state.cleanStreak = 0;
    state.streakMul = 1;
    state.streakMulT = 0;
    const tx = state.truck.x + TRUCK_W * 0.5;
    const ty = state.truck.y + TRUCK_H * 0.35;
    spawnCrash(tx, ty);
    popup('WIPEOUT!', tx, ty - 40, '#ff5a3c', { big: true, life: 1.2, vy: -40 });
    juicePunch(0.2);
    sfx.crash();
    mode = 'dying'; // suspended state — entities frozen, particles continue
  }

  // Run rank — gives the player a clear progression target across runs.
  // Tuned against typical scores observed in playtest:
  //   distance-only 30s run        ≈    900
  //   solid jumping 60s run        ≈  5,000
  //   with boost pickups            ≈ 15,000
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
    setText(elFinalSmash, String(state.firesCleared));
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
  //   At ABS 640 + surge 1.14, cycle ≈ 1.04s → MIN_MULTI_FIRE_DX (780px).
  //   Verified by tools/playtest.mjs + tools/gap-audit.mjs.
  // All fire variants are warm-spectrum (red/orange/magenta) so they can
  // never be mistaken for the cool-blue water pickup. Previously we had a
  // 'blue' flame variant which confused players (cool-colored hazard looked
  // pickup-like) — replaced with a magenta 'ember' flame.
  const FIRE_VARIANTS = {
    // Upright hazards must read clearly at speed — short was too squat for triples.
    torch:  { w: 72, h: 118, color1: '#ff5a3c', color2: '#ffb14c', core: '#ffe9a8' },
    tall:   { w: 68, h: 132, color1: '#ff3a2a', color2: '#ffd24a', core: '#fff7e0' },
    ember:  { w: 70, h: 120, color1: '#ff3a8a', color2: '#ffb14c', core: '#ffe9a8' },
    pit:    { w: 82, h: 96,  color1: '#ff5a3c', color2: '#ffb14c', core: '#ffe9a8' },
    short:  { w: 68, h: 100, color1: '#ff8a3c', color2: '#ffd24a', core: '#fff7e0' },
  };
  const FIRE_VIS_SCALE = { 1: 1, 2: 1.12, 3: 1.22, 4: 1.28 };

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
    // ── Easy (phase 1) — tags drive wave director picks ──
    { name: 'single',      phase: 1, weight: 3, tags: ['calm', 'pressure'],
      items: [{ kind: 'fire', dx: 0, variant: 'torch' }] },
    { name: 'singleShort', phase: 1, weight: 2, tags: ['calm'],
      items: [{ kind: 'fire', dx: 0, variant: 'short' }] },
    { name: 'easyWater',   phase: 1, weight: 2, tags: ['reward', 'calm'],
      items: [{ kind: 'water', dx: 0, lift: 90 }] },
    { name: 'openRoad',    phase: 1, weight: 2, tags: ['calm', 'reward'],
      items: [{ kind: 'water', dx: 0, lift: 45 }, { kind: 'water', dx: 280, lift: 70 }] },

    // ── Medium (phase 2) ──
    { name: 'tall',       phase: 2, weight: 1, tags: ['pressure'],
      items: [{ kind: 'fire', dx: 0, variant: 'tall' }] },
    { name: 'ember',      phase: 2, weight: 1, tags: ['pressure'],
      items: [{ kind: 'fire', dx: 0, variant: 'ember' }] },
    { name: 'pit',        phase: 2, weight: 1, tags: ['pressure'],
      items: [{ kind: 'fire', dx: 0, variant: 'pit'  }] },
    { name: 'torchPair',  phase: 2, weight: 5, tags: ['pressure'],
      items: [
        { kind: 'fire', dx: 0, variant: 'torch' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'ember' },
    ]},
    { name: 'pitPair',    phase: 2, weight: 4, tags: ['pressure'],
      items: [
        { kind: 'fire', dx: 0, variant: 'pit' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'torch' },
    ]},
    { name: 'heightMix',  phase: 2, weight: 4, tags: ['pressure'],
      items: [
        { kind: 'fire', dx: 0, variant: 'torch' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'tall' },
    ]},
    { name: 'doubleWide', phase: 2, weight: 5, tags: ['pressure'],
      items: [
        { kind: 'fire', dx: 0,   variant: 'torch' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'ember' },
    ]},
    // Mid-jump water reward — water lifted to ~jump peak height
    // (truck top reaches GROUND_Y - TRUCK_H - 184 = 186; we want truck top
    // to just touch the water bottom at peak. water y = GROUND_Y - 52 - lift.
    // lift = 220 puts the water cleanly within the jump arc.)
    { name: 'jumpReward', phase: 2, weight: 2, tags: ['reward'],
      items: [
        { kind: 'fire',  dx: 0,   variant: 'torch' },
        { kind: 'water', dx: 220, lift: 120 },
    ]},
    { name: 'pitWater',   phase: 2, weight: 2, tags: ['reward'],
      items: [
        { kind: 'fire',  dx: 0,   variant: 'pit' },
        { kind: 'water', dx: 90,  lift: 60 },
    ]},
    { name: 'waterChain', phase: 1, weight: 2, tags: ['reward'],
      items: [
        { kind: 'water', dx: 0,   lift: 60 },
        { kind: 'water', dx: 200, lift: 90 },
    ]},
    { name: 'hydrant',    phase: 2, weight: 2, tags: ['reward', 'calm'],
      items: [
        { kind: 'water', dx: 0,   lift: 35 },
        { kind: 'fire',  dx: 420, variant: 'torch' },
    ]},
    { name: 'vaultLine',  phase: 2, weight: 3, tags: ['reward', 'pressure'],
      items: [
        { kind: 'fire',  dx: 0, variant: 'torch' },
        { kind: 'water', dx: 200, lift: 150 },
        { kind: 'fire',  dx: MIN_MULTI_FIRE_DX + 80, variant: 'torch' },
    ]},

    // ── Hard (phase 3) ──
    { name: 'triplePit',  phase: 3, weight: 4, tags: ['pressure', 'spectacle'],
      items: [
        { kind: 'fire', dx: 0, variant: 'torch' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'pit' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 2, variant: 'ember' },
    ]},
    { name: 'chrono',     phase: 3, weight: 4, tags: ['pressure'],
      items: [
        { kind: 'fire', dx: 0, variant: 'ember' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'tall' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 2, variant: 'torch' },
    ]},
    { name: 'triple',     phase: 3, weight: 4, tags: ['pressure', 'spectacle'],
      items: [
        { kind: 'fire', dx: 0,    variant: 'torch' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX,  variant: 'ember' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 2, variant: 'tall' },
    ]},
    { name: 'pit+tall',   phase: 3, weight: 2, tags: ['pressure'],
      items: [
        { kind: 'fire', dx: 0,   variant: 'pit' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'tall' },
    ]},
    { name: 'rewardRun',  phase: 3, weight: 1, tags: ['reward', 'spectacle'],
      items: [
        { kind: 'fire',  dx: 0,    variant: 'torch' },
        { kind: 'water', dx: 200,  lift: 130 },
        { kind: 'fire',  dx: MIN_MULTI_FIRE_DX + 80, variant: 'torch' },
    ]},
    { name: 'staccato',   phase: 3, weight: 2, tags: ['pressure', 'spectacle'],
      items: [
        { kind: 'fire', dx: 0,    variant: 'torch' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX,  variant: 'ember' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 2, variant: 'tall' },
    ]},
    { name: 'highVault',  phase: 3, weight: 2, tags: ['reward'],
      items: [
        { kind: 'water', dx: 0,   lift: 200 },
        { kind: 'fire',  dx: 360, variant: 'torch' },
    ]},
    { name: 'ironRun',    phase: 3, weight: 1, tags: ['spectacle'],
      items: [
        { kind: 'fire', dx: 0,    variant: 'torch' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX,  variant: 'tall'  },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 2, variant: 'ember' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 3, variant: 'torch' },
    ]},

    { name: 'emberDance', phase: 2, weight: 2, tags: ['reward'],
      items: [
        { kind: 'water', dx: 0,   lift: 140 },
        { kind: 'fire',  dx: 320, variant: 'ember' },
        { kind: 'water', dx: 620, lift: 80 },
    ]},
    { name: 'commit',     phase: 3, weight: 2, tags: ['pressure', 'spectacle'],
      items: [
        { kind: 'fire', dx: 0,   variant: 'torch' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'pit'  },
    ]},
    { name: 'tripleVault', phase: 3, weight: 3, tags: ['reward', 'pressure'],
      items: [
        { kind: 'fire', dx: 0, variant: 'pit' },
        { kind: 'water', dx: 200, lift: 150 },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'tall' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 2, variant: 'ember' },
    ]},
    { name: 'riverRun',   phase: 2, weight: 2, tags: ['reward', 'calm'],
      items: [
        { kind: 'water', dx: 0,   lift: 60  },
        { kind: 'water', dx: 200, lift: 100 },
        { kind: 'water', dx: 400, lift: 70  },
    ]},
    { name: 'breather',   phase: 1, weight: 2, tags: ['calm'],
      items: [
        { kind: 'fire',  dx: 0,   variant: 'short' },
        { kind: 'water', dx: 480, lift: 30  },
    ]},
    { name: 'emberWater', phase: 3, weight: 1, tags: ['reward'],
      items: [
        { kind: 'fire',  dx: 0,   variant: 'ember' },
        { kind: 'water', dx: 220, lift: 180 },
    ]},
    { name: 'gauntlet',   phase: 3, weight: 1, tags: ['spectacle'],
      items: [
        { kind: 'fire', dx: 0,    variant: 'pit'   },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX,  variant: 'tall'  },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 2, variant: 'ember' },
    ]},
    { name: 'shieldDrop', phase: 2, weight: 1, tags: ['reward'],
      items: [
        { kind: 'fire',   dx: 0,   variant: 'torch' },
        { kind: 'shield', dx: 360, lift: 130 },
        { kind: 'fire',   dx: MIN_MULTI_FIRE_DX + 120, variant: 'ember' },
    ]},
    { name: 'shieldGift', phase: 3, weight: 1, tags: ['reward', 'calm'],
      items: [{ kind: 'shield', dx: 0, lift: 110 }] },

    // ── Phase 4+ (55s+) — late-run variety ──
    { name: 'emberPit',   phase: 4, weight: 2, tags: ['pressure'],
      items: [
        { kind: 'fire', dx: 0,   variant: 'ember' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'pit'   },
    ]},
    { name: 'sirenAlley', phase: 4, weight: 2, tags: ['reward'],
      items: [
        { kind: 'water', dx: 0,   lift: 50  },
        { kind: 'water', dx: 220, lift: 90  },
        { kind: 'water', dx: 440, lift: 120 },
        { kind: 'water', dx: 660, lift: 70  },
    ]},
    { name: 'leapHold',   phase: 4, weight: 2, tags: ['pressure', 'spectacle'],
      items: [
        { kind: 'fire', dx: 0,   variant: 'tall'  },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'pit'   },
    ]},
    { name: 'fireWall',   phase: 4, weight: 3, tags: ['pressure'],
      items: [
        { kind: 'fire', dx: 0,   variant: 'torch' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'ember' },
    ]},
    { name: 'fourAlarm',  phase: 4, weight: 3, tags: ['spectacle', 'pressure'],
      items: [
        { kind: 'fire', dx: 0, variant: 'torch' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'pit' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 2, variant: 'tall' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 3, variant: 'ember' },
    ]},
    { name: 'blazeChain', phase: 4, weight: 3, tags: ['pressure'],
      items: [
        { kind: 'fire', dx: 0, variant: 'ember' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX, variant: 'torch' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 2, variant: 'pit' },
    ]},

    // ── Phase 5 (90s+) — endgame spectacle pool ──
    { name: 'infernoRun', phase: 5, weight: 1, tags: ['spectacle'],
      items: [
        { kind: 'fire', dx: 0,    variant: 'ember' },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX,  variant: 'tall'  },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 2, variant: 'pit'   },
        { kind: 'fire', dx: MIN_MULTI_FIRE_DX * 3, variant: 'torch' },
    ]},
    { name: 'megaReward', phase: 5, weight: 1, tags: ['reward'],
      items: [
        { kind: 'fire',  dx: 0,   variant: 'torch' },
        { kind: 'water', dx: 120, lift: 160 },
        { kind: 'water', dx: 340, lift: 120 },
        { kind: 'shield', dx: 560, lift: 130 },
    ]},
  ];

  function currentPhase() {
    if (state.runTime < 16) return 1;
    if (state.runTime < 36) return 2;
    if (state.runTime < 58) return 3;
    if (state.runTime < 88) return 4;
    if (state.runTime < 120) return 5;
    return 6;
  }

  function countPatternFires(p) {
    return p.items.filter((it) => it.kind === 'fire').length;
  }

  function patternIsMultiFire(p) {
    return countPatternFires(p) > 1;
  }

  function hasJumpAssist() {
    return state.jumpAssistLeft > 0 || state.runTime < JUMP_ASSIST_TIME;
  }

  function inEasyRun() {
    return state.runTime < EASY_RUN_TIME || state.obstacleSpawns < TRAINING_SPAWNS;
  }

  function canShortHop() {
    return getHeatTier() >= 3 && state.runTime >= EASY_RUN_TIME;
  }

  function runSpeedForGaps() {
    return Math.max(WARMUP_SPEED, state.speed);
  }

  function gapPxFromSeconds(lo, hi) {
    const spd = runSpeedForGaps();
    return rand(lo, hi) * spd;
  }

  function getSpawnPressure() {
    const tier = getHeatTier();
    if (tier <= 0) return 0.92;
    if (tier <= 1) return 1.0;
    if (tier <= 2) return 1.06;
    if (tier <= 3) return 1.12;
    return 1.18 + tier * 0.06;
  }

  function maxFiresForRun() {
    const phase = currentPhase();
    if (phase <= 1) return 1;
    if (phase === 2) return 2;
    if (phase === 3) return 3;
    if (phase === 4) return 4;
    return 4;
  }

  const PHASE_ACTS = {
    2: { text: 'ACT II — DOUBLE JUMPS', color: '#ff8a3c' },
    3: { text: 'ACT III — TRIPLE THREAT', color: '#ff5a3c' },
    4: { text: 'ACT IV — INFERNO ALLEY', color: '#ff3a2a' },
    5: { text: 'ACT V — MEGA CAPY', color: '#ffe24c' },
    6: { text: 'FINAL HEAT', color: '#ff5a3c' },
  };

  const ACT_PATTERN_QUEUES = {
    2: ['jumpReward', 'doubleWide', 'hydrant', 'torchPair', 'pitWater', 'heightMix', 'vaultLine', 'doubleWide'],
    3: ['rewardRun', 'triple', 'emberWater', 'tripleVault', 'chrono', 'highVault', 'triplePit', 'jumpReward', 'staccato', 'vaultLine', 'pit+tall'],
    4: ['sirenAlley', 'shieldDrop', 'fourAlarm', 'emberPit', 'leapHold', 'blazeChain', 'gauntlet', 'ironRun'],
    5: ['megaReward', 'infernoRun', 'rewardRun', 'fourAlarm', 'sirenAlley', 'blazeChain'],
    6: ['infernoRun', 'megaReward', 'ironRun', 'rewardRun', 'fourAlarm', 'staccato'],
  };

  function shufflePatternQueue(names) {
    const a = names.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function findPattern(name) {
    return PATTERNS.find((p) => p.name === name) || null;
  }

  function startActWave(phase, preferReward) {
    const def = preferReward
      ? WAVES.reward
      : (phase >= 5 ? WAVES.spectacle : WAVES.pressure);
    const queued = (ACT_PATTERN_QUEUES[phase] || []).length;
    state.wave = {
      id: def.id,
      tag: def.tag,
      gapMul: def.gapMul * (preferReward ? 1.05 : 0.92),
      patternsLeft: Math.max(queued + 1, def.patternsMin + 1),
    };
    if (preferReward) state.patternsSinceReward = 0;
    if (def.tele && state.telegraphQuietT <= 0.15) showLaneTelegraph(def.tele, def.color);
  }

  function announcePhaseIfNeeded() {
    const phase = currentPhase();
    if (phase === state.lastAnnouncedPhase) return;
    state.lastAnnouncedPhase = phase;
    const act = PHASE_ACTS[phase];
    if (act) showCenterBanner(act.text, act.color);
    if (ACT_PATTERN_QUEUES[phase]) {
      state.patternQueue = shufflePatternQueue(ACT_PATTERN_QUEUES[phase]);
      startActWave(phase, phase >= 2 && phase <= 5);
    }
  }

  function isLoneSingle(p) {
    return countPatternFires(p) === 1 && !patternHasPickup(p);
  }

  function patternGapBreathe(phase, diff) {
    if (phase === 1) return gapPxFromSeconds(GAP_SEC_EARLY[0], GAP_SEC_EARLY[1]);
    if (phase === 2) return gapPxFromSeconds(GAP_SEC_MID[0], GAP_SEC_MID[1]);
    if (diff.tier >= 4) return gapPxFromSeconds(GAP_SEC_LATE[0], GAP_SEC_LATE[1]);
    if (phase >= 3) {
      const t = clamp((diff.tier - 1) / 3, 0, 1);
      const lo = lerp(GAP_SEC_MID[0], GAP_SEC_LATE[0], t);
      const hi = lerp(GAP_SEC_MID[1], GAP_SEC_LATE[1], t);
      return gapPxFromSeconds(lo, hi);
    }
    return gapPxFromSeconds(GAP_SEC_MID[0], GAP_SEC_MID[1]);
  }

  // Heat tier — the run never plateaus; speed, gaps, and waves keep tightening.
  function getHeatTier() {
    const t = state.runTime;
    let tier = 0;
    for (let i = HEAT_AT.length - 1; i >= 0; i--) {
      if (t >= HEAT_AT[i]) { tier = i; break; }
    }
    return tier;
  }

  function getDifficultyProfile() {
    const tier = getHeatTier();
    const gapScale = Math.max(0.58, 1 - tier * 0.08);
    const comboDecayMul = 1 + tier * 0.16;
    const spawnPressure = getSpawnPressure();
    const armoredTier = tier >= 5;
    const armoredStrict = tier >= 6;
    return { tier, gapScale, comboDecayMul, spawnPressure, armoredTier, armoredStrict };
  }

  function getBoostCap() {
    return Math.max(1.6, BOOST_MAX_BASE - getHeatTier() * 0.42);
  }

  function getWaterFill() {
    const tier = getHeatTier();
    let fill = BOOST_TIME_PER * (1 - tier * 0.08);
    if (state.boostTime > 0.25) fill *= BOOST_TOPOFF_MUL;
    return Math.max(0.45, fill);
  }

  function getBoostDrainRate() {
    return BOOST_DRAIN_BASE + getHeatTier() * BOOST_DRAIN_HEAT;
  }

  function patternHasPickup(p) {
    return p.items.some((it) => it.kind === 'water' || it.kind === 'shield');
  }

  function patternFireOnly(p) {
    return p.items.every((it) => it.kind === 'fire');
  }

  function fireIsArmored(variant) {
    const d = getDifficultyProfile();
    if (!d.armoredTier) return false;
    if (d.armoredStrict) return variant !== 'pit';
    return variant === 'tall' || variant === 'ember' || variant === 'torch';
  }

  function shouldSpawnPickup(kind) {
    const tier = getHeatTier();
    const rewardWave = state.wave && state.wave.id === 'reward';
    if (kind === 'water') {
      if (rewardWave) return state.boostTime < getBoostCap() * 0.92;
      if (tier >= 5) return false;
      if (tier >= 3 && state.boostTime > getBoostCap() * 0.82) return false;
      if (tier >= 2 && state.boostTime > getBoostCap() * 0.9) return false;
      if (tier >= 3 && state.patternsSinceWater >= 3) return true;
      if (tier >= 3 && Math.random() > 0.82) return false;
    }
    if (kind === 'shield') {
      if (state.armorSlots <= 0 || state.shield) return false;
      if (rewardWave) return true;
      if (tier >= 4 && Math.random() > 0.55) return false;
      if (tier >= 3 && Math.random() > 0.7) return false;
    }
    return true;
  }

  function updateRunSpeed() {
    if (state.runTime <= WARMUP_TIME) {
      state.speed = WARMUP_SPEED;
      return;
    }
    const elapsed = state.runTime - WARMUP_TIME;
    const capElapsed = (MAX_SPEED - WARMUP_SPEED) / RAMP_PER_SEC;
    let spd;
    if (elapsed <= capElapsed) {
      spd = WARMUP_SPEED + RAMP_PER_SEC * elapsed;
    } else {
      spd = MAX_SPEED + POST_CAP_RAMP * (elapsed - capElapsed);
    }
    state.speed = Math.min(ABSOLUTE_MAX_SPEED, spd);
  }

  function patternHasTag(p, tag) {
    return (p.tags || []).indexOf(tag) >= 0;
  }

  function weightedPick(items, getWeight) {
    let total = 0;
    const ws = items.map((it) => {
      const w = Math.max(0, getWeight(it));
      total += w;
      return w;
    });
    if (total <= 0) return items[0];
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      if ((r -= ws[i]) <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // ── Wave director — each phase favors different acts (not endless calm) ──
  function startNextWave(isFirst) {
    const phase = currentPhase();
    const lastId = state.wave && state.wave.id;
    const tier = getHeatTier();

    if (isFirst || state.obstacleSpawns <= TRAINING_SPAWNS) {
      state.wave = {
        id: 'calm',
        tag: 'calm',
        gapMul: 1.18,
        patternsLeft: TRAINING_SPAWNS + (POST_TRAIN_DOUBLE ? 1 : 0),
      };
      return;
    }

    const pool = phase >= 2
      ? ['reward', 'pressure', 'spectacle']
      : ['calm', 'reward', 'pressure', 'spectacle'];
    const boostLow = state.boostTime < 2.5;
    const needsWater = state.runTime > 18 && (state.watersGrabbed === 0 || boostLow);
    const forceReward = needsWater && state.patternsSinceReward >= 3
      || state.patternsSinceReward >= 5
      || (boostLow && state.patternsSinceWater >= 4);
    const pickId = forceReward ? 'reward' : weightedPick(pool, (id) => {
      let w = 1;
      if (phase === 1) {
        if (id === 'calm') w = 4.5;
        if (id === 'reward') w = 2.2;
        if (id === 'pressure') w = 1;
        if (id === 'spectacle') w = 0;
      } else if (phase === 2) {
        if (id === 'pressure') w = 3.2;
        if (id === 'spectacle') w = 1.8;
        if (id === 'reward') w = 3.4;
      } else if (phase === 3) {
        if (id === 'pressure') w = 2.6;
        if (id === 'spectacle') w = 2.4;
        if (id === 'reward') w = 3.6;
      } else {
        if (id === 'spectacle') w = 2.8 + tier * 0.15;
        if (id === 'pressure') w = 2.6;
        if (id === 'reward') w = tier >= 5 ? 1.6 : 2.8;
      }
      if (needsWater && id === 'reward') w *= 2.8;
      if (state.boosting && state.boostTime > 4) {
        if (id === 'reward' || id === 'calm') w *= 0.35;
        if (id === 'pressure' || id === 'spectacle') w *= 1.35;
      }
      if (id === lastId) w *= 0.14;
      if (lastId === 'spectacle' && id === 'pressure') w *= 0.4;
      if (lastId === 'pressure' && id === 'reward') w *= 1.65;
      if (lastId === 'reward' && id === 'pressure') w *= 1.2;
      return w;
    });
    const def = WAVES[pickId];
    state.wave = {
      id: def.id,
      tag: def.tag,
      gapMul: def.gapMul,
      patternsLeft: rand(def.patternsMin, def.patternsMax),
    };
    if (pickId === 'reward') state.patternsSinceReward = 0;
    if (def.tele && state.telegraphQuietT <= 0.15) showLaneTelegraph(def.tele, def.color);
  }

  function minFiresForPhase(phase, waveId) {
    if (phase <= 1) return 1;
    if (phase === 2) return 2;
    if (phase >= 3 && (waveId === 'pressure' || waveId === 'spectacle')) return 3;
    if (phase >= 3) return 2;
    if (phase >= 4) return 3;
    return 2;
  }

  function applyMinFireRule(candidates, minFires, waveId) {
    if (minFires <= 1) return candidates;
    if (waveId === 'reward') {
      const rewardMix = candidates.filter(
        (p) => countPatternFires(p) >= minFires
          || (patternHasPickup(p) && countPatternFires(p) >= 1),
      );
      return rewardMix.length ? rewardMix : candidates;
    }
    const multi = candidates.filter((p) => countPatternFires(p) >= minFires);
    return multi.length ? multi : candidates;
  }

  function pickPattern() {
    const phase = currentPhase();
    const tier = getHeatTier();
    const maxFires = maxFiresForRun();
    const waveId = state.wave && state.wave.id;
    const waveTag = state.wave && state.wave.tag;

    if (state.obstacleSpawns < TRAINING_SPAWNS) {
      return findPattern('singleShort') || PATTERNS[0];
    }

    if (state.patternQueue && state.patternQueue.length) {
      const name = state.patternQueue.shift();
      const queued = findPattern(name);
      if (queued && countPatternFires(queued) <= maxFires) return queued;
    }

    let candidates = PATTERNS.filter(
      (p) => p.phase <= phase && countPatternFires(p) <= maxFires,
    );

    if (phase === 1) {
      const act1 = candidates.filter((p) => p.phase === 1 && !patternIsMultiFire(p));
      if (act1.length) candidates = act1;
    } else if (phase === 2) {
      const act2 = candidates.filter((p) => p.phase >= 2);
      if (act2.length) candidates = act2;
    } else if (phase >= 3) {
      const act3 = candidates.filter((p) => p.phase >= 3);
      if (act3.length >= 2) candidates = act3;
    }

    candidates = applyMinFireRule(candidates, minFiresForPhase(phase, waveId), waveId);

    if (waveTag && phase >= 2) {
      const tagged = candidates.filter((p) => patternHasTag(p, waveTag));
      const taggedOk = applyMinFireRule(tagged, minFiresForPhase(phase, waveId), waveId);
      if (taggedOk.length >= 2) candidates = taggedOk;
    } else if (waveTag && phase === 1) {
      const tagged = candidates.filter((p) => patternHasTag(p, waveTag));
      if (tagged.length >= 2) candidates = tagged;
    }

    if (tier >= 4 && waveId !== 'reward') {
      const lean = candidates.filter((p) => !patternHasPickup(p) || patternFireOnly(p));
      const leanOk = applyMinFireRule(lean, minFiresForPhase(phase, waveId), waveId);
      if (leanOk.length >= 3) candidates = leanOk;
    }
    if (tier >= 5 && waveId === 'pressure') {
      const hard = candidates.filter(
        (p) => patternHasTag(p, 'pressure') || patternHasTag(p, 'spectacle'),
      );
      const hardOk = applyMinFireRule(hard, Math.max(3, minFiresForPhase(phase, waveId)), waveId);
      if (hardOk.length >= 2) candidates = hardOk;
    }

    const recent = state.recentPatterns;
    const picked = weightedPick(candidates, (p) => {
      let w = p.weight;
      const fires = countPatternFires(p);
      if (recent.length && recent[recent.length - 1] === p.name) return 0;
      if (recent.indexOf(p.name) >= 0) w *= 0.18;
      if (p.phase === phase) w *= 2.6;
      else if (p.phase < phase) w *= 0.35;
      if (phase >= 2 && fires === 1 && isLoneSingle(p)) return 0;
      if (fires >= 2) w *= 3.2;
      if (fires >= 3) w *= 4;
      if (fires >= 4) w *= 5;
      if (waveTag && patternHasTag(p, waveTag)) w *= 1.5;
      if (waveId === 'reward' && patternHasPickup(p)) w *= 2.8;
      if (patternHasPickup(p) && !patternFireOnly(p)) {
        w *= state.boostTime < 2 ? 2.4 : (waveId === 'reward' ? 1.8 : 0.55);
      }
      if (state.boosting && state.boostTime > 4 && patternHasPickup(p)) w *= 0.4;
      return w;
    });

    if (phase >= 2 && countPatternFires(picked) < 2) {
      const fallback = PATTERNS.filter(
        (p) => p.phase <= phase && countPatternFires(p) >= 2 && countPatternFires(p) <= maxFires,
      );
      if (fallback.length) {
        return weightedPick(fallback, (p) => (recent[recent.length - 1] === p.name ? 0 : p.weight));
      }
    }
    return picked;
  }

  // Headline set-pieces only — keeps lane text from fighting act / training banners.
  const PATTERN_LANE_TELE = new Set([
    'gauntlet', 'ironRun', 'triple', 'triplePit', 'fourAlarm', 'infernoRun',
    'staccato', 'commit', 'blazeChain',
  ]);
  const TELEGRAPHS = {
    gauntlet:     { text: 'GAUNTLET!',  color: '#ff5a3c' },
    ironRun:      { text: 'IRON RUN!',  color: '#ff3a2a' },
    triple:       { text: 'TRIPLE!',    color: '#ff8a3c' },
    triplePit:    { text: 'TRIPLE PIT!', color: '#ff5a3c' },
    chrono:       { text: 'CHRONO!',    color: '#ff8a3c' },
    torchPair:    { text: 'DOUBLE!',    color: '#ff8a3c' },
    pitPair:      { text: 'DOUBLE!',    color: '#ff8a3c' },
    heightMix:    { text: 'HIGH LOW!',  color: '#ff8a3c' },
    doubleWide:   { text: 'DOUBLE!',    color: '#ff8a3c' },
    fourAlarm:    { text: 'FOUR ALARM!', color: '#ff3a2a' },
    blazeChain:   { text: 'BLAZE CHAIN!', color: '#ff5a3c' },
    infernoRun:   { text: 'INFERNO!',   color: '#ff3a2a' },
    rewardRun:    { text: 'REWARD!',    color: '#ffd24a' },
    shieldGift:   { text: 'ARMOR!',     color: '#ffd24a' },
    shieldDrop:   { text: 'ARMOR!',     color: '#ffd24a' },
    emberDance:   { text: 'EMBER DANCE!', color: '#ff3a8a' },
    waterChain:   { text: 'WATER CHAIN!', color: '#4ec5ff' },
    riverRun:     { text: 'RIVER!',     color: '#4ec5ff' },
    vaultLine:    { text: 'VAULT RUN!', color: '#4ec5ff' },
    commit:       { text: 'COMMIT!',    color: '#ff5a3c' },
    staccato:     { text: 'STACCATO!',  color: '#ff8a3c' },
    'pit+tall':   { text: 'PIT + TALL!', color: '#ff8a3c' },
    leapHold:     { text: 'LEAP HOLD!', color: '#ff5a3c' },
  };

  function maybeInjectReliefPickup(span, training, hadWater) {
    if (training || hadWater || state.runTime < 12) return;
    if (state.boostTime > getBoostCap() * 0.88) return;
    const tier = getHeatTier();
    const dryNeed = tier >= 2 ? 3 : 5;
    if (state.patternsSinceWater < dryNeed) return;
    if (Math.random() > 0.68) return;
    state.patternsSinceWater = 0;
    const w = 48, h = 52;
    const lift = rand(100, 175);
    state.pickups.push({
      x: W + 80 + span * 0.5 + rand(50, 180),
      y: GROUND_Y - h - lift,
      w, h,
      kind: 'water',
      phase: Math.random() * Math.PI * 2,
    });
  }

  function spawnPattern() {
    const isFirst = state.obstacleSpawns === 0;
    const training = state.obstacleSpawns < TRAINING_SPAWNS;
    let p;
    let skipSetTele = false;
    if (training) {
      p = PATTERNS.find((x) => x.name === 'singleShort') || PATTERNS[0];
    } else if (state.postTrainDouble) {
      state.postTrainDouble = false;
      p = findPattern('doubleWide') || findPattern('torchPair') || pickPattern();
      showCenterBanner('TWO FIRES — JUMP TWICE!', '#ff8a3c');
      skipSetTele = true;
    } else {
      p = pickPattern();
    }
    const trainLead = training ? (isFirst ? FIRST_FLAME_LEAD_PX : TRAINING_LEAD_PX) : 0;
    let span = 0;
    if (isFirst) {
      showCenterBanner('TAP TO JUMP!', '#ffe24c');
    } else if (training && state.telegraphQuietT <= 0.2) {
      showLaneTelegraph('JUMP!', '#ffe24c');
    } else if (!skipSetTele) {
      const tele = TELEGRAPHS[p.name];
      if (tele && PATTERN_LANE_TELE.has(p.name) && state.telegraphQuietT <= 0.2) {
        showLaneTelegraph(tele.text, tele.color);
      }
    }
    const firesInPattern = p.items.filter((it) => it.kind === 'fire');
    const fireTotal = firesInPattern.length;
    const visMul = FIRE_VIS_SCALE[Math.min(4, fireTotal)] || 1;
    let fireIndex = 0;
    let spawnedWater = false;
    for (const it of p.items) {
      const baseX = W + 80 + it.dx + trainLead;
      if (it.kind === 'fire') {
        const v = FIRE_VARIANTS[it.variant] || FIRE_VARIANTS.torch;
        const w = Math.round(v.w * visMul);
        const h = Math.round(v.h * visMul);
        state.obstacles.push({
          x: baseX,
          y: GROUND_Y - h,
          w, h,
          kind: 'fire',
          variant: it.variant || 'torch',
          phase: Math.random() * Math.PI * 2,
          passed: false,
          tutorial: training,
          fireIndex: fireIndex++,
          fireTotal,
        });
        if (it.dx + w > span) span = it.dx + w;
      } else if (it.kind === 'water') {
        if (!shouldSpawnPickup('water')) continue;
        const w = 48, h = 52;
        const lift = it.lift != null ? it.lift : rand(PICKUP_LIFT_MIN, PICKUP_LIFT_MAX);
        state.pickups.push({
          x: baseX, y: GROUND_Y - h - lift, w, h,
          kind: 'water',
          phase: Math.random() * Math.PI * 2,
        });
        spawnedWater = true;
        if (it.dx + w > span) span = it.dx + w;
      } else if (it.kind === 'shield') {
        if (!shouldSpawnPickup('shield')) continue;
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
    if (spawnedWater) state.patternsSinceWater = 0;
    else state.patternsSinceWater += 1;
    if (!training) {
      state.patternsSinceReward += 1;
      maybeInjectReliefPickup(span, training, spawnedWater);
    }
    // Track recent names so pickPattern never loops the same set-piece.
    state.recentPatterns.push(p.name);
    if (state.recentPatterns.length > 6) state.recentPatterns.shift();

    // Wave bookkeeping — when the wave ends, roll the next act.
    if (state.wave) {
      state.wave.patternsLeft -= 1;
      if (state.wave.patternsLeft <= 0) startNextWave(false);
    }

    const phase = currentPhase();
    const diff = getDifficultyProfile();
    let breathe = patternGapBreathe(phase, diff);
    const gapMul = ((state.wave && state.wave.gapMul) || 1) * diff.gapScale;
    if (state.surgeT > 0) breathe *= SURGE_GAP_MUL;
    breathe *= gapMul;
    if (training) breathe = gapPxFromSeconds(GAP_SEC_TRAIN[0], GAP_SEC_TRAIN[1]);
    if (state.wave && state.wave.id === 'calm') {
      breathe += gapPxFromSeconds(GAP_SEC_CALM[0], GAP_SEC_CALM[1]);
    }
    if (state.wave && state.wave.id === 'spectacle') breathe += gapPxFromSeconds(0.2, 0.45);
    if (diff.tier >= 4 && Math.random() < 0.14) breathe *= 0.88;
    if (diff.tier >= 5 && Math.random() < 0.12) breathe *= 0.82;
    state.obstacleSpawns += 1;
    state.patternCount = (state.patternCount || 0) + 1;
    const minGapSec = 1.35 + diff.tier * 0.1;
    const minAfterPx = minGapSec * runSpeedForGaps();
    if (isFirst || training) {
      state.nextObstacleDist = span + gapPxFromSeconds(GAP_SEC_TRAIN[0], GAP_SEC_TRAIN[1]);
      return;
    }
    state.nextObstacleDist = span + Math.max(breathe, minAfterPx);
    if (diff.tier >= 5 && Math.random() < 0.1) {
      const chainSec = 1.15 + diff.tier * 0.06;
      state.nextObstacleDist = Math.min(
        state.nextObstacleDist,
        span + chainSec * runSpeedForGaps(),
      );
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  //   PARTICLES & POPUPS
  // ═════════════════════════════════════════════════════════════════════
  function spawnDust(x, y, n, color) {
    for (let i = 0; i < particleBurst(n); i++) {
      state.particles.push({
        x: x + rand(-14, 14), y: y - 2,
        vx: rand(-220, 220), vy: -rand(20, 110),
        life: rand(0.35, 0.55), max: 0.55,
        size: rand(4, 8), color, kind: 'dust', grav: -10,
      });
    }
    trimParticles();
  }
  function spawnSpark(x, y, n, palette) {
    for (let i = 0; i < particleBurst(n); i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(180, 420);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.4, 0.7), max: 0.7,
        size: rand(3, 6), color: pick(palette), kind: 'spark', grav: 700,
      });
    }
    trimParticles();
  }
  function spawnFireFlick(x, y) {
    if (isMobilePlay() && Math.random() > 0.22) return;
    if (!isMobilePlay() && Math.random() > 0.45) return;
    state.particles.push({
      x: x + rand(-8, 8), y: y + rand(-4, 4),
      vx: rand(-30, 30), vy: -rand(70, 130),
      life: 0.5, max: 0.5,
      size: rand(4, 7), color: Math.random() < 0.5 ? '#ffb14c' : '#ff5a3c',
      kind: 'flame', grav: -100,
    });
    trimParticles();
  }
  function spawnBoostFlame() {
    for (let n = 0; n < (isMobilePlay() ? 1 : 2); n++) {
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
    trimParticles();
  }
  function spawnCapySpark(x, y, n, color) {
    const c = color || '#b4884f';
    for (let i = 0; i < particleBurst(n); i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(90, 280);
      state.particles.push({
        x: x + rand(-6, 6), y: y + rand(-6, 6),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - rand(40, 120),
        life: rand(0.45, 0.75), max: 0.75,
        size: rand(4, 7), color: c, kind: 'capy', grav: 520,
      });
    }
    trimParticles();
  }
  function spawnRing(x, y, color) {
    state.particles.push({
      x, y, vx: 0, vy: 0,
      life: 0.38, max: 0.38,
      size: 6, ringMax: rand(36, 58), color: color || '#ffe24c',
      kind: 'ring', grav: 0,
    });
    trimParticles();
  }
  function spawnWaterSplash(x, y) {
    const season = getCostumeSeason();
    const pal = season.confetti || ['#4ec5ff', '#a8e6ff', '#fff7e0'];
    spawnSpark(x, y, isMobilePlay() ? 8 : 16, pal);
    spawnCapySpark(x, y, isMobilePlay() ? 3 : 5, season.accent);
    spawnRing(x, y, season.accent);
  }
  function juicePunch(amount) {
    state.camPunch = Math.max(state.camPunch, amount);
  }
  function spawnCrash(x, y) {
    spawnSpark(x, y, isMobilePlay() ? 14 : 32, ['#ff5a3c', '#ffb14c', '#ffe24c', '#fff7e0', '#1a0f3a']);
    spawnCapySpark(x, y, isMobilePlay() ? 5 : 10, '#b4884f');
    spawnRing(x, y, '#ff5a3c');
    for (let i = 0; i < particleBurst(12); i++) {
      state.particles.push({
        x: x + rand(-10, 10), y: y - 6,
        vx: rand(-160, 160), vy: -rand(120, 260),
        life: rand(0.6, 1.0), max: 1.0,
        size: rand(8, 14), color: pick(['#1a0f3a', '#5a607a']),
        kind: 'dust', grav: 600,
      });
    }
    trimParticles();
  }
  function popup(text, x, y, color, opts) {
    opts = opts || {};
    const life = opts.life != null ? opts.life : 0.95;
    state.popups.push({
      x, y, text,
      color: color || '#fff7e0',
      life, max: life,
      vy: opts.vy != null ? opts.vy : -56,
      big: !!opts.big,
    });
    const cap = framePerf.mobile ? MAX_POPUPS.mobile : MAX_POPUPS.desktop;
    if (state.popups.length > cap) state.popups.splice(0, state.popups.length - cap);
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
        const cheer = COMBO_CHEERS[i] || 'NICE!';
        showComboPop('×' + COMBO_LEVELS[i] + '!  ' + cheer);
        const cx = state.truck.x + TRUCK_W * 0.5;
        const cy = state.truck.y - 20;
        popup(cheer, cx, cy - 30, '#ffe24c', { big: true, vy: -72 });
        spawnCapySpark(cx, cy, 8 + i * 2, getCostumeSeason().accent);
        spawnRing(cx, cy, '#ffd24a');
        state.flashWhite = Math.max(state.flashWhite, 0.06 + i * 0.02);
        shake(5 + i * 1.5, 0.14 + i * 0.02);
        juicePunch(0.08 + i * 0.02);
        blip(440 + i * 80, 0.16, 'triangle', 0.06, 880 + i * 80);
        blip(660 + i * 60, 0.08, 'sine', 0.04, 1200 + i * 40);
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

  // Centralized bonus accumulator. All score bonuses (near-miss, pickup,
  // milestone) MUST go through this — never write directly to
  // state.distance, which would inflate next-frame score and risk a
  // milestone-feedback freeze.
  function awardBonus(pts) {
    if (pts <= 0) return;
    if (state.boosting) pts *= BOOST_SCORE_MULT;
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
  //   ACHIEVEMENTS
  // ═════════════════════════════════════════════════════════════════════
  function loadAchievements() {
    try {
      const raw = localStorage.getItem(ACHIEVE_KEY);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw));
    } catch { return new Set(); }
  }
  function saveAchievements() {
    try {
      localStorage.setItem(ACHIEVE_KEY, JSON.stringify([...state.achUnlocked]));
    } catch {}
  }
  function checkAchievements() {
    if (!state.achUnlocked) return;
    for (const a of ACHIEVEMENTS) {
      if (state.achUnlocked.has(a.id)) continue;
      if (a.test(state)) {
        state.achUnlocked.add(a.id);
        saveAchievements();
        showAchievement(a.label);
      }
    }
  }
  // Achievement banner — bigger, slower, gold-bordered. Distinct from
  // telegraphs so first-time moments feel like a real reward.
  function showAchievement(label) {
    state.achievements.push({
      label, life: 2.6, max: 2.6,
    });
    // Brief celebratory blip stack.
    blip(1000, 0.10, 'triangle', 0.06, 1480);
    blip(1320, 0.16, 'sine',     0.05, 1860);
    state.flashWhite = Math.max(state.flashWhite, 0.12);
  }

  function showCenterBanner(text, color) {
    showMilestone(text);
    state.telegraphQuietT = 2.0;
    state.telegraphs.length = 0;
  }

  function showLaneTelegraph(text, color) {
    state.telegraphs.length = 0;
    state.telegraphs.push({
      text, color,
      x: W + 40, y: GROUND_Y - 248,
      life: 1.35, max: 1.35,
    });
    state.telegraphQuietT = Math.max(state.telegraphQuietT, 0.85);
  }

  function showTelegraph(text, color) {
    showLaneTelegraph(text, color);
  }
  // Debug hooks for visual verification (only when ?debug=1).
  if (/[?&]debug=1\b/.test(location.search)) {
    window.__cr_telegraph = (text, color) => {
      showTelegraph(text || 'TEST!', color || '#ff5a3c');
      return { count: state.telegraphs.length, mode };
    };
    window.__cr_mood = (id) => {
      if (MOODS[id]) { state.mood = Object.assign({ id }, MOODS[id]); return MOODS[id].label; }
      return Object.keys(MOODS);
    };
    window.__cr_season = (id) => {
      if (COSTUME_SEASONS[id]) {
        state.costumeSeason = Object.assign({ id }, COSTUME_SEASONS[id]);
        return COSTUME_SEASONS[id].label;
      }
      return Object.keys(COSTUME_SEASONS);
    };
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

    if (state.runStartT > 0) state.runStartT = Math.max(0, state.runStartT - dt);
    if (state.camPunch > 0) state.camPunch = Math.max(0, state.camPunch - dt * 2.2);

    state.runTime += dt;

    updateRunSpeed();
    state.heatTier = getHeatTier();
    announcePhaseIfNeeded();
    const diff = getDifficultyProfile();

    if (state.heatTier >= SURGE_AFTER_TIER) {
      if (state.surgeT > 0) {
        state.surgeT = Math.max(0, state.surgeT - dt);
      } else if (state.runTime >= state.nextSurgeAt) {
        state.surgeT = SURGE_DURATION;
        state.nextSurgeAt = state.runTime + SURGE_INTERVAL;
        showLaneTelegraph('RUSH!', '#ff5a3c');
        shake(6, 0.14);
        blip(180, 0.12, 'sawtooth', 0.06, 360);
      }
    }

    // Boost handling — track edge transitions so we can play a small
    // "boost ended" cue instead of silently dropping the player out.
    const wasBoosting = state.boosting;
    state.boosting = state.boostTime > 0;
    if (state.boosting) {
      state.boostTime = Math.max(0, state.boostTime - dt * getBoostDrainRate());
      state.boostUsed += dt;
      spawnBoostFlame();
    } else if (wasBoosting) {
      // boost just ran out — gentle audio + tiny dust puff
      blip(540, 0.10, 'triangle', 0.05, 240);
      blip(220, 0.16, 'sine',     0.04, 110);
      spawnDust(state.truck.x + TRUCK_W * 0.5, GROUND_Y - 6, 6, '#a8c3ff');
    }
    const surgeMul = state.surgeT > 0 ? SURGE_SPEED_MUL : 1;
    const worldSpeed = (state.boosting ? state.speed * BOOST_MULT : state.speed) * surgeMul;
    const streakScoreMul = state.streakMulT > 0 ? state.streakMul : 1;
    if (state.streakMulT > 0) {
      state.streakMulT = Math.max(0, state.streakMulT - dt);
      if (state.streakMulT <= 0) state.streakMul = 1;
    }
    const distStep = worldSpeed * dt * streakScoreMul;
    state.distance += distStep;
    state.scoreDist += distStep * (state.boosting ? BOOST_SCORE_MULT : 1);
    // score = boosted distance credit + bonuses (milestones double while boosting).
    state.score = Math.floor(state.scoreDist / 10) + state.bonusScore;

    // ── Truck physics ────────────────────────────────────────────────
    const t = state.truck;
    // Jump-input buffer decays in real time (so airborne taps within
    // JUMP_BUFFER seconds of touchdown still register).
    if (t.jumpBuffer > 0) t.jumpBuffer = Math.max(0, t.jumpBuffer - dt);
    if (framePerf.mobile && t.jumpBuffer > 0) t.jumpBuffer = Math.max(t.jumpBuffer, 0.2);

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
        const hardLand = t.stretch > 1.1 || t.squash < 0.75;
        spawnDust(t.x + TRUCK_W * 0.5, GROUND_Y, hardLand ? 18 : 10, '#e9dbb8');
        if (hardLand) {
          spawnRing(t.x + TRUCK_W * 0.5, GROUND_Y - 4, '#fff7e0');
          shake(6, 0.12);
          juicePunch(0.06);
        } else {
          shake(4, 0.10);
        }
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

    // ── Spawn timers ─────────────────────────────────────────────────
    const spawnPressure = diff.spawnPressure
      + (state.boosting ? 0.18 : 0)
      + (state.shield ? 0.12 : 0);
    if (state.pendingFirstSpawn) {
      if (state.runTime >= FIRST_SPAWN_AT) {
        spawnPattern();
        state.pendingFirstSpawn = false;
      }
    } else {
      const holdSpawn = state.blockSpawnUntilFirstClear
        && state.obstacles.some((o) => o.kind === 'fire' && !o.passed);
      if (!holdSpawn) {
        state.nextObstacleDist -= worldSpeed * dt * spawnPressure;
        if (state.nextObstacleDist <= 0) spawnPattern();
      }
    }

    // ── Move + collide obstacles ─────────────────────────────────────
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.x -= worldSpeed * dt;
      o.phase += dt * 6;
      spawnFireFlick(o.x + o.w * 0.5, o.y + 8);
      const hb = truckHitbox();
      const truckPad = o.tutorial ? 8 : 6;
      const fireInset = o.tutorial ? 22 : 10;
      const hit = aabb(
        hb.x + truckPad, hb.y + truckPad, hb.w - truckPad * 2, hb.h - truckPad * 2,
        o.x + fireInset, o.y + fireInset, o.w - fireInset * 2, o.h - fireInset * 2,
      );
      if (hit && o.tutorial && !t.onGround) {
        if (!o.passed) {
          o.passed = true;
          state.firesCleared += 1;
          addCombo(1);
          state.cleanStreak += 1;
          popup('NICE!', o.x + o.w * 0.5, o.y - 20, '#ffe24c', { life: 0.7 });
          spawnSpark(state.truck.x + TRUCK_W * 0.5, state.truck.y, 10, ['#ffe24c', '#fff7e0']);
        }
        continue;
      }
      if (hit) {
        if (state.shield) {
          // Armor save — consume charge, clear the fire, keep combo.
          state.shield = false;
          state.shieldFlash = 0.6;
          state.everSaved = true;
          state.firesCleared += 1;
          state.cleanStreak += 1;
          const pts = 15 * state.combo;
          awardBonus(pts);
          const ax = o.x + o.w / 2;
          const ay = o.y + o.h / 2;
          spawnSpark(ax, ay, 28, ['#ffd24a', '#ffe24c', '#fff7e0', '#ff5a3c']);
          spawnRing(ax, ay, '#ffd24a');
          popup('ARMOR! +' + pts, ax, o.y - 4, '#ffd24a', { big: true });
          state.flashWhite = Math.max(state.flashWhite, 0.22);
          shake(12, 0.22);
          juicePunch(0.14);
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
        if (o.tutorial) state.blockSpawnUntilFirstClear = false;
        const clearance = o.y - (state.truck.y + TRUCK_H); // px above obstacle top
        if (clearance >= 0) {
          state.firesCleared += 1;
          addCombo(1);
          state.cleanStreak += 1;
          if (state.cleanStreak > 0 && state.cleanStreak % STREAK_EVERY === 0) {
            addCombo(1);
            state.streakMul = STREAK_BONUS_MUL;
            state.streakMulT = STREAK_MUL_TIME;
            state.streakFlash = 1.1;
            const sx = state.truck.x + TRUCK_W * 0.5;
            popup('ON FIRE ×' + state.cleanStreak, sx, state.truck.y - 28, '#ffe24c', { big: true });
            spawnRing(sx, state.truck.y - 10, '#ffd24a');
            spawnCapySpark(sx, state.truck.y - 16, 8, '#ffd24a');
            shake(7, 0.18);
            juicePunch(0.09);
            blip(520 + state.cleanStreak * 8, 0.14, 'triangle', 0.07, 1040);
          }
          if (clearance < NEAR_MISS_PX) {
            state.nearMisses += 1;
            const pts = NEAR_MISS_POINTS * state.combo;
            awardBonus(pts);
            const nm = NEAR_MISS_LINES[state.nearMisses % NEAR_MISS_LINES.length];
            popup(nm + ' +' + pts, o.x + o.w * 0.5 + 14, o.y - 12, '#ffe24c', { big: true });
            const tx = state.truck.x + TRUCK_W * 0.45;
            const ty = state.truck.y + TRUCK_H * 0.5;
            spawnSpark(tx, ty, 14, ['#ffe24c', '#fff7e0', '#ffb14c', '#4ec5ff']);
            spawnCapySpark(tx, ty, 6, getCostumeSeason().accent);
            spawnRing(tx, ty, '#ffe24c');
            state.slowMo = Math.max(state.slowMo, SLOWMO_TIME);
            state.flashWhite = Math.max(state.flashWhite, 0.07);
            shake(6, 0.14);
            juicePunch(0.1);
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
          state.shieldsGrabbed += 1;
          if (state.shield || state.armorSlots <= 0) {
            const pts = 30 * state.combo;
            awardBonus(pts);
            popup('BONUS +' + pts, p.x + p.w / 2, p.y, '#ffd24a');
          } else {
            state.shield = true;
            state.armorSlots -= 1;
            popup('ARMOR!', p.x + p.w / 2, p.y, '#ffd24a');
            blip(880, 0.12, 'triangle', 0.06, 1320);
            blip(1200, 0.18, 'sine',     0.05, 1760);
            if (!state.hint.shieldDone) {
              state.hint.shieldA = 1;
              state.hint.shieldDone = true;
              try { localStorage.setItem(TUTORIAL_KEY + '_shield', '1'); } catch {}
            }
          }
          addCombo(1);
          spawnSpark(p.x + p.w / 2, p.y + p.h / 2, 22, ['#ffd24a', '#ffe24c', '#fff7e0']);
          state.flashWhite = Math.max(state.flashWhite, 0.14);
          shake(7, 0.14);
        } else {
          state.watersGrabbed += 1;
          addCombo(1);
          const cap = getBoostCap();
          const wasBoosting = state.boostTime > 0.2;
          const fill = getWaterFill();
          if (state.boostTime >= cap - 0.08) {
            const pts = 22 * state.combo;
            awardBonus(pts);
            popup('FULL +' + pts, p.x + p.w / 2, p.y, '#a8e6ff');
          } else {
            state.boostTime = Math.min(cap, state.boostTime + fill);
            const px = p.x + p.w / 2;
            const py = p.y + p.h / 2;
            spawnWaterSplash(px, py);
            popup(wasBoosting ? '+' + fill.toFixed(1) + 's' : 'BOOST!', px, py, '#a8e6ff', { big: !wasBoosting });
            state.flashWhite = Math.max(state.flashWhite, wasBoosting ? 0.04 : 0.12);
            shake(wasBoosting ? 3 : 7, 0.14);
            if (!wasBoosting) juicePunch(0.08);
            sfx.pickup(state.combo);
            if (!wasBoosting) sfx.boost();
          }
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

    // telegraph banners slide left + ease to a stop, then fade out
    for (let i = state.telegraphs.length - 1; i >= 0; i--) {
      const t = state.telegraphs[i];
      t.life -= dt;
      // ease from W+40 → ~W*0.55 over the first third, then hang there.
      const targetX = W * 0.55;
      t.x += (targetX - t.x) * Math.min(1, dt * 5.5);
      if (t.life <= 0) state.telegraphs.splice(i, 1);
    }

    // achievement banners tick down
    for (let i = state.achievements.length - 1; i >= 0; i--) {
      const a = state.achievements[i];
      a.life -= dt;
      if (a.life <= 0) state.achievements.splice(i, 1);
    }

    // First-time achievement checks (cheap — early-outs on unlocked)
    checkAchievements();

    // Combo decay — drop by 1 every COMBO_DECAY_STEP once grace expires.
    // Stops at combo 1 (never resets the run to 0, that's reserved for hits).
    if (state.combo > 1) {
      if (state.comboGrace > 0) {
        state.comboGrace = Math.max(0, state.comboGrace - dt);
      } else {
        state.comboDecayClock += dt;
        const decayStep = COMBO_DECAY_STEP / (getDifficultyProfile().comboDecayMul || 1);
        if (state.comboDecayClock >= decayStep) {
          state.comboDecayClock -= decayStep;
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
    if (state.streakFlash > 0) state.streakFlash = Math.max(0, state.streakFlash - dt * 1.2);
    if (state.telegraphQuietT > 0) state.telegraphQuietT = Math.max(0, state.telegraphQuietT - dt);

    // ── Distance milestones ──────────────────────────────────────────
    // Milestones track meters traveled (physical distance), not score.
    const distMeters = Math.floor(state.distance / 10);
    while (distMeters >= state.nextMilestone) {
      const m = state.nextMilestone;
      addCombo(1);
      const pts = Math.floor(25 * state.combo * (state.streakMulT > 0 ? state.streakMul : 1));
      awardBonus(pts);
      state.nextMilestone += MILESTONE_M;
      const special = SPECIAL_MILESTONES[m];
      const mtxt = special ? special + '  +' + pts : m.toLocaleString() + 'm — +' + pts;
      const teleBusy = state.telegraphQuietT > 0.35;
      if (!teleBusy) showMilestone(mtxt);
      else if (elMilestone) elMilestone.classList.add('hidden');
      if (!teleBusy) {
        popup(mtxt, W * 0.5, GROUND_Y - 120, '#4ec5ff', { big: true, vy: -40 });
        spawnRing(W * 0.5, GROUND_Y - 100, '#4ec5ff');
        spawnCapySpark(W * 0.5, GROUND_Y - 110, 6, '#a8e6ff');
      }
      state.flashWhite = Math.max(state.flashWhite, 0.08);
      shake(5, 0.2);
      juicePunch(0.07);
      blip(680, 0.20, 'triangle', 0.06, 1320);
    }

    // ── HUD ── (only touch DOM when values change — stops toolbar shimmer)
    syncPowerHud();
    if (hudDomCache.score !== state.score) {
      hudDomCache.score = state.score;
      setText(elScore, state.score.toLocaleString());
    }
    const bestNum = Math.max(state.best, state.score).toLocaleString();
    const bestEl = elBest;
    if (bestEl) {
      const narrow = isNarrowHud();
      const bestLabel = narrow ? bestNum : ('BEST ' + bestNum);
      if (hudDomCache.bestLabel !== bestLabel) {
        hudDomCache.bestLabel = bestLabel;
        bestEl.textContent = bestLabel;
        bestEl.title = 'Best score ' + bestNum;
      }
      bestEl.classList.toggle('best-pill--compact', narrow);
    }
    if (hudDomCache.combo !== state.combo) {
      hudDomCache.combo = state.combo;
      setText(elCombo, '×' + state.combo);
    }
    if (elCombo) {
      elCombo.classList.toggle('hot',   state.combo >= 8  && state.combo < 16);
      elCombo.classList.toggle('blaze', state.combo >= 16);
    }
    syncPlayHints();
    const narrowDock = isNarrowHud();
    if (hudDomCache.narrowDock !== narrowDock) {
      hudDomCache.narrowDock = narrowDock;
      const hudDock = document.querySelector('.hud-dock');
      if (hudDock) hudDock.classList.toggle('hud-dock--narrow', narrowDock);
    }
    if (elHeatPill) {
      const heatOn = state.heatTier >= 1 && !narrowDock;
      const heatLabel = heatOn
        ? ('HEAT ×' + state.heatTier + (state.surgeT > 0 ? ' · RUSH' : ''))
        : '';
      if (heatOn) {
        if (hudDomCache.heatLabel !== heatLabel) {
          hudDomCache.heatLabel = heatLabel;
          setText(elHeatPill, heatLabel);
        }
        if (hudDomCache.heatSurge !== (state.surgeT > 0)) {
          hudDomCache.heatSurge = state.surgeT > 0;
          elHeatPill.classList.toggle('surge', state.surgeT > 0);
        }
        elHeatPill.classList.remove('hidden');
      } else if (hudDomCache.heatLabel !== '') {
        hudDomCache.heatLabel = '';
        hudDomCache.heatSurge = false;
        elHeatPill.classList.add('hidden');
        elHeatPill.classList.remove('surge');
      }
    }

    // Beat-your-best indicator. Hidden when there's no best to chase or
    // when far from it. Appears within 80% of best, turns into a juicy
    // "NEW BEST!" pulse the moment we cross.
    if (elBestChase) {
      let chaseKey = 'hide';
      if (state.best > 0 && state.score >= state.best) {
        chaseKey = 'beat:' + Math.floor((state.score - state.best) / 25);
      } else if (state.best > 0 && state.score >= state.best * 0.8) {
        chaseKey = 'chase:' + Math.floor((state.best - state.score) / 25);
      }
      if (hudDomCache.chaseKey !== chaseKey) {
        hudDomCache.chaseKey = chaseKey;
        if (chaseKey.startsWith('beat:')) {
          elBestChase.classList.remove('hidden');
          elBestChase.classList.add('beat');
          elBestChase.textContent = 'NEW BEST  +' + (state.score - state.best).toLocaleString();
        } else if (chaseKey.startsWith('chase:')) {
          elBestChase.classList.remove('hidden');
          elBestChase.classList.remove('beat');
          elBestChase.textContent = (state.best - state.score).toLocaleString() + ' TO BEST';
        } else {
          elBestChase.classList.add('hidden');
          elBestChase.classList.remove('beat');
        }
      }
    }
  }

  function updateParticles(dt) {
    trimParticles();
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) { state.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      if (p.kind === 'ring' && p.ringMax) {
        const t = 1 - p.life / p.max;
        p.size = 6 + (p.ringMax - 6) * t;
      } else if (p.kind === 'dust') {
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
    const mobile = framePerf.mobile;
    const shakeMag = state.shake.mag;
    const shakeR = mobile ? 0 : (Math.random() - 0.5) * shakeMag;
    const punch = state.camPunch * (mobile ? 6 : 12);
    const sy = (mobile ? 0 : shakeR) + state.cameraBob
      + Math.sin(frameTime / 45) * punch;
    const sx = shakeR;
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
    drawTelegraphs();
    drawPopups();
    drawAchievements();
    drawBoostOverlay();
    drawHints();
    drawRunStartFlash();
    if (mode === 'title' || mode === 'gameover') drawTitleCapys();
    drawHudScrim();

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
    const mood = state.mood || MOODS.dusk;
    ctx.fillStyle = getSkyGradient();
    ctx.fillRect(0, 0, W, GROUND_Y);

    // Stars — slow twinkle. Procedural & deterministic so they don't pop.
    ctx.save();
    const tw = frameTime / 900;
    const starRGB = hexToRgb(mood.starTint);
    const starN = framePerf.mobileLite ? 32 : framePerf.mobile ? 52 : 70;
    for (let i = 0; i < starN; i++) {
      const sx = (i * 97.13)  % W;
      const sy = (i * 53.71)  % (GROUND_Y * 0.55);
      const tw2 = 0.4 + 0.6 * Math.abs(Math.sin(tw + i * 0.7));
      ctx.fillStyle = 'rgba(' + starRGB + ', ' + (tw2 * 0.7) + ')';
      ctx.fillRect(sx, sy, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
    }
    ctx.restore();

    // Moon — crescent with a few crater dots.
    ctx.save();
    const mcx = W * 0.74, mcy = 130, mr = 44;
    const moonRGB = hexToRgb(mood.moonTint);
    const halo = ctx.createRadialGradient(mcx, mcy, mr * 0.4, mcx, mcy, mr * 2.4);
    halo.addColorStop(0,   'rgba(' + moonRGB + ', 0.55)');
    halo.addColorStop(0.5, 'rgba(' + moonRGB + ', 0.18)');
    halo.addColorStop(1,   'rgba(' + moonRGB + ', 0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(mcx, mcy, mr * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mood.moonTint;
    ctx.beginPath(); ctx.arc(mcx, mcy, mr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(46, 25, 70, 0.78)';
    ctx.beginPath(); ctx.arc(mcx + mr * 0.32, mcy - mr * 0.05, mr * 0.92, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(180, 130, 60, 0.40)';
    ctx.beginPath(); ctx.arc(mcx - mr * 0.32, mcy - mr * 0.18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mcx - mr * 0.50, mcy + mr * 0.10, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mcx - mr * 0.18, mcy + mr * 0.35, 3, 0, Math.PI * 2); ctx.fill();
    // Silly capy face on the moon (easter egg, cosmetic only).
    ctx.globalAlpha = 0.55;
    drawTinyCapy(mcx - mr * 0.15, mcy + mr * 0.05, mr * 0.22, { mouth: 'smile' });
    ctx.globalAlpha = 1;
    ctx.restore();

    // Distant flame glow on the horizon — color shifts per mood.
    ctx.save();
    const horizonY = GROUND_Y - 14;
    const flicker = 0.78 + 0.22 * Math.sin(frameTime / 220);
    const [g1, g2, g3] = mood.glow.map(hexToRgb);
    const glow = ctx.createRadialGradient(W * 0.5, horizonY, 40, W * 0.5, horizonY, W * 0.7);
    glow.addColorStop(0,   'rgba(' + g1 + ', ' + (0.55 * flicker) + ')');
    glow.addColorStop(0.5, 'rgba(' + g2 + ', ' + (0.18 * flicker) + ')');
    glow.addColorStop(1,   'rgba(' + g3 + ', 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.fillRect(0, horizonY - 80, W, 80);
    ctx.restore();

    // Costume-season wash — makes each run's sky read differently at a glance.
    const season = getCostumeSeason();
    if (season.skyWash) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = season.skyWash;
      ctx.fillRect(0, 0, W, GROUND_Y);
      ctx.restore();
    }

    // Aurora band — soft capy-colored curtains across the sky.
    ctx.save();
    const aur = frameTime / 1400;
    const [a1, a2] = [mood.glow[1], mood.glow[0]].map(hexToRgb);
    for (let band = 0; band < 3; band++) {
      const ay = 50 + band * 45 + Math.sin(aur + band) * 12;
      const g = ctx.createLinearGradient(0, ay, W, ay + 60);
      g.addColorStop(0, 'rgba(' + a1 + ', 0)');
      g.addColorStop(0.35, 'rgba(' + a2 + ', ' + (0.12 + band * 0.04) + ')');
      g.addColorStop(0.7, 'rgba(' + a1 + ', ' + (0.08 + band * 0.03) + ')');
      g.addColorStop(1, 'rgba(' + a2 + ', 0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(0, ay - 20, W, 80);
    }
    ctx.restore();
  }
  function hexToRgb(hex) {
    const v = hex.replace('#', '');
    const n = parseInt(v.length === 3
      ? v.split('').map(c => c + c).join('')
      : v, 16);
    return ((n >> 16) & 0xff) + ', ' + ((n >> 8) & 0xff) + ', ' + (n & 0xff);
  }

  // Building palette — drawn as silhouettes against the sunset.
  // Each entry: width range, height range, roof type, window pattern.
  const BUILDING_ROOFS = [
    'flat', 'flat', 'dome', 'spire', 'water-tower', 'antenna', 'sign',
    'capy-head', 'capy-head', 'neon-capy',
  ];
  const NEON_ROOF_MSGS = ['CAPY', 'SOAK', 'RIZZ', 'SPLASH', 'CHONK', 'NAP'];

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
    const season = getCostumeSeason();
    if (framePerf.mobile) {
      drawMegaCapySkyline(scroll, TILE * 3.5, baseY, 5000, {
        color: '#2a1a5a',
        windowColor: 'rgba(255, 200, 100, 0.5)',
        neon: season.neon,
        scale: 0.62,
      });
    } else {
      drawMegaCapySkyline(scroll, TILE * 3.2, baseY, 5000, {
        color: '#2a1a5a',
        windowColor: 'rgba(255, 200, 100, 0.55)',
        neon: season.neon,
      });
    }
    const farTiles = framePerf.mobile ? 5 : 6;
    for (let i = 0; i < farTiles; i++) {
      const tileIdx = start + i;
      const tileX = offset + i * TILE;
      if (tileX > W + TILE || tileX < -TILE * 2) continue;
      drawSkylineTile(tileX, baseY, TILE, tileIdx, {
        color: '#2a1a5a',
        windowColor: 'rgba(255, 200, 100, 0.55)',
        minH: 80, maxH: 180,
        flicker: !framePerf.mobile,
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
    if (framePerf.mobile) {
      drawMegaCapySkyline(scroll, TILE * 3.6, baseY, 9000, {
        color: '#12051f',
        windowColor: 'rgba(255, 170, 80, 0.38)',
        scale: 0.55,
      });
    } else {
      drawMegaCapySkyline(scroll, TILE * 3.5, baseY, 9000, {
        color: '#12051f',
        windowColor: 'rgba(255, 170, 80, 0.4)',
        scale: 0.78,
      });
    }
    const fgTiles = framePerf.mobile ? 4 : 5;
    for (let i = 0; i < fgTiles; i++) {
      const tileIdx = start + i;
      const tileX = offset + i * TILE;
      if (tileX > W + TILE || tileX < -TILE * 2) continue;
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
    if (tileX > W + 100 || tileX < -tileW - 100) return;
    const mobile = framePerf.mobile;
    const buildingCount = mobile
      ? 2 + Math.floor(tileRand(seed, 1) * 2)
      : 3 + Math.floor(tileRand(seed, 1) * 3);
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
      if (tileRand(seed, 90 + b) > 0.78) {
        drawCapyFacadeEars(cursor, top, w, opts.color);
      }
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
            if (opts.flicker && !mobile) {
              const flickerHash = (Math.floor(wx) ^ Math.floor(wy * 31)) & 7;
              if (flickerHash === 0) a = 0.55 + 0.45 * Math.abs(Math.sin(frameTime / 300 + wx * 0.07));
            }
            if (!mobile && tileRand(seed, wx * 0.1 + wy) > 0.58) {
              ctx.globalAlpha = a;
              drawProceduralBlindWindow(wx, wy, winW, winH, seed + wx + wy);
              ctx.globalAlpha = 1;
            } else {
              ctx.globalAlpha = a;
              ctx.fillRect(wx, wy, winW, winH);
              ctx.globalAlpha = 1;
            }
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
      const blink = (frameTime / 600 + seed) % 2 < 1;
      ctx.fillStyle = blink ? '#ff5a3c' : 'rgba(255,90,60,0.25)';
      ctx.beginPath(); ctx.arc(x + w * 0.5, top - 26, 3, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'sign') {
      const msg = NEON_ROOF_MSGS[Math.floor(seed * 3) % NEON_ROOF_MSGS.length];
      if (w < 54) {
        drawNeonText(x + w / 2, top - 8, msg, seed, ['#ff5a8a', '#ffd24a'], { backdrop: true, fontPx: 8, maxW: w - 6 });
      } else {
        const pw = Math.max(56, w * 0.85);
        const pcx = x + w * 0.5;
        const pcy = top - 10;
        drawIconTextPlate(pcx, pcy, pw, 16, '#150827');
        drawNeonText(signTextColumnCenter(pcx, pcy, pw), pcy, msg, seed, ['#ff5a8a', '#ffd24a'], {
          backdrop: true, maxW: pw - SIGN_ICON_W - 4, fontPx: 9,
        });
      }
    } else if (kind === 'capy-head') {
      const ear = w * 0.2;
      ctx.beginPath();
      ctx.ellipse(x + w * 0.28, top - ear * 0.5, ear, ear * 0.75, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.72, top - ear * 0.5, ear, ear * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + w / 2, top + 2, w * 0.42, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 200, 120, 0.35)';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, top + w * 0.12, w * 0.14, w * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'neon-capy') {
      const msg = NEON_ROOF_MSGS[Math.floor(seed * 5 + 1) % NEON_ROOF_MSGS.length];
      if (w < 58) {
        drawNeonText(x + w / 2, top - 9, msg, seed + w, ['#4ec5ff', '#a8e6ff'], { backdrop: true, fontPx: 8, maxW: w - 4 });
      } else {
        const pw = Math.max(60, w * 0.88);
        const ph = 18;
        const pcx = x + w * 0.5;
        const pcy = top - 12;
        drawIconTextPlate(pcx, pcy, pw, ph, '#150827');
        drawTinyCapy(signIconCenter(pcx, pcy, pw), pcy, Math.min(4.5, w * 0.07), { mouth: 'smile' });
        drawNeonText(signTextColumnCenter(pcx, pcy, pw), pcy, msg, seed + w, ['#4ec5ff', '#a8e6ff'], {
          backdrop: true, maxW: pw - SIGN_ICON_W - 4, fontPx: 9,
        });
      }
    }
    // 'flat' is the no-op default
  }

  // Rounded "ears" on a facade — building reads as capy-shaped.
  function drawCapyFacadeEars(x, top, w, color) {
    ctx.save();
    ctx.fillStyle = color;
    const ear = Math.min(14, w * 0.18);
    ctx.beginPath();
    ctx.ellipse(x + w * 0.22, top + 6, ear, ear * 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.78, top + 6, ear, ear * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRoad() {
    const season = getCostumeSeason();
    ctx.fillStyle = season.sidewalk || '#3b2a7a';
    ctx.fillRect(0, GROUND_Y, W, 10);
    drawSidewalkChalkScroll();
    ctx.fillStyle = '#1a0f3a';
    ctx.fillRect(0, GROUND_Y + 8, W, 3);
    ctx.fillStyle = season.road || '#0a0623';
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

  // Chalk capy outlines on the curb — scrolls with the road parallax.
  function drawSidewalkChalkScroll() {
    if (isMobilePlay()) return;
    const period = 300;
    const offset = -pmod(state.bg.road * 0.9, period);
    ctx.save();
    for (let x = offset - period; x < W + period; x += period) {
      const tile = Math.floor((x + state.bg.road) / period);
      if (tile % 3 !== 0) continue;
      const cx = x + 50;
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(255, 247, 224, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(cx, GROUND_Y + 4, 14, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.45;
      drawTinyCapy(cx, GROUND_Y + 1, 6, { mouth: 'smile', color: 'rgba(200,180,255,0.9)' });
    }
    ctx.restore();
  }

  // Dark vignette above the road so ground obstacles always pop visually.
  function drawHudScrim() {
    if (mode !== 'playing' && mode !== 'dying') return;
    if (framePerf.mobile) {
      ctx.save();
      const botG = ctx.createLinearGradient(0, H - 88, 0, H);
      botG.addColorStop(0, 'rgba(10, 6, 35, 0)');
      botG.addColorStop(1, 'rgba(10, 6, 35, 0.5)');
      ctx.fillStyle = botG;
      ctx.fillRect(0, H - 88, W, 88);
      ctx.restore();
      return;
    }
    ctx.save();
    const topG = ctx.createLinearGradient(0, 0, 0, 108);
    topG.addColorStop(0, 'rgba(10, 6, 35, 0.68)');
    topG.addColorStop(1, 'rgba(10, 6, 35, 0)');
    ctx.fillStyle = topG;
    ctx.fillRect(0, 0, W, 108);
    const botG = ctx.createLinearGradient(0, H - 120, 0, H);
    botG.addColorStop(0, 'rgba(10, 6, 35, 0)');
    botG.addColorStop(1, 'rgba(10, 6, 35, 0.58)');
    ctx.fillStyle = botG;
    ctx.fillRect(0, H - 120, W, 120);
    ctx.restore();
  }

  function drawDangerVignette() {
    if (framePerf.mobileLite) return;
    ctx.save();
    const g = ctx.createLinearGradient(0, GROUND_Y - 80, 0, GROUND_Y);
    g.addColorStop(0, 'rgba(10, 6, 35, 0)');
    g.addColorStop(1, 'rgba(10, 6, 35, 0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND_Y - 80, W, 80);
    ctx.restore();
  }

  // Title / game-over — capy crowd on the curb (DOM owns the big logo text).
  function drawTitleCapys() {
    const t = frameTime / 1000;
    const season = getCostumeSeason();
    const onTitle = mode === 'title';
    ctx.save();
    ctx.globalAlpha = onTitle ? 0.38 : 0.82;
    const capyN = isMobilePlay() ? 7 : 13;
    for (let i = 0; i < capyN; i++) {
      const x = 50 + i * ((W - 100) / Math.max(1, capyN - 1));
      const bob = Math.sin(t * 3 + i * 0.7) * 3;
      const y = GROUND_Y - 22 + bob;
      const hats = ['party', 'fd', 'melon', 'sunglasses', 'party', undefined];
      drawTinyCapy(x, y - 10, 9, {
        mouth: i % 3 === 0 ? 'o' : 'smile',
        hatType: hats[i % hats.length],
      });
      if (!onTitle && i % 2 === 0) {
        ctx.strokeStyle = '#1a0f3a';
        ctx.lineWidth = 2;
        const wave = Math.sin(t * 5 + i) * 0.25;
        ctx.beginPath();
        ctx.moveTo(x + 8, y - 4);
        ctx.lineTo(x + 16 + wave * 4, y - 14);
        ctx.stroke();
      }
    }
    if (!onTitle) {
      ctx.globalAlpha = 0.9;
      drawTinyCapy(W * 0.5, GROUND_Y - 36, 16, { mouth: 'o', hatType: 'fd', color: season.sidewalk || '#b4884f' });
      ctx.font = 'bold 12px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 247, 224, 0.75)';
      ctx.fillText('RIZZLE WILL BE OK (PROBABLY)', W * 0.5, GROUND_Y - 56);
    }
    ctx.restore();
  }

  // ─── Obstacles & pickups ──────────────────────────────────────────────
  function drawObstacles() {
    for (const o of state.obstacles) {
      if (o.x + o.w < -48 || o.x > W + 48) continue;
      Sprite.draw('fire', o.x, o.y, o.w, o.h, {
        fireIndex: o.fireIndex,
        fireTotal: o.fireTotal,
        phase: o.phase,
        variant: o.variant,
        armored: fireIsArmored(o.variant),
      });
    }
  }
  function drawPickupTag(x, y, label, color) {
    ctx.save();
    ctx.font = 'bold 11px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(26, 15, 58, 0.85)';
    rrect(x - tw / 2, y, tw, 16, 5); ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(label, x, y + 12);
    ctx.restore();
  }
  function drawPickups() {
    for (const p of state.pickups) {
      if (p.x + p.w < -40 || p.x > W + 40) continue;
      const bob = Math.sin(p.phase) * 5;
      if (p.kind === 'shield') {
        drawPickupHalo(p.x + p.w / 2, p.y + p.h / 2 + bob, p.w, p.phase, '#ffd24a');
        drawShieldStar(p.x + p.w / 2, p.y + p.h / 2 + bob, p.w * 0.55, p.phase);
        drawPickupTag(p.x + p.w / 2, p.y + p.h + bob + 6, 'ARMOR', '#ffd24a');
      } else {
        drawPickupHalo(p.x + p.w / 2, p.y + p.h / 2 + bob, p.w, p.phase, '#4ec5ff');
        Sprite.draw('water', p.x, p.y + bob, p.w, p.h, { phase: p.phase });
        drawPickupTag(p.x + p.w / 2, p.y + p.h + bob + 6, 'BOOST', '#4ec5ff');
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
      const pulse = 0.7 + 0.3 * Math.sin(frameTime / 60);
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
      const now = frameTime;
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
      shield: state.shield || state.shieldFlash > 0,
      mood: (state.mood && state.mood.id) || 'dusk',
    });
    ctx.restore();
  }

  // ─── Particles & popups ───────────────────────────────────────────────
  function drawParticles() {
    for (const p of state.particles) {
      if (p.x < -32 || p.x > W + 32 || p.y < -48 || p.y > H + 48) continue;
      const a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'ring') {
        const grow = 1 - a;
        const r = p.size + (p.ringMax - p.size) * grow;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * a;
        ctx.globalAlpha = a * 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'capy') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * 1.1, p.size * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0f3a';
        ctx.fillRect(p.x - p.size * 0.35, p.y - p.size * 0.1, p.size * 0.22, p.size * 0.12);
        ctx.fillRect(p.x + p.size * 0.12, p.y - p.size * 0.1, p.size * 0.22, p.size * 0.12);
      } else if (p.kind === 'dust' || p.kind === 'flame') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
  }
  function drawTelegraphs() {
    for (const t of state.telegraphs) {
      const fade = clamp(t.life / t.max, 0, 1);
      const a = fade > 0.4 ? 1 : fade / 0.4;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'bold 24px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const labelW = ctx.measureText(t.text).width + 32;
      const chevPad = 36;
      const anchorX = Math.min(Math.max(t.x, labelW * 0.5 + 18), W - labelW * 0.5 - chevPad - 12);
      const bx = anchorX - labelW / 2;
      const by = t.y - 24;
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.6 + 0.4 * Math.sin(frameTime / 90);
      ctx.fillStyle = t.color;
      ctx.globalAlpha = a * 0.32 * pulse;
      const trailX = Math.max(anchorX + 40, bx + labelW);
      ctx.fillRect(trailX, t.y - 6, W - trailX, 12);
      ctx.globalAlpha = a;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(26, 15, 58, 0.88)';
      rrect(bx, by, labelW, 44, 10); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = t.color;
      rrect(bx, by, labelW, 44, 10); ctx.stroke();
      ctx.fillStyle = t.color;
      ctx.lineWidth = 4; ctx.strokeStyle = '#1a0f3a';
      ctx.strokeText(t.text, anchorX, t.y + 6);
      ctx.fillText(t.text, anchorX, t.y + 6);
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const cx = Math.min(bx + labelW + 10 + i * 11, W - 22);
        const wob = Math.sin(frameTime / 120 + i) * 2;
        ctx.beginPath();
        ctx.moveTo(cx,     t.y - 7 + wob);
        ctx.lineTo(cx + 6, t.y + wob);
        ctx.lineTo(cx,     t.y + 7 + wob);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  function drawAchievements() {
    if (state.achievements.length === 0) return;
    let stackY = 96;
    for (const a of state.achievements) {
      const t = a.life / a.max;
      const slideIn = clamp((1 - t) / 0.1, 0, 1);
      const fadeOut = clamp(t / (0.5 / a.max), 0, 1);
      const alpha = Math.min(slideIn, fadeOut);
      const dx = (1 - slideIn) * 60;
      const cx = W * 0.5 + dx;
      const label = '★ FIRST — ' + a.label;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 20px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const w = Math.min(W - 32, Math.max(260, ctx.measureText(label).width + 48));
      const h = 48;
      const x = cx - w / 2;
      const y = stackY;
      const grad = ctx.createLinearGradient(x, y, x + w, y);
      grad.addColorStop(0, '#ffd24a');
      grad.addColorStop(0.5, '#ffe24c');
      grad.addColorStop(1, '#ffd24a');
      ctx.shadowColor = '#ffd24a';
      ctx.shadowBlur = 18 * alpha;
      ctx.fillStyle = 'rgba(26, 15, 58, 0.92)';
      rrect(x, y, w, h, 12); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3; ctx.strokeStyle = grad;
      rrect(x, y, w, h, 12); ctx.stroke();
      ctx.fillStyle = grad;
      ctx.lineWidth = 4; ctx.strokeStyle = '#1a0f3a';
      ctx.strokeText(label, cx, y + 30);
      ctx.fillText(label, cx, y + 30);
      ctx.restore();
      stackY += h + 8;
    }
  }
  function drawPopups() {
    const narrowWorld = isMobilePlay() || (typeof window !== 'undefined' && window.innerWidth < 520);
    const maxPopW = narrowWorld ? W * 0.42 : W * 0.55;
    for (const p of state.popups) {
      const a = clamp(p.life / p.max, 0, 1);
      const pop = a < 0.85 ? 1 + (1 - a / 0.85) * (p.big ? 0.45 : 0.25) : 1;
      const basePx = p.big ? (narrowWorld ? 22 : 30) : (narrowWorld ? 16 : 22);
      const fontPx = fitFontSize(p.text, maxPopW / pop, basePx, p.big ? 14 : 11);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.scale(pop, pop);
      ctx.font = 'bold ' + fontPx + 'px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = p.big ? 5 : 4;
      ctx.strokeStyle = '#1a0f3a';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  function drawRunStartFlash() {
    if (mode !== 'playing' || state.runStartT <= 0) return;
    const t = state.runStartT;
    const season = getCostumeSeason();
    const label = t > RUN_START_TIME * 0.55 ? 'READY…' : 'GO!';
    const scale = 0.6 + (1 - t / RUN_START_TIME) * 1.1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 1.8);
    ctx.translate(W * 0.5, H * 0.36);
    ctx.scale(scale, scale);
    ctx.font = 'bold 56px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#1a0f3a';
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = label === 'GO!' ? '#ffe24c' : season.accent;
    ctx.fillText(label, 0, 0);
    if (label === 'GO!' && useLighterBlend()) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, 70, 0, Math.PI * 2);
      ctx.fillStyle = season.accent;
      ctx.fill();
      if (hasJumpAssist()) {
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.font = 'bold 20px ui-rounded, Nunito, system-ui, sans-serif';
        ctx.fillStyle = '#fff7e0';
        ctx.fillText('TAP TO JUMP', 0, 38);
        drawTinyCapy(0, 58, 10, { mouth: 'o', hatType: 'fd' });
      }
    }
    ctx.restore();
  }

  function drawBoostOverlay() {
    if (!state.boosting || framePerf.mobileLite) return;
    ctx.save();
    if (framePerf.mobile) {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = 'rgba(255, 140, 60, 0.35)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
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
    if (state.streakFlash > 0) {
      const a = clamp(state.streakFlash, 0, 1);
      const label = state.streakMulT > 0
        ? 'ON FIRE ×' + state.cleanStreak + '  +' + Math.round((state.streakMul - 1) * 100) + '%'
        : 'STREAK ×' + state.cleanStreak;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'bold 17px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width + 28;
      const bx = W * 0.5 - tw / 2;
      const by = 54;
      ctx.fillStyle = 'rgba(26, 15, 58, 0.82)';
      rrect(bx, by, tw, 32, 8); ctx.fill();
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2;
      rrect(bx, by, tw, 32, 8); ctx.stroke();
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(label, W * 0.5, by + 22);
      ctx.restore();
    }
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
      drawFirePitSprite(x, y, w, h, phase, v, opts);
    } else {
      drawFlameSprite(x, y, w, h, phase, v, variant, opts);
    }
  });

  function drawFlameSprite(x, y, w, h, phase, v, variant, opts) {
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
    if (opts && opts.armored) {
      ctx.strokeStyle = '#8ec5ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 4]);
      rrect(x + 5, y + 6, w - 10, h - 12, 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 10px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8ec5ff';
      ctx.fillText('JUMP', x + w / 2, y + 16);
    }
    if (opts && opts.fireTotal >= 2 && opts.fireIndex != null) {
      const labels = ['①', '②', '③', '④'];
      const label = labels[opts.fireIndex] || String(opts.fireIndex + 1);
      ctx.font = 'bold 18px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1a0f3a';
      ctx.fillStyle = '#ffe24c';
      ctx.strokeText(label, x + w / 2, y - 10);
      ctx.fillText(label, x + w / 2, y - 10);
    }
    ctx.restore();
  }

  function drawFirePitSprite(x, y, w, h, phase, v, opts) {
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
      const flameH = 44 + Math.sin(phase * 1.4 + i) * 6;
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
    // Silly capy eyes peeking from the pit (center flame only).
    if (count >= 2) {
      const mid = x + w / 2;
      const peek = 0.5 + 0.5 * Math.sin(phase * 2.1);
      ctx.globalAlpha = 0.55 + peek * 0.35;
      drawTinyCapy(mid, y + h - 22, Math.min(5, w * 0.08), {
        mouth: peek > 0.85 ? 'o' : 'smile',
        eyeOffset: Math.sin(phase * 3) * 0.5,
      });
      ctx.globalAlpha = 1;
    }
    if (Math.sin(phase * 0.7) > 0.92) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(200, 200, 220, 0.6)';
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y - 8, w * 0.25, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (opts && opts.armored) {
      ctx.strokeStyle = '#8ec5ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 4]);
      rrect(x + 4, y + 4, w - 8, h - 8, 6);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (opts && opts.fireTotal >= 2 && opts.fireIndex != null) {
      const labels = ['①', '②', '③', '④'];
      const label = labels[opts.fireIndex] || String(opts.fireIndex + 1);
      ctx.font = 'bold 18px ui-rounded, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1a0f3a';
      ctx.fillStyle = '#ffe24c';
      ctx.strokeText(label, x + w / 2, y - 10);
      ctx.fillText(label, x + w / 2, y - 10);
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
    // capy peeking over the rim
    drawTinyCapy(x + w / 2, y + 8, w * 0.14, { mouth: 'smile' });
    ctx.fillStyle = '#1a0f3a';
    ctx.font = 'bold 9px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SPLASH', x + w / 2, y + h - 8);
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
    const now = frameTime;

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
    // "FD" decal on tank + hero nameplate
    ctx.fillStyle = '#fff7e0';
    ctx.font = 'bold 16px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FD', x + w * 0.42, y + h * 0.48);
    ctx.font = 'bold 9px ui-rounded, Nunito, system-ui, sans-serif';
    ctx.fillStyle = '#ffd24a';
    ctx.fillText('RIZZLE-1', x + w * 0.42, y + h * 0.38);
    // rubber duck mascot on the ladder
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.58, y + 20, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w * 0.59, y + 18, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8a3c';
    ctx.fillRect(x + w * 0.6, y + 18, 2, 1);
    // copilot capy peeking in rear window (tank side)
    ctx.globalAlpha = 0.85;
    drawTinyCapy(x + w * 0.12, y + 42, 7, { mouth: 'o', hatType: 'melon' });
    ctx.globalAlpha = 1;

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
    drawRizzle(capCx, capCy, 38, {
      blink,
      arm: 'wheel',
      boost,
      shield: !!opts.shield,
      moodId: opts.mood || 'dusk',
    });

    if (boost) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(78, 197, 255, 0.55)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const a = now / 180 + i * 1.2;
        ctx.beginPath();
        ctx.moveTo(capCx - 8, capCy + 20);
        ctx.quadraticCurveTo(
          capCx + Math.cos(a) * 28, capCy + 30 + Math.sin(a) * 10,
          capCx + 20 + i * 4, capCy + 55
        );
        ctx.stroke();
      }
      ctx.restore();
    }

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
    if (opts.shield) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.6 + 0.4 * Math.sin(frameTime / 120);
      ctx.fillStyle = 'rgba(255, 226, 76, ' + pulse + ')';
      ctx.beginPath();
      ctx.arc(cx, cy - s * 1.05, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (opts.moodId === 'night') {
      ctx.fillStyle = '#4ec5ff';
      ctx.fillRect(cx - s * 0.55, cy + s * 0.35, s * 1.1, s * 0.12);
    } else if (opts.moodId === 'inferno') {
      ctx.fillStyle = '#ff5a3c';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.5, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (opts.boost) {
      ctx.strokeStyle = 'rgba(168, 230, 255, 0.8)';
      ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.5, cy + s * 0.2);
      ctx.quadraticCurveTo(cx - s * 0.9, cy + s * 0.5, cx - s * 0.7, cy + s * 0.95);
      ctx.stroke();
    }

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
  //   MAIN LOOP
  // ═════════════════════════════════════════════════════════════════════
  let lastT = performance.now();
  function frame(now) {
    refreshFrameClock(now);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.05) dt = 0.05;
    trackMobileFps(dt);
    // slow-mo: gameplay dt is scaled down, but slowMo timer decrements in real time.
    // Only applies while actively playing — never extends death/freeze windows.
    let gameDt = dt;
    if (state.slowMo > 0) {
      state.slowMo = Math.max(0, state.slowMo - dt);
      if (mode === 'playing') gameDt = dt * SLOWMO_FACTOR;
    }
    try {
      tickSoundtrack();
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
  syncMuteButton();
  syncUiMode();
  bindAudioUnlock();
  window.addEventListener('resize', syncUiMode);
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      syncUiMode();
      if (mode === 'title') {
        Cosmetics.clear();
        seedCosmetics();
      }
    }, 120);
  });
  requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
})();
