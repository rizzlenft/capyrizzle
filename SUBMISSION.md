# CapyJam 2026 — submission runbook

Use this the day you ship. Official rules from the jam announcement are summarized here.

## Theme fit (why this entry qualifies)

- **Capybara:** Rizzle (fire-chief capy) drives the truck; city is full of capy NPCs, murals, mega capy buildings.
- **Racing:** Endless forward sprint against **time + distance + score** (broad “racing” interpretation).
- **Vibe coded:** Procedural canvas sprites, neon signs, seasons/moods — no external asset pack.

## Before you click “Submit game”

### P0 — blockers

- [ ] **Public URL** live (e.g. `https://<user>.github.io/capyrizzle-rush/`)
- [ ] Open URL in **incognito** — title → PLAY → one full run → game over
- [ ] **Sound** works after first tap (iOS Safari if possible); **🔊 mute** toggles off/on
- [ ] **Mobile** — portrait/landscape; tap to jump on phone
- [ ] Jam page submission filled with **direct link** (not iframe embed only)
- [ ] `index.html` still has `<meta name="game:owner" content="rizzle" />`

### P1 — strong submission

- [ ] **15–60s gameplay video** for X (best run or funny wipeout)
- [ ] Post on X tagging **`@_summer_plays_`** and **`#capyjam`**
- [ ] Title screen clearly says **CapyJam 2026** (already in-game)
- [ ] One-line pitch ready: *“One-button capy firetruck endless rush — jump every fire, boost the city.”*
- [ ] `node tools/playtest-all.mjs` exits 0
- [ ] Commit & push final build (note `BUILD` string in console / `?debug=1`)

### P2 — polish (if time)

- [ ] Screenshots: title, mid-run HUD, game over rank *(you said you’ll capture these)*
- [ ] Gameplay clip for X *(you said you’ll record)*
- [ ] Optional favicon / social preview image
- [ ] README URL matches live deploy

## What judges experience in ~30 seconds

1. Live scrolling city + capy crowd on title (good first impression).
2. Tap PLAY → READY/GO → first fire teachable with jump assist.
3. One BOOST pickup shows speed + 2× without breaking jump rules.
4. Death → rank + stats → instant retry.

## Known non-issues

- No npm build required (static files are the product).
- `server.log` is gitignored dev noise.
- Debug HUD hidden unless `?debug=1`.

## Deadline

**June 11, 2026** — allow time for deploy + one mobile check the night before.
