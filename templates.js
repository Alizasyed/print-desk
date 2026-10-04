(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const E = window.TemplateEngine;
  const MM = E.MM;
  const PAPERS = { a4: [595.28, 841.89], letter: [612, 792], a5: [419.53, 595.28], a6: [297.64, 419.53] };
  const UNITMM = { mm: 1, in: 25.4 };
  const state = { unit: 'mm', type: 'card', vals: {}, art: null };
  const KEY = 'printdesk.templates';

  const toDisp = (mm) => +(mm / UNITMM[state.unit]).toFixed(state.unit === 'in' ? 3 : 1);
  const fromDisp = (v) => (parseFloat(v) || 0) * UNITMM[state.unit];
  const dimMM = (id) => fromDisp($('#' + id).value);

  /* ---------- controls ---------- */
  function fillSelects() {
    const p = $('#preset');
    p.innerHTML = '<option value="">Custom size</option>';
    E.PRESETS.forEach((x, i) => p.append(Object.assign(document.createElement('option'), { value: i, textContent: x.label })));
    const t = $('#type');
    Object.entries(E.TYPES).forEach(([k, v]) => t.append(Object.assign(document.createElement('option'), { value: k, textContent: v.name })));
  }

  function renderFields() {
    const T = E.TYPES[state.type];
    $('#typeDesc').textContent = T.desc;
    const box = $('#fields');
    box.innerHTML = '';
    T.fields.forEach((f) => {
      const label = document.createElement('label');
      label.textContent = f.label;
      let input;
      if (f.select) {
        input = document.createElement('select');
        f.select.forEach(([v, t]) => input.append(Object.assign(document.createElement('option'), { value: v, textContent: t })));
        input.value = state.vals[f.id] || f.def;
        input.addEventListener('change', () => { state.vals[f.id] = input.value; $('#preset').value = ''; update(); });
        label.style.gridColumn = '1 / -1';
      } else {
        input = Object.assign(document.createElement('input'), { type: 'number', min: 0, step: 'any' });
        input.value = toDisp(state.vals[f.id] !== undefined ? state.vals[f.id] : f.def);
        input.addEventListener('input', () => { state.vals[f.id] = fromDisp(input.value); $('#preset').value = ''; update(); });
        input.dataset.field = f.id;
      }
      label.append(input);
      box.append(label);
    });
  }

  function setType(type, vals) {
    state.type = type;
    state.vals = {};
    E.TYPES[type].fields.forEach((f) => { state.vals[f.id] = vals && vals[f.id] !== undefined ? vals[f.id] : f.def; });
    $('#type').value = type;
    renderFields();
  }

  $('#preset').addEventListener('change', (e) => {
    if (e.target.value === '') return;
    const p = E.PRESETS[+e.target.value];
    setType(p.type, p.v);
    update();
  });
  $('#type').addEventListener('change', (e) => { $('#preset').value = ''; setType(e.target.value); update(); });

  $('#unit').addEventListener('change', (e) => {
    const old = state.unit;
    state.unit = e.target.value;
    document.querySelectorAll('.dim').forEach((el) => { el.value = toDisp((parseFloat(el.value) || 0) * UNITMM[old]); });
    renderFields();
    update();
    save();
  });
  $('#controls').addEventListener('input', (e) => { if (e.target.id !== 'artInput') { update(); save(); } });
  $('#controls').addEventListener('change', (e) => { if (e.target.id !== 'artInput') { update(); save(); } });

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ unit: state.unit, paper: PAPERS[$('#paper').value] ? $('#paper').value : 'a4', orientation: $('#orientation').value, copies: $('#copies').value }));
    } catch (e) { /* storage unavailable */ }
  }
  function restore() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return;
      state.unit = s.unit || 'mm'; $('#unit').value = state.unit;
      ['paper', 'orientation', 'copies'].forEach((k) => {
        const el = $('#' + k);
        if (s[k] && [...el.options].some((o) => o.value === s[k])) el.value = s[k];
      });
      document.querySelectorAll('.dim').forEach((el) => { el.value = toDisp(+el.dataset.mm); });
    } catch (e) { /* ignore */ }
  }

  /* ---------- artwork ---------- */
  $('#artInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        state.art = { type: 'pdf', bytes: await f.arrayBuffer(), name: f.name };
      } else if (/^image\//.test(f.type) || /\.svg$/i.test(f.name)) {
        const img = await PrintImages.readImage(f);
        state.art = { type: 'image', mime: img.mime, bytes: img.bytes, name: f.name };
      } else throw new Error('type');
    } catch (err) {
      alert('That file could not be used. Choose a PDF, PNG, JPG, SVG, WebP or GIF.');
      return;
    }
    update();
  });
  $('#artClear').addEventListener('click', () => { state.art = null; update(); });

  /* ---------- build options ---------- */
  function opts() {
    const inch = state.unit === 'in';
    return {
      paper: PAPERS[$('#paper').value] || PAPERS.a4,
      orientation: $('#orientation').value,
      margin: dimMM('margin') * MM,
      gap: dimMM('gap'),
      copies: $('#copies').value,
      bleed: dimMM('bleed'),
      art: !!state.art,
      lines: $('#lines').checked,
      labels: $('#labels').checked,
      ruler: $('#ruler').checked,
      rulerMM: inch ? 50.8 : 50,
      rulerLabel: inch ? '2 in' : '50 mm',
      tileOverlap: 12,
      title: E.TYPES[state.type].name,
    };
  }

  /* ---------- preview ---------- */
  function paperMap(lay) {
    const { W, H } = lay;
    const f = (n) => +n.toFixed(1);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" role="img" aria-label="How the template sits on the paper"><rect width="${f(W)}" height="${f(H)}" fill="#fff"/>`;
    const a = lay.a;
    s += `<rect x="${f(a.x)}" y="${f(H - a.y - a.h)}" width="${f(a.w)}" height="${f(a.h)}" fill="none" stroke="#999" stroke-dasharray="4 4"/>`;
    if (lay.mode === 'grid') {
      const gw = lay.nx * lay.fw + (lay.nx - 1) * lay.gap;
      const gh = lay.ny * lay.fh + (lay.ny - 1) * lay.gap;
      const sx = a.x + (a.w - gw) / 2;
      const top = H - (a.y + (a.h + gh) / 2);
      for (let j = 0; j < lay.ny; j++) for (let i = 0; i < lay.nx; i++) {
        s += `<rect x="${f(sx + i * (lay.fw + lay.gap))}" y="${f(top + j * (lay.fh + lay.gap))}" width="${f(lay.fw)}" height="${f(lay.fh)}" fill="#FF5A1F" fill-opacity=".25" stroke="#1B1A18" stroke-width="1.5"/>`;
      }
    } else {
      s += `<text x="${f(W / 2)}" y="${f(H / 2)}" font-size="${f(W / 9)}" text-anchor="middle" fill="#4A4742" font-family="Arial">Sheet 1 of ${lay.cols * lay.rows}</text>`;
    }
    return s + '</svg>';
  }

  let seq = 0;
  function update() {
    const T = E.TYPES[state.type];
    const vals = {};
    T.fields.forEach((f) => { vals[f.id] = state.vals[f.id]; });
    const tpl = E.generate(state.type, vals);
    const o = opts();
    const lay = E.layout(tpl, o);

    $('#bleedWrap').hidden = !state.art;
    $('#artName').hidden = !state.art;
    $('#artRow').hidden = !state.art;
    if (state.art) $('#artName').textContent = 'Artwork: ' + state.art.name;

    const u = state.unit;
    const fmt = (mm) => (u === 'in' ? (mm / 25.4).toFixed(2) + ' in' : mm.toFixed(1) + ' mm');
    $('#shape').innerHTML = E.toSVG(tpl, { labels: true, pad: 4, sized: false, cut: '#C0310B', fold: '#1B1A18', sw: 0.5 });
    $('#shapeCap').textContent = `${T.name}: ${fmt(tpl.w)} × ${fmt(tpl.h)}. Solid is cut, dashed is fold.`;
    $('#paperMap').innerHTML = paperMap(lay);
    const paperName = ($('#paper').selectedOptions[0] || { textContent: 'A4' }).textContent.split(' ')[0];
    if (lay.mode === 'grid') {
      const n = lay.nx * lay.ny;
      $('#summary').textContent = `${n} cop${n > 1 ? 'ies' : 'y'} on one ${paperName} sheet, true size`;
      $('#paperCap').textContent = `${paperName}, ${lay.W > lay.H ? 'landscape' : 'portrait'}. Dotted line is your printer margin.`;
    } else {
      const n = lay.cols * lay.rows;
      $('#summary').textContent = `Too big for one sheet. Prints on ${n} sheets (${lay.cols} across, ${lay.rows} down) to tape together`;
      $('#paperCap').textContent = `Each sheet overlaps the next by 12 mm. Choose a bigger paper size to print it in one piece.`;
    }

    const tb = $('#panels tbody');
    tb.innerHTML = '';
    tpl.panels.forEach((q) => {
      const tr = document.createElement('tr');
      tr.append(Object.assign(document.createElement('td'), { textContent: q.label }), Object.assign(document.createElement('td'), { textContent: `${fmt(q.w)} × ${fmt(q.h)}` }));
      tb.append(tr);
    });
    $('#notes').textContent = tpl.notes + (state.art ? ` Artwork prints ${fmt(o.bleed)} past the cut line.` : '');
    seq++;
  }

  /* ---------- export ---------- */
  function currentTpl() {
    const vals = {};
    E.TYPES[state.type].fields.forEach((f) => { vals[f.id] = state.vals[f.id]; });
    return E.generate(state.type, vals);
  }
  const fileBase = () => E.TYPES[state.type].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  async function makePDF() {
    return E.buildPDF(PDFLib, currentTpl(), opts(), state.art);
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  $('#download').addEventListener('click', async () => {
    try { const r = await makePDF(); saveBlob(new Blob([r.bytes], { type: 'application/pdf' }), `${fileBase()}-template.pdf`); }
    catch (e) { $('#summary').textContent = e.message || 'Could not create the PDF.'; }
  });
  $('#svg').addEventListener('click', () => {
    saveBlob(new Blob([E.toSVG(currentTpl(), { pad: 0 })], { type: 'image/svg+xml' }), `${fileBase()}-template.svg`);
  });
  $('#printNow').addEventListener('click', async () => {
    try {
      const r = await makePDF();
      const url = URL.createObjectURL(new Blob([r.bytes], { type: 'application/pdf' }));
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

  /* ---------- start ---------- */
  document.querySelectorAll('.dim').forEach((el) => { el.dataset.mm = fromDisp(el.value) || 0; });
  fillSelects();
  restore();
  const first = E.PRESETS[0];
  setType(first.type, first.v);
  $('#preset').value = '0';
  update();
})();
