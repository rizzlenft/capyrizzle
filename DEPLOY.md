# Deploy CapyRizzle Rush (GitHub Pages)

**Repo:** [github.com/rizzlenft/capyrizzle](https://github.com/rizzlenft/capyrizzle)  
**Play URL (after setup):** [rizzlenft.github.io/capyrizzle](https://rizzlenft.github.io/capyrizzle/)

---

## If Actions failed with “Get Pages site failed”

That error means **GitHub Pages was not turned on yet**. Use this flow (works on new repos):

### Step 1 — Push latest code

```bash
cd /Users/rizzle/Projects/capyrizzle-rush
git push origin main
```

### Step 2 — Wait for the green workflow

1. Open [Actions](https://github.com/rizzlenft/capyrizzle/actions)
2. Open **Deploy to GitHub Pages**
3. Wait until the latest run shows a **green check** (creates a `gh-pages` branch)

### Step 3 — Turn on Pages (one-time)

1. Open [Settings → Pages](https://github.com/rizzlenft/capyrizzle/settings/pages)
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**
3. **Branch:** `gh-pages` · **Folder:** `/ (root)` · **Save**

After 1–2 minutes, open:

**https://rizzlenft.github.io/capyrizzle/**

---

## Day-to-day pushes

```bash
git add .
git commit -m "your message"
git push
```

The workflow rebuilds `gh-pages` automatically on every push to `main`.

---

## CapyJam submit

1. Jam form → paste `https://rizzlenft.github.io/capyrizzle/`
2. X → gameplay clip + `@_summer_plays_` + `#capyjam`

See [SUBMISSION.md](SUBMISSION.md) for the full checklist.
