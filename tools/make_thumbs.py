#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Montreal Sofa Co. - thumbnail generator.

Reads data/sofas.json and, for every referenced full-size photo, writes a
lightweight JPEG thumbnail into thumbs/ (same base name, e.g. images/p01-1.jpg
-> thumbs/p01-1.jpg). The catalog grid uses these thumbnails so the page loads
fast, while the detail modal / download / full-image links keep the
full-resolution files.

Requires Pillow (cross-platform - works on macOS and Windows):

    pip install Pillow

Usage:
    python3 tools/make_thumbs.py
"""

import json
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR = os.path.join(ROOT, "images")
THUMBS_DIR = os.path.join(ROOT, "thumbs")
SOFAS_JSON = os.path.join(ROOT, "data", "sofas.json")

THUMB_MAX_W = 420          # max thumbnail width (grid cards ~ 600-900px @2x)
THUMB_QUALITY = 72         # good balance of size vs. clarity for a preview
MIN_BYTES = 2000           # sanity floor


def main():
    with open(SOFAS_JSON, encoding="utf-8") as fh:
        catalog = json.load(fh)

    products = catalog.get("products", [])
    refs = []
    for p in products:
        for img in p.get("images", []):
            if img not in refs:
                refs.append(img)

    os.makedirs(THUMBS_DIR, exist_ok=True)
    made = skipped = failed = 0
    total_in = total_out = 0

    for ref in refs:
        base = os.path.basename(ref)                     # e.g. p01-1.jpg
        src = os.path.join(IMAGES_DIR, base)
        dst = os.path.join(THUMBS_DIR, base)
        if not os.path.isfile(src):
            print("  skip (missing source): %s" % ref)
            skipped += 1
            continue
        try:
            with Image.open(src) as im:
                im = im.convert("RGB")
                if im.width > THUMB_MAX_W:
                    ratio = THUMB_MAX_W / float(im.width)
                    im = im.resize(
                        (THUMB_MAX_W, max(1, int(im.height * ratio))),
                        Image.LANCZOS,
                    )
                im.save(dst, "JPEG", quality=THUMB_QUALITY, optimize=True)
        except Exception as exc:  # noqa: BLE001
            print("  error: %s -> %s" % (ref, exc))
            failed += 1
            continue
        in_bytes = os.path.getsize(src)
        out_bytes = os.path.getsize(dst)
        if out_bytes < MIN_BYTES:
            print("  warning: very small thumbnail for %s" % ref)
        total_in += in_bytes
        total_out += out_bytes
        made += 1

    print("Thumbs built: %d | skipped: %d | failed: %d" % (made, skipped, failed))
    if made:
        print(
            "Bytes: %d MB -> %d MB (%.0f%% smaller)"
            % (
                total_in / 1048576.0,
                total_out / 1048576.0,
                100 * (1 - (total_out / float(total_in))),
            )
        )
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
