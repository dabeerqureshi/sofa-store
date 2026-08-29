/* ============================================================
   Montreal Sofa Co. — app.js
   Loads store config + sofa catalog from JSON, renders the grid,
   handles search/filter/sort, WhatsApp links and the detail modal.
   ============================================================ */
(function () {
  "use strict";

  var store = null;
  var sofas = [];
  var state = { query: "", seats: "all", type: "all", material: "all", color: "all", sort: "featured" };

  function $(sel) { return document.querySelector(sel); }
  var grid = $("#sofaGrid");
  var emptyState = $("#emptyState");

  /* ---------- helpers ---------- */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function waIcon() {
    return '<svg class="ic" aria-hidden="true"><use href="#i-wa"/></svg>';
  }

  function formatPrice(price) {
    return "$" + Number(price).toLocaleString("en-CA");
  }

  /* ---------- WhatsApp ---------- */
  function waNumber() {
    return store && store.whatsappNumber ? store.whatsappNumber : "00000000000";
  }

  function waConfigured() {
    return !!(store && store.whatsappConfigured &&
      /^\d{7,15}$/.test(store.whatsappNumber));
  }

  function waLink(message) {
    return "https://wa.me/" + waNumber() + "?text=" + encodeURIComponent(message);
  }

  function sofaMessage(sofa) {
    var txt = "Hi " + store.businessName + ', I\'m interested in the "' + sofa.name + '"';
    if (sofa.price) {
      txt += " (listed at " + formatPrice(sofa.price) + " CAD)";
    }
    txt += ". Is it still available?";
    return txt;
  }

  function generalMessage() {
    return "Hi " + store.businessName +
      ", I'd like to know more about your sofas and delivery options.";
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function showToast(msg) {
    var el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-visible"); }, 3400);
  }

  /* ---------- static sections ---------- */
  function iconFor(key) {
    var icons = {
      truck: '<svg class="ic" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M1.5 12.5h3l2.5-6 4 12 3-8 2 2h6.5M15 5.5h3l4.5 4.5v5h-7.5m-12 .5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm13.5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>',
      shield: '<svg class="ic" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M12 2 4 5.5v5.1c0 4.9 3.4 9.5 8 10.9 4.6-1.4 8-6 8-10.9V5.5L12 2z"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="m8.6 12 2.2 2.2 4.6-4.6"/></svg>',
      eye: '<svg class="ic" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
      chat: '<svg class="ic" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
    };
    return icons[key] || icons.chat;
  }

  function renderWhy() {
    var html = "";
    (store.valueProps || []).forEach(function (p) {
      html += '<div class="why-card">' +
        '<div class="why-icon">' + iconFor(p.icon) + "</div>" +
        "<h3>" + escapeHtml(p.title) + "</h3>" +
        "<p>" + escapeHtml(p.text) + "</p></div>";
    });
    $("#whyGrid").innerHTML = html;
    var area = (store.deliveryAreas || []).slice(0, 4).join(", ");
    $("#whySub").textContent =
      "Quality checked. Delivered to your door. Serving " +
      (area.length ? area : store.city) + " & more.";
  }

  function renderHow() {
    var html = "";
    (store.howItWorks || []).forEach(function (h) {
      html += '<div class="how-card">' +
        '<span class="how-step">' + escapeHtml(h.step) + "</span>" +
        "<h3>" + escapeHtml(h.title) + "</h3>" +
        "<p>" + escapeHtml(h.text) + "</p></div>";
    });
    $("#howGrid").innerHTML = html;
  }

  function renderContact() {
    $("#serviceArea").textContent = (store.deliveryAreas || []).join(", ");
    $("#storeHours").textContent = store.hours || "";
    $("#deliveryNote").textContent = store.deliveryNote || "";
    $("#footerArea").textContent = "Serving: " + (store.deliveryAreas || []).join(", ");
    $("#footerHours").textContent = "Hours: " + (store.hours || "");
    $("#waBtnText").textContent =
      "Chat on WhatsApp (" + (store.whatsappDisplay || store.whatsappNumber || "") + ")";
    var hero = $("#heroImg");
    if (store.heroImage && hero) { hero.src = store.heroImage; }
    $("#year").textContent = new Date().getFullYear();
  }
  /* ---------- catalog render ---------- */
  function fillSelect(sel, values, firstLabel) {
    var html = '<option value="all">' + escapeHtml(firstLabel) + "</option>";
    values.forEach(function (v) {
      html += '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + "</option>";
    });
    sel.innerHTML = html;
  }

  function buildOptions() {
    var types = {}, mats = {}, colors = {};
    sofas.forEach(function (s) {
      if (s.type) types[s.type] = true;
      if (s.material) mats[s.material] = true;
      if (s.color) colors[s.color] = true;
    });
    fillSelect($("#typeSelect"), Object.keys(types).sort(), "All types");
    fillSelect($("#materialSelect"), Object.keys(mats).sort(), "All materials");
    fillSelect($("#colorSelect"), Object.keys(colors).sort(), "All colors");
  }

  function filtered() {
    var q = state.query.trim().toLowerCase();
    return sofas.filter(function (s) {
      if (state.seats !== "all" && String(s.seats || "") !== state.seats) return false;
      if (state.type !== "all" && s.type !== state.type) return false;
      if (state.material !== "all" && s.material !== state.material) return false;
      if (state.color !== "all" && s.color !== state.color) return false;
      if (q) {
        var hay = (s.name + " " + (s.type || "") + " " + (s.material || "") + " " +
          (s.color || "") + " " + (s.source || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sorted(list) {
    var arr = list.slice();
    if (state.sort === "price-asc" || state.sort === "price-desc") {
      var sign = state.sort === "price-asc" ? 1 : -1;
      arr.sort(function (a, b) {
        var ap = a.price ? 1 : 0, bp = b.price ? 1 : 0;
        if (ap !== bp) return ap - bp; // priced items always first
        if (!ap && !bp) return a.name.localeCompare(b.name);
        return (a.price - b.price) * sign;
      });
    } else if (state.sort === "name") {
      arr.sort(function (a, b) { return a.name.localeCompare(b.name); });
    }
    return arr;
  }

  function cardHtml(s, i) {
    var chips = [];
    if (s.seats) chips.push(String(s.seats) + "-Seater");
    if (s.material) chips.push(s.material);
    if (s.color) chips.push(s.color);
    var chipHtml = chips.map(function (c) {
      return '<span class="meta-chip">' + escapeHtml(c) + "</span>";
    }).join("");

    var priceHtml = s.price
      ? '<p class="sofa-price"><span class="cur">' + (store.currency || "CAD") + ' </span>' +
        Number(s.price).toLocaleString("en-CA") + "</p>"
      : '<p class="sofa-price-request">Price on WhatsApp</p>';

    var tag = s.seats ? String(s.seats) + "-Seater" : (s.type || "Sofa");
    var tagHtml = s.price ? '<span class="sofa-price-tag">$' + s.price + "</span>" : "";

    return (
      '<article class="sofa-card" style="animation-delay:' + (i % 12) * 40 + 'ms">' +
      '<div class="sofa-media">' +
      '<span class="sofa-tag">' + escapeHtml(tag) + "</span>" +
      tagHtml +
      '<img src="' + escapeHtml(s.image) + '" alt="' + escapeHtml(s.name) +
      '" loading="lazy" width="1200" height="900" onerror="this.style.display=\'none\'" />' +
      "</div>" +
      '<div class="sofa-body">' +
      '<h3 class="sofa-name">' + escapeHtml(s.name) + "</h3>" +
      (chipHtml ? '<div class="sofa-meta">' + chipHtml + "</div>" : "") +
      priceHtml +
      '<div class="sofa-actions">' +
      '<button type="button" class="btn btn-outline btn-details" data-details="' + escapeHtml(s.id) + '">Details</button>' +
      '<a class="btn btn-wa" href="' + waLink(sofaMessage(s)) + '" target="_blank" rel="noopener" data-wa-sofa="' + escapeHtml(s.id) + '">' +
      waIcon() + "<span>WhatsApp</span></a>" +
      "</div></div></article>"
    );
  }

  function render() {
    var list = sorted(filtered());
    $("#resultCount").textContent = "Showing " + list.length + " of " + sofas.length + " sofas";
    emptyState.hidden = list.length > 0;
    grid.innerHTML = list.map(function (s, i) { return cardHtml(s, i); }).join("");
  }
  /* ---------- modal ---------- */
  var modal = $("#sofaModal");
  var modalBody = $("#modalBody");

  function specsHtml(s) {
    return '<div class="spec"><b>Type</b><span>' + escapeHtml(s.type || "Sofa") + "</span></div>" +
      '<div class="spec"><b>Seats</b><span>' + (s.seats ? s.seats + "-Seater" : "Not stated") + "</span></div>" +
      '<div class="spec"><b>Material</b><span>' + escapeHtml(s.material || "Not stated") + "</span></div>" +
      '<div class="spec"><b>Color</b><span>' + escapeHtml(s.color || "Not stated") + "</span></div>";
  }

  function priceBlock(s) {
    return s.price
      ? '<p class="modal-price"><span class="cur">' + (store.currency || "CAD") + " </span>" +
        Number(s.price).toLocaleString("en-CA") + "</p>"
      : '<p class="modal-price">Price on request</p>';
  }

  function openModal(id) {
    var s = sofas.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    modalBody.innerHTML =
      '<div class="modal-media"><img src="' + escapeHtml(s.image) + '" alt="' + escapeHtml(s.name) + '" /></div>' +
      '<div class="modal-details">' +
      '<h3 class="sofa-name" id="modalTitle">' + escapeHtml(s.name) + "</h3>" +
      priceBlock(s) +
      '<div class="modal-specs">' + specsHtml(s) + "</div>" +
      '<p class="modal-note">Additional photos, measurements and fabric details are available on WhatsApp.</p>' +
      '<div class="modal-actions">' +
      '<a class="btn btn-wa btn-lg" href="' + waLink(sofaMessage(s)) + '" target="_blank" rel="noopener" data-wa-sofa="' + escapeHtml(s.id) + '">' +
      waIcon() + "<span>Order on WhatsApp</span></a>" +
      '<p class="modal-note">Home delivery &bull; Inspect before you pay</p>' +
      "</div></div>";
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    modal.querySelector(".modal-close").focus();
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  /* ---------- events ---------- */
  grid.addEventListener("click", function (e) {
    var detailBtn = e.target.closest("[data-details]");
    if (detailBtn) { openModal(detailBtn.getAttribute("data-details")); return; }
    var wa = e.target.closest("[data-wa-sofa]");
    if (wa && !waConfigured()) {
      e.preventDefault();
      showToast("WhatsApp number is not set yet - the owner will configure it shortly.");
    }
  });

  modal.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  document.querySelectorAll("[data-wa-link]").forEach(function (a) {
    a.setAttribute("href", waLink(generalMessage()));
    if (!waConfigured()) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        showToast("WhatsApp number is not set yet - the owner will configure it shortly.");
      });
    }
  });
  /* chips / selects / toolbar */
  document.querySelectorAll(".seats-filter .chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      document.querySelectorAll(".seats-filter .chip").forEach(function (c) {
        var active = c === chip;
        c.classList.toggle("is-active", active);
        c.setAttribute("aria-pressed", active ? "true" : "false");
      });
      state.seats = chip.getAttribute("data-seats");
      render();
    });
  });

  [["searchInput", "input", "query"], ["typeSelect", "change", "type"],
   ["materialSelect", "change", "material"], ["colorSelect", "change", "color"],
   ["sortSelect", "change", "sort"]].forEach(function (cfg) {
    var el = $("#" + cfg[0]);
    if (!el) return;
    el.addEventListener(cfg[1], function () { state[cfg[2]] = el.value; render(); });
  });

  $("#clearFilters").addEventListener("click", function () {
    state.query = ""; state.seats = "all"; state.type = "all";
    state.material = "all"; state.color = "all"; state.sort = "featured";
    $("#searchInput").value = "";
    $("#typeSelect").value = "all";
    $("#materialSelect").value = "all";
    $("#colorSelect").value = "all";
    $("#sortSelect").value = "featured";
    document.querySelectorAll(".seats-filter .chip").forEach(function (c) {
      var active = c.getAttribute("data-seats") === "all";
      c.classList.toggle("is-active", active);
      c.setAttribute("aria-pressed", active ? "true" : "false");
    });
    render();
  });

  /* navigation */
  var navToggle = $("#navToggle");
  var siteNav = $("#siteNav");
  navToggle.addEventListener("click", function () {
    var open = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  siteNav.addEventListener("click", function (e) {
    if (e.target.tagName === "A") {
      siteNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });

  window.addEventListener("scroll", function () {
    document.querySelector(".site-header").classList.toggle("is-scrolled", window.scrollY > 10);
  }, { passive: true });

  /* ---------- init ---------- */
  Promise.all([
    fetch("data/store.json").then(function (r) { return r.json(); }),
    fetch("data/sofas.json").then(function (r) { return r.json(); })
  ]).then(function (results) {
    store = results[0];
    sofas = (results[1].sofas || []).filter(function (s) { return s.available !== false; });
    renderWhy();
    renderHow();
    renderContact();
    buildOptions();
    render();
  }).catch(function (err) {
    grid.innerHTML =
      '<div class="empty-state"><h3>Could not load the catalog</h3>' +
      "<p>Please try refreshing. If the problem continues, contact the store owner.</p></div>";
    console.error("Catalog load failed:", err);
  });
})();