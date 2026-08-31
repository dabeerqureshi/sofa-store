#!/usr/bin/env python3
"""Static cross-validation of the sofa-store site (run from repo root)."""
import json, os, re

js = open('assets/js/app.js').read()
html_i = open('index.html').read()
html_c = open('catalog.html').read()
ids_index = set(re.findall(r'id="([a-zA-Z0-9_-]+)"', html_i))
ids_catalog = set(re.findall(r'id="([a-zA-Z0-9_-]+)"', html_c))

js_ids = set(re.findall(r"\$\('#([a-zA-Z0-9_-]+)'", js)) | \
         set(re.findall(r"querySelector\('#([a-zA-Z0-9_-]+)'", js))

# IDs that legitimately may not exist in a given page (guarded in JS)
optional = {'contact', 'toast'}

print('== IDs referenced in JS missing from BOTH pages ==')
missing = sorted(i for i in js_ids
                 if i not in ids_index and i not in ids_catalog and i not in optional)
print(missing if missing else 'NONE')

print('== page-specific required IDs ==')
page_specific = {
    'index.html': ['featured-grid', 'delivery-areas', 'contact-area',
                   'contact-hours', 'contact-wa-reply', 'to-top',
                   'product-modal', 'modal-image', 'modal-thumbs',
                   'modal-title', 'modal-price', 'modal-meta', 'modal-desc',
                   'modal-wa-btn', 'modal-download', 'modal-full',
                   'modal-room'],
    'catalog.html': ['catalog-grid', 'catalog-search', 'catalog-sort',
                     'filter-groups', 'active-pills', 'filter-panel',
                     'filter-toggle', 'filter-badge', 'filter-clear',
                     'clear-filters-btn', 'results-count', 'empty-state',
                     'product-modal', 'modal-image', 'modal-thumbs',
                     'modal-wa-btn', 'modal-download', 'modal-full',
                     'modal-room', 'to-top'],
}
for page, ids in page_specific.items():
    have = ids_index if page == 'index.html' else ids_catalog
    miss = [i for i in ids if i not in have]
    print(page, 'missing:', miss if miss else 'NONE')

print('== symbol refs used by JS-generated markup exist in both pages ==')
for sym in ['i-wa', 'i-sofa', 'i-check']:
    ok = ('symbol id="%s"' % sym in html_i) and ('symbol id="%s"' % sym in html_c)
    print(' ', sym, 'OK' if ok else 'MISSING')

json.load(open('data/sofas.json'))
json.load(open('data/store.json'))
print('== JSON files valid ==')

css = open('assets/css/style.css').read()
class_sel = set(re.findall(r"\$\('\.([a-zA-Z0-9_-]+)'", js))
miss_css = [c for c in sorted(class_sel) if ('.' + c) not in css]
print('== CSS classes missing for JS refs ==', miss_css if miss_css else 'NONE')

for fn in ['setChipsActive', 'cancelGridFill', 'maybeReveal',
           'isRevealCandidate', 'catalogFingerprint']:
    defs = len(re.findall(r'function %s' % fn, js))
    uses = len(re.findall(r'%s\(' % fn, js)) - defs
    print('%-18s defs:%d uses:%d' % (fn, defs, uses))
print('bindModal calls:', len(re.findall(r'bindModal\(\)', js)))
print('openModal calls:', len(re.findall(r'openModal\(', js)) - 1)
print('threshold values:', re.findall(r'threshold: [0-9.]+', js))
print('aria-pressed occurrences:', js.count('aria-pressed'))
print('data-wa-link= (valued) in cardHtml:',
      len(re.findall(r'data-wa-link="\' \+ esc\(waHref\)', js)))

# data integrity: every referenced image exists in images/ and thumbs/
catalog = json.load(open('data/sofas.json'))
miss_i, miss_t, noimg, dupids = [], [], [], set()
seen_ids = set()
for p in catalog['products']:
    if p['id'] in seen_ids:
        dupids.add(p['id'])
    seen_ids.add(p['id'])
    if not p.get('images'):
        noimg.append(p['id'])
        continue
    for img in p['images']:
        b = os.path.basename(img)
        if not os.path.isfile(os.path.join('images', b)):
            miss_i.append(img)
        if not os.path.isfile(os.path.join('thumbs', b)):
            miss_t.append(img)
print('== data ==  products:', len(catalog['products']),
      '| count field:', catalog['count'],
      '| dup ids:', sorted(dupids) or 'NONE',
      '| no-image products:', noimg or 'NONE',
      '| missing images:', miss_i or 'NONE',
      '| missing thumbs:', miss_t or 'NONE')

# paramValue sanity via re-implementation of the fixed logic
def param_value(qs, name):
    m = re.search(r'[?&]' + name + '=([^&]+)', qs)
    if not m:
        return None
    from urllib.parse import unquote
    return unquote(m.group(1).replace('+', '%20'))

assert param_value('?type=Sofa+Bed', 'type') == 'Sofa Bed'
assert param_value('?material=Leather', 'material') == 'Leather'
assert param_value('?q=white%20sofa', 'q') == 'white sofa'
assert param_value('?q=100%', 'q') == '100%'
assert param_value('?seats=6', 'seats') == '6'
assert param_value('', 'type') is None
print('== paramValue logic assertions passed ==')
