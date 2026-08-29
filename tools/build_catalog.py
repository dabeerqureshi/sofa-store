#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Montreal Sofa Co. - catalog builder.

Reads the raw photo archives in pictures/, de-duplicates identical photos by
content hash, drops tiny / info-graphic images, optimizes the rest into
images/sofa-NNN.jpg, and regenerates data/sofas.json for the website.

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

MAX_EDGE = 1200
QUALITY = "68"
MIN_EDGE = 360
MIN_BYTES = 20000

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
    """Prefer descriptive filenames over generic WhatsApp/DatePhoto ones."""
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


DESCRIPTIVE_KEYS = (
    "seater", "sofa", "couch", "bed", "leather", "courdary", "corduroy",
    "randy", "jinny", "snug", "cozy", "recliner", "sectional", "golden",
    "u sofa", "sofa set",
)


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


def main():
    zips = sorted(glob.glob(os.path.join(PICTURES_DIR, "*.zip")))
    if not zips:
        log("No *.zip archives found in %s" % PICTURES_DIR)
        sys.exit(1)

    if os.path.isdir(IMAGES_DIR):
        for old in glob.glob(os.path.join(IMAGES_DIR, "sofa-*")):
            os.remove(old)
    else:
        os.makedirs(IMAGES_DIR)
    os.makedirs(DATA_DIR, exist_ok=True)

    chosen = {}  # md5 -> (src, orig_name, width, height)
    skipped = 0
    with tempfile.TemporaryDirectory(prefix="msc_") as tmp:
        for idx, zpath in enumerate(zips):
            log("Reading %s" % os.path.basename(zpath))
            with zipfile.ZipFile(zpath) as zf:
                members = [n for n in zf.namelist() if not n.endswith("/")]
                for member in members:
                    orig = os.path.basename(member)
                    if not orig or orig.startswith("._") or orig == ".DS_Store":
                        continue
                    if any(p.search(orig) for p in SKIP_NAME):
                        log("  skip infographic: %s" % orig)
                        continue
                    src = os.path.join(tmp, "%02d_%s" % (idx, orig))
                    with zf.open(member) as fsrc, open(src, "wb") as fdst:
                        shutil.copyfileobj(fsrc, fdst)
                    w, h = image_size(src)
                    if not w or not h or min(w, h) < MIN_EDGE or os.path.getsize(src) < MIN_BYTES:
                        skipped += 1
                        continue
                    digest = file_md5(src)
                    keep = digest not in chosen or name_score(orig) > name_score(chosen[digest][1])
                    if keep:
                        chosen[digest] = (src, orig, w, h)

        log("Unique photos kept: %d (skipped tiny/low-res: %d)" % (len(chosen), skipped))

        rows = []
        for src, orig, w, h in chosen.values():
            low = orig.lower()
            seats = detect_seats(low)
            mtype = detect_type(low) or "Sofa"
            material = detect_material(low)
            model = detect_model(low)
            color = detect_color(orig)
            price = detect_price(orig)
            name = build_title(seats, model, mtype, material, color)
            rows.append((src, orig, w, h, seats, mtype, material, model, color, price, name))

        # stable, presentable order: seats (unknown first), type, title
        rows.sort(key=lambda r: (r[4] or 0, r[5], r[10].lower()))

        entries = []
        hero_candidates = []
        for i, r in enumerate(rows, 1):
            src, orig, w, h, seats, mtype, material, model, color, price, name = r
            dst = os.path.join(IMAGES_DIR, "sofa-%03d.jpg" % i)
            try:
                optimize_to_jpg(src, dst)
            except Exception:
                shutil.copyfile(src, dst)
            entries.append({
                "id": "sofa-%03d" % i,
                "name": name,
                "seats": seats,
                "type": mtype or "Sofa",
                "material": material,
                "color": color,
                "price": price,
                "priceOnRequest": price is None,
                "pixels": w * h,
                "image": "images/sofa-%03d.jpg" % i,
                "source": orig,
                "available": True,
            })
            if "whatsapp" not in orig.lower():
                hero_candidates.append(entries[-1])

        catalog = {"count": len(entries), "sofas": entries}
        with open(SOFAS_JSON, "w", encoding="utf-8") as fh:
            json.dump(catalog, fh, ensure_ascii=False, indent=2)
        log("Wrote %s with %d sofas" % (SOFAS_JSON, len(entries)))
        total_bytes = sum(os.path.getsize(os.path.join(IMAGES_DIR, e["id"] + ".jpg")) for e in entries)
        log("Total optimized image size: %.1f MB" % (total_bytes / 1048576.0))

        prices = [e for e in entries if not e["priceOnRequest"]]
        log("With known prices: %d" % len(prices))
        seats_hist = {}
        for e in entries:
            key = e["seats"] or 0
            seats_hist[key] = seats_hist.get(key, 0) + 1
        log("By seats (0 = not stated): %s"
            % ", ".join("%d:%d" % (k, seats_hist[k]) for k in sorted(seats_hist)))

        hero_candidates.sort(key=lambda e: -e["pixels"])
        log("Hero candidates (descriptive names, largest first):")
        for e in hero_candidates[:12]:
            log("  %s  %dpx  %s" % (e["id"], e["pixels"], e["source"]))


if __name__ == "__main__":
    main()