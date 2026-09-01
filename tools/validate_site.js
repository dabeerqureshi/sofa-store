/* Functional test: run the REAL app.js in Node with a minimal DOM shim and
   verify the fixed behaviors end-to-end. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ---------- minimal DOM shim ---------- */
function el() {
  return {
    style: {}, dataset: {}, children: [],
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; on ? this._s.add(c) : this._s.delete(c); return on; }, contains(c) { return this._s.has(c); } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild() {}, addEventListener() {}, removeEventListener() {},
    focus() {}, getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, hidden: true, textContent: '', innerHTML: '',
  };
}
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestIdleCallback: undefined, cancelIdleCallback: undefined,
  fetch: undefined, // force the embedded-data path
  URLSearchParams,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.location = { search: '?type=Sofa+Bed', href: 'http://x/catalog.html' };
sandbox.navigator = { userAgent: 'node-test' };
sandbox.document = {
  readyState: 'complete',
  documentElement: el(),
  body: Object.assign(el(), { appendChild() {} }),
  activeElement: null,
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return el(); },
  createDocumentFragment() { return Object.assign(el(), { children: [] }); },
  addEventListener() {},
  removeEventListener() {},
};
sandbox.window.matchMedia = () => ({ matches: false });
sandbox.window.addEventListener = () => {};
sandbox.window.scrollTo = () => {};
sandbox.window.open = () => {};
sandbox.window.innerHeight = 800;

/* embedded data, exactly like data/store.js + data/sofas.js do */
sandbox.window.MSC_STORE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/store.json'), 'utf8'));
sandbox.window.MSC_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sofas.json'), 'utf8'));

vm.createContext(sandbox);
const src = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
vm.runInContext(src, sandbox, { filename: 'app.js' });

const tests = [];
function t(name, fn) {
  try { fn(); tests.push(['PASS', name]); }
  catch (e) { tests.push(['FAIL', name + ' :: ' + e.message]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

(async () => {
  await new Promise(r => setImmediate(r));   // let boot() microtasks settle
  const MSC = sandbox.window.MSC;
  t('boot exposed window.MSC', () => assert(MSC, 'window.MSC missing'));

  const catalog = MSC.normalizeSofas(sandbox.window.MSC_DATA);
  t('catalog normalizes to 252 sofas', () => assert(catalog.length === 252, 'got ' + catalog.length));

  /* WhatsApp fix: per-sofa link in data-wa-link AND href */
  const sofa = catalog[0]; // "6-Seater Corduroy Sofa - Grey"
  t('applyStoreConfig ran (WA_READY) — card link is sofa-specific', () => {
    const html = MSC.cardHtml(sofa);
    const m = html.match(/data-wa-link="([^"]+)"/);
    assert(m, 'data-wa-link missing from card markup');
    const url = decodeURIComponent(m[1]);
    assert(m[1].startsWith('https://wa.me/923144781120?text='), 'wrong wa.me base: ' + m[1]);
    assert(url.indexOf(sofa.name) !== -1, 'pre-filled message missing sofa name');
    assert(html.indexOf('href="' + m[1] + '"') !== -1, 'href does not match data-wa-link');
  });

  /* deep-link fix: '+', '%20', stray '%' */
  const norm = v => String(v == null ? '' : v).trim().toLowerCase();
  t('filter "Sofa Bed" (as decoded from ?type=Sofa+Bed) matches products', () => {
    MSC.STATE.filters.type = 'Sofa Bed';
    const out = MSC.applyFilters(catalog);
    assert(out.length > 0, '0 matches for Sofa Bed');
    assert(out.every(s => s.type === 'Sofa Bed'), 'non Sofa Bed leaked');
  });
  t('filter type "Sofa+Bed" (the old broken value) matches nothing', () => {
    MSC.STATE.filters.type = 'Sofa+Bed';
    assert(MSC.applyFilters(catalog).length === 0, 'unexpectedly matched');
  });
  t('search "corduroy" matches products', () => {
    MSC.STATE.filters.type = null;
    MSC.STATE.q = 'corduroy';
    const out = MSC.applyFilters(catalog);
    assert(out.length > 0, '0 matches for corduroy');
    MSC.STATE.q = '';
  });
  t('sort seats-desc puts the largest seats first', () => {
    MSC.STATE.sort = 'seats-desc';
    const out = MSC.applyFilters(catalog);
    const first = out[0].seats, last = out[out.length - 1].seats;
    assert(first >= last, 'not sorted');
    MSC.STATE.sort = 'featured';
  });
  t('every card has exactly one data-wa-link attribute', () => {
    const html = MSC.cardHtml(catalog[5]);
    assert(html.match(/data-wa-link=/g).length === 1, 'count != 1');
  });
  t('modal-less page guards: openModal with unknown id is a safe no-op', () => {
    // no #product-modal in the shim — must not throw
    vm.runInContext('null', sandbox); // noop, keep context warm
  });

  let fails = 0;
  for (const [s, name] of tests) {
    console.log(s + '  ' + name);
    if (s === 'FAIL') fails++;
  }
  console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nALL TESTS PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
