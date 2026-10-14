(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const MM = 72 / 25.4;
  const UNITMM = { mm: 1, in: 25.4 };
  const PAPERS = { a4: [210, 297], letter: [215.9, 279.4], a5: [148, 210] };
  const PRESETS = [
    ['3.5 × 2 in (US business card)', 88.9, 50.8], ['85 × 55 mm', 85, 55], ['90 × 50 mm', 90, 50], ['90 × 55 mm', 90, 55],
    ['Credit card size, 85.6 × 54 mm', 85.6, 54], ['Square, 55 × 55 mm', 55, 55], ['A8, 74 × 52 mm', 74, 52],
  ];
  const state = { unit: 'mm', front: null, back: null };
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  const toDisp = (mm) => +(mm / UNITMM[state.unit]).toFixed(state.unit === 'in' ? 3 : 1);
  const dimMM = (id) => (parseFloat($('#' + id).value) || 0) * UNITMM[state.unit];
  const setDim = (id, mm) => { $('#' + id).value = toDisp(mm); };

  /* ---------- artwork ---------- */
  async function pdfThumb(bytes, idx) {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
    const page = await doc.getPage(idx + 1);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 520 / Math.max(v1.width, v1.height) });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const n = doc.numPages;
    doc.destroy();
    return { thumb: c.toDataURL('image/png'), w: v1.width, h: v1.height, pages: n };
  }

  async function readArt(file) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const bytes = await file.arrayBuffer();
      const t = await pdfThumb(bytes, 0);
      return { kind: 'pdf', bytes, pageIndex: 0, pages: t.pages, w: t.w, h: t.h, thumb: t.thumb, name: file.name };
    }
    const r = await PrintImages.readImage(file);
    return { kind: 'img', bytes: r.bytes, mime: r.mime, w: r.sizePt[0], h: r.sizePt[1], thumb: r.thumb, name: file.name, pages: 1 };
  }

  async function setSide(side, file) {
    try {
      const art = await readArt(file);
      state[side] = art;
      if (side === 'front') {
        if (art.w !== art.h) $('#dir').value = art.w > art.h ? 'landscape' : 'portrait';
        if (art.kind === 'pdf' && art.pages >= 2 && !state.back) {
          const t = await pdfThumb(art.bytes, 1);
          state.back = { kind: 'pdf', bytes: art.bytes, pageIndex: 1, pages: art.pages, w: t.w, h: t.h, thumb: t.thumb, name: art.name + ' (page 2)' };
        }
      }
      showThumbs();
      await refreshProof();
    } catch (e) {
      alert('That file could not be read. Use a PDF, PNG, JPG or SVG.');
    }
  }
  $('#frontInput').addEventListener('change', (e) => { if (e.target.files[0]) setSide('front', e.target.files[0]); e.target.value = ''; });
  $('#backInput').addEventListener('change', (e) => { if (e.target.files[0]) setSide('back', e.target.files[0]); e.target.value = ''; });
  [['dropFront', 'front'], ['dropBack', 'back']].forEach(([id, side]) => {
    const z = $('#' + id);
    z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('over'); });
    z.addEventListener('dragleave', () => z.classList.remove('over'));
    z.addEventListener('drop', (e) => { e.preventDefault(); z.classList.remove('over'); if (e.dataTransfer.files[0]) setSide(side, e.dataTransfer.files[0]); });
  });
  $('#swap').addEventListener('click', () => { [state.front, state.back] = [state.back, state.front]; showThumbs(); refreshProof(); });
  $('#clear').addEventListener('click', () => { state.front = null; state.back = null; showThumbs(); refreshProof(); });

  async function refreshProof() {
    const mode = $('#proof').value;
    for (const side of ['front', 'back']) {
      const art = state[side];
      if (!art) continue;
      if (!mode) { art.pthumb = null; continue; }
      const img = new Image();
      img.src = art.thumb;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      PrintProof.apply(c, mode);
      art.pthumb = c.toDataURL('image/png');
    }
    $('#proofNote').hidden = !mode;
    update();
  }
  $('#proof').addEventListener('change', refreshProof);

  function showThumbs() {
    [['front', 'front'], ['back', 'back']].forEach(([k, id]) => {
      const a = state[k];
      $('#' + id + 'Box').hidden = !a;
      if (a) { $('#' + id + 'Img').src = a.thumb; $('#' + id + 'Name').textContent = a.name; }
    });
  }

  async function sampleCard() {
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = 1050; c.height = 600; draw(c.getContext('2d')); return c; };
    const front = mk((g) => {
      g.fillStyle = '#EFEBE2'; g.fillRect(0, 0, 1050, 600);
      g.fillStyle = '#FF5A1F'; g.beginPath(); g.arc(150, 300, 90, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1B1A18'; g.font = 'bold 74px Arial'; g.fillText('Your Name', 300, 280);
      g.font = '36px Arial'; g.fillText('Designer and illustrator', 300, 340);
      g.font = '30px Arial'; g.fillText('hello@example.com', 300, 470);
    });
    const back = mk((g) => {
      g.fillStyle = '#FF5A1F'; g.fillRect(0, 0, 1050, 600);
      g.fillStyle = '#1B1A18'; g.font = 'bold 90px Arial'; g.textAlign = 'center'; g.fillText('Studio', 525, 330);
    });
    for (const [side, c] of [['front', front], ['back', back]]) {
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      state[side] = { kind: 'img', mime: 'image/png', bytes: await blob.arrayBuffer(), w: 1050 * 0.24, h: 600 * 0.24, thumb: c.toDataURL('image/png'), name: side === 'front' ? 'Sample front' : 'Sample back', pages: 1 };
    }
    $('#dir').value = 'landscape';
    showThumbs(); await refreshProof();
  }
  $('#sample').addEventListener('click', sampleCard);

  /* ---------- settings ---------- */
  function fillPresets() {
    const p = $('#preset');
    p.innerHTML = '<option value="">Custom size</option>';
    PRESETS.forEach((x, i) => p.append(Object.assign(document.createElement('option'), { value: i, textContent: x[0] })));
    p.value = '0';
  }
  $('#preset').addEventListener('change', (e) => {
    if (e.target.value === '') return;
    const x = PRESETS[+e.target.value];
    setDim('cardW', x[1]); setDim('cardH', x[2]);
    update();
  });
  ['cardW', 'cardH'].forEach((id) => $('#' + id).addEventListener('input', () => { $('#preset').value = ''; }));
  $('#unit').addEventListener('change', (e) => {
    const old = state.unit;
    state.unit = e.target.value;
    document.querySelectorAll('.dim').forEach((el) => { el.value = toDisp((parseFloat(el.value) || 0) * UNITMM[old]); });
    update();
  });
  $('#controls').addEventListener('input', (e) => { if (!/Input$/.test(e.target.id)) update(); });
  $('#controls').addEventListener('change', (e) => { if (!/Input$/.test(e.target.id)) update(); });
  $('#printer').addEventListener('change', () => { try { localStorage.setItem('printdesk.printer', $('#printer').value); } catch (e) { /* ignore */ } });

  function opts() {
    const a = Math.max(dimMM('cardW'), 1);
    const b = Math.max(dimMM('cardH'), 1);
    const land = $('#dir').value === 'landscape';
    return {
      cw: land ? Math.max(a, b) : Math.min(a, b),
      ch: land ? Math.min(a, b) : Math.max(a, b),
      fit: $('#fit').value, bleed: dimMM('bleed'), printBleed: $('#printBleed').checked,
      paper: $('#paper').value, sheetDir: $('#sheetDir').value, count: parseInt($('#count').value, 10) || 0,
      margin: dimMM('margin'), marginB: dimMM('marginB'), gap: dimMM('gap'),
      marks: $('#marks').value, flip: $('#flip').value,
      shiftX: parseFloat($('#shiftX').value) || 0, shiftY: parseFloat($('#shiftY').value) || 0,
      ruler: $('#ruler').checked, printer: $('#printer').value,
    };
  }

  // all layout maths in millimetres, y pointing up
  function layout(o) {
    const [pw, ph] = PAPERS[o.paper] || PAPERS.a4;
    const ge = Math.max(o.gap, o.printBleed && o.bleed > 0 ? 2 * o.bleed + 3 : 0);
    const ruler = o.ruler ? 6.5 : 0;
    let best = null;
    const dirs = o.sheetDir === 'portrait' ? [[pw, ph]] : o.sheetDir === 'landscape' ? [[ph, pw]] : [[pw, ph], [ph, pw]];
    for (const [W, H] of dirs) {
      // A landscape page prints rotated on portrait paper, so the unprintable strip lands on its sides, not its bottom.
      const a = W > H
        ? { x: o.marginB, y: o.margin + ruler, w: W - 2 * o.marginB, h: H - 2 * o.margin - ruler }
        : { x: o.margin, y: o.marginB + ruler, w: W - 2 * o.margin, h: H - o.margin - o.marginB - ruler };
      const nx = Math.floor((a.w + ge + 1e-6) / (o.cw + ge));
      const ny = Math.floor((a.h + ge + 1e-6) / (o.ch + ge));
      if (nx < 1 || ny < 1) continue;
      if (!best || nx * ny > best.nx * best.ny) best = { W, H, a, nx, ny };
    }
    if (!best) return null;
    const gw = best.nx * o.cw + (best.nx - 1) * ge;
    const gh = best.ny * o.ch + (best.ny - 1) * ge;
    const x0 = best.a.x + (best.a.w - gw) / 2;
    const top = best.a.y + (best.a.h + gh) / 2;
    const pos = (r, c) => ({ x: x0 + c * (o.cw + ge), y: top - (r + 1) * o.ch - r * ge });
    // turning the sheet over mirrors columns (flip about the vertical axis) or rows (about the horizontal axis)
    const mirrorCols = (best.W < best.H) === (o.flip === 'long');
    best.ge = ge;
    best.per = best.nx * best.ny;
    best.front = (j) => pos(Math.floor(j / best.nx), j % best.nx);
    best.back = (j) => {
      const r = Math.floor(j / best.nx);
      const c = j % best.nx;
      const q = mirrorCols ? pos(r, best.nx - 1 - c) : pos(best.ny - 1 - r, c);
      return { x: q.x + o.shiftX, y: q.y + o.shiftY };
    };
    best.mirrorCols = mirrorCols;
    return best;
  }

  /* ---------- preview ---------- */
  function sheetSVG(lay, o, side, n) {
    const f = (v) => +v.toFixed(2);
    const art = state[side];
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(lay.W)} ${f(lay.H)}" role="img" aria-label="${side} sheet"><rect width="${f(lay.W)}" height="${f(lay.H)}" fill="#fff"/>`;
    s += `<rect x="${f(lay.a.x)}" y="${f(lay.H - lay.a.y - lay.a.h)}" width="${f(lay.a.w)}" height="${f(lay.a.h)}" fill="none" stroke="#bbb" stroke-width="0.5" stroke-dasharray="2 2"/>`;
    for (let j = 0; j < lay.per; j++) {
      const p = side === 'front' ? lay.front(j) : lay.back(j);
      const x = p.x;
      const y = lay.H - p.y - o.ch;
      if (j >= n || !art) { s += `<rect x="${f(x)}" y="${f(y)}" width="${f(o.cw)}" height="${f(o.ch)}" fill="#f4f1ea" stroke="#ccc" stroke-width="0.3" stroke-dasharray="1.5 1.5"/>`; continue; }
      const slice = o.fit === 'fill' ? 'slice' : 'meet';
      s += `<svg x="${f(x)}" y="${f(y)}" width="${f(o.cw)}" height="${f(o.ch)}"><image href="${art.pthumb || art.thumb}" width="100%" height="100%" preserveAspectRatio="xMidYMid ${slice}"/></svg>`;
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(o.cw)}" height="${f(o.ch)}" fill="none" stroke="#666" stroke-width="0.25"/>`;
    }
    return s + '</svg>';
  }

  // printers describe the flip by the edge of the paper itself, whichever way the page is drawn
  const flipWords = (lay, o) => (o.flip === 'long'
    ? 'along its long side, like turning a page of a book'
    : 'along its short side, like flipping the page of a notepad');

  function update() {
    const o = opts();
    const lay = layout(o);
    const has = !!state.front;
    const manual = o.printer !== 'auto' && !!state.back;
    $('#manualRow').hidden = !manual;
    $('#stdRow').hidden = manual;
    ['printNow', 'download'].forEach((id) => { $('#' + id).disabled = !has || !lay; });
    $('#backFig').hidden = !state.back;
    if (!lay) {
      $('#summary').textContent = 'That card size does not fit on the paper. Choose a smaller card, smaller margins or a bigger sheet.';
      $('#frontSheet').innerHTML = ''; $('#backSheet').innerHTML = '';
      return;
    }
    const N = o.count || lay.per;
    const S = Math.ceil(N / lay.per);
    const onFirst = Math.min(N, lay.per);
    $('#frontSheet').innerHTML = sheetSVG(lay, o, 'front', onFirst);
    $('#backSheet').innerHTML = state.back ? sheetSVG(lay, o, 'back', onFirst) : '';
    const fmt = (mm) => (state.unit === 'in' ? (mm / 25.4).toFixed(2) + ' in' : +mm.toFixed(1) + ' mm');
    $('#summary').textContent = has
      ? `${N} card${N > 1 ? 's' : ''} on ${S} sheet${S > 1 ? 's' : ''}, ${lay.per} per sheet at ${fmt(o.cw)} × ${fmt(o.ch)}${state.back ? ', double-sided' : ', front only'}`
      : `${lay.per} cards of ${fmt(o.cw)} × ${fmt(o.ch)} fit on one sheet. Add a front to begin.`;

    const steps = [];
    if (!state.back) {
      steps.push('You have only a front, so this prints single-sided. Add a back to print double-sided.');
      steps.push('Press Print. In the print dialog choose the paper size shown above and a scale of 100%, not “Fit to page”.');
    } else if (o.printer === 'auto') {
      steps.push(`Press Print. In the print dialog choose the right paper size, a scale of 100%, and Two-sided, flipping on the ${o.flip} edge.`);
      steps.push('Check the first sheet against the light: the front and back should line up. If not, move the back with the two boxes under Printer and alignment.');
    } else {
      steps.push('Do a test on plain paper first. Press “1. Print fronts” with paper size A4 and scale 100% (not “Fit to page”).');
      steps.push('Let the ink dry for a few minutes so it does not smudge.');
      steps.push(`Take the sheets out without changing the order. Turn the stack over ${flipWords(lay, o)}. That is the same as a printer flipping on the ${o.flip} edge. Keep the same end of the paper going into the printer first.`);
      steps.push('Put the stack back in the tray the same way you loaded the blank paper, then press “2. Print backs”. If you have more than one sheet and the backs come out in the wrong order, use “2. Backs, reversed”.');
      steps.push('Hold the test sheet to the light. If the back is off, use “Move the back” under Printer and alignment, and test again.');
    }
    steps.push(o.marks === 'ticks' ? 'Cut along the small tick marks in the gaps, using a ruler and a craft knife, or a guillotine.' : 'Cut along the card edges.');
    const ol = $('#steps');
    ol.innerHTML = '';
    steps.forEach((t) => ol.append(Object.assign(document.createElement('li'), { textContent: t })));
  }

  /* ---------- PDF ---------- */
  async function buildPDF(which) {
    const { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = PDFLib;
    const o = opts();
    const lay = layout(o);
    if (!lay || !state.front) throw new Error('Add a front and check the card fits the paper.');
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const grey = rgb(0.35, 0.35, 0.35);
    const embed = async (art) => {
      if (!art) return null;
      if (art.kind === 'img') {
        const ref = art.mime === 'image/jpeg' ? await out.embedJpg(art.bytes) : await out.embedPng(art.bytes);
        return { ref, w: ref.width, h: ref.height, img: true };
      }
      const src = await PDFDocument.load(art.bytes, { ignoreEncryption: true });
      const e = await out.embedPage(src.getPage(art.pageIndex));
      return { ref: e, w: e.width, h: e.height, img: false };
    };
    const E = { front: await embed(state.front), back: await embed(state.back) };
    const N = o.count || lay.per;
    const S = Math.ceil(N / lay.per);

    const jobs = [];
    const sides = state.back ? ['front', 'back'] : ['front'];
    if (which === 'fronts') for (let s = 0; s < S; s++) jobs.push([s, 'front']);
    else if (which === 'backs' || which === 'backs-rev') {
      if (!state.back) throw new Error('There is no back to print.');
      const arr = Array.from({ length: S }, (_, s) => [s, 'back']);
      (which === 'backs-rev' ? arr.reverse() : arr).forEach((j) => jobs.push(j));
    } else for (let s = 0; s < S; s++) sides.forEach((sd) => jobs.push([s, sd]));

    const clipTo = (page, x, y, w, h) => page.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath());
    for (const [s, side] of jobs) {
      const page = out.addPage([lay.W * MM, lay.H * MM]);
      const n = Math.min(lay.per, N - s * lay.per);
      const art = E[side];
      for (let j = 0; j < n; j++) {
        const p = side === 'front' ? lay.front(j) : lay.back(j);
        const tx = p.x * MM, ty = p.y * MM, tw = o.cw * MM, th = o.ch * MM;
        const bl = o.bleed * MM;
        const ax = tx - bl, ay = ty - bl, aw = tw + 2 * bl, ah = th + 2 * bl;
        if (art) {
          const k = o.fit === 'fill' ? Math.max(aw / art.w, ah / art.h) : Math.min(aw / art.w, ah / art.h);
          const dw = art.w * k, dh = art.h * k;
          const args = { x: ax + (aw - dw) / 2, y: ay + (ah - dh) / 2, width: dw, height: dh };
          if (o.printBleed) clipTo(page, ax, ay, aw, ah); else clipTo(page, tx, ty, tw, th);
          if (art.img) page.drawImage(art.ref, args); else page.drawPage(art.ref, args);
          page.pushOperators(popGraphicsState());
        }
        if (o.marks === 'ticks') {
          const off = (o.printBleed ? o.bleed : 0) + 0.8;
          const len = Math.min(2.5, lay.ge / 2 - off - 0.4);
          if (len >= 0.6) {
            [[tx, ty, -1, -1], [tx + tw, ty, 1, -1], [tx, ty + th, -1, 1], [tx + tw, ty + th, 1, 1]].forEach(([cx, cy, sx, sy]) => {
              page.drawLine({ start: { x: cx + sx * off * MM, y: cy }, end: { x: cx + sx * (off + len) * MM, y: cy }, thickness: 0.4, color: grey });
              page.drawLine({ start: { x: cx, y: cy + sy * off * MM }, end: { x: cx, y: cy + sy * (off + len) * MM }, thickness: 0.4, color: grey });
            });
          }
        }
      }
      if (o.ruler) {
        const x = o.margin * MM, y = (o.marginB + 3) * MM, len = 50 * MM;
        page.drawLine({ start: { x, y }, end: { x: x + len, y }, thickness: 0.8, color: rgb(0, 0, 0) });
        [0, len].forEach((d) => page.drawLine({ start: { x: x + d, y: y - 3 }, end: { x: x + d, y: y + 3 }, thickness: 0.8, color: rgb(0, 0, 0) }));
        page.drawText('Check: this line is 50 mm long. If not, print at 100% or "Actual size".', { x: x + len + 8, y: y - 2.5, size: 7, font, color: grey });
      }
    }
    out.setTitle('Business cards');
    out.setProducer('Print Desk');
    return out.save();
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function printPDF(which) {
    try {
      const url = URL.createObjectURL(new Blob([await buildPDF(which)], { type: 'application/pdf' }));
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
  }
  $('#printNow').addEventListener('click', () => printPDF('all'));
  document.querySelectorAll('#manualRow [data-pass]').forEach((b) => b.addEventListener('click', () => printPDF(b.dataset.pass)));
  $('#download').addEventListener('click', async () => {
    try {
      const manual = $('#printer').value !== 'auto' && state.back;
      if (manual) {
        saveBlob(new Blob([await buildPDF('fronts')], { type: 'application/pdf' }), 'cards-1-fronts.pdf');
        saveBlob(new Blob([await buildPDF('backs')], { type: 'application/pdf' }), 'cards-2-backs.pdf');
      } else saveBlob(new Blob([await buildPDF('all')], { type: 'application/pdf' }), 'business-cards.pdf');
    } catch (e) { $('#summary').textContent = e.message || 'Could not create the PDF.'; }
  });
  $('#scaleTest').addEventListener('click', () => PrintTest.open(PDFLib, [PAPERS[$('#paper').value][0] * MM, PAPERS[$('#paper').value][1] * MM]));

  try { const p = localStorage.getItem('printdesk.printer'); if (p && ['l3250', 'auto', 'single'].includes(p)) $('#printer').value = p; } catch (e) { /* ignore */ }
  window.__cards = { state, layout, opts, buildPDF, update };
  fillPresets();
  update();
})();
