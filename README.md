# CapyRizzle Rush

A one-button endless racer starring **Rizzle**, the fire-chief capybara, hauling his firetruck through a burning city. Built for **[CapyJam 2026](https://x.com/_summer_plays_)** — submissions open May 28, deadline **June 11, 2026**.

## Play (browser)

Open the hosted game URL (GitHub Pages or your deploy) — **no download, no login, no wallet.**

Local dev:

```bash
python3 serve.py 5777
# http://127.0.0.1:5777/
```

`serve.py` sends `Cache-Control: no-store` so refreshes always pick up edits.

## Controls

- **Space / Tap / Click** — jump (clear every fire)
- Early runs get **full-height jump assist**; short-hop is a late-run skill
- **BOOST** (blue bucket) — speed burst + 2× score; you still must jump fires
- **ARMOR** (gold star) — blocks one hit per run

## Scoring

Score = distance + bonuses (near-miss, pickups, milestones, combo). Combo builds to ×20. Distance milestones every 250m.

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
git remote add origin git@github.com:<you>/capyrizzle-rush.git
git push -u origin main
# Repo → Settings → Pages → branch `main` / root
# Playable URL: https://<you>.github.io/capyrizzle-rush/
```

Submit that **root URL** on the jam form (not an embed iframe).

## Tech

- Canvas 2D, no framework, no build step (~230 KB total)
- WebAudio SFX + procedural soundtrack (🔊 mute in-game), `localStorage` for best/high score, tutorial, mute
- Cosmetic layer separated from gameplay (see header comment in `game.js`)

## Tests

```bash
node tools/playtest-all.mjs
```

Validates jump math at all speed tiers, gap spacing, and progression curve.

## Debug

Append `?debug=1` for build tag + live state (fps, speed, obstacles).

## Ownership

Game owned by Rizzle — `game:owner` meta in `index.html`.
