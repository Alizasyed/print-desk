(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const MM = 72 / 25.4;
  const UNITMM = { mm: 1, in: 25.4 };
  const PAPERS = { a4: [595.28, 841.89], letter: [612, 792], a5: [419.53, 595.28] };
  const PRESETS = [
    ['10 × 15 cm', 100, 150], ['4 × 6 in', 101.6, 152.4], ['5 × 7 in', 127, 178], ['13 × 18 cm', 130, 180],
    ['9 × 13 cm', 90, 130], ['3.5 × 5 in', 88.9, 127], ['A6', 105, 148], ['A5', 148, 210],
    ['Square, 10 × 10 cm', 100, 100], ['Square, 3 × 3 in', 76.2, 76.2], ['Wallet, 2.5 × 3.5 in', 63.5, 88.9],
    ['Passport, 35 × 45 mm', 35, 45], ['US passport, 2 × 2 in', 50.8, 50.8],
    ['Instax Mini, 54 × 86 mm', 54, 86], ['Instax Wide, 62 × 99 mm', 62, 99],
  ];
  const state = { unit: 'mm', photos: [], nextId: 1, sheet: 0, built: null };

  const toDisp = (mm) => +(mm / UNITMM[state.unit]).toFixed(state.unit === 'in' ? 3 : 1);
  const dimMM = (id) => (parseFloat($('#' + id).value) || 0) * UNITMM[state.unit];
  const setDim = (id, mm) => { $('#' + id).value = toDisp(mm); };

  /* ---------- photos ---------- */
  async function bitmapOf(file) {
    let blob = file;
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      const r = await PrintImages.readImage(file);
      blob = new Blob([r.bytes], { type: r.mime });
    }
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch (e) { return createImageBitmap(blob); }
  }

  async function addPhoto(file) {
    try {
      const bmp = await bitmapOf(file);
      const k = Math.min(1, 4096 / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * k));
      const h = Math.max(1, Math.round(bmp.height * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
      const t = document.createElement('canvas');
      const tk = 360 / Math.max(w, h);
      t.width = Math.max(1, Math.round(w * tk)); t.height = Math.max(1, Math.round(h * tk));
      t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      state.photos.push({ id: state.nextId++, name: file.name, bytes: await blob.arrayBuffer(), w, h, thumb: t.toDataURL('image/jpeg', 0.8), copies: 1 });
    } catch (e) {
      alert(`${file.name} could not be read. Use JPG, PNG, WebP, GIF or SVG. iPhone HEIC photos need to be exported as JPG first.`);
    }
  }
  async function addFiles(list) {
    for (const f of list) await addPhoto(f);
    renderList(); update();
  }
  $('#fileInput').addEventListener('change', async (e) => { await addFiles(e.target.files); e.target.value = ''; });
  const drop = $('#drop');
  document.addEventListener('dragover', (e) => { if (e.dataTransfer && e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('over'); });
  document.addEventListener('drop', (e) => { drop.classList.remove('over'); if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
  $('#clearAll').addEventListener('click', () => { state.photos = []; renderList(); update(); });

  function renderList() {
    const ul = $('#fileList');
    ul.innerHTML = '';
    state.photos.forEach((p, i) => {
      const li = document.createElement('li');
      const img = Object.assign(document.createElement('img'), { src: p.thumb, alt: '' });
      const mid = document.createElement('div');
      mid.append(
        Object.assign(document.createElement('div'), { className: 'name', textContent: p.name, title: p.name }),
        Object.assign(document.createElement('div'), { className: 'meta', textContent: `${p.w} × ${p.h} px` }),
      );
      const lab = document.createElement('label');
      lab.style.cssText = 'margin:6px 0 0;font-size:12.5px';
      lab.textContent = 'Copies ';
      const n = Object.assign(document.createElement('input'), { type: 'number', min: 1, max: 99, value: p.copies, className: 'range' });
      n.style.cssText = 'display:inline-block;width:64px;margin:0 0 0 6px';
      n.addEventListener('input', () => { p.copies = Math.max(1, Math.min(99, parseInt(n.value, 10) || 1)); update(); });
      lab.append(n);
      mid.append(lab);
      const btns = document.createElement('div');
      btns.className = 'btns';
      const mk = (t, label, fn, dis) => { const b = Object.assign(document.createElement('button'), { type: 'button', textContent: t, disabled: !!dis }); b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };
      const move = (to) => { if (to < 0 || to >= state.photos.length) return; state.photos.splice(to, 0, state.photos.splice(i, 1)[0]); renderList(); update(); };
      btns.append(mk('↑', `Move ${p.name} up`, () => move(i - 1), i === 0), mk('↓', `Move ${p.name} down`, () => move(i + 1), i === state.photos.length - 1), mk('×', `Remove ${p.name}`, () => { state.photos.splice(i, 1); renderList(); update(); }));
      li.append(img, mid, btns);
      ul.append(li);
    });
  }

  /* ---------- settings ---------- */
  function fillPresets() {
    const p = $('#preset');
    p.innerHTML = '<option value="">Custom size</option>';
    PRESETS.forEach((x, i) => p.append(Object.assign(document.createElement('option'), { value: i, textContent: x[0] })));
    p.value = '0';
    setDim('slotW', PRESETS[0][1]); setDim('slotH', PRESETS[0][2]);
  }
  $('#preset').addEventListener('change', (e) => {
    if (e.target.value === '') return;
    const x = PRESETS[+e.target.value];
    setDim('slotW', x[1]); setDim('slotH', x[2]);
    update();
  });
  ['slotW', 'slotH'].forEach((id) => $('#' + id).addEventListener('input', () => { $('#preset').value = ''; }));
  $('#unit').addEventListener('change', (e) => {
    const old = state.unit;
    state.unit = e.target.value;
    document.querySelectorAll('.dim').forEach((el) => { el.value = toDisp((parseFloat(el.value) || 0) * UNITMM[old]); });
    update(); save();
  });
  $('#controls').addEventListener('input', (e) => { if (e.target.id !== 'fileInput' && !e.target.classList.contains('range')) { update(); save(); } });
  $('#controls').addEventListener('change', (e) => { if (e.target.id !== 'fileInput') { update(); save(); } });

  const KEY = 'printdesk.photos';
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ unit: state.unit, paper: $('#paper').value })); } catch (e) { /* ignore */ } }
  function restore() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return;
      if (s.unit && UNITMM[s.unit]) { state.unit = s.unit; $('#unit').value = s.unit; }
      if (s.paper && PAPERS[s.paper]) $('#paper').value = s.paper;
    } catch (e) { /* ignore */ }
  }

  /* ---------- layout ---------- */
  function opts() {
    return {
      paper: PAPERS[$('#paper').value] || PAPERS.a4,
      orientation: $('#orientation').value,
      slotOrient: $('#slotOrient').value,
      slot: [dimMM('slotW') * MM, dimMM('slotH') * MM],
      margin: dimMM('margin') * MM,
      marginB: dimMM('marginB') * MM,
      gap: dimMM('gap') * MM,
      fit: $('#fit').value,
      mix: $('#mix').checked,
      rotate: $('#rotate').checked,
      border: $('#border').checked,
      ruler: $('#ruler').checked,
      rulerMM: state.unit === 'in' ? 50.8 : 50,
      rulerLabel: state.unit === 'in' ? '2 in' : '50 mm',
    };
  }

  // Rows ("shelves") of slots stacked down the sheet. Each row can be portrait or landscape,
  // so a sheet can hold two portrait photos side by side and one landscape photo underneath.
  function shelfPack(aw, ah, gap, dims) {
    const memo = new Map();
    const best = (rem) => {
      const key = Math.round(rem * 100);
      if (memo.has(key)) return memo.get(key);
      let res = { n: 0, shelves: [] };
      for (const [w, h] of dims) {
        if (h > rem + 1e-6 || w > aw + 1e-6) continue;
        const cnt = Math.floor((aw + gap + 1e-6) / (w + gap));
        const next = best(rem - h - gap);
        if (cnt + next.n > res.n) res = { n: cnt + next.n, shelves: [{ w, h, cnt }].concat(next.shelves) };
      }
      memo.set(key, res);
      return res;
    };
    return best(ah);
  }

  function layout(o) {
    const [pw, ph] = [Math.min(...o.paper), Math.max(...o.paper)];
    const sheets = o.orientation === 'portrait' ? [[pw, ph]] : o.orientation === 'landscape' ? [[ph, pw]] : [[pw, ph], [ph, pw]];
    const lo = Math.min(...o.slot);
    const hi = Math.max(...o.slot);
    let dims = o.slotOrient === 'portrait' ? [[lo, hi]] : o.slotOrient === 'landscape' ? [[hi, lo]] : [[lo, hi], [hi, lo]];
    if (lo === hi) dims = [[lo, hi]];
    const sets = o.mix && dims.length > 1 ? [dims] : dims.map((d) => [d]);
    const ruler = o.ruler ? 18 : 0;
    let best = null;
    for (const [W, H] of sheets) {
      const a = { x: o.margin, y: o.marginB + ruler, w: W - 2 * o.margin, h: H - o.margin - o.marginB - ruler };
      for (const set of sets) {
        const r = shelfPack(a.w, a.h, o.gap, set);
        if (!r.n) continue;
        const mixed = new Set(r.shelves.map((s) => s.w + 'x' + s.h)).size > 1;
        if (!best || r.n > best.n || (r.n === best.n && best.mixed && !mixed)) best = { W, H, a, n: r.n, shelves: r.shelves, mixed };
      }
    }
    if (!best) return null;
    const total = best.shelves.reduce((s, r) => s + r.h, 0) + o.gap * (best.shelves.length - 1);
    let yTop = best.a.y + (best.a.h + total) / 2;
    const slots = [];
    for (const sh of best.shelves) {
      const y = yTop - sh.h;
      const rowW = sh.cnt * sh.w + (sh.cnt - 1) * o.gap;
      const x0 = best.a.x + (best.a.w - rowW) / 2;
      for (let i = 0; i < sh.cnt; i++) slots.push({ x: x0 + i * (sh.w + o.gap), y, w: sh.w, h: sh.h });
      yTop -= sh.h + o.gap;
    }
    return { W: best.W, H: best.H, a: best.a, slots, per: slots.length, mixed: best.mixed };
  }

  // Put each photo in a slot that matches its direction where possible.
  function assign(list, lay, sheetIdx) {
    const chunk = list.slice(sheetIdx * lay.per, (sheetIdx + 1) * lay.per);
    const out = new Array(lay.slots.length).fill(null);
    const used = new Array(lay.slots.length).fill(false);
    const rest = [];
    for (const p of chunk) {
      const land = p.w > p.h;
      const k = lay.slots.findIndex((s, i) => !used[i] && (s.w > s.h) === land);
      if (k < 0) rest.push(p); else { used[k] = true; out[k] = p; }
    }
    for (const p of rest) {
      const k = lay.slots.findIndex((s, i) => !used[i]);
      if (k >= 0) { used[k] = true; out[k] = p; }
    }
    return out;
  }

  function instances() {
    const list = [];
    state.photos.forEach((p) => { for (let i = 0; i < p.copies; i++) list.push(p); });
    return list;
  }

  // where the photo sits inside its slot, in points
  function place(photo, sx, sy, sw, sh, o) {
    const photoLand = photo.w > photo.h;
    const slotLand = sw > sh;
    const turn = o.rotate && photoLand !== slotLand && photo.w !== photo.h && Math.abs(sw - sh) > 0.5;
    const fw = turn ? sh : sw;
    const fh = turn ? sw : sh;
    const s = o.fit === 'fill' ? Math.max(fw / photo.w, fh / photo.h) : Math.min(fw / photo.w, fh / photo.h);
    const nw = photo.w * s;
    const nh = photo.h * s;
    return { turn, nw, nh, cx: sx + sw / 2, cy: sy + sh / 2 };
  }

  /* ---------- preview ---------- */
  function sheetSVG(lay, list, sheetIdx, o) {
    const f = (n) => +n.toFixed(2);
    const { W, H } = lay;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" role="img" aria-label="Sheet ${sheetIdx + 1} layout"><rect width="${f(W)}" height="${f(H)}" fill="#fff"/>`;
    s += `<rect x="${f(lay.a.x)}" y="${f(H - lay.a.y - lay.a.h)}" width="${f(lay.a.w)}" height="${f(lay.a.h)}" fill="none" stroke="#bbb" stroke-dasharray="4 4"/>`;
    const photos = assign(list, lay, sheetIdx);
    lay.slots.forEach((slot, k) => {
      const ph = photos[k];
      const x = slot.x;
      const y = H - slot.y - slot.h;
      if (!ph) { s += `<rect x="${f(x)}" y="${f(y)}" width="${f(slot.w)}" height="${f(slot.h)}" fill="#f4f1ea" stroke="#ccc" stroke-dasharray="3 3"/>`; return; }
      const pl = place(ph, x, y, slot.w, slot.h, o);
      const slice = o.fit === 'fill' ? 'slice' : 'meet';
      if (pl.turn) {
        s += `<g transform="translate(${f(x + slot.w / 2)} ${f(y + slot.h / 2)}) rotate(90)"><svg x="${f(-slot.h / 2)}" y="${f(-slot.w / 2)}" width="${f(slot.h)}" height="${f(slot.w)}"><image href="${ph.thumb}" width="100%" height="100%" preserveAspectRatio="xMidYMid ${slice}"/></svg></g>`;
      } else {
        s += `<svg x="${f(x)}" y="${f(y)}" width="${f(slot.w)}" height="${f(slot.h)}"><image href="${ph.thumb}" width="100%" height="100%" preserveAspectRatio="xMidYMid ${slice}"/></svg>`;
      }
      if (o.border) s += `<rect x="${f(x)}" y="${f(y)}" width="${f(slot.w)}" height="${f(slot.h)}" fill="none" stroke="#666" stroke-width="0.6"/>`;
    });
    return s + '</svg>';
  }

  const fmt = (mm) => (state.unit === 'in' ? (mm / 25.4).toFixed(2) + ' in' : mm.toFixed(0) + ' mm');
  function update() {
    const has = state.photos.length > 0;
    $('#printNow').disabled = !has;
    $('#download').disabled = !has;
    const o = opts();
    const lay = layout(o);
    const paperName = $('#paper').selectedOptions[0].textContent.split(' ')[0];
    if (!lay) {
      $('#summary').textContent = `That size does not fit on ${paperName}. Choose a smaller size, a smaller margin or a bigger sheet.`;
      $('#sheet').innerHTML = ''; $('#sheetCap').textContent = ''; $('#nav').hidden = true;
      $('#printNow').disabled = true; $('#download').disabled = true;
      return;
    }
    const list = instances();
    const sheets = Math.max(1, Math.ceil(list.length / lay.per));
    state.sheet = Math.min(state.sheet, sheets - 1);
    $('#nav').hidden = sheets < 2;
    $('#navLabel').textContent = `Sheet ${state.sheet + 1} of ${sheets}`;
    $('#prev').disabled = state.sheet === 0;
    $('#next').disabled = state.sheet >= sheets - 1;
    $('#summary').textContent = has
      ? `${list.length} photo${list.length > 1 ? 's' : ''} on ${sheets} sheet${sheets > 1 ? 's' : ''} of ${paperName}, ${lay.per} per sheet at ${fmt(Math.min(...o.slot) / MM)} × ${fmt(Math.max(...o.slot) / MM)}`
      : `${lay.per} photos of ${fmt(Math.min(...o.slot) / MM)} × ${fmt(Math.max(...o.slot) / MM)} fit on one ${paperName} sheet. Add photos to begin.`;
    $('#sheet').innerHTML = sheetSVG(lay, list, state.sheet, o);
    $('#sheetCap').textContent = `${paperName}, ${lay.W > lay.H ? 'landscape' : 'portrait'}. Dashed line is your printer margin.`;
  }
  $('#prev').addEventListener('click', () => { state.sheet = Math.max(0, state.sheet - 1); update(); });
  $('#next').addEventListener('click', () => { state.sheet += 1; update(); });

  /* ---------- PDF ---------- */
  async function buildPDF() {
    const { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = PDFLib;
    const o = opts();
    const lay = layout(o);
    const list = instances();
    if (!lay || !list.length) throw new Error('Nothing to print.');
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const grey = rgb(0.4, 0.4, 0.4);
    const emb = new Map();
    for (const p of state.photos) emb.set(p.id, await out.embedJpg(p.bytes));
    const rot = (x, y, dw, dh) => ({ x, y: y + dh, width: dh, height: dw, deg: -90 });
    const sheets = Math.ceil(list.length / lay.per);
    for (let sh = 0; sh < sheets; sh++) {
      const page = out.addPage([lay.W, lay.H]);
      const photos = assign(list, lay, sh);
      lay.slots.forEach((pos, k) => {
        const ph = photos[k];
        if (!ph) return;
        const pl = place(ph, pos.x, pos.y, pos.w, pos.h, o);
        page.pushOperators(pushGraphicsState(), rectangle(pos.x, pos.y, pos.w, pos.h), clip(), endPath());
        if (pl.turn) {
          const r = rot(pl.cx - pl.nh / 2, pl.cy - pl.nw / 2, pl.nh, pl.nw);
          page.drawImage(emb.get(ph.id), { x: r.x, y: r.y, width: r.width, height: r.height, rotate: degrees(r.deg) });
        } else {
          page.drawImage(emb.get(ph.id), { x: pl.cx - pl.nw / 2, y: pl.cy - pl.nh / 2, width: pl.nw, height: pl.nh });
        }
        page.pushOperators(popGraphicsState());
      });
      if (o.border) {
        lay.slots.forEach((pos, k) => {
          if (!photos[k]) return;
          page.drawRectangle({ x: pos.x, y: pos.y, width: pos.w, height: pos.h, borderColor: grey, borderWidth: 0.4, opacity: 0, borderOpacity: 1 });
        });
      }
      if (o.ruler) {
        const len = o.rulerMM * MM;
        const x = o.margin;
        const y = o.marginB + 8;
        page.drawLine({ start: { x, y }, end: { x: x + len, y }, thickness: 0.8, color: rgb(0, 0, 0) });
        [0, len].forEach((d) => page.drawLine({ start: { x: x + d, y: y - 3 }, end: { x: x + d, y: y + 3 }, thickness: 0.8, color: rgb(0, 0, 0) }));
        page.drawText(`Check: this line is ${o.rulerLabel} long. If it is not, print at 100% or "Actual size".`, { x: x + len + 8, y: y - 2.5, size: 7, font, color: grey });
      }
    }
    out.setTitle('Photo sheets');
    out.setProducer('Print Desk');
    return out.save();
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  $('#download').addEventListener('click', async () => {
    try { saveBlob(new Blob([await buildPDF()], { type: 'application/pdf' }), 'photo-sheets.pdf'); }
    catch (e) { $('#summary').textContent = e.message || 'Could not create the PDF.'; }
  });
  $('#printNow').addEventListener('click', async () => {
    try {
      const url = URL.createObjectURL(new Blob([await buildPDF()], { type: 'application/pdf' }));
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
      let done = false;
      const fallback = () => { if (done) return; done = true; window.open(url, '_blank'); };
      frame.onload = () => setTimeout(() => {
        if (done) return;
        try { frame.contentWindow.focus(); frame.contentWindow.print(); done = true; } catch (err) { fallback(); }
      }, 400);
      frame.src = url;
      document.body.append(frame);
      setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 120000);
      setTimeout(fallback, 6000);
    } catch (e) { $('#summary').textContent = e.message || 'Could not prepare the print job.'; }
  });

  $('#scaleTest').addEventListener('click', () => PrintTest.open(PDFLib, PAPERS[$('#paper').value] || PAPERS.a4));

  window.__photos = { state, layout, opts, buildPDF };
  restore();
  fillPresets();
  renderList();
  update();
})();
