# CapyRizzle Rush

A one-button hand-drawn endless racer starring Rizzle, the fire-chief capybara, hauling his firetruck through a burning city.

Built for [CapyJam 2026](https://x.com/_summer_plays_) — submissions open May 28, deadline June 11.

## Controls
- **Space / Tap** — jump
- **Hold** — siren boost (drains the meter; pick up water buckets to refill)

## Tech
- Single static page: `index.html` + `game.js` + `style.css`
- Canvas 2D, no framework, no build step
- WebAudio for SFX, `localStorage` for high score

## Local play
```bash
python3 -m http.server 5777
# open http://127.0.0.1:5777/
```

## Ownership
The game is owned by Rizzle, declared via `<meta name="game:owner" content="rizzle" />` in `index.html`.
