(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const MM = 72 / 25.4;
  const UNITMM = { mm: 1, in: 25.4 };
  const PAPERS = { a4: [210, 297], letter: [215.9, 279.4] };
  const SHEETS = { a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4], a3: [297, 420], wrap50: [500, 700], wrap70: [700, 1000] };
  const COLORS = [['#EFEBE2', 'Paper'], ['#FF5A1F', 'Orange'], ['#1B1A18', 'Ink'], ['#FFFFFF', 'White'], ['#C9A57B', 'Kraft'], ['#F2C9D0', 'Pink'], ['#2E3A8C', 'Blue']];
  const DESC = {
    brick: 'Rows are shifted sideways by half a logo, like bricks.',
    grid: 'Logos in straight rows and columns.',
    halfdrop: 'Columns are shifted down by half a logo.',
    diamond: 'A tight staggered grid that reads as diamonds.',
    scatter: 'Loose and random, like confetti. Shuffle to try other arrangements.',
  };
  const state = { unit: 'mm', base: null, proc: null, name: '', seed: 7, bg: '#EFEBE2', logoColor: '#1B1A18' };

  const toDisp = (mm) => +(mm / UNITMM[state.unit]).toFixed(state.unit === 'in' ? 3 : 1);
  const dimMM = (id) => (parseFloat($('#' + id).value) || 0) * UNITMM[state.unit];
  const setDim = (id, mm) => { $('#' + id).value = toDisp(mm); };

  /* ---------- logo ---------- */
  async function bitmapOf(file) {
    let blob = file;
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      const r = await PrintImages.readImage(file);
      blob = new Blob([r.bytes], { type: r.mime });
    }
    return createImageBitmap(blob);
  }
  async function loadLogo(file) {
    try {
      const bmp = await bitmapOf(file);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k));
      c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      state.base = c;
      state.name = file.name;
      process();
      refresh();
    } catch (e) {
      alert('That file could not be read. Use a PNG, JPG, SVG, WebP or GIF.');
    }
  }
  $('#logoInput').addEventListener('change', (e) => { if (e.target.files[0]) loadLogo(e.target.files[0]); e.target.value = ''; });
  document.addEventListener('dragover', (e) => { if (e.dataTransfer && e.dataTransfer.types.includes('Files')) { e.preventDefault(); $('#drop').classList.add('over'); } });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) $('#drop').classList.remove('over'); });
  document.addEventListener('drop', (e) => { $('#drop').classList.remove('over'); if (e.dataTransfer && e.dataTransfer.files[0]) { e.preventDefault(); loadLogo(e.dataTransfer.files[0]); } });

  $('#sample').addEventListener('click', () => {
    const c = document.createElement('canvas');
    c.width = 600; c.height = 560;
    const g = c.getContext('2d');
    g.fillStyle = '#FF5A1F';
    g.beginPath(); g.ellipse(300, 330, 240, 200, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(90, 220); g.lineTo(120, 20); g.lineTo(260, 150); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(510, 220); g.lineTo(480, 20); g.lineTo(340, 150); g.closePath(); g.fill();
    g.fillStyle = '#1B1A18';
    g.beginPath(); g.ellipse(215, 320, 26, 40, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(385, 320, 26, 40, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(275, 390); g.lineTo(325, 390); g.lineTo(300, 425); g.closePath(); g.fill();
    state.base = c;
    state.name = 'Sample logo';
    process();
    refresh();
  });

  // applies "make white transparent" and "recolour" to a copy of the logo
  function process() {
    if (!state.base) { state.proc = null; return; }
    const b = state.base;
    const c = document.createElement('canvas');
    c.width = b.width; c.height = b.height;
    const g = c.getContext('2d');
    g.drawImage(b, 0, 0);
    if ($('#noWhite').checked || $('#recolor').checked) {
      const img = g.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      const col = $('#recolor').checked ? hexToRgb(state.logoColor) : null;
      const nw = $('#noWhite').checked;
      for (let i = 0; i < d.length; i += 4) {
        if (nw) {
          const m = Math.min(d[i], d[i + 1], d[i + 2]);
          if (m >= 240) d[i + 3] = 0;
          else if (m >= 205) d[i + 3] = Math.round(d[i + 3] * ((240 - m) / 35));
        }
        if (col) { d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; }
      }
      g.putImageData(img, 0, 0);
    }
    state.proc = c;
  }
  const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  /* ---------- swatches ---------- */
  function makeSwatches(boxId, pickerId, key, onChange) {
    const box = $('#' + boxId);
    COLORS.forEach(([hex, name]) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'sw' });
      b.style.background = hex;
      b.title = name;
      b.setAttribute('aria-label', name);
      b.addEventListener('click', () => { state[key] = hex; $('#' + pickerId).value = hex; mark(); onChange(); });
      box.append(b);
    });
    const mark = () => [...box.children].forEach((b, i) => b.setAttribute('aria-pressed', String(COLORS[i][0].toLowerCase() === state[key].toLowerCase())));
    $('#' + pickerId).addEventListener('input', (e) => { state[key] = e.target.value; mark(); onChange(); });
    mark();
  }
  makeSwatches('bgSwatches', 'bgColor', 'bg', () => refresh());
  makeSwatches('logoSwatches', 'logoColor', 'logoColor', () => { process(); refresh(); });

  /* ---------- settings ---------- */
  function sheetMM() {
    const k = $('#sheet').value;
    return k === 'custom' ? [dimMM('sheetW') || 210, dimMM('sheetH') || 297] : SHEETS[k];
  }
  function params() {
    const [W, H] = sheetMM();
    return {
      W, H, logoW: Math.max(1, dimMM('logoW')), gapX: dimMM('gapX'), gapY: dimMM('gapY'),
      pattern: $('#pattern').value, offset: (parseFloat($('#offset').value) || 0) / 100,
      rotMode: $('#rotMode').value, angle: parseFloat($('#angle').value) || 0,
      jitter: (parseFloat($('#jitter').value) || 0) / 100, scaleVar: (parseFloat($('#scaleVar').value) || 0) / 100,
      opacity: Math.min(1, Math.max(0.05, (parseFloat($('#opacity').value) || 100) / 100)),
      seed: state.seed,
    };
  }

  // seeded random numbers so a layout stays the same until you shuffle
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(p, aspect) {
    const lw = p.logoW;
    const lh = lw * aspect;
    const cw = Math.max(lw + p.gapX, 1);
    const ch = Math.max(lh + p.gapY, 1);
    const rand = rng(p.seed);
    const items = [];
    const add = (cx, cy, i, j) => {
      let rot = p.angle;
      if (p.rotMode === 'alt' && (i + j) % 2 !== 0) rot += 180;
      else if (p.rotMode === 'quarter') rot += 90 * Math.floor(rand() * 4);
      else if (p.rotMode === 'tilt') rot += (rand() - 0.5) * 30;
      else if (p.rotMode === 'random') rot += rand() * 360;
      const sc = 1 + (rand() - 0.5) * 2 * p.scaleVar;
      items.push({ cx, cy, rot, w: lw * sc, h: lh * sc });
    };
    const ni = Math.ceil(p.W / cw) + 3;
    const nj = Math.ceil(p.H / ch) + 3;
    for (let j = -2; j < nj; j++) {
      for (let i = -2; i < ni; i++) {
        let cx = i * cw + lw / 2;
        let cy = j * ch + lh / 2;
        if (p.pattern === 'brick') cx += (((j % 2) + 2) % 2) * cw * p.offset;
        else if (p.pattern === 'halfdrop') cy += (((i % 2) + 2) % 2) * ch * p.offset;
        else if (p.pattern === 'diamond') {
          if ((((i + j) % 2) + 2) % 2 !== 0) continue;
          cx = (i / 2) * cw + lw / 2;
          cy = (j / 2) * ch + lh / 2;
        } else if (p.pattern === 'scatter') {
          cx += (rand() - 0.5) * cw * p.jitter;
          cy += (rand() - 0.5) * ch * p.jitter;
        }
        add(cx, cy, i, j);
      }
    }
    return items.filter((it) => {
      const r = Math.hypot(it.w, it.h) / 2;
      return it.cx + r > 0 && it.cx - r < p.W && it.cy + r > 0 && it.cy - r < p.H;
    });
  }

  /* ---------- preview ---------- */
  function draw(ctx, items, p, pxPerMM, offX, offY) {
    ctx.fillStyle = state.bg;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!state.proc) return;
    ctx.globalAlpha = p.opacity;
    for (const it of items) {
      ctx.save();
      ctx.translate((it.cx - offX) * pxPerMM, (it.cy - offY) * pxPerMM);
      ctx.rotate((it.rot * Math.PI) / 180);
      ctx.drawImage(state.proc, (-it.w / 2) * pxPerMM, (-it.h / 2) * pxPerMM, it.w * pxPerMM, it.h * pxPerMM);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function pagesFor(p) {
    const [pw, ph] = PAPERS[$('#paper').value];
    const fits = (p.W <= pw + 0.01 && p.H <= ph + 0.01) || (p.W <= ph + 0.01 && p.H <= pw + 0.01);
    if (fits) return { cols: 1, rows: 1, single: true, pw: p.W, ph: p.H, sx: p.W, sy: p.H };
    const ov = 10;
    let best = null;
    for (const [w, h] of [[pw, ph], [ph, pw]]) {
      const cols = Math.max(1, Math.ceil((p.W - ov) / (w - ov) - 1e-6));
      const rows = Math.max(1, Math.ceil((p.H - ov) / (h - ov) - 1e-6));
      if (!best || cols * rows < best.cols * best.rows) best = { cols, rows, single: false, pw: w, ph: h, sx: w - ov, sy: h - ov, ov };
    }
    return best;
  }

  function refresh() {
    const has = !!state.proc;
    ['printNow', 'download', 'png'].forEach((id) => { $('#' + id).disabled = !has; });
    $('#logoName').hidden = !state.name;
    $('#logoName').textContent = state.name ? 'Logo: ' + state.name : '';
    $('#logoColorRow').hidden = !$('#recolor').checked;
    $('#patternDesc').textContent = DESC[$('#pattern').value];
    $('#offsetWrap').hidden = !['brick', 'halfdrop'].includes($('#pattern').value);
    $('#jitterWrap').hidden = $('#pattern').value !== 'scatter';
    document.body.classList.toggle('custom-paper', $('#sheet').value === 'custom');
    const p = params();
    const cv = $('#cv');
    const stage = $('#patStage');
    const actual = $('#actual').checked;
    const avail = Math.max(240, stage.clientWidth - 24);
    let pxPerMM = actual ? 96 / 25.4 : Math.min(avail / p.W, 560 / p.H * (avail / avail));
    if (!actual) pxPerMM = Math.min(avail / p.W, 640 / p.H);
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(p.W * pxPerMM * dpr));
    cv.height = Math.max(1, Math.round(p.H * pxPerMM * dpr));
    cv.style.width = p.W * pxPerMM + 'px';
    cv.style.height = p.H * pxPerMM + 'px';
    stage.classList.toggle('actual', actual);
    const aspect = has ? state.proc.height / state.proc.width : 1;
    const items = has ? generate(p, aspect) : [];
    draw(cv.getContext('2d'), items, p, pxPerMM * dpr, 0, 0);
    const pg = pagesFor(p);
    const fmt = (mm) => (state.unit === 'in' ? (mm / 25.4).toFixed(1) + ' in' : mm.toFixed(0) + ' mm');
    $('#summary').textContent = has
      ? `${fmt(p.W)} × ${fmt(p.H)} sheet, ${items.length} logos, ${pg.cols * pg.rows} printed page${pg.cols * pg.rows > 1 ? 's' : ''}`
      : 'Choose a logo or use the sample.';
    $('#cap').textContent = has ? `Logo is ${fmt(p.logoW)} wide.${pg.single ? '' : ` It prints on ${pg.cols} across × ${pg.rows} down, with a 10 mm overlap to tape.`}` : '';
    state.items = items; state.p = p; state.pg = pg;
  }

  let raf = 0;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(refresh); }
  $('#controls').addEventListener('input', (e) => { if (e.target.id === 'logoInput' || e.target.type === 'color') return; if (e.target.id === 'noWhite' || e.target.id === 'recolor') process(); schedule(); });
  $('#controls').addEventListener('change', (e) => { if (e.target.id === 'logoInput') return; if (e.target.id === 'noWhite' || e.target.id === 'recolor') process(); schedule(); });
  $('#actual').addEventListener('change', schedule);
  window.addEventListener('resize', schedule);
  $('#shuffle').addEventListener('click', () => { state.seed = Math.floor(Math.random() * 1e9); refresh(); });
  $('#unit').addEventListener('change', (e) => {
    const old = state.unit;
    state.unit = e.target.value;
    document.querySelectorAll('.dim').forEach((el) => { el.value = toDisp((parseFloat(el.value) || 0) * UNITMM[old]); });
    refresh();
  });

  /* ---------- export ---------- */
  async function procPng() {
    const blob = await new Promise((r) => state.proc.toBlob(r, 'image/png'));
    return blob.arrayBuffer();
  }

  async function buildPDF() {
    const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
    refresh();
    const p = state.p;
    const pg = state.pg;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const img = await doc.embedPng(await procPng());
    const bg = hexToRgb(state.bg).map((v) => v / 255);
    const bgc = rgb(bg[0], bg[1], bg[2]);
    for (let r = 0; r < pg.rows; r++) {
      for (let c = 0; c < pg.cols; c++) {
        const tx = pg.single ? 0 : c * pg.sx;
        const ty = pg.single ? 0 : r * pg.sy;
        const pwMM = pg.pw;
        const phMM = pg.ph;
        const page = doc.addPage([pwMM * MM, phMM * MM]);
        page.drawRectangle({ x: 0, y: 0, width: pwMM * MM, height: phMM * MM, color: bgc });
        for (const it of state.items) {
          const rad = Math.hypot(it.w, it.h) / 2;
          if (it.cx + rad < tx || it.cx - rad > tx + pwMM || it.cy + rad < ty || it.cy - rad > ty + phMM) continue;
          const th = (-it.rot * Math.PI) / 180; // pdf-lib rotates counter-clockwise
          const cx = (it.cx - tx) * MM;
          const cy = (phMM - (it.cy - ty)) * MM;
          const w = it.w * MM;
          const h = it.h * MM;
          const x = cx - ((w / 2) * Math.cos(th) - (h / 2) * Math.sin(th));
          const y = cy - ((w / 2) * Math.sin(th) + (h / 2) * Math.cos(th));
          page.drawImage(img, { x, y, width: w, height: h, rotate: degrees((th * 180) / Math.PI), opacity: p.opacity });
        }
        if (!pg.single) {
          const grey = rgb(0.35, 0.35, 0.35);
          page.drawText(`Page ${r * pg.cols + c + 1} of ${pg.cols * pg.rows} (column ${c + 1}, row ${r + 1}). Overlap the edges 10 mm and tape.`, { x: 8, y: 8, size: 6.5, font, color: grey });
        }
      }
    }
    doc.setTitle('Wrapping paper pattern');
    doc.setProducer('Print Desk');
    return doc.save();
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  $('#download').addEventListener('click', async () => {
    try { saveBlob(new Blob([await buildPDF()], { type: 'application/pdf' }), 'wrapping-paper.pdf'); }
    catch (e) { $('#summary').textContent = e.message || 'Could not create the PDF.'; }
  });
  $('#png').addEventListener('click', async () => {
    refresh();
    const p = state.p;
    let dpi = 300;
    const px = (p.W / 25.4) * dpi * (p.H / 25.4) * dpi;
    if (px > 36e6) dpi = Math.floor(dpi * Math.sqrt(36e6 / px));
    const k = dpi / 25.4;
    const c = document.createElement('canvas');
    c.width = Math.round(p.W * k); c.height = Math.round(p.H * k);
    draw(c.getContext('2d'), state.items, p, k, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    saveBlob(blob, `wrapping-paper-${dpi}dpi.png`);
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

  window.__pattern = { state, refresh, generate, params, buildPDF };
  refresh();
})();
