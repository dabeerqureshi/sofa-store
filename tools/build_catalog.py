#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Montreal Sofa Co. - catalog builder v2.

Builds a curated catalog of 50 products (up to 3 photos each) from the raw
photo archives in pictures/:

  1. extracts both zip archives in upload order,
  2. de-duplicates identical photos by content hash,
  3. drops tiny / low-res / info-graphic images,
  4. clusters consecutive photos into products (WhatsApp exports keep the
     shots of one sofa together, so adjacent photos = same product),
  5. keeps the best 50 products (3-photo products first),
  6. optimizes photos into images/pNN-K.jpg and writes data/sofas.json.

Requires macOS (uses `sips` for image inspection/optimization).

Usage:
    python3 tools/build_catalog.py
"""

import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PICTURES_DIR = os.path.join(ROOT, "pictures")
IMAGES_DIR = os.path.join(ROOT, "images")
DATA_DIR = os.path.join(ROOT, "data")
SOFAS_JSON = os.path.join(DATA_DIR, "sofas.json")
STORE_JSON = os.path.join(DATA_DIR, "store.json")

MAX_EDGE = 1200
QUALITY = "68"
MIN_EDGE = 360
MIN_BYTES = 20000
TARGET_PRODUCTS = 50
MAX_PHOTOS = 3          # photos kept per product

SKIP_NAME = (
    re.compile(r"dimension", re.I),
    re.compile(r"specification", re.I),
    re.compile(r"how\s+much", re.I),
)

TYPE_RULES = (
    ("power recliner", "Power Recliner"),
    ("recliner", "Recliner"),
    ("sectional", "Sectional"),
    ("sofa set", "Sofa Set"),
    ("sofa bed", "Sofa Bed"),
    ("couch", "Sofa"),
    ("sofa", "Sofa"),
)

MODELS = (
    ("golden legs", "Golden Legs"),
    ("randy", "Randy"),
    ("jinny", "Jinny"),
    ("snug", "Snug"),
    ("cozy", "Cozy"),
    ("u sofa", "U-Shaped"),
)

COLOR_WORDS = (
    (re.compile(r"beije"), "Beige"),
    (re.compile(r"\bdark\s*grey\b"), "Dark Grey"),
    (re.compile(r"\blight\s*grey\b"), "Light Grey"),
    (re.compile(r"\bbeige\b"), "Beige"),
    (re.compile(r"\bgrey\b"), "Grey"),
    (re.compile(r"\bgray\b"), "Grey"),
    (re.compile(r"\bblack\b"), "Black"),
    (re.compile(r"\bwhite\b"), "White"),
    (re.compile(r"\bcream\b"), "Cream"),
    (re.compile(r"\bcharcoal\b"), "Charcoal"),
    (re.compile(r"\bblue\b"), "Blue"),
)

COLOR_CODES = (
    ("DG", "Dark Grey"),
    ("LG", "Light Grey"),
    ("BE", "Beige"),
    ("CR", "Cream"),
    ("CH", "Charcoal"),
    ("BL", "Blue"),
    ("GR", "Grey"),
    ("GL", "Grey"),
    ("GG", "Grey"),
    ("G", "Grey"),
    ("B", "Black"),
    ("W", "White"),
)

DESCRIPTIVE_KEYS = (
    "seater", "sofa", "couch", "bed", "leather", "courdary", "corduroy",
    "randy", "jinny", "snug", "cozy", "recliner", "sectional", "golden",
    "u sofa", "sofa set",
)


def log(msg):
    print(msg)


def file_md5(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def image_size(path):
    try:
        out = subprocess.run(
            ["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
            capture_output=True, text=True, timeout=20,
        ).stdout
        w = int(re.search(r"pixelWidth:\s*(\d+)", out).group(1))
        h = int(re.search(r"pixelHeight:\s*(\d+)", out).group(1))
        return w, h
    except Exception:
        return 0, 0


def optimize_to_jpg(src, dst):
    subprocess.run(
        ["sips", "-Z", str(MAX_EDGE), "-s", "format", "jpeg",
         "-s", "formatOptions", QUALITY, src, "--out", dst],
        check=True, capture_output=True, timeout=120,
    )
    if not os.path.exists(dst) or os.path.getsize(dst) < 5000:
        raise RuntimeError("optimized image looks too small: %s" % dst)


def name_score(fn):
    """Prefer descriptive filenames over generic WhatsApp/date ones."""
    low = fn.lower()
    s = 0
    if "whatsapp" in low:
        s -= 120
    if low.startswith("new "):
        s -= 20
    if "$" in fn:
        s += 60
    if "seater" in low:
        s += 45
    if "sofa" in low or "couch" in low:
        s += 20
    if "leather" in low or "courdary" in low or "corduroy" in low:
        s += 10
    if re.match(r"^[0-9a-f]{8}-", fn):
        s += 12
    if len(fn) < 48:
        s += 5
    return s



def detect_seats(low):
    m = re.search(r"(\d+)\s*(?:[- ])?seater", low)
    return int(m.group(1)) if m else None


def detect_type(low):
    for key, label in TYPE_RULES:
        if key in low:
            return label
    return None


def detect_material(low):
    if "leather" in low:
        return "Leather"
    if "courdary" in low or "corduroy" in low or "corderoy" in low:
        return "Corduroy"
    return None


def detect_model(low):
    for key, label in MODELS:
        if key in low:
            return label
    return None


def detect_color(fn):
    low = fn.lower()
    scrubbed = re.sub(r"[0-9_]+", " ", low)
    scrubbed = re.sub(r"\s+", " ", scrubbed)
    for rx, label in COLOR_WORDS:
        if rx.search(scrubbed):
            return label
    # Color *codes* (G, BE, B, CR...) are only meaningful on descriptive
    # product names; hex hashes / Facebook IDs / WhatsApp timestamps would
    # otherwise produce false colors (e.g. a "b" inside a UUID -> Black).
    if not any(k in low for k in DESCRIPTIVE_KEYS):
        return None
    up = re.sub(r"[0-9_]+", " ", fn.upper())
    up = re.sub(r"\s+", " ", up)
    tokens = re.findall(r"\w+", up)
    for code, label in COLOR_CODES:
        if code in tokens:
            return label
    return None


def detect_price(fn):
    m = re.search(r"(\d+(?:\.\d+)?)\s*\$", fn)
    if m:
        try:
            return int(round(float(m.group(1))))
        except Exception:
            return None
    stem = os.path.splitext(fn)[0]
    if re.search(r"\d{8,}", stem):
        return None  # facebook ID / date stamp, not a price
    m = re.search(r"[\s\-_](\d{3,4}(?:\.\d+)?)\s*$", stem)
    if m:
        try:
            val = float(m.group(1))
        except Exception:
            return None
        if val >= 500:
            return int(round(val))
    return None


def build_title(seats, model, mtype, material, color):
    if model == "U-Shaped":
        title = "U-Shaped %s" % (mtype or "Sofa")
    else:
        bits = []
        if model:
            bits.append(model)
        if seats:
            bits.append("%d-Seater" % seats)
        if material:
            bits.append(material)
        bits.append(mtype or "Sofa")
        if not seats and not model and not material:
            bits = ["Premium", mtype or "Sofa"]
        title = " ".join(bits)
    if color:
        title += " - %s" % color
    return title


def build_description(seats, mtype, material, color, price):
    """Professional, honest 2-sentence product description."""
    kind = {
        "Sofa Bed": "A versatile sofa bed",
        "Recliner": "A comfortable recliner",
        "Power Recliner": "A smooth power recliner",
        "Sectional": "A spacious sectional",
        "Sofa Set": "A complete sofa set",
    }.get(mtype)
    if kind is None:
        if seats:
            kind = "A comfortable %d-seater sofa" % seats
        else:
            kind = "A comfortable sofa"
    desc = kind
    if material:
        desc += ", upholstered in %s" % material.lower()
        if color:
            desc += " with a %s finish" % color.lower()
    elif color:
        desc += " in a %s finish" % color.lower()
    desc += " that fits everyday living."
    desc += (" Every piece is carefully inspected by our team, delivered to "
             "your door across Montreal, and payable only after you have "
             "inspected it.")
    return desc


NEIGHBORHOODS = (
    "Mile-End", "Plateau", "Griffintown", "Rosemont", "Villeray",
    "Hochelaga", "Verdun", "NDG", "Outremont", "Westmount",
    "Ahuntsic", "Saint-Henri", "Pointe-Saint-Charles", "Old Montreal",
    "Saint-Laurent", "Saint-Leonard", "Cartierville", "Snowdon",
    "Côte-des-Neiges", "Parc-Extension", "Anjou", "Kirkland",
    "Pierrefonds", "Nuns' Island", "Brossard", "Boucherville",
    "Terrebonne", "Laval", "Lachine", "Lasalle",
)


def anonymous_name(seats, mtype, seen):
    """Collection-style names for photos with no filename information.

    Montreal neighbourhood names are honest (a collection label, not a
    product claim) and feel local and professional to customers.
    """
    base_type = mtype or "Sofa"
    for hood in NEIGHBORHOODS:
        name = "%s %s" % (hood, base_type)
        if name not in seen:
            seen[name] = 1
            return name
    i = 1
    while True:
        name = "Signature %s %d" % (base_type, i)
        if name not in seen:
            seen[name] = 1
            return name
        i += 1


def extract_ordered(zips, tmp):
    """Extract all usable photos, preserving zip (upload) order.

    Returns a list of records sorted by first-seen order:
        {"pos", "src", "orig", "w", "h"}
    Exact duplicates (same md5) keep the position of their first occurrence
    but inherit the more descriptive filename.
    """
    records = {}
    skipped = 0
    pos = 0
    for zpath in zips:
        log("Reading %s" % os.path.basename(zpath))
        with zipfile.ZipFile(zpath) as zf:
            members = [n for n in zf.namelist() if not n.endswith("/")]
            for member in members:
                orig = os.path.basename(member)
                if not orig or orig.startswith("._") or orig == ".DS_Store":
                    continue
                if any(rx.search(orig) for rx in SKIP_NAME):
                    log("  skip infographic: %s" % orig)
                    continue
                src = os.path.join(tmp, "%05d_%s" % (pos, orig))
                with zf.open(member) as fsrc, open(src, "wb") as fdst:
                    shutil.copyfileobj(fsrc, fdst)
                pos += 1
                w, h = image_size(src)
                if not w or not h or min(w, h) < MIN_EDGE or os.path.getsize(src) < MIN_BYTES:
                    skipped += 1
                    continue
                digest = file_md5(src)
                if digest in records:
                    # keep first position, prefer the nicer filename
                    if name_score(orig) > name_score(records[digest]["orig"]):
                        records[digest]["orig"] = orig
                        records[digest]["src"] = src
                    continue
                records[digest] = {
                    "pos": pos, "src": src, "orig": orig, "w": w, "h": h,
                }
    ordered = sorted(records.values(), key=lambda r: r["pos"])
    log("Unique photos kept: %d (skipped tiny/low-res: %d)" % (len(ordered), skipped))
    return ordered


def cluster_products(items):
    """Group photos that belong to the same product, by filename signature.

    Shots of one sofa usually share a filename pattern ("1100$ (2).jpeg",
    "1100$ (3).jpeg" / "3 Seater G.jpg"), so photos with the same cleaned
    token signature are treated as one product. Anonymous names (WhatsApp
    timestamps, UUIDs, Facebook IDs) get no signature and stay singletons -
    we never guess, so a product never shows unrelated photos.
    """
    junk = {"jpg", "jpeg", "jfif", "png", "webp", "whatsapp", "image",
            "images", "photo", "img", "at", "am", "pm", "the", "new", "n"}

    def signature(fn):
        base = os.path.splitext(os.path.basename(fn))[0].lower()
        if re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}", base):   # UUID
            return None
        if re.search(r"\d{10,}", base):                   # facebook/timestamp id
            return None
        s = re.sub(r"\(\d+\)", " ", base)                 # copy counters
        s = re.sub(r"\b(\d+)\s*seater\b", r"\1seater", s) # keep "3seater"
        s = re.sub(r"(\d+)\s*\$", r"\1$ ", s)             # keep price tokens
        descriptive = any(k in base for k in DESCRIPTIVE_KEYS)
        toks = set()
        for t in re.findall(r"[a-z]+|\d+\$", s):
            if t in junk:
                continue
            if t.endswith("$"):
                toks.add(t)
            elif len(t) > 1 or descriptive:
                toks.add(t)
        return tuple(sorted(toks)) or None

    buckets = {}
    singles = []
    for rec in items:
        sig = signature(rec["orig"])
        if sig is None:
            singles.append(rec)
        else:
            buckets.setdefault(sig, []).append(rec)

    products = []
    for bucket in buckets.values():
        photos = sorted(bucket, key=lambda r: (-min(r["w"], r["h"]), r["pos"]))[:MAX_PHOTOS]
        photos.sort(key=lambda r: r["pos"])
        products.append({"photos": photos, "named": True})
    # anonymous photos: one-photo products, best quality first
    singles.sort(key=lambda r: (-min(r["w"], r["h"]), name_score(r["orig"])))
    for rec in singles:
        products.append({"photos": [rec], "named": False})
    return products


def main():
    zips = sorted(glob.glob(os.path.join(PICTURES_DIR, "*.zip")))
    if not zips:
        log("No *.zip archives found in %s" % PICTURES_DIR)
        sys.exit(1)

    os.makedirs(DATA_DIR, exist_ok=True)
    if os.path.isdir(IMAGES_DIR):
        for old in glob.glob(os.path.join(IMAGES_DIR, "*.jpg")):
            os.remove(old)
    else:
        os.makedirs(IMAGES_DIR)

    with tempfile.TemporaryDirectory(prefix="msc_") as tmp:
        items = extract_ordered(zips, tmp)
        groups = cluster_products(items)
        log("Clustered into %d candidate products" % len(groups))

        # Named products (filename-signature groups) carry real titles,
        # prices and attributes - they come first. Anonymous single photos
        # fill the rest of the catalog, sharpest first.
        groups.sort(key=lambda g: (
            0 if g["named"] else 1,
            -len(g["photos"]),
            -max(min(r["w"], r["h"]) for r in g["photos"]),
        ))
        selected = groups[:TARGET_PRODUCTS]
        selected.sort(key=lambda g: (
            0 if g["named"] else 1,
            -len(g["photos"]),
            g["photos"][0]["pos"],
        ))
        log("Selected %d products" % len(selected))

        entries = []
        seen_titles = {}
        for i, group in enumerate(selected, 1):
            photos = group["photos"]
            head = photos[0]
            low = head["orig"].lower()
            seats = detect_seats(low)
            mtype = detect_type(low) or "Sofa"
            material = detect_material(low)
            model = detect_model(low)
            color = detect_color(head["orig"])
            price = detect_price(head["orig"])
            for extra in photos[1:]:
                elow = extra["orig"].lower()
                if not price:
                    price = detect_price(extra["orig"])
                if not material:
                    material = detect_material(elow)
                if not seats:
                    seats = detect_seats(elow)

            name = build_title(seats, model, mtype, material, color)
            if not group["named"] or not (seats or model or material):
                # no real product info from the filename - use a local
                # collection name instead of a generic/numbered title
                name = anonymous_name(seats, mtype, seen_titles)
            elif name in seen_titles:
                seen_titles[name] += 1
                name = "%s (Model %d)" % (name, seen_titles[name])
            else:
                seen_titles[name] = 1

            images = []
            for k, ph in enumerate(photos, 1):
                dst = os.path.join(IMAGES_DIR, "p%02d-%d.jpg" % (i, k))
                try:
                    optimize_to_jpg(ph["src"], dst)
                except Exception:
                    shutil.copyfile(ph["src"], dst)
                images.append("images/p%02d-%d.jpg" % (i, k))

            tags = []
            if seats:
                tags.append("%d-seater" % seats)
            if mtype:
                tags.append(mtype.lower())
            if material:
                tags.append(material.lower())
            if color:
                tags.append(color.lower())
            if model:
                tags.append(model.lower())

            entries.append({
                "id": "p%02d" % i,
                "name": name,
                "description": build_description(seats, mtype, material, color, price),
                "seats": seats,
                "type": mtype,
                "material": material,
                "color": color,
                "price": price,
                "priceOnRequest": price is None,
                "images": images,
                "tags": tags,
                "available": True,
            })

    catalog = {"count": len(entries), "products": entries}
    with open(SOFAS_JSON, "w", encoding="utf-8") as fh:
        json.dump(catalog, fh, ensure_ascii=False, indent=2)
    log("Wrote %s with %d products" % (SOFAS_JSON, len(entries)))

    # keep the homepage hero pointing at a real product photo
    if entries and os.path.exists(STORE_JSON):
        with open(STORE_JSON, "r", encoding="utf-8") as fh:
            store = json.load(fh)
        store["heroImage"] = entries[0]["images"][0]
        with open(STORE_JSON, "w", encoding="utf-8") as fh:
            json.dump(store, fh, ensure_ascii=False, indent=2)
        log("store.json heroImage -> %s" % store["heroImage"])

    total_bytes = sum(
        os.path.getsize(os.path.join(IMAGES_DIR, os.path.basename(img)))
        for e in entries for img in e["images"]
    )
    log("Total optimized image size: %.1f MB" % (total_bytes / 1048576.0))
    priced = [e for e in entries if not e["priceOnRequest"]]
    log("With known prices: %d / %d" % (len(priced), len(entries)))
    shots = {}
    for e in entries:
        shots[len(e["images"])] = shots.get(len(e["images"]), 0) + 1
    log("Photos per product: %s" % ", ".join(
        "%d photo(s): %d products" % (k, shots[k]) for k in sorted(shots)))
    log("Products:")
    for e in entries:
        log("  %-4s %-38s %s" % (
            e["id"], e["name"],
            ("$%d" % e["price"]) if e["price"] else "price on request"))


if __name__ == "__main__":
    main()
