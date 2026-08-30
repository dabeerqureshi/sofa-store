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

The site never displays a phone number — visitors just tap **WhatsApp** buttons that open a chat with a pre-filled message. The number currently in `store.json` is a **placeholder**: replace it with your real one before sharing the site with customers.

You can also adjust the tagline, service area, delivery areas, hours and delivery note in the same file.

## 📄 Pages

Your site is a single page with sections:

- **Home / Hero** — brand, tagline, trust badges
- **Why Us** — delivery, quality, inspect-before-pay, WhatsApp ordering
- **Catalog** — all sofas in stock, with search + filters (seats, type, material, color) + sort
  - pricing is **contact-only**: every card shows a **Contact for Pricing** badge — no prices are published anywhere on the site
  - every sofa has a **💬 WhatsApp button** that sends a pre-filled message naming that exact sofa and asking for the price
  - click any photo for full details: the full-size (uncropped) image, thumbnails, a **⬇ Download Image** button and a **View Full Image** link
- **How It Works** — the 4-step buying process
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

3. Commit and push:

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
├── tools/
│   └── build_catalog.py  # catalog generator (macOS)
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