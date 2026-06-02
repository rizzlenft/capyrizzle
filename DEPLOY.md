# Deploy CapyRizzle Rush (GitHub Pages)

Do this once before the CapyJam form. Estimated time: ~10 minutes.

## 1. Commit

```bash
cd /Users/rizzle/Projects/capyrizzle-rush
git add index.html style.css game.js README.md SUBMISSION.md DEPLOY.md tools/
git commit -m "CapyJam submit-ready: billboards, soundtrack, mute, docs"
```

## 2. Create GitHub repo & push

On github.com: **New repository** → name `capyrizzle-rush` → Public → no template.

```bash
git remote add origin https://github.com/rizzlenft/capyrizzle.git
git push -u origin main
```

## 3. Enable Pages

**Option A — GitHub Actions (recommended, already in repo)**

Repo → **Settings** → **Pages** → Build and deployment → Source: **GitHub Actions**.

The workflow `.github/workflows/pages.yml` runs on every push to `main`. First deploy takes ~2 min.

**Option B — Branch deploy**

Settings → Pages → Source: **Deploy from branch** → `main` / `/ (root)`.

Playable URL (either option):

`https://<YOUR_USER>.github.io/capyrizzle-rush/`

## 4. Verify (incognito)

- Title → PLAY → full run → game over
- 🔊 mute toggles music + SFX; refresh remembers preference
- Billboards show readable text (no blank tan boards)
- `?debug=1` shows build `v23.0-submit-ready`

## 5. Submit

1. Jam page → **Submit game** → paste the Pages URL above  
2. X post: clip + `@_summer_plays_` + `#capyjam`

See [SUBMISSION.md](SUBMISSION.md) for the full checklist.
