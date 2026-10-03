(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  const PT = { in: 72, mm: 72 / 25.4 };
  const state = { files: [], unit: 'in', built: null, pdf: null, units: [], idx: 0, token: 0, nextId: 1 };

  /* ---------- units ---------- */
  const dim = (id) => (parseFloat($('#' + id).value) || 0) * PT[state.unit];
  const setDim = (id, pt) => { $('#' + id).value = +(pt / PT[state.unit]).toFixed(state.unit === 'in' ? 2 : 1); };
  $('#unit').addEventListener('change', (e) => {
    const old = state.unit;
    state.unit = e.target.value;
    $$('.dim').forEach((el) => { el.value = +((parseFloat(el.value) || 0) * PT[old] / PT[state.unit]).toFixed(state.unit === 'in' ? 2 : 1); });
    schedule();
  });

  /* ---------- files ---------- */
  const readBuf = (file) => file.arrayBuffer();

  async function addFile(file) {
    const entry = { id: state.nextId++, name: file.name, range: '', pages: 1, aspect: 8.5 / 11, thumb: '' };
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        entry.type = 'pdf';
        entry.bytes = await readBuf(file);
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(entry.bytes.slice(0)) }).promise;
        entry.pages = doc.numPages;
        const p = await doc.getPage(1);
        const v1 = p.getViewport({ scale: 1 });
        entry.aspect = v1.width / v1.height;
        entry.thumb = await thumbOf(p);
        doc.destroy();
      } else if (/^image\//.test(file.type)) {
        entry.type = 'image';
        const bmp = await createImageBitmap(file);
        entry.aspect = bmp.width / bmp.height;
        if (file.type === 'image/png' || file.type === 'image/jpeg') {
          entry.mime = file.type;
          entry.bytes = await readBuf(file);
        } else {
          const c = document.createElement('canvas');
          c.width = bmp.width; c.height = bmp.height;
          c.getContext('2d').drawImage(bmp, 0, 0);
          const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
          entry.mime = 'image/png';
          entry.bytes = await blob.arrayBuffer();
        }
        entry.thumb = URL.createObjectURL(new Blob([entry.bytes], { type: entry.mime }));
      } else {
        throw new Error('unsupported');
      }
      state.files.push(entry);
    } catch (e) {
      alert(`${file.name} could not be read. Use a PDF, PNG, JPG, WebP or GIF. Word and Pages files need to be exported as PDF first.`);
    }
  }

  async function thumbOf(page) {
    const v = page.getViewport({ scale: 1 });
    const s = 120 / v.height;
    const c = document.createElement('canvas');
    const vp = page.getViewport({ scale: s });
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c.toDataURL('image/png');
  }

  async function addFiles(list) {
    for (const f of list) await addFile(f);
    renderFiles();
    schedule();
  }

  $('#fileInput').addEventListener('change', async (e) => { await addFiles(e.target.files); e.target.value = ''; });
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { if (e.dataTransfer && e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } }));
  ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { if (ev === 'drop' || e.target === document.documentElement || !e.relatedTarget) drop.classList.remove('over'); }));
  document.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

  $('#addBlank').addEventListener('click', () => { state.files.push({ id: state.nextId++, type: 'blank', name: 'Blank page', pages: 1, aspect: 8.5 / 11, range: '' }); renderFiles(); schedule(); });
  $('#clearAll').addEventListener('click', () => { state.files = []; renderFiles(); schedule(); });
  $('#addSample').addEventListener('click', async () => {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    const f = await doc.embedFont(StandardFonts.HelveticaBold);
    for (let i = 1; i <= 12; i++) {
      const p = doc.addPage([612, 792]);
      p.drawRectangle({ x: 36, y: 36, width: 540, height: 720, borderColor: rgb(0.1, 0.1, 0.09), borderWidth: 3 });
      p.drawText(String(i), { x: i < 10 ? 190 : 120, y: 330, size: 260, font: f, color: rgb(0.1, 0.1, 0.09) });
      p.drawText('Sample page', { x: 60, y: 700, size: 28, font: f, color: rgb(1, 0.35, 0.12) });
    }
    const bytes = await doc.save();
    await addFile(new File([bytes], 'Sample pages.pdf', { type: 'application/pdf' }));
    renderFiles(); schedule();
  });

  function renderFiles() {
    const ul = $('#fileList');
    ul.innerHTML = '';
    state.files.forEach((f, i) => {
      const li = document.createElement('li');
      li.draggable = true;
      li.dataset.i = i;
      const pic = f.thumb ? Object.assign(document.createElement('img'), { src: f.thumb, alt: '' }) : Object.assign(document.createElement('div'), { className: 'blank' });
      const mid = document.createElement('div');
      const name = Object.assign(document.createElement('div'), { className: 'name', textContent: f.name, title: f.name });
      const meta = Object.assign(document.createElement('div'), { className: 'meta', textContent: f.type === 'blank' ? 'Blank page' : `${f.pages} page${f.pages > 1 ? 's' : ''}` });
      mid.append(name, meta);
      if (f.type === 'pdf' && f.pages > 1) {
        const r = Object.assign(document.createElement('input'), { type: 'text', className: 'range', placeholder: 'All pages, or e.g. 1,3,5-12', value: f.range });
        r.setAttribute('aria-label', `Pages to use from ${f.name}`);
        r.addEventListener('input', () => { f.range = r.value; schedule(); });
        mid.append(r);
      }
      const btns = document.createElement('div');
      btns.className = 'btns';
      const mk = (txt, label, fn, dis) => { const b = Object.assign(document.createElement('button'), { type: 'button', textContent: txt, disabled: !!dis }); b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };
      btns.append(
        mk('↑', `Move ${f.name} up`, () => move(i, i - 1), i === 0),
        mk('↓', `Move ${f.name} down`, () => move(i, i + 1), i === state.files.length - 1),
        mk('×', `Remove ${f.name}`, () => { state.files.splice(i, 1); renderFiles(); schedule(); }),
      );
      li.append(pic, mid, btns);
      li.addEventListener('dragstart', (e) => { li.classList.add('dragging'); e.dataTransfer.setData('text/x-row', String(i)); e.dataTransfer.effectAllowed = 'move'; });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-row')) e.preventDefault(); });
      li.addEventListener('drop', (e) => { const from = e.dataTransfer.getData('text/x-row'); if (from !== '') { e.preventDefault(); e.stopPropagation(); move(+from, i); } });
      ul.append(li);
    });
  }
  function move(from, to) {
    if (to < 0 || to >= state.files.length || from === to) return;
    state.files.splice(to, 0, state.files.splice(from, 1)[0]);
    renderFiles(); schedule();
  }

  /* ---------- options ---------- */
  const layoutValue = () => $('input[name=layout]:checked').value;
  const int = (id, lo, hi) => Math.min(hi, Math.max(lo, parseInt($('#' + id).value, 10) || lo));

  function options(forExport) {
    const radio = layoutValue();
    const m = dim('margin');
    const first = state.files[0];
    return {
      layout: radio === 'banner' ? 'poster' : radio,
      paper: $('#paper').value,
      customPaper: [dim('customW') || 612, dim('customH') || 792],
      orientation: $('#orientation').value,
      margins: { top: m, left: m, bottom: m, right: m },
      pad: dim('pad'), gutter: dim('gutter'), creep: dim('creep'),
      scaling: $('#scaling').value,
      reverse: $('#reverse').checked,
      duplex: $('#duplex').checked,
      flip: $('#flip').value,
      booklet: { binding: $('#binding').value, sig: parseInt($('#sig').value, 10) || 0 },
      nup: { across: int('across', 1, 12), down: int('down', 1, 12), repeat: $('#repeat').checked, order: $('#order').value, gap: dim('gap') },
      poster: { w: dim('posterW') || 72, h: dim('posterH') || 72, mode: radio === 'banner' ? 'crop' : $('#posterMode').value, overlap: dim('overlap') },
      marks: $('#marks').value,
      border: $('#border').checked,
      header: { text: $('#headerText').value, size: +$('#headerSize').value || 10, align: $('#headerAlign').value },
      footer: { text: $('#footerText').value, size: +$('#headerSize').value || 10, align: $('#headerAlign').value },
      watermark: { text: $('#wmText').value, size: 72, opacity: (+$('#wmOpacity').value || 15) / 100, angle: 45 },
      pageNumbers: { on: $('#pnOn').checked, pos: $('#pnPos').value, size: 10 },
      output: forExport ? $('#output').value : 'all',
      jobName: first ? first.name.replace(/\.[^.]+$/, '') : 'Document',
    };
  }
  const sources = () => state.files.map((f) => ({ type: f.type, bytes: f.bytes, mime: f.mime, name: f.name, range: f.range }));

  /* ---------- show / hide options ---------- */
  function updateVisibility() {
    const l = layoutValue();
    $$('[data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(l); });
    $$('[data-when=duplex]').forEach((el) => { el.hidden = el.hidden || !$('#duplex').checked; });
    document.body.classList.toggle('custom-paper', $('#paper').value === 'custom');
    const hasBacks = l === 'booklet' || l === 'trifold' || (l === 'nup' && $('#duplex').checked);
    const manual = hasBacks && $('#printer').value !== 'auto';
    $('#outputWrap').hidden = !hasBacks || manual;
    $('#manualRow').hidden = !manual;
    $('#stdRow').hidden = manual;
    $('#download').hidden = manual;
    $('#openPrint').hidden = manual;
    $('#printerNote').textContent = { l3250: 'No automatic double-sided. Margin set to 3 mm, which suits EcoTank printers. A4 and Letter feed from the rear tray.', auto: 'Choose double-sided in the print dialog, flipping on the edge shown in the steps.', single: 'Double-sided jobs are printed in two passes.' }[$('#printer').value];
  }

  const EXPLAIN = {
    booklet: ['Folded booklet', 'Pages print two to a landscape sheet in a scrambled order. Stack the sheets, fold the stack in half and staple along the fold, and the pages read in order.', 'Good for chapbooks, zines up to about 40 pages, programmes, workbooks and photo books. The page count rounds up to a multiple of 4. Use a smaller paper size, such as A5 or half letter, for a smaller booklet.'],
    zine: ['One-sheet zine', 'Eight pages from a single sheet of paper. Fold it in half, cut one slit across the middle, then fold it into a little book. No stapling and no extra tools.', 'Good for mini zines, maps, handouts and giveaways. Needs exactly 8 pages per zine, with page 1 as the cover.'],
    trifold: ['Tri-fold', 'Six panels, three on each side of one sheet, folded like a letter. The cover sits on the outside and the inside opens out flat.', 'Good for menus, price lists, event programmes, info leaflets and artist statements. Needs 6 pages per brochure.'],
    nup: ['Multi-up', 'Puts several pages on each sheet. “Cut and stack” orders them so the pages are in sequence once you cut the sheets and stack the piles.', 'Good for business cards, postcards, stickers, labels, handouts, contact sheets and saving paper. Turn on “Repeat” to fill the sheet with copies of the same page.'],
    poster: ['Poster', 'Blows one page up and splits it across several sheets. Print them, trim the white edge and tape or glue them together.', 'Good for art prints, event posters, wall charts and maps. The sheets overlap a little so there are no white gaps.'],
    banner: ['Banner', 'Like a poster, but very wide or very tall. It fills the width and crops the rest, so design along the top for a wide banner or down the left for a tall one.', 'Good for birthday banners, shop signs, shelf strips and door signs.'],
  };
  function showExplain() {
    const [t, a, b] = EXPLAIN[layoutValue()];
    $('#explain').innerHTML = '';
    const bEl = Object.assign(document.createElement('b'), { textContent: t });
    $('#explain').append(bEl, Object.assign(document.createElement('p'), { textContent: a }), Object.assign(document.createElement('p'), { textContent: b }));
  }
  const unitPT = { in: 72, mm: 72 / 25.4 };
  function sizePreset(sel, wId, hId) {
    const m = $('#' + sel).value.match(/^(\d+)x(\d+)(in|mm)$/);
    if (!m) return;
    $('#keepShape').checked = false;
    setDim(wId, +m[1] * unitPT[m[3]]); setDim(hId, +m[2] * unitPT[m[3]]);
    schedule();
  }
  $('#posterPreset').addEventListener('change', () => sizePreset('posterPreset', 'posterW', 'posterH'));
  $('#bannerPreset').addEventListener('change', () => sizePreset('bannerPreset', 'posterW', 'posterH'));
  $('#nupPreset').addEventListener('change', () => {
    const m = $('#nupPreset').value.match(/^(\d+)x(\d+)(r?)$/);
    if (!m) return;
    $('#across').value = m[1]; $('#down').value = m[2];
    $('#repeat').checked = !!m[3];
    $('#duplex').checked = false;
    $('#order').value = 'rows';
    schedule();
  });
  $$('input[name=layout]').forEach((r) => r.addEventListener('change', showExplain));

  let lastLayout = 'booklet';
  $$('input[name=layout]').forEach((r) => r.addEventListener('change', () => {
    const l = layoutValue();
    if (l === 'banner' && lastLayout !== 'banner') { setDim('posterW', 72 * 72); setDim('posterH', 12 * 72); $('#keepShape').checked = false; }
    if (l === 'poster') {
      if (lastLayout === 'banner') { $('#keepShape').checked = true; setDim('posterW', 24 * 72); }
      keepShape('posterW');
    }
    lastLayout = l;
  }));

  function keepShape(changed) {
    if (layoutValue() !== 'poster' || !$('#keepShape').checked || !state.files.length) return;
    const a = state.files[0].aspect || 8.5 / 11;
    if (changed === 'posterW') setDim('posterH', dim('posterW') / a);
    else setDim('posterW', dim('posterH') * a);
  }
  $('#posterW').addEventListener('input', () => keepShape('posterW'));
  $('#posterH').addEventListener('input', () => keepShape('posterH'));
  $('#keepShape').addEventListener('change', () => keepShape('posterW'));

  $('#controls').addEventListener('input', (e) => { if (e.target.id !== 'fileInput' && !e.target.classList.contains('range')) { updateVisibility(); schedule(); } });
  $('#controls').addEventListener('change', (e) => { if (e.target.id !== 'fileInput') { updateVisibility(); schedule(); } });

  /* ---------- build + preview ---------- */
  let timer;
  function schedule() {
    updateVisibility();
    clearTimeout(timer);
    timer = setTimeout(rebuild, 250);
  }

  function setSummary(text, err) {
    const el = $('#summary');
    el.textContent = text;
    el.classList.toggle('err', !!err);
  }

  async function rebuild() {
    const my = ++state.token;
    const has = state.files.length > 0;
    $('#download').disabled = !has;
    $('#openPrint').disabled = !has;
    if (!has) {
      state.built = null;
      setSummary('Add a file to begin.');
      $('#nav').hidden = true; $('#howto').hidden = true;
      $('#stage').className = 'stage';
      $('#stage').innerHTML = '<div class="empty">Your sheets will appear here. Try “Load 12 sample pages” to see how each layout works.</div>';
      return;
    }
    setSummary('Working…');
    try {
      const r = await PrintEngine.build(PDFLib, sources(), options(false));
      if (my !== state.token) return;
      state.built = r;
      const i = r.info;
      const l = layoutValue();
      if (l === 'poster' || l === 'banner') {
        setSummary(`${i.poster.per} sheet${i.poster.per > 1 ? 's' : ''} per ${l === 'banner' ? 'banner' : 'poster'} (${i.poster.cols} across, ${i.poster.rows} down)`);
      } else {
        setSummary(`${i.sourcePages} page${i.sourcePages > 1 ? 's' : ''} on ${i.physicalSheets} sheet${i.physicalSheets > 1 ? 's' : ''} of paper${i.saved ? ` · ${i.saved}% paper saved` : ''}`);
      }
      const ol = $('#howtoList');
      ol.innerHTML = '';
      i.instructions.forEach((t) => ol.append(Object.assign(document.createElement('li'), { textContent: t })));
      $('#howto').hidden = false;
      await loadPreview(my);
    } catch (e) {
      if (my !== state.token) return;
      state.built = null;
      setSummary(e.message || 'Something went wrong building the PDF.', true);
    }
  }

  async function loadPreview(my) {
    const r = state.built;
    if (state.pdf) { state.pdf.destroy(); state.pdf = null; }
    const pdf = await pdfjsLib.getDocument({ data: r.bytes.slice() }).promise;
    if (my !== state.token) { pdf.destroy(); return; }
    state.pdf = pdf;
    const n = pdf.numPages;
    const units = [];
    if (r.info.poster) {
      for (let s = 0; s < n; s += r.info.poster.per) units.push(Array.from({ length: Math.min(r.info.poster.per, n - s) }, (_, k) => s + k));
    } else if (r.info.sheets.some((s) => s.side === 'back')) {
      for (let s = 0; s < n; s += 2) units.push([s, s + 1]);
    } else {
      for (let s = 0; s < n; s++) units.push([s]);
    }
    state.units = units;
    state.idx = Math.min(state.idx, units.length - 1);
    await renderUnit(my);
  }

  async function renderUnit(my) {
    const stage = $('#stage');
    const r = state.built;
    const u = state.units[state.idx];
    const poster = !!r.info.poster;
    $('#nav').hidden = state.units.length < 2;
    $('#navLabel').textContent = `${poster ? 'Page' : 'Sheet'} ${state.idx + 1} of ${state.units.length}`;
    $('#prev').disabled = state.idx === 0;
    $('#next').disabled = state.idx >= state.units.length - 1;
    const avail = Math.max(240, stage.clientWidth - 40);
    const cols = poster ? r.info.poster.cols : u.length;
    const w = Math.min(520, (avail - (cols - 1) * (poster ? 3 : 16)) / cols);
    const frag = document.createDocumentFragment();
    for (const pi of u) {
      const page = await state.pdf.getPage(pi + 1);
      if (my !== state.token) return;
      const base = page.getViewport({ scale: 1 });
      const scale = w / base.width;
      const dpr = window.devicePixelRatio || 1;
      const vp = page.getViewport({ scale: scale * dpr });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      c.style.width = w + 'px';
      c.style.height = (vp.height / dpr) + 'px';
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const fig = document.createElement('figure');
      fig.append(c);
      if (!poster) {
        const side = r.info.sheets[pi].side;
        fig.append(Object.assign(document.createElement('figcaption'), { textContent: side === 'front' ? 'Front' : side === 'back' ? 'Back' : '' }));
      }
      frag.append(fig);
    }
    if (my !== state.token) return;
    stage.className = poster ? 'stage tiles' : 'stage';
    stage.style.gridTemplateColumns = poster ? `repeat(${cols}, auto)` : '';
    stage.replaceChildren(frag);
  }

  $('#printer').addEventListener('change', () => {
    if ($('#printer').value === 'l3250') setDim('margin', 3 * PT.mm);
    try { localStorage.setItem('printdesk.printer', $('#printer').value); } catch (e) { /* ignore */ }
    schedule();
  });
  $$('#manualRow [data-pass]').forEach((b) => b.addEventListener('click', () => exportPDF(true, b.dataset.pass)));

  const go = (d) => { const t = state.idx + d; if (t >= 0 && t < state.units.length) { state.idx = t; renderUnit(state.token); } };
  $('#prev').addEventListener('click', () => go(-1));
  $('#next').addEventListener('click', () => go(1));
  document.addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  });
  window.addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(() => { if (state.built) renderUnit(state.token); }, 200); });

  /* ---------- export ---------- */
  async function exportPDF(open, pass) {
    const win = open ? window.open('', '_blank') : null;
    try {
      const o = options(true);
      if (pass) o.output = pass;
      const r = await PrintEngine.build(PDFLib, sources(), o);
      const blob = new Blob([r.bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (open && win) { win.location = url; return; }
      const suffix = { all: '', fronts: '-fronts', backs: '-backs', 'backs-rev': '-backs-reversed' }[o.output] || '';
      const a = Object.assign(document.createElement('a'), { href: url, download: `${o.jobName}-${layoutValue()}${suffix}.pdf` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      if (win) win.close();
      setSummary(e.message || 'Could not create the PDF.', true);
    }
  }
  $('#download').addEventListener('click', () => exportPDF(false));
  $('#openPrint').addEventListener('click', () => exportPDF(true));

  /* ---------- saved settings ---------- */
  const KEY = 'printdesk.presets';
  const loadPresets = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const savePresets = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { alert('Settings could not be saved in this browser.'); } };
  function fillPresets() {
    const sel = $('#presetList');
    sel.innerHTML = '<option value="">Choose saved settings…</option>';
    Object.keys(loadPresets()).forEach((k) => sel.append(Object.assign(document.createElement('option'), { value: k, textContent: k })));
  }
  function snapshot() {
    const s = { unit: state.unit, layout: layoutValue(), f: {} };
    $$('#controls input[id], #controls select[id]').forEach((el) => { if (el.id === 'fileInput' || el.id === 'presetList') return; s.f[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    return s;
  }
  function apply(s) {
    state.unit = s.unit; $('#unit').value = s.unit;
    Object.entries(s.f).forEach(([id, v]) => { const el = $('#' + id); if (!el) return; if (el.type === 'checkbox') el.checked = v; else el.value = v; });
    const r = $(`input[name=layout][value=${s.layout}]`); if (r) r.checked = true;
    lastLayout = s.layout;
    schedule();
  }
  $('#presetSave').addEventListener('click', () => {
    const name = (prompt('Name for these settings (for example “Zine, A5, right bound”):') || '').trim();
    if (!name) return;
    const p = loadPresets(); p[name] = snapshot(); savePresets(p); fillPresets(); $('#presetList').value = name;
  });
  $('#presetLoad').addEventListener('click', () => { const p = loadPresets()[$('#presetList').value]; if (p) apply(p); });
  $('#presetDelete').addEventListener('click', () => {
    const k = $('#presetList').value;
    if (k && confirm(`Delete “${k}”?`)) { const p = loadPresets(); delete p[k]; savePresets(p); fillPresets(); }
  });

  try { const p = localStorage.getItem('printdesk.printer'); if (p) $('#printer').value = p; } catch (e) { /* ignore */ }
  if ($('#printer').value === 'l3250' && !localStorage.getItem('printdesk.printer')) setDim('margin', 3 * PT.mm);
  showExplain();
  fillPresets();
  renderFiles();
  schedule();
})();
