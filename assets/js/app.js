/* Montreal Sofa Co. — app.js
   Loads config from data/store.json and the catalogue from data/sofas.json.
   No dependencies. Works on index.html (featured) and catalog.html (full). */
(function () {
  'use strict';

  /* ---------- Helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  var toastTimer = null;
  function toast(message) {
    var el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return r.json();
    });
  }

  /* ---------- WhatsApp ---------- */
  var WA_READY = false;
  var WA_NUMBER = '';

  function waLink(message) {
    if (!WA_READY) return '';
    var base = 'https://wa.me/' + WA_NUMBER +
      '?text=' + encodeURIComponent(message || DEFAULT_WA_MESSAGE);
    return base;
  }

  var DEFAULT_WA_MESSAGE =
    "Hi Montreal Sofa Co.! I'm interested in one of your sofas. Could you tell me more?";

  /* Delegated clicks for every [data-wa-link] element, on both pages. */
  document.addEventListener('click', function (ev) {
    var link = ev.target.closest ? ev.target.closest('[data-wa-link]') : null;
    if (!link) return;
    ev.preventDefault();
    if (!WA_READY) {
      toast('WhatsApp is being set up — please check back soon!');
      if (link.getAttribute('data-wa-fallback') === 'contact') {
        var contact = $('#contact');
        if (contact) contact.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
    window.open(link.getAttribute('data-wa-link'), '_blank', 'noopener');
  });

  /* ---------- State ---------- */
  var STATE = {
    q: '',
    filters: { seats: null, type: null, material: null, color: null },
    sort: 'featured'
  };

  var SORTS = {
    'featured': function (a, b) {
      return (b.photos.length - a.photos.length) ||
             ((b.price ? 1 : 0) - (a.price ? 1 : 0)) ||
             String(a.id).localeCompare(String(b.id));
    },
    'price-asc': function (a, b) {
      return (a.price != null ? a.price : Infinity) - (b.price != null ? b.price : Infinity) ||
             String(a.id).localeCompare(String(b.id));
    },
    'price-desc': function (a, b) {
      return (b.price != null ? b.price : -Infinity) - (a.price != null ? a.price : -Infinity) ||
             String(a.id).localeCompare(String(b.id));
    },
    'seats-desc': function (a, b) {
      return (b.seats || 0) - (a.seats || 0) || String(a.id).localeCompare(String(b.id));
    },
    'name-asc': function (a, b) { return a.name.localeCompare(b.name); }
  };

  function normalizeSofas(raw) {
    var list = Array.isArray(raw) ? raw
      : (raw && (raw.products || raw.sofas)) || [];
    return list
      .filter(function (s) { return s && s.name && (s.images || s.photos || s.image); })
      .filter(function (s) { return s.available !== false; })
      .map(function (s, i) {
        var photos = (Array.isArray(s.images) && s.images.length && s.images) ||
                     (Array.isArray(s.photos) && s.photos.length && s.photos) ||
                     [s.image];
        return {
          id: s.id || 's' + (i + 1),
          name: s.name,
          price: typeof s.price === 'number' ? s.price : null,
          seats: s.seats || null,
          type: s.type || null,
          material: s.material || null,
          color: s.color || null,
          desc: s.description || '',
          photos: photos
        };
      });
  }

  function paramValue(name) {
    var m = location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* ---------- Templates ---------- */
  function priceHtml(sofa) {
    if (sofa.price != null) {
      return '<span class="sofa-price">$' + sofa.price.toLocaleString('en-CA') +
        ' <span class="price-note">CAD</span></span>';
    }
    return '<span class="sofa-price">$' +
      '<span class="price-note">Message for price</span></span>';
  }

  function cardHtml(sofa, opts) {
    opts = opts || {};
    var tags = [];
    if (sofa.seats) tags.push(esc(sofa.seats) + '-Seater');
    if (sofa.type) tags.push(esc(sofa.type));
    if (sofa.material) tags.push(esc(sofa.material));
    if (sofa.color) tags.push(esc(sofa.color));
    var photoCount = sofa.photos.length > 1
      ? '<span class="sofa-count">' + sofa.photos.length + ' photos</span>' : '';
    var waMsg = "Hi Montreal Sofa Co.! I'm interested in the " + sofa.name +
      " (" + priceText(sofa) + "). Is it still available?";
    var waHref = waLink(waMsg);
    var waBtn = waHref
      ? '<a class="btn btn-wa btn-block" data-wa-link href="' + esc(waHref) + '" rel="noopener" aria-label="Order ' + esc(sofa.name) + ' on WhatsApp">' +
        '<svg width="17" height="17"><use href="#i-wa"/></svg>Order on WhatsApp</a>'
      : '<a class="btn btn-wa btn-block" data-wa-link href="#" aria-disabled="true" aria-label="Order ' + esc(sofa.name) + ' on WhatsApp">' +
        '<svg width="17" height="17"><use href="#i-wa"/></svg>Order on WhatsApp</a>';
    return (
      '<article class="sofa-card fade-in" data-id="' + esc(sofa.id) + '">' +
        '<div class="sofa-media">' + photoCount +
          '<button type="button" class="sofa-media-btn" data-sofa="' + esc(sofa.id) + '" ' +
            'aria-label="View details for ' + esc(sofa.name) + '">' +
            '<img src="' + esc(sofa.photos[0]) + '" alt="' + esc(sofa.name) + '" loading="lazy" width="600" height="450">' +
          '</button>' +
        '</div>' +
        '<div class="sofa-body">' +
          '<h3>' + esc(sofa.name) + '</h3>' +
          (tags.length ? '<div class="sofa-meta"><span class="tag tag-accent">' + tags.join('</span><span class="tag">') + '</span></div>' : '') +
          priceHtml(sofa) +
          waBtn +
        '</div>' +
      '</article>'
    );
  }

  function priceText(sofa) {
    return sofa.price != null ? '$' + sofa.price.toLocaleString('en-CA') + ' CAD' : 'price on request';
  }

  /* Image-area button should look clickable */
  document.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('.sofa-media-btn')) {
      var id = ev.target.closest('.sofa-media-btn').getAttribute('data-sofa');
      openModal(id);
    }
  });

  /* ---------- Filtering ---------- */
  function normalize(str) { return String(str || '').toLowerCase().trim(); }

  function applyFilters(sofas) {
    var q = normalize(STATE.q);
    var words = q ? q.split(/\s+/) : [];
    var f = STATE.filters;
    var out = sofas.filter(function (s) {
      if (f.seats && String(s.seats) !== f.seats) return false;
      if (f.type && s.type !== f.type) return false;
      if (f.material && s.material !== f.material) return false;
      if (f.color && s.color !== f.color) return false;
      if (!words.length) return true;
      var hay = normalize([s.name, s.type, s.material, s.color,
        s.seats ? s.seats + ' seater' : '', s.desc].join(' '));
      for (var i = 0; i < words.length; i++) {
        if (hay.indexOf(words[i]) === -1) return false;
      }
      return true;
    });
    var sorter = SORTS[STATE.sort] || SORTS.featured;
    return out.sort(sorter);
  }

  function countMatches(sofas) {
    var f = STATE.filters;
    return sofas.filter(function (s) {
      if (f.seats && String(s.seats) !== f.seats) return false;
      if (f.type && s.type !== f.type) return false;
      if (f.material && s.material !== f.material) return false;
      if (f.color && s.color !== f.color) return false;
      return true;
    }).length;
  }

  function renderGrid(root, all) {
    var list = applyFilters(all);
    root.innerHTML = list.map(function (s) { return cardHtml(s); }).join('');
    var meta = $('#results-count');
    if (meta) {
      meta.innerHTML = list.length === all.length
        ? '<span>' + list.length + ' sofas in stock</span>'
        : '<span class="results-active">' + list.length + ' of ' + all.length +
          ' sofas match</span>';
    }
    var empty = $('#empty-state');
    if (empty) empty.hidden = list.length !== 0;
  }
  /* ---------- Filter chips UI ---------- */
  function chipRow(label, values, key, counts) {
    if (!values.length) return '';
    var chips = values.map(function (v) {
      var active = STATE.filters[key] === String(v) ? ' active' : '';
      var n = counts[key][v] || 0;
      return '<button type="button" class="chip' + active + '" data-filter="' + key +
        '" data-value="' + esc(v) + '">' + esc(v) +
        ' <span class="chip-count">' + n + '</span></button>';
    }).join('');
    return '<div class="filter-row"><span class="filter-label">' + esc(label) +
      '</span>' + chips + '</div>';
  }

  function buildFilters(sofas) {
    var wrap = $('#filter-groups');
    if (!wrap) return;
    var values = { seats: [], type: [], material: [], color: [] };
    var counts = { seats: {}, type: {}, material: {}, color: {} };
    sofas.forEach(function (s) {
      ['seats', 'type', 'material', 'color'].forEach(function (k) {
        if (!s[k]) return;
        var v = String(s[k]);
        if (values[k].indexOf(v) === -1) values[k].push(v);
        counts[k][v] = (counts[k][v] || 0) + 1;
      });
    });
    values.seats.sort(function (a, b) { return Number(a) - Number(b); });
    ['type', 'material', 'color'].forEach(function (k) { values[k].sort(); });
    wrap.innerHTML =
      chipRow('Seats', values.seats, 'seats', counts) +
      chipRow('Style', values.type, 'type', counts) +
      chipRow('Material', values.material, 'material', counts) +
      chipRow('Colour', values.color, 'color', counts);
  }

  function bindFilterClicks(sofas, grid) {
    var wrap = $('#filter-groups');
    if (!wrap) return;
    wrap.addEventListener('click', function (ev) {
      var chip = ev.target.closest ? ev.target.closest('.chip') : null;
      if (!chip) return;
      var key = chip.getAttribute('data-filter');
      var value = chip.getAttribute('data-value');
      STATE.filters[key] = STATE.filters[key] === value ? null : value;
      $all('.chip', wrap).forEach(function (c) {
        var k = c.getAttribute('data-filter');
        var v = c.getAttribute('data-value');
        c.classList.toggle('active', STATE.filters[k] === v);
      });
      renderGrid(grid, sofas);
    });
  }

  function bindClearButton(sofas, grid) {
    var btn = $('#clear-filters-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      STATE.filters = { seats: null, type: null, material: null, color: null };
      STATE.q = '';
      var search = $('#catalog-search');
      if (search) search.value = '';
      $all('.chip').forEach(function (c) { c.classList.remove('active'); });
      renderGrid(grid, sofas);
    });
  }
  /* ---------- Product modal ---------- */
  function openModal(id) {
    var sofa = CATALOG.filter(function (s) { return s.id === id; })[0];
    if (!sofa) return;
    var modal = $('#product-modal');
    if (!modal) return;
    var img = $('#modal-image');
    var thumbWrap = $('#modal-thumbs');
    img.src = sofa.photos[0];
    img.alt = sofa.name;
    if (sofa.photos.length > 1) {
      thumbWrap.hidden = false;
      thumbWrap.innerHTML = sofa.photos.map(function (p, i) {
        return '<button type="button" class="modal-thumb' + (i === 0 ? ' active' : '') +
          '" data-photo="' + esc(p) + '" aria-label="Photo ' + (i + 1) + ' of ' +
          esc(sofa.name) + '"><img src="' + esc(p) + '" alt="" loading="lazy"></button>';
      }).join('');
    } else {
      thumbWrap.hidden = true;
      thumbWrap.innerHTML = '';
    }
    $('#modal-title').textContent = sofa.name;
    $('#modal-price').innerHTML = sofa.price != null
      ? '$' + sofa.price.toLocaleString('en-CA') + ' <span class="price-note">CAD</span>'
      : '<span class="price-note">Message us for this price</span>';
    var meta = [];
    if (sofa.seats) meta.push(esc(sofa.seats) + '-Seater');
    if (sofa.type) meta.push(esc(sofa.type));
    if (sofa.material) meta.push(esc(sofa.material));
    if (sofa.color) meta.push(esc(sofa.color));
    $('#modal-meta').innerHTML = meta.length
      ? meta.map(function (m) { return '<span class="tag">' + m + '</span>'; }).join('')
      : '';
    $('#modal-desc').textContent = sofa.desc ||
      'Premium sofa from our Montreal collection. Quality-checked, delivered to your door, and payable after inspection.';
    var msg = "Hi Montreal Sofa Co.! I'm interested in the " + sofa.name +
      " (" + priceText(sofa) + "). Is it still available?";
    var waBtn = $('#modal-wa-btn');
    if (WA_READY) {
      waBtn.setAttribute('href', waLink(msg));
      waBtn.setAttribute('data-wa-link', waLink(msg));
      waBtn.removeAttribute('aria-disabled');
    } else {
      waBtn.setAttribute('href', '#');
      waBtn.setAttribute('aria-disabled', 'true');
    }
    modal.hidden = false;
    document.body.classList.add('modal-open');
    var closeBtn = $('.modal-close', modal);
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    var modal = $('#product-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function bindModal() {
    var modal = $('#product-modal');
    if (!modal) return;
    modal.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-modal-close]')) { closeModal(); return; }
      var thumb = ev.target.closest('.modal-thumb');
      if (thumb) {
        $('#modal-image').src = thumb.getAttribute('data-photo');
        $all('.modal-thumb', modal).forEach(function (t) { t.classList.remove('active'); });
        thumb.classList.add('active');
      }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeModal();
    });
  }

  /* ---------- Store config ---------- */
  var CATALOG = [];

  function applyStoreConfig(store) {
    if (!store) return;
    WA_READY = !!(store.whatsappConfigured && store.whatsappNumber);
    WA_NUMBER = WA_READY ? String(store.whatsappNumber).replace(/[^0-9]/g, '') : '';
    if (store.whatsappDefaultMessage) DEFAULT_WA_MESSAGE = store.whatsappDefaultMessage;

    var area = store.deliveryArea || 'Montreal & surrounding areas';
    var areas = Array.isArray(store.deliveryAreasList) ? store.deliveryAreasList : [];
    var areaWrap = $('#delivery-areas');
    if (areaWrap && areas.length) {
      areaWrap.innerHTML = areas.map(function (a) {
        return '<span class="area-chip"><svg width="15" height="15"><use href="#i-pin"/></svg>' +
          esc(a) + '</span>';
      }).join('') +
      '<span class="area-chip area-note">+ surrounding areas</span>';
    }
    var cArea = $('#contact-area');
    if (cArea) cArea.textContent = area;
    var fArea = $('#footer-area');
    if (fArea) fArea.textContent = area;
    var tagline = store.tagline;
    if (tagline) {
      var fTag = $('#footer-tagline');
      if (fTag) fTag.textContent = tagline;
    }
    var hours = store.deliveryHours;
    if (hours) {
      var cHours = $('#contact-hours');
      if (cHours) cHours.textContent = hours;
    }
    var waDisplay = store.whatsappDisplay;
    if (waDisplay && WA_READY) {
      var cWa = $('#contact-wa-number');
      if (cWa) cWa.textContent = waDisplay;
    }
    var yearEl = $('#copyright-year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  /* ---------- Page init ---------- */
  function initCatalogPage(sofas) {
    var grid = $('#catalog-grid');
    if (!grid) return;
    buildFilters(sofas);
    bindFilterClicks(sofas, grid);
    bindClearButton(sofas, grid);
    bindModal();

    var search = $('#catalog-search');
    if (search) {
      var pre = paramValue('q');
      if (pre) { STATE.q = pre; search.value = pre; }
      search.addEventListener('input', debounce(function () {
        STATE.q = search.value;
        renderGrid(grid, sofas);
      }, 160));
    }
    var sort = $('#catalog-sort');
    if (sort) {
      sort.addEventListener('change', function () {
        STATE.sort = sort.value;
        renderGrid(grid, sofas);
      });
    }
    ['type', 'material', 'seats', 'color'].forEach(function (key) {
      var v = paramValue(key);
      if (v) STATE.filters[key] = v;
    });
    renderGrid(grid, sofas);
    $all('.chip').forEach(function (c) {
      var k = c.getAttribute('data-filter');
      var v = c.getAttribute('data-value');
      c.classList.toggle('active', STATE.filters[k] === v);
    });
  }

  function initIndexPage(sofas) {
    var featuredGrid = $('#featured-grid');
    if (!featuredGrid) return;
    var featured = sofas.slice(0, 8);
    featuredGrid.innerHTML = featured.map(function (s) { return cardHtml(s); }).join('');
  }

  /* ---------- Shared chrome (mobile menu) ---------- */
  function initChrome() {
    var toggle = $('#nav-toggle');
    var nav = $('#main-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      });
      nav.addEventListener('click', function (ev) {
        if (ev.target.closest('.nav-link')) {
          nav.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  /* ---------- Boot ---------- */
  function boot() {
    initChrome();
    Promise.all([
      fetchJson('data/store.json'),
      fetchJson('data/sofas.json')
    ]).then(function (results) {
      var store = results[0];
      var sofas = normalizeSofas(results[1]);
      CATALOG = sofas;
      applyStoreConfig(store);
      initCatalogPage(sofas);
      initIndexPage(sofas);
    }).catch(function (err) {
      console.error('Montreal Sofa Co.: failed to load site data', err);
      var grid = $('#catalog-grid') || $('#featured-grid');
      if (grid) {
        grid.innerHTML = '<p class="noscript-note">We could not load the catalogue. ' +
          'Please refresh the page in a moment.</p>';
      }
      var meta = $('#results-count');
      if (meta) meta.textContent = 'Catalogue unavailable';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Debug/test hooks (harmless in production) */
  window.MSC = {
    STATE: STATE,
    normalizeSofas: normalizeSofas,
    applyFilters: applyFilters,
    getCatalog: function () { return CATALOG; }
  };
})();
