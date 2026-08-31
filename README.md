# Montreal Sofa Co. — Sofa Catalog Website

A professional, mobile-first catalog website for a Montreal sofa business, hosted free on **GitHub Pages**.

Built with plain HTML, CSS and JavaScript — no backend, no build step, no dependencies.

## 🔴 Step 1 — Set your WhatsApp number (important)

Open **`data/store.json`** and set your real number:

```json
{
  "whatsappNumber": "15145551234",
  "whatsappConfigured": true
}
```

- `whatsappNumber` — your WhatsApp number **without** `+` or spaces, country code first (e.g. `15145551234`)
- `whatsappConfigured` — `true` means every WhatsApp button on the site is live

The site never displays a phone number — visitors just tap **WhatsApp** buttons that open a chat with a pre-filled message. The WhatsApp number is configured in `store.json` and every button on the site picks it up automatically.

You can also adjust the tagline, service area, delivery areas, hours and delivery note in the same file.

**Business model:** we deliver **only inside Montreal** (every borough), **only on Sundays**, and buyers **pay cash on delivery** after inspecting the sofa. All copy, schema.org data and pre-filled WhatsApp messages reflect this.

## 📄 Pages

Your site has a home page and a catalogue page:

- **Home / Hero** — brand, tagline, animated USP badges (Every Sunday · Cash on Delivery), trust list
- **Why Us** — Sunday delivery, quality, cash on delivery, WhatsApp ordering
- **Catalog** — all sofas in stock, with search + filters (seats, type, material, color) + sort
  - pricing is **contact-only**: every card shows a **Contact for Pricing** badge — no prices are published anywhere on the site
  - every sofa has a **💬 WhatsApp button** that sends a pre-filled message naming that exact sofa and asking about Sunday delivery + cash price
  - click any photo for full details: full-size (uncropped) image, thumbnails, a **⬇ Download Image** button, a **View Full Image** link, a **3D Room** turntable view, a hover zoom loupe and double-tap zoom
- **How It Works** — choose → WhatsApp → book a Sunday slot → inspect & pay cash
- **About** — brand story
- **Contact** — WhatsApp CTA, service area, hours, delivery note
- Floating WhatsApp bubble + footer

## 🚀 Deploying to GitHub Pages

```bash
git add -A
git commit -m "Montreal Sofa Co. catalog site"
git push origin main
```

Then enable Pages (one-time, ~30 seconds):

1. Open your repo on GitHub → **Settings**
2. Left sidebar → **Pages**
3. Under **Build and deployment** → **Source**: select **Deploy from a branch**
4. Branch: **`main`** → folder: **`/` (root)** → **Save**
5. Wait ~1 minute, then visit:

```
https://dabeerqureshi.github.io/sofa-store/
```

Every future `git push` to `main` automatically updates the live site.

> **Tip:** GitHub Pages briefly returns a *transient* 404 for a minute or two
> while it rebuilds after each push. This is normal and self-corrects. The
> included `404.html` automatically redirects visitors back to the homepage
> during those moments, so nobody gets stuck on an error page.

> **Reliability note:** both pages render the catalogue instantly from embedded
> `data/sofas.js`/`data/store.js` (no waiting on a network request), then
> refresh from `data/sofas.json` in the background. So the catalogue always
> shows — even on a slow connection, under `file://`, or mid-deploy.

### Optional: your own `.ca` domain

Buy a domain (e.g. `maisonsofa.ca`), add it under **Settings → Pages → Custom domain**, and set a `CNAME` record in your DNS pointing to `dabeerqureshi.github.io`.

## 📦 How the catalog works

The catalog lives in **`data/sofas.json`** (generated). Each entry:

```json
{
  "id": "sofa-001",
  "name": "3-Seater Corduroy Sofa Bed - Light Grey",
  "seats": 3,
  "type": "Sofa Bed",
  "material": "Corduroy",
  "color": "Light Grey",
  "price": null,
  "priceOnRequest": true,
  "image": "images/sofa-001.jpg",
  "source": "3 Seater Sofa Bed Courdary LG 5.6.jpg",
  "available": true
}
```

- `available: false` hides a sofa without deleting it
- pricing is **contact-only**: the catalog always shows **"Contact for Pricing"**, and the generator never publishes prices

### Adding / updating sofas (from new photos)

1. Put your photo archives (`*.zip`) inside **`pictures/`** (already gitignored)
2. Run the generator once:

```bash
python3 tools/build_catalog.py
```

It de-duplicates identical photos, skips tiny/info images, optimizes everything into `images/sofa-NNN.jpg`, and regenerates `data/sofas.json`.

3. Regenerate the lightweight grid thumbnails (fast catalog loading):

```bash
python3 tools/make_thumbs.py    # needs Pillow: pip install Pillow
```

This builds `thumbs/…` from `data/sofas.json` (~90% smaller), which the catalog grid uses so the page renders instantly. The detail modal and download links still use the full-resolution `images/…` files.

4. Commit and push:

```bash
git add -A
git commit -m "Update catalog"
git push origin main
```

> The tool uses macOS `sips` for image processing, so it runs on Mac. It only needs `python3`, which ships with macOS.

### Quick edits without the generator

You can edit `data/sofas.json` by hand. To hide a sofa, flip `available` to `false`. Pictures must already be in `images/` and referenced by their path. Pricing stays contact-only — the site shows **"Contact for Pricing"** on every sofa.

## 🗂 Project structure

```
sofa-store/
├── index.html            # single-page site
├── assets/
│   ├── css/style.css     # styles
│   └── js/app.js         # catalog logic + WhatsApp integration
├── data/
│   ├── store.json        # business info + WhatsApp number
│   └── sofas.json        # generated catalog
├── images/               # generated, optimized sofa photos
├── thumbs/               # generated, lightweight grid thumbnails
├── tools/
│   ├── build_catalog.py  # catalog generator (macOS)
│   └── make_thumbs.py    # grid thumbnails (any OS, needs Pillow)
├── favicon.svg
├── robots.txt
└── .nojekyll
```

## 🛠 Local preview

```bash
cd sofa-store
python3 -m http.server 8080
```

Open http://localhost:8080

> Opening `index.html` directly via `file://` won't load the JSON — use a local server (or just push to GitHub Pages).

## ℹ️ Good to know

- GitHub Pages is free and static-only — perfect for a catalog + WhatsApp ordering model
- Every file reference is relative, so the site works under `/sofa-store/` today and under your own domain later
- The raw photo archive zips are **not** committed (they're ~60 MB); only optimized web images are