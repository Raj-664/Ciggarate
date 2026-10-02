/* Cig Diary - application logic (upgraded) */
(function () {
  'use strict';

  /* ============================ State ============================ */
  const state = {
    brands: [],
    cigarettes: [],
    packs: [],
    loosePurchases: [],
    calMonth: null,
    calSelected: null,
    brandTab: 'cigarettes',
    reportMonth: null,
    statsSort: 'cigarettes',
    search: { q: '', range: 'all', type: 'all', brand: 'all', from: '', to: '' },
    formPhoto: { cigarette: null, pack: null, brand: null },
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const CURRENCIES = ['\u20B9', '$', '\u20AC', '\u00A3', '\u00A5'];

  const settings = {
    profile_name: 'My Cigarette Tracker',
    currency: CURRENCIES[0],
    default_price: 9,
    default_pack_size: 20,
    theme: 'dark',
    reminder_enabled: false,
    reminder_time: '21:00',
  };

  /* ============================ Utils ============================ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dateToStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return dateToStr(new Date()); }
  function nowTimeStr() { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function strToDate(s) { const p = String(s).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); }

  function formatDate(s) {
    if (!s) return '';
    const d = strToDate(s);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatTime(t) {
    if (!t) return '';
    const p = String(t).split(':');
    let h = parseInt(p[0], 10);
    const m = p[1] || '00';
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + m + ' ' + ap;
  }

  function money(n) {
    const v = Number(n) || 0;
    const rounded = Math.round(v * 100) / 100;
    const str = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
    return settings.currency + str;
  }

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function daysBetween(a, b) { return Math.floor((strToDate(b) - strToDate(a)) / 86400000); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function fv(form, name) {
    const el = form.elements && form.elements.namedItem ? form.elements.namedItem(name) : form[name];
    return el && 'value' in el ? el.value : '';
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 1900);
  }

  function confirmAction(message, confirmLabel) {
    return new Promise((resolve) => {
      const overlay = $('#overlay');
      const sheet = $('#sheet');
      const content = $('#sheet-content');
      content.innerHTML =
        '<p class="sheet-title">' + esc(message) + '</p>' +
        '<button class="btn btn-danger btn-block" data-confirm="yes" style="margin-bottom:10px">' + esc(confirmLabel || 'Delete') + '</button>' +
        '<button class="btn btn-ghost btn-block" data-confirm="no">Cancel</button>';
      overlay.classList.remove('hidden');
      sheet.classList.remove('hidden');
      function done(val) {
        overlay.classList.add('hidden');
        sheet.classList.add('hidden');
        content.removeEventListener('click', handler);
        resolve(val);
      }
      function handler(e) {
        const b = e.target.closest('[data-confirm]');
        if (!b) return;
        done(b.getAttribute('data-confirm') === 'yes');
      }
      content.addEventListener('click', handler);
    });
  }

  /* ============================ Settings persistence ============================ */
  function loadSettings() {
    try {
      const raw = localStorage.getItem('cig_settings');
      if (raw) Object.assign(settings, JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }
  function saveSettings() {
    try { localStorage.setItem('cig_settings', JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }
  function applyTheme() {
    const light = settings.theme === 'light';
    document.body.classList.toggle('light', light);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#f2f4fb' : '#070a16');
  }

  /* ============================ Images ============================ */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  async function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 1000;
    quality = quality || 0.82;
    const dataUrl = await readFile(file);
    if (!file.type || file.type.indexOf('image/') !== 0) return dataUrl;
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return dataUrl;
    const img = await loadImage(dataUrl);
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const isPng = file.type === 'image/png';
    try {
      return canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality);
    } catch (e) {
      return dataUrl;
    }
  }
  function openLightbox(src) {
    $('#lightbox-img').src = src;
    $('#lightbox').classList.remove('hidden');
  }

  /* ============================ Data ============================ */
  const DEFAULT_BRANDS = [
    { name: 'Gold Flake', description: 'Classic smooth blend', price: 6, pack: 120, sticks: 20 },
    { name: 'Marlboro', description: 'Bold full flavour', price: 10, pack: 200, sticks: 20 },
    { name: 'Classic Flake', description: 'Everyday classic', price: 5, pack: 100, sticks: 20 },
    { name: 'ESSE', description: 'Light and slim', price: 9, pack: 180, sticks: 20 },
    { name: 'Navy Cut', description: 'Traditional strong', price: 5, pack: 90, sticks: 20 },
  ];

  async function loadData() {
    const [brands, cigarettes, packs, loosePurchases] = await Promise.all([
      DB.all(DB.STORES.brands),
      DB.all(DB.STORES.cigarettes),
      DB.all(DB.STORES.packs),
      DB.all(DB.STORES.loose_purchases),
    ]);
    state.brands = brands.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    state.cigarettes = cigarettes;
    state.packs = packs;
    state.loosePurchases = loosePurchases;
    state.packs.forEach((p) => {
      if (p.remaining_quantity == null) p.remaining_quantity = Number(p.quantity) || 0;
    });
  }

  async function seedIfEmpty() {
    const brands = await DB.all(DB.STORES.brands);
    if (brands.length) return;
    const base = Date.now();
    const seeded = DEFAULT_BRANDS.map((b, i) => ({
      id: DB.uid() + i,
      name: b.name,
      photo: null,
      description: b.description,
      default_price: b.price,
      pack_price: b.pack,
      sticks_per_pack: b.sticks,
      created_at: base + i,
      updated_at: base + i,
    }));
    await DB.bulkPut(DB.STORES.brands, seeded);
  }

  function brandById(id) { return state.brands.find((b) => b.id === id) || null; }
  function cigsForBrand(id) { return state.cigarettes.filter((c) => c.brand_id === id); }
  function packsForBrand(id) { return state.packs.filter((p) => p.brand_id === id); }
  function looseForBrand(id) { return state.loosePurchases.filter((p) => p.brand_id === id); }
  function parseTime(t) {
    if (!t) return 0;
    const p = String(t).split(':');
    return ((parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0)) * 60000;
  }
  function recordStamp(rec) { return strToDate(rec.date).getTime() + parseTime(rec.time); }

  function brandStats(brand) {
    const cigs = cigsForBrand(brand.id);
    const packs = packsForBrand(brand.id);
    const loose = looseForBrand(brand.id);
    const packQty = packs.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const remaining = packs.reduce((s, p) => s + (Number(p.remaining_quantity) || 0), 0);
    const cigSpend = cigs.reduce((s, c) => s + (Number(c.price) || 0), 0);
    const packSpend = packs.reduce((s, p) => s + (Number(p.pack_price != null ? p.pack_price : p.price) || 0), 0);
    const looseSpend = loose.reduce((s, p) => s + (Number(p.total_price) || 0), 0);
    let last = 0;
    cigs.forEach((c) => { const t = recordStamp(c); if (t > last) last = t; });
    packs.forEach((p) => { const t = recordStamp(p); if (t > last) last = t; });
    loose.forEach((p) => { const t = recordStamp(p); if (t > last) last = t; });
    return {
      cigCount: cigs.length,
      packCount: packs.length,
      looseCount: loose.length,
      looseQty: loose.reduce((s, p) => s + (Number(p.quantity) || 0), 0),
      packQty,
      remaining,
      totalUnits: cigs.length,
      spent: cigSpend + packSpend + looseSpend,
      avgPrice: cigs.length ? cigSpend / cigs.length : null,
      last: last || null,
    };
  }

  function latestCigarette() {
    let best = null;
    state.cigarettes.forEach((c) => { if (!best || recordStamp(c) > recordStamp(best)) best = c; });
    return best;
  }

  /* ============================ Analytics ============================ */
  function monthRange() {
    const d = new Date();
    return [dateToStr(new Date(d.getFullYear(), d.getMonth(), 1)), dateToStr(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  }
  function yearRange() {
    const d = new Date();
    return [dateToStr(new Date(d.getFullYear(), 0, 1)), dateToStr(new Date(d.getFullYear(), 11, 31))];
  }
  function rangeSpend(range) {
    const cig = state.cigarettes
      .filter((c) => inRange(c.date, range))
      .reduce((s, c) => s + (Number(c.price) || 0), 0);
    const packs = state.packs
      .filter((p) => inRange(p.date, range))
      .reduce((s, p) => s + (Number(p.pack_price != null ? p.pack_price : p.price) || 0), 0);
    const loose = state.loosePurchases
      .filter((p) => inRange(p.date, range))
      .reduce((s, p) => s + (Number(p.total_price) || 0), 0);
    return cig + packs + loose;
  }
  function rangeCigarettes(range) {
    return state.cigarettes.filter((c) => inRange(c.date, range)).length;
  }

  function weekRange() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7;
    const start = new Date(d); start.setDate(d.getDate() - day);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return [dateToStr(start), dateToStr(end)];
  }
  function rangeForRangeKey(key) {
    const today = todayStr();
    if (key === 'today') return [today, today];
    if (key === 'yesterday') { const y = dateToStr(addDays(new Date(), -1)); return [y, y]; }
    if (key === 'week') return weekRange();
    if (key === 'month') return monthRange();
    if (key === 'custom') return [state.search.from || '', state.search.to || '']; // may be empty
    return null;
  }
  function inRange(date, range) {
    if (!range) return true;
    const [a, b] = range;
    if (a && date < a) return false;
    if (b && date > b) return false;
    return true;
  }

  function globalStats() {
    const today = todayStr();
    const week = weekRange();
    const month = monthRange();
    const year = yearRange();
    const todayRange = [today, today];

    const packQty = state.packs.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const looseQty = state.loosePurchases.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const totalConsumed = state.cigarettes.length;
    const cigSpend = state.cigarettes.reduce((s, c) => s + (Number(c.price) || 0), 0);
    const packSpend = state.packs.reduce((s, p) => s + (Number(p.pack_price != null ? p.pack_price : p.price) || 0), 0);
    const looseSpend = state.loosePurchases.reduce((s, p) => s + (Number(p.total_price) || 0), 0);
    const totalSpent = cigSpend + packSpend + looseSpend;

    const allDates = state.cigarettes.map((c) => c.date)
      .concat(state.packs.map((p) => p.date))
      .concat(state.loosePurchases.map((p) => p.date));
    let span = 1;
    if (allDates.length) {
      allDates.sort();
      span = Math.max(1, daysBetween(allDates[0], today) + 1);
    }

    return {
      todayCigs: rangeCigarettes(todayRange),
      todaySpend: rangeSpend(todayRange),
      weekCigs: rangeCigarettes(week),
      weekSpend: rangeSpend(week),
      monthCigs: rangeCigarettes(month),
      monthSpend: rangeSpend(month),
      yearCigs: rangeCigarettes(year),
      yearSpend: rangeSpend(year),
      totalCigsTotal: totalConsumed,
      totalIndividual: totalConsumed,
      totalPacks: state.packs.length,
      totalLoosePurchases: state.loosePurchases.length,
      purchasedPackCigs: packQty,
      purchasedLooseCigs: looseQty,
      totalSpent,
      cigSpend,
      packSpend,
      looseSpend,
      avgCigs: totalConsumed / span,
      avgSpend: totalSpent / span,
      span,
    };
  }

  function ActiveDates() { const set = new Set(); state.cigarettes.forEach((c) => set.add(c.date)); return set; }
  function recordDates() {
    const set = new Set();
    state.cigarettes.forEach((c) => set.add(c.date));
    state.packs.forEach((p) => set.add(p.date));
    state.loosePurchases.forEach((p) => set.add(p.date));
    return set;
  }

  function computeStreak() {
    const active = ActiveDates();
    const today = todayStr();
    const yesterday = dateToStr(addDays(new Date(), -1));
    let current = 0;
    let cursor = active.has(today) ? new Date() : (active.has(yesterday) ? addDays(new Date(), -1) : null);
    if (cursor) { while (active.has(dateToStr(cursor))) { current++; cursor = addDays(cursor, -1); } }
    const sorted = Array.from(active).sort();
    let longest = 0, run = 0, prev = null;
    sorted.forEach((d) => { run = (prev && daysBetween(prev, d) === 1) ? run + 1 : 1; if (run > longest) longest = run; prev = d; });
    if (current > longest) longest = current;
    return { current, longest, active, today };
  }

  function brandAnalytics() {
    return state.brands.map((b) => {
      const s = brandStats(b);
      return { brand: b, name: b.name, cigs: s.cigCount, packs: s.packCount, spent: s.spent, last: s.last, avgPrice: s.avgPrice };
    }).filter((r) => r.cigs > 0 || r.packs > 0);
  }

  function mostRecordedBrand() {
    const rows = brandAnalytics().slice().sort((a, b) => b.cigs - a.cigs);
    return rows[0] || null;
  }
  function mostExpensiveBrand() {
    const rows = brandAnalytics().filter((r) => r.avgPrice != null).sort((a, b) => b.avgPrice - a.avgPrice);
    return rows[0] || null;
  }
  function mostActiveDay() {
    const map = {};
    state.cigarettes.forEach((c) => { map[c.date] = (map[c.date] || 0) + 1; });
    const keys = Object.keys(map);
    if (!keys.length) return null;
    keys.sort((a, b) => map[b] - map[a] || (a < b ? 1 : -1));
    return { date: keys[0], count: map[keys[0]] };
  }

  /* ============================ Photo picker ============================ */
  function photoPickerHTML(key, dataUrl) {
    return '' +
      '<div class="photo-picker" data-photo-picker="' + key + '">' +
        (dataUrl ? '<img src="' + dataUrl + '" alt="preview" />' +
          '<button type="button" class="remove-photo" data-remove-photo="' + key + '" aria-label="Remove photo">&times;</button>' : '') +
        '<div class="ph-placeholder">' +
          '<div class="ph-icon">&#128247;</div>' +
          '<div class="ph-text">Tap to add a photo<small>Camera, gallery or file &bull; optional</small></div>' +
        '</div>' +
        '<input type="file" accept="image/*" data-photo-input="' + key + '" />' +
      '</div>';
  }

  function bindPhotoPickers(scope) {
    $$('[data-photo-input]', scope).forEach((input) => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const key = input.getAttribute('data-photo-input');
        try {
          const dataUrl = await compressImage(file);
          state.formPhoto[key] = dataUrl;
          const picker = $('[data-photo-picker="' + key + '"]', scope);
          let img = picker.querySelector('img');
          if (!img) { img = document.createElement('img'); picker.insertBefore(img, picker.firstChild); }
          img.src = dataUrl;
          if (!$('[data-remove-photo="' + key + '"]', picker)) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'remove-photo';
            btn.setAttribute('data-remove-photo', key);
            btn.innerHTML = '&times;';
            picker.insertBefore(btn, picker.firstChild);
          }
        } catch (err) {
          toast('Could not load that image');
        } finally {
          input.value = '';
        }
      });
    });

    $$('[data-remove-photo]', scope).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const key = btn.getAttribute('data-remove-photo');
        state.formPhoto[key] = false;
        const picker = $('[data-photo-picker="' + key + '"]', scope);
        const img = picker.querySelector('img');
        if (img) img.remove();
        btn.remove();
      });
    });
  }

  function resetFormPhotos() {
    state.formPhoto.cigarette = null;
    state.formPhoto.pack = null;
    state.formPhoto.brand = null;
  }

  function resolvePhoto(key, editing) {
    const v = state.formPhoto[key];
    if (v === false) return null;
    if (v) return v;
    return editing && editing.photo ? editing.photo : null;
  }

  /* ============================ Shared record rows ============================ */
  function cigRowHTML(c, brandName, opts) {
    opts = opts || {};
    const thumb = c.photo
      ? '<div class="record-thumb" data-lightbox="' + c.photo + '"><img src="' + c.photo + '" alt=""></div>'
      : '<div class="record-thumb">CIG</div>';
    return '' +
      '<div class="record">' + thumb +
        '<div class="record-main">' +
          '<div class="record-title">' + esc(opts.showBrand ? (brandName || 'Cigarette') : 'Cigarette') + '</div>' +
          '<div class="record-sub">' + formatDate(c.date) + ' &mdash; ' + formatTime(c.time) + '</div>' +
          (c.notes ? '<div class="record-note">' + esc(c.notes) + '</div>' : '') +
        '</div>' +
        '<div class="record-price">' + money(c.price) + '</div>' +
        '<div class="record-actions">' +
          '<button class="edit-btn" data-edit-cig="' + c.id + '" aria-label="Edit">' +
            '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>' +
          '</button>' +
          '<button class="del-btn" data-del-cig="' + c.id + '" aria-label="Delete">' +
            '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
  }

  function packRowHTML(p, brandName, opts) {
    opts = opts || {};
    const perCig = Number(p.quantity) > 0 ? Number(p.pack_price) / Number(p.quantity) : 0;
    const remaining = p.remaining_quantity == null ? Number(p.quantity) || 0 : Number(p.remaining_quantity);
    const thumb = p.photo
      ? '<div class="record-thumb" data-lightbox="' + p.photo + '"><img src="' + p.photo + '" alt=""></div>'
      : '<div class="record-thumb">PACK</div>';
    const inv = opts.showInventory
      ? '<div class="inv">' +
          '<span class="inv-label">Remaining</span>' +
          '<span class="inv-value">' + remaining + ' / ' + p.quantity + '</span>' +
          '<span class="stepper">' +
            '<button data-inv-dec="' + p.id + '" aria-label="Decrease">&minus;</button>' +
            '<button data-inv-inc="' + p.id + '" aria-label="Increase">+</button>' +
          '</span>' +
        '</div>'
      : '';
    return '' +
      '<div class="record' + (opts.showInventory ? ' record-stack' : '') + '">' +
        '<div class="record-line">' + thumb +
          '<div class="record-main">' +
            '<div class="record-title">' + esc(opts.showBrand ? (brandName || 'Pack') : 'Whole Pack') + '<span class="tag-pack">' + p.quantity + ' sticks</span></div>' +
            '<div class="record-sub">' + formatDate(p.date) + ' &mdash; ' + formatTime(p.time) + ' &bull; ' + money(perCig) + '/cig</div>' +
            (p.notes ? '<div class="record-note">' + esc(p.notes) + '</div>' : '') +
          '</div>' +
          '<div class="record-price">' + money(p.pack_price) + '</div>' +
          '<div class="record-actions">' +
            '<button class="edit-btn" data-edit-pack="' + p.id + '" aria-label="Edit">' +
              '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>' +
            '</button>' +
            '<button class="del-btn" data-del-pack="' + p.id + '" aria-label="Delete">' +
              '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' + inv +
      '</div>';
  }

  function looseRowHTML(p, brandName, opts) {
    opts = opts || {};
    const unit = Number(p.price_per_cigarette) || 0;
    const qty = Number(p.quantity) || 0;
    return '' +
      '<div class="record loose-record">' +
        '<div class="record-thumb loose-thumb">LOOSE</div>' +
        '<div class="record-main">' +
          '<div class="record-title">' + esc(opts.showBrand ? (brandName || 'Loose Purchase') : 'Loose Purchase') + '<span class="tag-loose">' + qty + ' sticks</span></div>' +
          '<div class="record-sub">' + formatDate(p.date) + ' &mdash; ' + formatTime(p.time) + ' &bull; ' + money(unit) + '/cig</div>' +
          (p.notes ? '<div class="record-note">' + esc(p.notes) + '</div>' : '') +
        '</div>' +
        '<div class="record-price">' + money(p.total_price) + '</div>' +
        '<div class="record-actions">' +
          '<button class="edit-btn" data-edit-loose="' + p.id + '" aria-label="Edit">&#9998;</button>' +
          '<button class="del-btn" data-del-loose="' + p.id + '" aria-label="Delete">&#10005;</button>' +
        '</div>' +
      '</div>';
  }

  function emptyState(title, text) {
    return '<div class="empty"><div class="big">&#128683;</div><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p></div>';
  }

  /* ============================ Router ============================ */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '') || 'home';
    const [path, query] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = {};
    if (query) new URLSearchParams(query).forEach((v, k) => { params[k] = v; });
    return { name: parts[0] || 'home', parts, params };
  }

  const NAV_MAP = { home: 'home', stats: 'stats', report: 'stats', calendar: 'calendar', settings: 'settings' };

  function render() {
    const route = parseHash();
    let view;
    switch (route.name) {
      case 'brand': view = viewBrand(route.parts[1], route.params.tab); break;
      case 'add-cigarette': view = viewAddCigarette(route.params); break;
      case 'add-pack': view = viewAddPack(route.params); break;
      case 'add-loose': view = viewAddLoose(route.params); break;
      case 'add-brand': view = viewAddBrand(route.params); break;
      case 'quick-add': view = viewQuickAdd(); break;
      case 'search': view = viewSearch(); break;
      case 'stats': view = viewStats(); break;
      case 'report': view = viewReport(); break;
      case 'calendar': view = viewCalendar(); break;
      case 'settings': view = viewSettings(); break;
      default: view = viewHome(); break;
    }

    resetFormPhotos();
    $('#screen-title').textContent = view.title;
    $('#screen-subtitle').textContent = view.subtitle || '';
    $('#back-btn').classList.toggle('hidden', !view.showBack);
    $('#fab').classList.toggle('hidden', !view.showFab);

    const action = $('#header-action');
    if (view.action) {
      action.classList.remove('hidden');
      action.innerHTML = view.action.icon;
      action.onclick = view.action.onClick;
    } else {
      action.classList.add('hidden');
      action.onclick = null;
    }

    $('#screen').innerHTML = view.html;

    const navKey = NAV_MAP[route.name] || (route.name === 'brand' ? 'home' : '');
    $$('.nav-item').forEach((el) => el.classList.toggle('active', el.getAttribute('data-nav') === navKey));

    window.scrollTo(0, 0);
    if (view.init) view.init();
  }

  /* ============================ Views: Home ============================ */
  function viewHome() {
    const g = globalStats();
    const streak = computeStreak();
    const last = latestCigarette();

    const cards = state.brands.map((b) => {
      const s = brandStats(b);
      const thumb = b.photo
        ? '<div class="brand-thumb"><img src="' + b.photo + '" alt=""></div>'
        : '<div class="brand-thumb">' + esc(initials(b.name)) + '</div>';
      const lastLine = s.last ? 'Last used ' + formatDate(dateToStr(new Date(s.last))) : 'No records yet';
      return '' +
        '<div class="brand-card luxury-brand-card" data-nav-brand="' + b.id + '" role="button" tabindex="0">' +
          thumb +
          '<div class="brand-body">' +
            '<div class="brand-name">' + esc(b.name) + '</div>' +
            '<div class="brand-meta"><span><b>' + s.cigCount + '</b> cigarettes</span><span><b>' + money(s.spent) + '</b> spent</span></div>' +
            '<div class="brand-last">' + lastLine + '</div>' +
          '</div>' +
          '<div class="brand-arrow"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
        '</div>';
    }).join('') +
      '<div class="brand-card add-brand luxury-add-brand" data-nav-brand-new="1" role="button" tabindex="0">' +
        '<div class="plus">+</div><span>Add New Brand</span>' +
      '</div>';

    const lastText = last ? formatTime(last.time) : '--';
    const today = new Date();

    return {
      title: settings.profile_name || 'Cig Diary',
      subtitle: 'Track smarter, spend smarter',
      html: '' +
        '<div class="luxury-dashboard">' +
          '<div class="luxury-hero">' +
            '<div class="hero-copy">' +
              '<span class="eyebrow">PERSONAL CIGARETTE TRACKER</span>' +
              '<h2>Know your habit.<br><em>Know your spending.</em></h2>' +
              '<p>Every cigarette and every rupee is counted automatically.</p>' +
            '</div>' +
            '<div class="hero-cigarette"><span></span></div>' +
            '<div class="hero-glow"></div>' +
          '</div>' +

          '<div class="dashboard-heading"><div><span class="eyebrow">TODAY</span><h3>' + today.getDate() + ' ' + MONTHS_FULL[today.getMonth()] + '</h3></div>' +
            '<div class="streak-pill">🔥 ' + streak.current + ' day streak</div></div>' +

          '<div class="money-grid">' +
            '<div class="money-card featured"><div class="money-icon">₹</div><div><span>Spent Today</span><strong>' + money(g.todaySpend) + '</strong><small>' + g.todayCigs + ' cigarettes</small></div></div>' +
            '<div class="money-card"><span>THIS WEEK</span><strong>' + money(g.weekSpend) + '</strong><small>' + g.weekCigs + ' cigarettes</small></div>' +
            '<div class="money-card"><span>THIS MONTH</span><strong>' + money(g.monthSpend) + '</strong><small>' + g.monthCigs + ' cigarettes</small></div>' +
            '<div class="money-card"><span>THIS YEAR</span><strong>' + money(g.yearSpend) + '</strong><small>' + g.yearCigs + ' cigarettes</small></div>' +
          '</div>' +

          '<div class="quick-row">' +
            '<button class="btn btn-primary quick-btn" data-go="#/quick-add"><span class="quick-plus">+</span> Add Cigarette</button>' +
            '<button class="btn btn-secondary" data-go="#/stats">View Analytics</button>' +
          '</div>' +

          '<div class="mini-overview">' +
            '<div><span>Last cigarette</span><b>' + lastText + '</b></div>' +
            '<div><span>All-time spent</span><b>' + money(g.totalSpent) + '</b></div>' +
            '<div><span>Avg. / day</span><b>' + money(g.avgSpend) + '</b></div>' +
          '</div>' +

          '<div class="section-title-row"><div><span class="eyebrow">YOUR COLLECTION</span><h3>My Brands</h3></div><button class="text-btn" data-nav-brand-new="1">+ Add</button></div>' +
          '<div class="brand-grid">' + cards + '</div>' +
        '</div>',
      showBack: false,
      showFab: true,
      action: {
        icon: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        onClick: () => { location.hash = '#/search'; },
      },
    };
  }

  function initials(name) { return (String(name).trim().charAt(0) || '?').toUpperCase(); }

  /* ============================ Views: Brand ============================ */
  function viewBrand(id, tab) {
    const brand = brandById(id);
    if (!brand) {
      return { title: 'Not found', html: emptyState('Brand not found', 'It may have been removed.'), showBack: true, showFab: false };
    }
    if (tab && ['cigarettes', 'packs', 'loose', 'summary'].indexOf(tab) >= 0) state.brandTab = tab;
    const activeTab = state.brandTab || 'cigarettes';
    const s = brandStats(brand);

    const heroThumb = brand.photo
      ? '<div class="hero-thumb"><img src="' + brand.photo + '" alt=""></div>'
      : '<div class="hero-thumb">' + esc(initials(brand.name)) + '</div>';

    const html = '' +
      '<div class="hero">' + heroThumb +
        '<div class="hero-info">' +
          '<h2>' + esc(brand.name) + '</h2>' +
          '<div class="row">' + (brand.default_price != null ? money(brand.default_price) + ' / cigarette' : 'No default cigarette price') + '</div>' +
          '<div class="row">' + (brand.pack_price != null ? money(brand.pack_price) + ' / pack' : 'No pack price set') + '</div>' +
          '<div class="row">' + (brand.sticks_per_pack ? brand.sticks_per_pack + ' cigarettes / pack' : 'Sticks per pack not set') + '</div>' +
          (brand.description ? '<div class="row">' + esc(brand.description) + '</div>' : '') +
          '<span class="pill">' + s.cigCount + ' consumed</span>' +
          '<span class="pill">' + s.packCount + ' packs</span>' +
          '<span class="pill">' + s.looseCount + ' loose purchases</span>' +
          '<span class="pill">' + money(s.spent) + ' spent</span>' +
        '</div>' +
      '</div>' +
      '<div class="action-row">' +
        '<button class="btn btn-primary" data-add-cig="' + brand.id + '">+ Add Cigarette</button>' +
        '<button class="btn btn-secondary" data-add-pack="' + brand.id + '">+ Add Pack</button>' +
        '<button class="btn btn-secondary" data-add-loose="' + brand.id + '">+ Loose Cigarettes</button>' +
      '</div>' +
      '<div class="tabs" id="brand-tabs">' +
        tabBtn('cigarettes', 'Cigarettes', activeTab) +
        tabBtn('packs', 'Packs', activeTab) +
        tabBtn('loose', 'Loose', activeTab) +
        tabBtn('summary', 'Summary', activeTab) +
      '</div>' +
      '<div id="tab-content">' + brandTabHTML(brand, activeTab) + '</div>';

    return {
      title: brand.name,
      subtitle: s.cigCount + ' cigarettes \u2022 ' + s.packCount + ' packs \u2022 ' + money(s.spent),
      html,
      showBack: true,
      showFab: false,
      init: () => {
        $$('#brand-tabs [data-brand-tab]').forEach((btn) => {
          btn.addEventListener('click', () => {
            state.brandTab = btn.getAttribute('data-brand-tab');
            $$('#brand-tabs [data-brand-tab]').forEach((b) => b.classList.toggle('active', b === btn));
            $('#tab-content').innerHTML = brandTabHTML(brand, state.brandTab);
          });
        });
      },
      action: {
        icon: '<svg viewBox="0 0 24 24" width="19" height="19"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
        onClick: () => { location.hash = '#/add-brand?edit=' + brand.id; },
      },
    };
  }

  function tabBtn(key, label, active) {
    return '<button class="tab' + (active === key ? ' active' : '') + '" data-brand-tab="' + key + '">' + label + '</button>';
  }

  function brandTabHTML(brand, tab) {
    if (tab === 'packs') {
      const packs = packsForBrand(brand.id).sort((a, b) => recordStamp(b) - recordStamp(a));
      if (!packs.length) return emptyState('No packs yet', 'Record a whole pack for ' + brand.name + '.');
      const invTotal = packs.reduce((s, p) => s + (Number(p.remaining_quantity) || 0), 0);
      const invCap = packs.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
      return '<div class="panel" style="margin-top:12px"><h3>Current Inventory</h3>' +
        '<p class="panel-sub">' + invTotal + ' / ' + invCap + ' cigarettes remaining across packs</p></div>' +
        packs.map((p) => packRowHTML(p, brand.name, { showInventory: true })).join('');
    }

    if (tab === 'loose') {
      const loose = looseForBrand(brand.id).sort((a, b) => recordStamp(b) - recordStamp(a));
      if (!loose.length) return emptyState('No loose purchases yet', 'Buy 2 or more individual cigarettes without a whole pack.');
      const qty = loose.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
      const spend = loose.reduce((s, p) => s + (Number(p.total_price) || 0), 0);
      return '<div class="panel" style="margin-top:12px"><h3>Loose Purchase Summary</h3>' +
        '<p class="panel-sub">' + qty + ' cigarettes purchased loosely &bull; ' + money(spend) + ' spent</p></div>' +
        loose.map((p) => looseRowHTML(p, brand.name, { showBrand: false })).join('');
    }

    if (tab === 'summary') {
      const s = brandStats(brand);
      const last7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = addDays(new Date(), -i);
        const ds = dateToStr(d);
        last7.push({ label: DOW[d.getDay()], count: cigsForBrand(brand.id).filter((c) => c.date === ds).length });
      }
      const max = Math.max(1, ...last7.map((x) => x.count));
      const bars = '<div class="bars">' + last7.map((x) =>
        '<div class="bar-col"><div class="val">' + x.count + '</div>' +
          '<div class="bar-track"><div class="bar ' + (x.count === 0 ? 'dim' : '') + '" style="height:' + Math.round((x.count / max) * 100) + '%"></div></div>' +
          '<div class="lbl">' + x.label + '</div></div>').join('') + '</div>';

      return '' +
        '<div class="stat-grid" style="margin-top:12px">' +
          statCard('Consumed', s.cigCount, 'individual', 'accent') +
          statCard('Packs', s.packCount, 'purchases', '') +
          statCard('Loose', s.looseCount, 'purchase records', '') +
          statCard('Total spent', money(s.spent), 'all time', 'green') +
          statCard('Remaining', s.remaining, 'in packs', '') +
        '</div>' +
        '<div class="panel"><h3>Last 7 Days</h3><p class="panel-sub">' + esc(brand.name) + ' cigarettes</p>' + bars + '</div>' +
        '<div class="panel"><h3>Pricing</h3>' +
          '<div class="kv"><span>Default per cigarette</span><b>' + (brand.default_price != null ? money(brand.default_price) : '--') + '</b></div>' +
          '<div class="kv"><span>Pack price</span><b>' + (brand.pack_price != null ? money(brand.pack_price) : '--') + '</b></div>' +
          '<div class="kv"><span>Cigarettes per pack</span><b>' + (brand.sticks_per_pack != null ? brand.sticks_per_pack : '--') + '</b></div>' +
          '<div class="kv"><span>Average paid per cigarette</span><b>' + (s.avgPrice != null ? money(s.avgPrice) : '--') + '</b></div>' +
        '</div>';
    }

    const cigs = cigsForBrand(brand.id).sort((a, b) => recordStamp(b) - recordStamp(a));
    if (!cigs.length) return emptyState('No cigarettes yet', 'Add your first cigarette for ' + brand.name + '.');
    return cigs.map((c) => cigRowHTML(c, brand.name, {})).join('');
  }

  function statCard(k, v, s, cls) {
    return '<div class="stat-card ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
  }

  /* ============================ Views: Add / Edit Cigarette ============================ */
  function viewAddCigarette(params) {
    if (!state.brands.length) {
      return { title: 'Add Cigarette', html: emptyState('No brands yet', 'Create a brand first.'), showBack: true, showFab: false };
    }
    const editing = params.edit ? state.cigarettes.find((c) => c.id === params.edit) : null;
    const selected = (editing && editing.brand_id) || params.brand || lastBrandId() || state.brands[0].id;
    const brand = brandById(selected) || state.brands[0];
    const price = editing ? editing.price : (brand.default_price != null ? brand.default_price : settings.default_price);

    const options = state.brands.map((b) => '<option value="' + b.id + '"' + (b.id === brand.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');

    const html = '' +
      '<form class="form" id="cig-form">' +
        '<div class="field"><label>Brand</label><select class="select" name="brand_id" id="cig-brand">' + options + '</select></div>' +
        '<div id="cig-pack-wrap" class="field"></div>' +
        '<div class="field"><label>Individual cigarette photo</label>' + photoPickerHTML('cigarette', editing && editing.photo ? editing.photo : null) + '</div>' +
        '<div class="grid-2">' +
          '<div class="field"><label>Price per cigarette (' + settings.currency + ')</label>' +
            '<input class="input" type="number" step="0.01" min="0" name="price" id="cig-price" value="' + esc(price) + '" placeholder="0" required /></div>' +
          '<div class="field"><label>Date</label><input class="input" type="date" name="date" id="cig-date" value="' + esc(editing ? editing.date : todayStr()) + '" /></div>' +
        '</div>' +
        '<div class="field"><label>Time</label><input class="input" type="time" name="time" id="cig-time" value="' + esc(editing ? editing.time : nowTimeStr()) + '" /></div>' +
        '<div class="field"><label>Notes <span class="hint">(optional)</span></label>' +
          '<textarea class="textarea" name="notes" placeholder="e.g. After dinner">' + esc(editing ? editing.notes : '') + '</textarea></div>' +
        '<button class="btn btn-primary btn-block" type="submit">' + (editing ? 'Update Cigarette' : 'Save Cigarette') + '</button>' +
      '</form>';

    function refreshPackSelect() {
      const bid = $('#cig-brand').value;
      const packs = packsForBrand(bid).sort((a, b) => recordStamp(b) - recordStamp(a));
      const sel = editing && editing.brand_id === bid && editing.pack_id ? editing.pack_id : '';
      const wrap = $('#cig-pack-wrap');
      if (!packs.length) { wrap.innerHTML = ''; return; }
      wrap.innerHTML = '<label>From pack <span class="hint">(optional, reduces inventory)</span></label>' +
        '<select class="select" name="pack_id" id="cig-pack">' +
          '<option value="">No pack</option>' +
          packs.map((p) => {
            const rem = p.remaining_quantity == null ? Number(p.quantity) : Number(p.remaining_quantity);
            return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' +
              formatDate(p.date) + ' &bull; ' + rem + '/' + p.quantity + ' left</option>';
          }).join('') +
        '</select>';
    }

    return {
      title: editing ? 'Edit Cigarette' : 'Add Cigarette',
      subtitle: editing ? 'Update this record' : 'One cigarette smoked',
      html,
      showBack: true,
      showFab: false,
      init: () => {
        bindPhotoPickers($('#screen'));
        refreshPackSelect();
        $('#cig-brand').addEventListener('change', (e) => {
          refreshPackSelect();
          const selectedBrand = brandById(e.target.value);
          const priceInput = $('#cig-price');
          if (priceInput && !editing) {
            priceInput.value = selectedBrand && selectedBrand.default_price != null
              ? selectedBrand.default_price
              : settings.default_price;
          }
        });
        $('#cig-form').addEventListener('submit', (e) => onSubmitCigarette(e, editing));
      },
    };
  }

  function lastBrandId() { try { return localStorage.getItem('cig_last_brand'); } catch (e) { return null; } }
  function setLastBrand(id) { try { localStorage.setItem('cig_last_brand', id); } catch (e) { /* ignore */ } }

  async function adjustPackRemaining(packId, delta) {
    const p = state.packs.find((x) => x.id === packId);
    if (!p) return;
    const cap = Number(p.quantity) || 0;
    const cur = p.remaining_quantity == null ? cap : Number(p.remaining_quantity);
    p.remaining_quantity = Math.max(0, Math.min(cap, cur + delta));
    p.updated_at = Date.now();
    await DB.put(DB.STORES.packs, p);
  }

  async function onSubmitCigarette(e, editing) {
    e.preventDefault();
    const f = e.target;
    const brand_id = fv(f, 'brand_id');
    const pack_id = fv(f, 'pack_id') || null;
    if (pack_id) {
      const selectedPack = state.packs.find((p) => p.id === pack_id);
      if (!selectedPack || selectedPack.brand_id !== brand_id) {
        toast('Please select a pack from the selected brand');
        return;
      }
      if (!editing || editing.pack_id !== pack_id) {
        const remaining = selectedPack.remaining_quantity == null
          ? Number(selectedPack.quantity) || 0
          : Number(selectedPack.remaining_quantity);
        if (remaining <= 0) {
          toast('Selected pack is empty');
          return;
        }
      }
    }
    const rawPrice = fv(f, 'price').trim();
    const price = parseFloat(rawPrice);
    if (!Number.isFinite(price) || price <= 0) {
      toast('Enter the cigarette price first');
      $('#cig-price')?.focus();
      return;
    }
    const date = fv(f, 'date') || todayStr();
    const time = fv(f, 'time') || nowTimeStr();
    const notes = fv(f, 'notes').trim();

    if (editing) {
      if ((editing.pack_id || null) !== pack_id) {
        if (editing.pack_id) await adjustPackRemaining(editing.pack_id, 1);
        if (pack_id) await adjustPackRemaining(pack_id, -1);
      }
      editing.brand_id = brand_id;
      editing.pack_id = pack_id;
      editing.photo = resolvePhoto('cigarette', editing);
      editing.price = price;
      editing.date = date;
      editing.time = time;
      editing.notes = notes;
      editing.updated_at = Date.now();
      await DB.put(DB.STORES.cigarettes, editing);
      toast('Cigarette updated');
    } else {
  const rec = {
    id: DB.uid(),
    brand_id,
    pack_id,
    photo: resolvePhoto('cigarette', null),
    price,
    date,
    time,
    notes,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  await DB.put(DB.STORES.cigarettes, rec);

  state.cigarettes.push(rec);

  if (pack_id) {
    await adjustPackRemaining(pack_id, -1);
  }

  toast('Cigarette saved');
}
    setLastBrand(brand_id);
    location.hash = '#/brand/' + brand_id;
  }

  /* ============================ Views: Add / Edit Pack ============================ */
  function viewAddPack(params) {
    if (!state.brands.length) {
      return { title: 'Add Pack', html: emptyState('No brands yet', 'Create a brand first.'), showBack: true, showFab: false };
    }
    const editing = params.edit ? state.packs.find((p) => p.id === params.edit) : null;
    const selected = (editing && editing.brand_id) || params.brand || lastBrandId() || state.brands[0].id;
    const brand = brandById(selected) || state.brands[0];
    const options = state.brands.map((b) => '<option value="' + b.id + '"' + (b.id === brand.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');

    const html = '' +
      '<form class="form" id="pack-form">' +
        '<div class="field"><label>Brand</label><select class="select" name="brand_id" id="pack-brand">' + options + '</select></div>' +
        '<div class="field"><label>Whole packet photo</label>' + photoPickerHTML('pack', editing && editing.photo ? editing.photo : null) + '</div>' +
        '<div class="grid-2">' +
          '<div class="field"><label>Pack price (' + settings.currency + ')</label>' +
            '<input class="input" type="number" step="0.01" min="0" name="pack_price" id="pack-price" value="' + esc(editing ? editing.pack_price : '') + '" placeholder="Enter pack price" required /></div>' +
          '<div class="field"><label>Number of cigarettes</label>' +
            '<input class="input" type="number" step="1" min="1" name="quantity" id="pack-qty" value="' + esc(editing ? editing.quantity : (brand.sticks_per_pack != null ? brand.sticks_per_pack : settings.default_pack_size)) + '" /></div>' +
        '</div>' +
        '<div class="percig-box" id="pack-percig">' + settings.currency + '0 per cigarette</div>' +
        '<div class="grid-2">' +
          '<div class="field"><label>Purchase date</label><input class="input" type="date" name="date" value="' + esc(editing ? editing.date : todayStr()) + '" /></div>' +
          '<div class="field"><label>Purchase time</label><input class="input" type="time" name="time" value="' + esc(editing ? editing.time : nowTimeStr()) + '" /></div>' +
        '</div>' +
        '<div class="field"><label>Notes <span class="hint">(optional)</span></label>' +
          '<textarea class="textarea" name="notes" placeholder="e.g. Bought from corner shop">' + esc(editing ? editing.notes : '') + '</textarea></div>' +
        '<button class="btn btn-primary btn-block" type="submit">' + (editing ? 'Update Pack' : 'Save Pack') + '</button>' +
      '</form>';

    function updatePerCig() {
      const price = parseFloat($('#pack-price').value) || 0;
      const qty = parseInt($('#pack-qty').value, 10) || 0;
      const per = qty > 0 ? price / qty : 0;
      $('#pack-percig').innerHTML = esc(money(price)) + ' &divide; ' + qty + ' = <b>' + money(per) + ' per cigarette</b>';
    }

    return {
      title: editing ? 'Edit Pack' : 'Add Whole Pack',
      subtitle: editing ? 'Update this pack' : 'Record a purchased pack',
      html,
      showBack: true,
      showFab: false,
      init: () => {
        bindPhotoPickers($('#screen'));
        $('#pack-brand').addEventListener('change', (e) => {
          const b = brandById(e.target.value);
          if (!b) return;
          if (b.sticks_per_pack != null) $('#pack-qty').value = b.sticks_per_pack;
          updatePerCig();
        });
        $('#pack-price').addEventListener('input', updatePerCig);
        $('#pack-qty').addEventListener('input', updatePerCig);
        updatePerCig();
        $('#pack-form').addEventListener('submit', (e) => onSubmitPack(e, editing));
      },
    };
  }

async function onSubmitPack(e, editing) {
  e.preventDefault();

  const f = e.target;

  const brand_id = fv(f, 'brand_id');

  const rawPackPrice = fv(f, 'pack_price').trim();
  const pack_price = parseFloat(rawPackPrice);

  if (!Number.isFinite(pack_price) || pack_price <= 0) {
    toast('Enter the pack price first');
    $('#pack-price')?.focus();
    return;
  }

  const quantity = parseInt(fv(f, 'quantity'), 10) || 0;
  const date = fv(f, 'date') || todayStr();
  const time = fv(f, 'time') || nowTimeStr();
  const notes = fv(f, 'notes').trim();

  if (quantity <= 0) {
    toast('Enter the number of cigarettes');
    return;
  }

  if (editing) {

    const prevUsed = Math.max(
      0,
      (Number(editing.quantity) || 0) -
      (Number(editing.remaining_quantity) || 0)
    );

    editing.brand_id = brand_id;
    editing.photo = resolvePhoto('pack', editing);

    // IMPORTANT:
    // Supabase packs table uses "price"
    editing.price = pack_price;

    // Keep this for the frontend if your UI uses pack_price
    editing.pack_price = pack_price;

    editing.quantity = quantity;

    editing.remaining_quantity = Math.max(
      0,
      Math.min(quantity, quantity - prevUsed)
    );

    editing.date = date;
    editing.time = time;
    editing.notes = notes;
    editing.updated_at = Date.now();

    await DB.put(DB.STORES.packs, editing);

    toast('Pack updated');

  } else {

    const rec = {
      id: DB.uid(),
      brand_id,

      photo: resolvePhoto('pack', null),

      // Supabase column
      price: pack_price,

      // Frontend compatibility
      pack_price: pack_price,

      quantity: quantity,

      // New pack starts completely full
      remaining_quantity: quantity,

      date,
      time,
      notes,

      created_at: Date.now(),
      updated_at: Date.now(),
    };

    await DB.put(DB.STORES.packs, rec);

    state.packs.push(rec);

    toast('Pack saved');
  }

  setLastBrand(brand_id);

  location.hash =
    '#/brand/' + brand_id + '?tab=packs';
}

  /* ============================ Views: Add / Edit Loose Purchase ============================ */
  function viewAddLoose(params) {
    if (!state.brands.length) {
      return { title: 'Loose Purchase', html: emptyState('No brands yet', 'Create a brand first.'), showBack: true, showFab: false };
    }
    const editing = params.edit ? state.loosePurchases.find((p) => p.id === params.edit) : null;
    const selected = (editing && editing.brand_id) || params.brand || lastBrandId() || state.brands[0].id;
    const brand = brandById(selected) || state.brands[0];
    const options = state.brands.map((b) => '<option value="' + b.id + '"' + (b.id === brand.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
    const qty = editing ? editing.quantity : 2;
    const unit = editing ? editing.price_per_cigarette : (brand.default_price != null ? brand.default_price : settings.default_price);
    const html = '' +
      '<form class="form" id="loose-form">' +
        '<div class="panel" style="margin:0"><h3>Loose Cigarette Purchase</h3><p class="panel-sub">Buy individual cigarettes without recording a whole packet. This is a purchase record, not a consumption record.</p></div>' +
        '<div class="field"><label>Brand</label><select class="select" name="brand_id" id="loose-brand">' + options + '</select></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label>Quantity</label><input class="input" type="number" min="1" step="1" name="quantity" id="loose-qty" value="' + esc(qty) + '" required /></div>' +
          '<div class="field"><label>Price per cigarette (' + settings.currency + ')</label><input class="input" type="number" min="0.01" step="0.01" name="price_per_cigarette" id="loose-unit" value="' + esc(unit) + '" required /></div>' +
        '</div>' +
        '<div class="percig-box" id="loose-total">Total: ' + money((Number(qty) || 0) * (Number(unit) || 0)) + '</div>' +
        '<div class="grid-2">' +
          '<div class="field"><label>Date</label><input class="input" type="date" name="date" value="' + esc(editing ? editing.date : todayStr()) + '" /></div>' +
          '<div class="field"><label>Time</label><input class="input" type="time" name="time" value="' + esc(editing ? editing.time : nowTimeStr()) + '" /></div>' +
        '</div>' +
        '<div class="field"><label>Notes <span class="hint">(optional)</span></label><textarea class="textarea" name="notes" placeholder="e.g. Bought 3 from local shop">' + esc(editing ? editing.notes : '') + '</textarea></div>' +
        '<button class="btn btn-primary btn-block" type="submit">' + (editing ? 'Update Loose Purchase' : 'Save Loose Purchase') + '</button>' +
      '</form>';
    return {
      title: editing ? 'Edit Loose Purchase' : 'Loose Cigarettes',
      subtitle: 'Record individual cigarette purchases',
      html, showBack: true, showFab: false,
      init: () => {
        const updateTotal = () => {
          const q = Number($('#loose-qty').value) || 0;
          const u = Number($('#loose-unit').value) || 0;
          $('#loose-total').innerHTML = 'Total: <b>' + money(q * u) + '</b> &bull; ' + q + ' cigarettes';
        };
        $('#loose-brand').addEventListener('change', (e) => {
          if (!editing) {
            const b = brandById(e.target.value);
            if (b && b.default_price != null) $('#loose-unit').value = b.default_price;
            updateTotal();
          }
        });
        $('#loose-qty').addEventListener('input', updateTotal);
        $('#loose-unit').addEventListener('input', updateTotal);
        updateTotal();
        $('#loose-form').addEventListener('submit', (e) => onSubmitLoose(e, editing));
      },
    };
  }

  async function onSubmitLoose(e, editing) {
    e.preventDefault();
    const f = e.target;
    const submitBtn = f.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : '';

    try {
      const brand_id = fv(f, 'brand_id');
      const quantity = parseInt(fv(f, 'quantity'), 10);
      const price_per_cigarette = parseFloat(fv(f, 'price_per_cigarette'));

      if (!brand_id || !brandById(brand_id)) return toast('Select a valid brand');
      if (!Number.isInteger(quantity) || quantity < 1) return toast('Enter a valid quantity');
      if (!Number.isFinite(price_per_cigarette) || price_per_cigarette <= 0) return toast('Enter a valid price per cigarette');

      const rec = editing
        ? Object.assign({}, editing)
        : { id: DB.uid(), created_at: Date.now() };

      rec.brand_id = brand_id;
      rec.quantity = quantity;
      rec.price_per_cigarette = round2(price_per_cigarette);
      rec.total_price = round2(quantity * price_per_cigarette);
      rec.date = fv(f, 'date') || todayStr();
      rec.time = fv(f, 'time') || nowTimeStr();
      rec.notes = fv(f, 'notes').trim();
      rec.updated_at = Date.now();

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = editing ? 'Updating...' : 'Saving...';
      }

      await DB.put(DB.STORES.loose_purchases, rec);

      const i = state.loosePurchases.findIndex((x) => x.id === rec.id);
      if (i >= 0) state.loosePurchases[i] = rec;
      else state.loosePurchases.push(rec);

      setLastBrand(brand_id);
      toast(editing ? 'Loose purchase updated' : 'Loose purchase saved');
      location.hash = '#/brand/' + brand_id + '?tab=loose';
    } catch (err) {
      console.error('Loose purchase save failed:', err);
      const message = err && (err.message || err.details || err.hint)
        ? (err.message || err.details || err.hint)
        : 'Could not save loose purchase';
      toast('Save failed: ' + message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  }

  /* ============================ Views: Add / Edit Brand ============================ */
  function viewAddBrand(params) {
    const editing = params.edit ? brandById(params.edit) : null;
    const b = editing || { name: '', description: '', default_price: '', pack_price: '', sticks_per_pack: settings.default_pack_size };

    const html = '' +
      '<form class="form" id="brand-form">' +
        '<div class="field"><label>Cigarette / Brand name</label>' +
          '<input class="input" type="text" name="name" value="' + esc(b.name) + '" placeholder="e.g. Dunhill" required /></div>' +
        '<div class="field"><label>Brand photo <span class="hint">(optional)</span></label>' + photoPickerHTML('brand', editing && editing.photo ? editing.photo : null) + '</div>' +
        '<div class="field"><label>Description <span class="hint">(optional)</span></label>' +
          '<textarea class="textarea" name="description" placeholder="Short note about this brand">' + esc(b.description || '') + '</textarea></div>' +
        '<div class="grid-2">' +
          '<div class="field"><label>Default price / cigarette (' + settings.currency + ')</label>' +
            '<input class="input" type="number" step="0.01" min="0" name="default_price" value="' + esc(b.default_price != null ? b.default_price : '') + '" placeholder="0" /></div>' +
          '<div class="field"><label>Default pack price (' + settings.currency + ')</label>' +
            '<input class="input" type="number" step="0.01" min="0" name="pack_price" value="' + esc(b.pack_price != null ? b.pack_price : '') + '" placeholder="0" /></div>' +
        '</div>' +
        '<div class="field"><label>Cigarettes per pack</label>' +
          '<input class="input" type="number" step="1" min="1" name="sticks_per_pack" value="' + esc(b.sticks_per_pack != null ? b.sticks_per_pack : settings.default_pack_size) + '" /></div>' +
        '<button class="btn btn-primary btn-block" type="submit">' + (editing ? 'Update Brand' : 'Create Brand') + '</button>' +
        (editing ? '<button class="btn btn-danger btn-block" type="button" id="delete-brand">Delete Brand</button>' : '') +
      '</form>';

    return {
      title: editing ? 'Edit Brand' : 'Create New Brand',
      subtitle: editing ? 'Update container' : 'New container on home',
      html,
      showBack: true,
      showFab: false,
      init: () => {
        bindPhotoPickers($('#screen'));
        $('#brand-form').addEventListener('submit', (e) => onSubmitBrand(e, editing));
        const del = $('#delete-brand');
        if (del) del.addEventListener('click', () => deleteBrand(editing.id));
      },
    };
  }

  async function onSubmitBrand(e, editing) {
    e.preventDefault();
    const f = e.target;
    const name = fv(f, 'name').trim();
    if (!name) return;
    const rec = {
      id: editing ? editing.id : DB.uid(),
      name,
      photo: resolvePhoto('brand', editing),
      description: fv(f, 'description').trim(),
      default_price: fv(f, 'default_price') === '' ? null : parseFloat(fv(f, 'default_price')),
      pack_price: fv(f, 'pack_price') === '' ? null : parseFloat(fv(f, 'pack_price')),
      sticks_per_pack: fv(f, 'sticks_per_pack') === '' ? null : parseInt(fv(f, 'sticks_per_pack'), 10),
      created_at: editing ? editing.created_at : Date.now(),
      updated_at: Date.now(),
    };
    await DB.put(DB.STORES.brands, rec);
    const i = state.brands.findIndex((x) => x.id === rec.id);
    if (i >= 0) state.brands[i] = rec; else state.brands.push(rec);
    toast(editing ? 'Brand updated' : 'Brand created');
    location.hash = editing ? '#/brand/' + rec.id : '#/home';
  }

  async function deleteBrand(id) {
    const ok = await confirmAction('Delete this brand and all its records?', 'Delete Brand');
    if (!ok) return;
    for (const c of cigsForBrand(id)) await DB.remove(DB.STORES.cigarettes, c.id);
    for (const p of packsForBrand(id)) await DB.remove(DB.STORES.packs, p.id);
    for (const p of looseForBrand(id)) await DB.remove(DB.STORES.loose_purchases, p.id);
    await DB.remove(DB.STORES.brands, id);
    await loadData();
    toast('Brand deleted');
    location.hash = '#/home';
  }

  /* ============================ Views: Quick Add ============================ */
function viewQuickAdd() {
  if (!state.brands.length) {
    return {
      title: 'Quick Add',
      html: emptyState('No brands yet', 'Create a brand first.'),
      showBack: true,
      showFab: false
    };
  }

  const selected = lastBrandId() && brandById(lastBrandId())
    ? lastBrandId()
    : state.brands[0].id;

  const brand = brandById(selected);

  const defaultPrice =
    brand && brand.default_price != null
      ? brand.default_price
      : settings.default_price;

  const chips = state.brands.map((b) =>
    '<button type="button" class="chip' +
    (b.id === selected ? ' active' : '') +
    '" data-quick-brand="' + b.id + '">' +
    esc(b.name) +
    '</button>'
  ).join('');

  const html = '' +
    '<div class="quick-wrap">' +
      '<p class="quick-hint">Tap a brand, then Save. Date &amp; time are set to now automatically.</p>' +

      '<div class="chip-row" id="quick-brands">' +
        chips +
      '</div>' +

      '<div class="field quick-manual-price">' +
        '<label>Price per cigarette (' + settings.currency + ')</label>' +
        '<input class="input" ' +
          'type="number" ' +
          'step="0.01" ' +
          'min="0" ' +
          'id="quick-price-input" ' +
          'value="' + esc(defaultPrice) + '" ' +
          'placeholder="Enter price manually" ' +
          'required />' +
      '</div>' +

      '<button class="btn btn-primary btn-block quick-save" id="quick-save">' +
        'Save Cigarette' +
      '</button>' +

      '<div class="panel quick-loose-section" style="margin:12px 0 16px">' +
        '<h3>🛒 Loose Cigarette Purchase</h3>' +
        '<p class="panel-sub">Buy 2 or more individual cigarettes without a whole pack.</p>' +
        '<button class="btn btn-secondary btn-block" type="button" data-go="#/add-loose">' +
          'Add Loose Purchase' +
        '</button>' +
      '</div>' +

      '<details class="quick-more">' +
        '<summary>Add details (photo, note, time)</summary>' +

        '<div class="field" style="margin-top:14px">' +
          '<label>Photo</label>' +
          photoPickerHTML('cigarette', null) +
        '</div>' +

        '<div class="field">' +
          '<label>Time</label>' +
          '<input class="input" type="time" id="quick-time" value="' +
            nowTimeStr() +
          '" />' +
        '</div>' +

        '<div class="field">' +
          '<label>Note</label>' +
          '<input class="input" type="text" id="quick-note" placeholder="Optional note" />' +
        '</div>' +

      '</details>' +
    '</div>';

  let selectedBrand = selected;

  async function save() {
    const priceInput = $('#quick-price-input');
    const noteInput = $('#quick-note');
    const timeInput = $('#quick-time');
    const saveButton = $('#quick-save');

    // Get the price entered by the user
    const enteredPrice = parseFloat(
      priceInput ? priceInput.value : ''
    );

    // Validate price
    if (!Number.isFinite(enteredPrice) || enteredPrice <= 0) {
      toast('Enter a valid cigarette price');

      if (priceInput) {
        priceInput.focus();
        priceInput.select();
      }

      return;
    }

    // Validate brand
    if (!selectedBrand || !brandById(selectedBrand)) {
      toast('Select a cigarette brand first');
      return;
    }

    // Prevent double-clicking Save
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Saving...';
    }

    try {
      const rec = {
        id: DB.uid(),
        brand_id: selectedBrand,
        pack_id: null,
        photo: resolvePhoto('cigarette', null),
        price: enteredPrice,
        date: todayStr(),
        time: (timeInput && timeInput.value) || nowTimeStr(),
        notes: (noteInput && noteInput.value.trim()) || '',
        created_at: Date.now(),
        updated_at: Date.now()
      };

      // Save to IndexedDB
      await DB.put(DB.STORES.cigarettes, rec);

      // Update application state
      state.cigarettes.push(rec);

      // Remember selected brand
      setLastBrand(selectedBrand);

      toast('Saved ' + money(rec.price) + ' cigarette');

      // Go back to home
      location.hash = '#/home';

    } catch (err) {
      console.error('Failed to save cigarette:', err);

      toast('Could not save cigarette');

      // Re-enable button if saving failed
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Cigarette';
      }
    }
  }

  return {
    title: 'Quick Add',
    subtitle: 'Record a cigarette in one tap',
    html,
    showBack: true,
    showFab: false,

    init: () => {
      bindPhotoPickers($('#screen'));

      $$('#quick-brands [data-quick-brand]').forEach((btn) => {
        btn.addEventListener('click', () => {

          selectedBrand = btn.getAttribute('data-quick-brand');

          // Update active brand button
          $$('#quick-brands [data-quick-brand]').forEach((b) => {
            b.classList.toggle('active', b === btn);
          });

          // Automatically update price for selected brand
          const selectedBrandData = brandById(selectedBrand);
          const priceInput = $('#quick-price-input');

          if (priceInput) {
            priceInput.value =
              selectedBrandData &&
              selectedBrandData.default_price != null
                ? selectedBrandData.default_price
                : settings.default_price;
          }
        });
      });

      const saveButton = $('#quick-save');

      if (saveButton) {
        saveButton.addEventListener('click', save);
      }
    }
  };
}

  /* ============================ Views: Search ============================ */
  function searchResults() {
    const s = state.search;
    const range = rangeForRangeKey(s.range);
    const q = s.q.trim().toLowerCase();
    const out = [];

    state.cigarettes.forEach((c) => {
      if (s.type === 'packs' || s.type === 'loose') return;
      if (s.brand !== 'all' && c.brand_id !== s.brand) return;
      if (!inRange(c.date, range)) return;
      const brand = brandById(c.brand_id);
      const hay = ((brand ? brand.name : '') + ' ' + (c.notes || '') + ' ' + c.date + ' ' + formatDate(c.date)).toLowerCase();
      if (q && hay.indexOf(q) === -1) return;
      out.push({ kind: 'cig', rec: c, brand });
    });

    state.packs.forEach((p) => {
      if (s.type === 'cigarettes' || s.type === 'loose') return;
      if (s.brand !== 'all' && p.brand_id !== s.brand) return;
      if (!inRange(p.date, range)) return;
      const brand = brandById(p.brand_id);
      const hay = ((brand ? brand.name : '') + ' ' + (p.notes || '') + ' ' + p.date + ' ' + formatDate(p.date)).toLowerCase();
      if (q && hay.indexOf(q) === -1) return;
      out.push({ kind: 'pack', rec: p, brand });
    });

    state.loosePurchases.forEach((p) => {
      if (s.type === 'cigarettes' || s.type === 'packs') return;
      if (s.brand !== 'all' && p.brand_id !== s.brand) return;
      if (!inRange(p.date, range)) return;
      const brand = brandById(p.brand_id);
      const hay = ((brand ? brand.name : '') + ' ' + (p.notes || '') + ' ' + p.date + ' ' + formatDate(p.date)).toLowerCase();
      if (q && hay.indexOf(q) === -1) return;
      out.push({ kind: 'loose', rec: p, brand });
    });

    out.sort((a, b) => recordStamp(b.rec) - recordStamp(a.rec));
    return out;
  }

  function searchResultsHTML() {
    const rows = searchResults();
    if (!rows.length) return '<div class="empty" style="padding:30px 20px"><h3>No matching records</h3><p>Try a different search or filter.</p></div>';
    const cigCount = rows.filter((r) => r.kind === 'cig').length;
    const packCount = rows.filter((r) => r.kind === 'pack').length;
    const looseCount = rows.filter((r) => r.kind === 'loose').length;
    const totalSpend = rows.reduce((s, r) => s + (r.kind === 'cig' ? Number(r.rec.price) : r.kind === 'pack' ? Number(r.rec.pack_price != null ? r.rec.pack_price : r.rec.price) : Number(r.rec.total_price)) || 0, 0);
    const summary = '<p class="panel-sub" style="margin:2px 4px 12px">' + rows.length + ' results &bull; ' + cigCount + ' consumed &bull; ' + packCount + ' packs &bull; ' + looseCount + ' loose purchases &bull; ' + money(totalSpend) + '</p>';
    return summary + rows.map((r) => r.kind === 'cig'
      ? cigRowHTML(r.rec, r.brand ? r.brand.name : '', { showBrand: true })
      : r.kind === 'pack' ? packRowHTML(r.rec, r.brand ? r.brand.name : '', { showBrand: true })
      : looseRowHTML(r.rec, r.brand ? r.brand.name : '', { showBrand: true })).join('');
  }

  function viewSearch() {
    const s = state.search;
    const brandOptions = '<option value="all">All brands</option>' + state.brands.map((b) =>
      '<option value="' + b.id + '"' + (s.brand === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
    const ranges = [['all', 'All'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This Week'], ['month', 'This Month'], ['custom', 'Custom']];

    return {
      title: 'Search',
      subtitle: 'Find records by brand, note or date',
      html: '' +
        '<input class="input search-input" id="search-input" type="search" placeholder="Search brand, note or date..." value="' + esc(s.q) + '" />' +
        '<div class="chip-row" id="search-ranges">' + ranges.map((r) =>
          '<button class="chip' + (s.range === r[0] ? ' active' : '') + '" data-range="' + r[0] + '">' + r[1] + '</button>').join('') + '</div>' +
        '<div id="search-custom" class="' + (s.range === 'custom' ? '' : 'hidden') + '">' +
          '<div class="grid-2" style="margin-bottom:12px">' +
            '<div class="field"><label>From</label><input class="input" type="date" id="search-from" value="' + esc(s.from) + '" /></div>' +
            '<div class="field"><label>To</label><input class="input" type="date" id="search-to" value="' + esc(s.to) + '" /></div>' +
          '</div>' +
        '</div>' +
        '<div class="grid-2" style="margin-bottom:12px">' +
          '<div class="field"><label>Type</label><select class="select" id="search-type">' +
            '<option value="all"' + (s.type === 'all' ? ' selected' : '') + '>All records</option>' +
            '<option value="cigarettes"' + (s.type === 'cigarettes' ? ' selected' : '') + '>Cigarettes</option>' +
            '<option value="packs"' + (s.type === 'packs' ? ' selected' : '') + '>Packs</option>' +
            '<option value="loose"' + (s.type === 'loose' ? ' selected' : '') + '>Loose Purchases</option>' +
          '</select></div>' +
          '<div class="field"><label>Brand</label><select class="select" id="search-brand">' + brandOptions + '</select></div>' +
        '</div>' +
        '<div id="search-results">' + searchResultsHTML() + '</div>',
      showBack: true,
      showFab: false,
      init: () => {
        const refresh = () => { $('#search-results').innerHTML = searchResultsHTML(); };
        $('#search-input').addEventListener('input', (e) => { s.q = e.target.value; refresh(); });
        $$('#search-ranges [data-range]').forEach((btn) => {
          btn.addEventListener('click', () => {
            s.range = btn.getAttribute('data-range');
            $$('#search-ranges [data-range]').forEach((b) => b.classList.toggle('active', b === btn));
            $('#search-custom').classList.toggle('hidden', s.range !== 'custom');
            refresh();
          });
        });
        $('#search-from').addEventListener('change', (e) => { s.from = e.target.value; refresh(); });
        $('#search-to').addEventListener('change', (e) => { s.to = e.target.value; refresh(); });
        $('#search-type').addEventListener('change', (e) => { s.type = e.target.value; refresh(); });
        $('#search-brand').addEventListener('change', (e) => { s.brand = e.target.value; refresh(); });
      },
    };
  }

  /* ============================ Views: Stats ============================ */
  function viewStats() {
    const g = globalStats();
    const streak = computeStreak();
    const mostRecorded = mostRecordedBrand();
    const mostExpensive = mostExpensiveBrand();
    const activeDay = mostActiveDay();

    const sort = state.statsSort;
    const rows = brandAnalytics().slice();
    if (sort === 'spending') rows.sort((a, b) => b.spent - a.spent);
    else if (sort === 'recent') rows.sort((a, b) => (b.last || 0) - (a.last || 0));
    else rows.sort((a, b) => b.cigs - a.cigs);
    const maxCigs = Math.max(1, ...rows.map((r) => r.cigs));

    const brandBars = rows.length ? rows.map((r) =>
      '<div class="hbar"><div class="hbar-top"><b>' + esc(r.name) + '</b><span class="n">' + r.cigs + ' cigarettes · ' + money(r.spent) + '</span></div>' +
        '<div class="hbar-track"><div class="hbar-fill" style="width:' + Math.round((r.cigs / maxCigs) * 100) + '%"></div></div></div>').join('')
      : '<p class="panel-sub">No data yet.</p>';

    return {
      title: 'Analytics',
      subtitle: 'Automatic spending & cigarette insights',
      html: '' +
        '<div class="analytics-hero">' +
          '<div><span class="eyebrow">TOTAL SPENT</span><strong>' + money(g.totalSpent) + '</strong><p>All cigarette, pack and loose-purchase spending</p></div>' +
          '<div class="analytics-hero-mark">₹</div>' +
        '</div>' +

        '<div class="period-tabs">' +
          '<div class="period-tab active">Day<div>' + money(g.todaySpend) + '</div></div>' +
          '<div class="period-tab">Week<div>' + money(g.weekSpend) + '</div></div>' +
          '<div class="period-tab">Month<div>' + money(g.monthSpend) + '</div></div>' +
          '<div class="period-tab">Year<div>' + money(g.yearSpend) + '</div></div>' +
        '</div>' +

        '<div class="stat-grid luxury-stat-grid">' +
          statCard('Today', g.todayCigs, money(g.todaySpend) + ' spent', 'accent') +
          statCard('This Week', g.weekCigs, money(g.weekSpend) + ' spent', '') +
          statCard('This Month', g.monthCigs, money(g.monthSpend) + ' spent', '') +
          statCard('This Year', g.yearCigs, money(g.yearSpend) + ' spent', 'green') +
        '</div>' +

        '<div class="panel chart-panel"><div class="panel-head"><div><h3>Spending Overview</h3><p class="panel-sub">Last 6 months</p></div><span class="chart-total">' + money(g.totalSpent) + '</span></div>' +
          monthlyChart() +
        '</div>' +

        '<div class="stat-grid">' +
          statCard('Avg / Day', g.avgCigs.toFixed(1), 'cigarettes', '') +
          statCard('Avg Spend', money(g.avgSpend), 'per day', 'green') +
          statCard('Most recorded', mostRecorded ? esc(mostRecorded.name) : '--', mostRecorded ? mostRecorded.cigs + ' cigarettes' : 'no data', 'accent') +
          statCard('Top price', mostExpensive ? esc(mostExpensive.name) : '--', mostExpensive && mostExpensive.avgPrice != null ? money(mostExpensive.avgPrice) + '/cig' : 'no data', '') +
        '</div>' +

        '<div class="panel"><div class="panel-head"><div><h3>Daily Usage</h3><p class="panel-sub">Last 7 days</p></div></div>' + dailyChart() + '</div>' +

        '<div class="panel"><div class="panel-head"><div><h3>Brand Spending</h3><p class="panel-sub">Where your money goes</p></div></div>' +
          '<div class="seg" id="stats-sort">' +
            segBtn('cigarettes', 'Cigarettes', sort) +
            segBtn('spending', 'Spending', sort) +
            segBtn('recent', 'Recent', sort) +
          '</div>' + brandBars + '</div>' +

        '<div class="panel"><h3>Highlights</h3>' +
          '<div class="kv"><span>Most active day</span><b>' + (activeDay ? formatDate(activeDay.date) + ' · ' + activeDay.count + ' cigs' : '--') + '</b></div>' +
          '<div class="kv"><span>Days tracked</span><b>' + recordDates().size + ' days</b></div>' +
          '<div class="kv"><span>Total packs</span><b>' + g.totalPacks + '</b></div>' +
        '</div>' +

        '<div class="panel"><h3>Monthly Report</h3><p class="panel-sub">Detailed monthly totals and brand breakdown</p>' +
          '<button class="btn btn-secondary btn-block" data-go="#/report">Open Monthly Report</button></div>' +

        '<div class="panel streak-panel"><h3>Daily Streak</h3><p class="panel-sub">Active day = at least one cigarette record</p>' +
          '<div class="streak-hero"><div class="streak-flame">🔥</div>' +
            '<div class="streak-num">' + streak.current + ' Day' + (streak.current === 1 ? '' : 's') + '</div>' +
            '<div class="streak-lbl">Current streak · 🏆 Longest: ' + streak.longest + ' days</div></div>' +
        '</div>',
      showBack: false,
      showFab: false,
      init: () => {
        $$('#stats-sort [data-sort]').forEach((btn) => {
          btn.addEventListener('click', () => { state.statsSort = btn.getAttribute('data-sort'); render(); });
        });
      },
    };
  }

  function segBtn(key, label, active) {
    return '<button class="seg-btn' + (active === key ? ' active' : '') + '" data-sort="' + key + '">' + label + '</button>';
  }

  function dailyChart() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const ds = dateToStr(d);
      days.push({ label: DOW[d.getDay()], count: state.cigarettes.filter((c) => c.date === ds).length });
    }
    const max = Math.max(1, ...days.map((x) => x.count));
    return '<div class="bars">' + days.map((x) =>
      '<div class="bar-col"><div class="val">' + x.count + '</div>' +
        '<div class="bar-track"><div class="bar ' + (x.count === 0 ? 'dim' : '') + '" style="height:' + Math.round((x.count / max) * 100) + '%"></div></div>' +
        '<div class="lbl">' + x.label + '</div></div>').join('') + '</div>';
  }

  function monthlyChart() {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      let val = 0;
      state.cigarettes.forEach((c) => { if (c.date.indexOf(key) === 0) val += Number(c.price) || 0; });
      state.packs.forEach((p) => { if (p.date.indexOf(key) === 0) val += Number(p.pack_price != null ? p.pack_price : p.price) || 0; });
      state.loosePurchases.forEach((p) => { if (p.date.indexOf(key) === 0) val += Number(p.total_price) || 0; });
      months.push({ label: MONTHS[d.getMonth()], val });
    }
    const max = Math.max(1, ...months.map((x) => x.val));
    return '<div class="bars">' + months.map((x) =>
      '<div class="bar-col"><div class="val">' + Math.round(x.val) + '</div>' +
        '<div class="bar-track"><div class="bar ' + (x.val === 0 ? 'dim' : '') + '" style="height:' + Math.round((x.val / max) * 100) + '%"></div></div>' +
        '<div class="lbl">' + x.label + '</div></div>').join('') + '</div>';
  }

  /* ============================ Views: Monthly Report ============================ */
  function viewReport() {
    const now = new Date();
    if (!state.reportMonth) state.reportMonth = { y: now.getFullYear(), m: now.getMonth() };
    const { y, m } = state.reportMonth;
    const key = y + '-' + pad(m + 1);
    const cigs = state.cigarettes.filter((c) => c.date.indexOf(key) === 0);
    const packs = state.packs.filter((p) => p.date.indexOf(key) === 0);
    const loose = state.loosePurchases.filter((p) => p.date.indexOf(key) === 0);
    const spent = cigs.reduce((s, c) => s + (Number(c.price) || 0), 0) + packs.reduce((s, p) => s + (Number(p.pack_price != null ? p.pack_price : p.price) || 0), 0) + loose.reduce((s, p) => s + (Number(p.total_price) || 0), 0);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const activeDays = new Set(cigs.map((c) => c.date)).size;
    const avgCigs = cigs.length / daysInMonth;
    const avgSpend = spent / daysInMonth;

    const brandMap = {};
    cigs.forEach((c) => {
      const b = brandById(c.brand_id);
      const k = b ? b.name : 'Unknown';
      brandMap[k] = brandMap[k] || { cigs: 0, spent: 0 };
      brandMap[k].cigs++;
      brandMap[k].spent += Number(c.price) || 0;
    });
    packs.forEach((p) => {
      const b = brandById(p.brand_id);
      const k = b ? b.name : 'Unknown';
      brandMap[k] = brandMap[k] || { cigs: 0, spent: 0 };
      brandMap[k].spent += Number(p.pack_price != null ? p.pack_price : p.price) || 0;
    });
    loose.forEach((p) => {
      const b = brandById(p.brand_id);
      const k = b ? b.name : 'Unknown';
      brandMap[k] = brandMap[k] || { cigs: 0, spent: 0 };
      brandMap[k].spent += Number(p.total_price) || 0;
    });
    const brandRows = Object.keys(brandMap).sort((a, b) => brandMap[b].cigs - brandMap[a].cigs);
    const maxC = Math.max(1, ...brandRows.map((k) => brandMap[k].cigs));

    return {
      title: 'Monthly Report',
      subtitle: MONTHS_FULL[m] + ' ' + y,
      html: '' +
        '<div class="cal-head" style="margin-top:4px">' +
          '<button class="icon-btn" data-report-prev aria-label="Previous month">&#8249;</button>' +
          '<div class="m">' + MONTHS_FULL[m] + ' ' + y + '</div>' +
          '<button class="icon-btn" data-report-next aria-label="Next month">&#8250;</button>' +
        '</div>' +
        '<div class="stat-grid">' +
          statCard('Cigarettes', cigs.length, 'this month', 'accent') +
          statCard('Packs', packs.length, 'this month', '') +
          statCard('Loose', loose.length, 'purchase records', '') +
          statCard('Spending', money(spent), 'this month', 'green') +
          statCard('Active days', activeDays, 'of ' + daysInMonth, '') +
        '</div>' +
        '<div class="panel"><h3>Averages</h3>' +
          '<div class="kv"><span>Average per day</span><b>' + avgCigs.toFixed(1) + ' cigarettes</b></div>' +
          '<div class="kv"><span>Average spending / day</span><b>' + money(avgSpend) + '</b></div>' +
        '</div>' +
        '<div class="panel"><h3>Brand-wise Totals</h3><p class="panel-sub">' + MONTHS_FULL[m] + ' ' + y + '</p>' +
          (brandRows.length ? brandRows.map((k) =>
            '<div class="hbar"><div class="hbar-top"><b>' + esc(k) + '</b><span class="n">' + brandMap[k].cigs + ' cigarettes \u2022 ' + money(brandMap[k].spent) + '</span></div>' +
              '<div class="hbar-track"><div class="hbar-fill" style="width:' + Math.round((brandMap[k].cigs / maxC) * 100) + '%"></div></div></div>').join('')
            : '<p class="panel-sub">No records this month.</p>') +
        '</div>',
      showBack: true,
      showFab: false,
      init: () => {
        $('[data-report-prev]').addEventListener('click', () => shiftReport(-1));
        $('[data-report-next]').addEventListener('click', () => shiftReport(1));
      },
    };
  }

  function shiftReport(n) {
    const { y, m } = state.reportMonth;
    const d = new Date(y, m + n, 1);
    state.reportMonth = { y: d.getFullYear(), m: d.getMonth() };
    render();
  }

  /* ============================ Views: Calendar ============================ */
  function viewCalendar() {
    const now = new Date();
    if (!state.calMonth) state.calMonth = { y: now.getFullYear(), m: now.getMonth() };
    const { y, m } = state.calMonth;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startPad = new Date(y, m, 1).getDay();
    const active = recordDates();
    const today = todayStr();

    let cells = DOW.map((d) => '<div class="cal-dow">' + d + '</div>').join('');
    for (let i = 0; i < startPad; i++) cells += '<div class="cal-cell empty-cell"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = y + '-' + pad(m + 1) + '-' + pad(day);
      const isActive = active.has(ds);
      const isSel = state.calSelected === ds;
      const count = state.cigarettes.filter((c) => c.date === ds).length;
      cells += '<div class="cal-cell' + (isActive ? ' active' : '') + (ds === today ? ' today' : '') + (isSel ? ' sel' : '') + '" data-cal-day="' + ds + '">' +
        day + (count ? '<span class="cnt">' + count + '</span>' : (isActive ? '<span class="dot"></span>' : '')) + '</div>';
    }

    return {
      title: 'Calendar',
      subtitle: 'Tap a date to see its records',
      html: '' +
        '<div class="panel" style="margin-top:6px">' +
          '<div class="cal-head">' +
            '<button class="icon-btn" data-cal-prev aria-label="Previous month">&#8249;</button>' +
            '<div class="m">' + MONTHS[m] + ' ' + y + '</div>' +
            '<button class="icon-btn" data-cal-next aria-label="Next month">&#8250;</button>' +
          '</div>' +
          '<div class="cal-grid">' + cells + '</div>' +
          '<div style="display:flex;gap:16px;margin-top:14px;font-size:12px;color:var(--muted-2)">' +
            '<span><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--green)"></span> Has record</span>' +
            '<span><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--surface)"></span> No record</span>' +
          '</div>' +
        '</div>' +
        (state.calSelected ? '<div class="panel" id="day-detail">' + dayDetailHTML(state.calSelected) + '</div>' : ''),
      showBack: false,
      showFab: false,
      init: () => {
        $$('[data-cal-day]').forEach((el) => {
          el.addEventListener('click', () => { state.calSelected = el.getAttribute('data-cal-day'); render(); });
        });
        $('[data-cal-prev]').addEventListener('click', () => shiftMonth(-1));
        $('[data-cal-next]').addEventListener('click', () => shiftMonth(1));
      },
    };
  }

  function shiftMonth(n) {
    const { y, m } = state.calMonth;
    const d = new Date(y, m + n, 1);
    state.calMonth = { y: d.getFullYear(), m: d.getMonth() };
    state.calSelected = null;
    render();
  }

  function dayDetailHTML(ds) {
    const cigs = state.cigarettes.filter((c) => c.date === ds);
    const packs = state.packs.filter((p) => p.date === ds);
    const packQty = packs.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const spent = cigs.reduce((s, c) => s + (Number(c.price) || 0), 0) + packs.reduce((s, p) => s + (Number(p.pack_price) || 0), 0);

    const brandCounts = {};
    cigs.forEach((c) => { brandCounts[c.brand_id] = (brandCounts[c.brand_id] || 0) + 1; });
    packs.forEach((p) => { brandCounts[p.brand_id] = (brandCounts[p.brand_id] || 0) + (Number(p.quantity) || 0); });
    const brandLines = Object.keys(brandCounts).map((bid) => {
      const b = brandById(bid);
      return '<div class="hbar-top" style="margin-bottom:4px"><b>' + esc(b ? b.name : 'Unknown') + '</b><span class="n">' + brandCounts[bid] + '</span></div>';
    }).join('') || '<p class="panel-sub">No brands recorded.</p>';

    const d = strToDate(ds);
    const cigRecords = cigs.slice().sort((a, b) => (b.time || '').localeCompare(a.time || '')).map((c) => {
      const b = brandById(c.brand_id);
      return cigRowHTML(c, b ? b.name : 'Cigarette', { showBrand: true });
    }).join('');
    const packRecords = packs.slice().sort((a, b) => (b.time || '').localeCompare(a.time || '')).map((p) => {
      const b = brandById(p.brand_id);
      return packRowHTML(p, b ? b.name : 'Pack', { showBrand: true });
    }).join('');

    return '' +
      '<h3>' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + '</h3>' +
      '<p class="panel-sub">' + cigs.length + ' cigarettes \u2022 ' + money(spent) + ' spent' + (packs.length ? ' \u2022 ' + packs.length + ' packs' : '') + '</p>' +
      '<div style="margin:14px 0 16px">' + brandLines + '</div>' +
      (cigRecords ? '<div class="section-label" style="margin-top:6px">Individual Records</div>' + cigRecords : '') +
      (packRecords ? '<div class="section-label" style="margin-top:16px">Pack Records</div>' + packRecords : '') +
      (!cigRecords && !packRecords ? '<p class="panel-sub">No records on this day.</p>' : '');
  }

  /* ============================ Views: Settings ============================ */
  function viewSettings() {
    const rows = state.brands.map((b) => {
      const s = brandStats(b);
      const thumb = b.photo
        ? '<div class="brand-thumb"><img src="' + b.photo + '" alt=""></div>'
        : '<div class="brand-thumb">' + esc(initials(b.name)) + '</div>';
      return '<div class="settings-row">' + thumb +
        '<div class="grow"><div class="t">' + esc(b.name) + '</div><div class="s">' + s.cigCount + ' cigarettes \u2022 ' + money(s.spent) + '</div></div>' +
        '<button class="icon-btn" data-edit-brand="' + b.id + '" aria-label="Edit">' +
          '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>' +
        '</button>' +
      '</div>';
    }).join('') || '<p class="panel-sub">No brands yet.</p>';

    const currencyOptions = CURRENCIES.map((c) => '<option value="' + c + '"' + (settings.currency === c ? ' selected' : '') + '>' + c + '</option>').join('');

    return {
      title: 'Settings',
      subtitle: 'Profile, brands and data',
      html: '' +
        '<div class="section-label" style="margin-top:6px">Profile</div>' +
        '<div class="panel">' +
          '<div class="field"><label>Profile name</label><input class="input" id="set-name" type="text" value="' + esc(settings.profile_name) + '" /></div>' +
          '<div class="grid-2" style="margin-top:14px">' +
            '<div class="field"><label>Currency</label><select class="select" id="set-currency">' + currencyOptions + '</select></div>' +
            '<div class="field"><label>Default pack size</label><input class="input" type="number" min="1" id="set-packsize" value="' + esc(settings.default_pack_size) + '" /></div>' +
          '</div>' +
          '<div class="field" style="margin-top:14px"><label>Default cigarette price</label><input class="input" type="number" step="0.01" min="0" id="set-price" value="' + esc(settings.default_price) + '" /></div>' +
        '</div>' +
        '<div class="section-label">Appearance</div>' +
        '<div class="panel">' +
          '<label>Theme</label>' +
          '<div class="seg" id="set-theme">' +
            '<button class="seg-btn' + (settings.theme === 'dark' ? ' active' : '') + '" data-theme="dark">Dark Mode</button>' +
            '<button class="seg-btn' + (settings.theme === 'light' ? ' active' : '') + '" data-theme="light">Light Mode</button>' +
          '</div>' +
        '</div>' +
        '<div class="section-label">Reminder</div>' +
        '<div class="panel">' +
          '<div class="switch-row"><div><div class="t">Daily reminder</div><div class="s">Get a nudge if you have not logged a cigarette</div></div>' +
            '<button class="switch' + (settings.reminder_enabled ? ' on' : '') + '" id="set-reminder" aria-label="Toggle reminder"><span></span></button></div>' +
          '<div class="field" style="margin-top:12px"><label>Reminder time</label><input class="input" type="time" id="set-reminder-time" value="' + esc(settings.reminder_time) + '" /></div>' +
        '</div>' +
        '<div class="section-label">Brand Containers</div>' +
        rows +
        '<button class="btn btn-primary btn-block" data-nav-brand-new="1" style="margin-top:6px">+ Create New Brand</button>' +
        '<div class="section-label">Data</div>' +
        '<button class="btn btn-secondary btn-block" id="export-json" style="margin-bottom:10px">Export JSON</button>' +
        '<button class="btn btn-secondary btn-block" id="export-csv" style="margin-bottom:10px">Export CSV</button>' +
        '<label class="btn btn-secondary btn-block" for="import-input" style="margin-bottom:10px">Import / Restore Backup' +
          '<input id="import-input" type="file" accept="application/json,.json" class="hidden" /></label>' +
        '<button class="btn btn-danger btn-block" id="clear-history">Clear History</button>' +
        '<div class="about">' + esc(settings.profile_name || 'Cig Diary') + ' &bull; personal cigarette tracker<br />All data is stored privately on this device.</div>',
      showBack: false,
      showFab: false,
      init: () => {
        $('#set-name').addEventListener('change', (e) => { settings.profile_name = e.target.value.trim() || 'My Cigarette Tracker'; saveSettings(); toast('Profile saved'); });
        $('#set-currency').addEventListener('change', (e) => { settings.currency = e.target.value; saveSettings(); render(); });
        $('#set-packsize').addEventListener('change', (e) => { settings.default_pack_size = parseInt(e.target.value, 10) || 20; saveSettings(); });
        $('#set-price').addEventListener('change', (e) => { settings.default_price = parseFloat(e.target.value) || 0; saveSettings(); });
        $$('#set-theme [data-theme]').forEach((btn) => {
          btn.addEventListener('click', () => { settings.theme = btn.getAttribute('data-theme'); saveSettings(); applyTheme(); render(); });
        });
        $('#set-reminder').addEventListener('click', toggleReminder);
        $('#set-reminder-time').addEventListener('change', (e) => { settings.reminder_time = e.target.value || '21:00'; saveSettings(); });
        $('#export-json').addEventListener('click', exportJSON);
        $('#export-csv').addEventListener('click', exportCSV);
        $('#import-input').addEventListener('change', importData);
        $('#clear-history').addEventListener('click', clearHistory);
      },
    };
  }

  async function toggleReminder() {
    if (!settings.reminder_enabled) {
      if (typeof Notification === 'undefined') { toast('Notifications not supported'); return; }
      try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { toast('Permission denied'); return; }
      } catch (e) { toast('Could not enable reminders'); return; }
      settings.reminder_enabled = true;
    } else {
      settings.reminder_enabled = false;
    }
    saveSettings();
    $('#set-reminder').classList.toggle('on', settings.reminder_enabled);
  }

  function maybeRemind() {
    if (!settings.reminder_enabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (localStorage.getItem('cig_last_reminder') === todayStr()) return;
    if (state.cigarettes.some((c) => c.date === todayStr())) return;
    const parts = String(settings.reminder_time || '21:00').split(':').map(Number);
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() >= (parts[0] || 0) * 60 + (parts[1] || 0)) {
      try { new Notification('Cig Diary', { body: 'You have not recorded a cigarette today.' }); } catch (e) { /* ignore */ }
      localStorage.setItem('cig_last_reminder', todayStr());
    }
  }

  /* ============================ Backup ============================ */
  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const payload = {
      app: 'cig-diary', version: 3, exported_at: new Date().toISOString(),
      brands: state.brands, cigarettes: state.cigarettes, packs: state.packs, loose_purchases: state.loosePurchases, settings,
    };
    download('cig-diary-backup-' + todayStr() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('JSON exported');
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    const lines = ['type,date,time,brand,price,quantity,remaining,notes'];
    state.cigarettes.forEach((c) => {
      const b = brandById(c.brand_id);
      lines.push(['cigarette', c.date, c.time || '', b ? b.name : '', c.price, '', '', c.notes || ''].map(csvCell).join(','));
    });
    state.packs.forEach((p) => {
      const b = brandById(p.brand_id);
      lines.push(['pack', p.date, p.time || '', b ? b.name : '', p.pack_price != null ? p.pack_price : p.price, p.quantity, p.remaining_quantity, p.notes || ''].map(csvCell).join(','));
    });
    state.loosePurchases.forEach((p) => {
      const b = brandById(p.brand_id);
      lines.push(['loose_purchase', p.date, p.time || '', b ? b.name : '', p.total_price, p.quantity, '', p.notes || ''].map(csvCell).join(','));
    });
    download('cig-diary-' + todayStr() + '.csv', lines.join('\n'), 'text/csv');
    toast('CSV exported');
  }

  async function importData(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.brands)) throw new Error('bad file');
      const ok = await confirmAction('Replace all current data with this backup?', 'Import');
      if (!ok) return;
      await DB.clear(DB.STORES.brands);
      await DB.clear(DB.STORES.cigarettes);
      await DB.clear(DB.STORES.packs);
      await DB.clear(DB.STORES.loose_purchases);
      await DB.bulkPut(DB.STORES.brands, data.brands || []);
      await DB.bulkPut(DB.STORES.cigarettes, data.cigarettes || []);
      await DB.bulkPut(DB.STORES.packs, data.packs || []);
      await DB.bulkPut(DB.STORES.loose_purchases, data.loose_purchases || []);
      if (data.settings) { Object.assign(settings, data.settings); saveSettings(); applyTheme(); }
      await loadData();
      toast('Backup imported');
      location.hash = '#/home';
      render();
    } catch (err) {
      toast('Invalid backup file');
    } finally {
      e.target.value = '';
    }
  }

  async function clearHistory() {
    const ok = await confirmAction('Clear all cigarette and pack records? Brands are kept.', 'Clear History');
    if (!ok) return;
    await DB.clear(DB.STORES.cigarettes);
    await DB.clear(DB.STORES.packs);
    await DB.clear(DB.STORES.loose_purchases);
    await loadData();
    toast('History cleared');
    location.hash = '#/home';
    render();
  }

  /* ============================ Action sheet / FAB ============================ */
  function openAddSheet() {
    const overlay = $('#overlay');
    const sheet = $('#sheet');
    const content = $('#sheet-content');
    content.innerHTML = '' +
      '<p class="sheet-title">Add to your diary</p>' +
      '<button class="sheet-option" data-sheet-go="#/quick-add">' +
        '<div class="so-icon">&#9889;</div><div><div class="so-t">Quick Add Cigarette</div><div class="so-s">One tap, auto price &amp; time</div></div></button>' +
      '<button class="sheet-option" data-sheet-go="#/add-cigarette">' +
        '<div class="so-icon">&#128684;</div><div><div class="so-t">Add Cigarette</div><div class="so-s">Full form with photo and notes</div></div></button>' +
      '<button class="sheet-option" data-sheet-go="#/add-pack">' +
        '<div class="so-icon">&#128230;</div><div><div class="so-t">Add Whole Pack</div><div class="so-s">Record a purchased pack</div></div></button>' +
      '<button class="sheet-option" data-sheet-go="#/add-loose">' +
        '<div class="so-icon">&#128722;</div><div><div class="so-t">Buy Loose Cigarettes</div><div class="so-s">Buy 2 or more without a whole pack</div></div></button>' +
      '<button class="sheet-option" data-sheet-go="#/add-brand">' +
        '<div class="so-icon">&#10133;</div><div><div class="so-t">Create New Brand</div><div class="so-s">New brand container</div></div></button>';
    overlay.classList.remove('hidden');
    sheet.classList.remove('hidden');
  }

  function closeSheet() {
    $('#overlay').classList.add('hidden');
    $('#sheet').classList.add('hidden');
  }

  /* ============================ Global events ============================ */
  function bindGlobal() {
    $('#back-btn').addEventListener('click', () => {
      if (history.length > 1) history.back();
      else location.hash = '#/home';
    });

    $('#fab').addEventListener('click', openAddSheet);
    $('#overlay').addEventListener('click', closeSheet);

    $('#sheet-content').addEventListener('click', (e) => {
      const go = e.target.closest('[data-sheet-go]');
      if (go) { closeSheet(); location.hash = go.getAttribute('data-sheet-go'); }
    });

    $('#lightbox-close').addEventListener('click', () => $('#lightbox').classList.add('hidden'));
    $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') $('#lightbox').classList.add('hidden'); });

    document.addEventListener('click', async (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { location.hash = go.getAttribute('data-go'); return; }

      const brandCard = e.target.closest('[data-nav-brand]');
      if (brandCard) { state.brandTab = 'cigarettes'; location.hash = '#/brand/' + brandCard.getAttribute('data-nav-brand'); return; }

      if (e.target.closest('[data-nav-brand-new]')) { location.hash = '#/add-brand'; return; }

      const addCig = e.target.closest('[data-add-cig]');
      if (addCig) { location.hash = '#/add-cigarette?brand=' + addCig.getAttribute('data-add-cig'); return; }

      const addPack = e.target.closest('[data-add-pack]');
      if (addPack) { location.hash = '#/add-pack?brand=' + addPack.getAttribute('data-add-pack'); return; }

      const addLoose = e.target.closest('[data-add-loose]');
      if (addLoose) { location.hash = '#/add-loose?brand=' + addLoose.getAttribute('data-add-loose'); return; }

      const editBrand = e.target.closest('[data-edit-brand]');
      if (editBrand) { location.hash = '#/add-brand?edit=' + editBrand.getAttribute('data-edit-brand'); return; }

      const editCig = e.target.closest('[data-edit-cig]');
      if (editCig) { location.hash = '#/add-cigarette?edit=' + editCig.getAttribute('data-edit-cig'); return; }

      const editPack = e.target.closest('[data-edit-pack]');
      if (editPack) { location.hash = '#/add-pack?edit=' + editPack.getAttribute('data-edit-pack'); return; }

      const editLoose = e.target.closest('[data-edit-loose]');
      if (editLoose) { location.hash = '#/add-loose?edit=' + editLoose.getAttribute('data-edit-loose'); return; }

      const lightbox = e.target.closest('[data-lightbox]');
      if (lightbox) { openLightbox(lightbox.getAttribute('data-lightbox')); return; }

      const invInc = e.target.closest('[data-inv-inc]');
      if (invInc) { await adjustPackRemaining(invInc.getAttribute('data-inv-inc'), 1); render(); return; }

      const invDec = e.target.closest('[data-inv-dec]');
      if (invDec) { await adjustPackRemaining(invDec.getAttribute('data-inv-dec'), -1); render(); return; }

      const delCig = e.target.closest('[data-del-cig]');
      if (delCig) {
        const id = delCig.getAttribute('data-del-cig');
        const ok = await confirmAction('Delete this cigarette record?', 'Delete');
        if (!ok) return;
        const rec = state.cigarettes.find((c) => c.id === id);
        if (rec && rec.pack_id) await adjustPackRemaining(rec.pack_id, 1);
        await DB.remove(DB.STORES.cigarettes, id);
        state.cigarettes = state.cigarettes.filter((c) => c.id !== id);
        toast('Record deleted');
        render();
        return;
      }

      const delPack = e.target.closest('[data-del-pack]');
      if (delPack) {
        const id = delPack.getAttribute('data-del-pack');
        const ok = await confirmAction('Delete this pack record?', 'Delete');
        if (!ok) return;
        await DB.remove(DB.STORES.packs, id);
        state.packs = state.packs.filter((p) => p.id !== id);
        toast('Pack deleted');
        render();
      }

      const delLoose = e.target.closest('[data-del-loose]');
      if (delLoose) {
        const id = delLoose.getAttribute('data-del-loose');
        const ok = await confirmAction('Delete this loose purchase?', 'Delete');
        if (!ok) return;
        await DB.remove(DB.STORES.loose_purchases, id);
        state.loosePurchases = state.loosePurchases.filter((p) => p.id !== id);
        toast('Loose purchase deleted');
        render();
      }
    });

    window.addEventListener('hashchange', render);
  }

  /* ============================ Boot ============================ */
  async function boot() {
    loadSettings();
    applyTheme();
    try {
      await seedIfEmpty();
      await loadData();
      bindGlobal();
      render();
      maybeRemind();
    } catch (err) {
      $('#screen').innerHTML = '<div class="empty"><div class="big">&#9888;&#65039;</div><h3>Storage error</h3><p>' + esc(err.message || 'Could not open local database.') + '</p></div>';
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
