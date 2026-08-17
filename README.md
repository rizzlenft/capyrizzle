# CapyRizzle Rush

Play in the browser: [rizzlenft.github.io/capyrizzle](https://rizzlenft.github.io/capyrizzle/) — no download, no login, no wallet.

A one-button endless racer starring **Rizzle**, the fire-chief capybara, hauling his firetruck through a burning city. Built for **[CapyJam 2026](https://x.com/_summer_plays_)**.

## Play locally

```bash
python3 serve.py 5777
# http://127.0.0.1:5777/
```

`serve.py` sends `Cache-Control: no-store` so refreshes always pick up edits.

## Controls

- **Tap / Click** — jump (clear every fire)
- Early runs get **full-height jump assist**; short-hop is a late-run skill
- **BOOST** (blue bucket) — faster truck + 2× points; you still must jump fires
- **ARMOR** (gold star) — blocks one hit per run

## Difficulty curve (how a run ramps)

Difficulty stacks **five layers** that all tighten over time:

| Layer | What changes | When |
|-------|----------------|------|
| **Speed** | 300 px/s flat → +8/s to 480 → +7/s to 640 cap | 0–5s flat, then ramp; max ~60s |
| **Heat tier** | 7 steps (HUD `HEAT ×n`) — gaps shrink, combo decays faster, fewer pickups | 32s, 50s, 70s, 92s, 118s, 150s |
| **Phase** | Pattern pool unlocks (1→6) | 16s / 36s / 58s / 88s / 120s |
| **Waves** | Reward → pressure → spectacle blocks; forced reward if boost dry | After training; shuffled act queues |
| **Surge** | +14% speed, tighter gaps for 6s | Every 16s from heat tier 4 (~92s) |

**Teaching window:** first spawn @ 3.8s, 4 training singles, then **TWO FIRES — JUMP TWICE!** Each act opens on a **REWARD RUN** (water/armor), then shuffled set-pieces. **Act II (16s)** doubles; **Act III (36s)** triples with readable fire sizes + ①②③ labels; **Act IV (58s)** four-fire spectacle. Relief water injects if you go several patterns without a bucket. All patterns respect `MIN_MULTI_FIRE_DX` (780px) at max speed + surge.

```bash
node tools/playtest-all.mjs         # jump math + gaps + progression + fires + release audit
node tools/release-audit.mjs        # DOM wiring + deploy artifacts only
```

## Scoring

Score = distance + bonuses (near-miss, pickups, milestones, combo). Combo builds to ×20. Distance milestones every 250m. **Boost** = faster truck + 2× distance points and bonus points while active.

| Rank | Score   |
|------|--------:|
| D    |      0+ |
| C    |  5,000+ |
| B    | 15,000+ |
| A    | 40,000+ |
| S    | 100,000+ |

## CapyJam checklist

| Requirement | Status |
|-------------|--------|
| Capybara featured | Rizzle + crowd/world capys |
| Racing format (clock / distance) | Endless sprint vs. score & rank |
| Mostly vibe coded | Procedural canvas art + WebAudio |
| Own the game | `<meta name="game:owner" content="rizzle" />` |
| Web, browser, free | Static `index.html` + `game.js` + `style.css` |
| Public playable link | **Deploy before submit** (see below) |
| No iframe-only wrapper | Link directly to your `index.html` URL |
| Official submit on jam page | Use host **“Submit game”** (not X alone) |
| X promo | Short gameplay clip + `@_summer_plays_` + `#capyjam` |

## Deploy (GitHub Pages)

```bash
git remote add origin https://github.com/rizzlenft/capyrizzle.git
git push -u origin main
# Actions deploys to gh-pages branch (see .github/workflows/pages.yml)
# Repo → Settings → Pages → Deploy from branch → gh-pages / (root)
# Play: https://rizzlenft.github.io/capyrizzle/
```

Submit that **root URL** on the jam form (not an embed iframe).

## Tech

- Canvas 2D, no framework, no build step (~245 KB total)
- WebAudio SFX + procedural soundtrack (🔊 mute in-game), `localStorage` for best/high score, tutorial, mute
- Cosmetic layer separated from gameplay (see header comment in `game.js`)

## Tests

```bash
node tools/playtest-all.mjs
```

Validates jump math at all speed tiers, gap spacing, progression curve, fire readability, and pre-ship wiring.

## Debug

Append `?debug=1` for build tag + live state (fps, speed, obstacles).

## Ownership

Game owned by Rizzle — `game:owner` meta in `index.html`.
