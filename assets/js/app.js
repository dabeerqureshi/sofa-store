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

  /* Like fetchJson but aborts the request after `ms` so a slow/hung network
     request can never leave the catalog stuck on "Loading…". */
  function fetchJsonWithTimeout(url, ms) {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch unavailable for ' + url));
    }
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = null;
    if (ctrl && ms > 0) {
      timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms);
    }
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + ' ' + url);
        return r.json();
      })
      .then(function (data) {
        if (timer) clearTimeout(timer);
        return data;
      }, function (err) {
        if (timer) clearTimeout(timer);
        throw err;
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
    var url = link.getAttribute('data-wa-link') || waLink(DEFAULT_WA_MESSAGE);
    if (url) window.open(url, '_blank', 'noopener');
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
  function priceHtml() {
    return '<span class="price-contact">Contact for Pricing</span>';
  }

  function waMessage(sofa) {
    return "Hi Montreal Sofa Co.! I'm interested in the " + sofa.name +
      ". Is it available for Sunday delivery in Montreal? I'll pay cash on delivery - could you share the price?";
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
    var waMsg = waMessage(sofa);
    var waHref = waLink(waMsg);
    var waBtn = waHref
      ? '<a class="btn btn-wa btn-block" data-wa-link href="' + esc(waHref) + '" rel="noopener" aria-label="Order ' + esc(sofa.name) + ' on WhatsApp">' +
        '<svg width="17" height="17"><use href="#i-wa"/></svg>Order on WhatsApp</a>'
      : '<a class="btn btn-wa btn-block" data-wa-link href="#" aria-disabled="true" aria-label="Order ' + esc(sofa.name) + ' on WhatsApp">' +
        '<svg width="17" height="17"><use href="#i-wa"/></svg>Order on WhatsApp</a>';
    return (
      '<article class="sofa-card" data-id="' + esc(sofa.id) + '">' +
        '<div class="sofa-media">' + photoCount +
          '<button type="button" class="sofa-media-btn" data-sofa="' + esc(sofa.id) + '" ' +
            'aria-label="View details for ' + esc(sofa.name) + '">' +
            '<img src="' + esc(sofa.photos[0]) + '" alt="' + esc(sofa.name) + '" loading="lazy" width="600" height="450">' +
          '</button>' +
          '<a class="img-dl" href="' + esc(sofa.photos[0]) + '" download="' + esc(downloadName(sofa, sofa.photos[0], 0)) + '"' +
            ' aria-label="Download photo of ' + esc(sofa.name) + '" title="Download photo">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          '</a>' +
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
    observeReveal(root);
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
      updateFilterUi();
      closeFiltersOnMobile();
    });
  }

  function bindClearButton(sofas, grid) {
    var btn = $('#clear-filters-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      clearAllFilters(sofas, grid, true);
    });
  }

  /* ---------- Collapsible filter panel + active pills ---------- */
  var FILTER_KEYS = ['seats', 'type', 'material', 'color'];

  function activeFilterCount() {
    var n = 0;
    FILTER_KEYS.forEach(function (k) { if (STATE.filters[k]) n++; });
    return n;
  }

  function setFiltersOpen(open) {
    var panel = $('#filter-panel');
    var toggle = $('#filter-toggle');
    if (panel) panel.classList.toggle('open', open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function filtersOpen() {
    var panel = $('#filter-panel');
    return !!(panel && panel.classList.contains('open'));
  }

  function closeFiltersOnMobile() {
    if (!filtersOpen()) return;
    var mobile = window.matchMedia &&
      window.matchMedia('(max-width: 760px)').matches;
    if (mobile) setFiltersOpen(false);
  }

  function renderActivePills() {
    var wrap = $('#active-pills');
    if (!wrap) return;
    var pills = FILTER_KEYS.map(function (k) {
      var v = STATE.filters[k];
      if (!v) return '';
      var label = k === 'seats' ? v + ' seats' : v;
      return '<button type="button" class="pill" data-filter="' + k +
        '" data-value="' + esc(v) + '" aria-label="Remove filter ' + esc(label) + '">' +
        esc(label) +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>';
    }).join('');
    wrap.innerHTML = pills;
    wrap.hidden = !pills;
  }

  function updateFilterUi() {
    var n = activeFilterCount();
    var badge = $('#filter-badge');
    if (badge) { badge.textContent = String(n); badge.hidden = n === 0; }
    var toggle = $('#filter-toggle');
    if (toggle) toggle.classList.toggle('has-active', n > 0);
    var clearBtn = $('#filter-clear');
    if (clearBtn) clearBtn.hidden = n === 0;
    renderActivePills();
  }

  function clearAllFilters(sofas, grid, includeSearch) {
    STATE.filters = { seats: null, type: null, material: null, color: null };
    if (includeSearch) {
      STATE.q = '';
      var search = $('#catalog-search');
      if (search) search.value = '';
    }
    $all('.chip').forEach(function (c) { c.classList.remove('active'); });
    renderGrid(grid, sofas);
    updateFilterUi();
  }

  function initFilterPanel(sofas, grid) {
    var toggle = $('#filter-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      setFiltersOpen(!filtersOpen());
    });
    var clearBtn = $('#filter-clear');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      clearAllFilters(sofas, grid, false);
    });
    var pills = $('#active-pills');
    if (pills) pills.addEventListener('click', function (ev) {
      var pill = ev.target.closest ? ev.target.closest('.pill') : null;
      if (!pill) return;
      STATE.filters[pill.getAttribute('data-filter')] = null;
      $all('.chip').forEach(function (c) {
        var k = c.getAttribute('data-filter');
        var v = c.getAttribute('data-value');
        c.classList.toggle('active', STATE.filters[k] === v);
      });
      renderGrid(grid, sofas);
      updateFilterUi();
    });
    var fromUrl = FILTER_KEYS.some(function (k) { return paramValue(k); });
    if (fromUrl) setFiltersOpen(true);
    updateFilterUi();
  }
  /* ---------- Product modal ---------- */
  function downloadName(sofa, photo, index) {
    var base = String(sofa.name || 'sofa').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sofa';
    var ext = String(photo).split('.').pop().toLowerCase();
    if (!/^[a-z0-9]{2,5}$/.test(ext)) ext = 'jpg';
    return base + '-' + (index + 1) + '.' + ext;
  }

  function setModalPhoto(sofa, photo) {
    var idx = sofa.photos.indexOf(photo);
    if (idx === -1) idx = 0;
    var dl = $('#modal-download');
    var full = $('#modal-full');
    if (dl) {
      dl.setAttribute('href', photo);
      dl.setAttribute('download', downloadName(sofa, photo, idx));
    }
    if (full) full.setAttribute('href', photo);
  }

  function openModal(id) {
    var sofa = CATALOG.filter(function (s) { return s.id === id; })[0];
    if (!sofa) return;
    var modal = $('#product-modal');
    if (!modal) return;
    var img = $('#modal-image');
    var thumbWrap = $('#modal-thumbs');
    modalSofa = sofa;
    if (resetModalWow) resetModalWow();
    img.src = sofa.photos[0];
    img.alt = sofa.name;
    setModalPhoto(sofa, sofa.photos[0]);
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
    $('#modal-price').innerHTML =
      '<span class="price-contact price-contact-lg">Contact for Pricing</span>';
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
    var msg = waMessage(sofa);
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
        var photo = thumb.getAttribute('data-photo');
        $('#modal-image').src = photo;
        if (modalSofa) setModalPhoto(modalSofa, photo);
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
  var modalSofa = null;
  var resetModalWow = null;

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
    var replyHours = store.hours;
    if (replyHours) {
      var cReply = $('#contact-wa-reply');
      if (cReply) cReply.textContent =
        'We reply quickly · ' + String(replyHours).replace(/\s+-\s+/, ' · ');
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
    initFilterPanel(sofas, grid);
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
    updateFilterUi();
  }

  function initIndexPage(sofas) {
    var featuredGrid = $('#featured-grid');
    if (!featuredGrid) return;
    var featured = sofas.slice(0, 12);
    featuredGrid.innerHTML = featured.map(function (s) { return cardHtml(s); }).join('');
  }

  function updateStockCount(sofas) {
    $all('[data-stock-count]').forEach(function (el) {
      el.textContent = String(sofas.length);
    });
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
        document.body.classList.toggle('nav-open', open);
      });
      nav.addEventListener('click', function (ev) {
        if (ev.target.closest('.nav-link') || ev.target.closest('[data-wa-link]')) {
          nav.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          document.body.classList.remove('nav-open');
        }
      });
      document.addEventListener('click', function (ev) {
        if (!nav.classList.contains('open')) return;
        if (ev.target.closest('#main-nav') || ev.target.closest('#nav-toggle')) return;
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('nav-open');
      });
    }
  }

  /* ---------- Motion: reveals, counters, scroll chrome ---------- */
  var REDUCED_MOTION = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function observeReveal(root) {
    var nodes = $all('.reveal', root || document);
    if (!nodes.length) return;
    if (REDUCED_MOTION || !('IntersectionObserver' in window)) {
      nodes.forEach(function (n) { n.classList.add('in-view'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });
    nodes.forEach(function (n) {
      if (!n.classList.contains('in-view')) io.observe(n);
    });
  }

  function animateStockCounters(total) {
    if (!total) return;
    $all('[data-stock-count]').forEach(function (el) {
      if (REDUCED_MOTION || typeof requestAnimationFrame !== 'function') {
        el.textContent = String(total);
        return;
      }
      var t0 = null;
      var dur = 1100;
      function tick(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(eased * total));
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  function initMotion() {
    var header = $('.site-header');
    var toTop = $('#to-top');
    function onScroll() {
      var y = (document.documentElement && document.documentElement.scrollTop) ||
        (window.pageYOffset || 0);
      if (header) header.classList.toggle('scrolled', y > 10);
      if (toTop) toTop.classList.toggle('show', y > 640);
      var bar = $('#scroll-progress');
      if (bar) {
        var sh = (document.documentElement && document.documentElement.scrollHeight) || 0;
        var h = sh - (window.innerHeight || 0);
        bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
      }
    }
    if (window.addEventListener) window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    if (toTop) {
      toTop.addEventListener('click', function () {
        if (window.scrollTo) window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
      });
    }
    observeReveal(document);
  }

  /* ---------- Wow layer: 3D tilt, loupe, room view, magnetic ---------- */
  function initWow() {
    var fine = !!(window.matchMedia &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches);

    if (fine && !REDUCED_MOTION) {
      var tiltCard = null, tiltRaf = null, lastEv = null;
      document.addEventListener('pointermove', function (ev) {
        var card = ev.target && ev.target.closest ? ev.target.closest('.sofa-card') : null;
        if (card !== tiltCard) {
          if (tiltCard) tiltCard.style.transform = '';
          tiltCard = card;
        }
        if (!tiltCard) return;
        lastEv = ev;
        if (tiltRaf) return;
        tiltRaf = requestAnimationFrame(function () {
          tiltRaf = null;
          if (!tiltCard || !lastEv) return;
          var r = tiltCard.getBoundingClientRect();
          var px = (lastEv.clientX - r.left) / r.width - 0.5;
          var py = (lastEv.clientY - r.top) / r.height - 0.5;
          tiltCard.style.transform = 'perspective(900px) rotateX(' + (-py * 7).toFixed(2) +
            'deg) rotateY(' + (px * 9).toFixed(2) + 'deg) translateY(-4px)';
          tiltCard.style.setProperty('--gx', ((px + 0.5) * 100).toFixed(1) + '%');
          tiltCard.style.setProperty('--gy', ((py + 0.5) * 100).toFixed(1) + '%');
        });
      });
      document.addEventListener('pointerout', function (ev) {
        if (!tiltCard) return;
        var from = ev.target && ev.target.closest ? ev.target.closest('.sofa-card') : null;
        var to = ev.relatedTarget && ev.relatedTarget.closest ? ev.relatedTarget.closest('.sofa-card') : null;
        if (from === tiltCard && to !== tiltCard) {
          tiltCard.style.transform = '';
          tiltCard = null;
        }
      });

      var wa = $('.wa-float');
      if (wa) {
        document.addEventListener('pointermove', function (ev) {
          var r = wa.getBoundingClientRect();
          var dx = ev.clientX - (r.left + r.width / 2);
          var dy = ev.clientY - (r.top + r.height / 2);
          if (dx * dx + dy * dy < 19600) {
            wa.style.transform = 'translate(' + (dx * 0.18).toFixed(1) + 'px,' + (dy * 0.18).toFixed(1) + 'px)';
          } else if (wa.style.transform) {
            wa.style.transform = '';
          }
        });
      }
    }

    bindModalWow(fine);
  }

  function bindModalWow(fine) {
    var fig = $('.modal-figure');
    var img = $('#modal-image');
    var panel = $('.modal-panel');
    var roomBtn = $('#modal-room');
    if (!fig || !img) return;
    var lens = null, roomOn = false, roomRy = 0;

    function setRy(deg) {
      fig.style.setProperty('--ry', deg.toFixed(1) + 'deg');
      img.style.transform = 'rotateY(' + deg.toFixed(1) + 'deg) scale(1.03)';
    }
    function setRoom(on) {
      roomOn = on;
      if (panel) panel.classList.toggle('room-mode', on);
      if (roomBtn) {
        roomBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        roomBtn.classList.toggle('active', on);
      }
      if (!on) {
        roomRy = 0;
        fig.style.removeProperty('--ry');
        img.style.transform = '';
        img.classList.remove('zoomed');
      }
    }
    if (roomBtn) {
      roomBtn.addEventListener('click', function () { setRoom(!roomOn); });
    }
    resetModalWow = function () {
      setRoom(false);
      if (lens) lens.classList.remove('on');
    };

    var dragging = false, startX = 0, baseRy = 0;
    fig.addEventListener('pointerdown', function (ev) {
      if (!roomOn) return;
      dragging = true;
      startX = ev.clientX;
      baseRy = roomRy;
      fig.classList.add('dragging');
      if (fig.setPointerCapture) {
        try { fig.setPointerCapture(ev.pointerId); } catch (e) {}
      }
    });
    fig.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      roomRy = Math.max(-30, Math.min(30, baseRy + (ev.clientX - startX) * 0.18));
      setRy(roomRy);
    });
    fig.addEventListener('pointerup', function () {
      dragging = false;
      fig.classList.remove('dragging');
    });
    fig.addEventListener('pointercancel', function () {
      dragging = false;
      fig.classList.remove('dragging');
    });

    img.addEventListener('dblclick', function (ev) {
      if (roomOn) { setRy(0); return; }
      var zoomed = img.classList.toggle('zoomed');
      if (zoomed) {
        var r = img.getBoundingClientRect();
        img.style.transformOrigin =
          ((ev.clientX - r.left) / r.width * 100).toFixed(1) + '% ' +
          ((ev.clientY - r.top) / r.height * 100).toFixed(1) + '%';
      } else {
        img.style.transformOrigin = '';
      }
    });

    if (!fine) return;
    lens = document.createElement('div');
    lens.className = 'loupe';
    fig.appendChild(lens);
    var Z = 2.4, LR = 80;
    fig.addEventListener('pointermove', function (ev) {
      if (roomOn) { lens.classList.remove('on'); return; }
      var r = img.getBoundingClientRect();
      var fr = fig.getBoundingClientRect();
      var nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
      var s = Math.min(r.width / nw, r.height / nh);
      var dw = nw * s, dh = nh * s;
      var x = ev.clientX - r.left - (r.width - dw) / 2;
      var y = ev.clientY - r.top - (r.height - dh) / 2;
      if (x < 0 || y < 0 || x > dw || y > dh) { lens.classList.remove('on'); return; }
      lens.classList.add('on');
      lens.style.backgroundImage = 'url("' + img.src + '")';
      lens.style.backgroundSize = (dw * Z).toFixed(0) + 'px ' + (dh * Z).toFixed(0) + 'px';
      lens.style.backgroundPosition =
        (-(x * Z - LR)).toFixed(0) + 'px ' + (-(y * Z - LR)).toFixed(0) + 'px';
      lens.style.left = (ev.clientX - fr.left - LR) + 'px';
      lens.style.top = (ev.clientY - fr.top - LR) + 'px';
    });
    fig.addEventListener('pointerleave', function () {
      if (lens) lens.classList.remove('on');
    });
  }

  /* ---------- Boot ---------- */
  function loadData() {
    // data/store.js and data/sofas.js are loaded before app.js on both pages,
    // so window.MSC_STORE / window.MSC_DATA are the reliable, deterministic
    // source — they render instantly and work over file://, localhost,
    // sub-paths and custom domains. We then refresh from the JSON files in the
    // background as a progressive enhancement; rendering never waits on a
    // network request, so a slow/hung/blocked request can no longer blank the
    // catalog page.
    if (window.MSC_STORE && window.MSC_DATA) {
      refreshDataFromJson();
      return Promise.resolve([window.MSC_STORE, window.MSC_DATA]);
    }
    // Only reached if the embedded data scripts are missing. Guard every
    // request with a hard timeout so the catalog can never hang.
    return Promise.all([
      fetchJsonWithTimeout('data/store.json', 6000),
      fetchJsonWithTimeout('data/sofas.json', 6000)
    ]).catch(function (fetchErr) {
      if (window.MSC_STORE && window.MSC_DATA) {
        return [window.MSC_STORE, window.MSC_DATA];
      }
      throw fetchErr;
    });
  }

  /* Background refresh from the JSON files (never blocking, never fatal). */
  function refreshDataFromJson() {
    if (typeof fetch !== 'function') return;
    Promise.all([
      fetchJsonWithTimeout('data/store.json', 6000),
      fetchJsonWithTimeout('data/sofas.json', 6000)
    ]).then(function (results) {
      var sofas = normalizeSofas(results[1]);
      if (!sofas.length) return; // keep the already-rendered embedded data
      CATALOG = sofas;
      applyStoreConfig(results[0]);
      var grid = $('#catalog-grid');
      if (grid) renderGrid(grid, CATALOG);
      var featured = $('#featured-grid');
      if (featured) {
        featured.innerHTML = CATALOG.slice(0, 12)
          .map(function (s) { return cardHtml(s); }).join('');
      }
      updateStockCount(CATALOG);
    }).catch(function (err) {
      // Non-fatal: embedded data already rendered the page.
      if (window.console && console.debug) {
        console.debug('Montreal Sofa Co.: JSON refresh skipped', err);
      }
    });
  }

  /* Run a boot step and isolate any error so it can never stop the rest of
     the page (including the catalog) from rendering. */
  function safeInit(fn) {
    try { fn(); } catch (err) {
      if (window.console && console.error) {
        console.error('Montreal Sofa Co.: init step failed', err);
      }
    }
  }

  function boot() {
    // Each chrome/motion step is isolated so a failure in one subsystem can
    // never prevent the catalog from rendering.
    safeInit(initChrome);
    safeInit(initMotion);
    safeInit(initWow);
    loadData().then(function (results) {
      var store = results[0];
      var sofas = normalizeSofas(results[1]);
      if (!sofas.length) throw new Error('catalog data contains no sofas');
      CATALOG = sofas;
      applyStoreConfig(store);
      initCatalogPage(sofas);
      initIndexPage(sofas);
      updateStockCount(sofas);
      animateStockCounters(sofas.length);
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
    getCatalog: function () { return CATALOG; },
    cardHtml: cardHtml,
    waMessage: waMessage
  };
})();
