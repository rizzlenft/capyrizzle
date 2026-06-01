# CapyRizzle Rush

A one-button endless racer starring Rizzle, the fire-chief capybara,
hauling his firetruck through a burning city.

Built for [CapyJam 2026](https://x.com/_summer_plays_) — submissions
open May 28, deadline June 11.

## Controls

- **Space / Tap** — jump
- Grab WATER buckets to charge the SIREN — while it's burning, the
  truck is invincible and SMASHES through fires for combo points.

## Scoring

Score = meters traveled + bonuses (smash, near-miss, pickup, milestone).
Bonuses scale with your combo (max ×20). Distance milestones fire every
250m for celebratory points.

Runs get a rank at game over:

| Rank | Score      |
|------|-----------:|
| D    |       0+   |
| C    |   5,000+   |
| B    |  15,000+   |
| A    |  40,000+   |
| S    | 100,000+   |

## Tech

- Single static page: `index.html` + `game.js` + `style.css`
- Canvas 2D, no framework, no build step
- WebAudio for SFX, `localStorage` for high score + first-run tutorial

## Local play

```bash
python3 serve.py 5777
# open http://127.0.0.1:5777/
```

The bundled `serve.py` sends `Cache-Control: no-store` headers so
edits show up on a normal refresh (no hard-reload required).

## Debug HUD

Append `?debug=1` to the URL for a live state pill (build, fps, mode,
truck position, speed, freeze/death/slow-mo timers, obstacle count).

## Tests

```bash
node tools/playtest.mjs
```

Deterministically validates every obstacle pattern at every speed,
verifies water pickups are reachable at jump apex, and runs 50 random
scoring sims to surface any runaway loops. Keep it green.

## Deploy (GitHub Pages)

```bash
git remote add origin git@github.com:<you>/capyrizzle-rush.git
git push -u origin main
# In repo Settings → Pages: deploy from branch `main` / `/ (root)`.
```

## Ownership

Game is owned by Rizzle, declared via
`<meta name="game:owner" content="rizzle" />` in `index.html`.
