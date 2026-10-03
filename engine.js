/*
 * Print Desk layout engine.
 * Takes source pages (PDF / image / blank) and re-arranges them onto sheets:
 * folded booklets, 8-page zines, multi-up grids (incl. cut-and-stack), posters and banners.
 * All measurements are PDF points (1/72 in).
 */
(function (root) {
  'use strict';

  const PAPERS = {
    letter: [612, 792],
    legal: [612, 1008],
    tabloid: [792, 1224],
    halfletter: [396, 612],
    a3: [841.89, 1190.55],
    a4: [595.28, 841.89],
    a5: [419.53, 595.28],
    a6: [297.64, 419.53],
  };

  const DEFAULTS = {
    layout: 'booklet', // booklet | zine | nup | poster
    paper: 'letter',
    customPaper: [612, 792],
    orientation: 'auto', // auto | portrait | landscape (not used by booklet / zine)
    margins: { top: 18, left: 18, bottom: 18, right: 18 },
    pad: 0, // space inside every mini-page
    gutter: 0, // extra space on the spine side (booklet)
    creep: 0, // pt per sheet, shifts inner sheets toward the spine
    scaling: 'fit', // fit | stretch | none
    reverse: false,
    duplex: true, // n-up only: print the back of each sheet too
    flip: 'long', // long | short: which paper edge the printer flips on
    booklet: { binding: 'left', sig: 0, staples: 0 }, // staples: guide marks on the fold, 0 = none; sig = sheets per signature, 0 = one booklet
    nup: { across: 2, down: 2, repeat: false, order: 'rows', gap: 0, staple: 'none' }, // order: rows | stack
    poster: { w: 1728, h: 2592, mode: 'fit', overlap: 36 }, // mode: stretch | fit | crop
    marks: 'ticks', // none | ticks | lines
    border: false,
    header: { text: '', size: 10, align: 'center' },
    footer: { text: '', size: 10, align: 'center' },
    watermark: { text: '', size: 72, opacity: 0.15, angle: 45 },
    pageNumbers: { on: false, pos: 'bc', size: 10 },
    output: 'all', // all | fronts | backs | backs-rev
    jobName: 'Document',
  };

  function merge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!over) return out;
    for (const k of Object.keys(over)) {
      const v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
        out[k] = merge(base[k], v);
      } else if (v !== undefined) {
        out[k] = v;
      }
    }
    return out;
  }

  function parseRanges(str, total) {
    const s = (str || '').trim();
    if (!s) return Array.from({ length: total }, (_, i) => i);
    const out = [];
    const push = (n) => { if (n >= 1 && n <= total) out.push(n - 1); };
    for (const tok of s.split(/[,;\s]+/)) {
      let m;
      if ((m = tok.match(/^(\d+)$/))) push(+m[1]);
      else if ((m = tok.match(/^(\d*)-(\d*)$/)) && (m[1] || m[2])) {
        const a = m[1] ? +m[1] : 1;
        const b = m[2] ? +m[2] : total;
        const step = a <= b ? 1 : -1;
        for (let i = a; i !== b + step; i += step) push(i);
      }
    }
    return out;
  }

  function paperSize(o) {
    const p = o.paper === 'custom' ? o.customPaper : PAPERS[o.paper] || PAPERS.letter;
    return [Math.min(p[0], p[1]), Math.max(p[0], p[1])];
  }

  function orient(p, mode, score) {
    if (mode === 'portrait') return [p[0], p[1]];
    if (mode === 'landscape') return [p[1], p[0]];
    return score(p[1], p[0]) > score(p[0], p[1]) ? [p[1], p[0]] : [p[0], p[1]];
  }

  const area = (W, H, m) => ({ x: m.left, y: m.bottom, w: W - m.left - m.right, h: H - m.top - m.bottom });

  /* ---------- planning: where does each source page go? ---------- */

  function planBooklet(items, o, paper) {
    const W = Math.max(paper[0], paper[1]);
    const H = Math.min(paper[0], paper[1]);
    const A = area(W, H, o.margins);
    const half = A.w / 2;
    const rtl = o.booklet.binding === 'right';
    const sigPages = o.booklet.sig > 0 ? o.booklet.sig * 4 : 0;
    const chunks = [];
    if (!sigPages) chunks.push(items);
    else for (let i = 0; i < items.length; i += sigPages) chunks.push(items.slice(i, i + sigPages));

    const plan = [];
    for (const ch of chunks) {
      const m = Math.max(4, Math.ceil(ch.length / 4) * 4);
      const pad = ch.concat(Array(m - ch.length).fill(null));
      for (let s = 0; s < m / 4; s++) {
        const sides = [
          ['front', rtl ? [2 * s, m - 1 - 2 * s] : [m - 1 - 2 * s, 2 * s]],
          ['back', rtl ? [m - 2 - 2 * s, 2 * s + 1] : [2 * s + 1, m - 2 - 2 * s]],
        ];
        for (const [side, pair] of sides) {
          const st = [];
          const n = o.booklet.staples;
          if (n && side === 'back') {
            const ys = n === 3 ? [0.2, 0.5, 0.8] : [0.25, 0.75];
            ys.forEach((f) => st.push({ type: 'staple', keep: true, x1: W / 2 - 25, y1: H * f, x2: W / 2 + 25, y2: H * f }));
          }
          plan.push({
            W, H, side,
            cells: pair.map((pi, ci) => ({
              x: A.x + ci * half, y: A.y, w: half, h: A.h,
              item: pad[pi], spine: ci === 0 ? 'right' : 'left', creep: s, outer: ci === 0 ? 'left' : 'right',
            })),
            marks: [{ type: 'fold', x1: W / 2, y1: 0, x2: W / 2, y2: H }].concat(st),
          });
        }
      }
    }
    return plan;
  }

  function planZine(items, o, paper) {
    const W = Math.max(paper[0], paper[1]);
    const H = Math.min(paper[0], paper[1]);
    const A = area(W, H, o.margins);
    const cw = A.w / 4;
    const ch = A.h / 2;
    const plan = [];
    // Top row is upside down: 5 4 3 2. Bottom row: 6 7 8 1.
    const top = [4, 3, 2, 1];
    const bottom = [5, 6, 7, 0];
    for (let i = 0; i < items.length; i += 8) {
      const g = items.slice(i, i + 8);
      while (g.length < 8) g.push(null);
      const cells = [];
      top.forEach((pi, c) => cells.push({ x: A.x + c * cw, y: A.y + ch, w: cw, h: ch, item: g[pi], rot: 180 }));
      bottom.forEach((pi, c) => cells.push({ x: A.x + c * cw, y: A.y, w: cw, h: ch, item: g[pi], rot: 0 }));
      const mid = A.y + ch;
      plan.push({
        W, H, side: 'single', cells,
        marks: [
          { type: 'fold', x1: 0, y1: mid, x2: W, y2: mid },
          { type: 'fold', x1: A.x + cw, y1: 0, x2: A.x + cw, y2: H },
          { type: 'fold', x1: A.x + 2 * cw, y1: 0, x2: A.x + 2 * cw, y2: H },
          { type: 'fold', x1: A.x + 3 * cw, y1: 0, x2: A.x + 3 * cw, y2: H },
          { type: 'cut', keep: true, x1: A.x + cw, y1: mid, x2: A.x + 3 * cw, y2: mid },
        ],
      });
    }
    return plan;
  }

  function planTrifold(items, o, paper) {
    const W = Math.max(paper[0], paper[1]);
    const H = Math.min(paper[0], paper[1]);
    const A = area(W, H, o.margins);
    const cw = A.w / 3;
    const plan = [];
    // Outside: inner flap (5), back (6), cover (1). Inside: 2, 3, 4.
    for (let i = 0; i < items.length; i += 6) {
      const g = items.slice(i, i + 6);
      while (g.length < 6) g.push(null);
      const marks = [1, 2].map((c) => ({ type: 'fold', x1: A.x + c * cw, y1: 0, x2: A.x + c * cw, y2: H }));
      [['front', [4, 5, 0]], ['back', [1, 2, 3]]].forEach(([side, ids]) => {
        plan.push({ W, H, side, cells: ids.map((pi, c) => ({ x: A.x + c * cw, y: A.y, w: cw, h: A.h, item: g[pi], outer: c === 0 ? 'left' : 'right' })), marks });
      });
    }
    return plan;
  }

  function nupGeometry(W, H, o) {
    const { across: A, down: B, gap: g } = o.nup;
    const ar = area(W, H, o.margins);
    const cw = (ar.w - g * (A - 1)) / A;
    const ch = (ar.h - g * (B - 1)) / B;
    const cell = (r, c) => ({ x: ar.x + c * (cw + g), y: ar.y + ar.h - (r + 1) * ch - r * g, w: cw, h: ch });
    return { A, B, cw, ch, g, ar, cell };
  }

  function planNup(items, o, paper) {
    const first = items.find((i) => i && i.w) || { w: 612, h: 792 };
    const [W, H] = orient(paper, o.orientation, (w, h) => {
      const gm = nupGeometry(w, h, o);
      return Math.min(gm.cw / first.w, gm.ch / first.h);
    });
    const gm = nupGeometry(W, H, o);
    const { A, B } = gm;
    const N = A * B;
    const sides = o.duplex ? 2 : 1;
    const repeat = o.nup.repeat;
    const stack = !repeat && o.nup.order === 'stack';
    const S = Math.max(1, repeat ? Math.ceil(items.length / sides) : Math.ceil(items.length / (N * sides)));
    // Flipping on the long edge of the paper mirrors columns on a portrait sheet and rows on a landscape one.
    const mirrorCols = (W < H) === (o.flip === 'long');

    const marks = [];
    for (let c = 0; c < A - 1; c++) {
      const x = gm.ar.x + (c + 1) * gm.cw + c * gm.g + gm.g / 2;
      marks.push({ type: 'cut', x1: x, y1: 0, x2: x, y2: H });
    }
    for (let r = 0; r < B - 1; r++) {
      const y = gm.ar.y + gm.ar.h - (r + 1) * gm.ch - r * gm.g - gm.g / 2;
      marks.push({ type: 'cut', x1: 0, y1: y, x2: W, y2: y });
    }

    const plan = [];
    const stapleOn = o.nup.staple && o.nup.staple !== 'none';
    for (let i = 0; i < S; i++) {
      for (let t = 0; t < sides; t++) {
        const cells = [];
        const flipped = t === 1;
        const edgeRight = flipped && mirrorCols; // the binding edge ends up on the right of the back
        const cornerBottom = flipped && !mirrorCols && sides === 2;
        const sm = [];
        if (stapleOn) {
          const x0 = edgeRight ? W : 0;
          const dir = edgeRight ? -1 : 1;
          if (o.nup.staple === 'corner') {
            const y0 = cornerBottom ? 0 : H;
            const dy = cornerBottom ? 1 : -1;
            sm.push({ type: 'staple', keep: true, x1: x0 + dir * 4, y1: y0 + dy * 30, x2: x0 + dir * 30, y2: y0 + dy * 4 });
          } else {
            [0.25, 0.75].forEach((f) => sm.push({ type: 'staple', keep: true, x1: x0 + dir * 4, y1: H * f, x2: x0 + dir * 28, y2: H * f }));
          }
        }
        for (let j = 0; j < N; j++) {
          const r0 = Math.floor(j / A);
          const c0 = j % A;
          let r = r0;
          let c = c0;
          if (t === 1) { if (mirrorCols) c = A - 1 - c0; else r = B - 1 - r0; }
          let idx;
          if (repeat) idx = i * sides + t;
          else if (stack) idx = (j * S + i) * sides + t;
          else idx = i * N * sides + t * N + j;
          const cell = Object.assign(gm.cell(r, c), { item: items[idx] || null, outer: sides === 2 ? (t === 0 ? 'right' : 'left') : 'right' });
          if (stapleOn) {
            if (edgeRight && c === A - 1) cell.spine = 'right';
            else if (!edgeRight && c === 0) cell.spine = 'left';
          }
          cells.push(cell);
        }
        plan.push({ W, H, side: sides === 2 ? (t === 0 ? 'front' : 'back') : 'single', cells, marks: marks.concat(sm) });
      }
    }
    return plan;
  }

  function planPoster(items, o, paper) {
    const { w: PW, h: PH, mode, overlap: ov } = o.poster;
    const ar0 = (W, H) => area(W, H, o.margins);
    const tiles = (W, H) => {
      const a = ar0(W, H);
      const sx = Math.max(a.w - ov, 1);
      const sy = Math.max(a.h - ov, 1);
      return {
        cols: Math.max(1, Math.ceil((PW - ov) / sx - 1e-6)),
        rows: Math.max(1, Math.ceil((PH - ov) / sy - 1e-6)),
        sx, sy, a,
      };
    };
    const [W, H] = orient(paper, o.orientation, (w, h) => -(tiles(w, h).cols * tiles(w, h).rows));
    const T = tiles(W, H);
    const real = items.filter((i) => i && !i.blank);
    const plan = [];
    real.forEach((item, n) => {
      let dw, dh, ox = 0, oy = 0;
      if (mode === 'stretch') { dw = PW; dh = PH; }
      else if (mode === 'crop') { const k = Math.max(PW / item.w, PH / item.h); dw = item.w * k; dh = item.h * k; }
      else { const k = Math.min(PW / item.w, PH / item.h); dw = item.w * k; dh = item.h * k; ox = (PW - dw) / 2; oy = (PH - dh) / 2; }
      for (let r = 0; r < T.rows; r++) {
        for (let c = 0; c < T.cols; c++) {
          plan.push({
            W, H, side: 'single', cells: [], marks: [],
            tile: { item, ox, oy, dw, dh, tx: c * T.sx, ty: r * T.sy, PW, PH, r, c, rows: T.rows, cols: T.cols, area: T.a, source: n },
          });
        }
      }
    });
    plan.posterInfo = { cols: T.cols, rows: T.rows, per: T.cols * T.rows, W, H, PW, PH };
    return plan;
  }

  /* ---------- drawing ---------- */

  function placeRot(x, y, dw, dh, rot) {
    switch (((rot % 360) + 360) % 360) {
      case 90: return { x, y: y + dh, width: dh, height: dw, deg: -90 };
      case 180: return { x: x + dw, y: y + dh, width: dw, height: dh, deg: 180 };
      case 270: return { x: x + dw, y, width: dh, height: dw, deg: 90 };
      default: return { x, y, width: dw, height: dh, deg: 0 };
    }
  }

  function tokens(str, ctx) {
    const now = ctx.now;
    return str
      .replace(/<job>/gi, ctx.job)
      .replace(/<date>/gi, now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))
      .replace(/<time>/gi, now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))
      .replace(/<#>/g, String(ctx.num))
      .replace(/<total>/gi, String(ctx.total));
  }

  async function build(PDFLib, sources, opts) {
    const { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = PDFLib;
    const o = merge(DEFAULTS, opts);
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const ink = rgb(0.1, 0.1, 0.1);
    const grey = rgb(0.45, 0.45, 0.45);

    /* assemble the page list */
    const items = [];
    for (const src of sources) {
      if (src.type === 'blank') { items.push({ blank: true, w: 612, h: 792 }); continue; }
      if (src.type === 'image') {
        const img = src.mime === 'image/jpeg' ? await out.embedJpg(src.bytes) : await out.embedPng(src.bytes);
        const sc = 0.75;
        items.push({ kind: 'img', ref: img, w: img.width * sc, h: img.height * sc, rot: 0, name: src.name });
        continue;
      }
      const doc = await PDFDocument.load(src.bytes, { ignoreEncryption: true });
      const pages = doc.getPages();
      const idx = parseRanges(src.range, pages.length);
      for (const pi of idx) {
        const pg = pages[pi];
        const rot = ((pg.getRotation().angle % 360) + 360) % 360;
        const sw = rot === 90 || rot === 270;
        let emb = null;
        if (pg.node.get(PDFLib.PDFName.of('Contents'))) emb = await out.embedPage(pg);
        if (!emb) { const sz = pg.getSize(); items.push({ blank: true, w: sw ? sz.height : sz.width, h: sw ? sz.width : sz.height }); continue; }
        items.push({ kind: 'pdf', ref: emb, w: sw ? emb.height : emb.width, h: sw ? emb.width : emb.height, rot, name: src.name });
      }
    }
    if (!items.length) throw new Error('There are no pages to print.');
    items.forEach((it, i) => { it.num = i + 1; });
    const total = items.length;
    if (o.reverse) items.reverse();

    const paper = paperSize(o);
    let plan;
    if (o.layout === 'booklet') plan = planBooklet(items, o, paper);
    else if (o.layout === 'zine') plan = planZine(items, o, paper);
    else if (o.layout === 'trifold') plan = planTrifold(items, o, paper);
    else if (o.layout === 'poster') plan = planPoster(items, o, paper);
    else plan = planNup(items, o, paper);

    let list = plan;
    const hasBacks = plan.some((s) => s.side === 'back');
    if (hasBacks && o.output === 'fronts') list = plan.filter((s) => s.side === 'front');
    else if (hasBacks && o.output === 'backs') list = plan.filter((s) => s.side === 'back');
    else if (hasBacks && o.output === 'backs-rev') list = plan.filter((s) => s.side === 'back').reverse();

    const now = new Date();
    const clipTo = (page, x, y, w, h) => {
      page.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath());
    };

    function drawItem(page, item, x, y, dw, dh, extraRot) {
      const p = placeRot(x, y, dw, dh, (item.rot || 0) + (extraRot || 0));
      const args = { x: p.x, y: p.y, width: p.width, height: p.height, rotate: degrees(p.deg) };
      if (item.kind === 'pdf') page.drawPage(item.ref, args);
      else if (item.kind === 'img') page.drawImage(item.ref, args);
    }

    function drawText(page, text, size, fr, T, rotDeg, lx, ly, color, opacity) {
      const [px, py] = T(lx, ly);
      page.drawText(text, { x: px, y: py, size, font, color, opacity, rotate: degrees(rotDeg) });
    }

    function drawCell(page, cell) {
      const item = cell.item;
      if (!item) return;
      const rot = cell.rot || 0;
      let bx = cell.x + o.pad;
      let by = cell.y + o.pad;
      let bw = cell.w - 2 * o.pad;
      let bh = cell.h - 2 * o.pad;
      if (cell.spine) {
        const g = o.gutter;
        const shift = (cell.creep || 0) * o.creep;
        if (cell.spine === 'right') { bw -= g; bx += shift; } else { bx += g; bw -= g; bx -= shift; }
      }
      if (bw <= 0 || bh <= 0) return;
      let dw, dh, k;
      if (o.scaling === 'stretch') { dw = bw; dh = bh; k = Math.min(bw / item.w, bh / item.h); }
      else if (o.scaling === 'none') { dw = item.w; dh = item.h; k = 1; }
      else { k = Math.min(bw / item.w, bh / item.h); dw = item.w * k; dh = item.h * k; }
      const fx = bx + (bw - dw) / 2;
      const fy = by + (bh - dh) / 2;

      page.pushOperators(pushGraphicsState());
      if (o.scaling === 'none') clipTo(page, cell.x, cell.y, cell.w, cell.h);
      drawItem(page, item, fx, fy, dw, dh, rot);
      page.pushOperators(popGraphicsState());
      if (o.scaling === 'none') page.pushOperators(popGraphicsState());

      if (o.border) {
        page.drawRectangle({ x: fx, y: fy, width: dw, height: dh, borderColor: ink, borderWidth: o.borderWidth || 0.5, opacity: 0, borderOpacity: 1 });
      }
      if (item.blank) return;

      const T = rot === 180 ? (lx, ly) => [fx + dw - lx, fy + dh - ly] : (lx, ly) => [fx + lx, fy + ly];
      const ctx = { job: o.jobName, now, num: item.num, total };
      const inset = 8 * k;
      const place = (cfg, y, color) => {
        if (!cfg.text) return;
        const size = cfg.size * k;
        const text = tokens(cfg.text, ctx);
        const tw = font.widthOfTextAtSize(text, size);
        const lx = cfg.align === 'left' ? inset : cfg.align === 'right' ? dw - inset - tw : (dw - tw) / 2;
        drawText(page, text, size, font, T, rot, lx, y, color, 1);
      };
      place(o.header, dh - o.header.size * k - 6 * k, ink);
      place(o.footer, 6 * k, ink);

      if (o.pageNumbers.on) {
        const size = o.pageNumbers.size * k;
        const text = String(item.num);
        const tw = font.widthOfTextAtSize(text, size);
        const pos = o.pageNumbers.pos;
        const top = pos[0] === 't';
        let side = pos[1];
        if (side === 'o') side = cell.outer === 'left' ? 'l' : 'r';
        const ly = top ? dh - size - 6 * k : 6 * k;
        const lx = side === 'l' ? inset : side === 'r' ? dw - inset - tw : (dw - tw) / 2;
        drawText(page, text, size, font, T, rot, lx, ly, ink, 1);
      }
      const wm = o.watermark;
      if (wm.text) {
        const size = wm.size * k;
        const text = tokens(wm.text, ctx);
        const tw = font.widthOfTextAtSize(text, size);
        const ang = ((wm.angle || 0) + rot) * Math.PI / 180;
        const cx = fx + dw / 2;
        const cy = fy + dh / 2;
        const sx = cx - (tw / 2) * Math.cos(ang) + size * 0.3 * Math.sin(ang);
        const sy = cy - (tw / 2) * Math.sin(ang) - size * 0.3 * Math.cos(ang);
        page.drawText(text, { x: sx, y: sy, size, font, color: grey, opacity: wm.opacity, rotate: degrees((wm.angle || 0) + rot) });
      }
    }

    function drawTile(page, sh) {
      const t = sh.tile;
      const a = t.area;
      const px0 = a.x - t.tx;
      const ptop = a.y + a.h + t.ty;
      const cx0 = Math.max(a.x, px0);
      const cx1 = Math.min(a.x + a.w, px0 + t.PW);
      const cy1 = Math.min(a.y + a.h, ptop);
      const cy0 = Math.max(a.y, ptop - t.PH);
      if (cx1 > cx0 && cy1 > cy0) {
        page.pushOperators(pushGraphicsState());
        clipTo(page, cx0, cy0, cx1 - cx0, cy1 - cy0);
        drawItem(page, t.item, px0 + t.ox, ptop - t.oy - t.dh, t.dw, t.dh, 0);
        page.pushOperators(popGraphicsState());
        page.pushOperators(popGraphicsState());
      }
      if (o.marks !== 'none') {
        page.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, borderColor: grey, borderWidth: 0.5, borderDashArray: [3, 3], opacity: 0, borderOpacity: 1 });
        const label = `Tile ${t.r * t.cols + t.c + 1} of ${t.rows * t.cols}  (row ${t.r + 1}, column ${t.c + 1})`;
        const ly = a.y >= 12 ? a.y - 10 : a.y + 3;
        page.drawText(label, { x: a.x + 4, y: ly, size: 7, font, color: grey });
      }
    }

    function drawMarks(page, sh) {
      for (const m of sh.marks) {
        if (o.marks === 'none' && !m.keep) continue;
        const dx = m.x2 - m.x1;
        const dy = m.y2 - m.y1;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        const full = o.marks === 'lines' || m.keep;
        const seg = full ? [[m.x1, m.y1, m.x2, m.y2]] : (() => {
          const l = Math.min(10, len / 2);
          return [[m.x1, m.y1, m.x1 + ux * l, m.y1 + uy * l], [m.x2 - ux * l, m.y2 - uy * l, m.x2, m.y2]];
        })();
        for (const s of seg) {
          page.drawLine({
            start: { x: s[0], y: s[1] }, end: { x: s[2], y: s[3] }, thickness: m.type === 'staple' ? 1.6 : 0.5, color: m.type === 'staple' ? rgb(0.6, 0.6, 0.6) : grey,
            dashArray: m.type === 'fold' ? [3, 3] : undefined,
          });
        }
      }
    }

    const sheetMeta = [];
    for (const sh of list) {
      const page = out.addPage([sh.W, sh.H]);
      if (sh.tile) drawTile(page, sh);
      else for (const c of sh.cells) drawCell(page, c);
      drawMarks(page, sh);
      sheetMeta.push({ side: sh.side, W: sh.W, H: sh.H });
    }

    out.setTitle(o.jobName);
    out.setProducer('Print Desk');
    const bytes = await out.save();

    const physical = plan.some((s) => s.side === 'front' || s.side === 'back') ? Math.ceil(plan.length / 2) : plan.length;
    const info = {
      sourcePages: total,
      outputPages: list.length,
      physicalSheets: physical,
      saved: Math.max(0, Math.round((1 - physical / Math.max(total, 1)) * 100)),
      sheets: sheetMeta,
      poster: plan.posterInfo || null,
      order: plan.slice(0, 200).map((s) => ({ side: s.side, pages: s.cells.map((c) => (c.item && c.item.num) || null) })),
      sheetSize: [plan[0].W, plan[0].H],
      finished: plan[0].cells && plan[0].cells[0] ? [plan[0].cells[0].w - 2 * o.pad, plan[0].cells[0].h - 2 * o.pad] : null,
    };
    info.instructions = instructions(o, info);
    return { bytes, info };
  }

  function instructions(o, info) {
    const lines = [];
    const fmt = (pt) => `${(pt / 72).toFixed(2)} in (${Math.round(pt * 25.4 / 72)} mm)`;
    const common = 'Print at 100% or “Actual size”, not “Fit to page”.';
    if (o.layout === 'booklet') {
      lines.push('Printer settings: double-sided, flip on the short edge. ' + common);
      lines.push('If your printer cannot do double-sided, download “Fronts only”, print it, put the stack back in the tray as your printer expects, then print “Backs only”. If the backs come out in the wrong order, use “Backs, reversed”.');
      if (o.booklet.staples) lines.push(`Staple ${o.booklet.staples} times on the fold, at the grey guide marks printed on the inside of each sheet. Open the stapler flat, or use a long-reach one. Rest the booklet on a folded towel or a stack of scrap paper and staple from the outside.`);
      else lines.push('No staple marks are printed. Fold only: bind with thread, glue or a rubber band along the fold.');
      lines.push(o.booklet.sig > 0
        ? `Fold each group of ${o.booklet.sig} sheet${o.booklet.sig > 1 ? 's' : ''} in half on its own, then stack the groups in order and bind them along the spine.`
        : 'Stack the sheets in order, fold the whole stack in half, and staple along the fold.');
      if (info.sourcePages % 4) lines.push(`Your ${info.sourcePages} pages were padded with ${4 - (info.sourcePages % 4)} blank page${4 - (info.sourcePages % 4) > 1 ? 's' : ''} at the end so they fill whole sheets.`);
    } else if (o.layout === 'trifold') {
      lines.push('Printer settings: double-sided, flip on the short edge. ' + common);
      lines.push('Print the side with the cover first. Fold the right-hand panel in, then fold the left-hand panel over it, like folding a letter. The cover ends up on the front.');
      if (info.sourcePages % 6) lines.push(`Your ${info.sourcePages} pages were padded with blank panels so each brochure has 6.`);
    } else if (o.layout === 'zine') {
      lines.push('Print single-sided. ' + common);
      lines.push('Fold the sheet in half the long way, then open it. Cut along the solid line in the middle, which only goes between the second and third folds.');
      lines.push('Fold the sheet in half the other way so the cut opens into a diamond, then push the ends together and fold the pages into a booklet.');
    } else if (o.layout === 'poster') {
      const p = info.poster;
      lines.push(`The poster is ${fmt(p.PW)} × ${fmt(p.PH)}. It prints on ${p.per} sheet${p.per > 1 ? 's' : ''} (${p.cols} across, ${p.rows} down)${info.sourcePages > 1 ? ' for each source page' : ''}. ${common}`);
      lines.push('Lay the sheets out left to right, top to bottom, the way you read. Trim the left and top edge of each sheet, except the first column and the first row, then line each sheet up with its neighbour and tape or glue it.');
      lines.push('The sheets overlap on purpose, so there are no white gaps where your printer cannot reach the paper edge.');
    } else {
      const n = o.nup.across * o.nup.down;
      lines.push(`${n} page${n > 1 ? 's' : ''} per sheet. ${o.duplex ? `Printer settings: double-sided, flip on the ${o.flip} edge.` : 'Print single-sided.'} ${common}`);
      if (o.nup.staple === 'corner') lines.push('Stack the sheets in order and staple once in the corner shown by the grey mark. Extra space is left on that edge so the staple does not cover text.');
      else if (o.nup.staple === 'edge') lines.push('Stack the sheets in order and staple twice down the edge shown by the grey marks. Extra space is left on that edge so the staples do not cover text.');
      if (n > 1 && o.nup.order === 'stack' && !o.nup.repeat) lines.push('Cut the stack apart along the marks, then place the pile from each position on top of the one before it, left to right, top to bottom. The pages end up in order.');
      else if (n > 1) lines.push('Cut along the marks to separate the pages.');
    }
    return lines;
  }

  const api = { PAPERS, DEFAULTS, merge, parseRanges, paperSize, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PrintEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
