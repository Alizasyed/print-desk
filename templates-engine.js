/*
 * Print Desk templates: parametric die-lines (cards, folded cards, envelopes, boxes, sleeves),
 * placed true-to-size on the chosen paper, tiled across sheets when too big.
 * Template geometry is in millimetres with y pointing down. PDF output is in points.
 */
(function (root) {
  'use strict';
  const MM = 72 / 25.4;

  /* ---------- geometry helpers ---------- */
  function arc(cx, cy, r, a0, a1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }
  function roundedRect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (r === 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    return [].concat(
      arc(x + r, y + r, r, 180, 270, 6),
      arc(x + w - r, y + r, r, 270, 360, 6),
      arc(x + w - r, y + h - r, r, 0, 90, 6),
      arc(x + r, y + h - r, r, 90, 180, 6),
    );
  }
  const circle = (cx, cy, r) => arc(cx, cy, r, 0, 360, 28).slice(0, -1);
  const closed = (pts) => ({ pts, closed: true });

  /* ---------- template generators ---------- */
  function genCard(p) {
    const cut = [closed(roundedRect(0, 0, p.w, p.h, p.r))];
    if (p.hole > 0) cut.push(closed(circle(p.w / 2, Math.max(p.hole * 1.1, 4), p.hole / 2)));
    return { cut, fold: [], panels: [{ label: 'Card', x: 0, y: 0, w: p.w, h: p.h }] };
  }

  function genFolded(p) {
    const side = p.fold === 'side';
    const w = side ? p.pw * 2 : p.pw;
    const h = side ? p.ph : p.ph * 2;
    const cut = [closed(roundedRect(0, 0, w, h, p.r))];
    if (side) {
      return {
        cut, fold: [[p.pw, 0, p.pw, h]],
        panels: [{ label: 'Back cover', x: 0, y: 0, w: p.pw, h: p.ph }, { label: 'Front cover', x: p.pw, y: 0, w: p.pw, h: p.ph }],
      };
    }
    return {
      cut, fold: [[0, p.ph, w, p.ph]],
      panels: [{ label: 'Back (upside down)', x: 0, y: 0, w: p.pw, h: p.ph }, { label: 'Front', x: 0, y: p.ph, w: p.pw, h: p.ph }],
    };
  }

  function genEnvelope(p) {
    const ew = p.cw + 2 * p.clr;
    const eh = p.ch + 2 * p.clr;
    const sw = ew * 0.3;
    const tf = Math.min(ew * 0.5, eh * 0.45);
    const bf = eh * 0.4;
    const pts = [
      [0, 0], [ew / 2, -tf], [ew, 0],
      [ew + sw, eh * 0.12], [ew + sw, eh * 0.88], [ew, eh],
      [ew * 0.9, eh + bf], [ew * 0.1, eh + bf], [0, eh],
      [-sw, eh * 0.88], [-sw, eh * 0.12],
    ];
    return {
      cut: [closed(pts)],
      fold: [[0, 0, ew, 0], [ew, 0, ew, eh], [0, eh, ew, eh], [0, 0, 0, eh]],
      panels: [{ label: 'Front of envelope (pocket)', x: 0, y: 0, w: ew, h: eh }],
      notes: `Fold in the side flaps, then the bottom flap over them, and glue. The pocket fits a ${p.cw} × ${p.ch} mm card. The top flap seals it.`,
    };
  }

  function genTuck(p) {
    const { L, W, H, T, g } = p;
    const x1 = g, x2 = g + L, x3 = g + L + W, x4 = g + 2 * L + W, x5 = g + 2 * L + 2 * W;
    const y0 = W + T;
    const y1 = y0 + H;
    const dh = W * 0.85;
    const pts = [];
    const push = (...a) => a.forEach((q) => pts.push(q));
    // top edge, left to right
    push([x1, y0], [x2, y0]);
    push([x2 + 0.5, y0], [x2 + 2, y0 - dh * 0.9], [x2 + 4, y0 - dh], [x3 - 6, y0 - dh], [x3 - 2, y0 - dh * 0.6], [x3, y0]);
    push([x3, y0 - W], [x3 + 0.5, y0 - W], [x3 + 3, y0 - W - T], [x4 - 3, y0 - W - T], [x4 - 0.5, y0 - W], [x4, y0 - W], [x4, y0]);
    push([x4 + 0.5, y0], [x4 + 2, y0 - dh * 0.9], [x4 + 4, y0 - dh], [x5 - 6, y0 - dh], [x5 - 2, y0 - dh * 0.6], [x5, y0]);
    // right edge, then bottom edge right to left
    push([x5, y1]);
    push([x5 - 2, y1 + dh * 0.6], [x5 - 6, y1 + dh], [x4 + 4, y1 + dh], [x4 + 2, y1 + dh * 0.9], [x4 + 0.5, y1], [x4, y1]);
    push([x4, y1 + W], [x4 - 0.5, y1 + W], [x4 - 3, y1 + W + T], [x3 + 3, y1 + W + T], [x3 + 0.5, y1 + W], [x3, y1 + W], [x3, y1]);
    push([x3 - 0.5, y1], [x3 - 2, y1 + dh * 0.6], [x3 - 6, y1 + dh], [x2 + 4, y1 + dh], [x2 + 2, y1 + dh * 0.9], [x2, y1], [x1, y1]);
    // glue flap on the left
    push([x1, y1 - 3], [g * 0.2, y1 - 3 - g * 0.35], [g * 0.2, y0 + 3 + g * 0.35], [x1, y0 + 3]);
    const fold = [
      [x1, y0, x1, y1], [x2, y0, x2, y1], [x3, y0, x3, y1], [x4, y0, x4, y1],
      [x2, y0, x3, y0], [x3, y0, x4, y0], [x4, y0, x5, y0],
      [x2, y1, x3, y1], [x3, y1, x4, y1], [x4, y1, x5, y1],
      [x3, y0 - W, x4, y0 - W], [x3, y1 + W, x4, y1 + W],
    ];
    return {
      cut: [closed(pts)], fold,
      panels: [
        { label: 'Glue flap', x: 0, y: y0, w: g, h: H },
        { label: 'Front', x: x1, y: y0, w: L, h: H },
        { label: 'Side', x: x2, y: y0, w: W, h: H },
        { label: 'Back', x: x3, y: y0, w: L, h: H },
        { label: 'Side', x: x4, y: y0, w: W, h: H },
        { label: 'Lid', x: x3, y: y0 - W, w: L, h: W },
        { label: 'Base', x: x3, y: y1, w: L, h: W },
      ],
      notes: 'Straight tuck-end box. Glue the flap inside the front edge, fold in the small dust flaps, close the base, then tuck the lid flap in.',
    };
  }

  function genSleeve(p) {
    const { L, W, h, g } = p;
    const w = g + 2 * L + 2 * W;
    const pts = [
      [g, 0], [w, 0], [w, h], [g, h],
      [g, h - 3], [g * 0.2, h - 3 - g * 0.35], [g * 0.2, 3 + g * 0.35], [g, 3],
    ];
    const xs = [g, g + L, g + L + W, g + 2 * L + W];
    return {
      cut: [closed(pts)],
      fold: xs.map((x) => [x, 0, x, h]),
      panels: [
        { label: 'Glue flap', x: 0, y: 0, w: g, h },
        { label: 'Front', x: xs[0], y: 0, w: L, h },
        { label: 'Side', x: xs[1], y: 0, w: W, h },
        { label: 'Back', x: xs[2], y: 0, w: L, h },
        { label: 'Side', x: xs[3], y: 0, w: W, h },
      ],
      notes: 'A band that slides over a box, a card set or a bundle. Fold on the dashed lines and glue the flap inside the last panel.',
    };
  }

  const TYPES = {
    card: {
      name: 'Flat card or insert',
      desc: 'A single card: event insert, invitation, business card, bookmark or gift tag. Add a hole for string.',
      fields: [
        { id: 'w', label: 'Width', def: 101.6 }, { id: 'h', label: 'Height', def: 152.4 },
        { id: 'r', label: 'Corner radius', def: 0, min: 0 }, { id: 'hole', label: 'Hole diameter (0 for none)', def: 0, min: 0 },
      ],
      gen: genCard,
    },
    folded: {
      name: 'Folded card',
      desc: 'A card folded in half. Side fold opens like a book; top fold stands up as a table tent.',
      fields: [
        { id: 'pw', label: 'Panel width', def: 105 }, { id: 'ph', label: 'Panel height', def: 148 },
        { id: 'r', label: 'Corner radius', def: 0, min: 0 },
        { id: 'fold', label: 'Fold', select: [['side', 'Side fold (opens like a book)'], ['top', 'Top fold (table tent)']], def: 'side' },
      ],
      gen: genFolded,
    },
    envelope: {
      name: 'Envelope',
      desc: 'A four-flap envelope drawn around the card you want to send. Clearance is the extra room around the card.',
      fields: [
        { id: 'cw', label: 'Card width', def: 127 }, { id: 'ch', label: 'Card height', def: 178 }, { id: 'clr', label: 'Clearance', def: 4, min: 0 },
      ],
      gen: genEnvelope,
    },
    tuck: {
      name: 'Tuck-end box',
      desc: 'A small folding carton with a tuck lid and a glued side seam, for soap, candles, prints, sets of cards or gifts.',
      fields: [
        { id: 'L', label: 'Length (front)', def: 90 }, { id: 'W', label: 'Depth (side)', def: 30 }, { id: 'H', label: 'Height', def: 60 },
        { id: 'T', label: 'Tuck flap depth', def: 15 }, { id: 'g', label: 'Glue flap width', def: 12 },
      ],
      gen: genTuck,
    },
    sleeve: {
      name: 'Sleeve or belly band',
      desc: 'A wrap that slides over something. Works for card sets, boxes, zines and bundles.',
      fields: [
        { id: 'L', label: 'Length (front)', def: 105 }, { id: 'W', label: 'Depth (side)', def: 10 }, { id: 'h', label: 'Band height', def: 60 }, { id: 'g', label: 'Glue flap width', def: 12 },
      ],
      gen: genSleeve,
    },
  };

  const PRESETS = [
    { label: 'Event card insert, 4 × 6 in', type: 'card', v: { w: 101.6, h: 152.4, r: 0, hole: 0 } },
    { label: 'Invitation, 5 × 7 in', type: 'card', v: { w: 127, h: 178, r: 0, hole: 0 } },
    { label: 'Menu or program card, 4 × 9 in', type: 'card', v: { w: 101.6, h: 228.6, r: 0, hole: 0 } },
    { label: 'Business card, 3.5 × 2 in', type: 'card', v: { w: 88.9, h: 50.8, r: 0, hole: 0 } },
    { label: 'Rounded business card', type: 'card', v: { w: 88.9, h: 50.8, r: 3, hole: 0 } },
    { label: 'Bookmark, 2 × 6 in', type: 'card', v: { w: 50.8, h: 152.4, r: 2, hole: 0 } },
    { label: 'Gift tag with hole', type: 'card', v: { w: 50, h: 90, r: 3, hole: 5 } },
    { label: 'Postcard, A6', type: 'card', v: { w: 105, h: 148, r: 0, hole: 0 } },
    { label: 'Folded card, A6 panels', type: 'folded', v: { pw: 105, ph: 148, r: 0, fold: 'side' } },
    { label: 'Folded card, 5 × 7 in panels', type: 'folded', v: { pw: 127, ph: 178, r: 0, fold: 'side' } },
    { label: 'Table tent, 4 × 5 in panels', type: 'folded', v: { pw: 101.6, ph: 127, r: 0, fold: 'top' } },
    { label: 'Envelope for a 5 × 7 in card', type: 'envelope', v: { cw: 127, ch: 178, clr: 4 } },
    { label: 'Envelope for an A6 card', type: 'envelope', v: { cw: 105, ch: 148, clr: 4 } },
    { label: 'Envelope for a 4 × 6 in card', type: 'envelope', v: { cw: 101.6, ch: 152.4, clr: 4 } },
    { label: 'Small tuck box, 90 × 30 × 60 mm', type: 'tuck', v: { L: 90, W: 30, H: 60, T: 15, g: 12 } },
    { label: 'Card-deck box, 65 × 22 × 95 mm', type: 'tuck', v: { L: 65, W: 22, H: 95, T: 14, g: 12 } },
    { label: 'Tall tuck box, 50 × 50 × 110 mm', type: 'tuck', v: { L: 50, W: 50, H: 110, T: 18, g: 12 } },
    { label: 'Sleeve for a 4 × 6 in print set', type: 'sleeve', v: { L: 106, W: 8, h: 60, g: 12 } },
  ];

  /* values are millimetres; gen then normalise so the drawing starts at 0,0 */
  function generate(type, vals) {
    const T = TYPES[type];
    const p = {};
    T.fields.forEach((f) => { p[f.id] = f.select ? (vals[f.id] || f.def) : Math.max(f.min === undefined ? 1 : f.min, Number(vals[f.id]) || 0); });
    const g = T.gen(p);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const see = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    g.cut.forEach((c) => c.pts.forEach(([x, y]) => see(x, y)));
    g.fold.forEach((f) => { see(f[0], f[1]); see(f[2], f[3]); });
    const sh = (x, y) => [x - x0, y - y0];
    return {
      type, params: p, notes: g.notes || '',
      w: x1 - x0, h: y1 - y0,
      cut: g.cut.map((c) => ({ closed: c.closed, pts: c.pts.map(([x, y]) => sh(x, y)) })),
      fold: g.fold.map((f) => [...sh(f[0], f[1]), ...sh(f[2], f[3])]),
      panels: g.panels.map((q) => ({ label: q.label, x: q.x - x0, y: q.y - y0, w: q.w, h: q.h })),
    };
  }

  /* ---------- placement on paper ---------- */
  function layout(tpl, o) {
    const [pw, ph] = o.paper[0] <= o.paper[1] ? o.paper : [o.paper[1], o.paper[0]];
    const art = !!o.art;
    const bb = art ? o.bleed * MM : 0;
    const fw = tpl.w * MM + 2 * bb;
    const fh = tpl.h * MM + 2 * bb;
    const gap = o.gap * MM;
    const m = o.margin;
    const ruler = o.ruler ? 18 : 0;
    const orients = o.orientation === 'portrait' ? [[pw, ph]] : o.orientation === 'landscape' ? [[ph, pw]] : [[pw, ph], [ph, pw]];
    const area = (W, H) => ({ x: m, y: m + ruler, w: W - 2 * m, h: H - 2 * m - ruler });
    let best = null;
    for (const [W, H] of orients) {
      const a = area(W, H);
      let nx = Math.floor((a.w + gap) / (fw + gap));
      let ny = Math.floor((a.h + gap) / (fh + gap));
      if (nx < 1 || ny < 1) continue;
      if (o.copies === 'one') { nx = 1; ny = 1; }
      if (!best || nx * ny > best.nx * best.ny) best = { W, H, a, nx, ny };
    }
    if (best) return Object.assign({ mode: 'grid', fw, fh, bb, gap }, best);

    const ov = (o.tileOverlap || 12) * MM;
    let tb = null;
    for (const [W, H] of orients) {
      const a = area(W, H);
      const sx = Math.max(a.w - ov, 10);
      const sy = Math.max(a.h - ov, 10);
      const cols = Math.max(1, Math.ceil((fw - ov) / sx - 1e-6));
      const rows = Math.max(1, Math.ceil((fh - ov) / sy - 1e-6));
      if (!tb || cols * rows < tb.cols * tb.rows) tb = { W, H, a, sx, sy, cols, rows };
    }
    return Object.assign({ mode: 'tiles', fw, fh, bb, gap, ov }, tb);
  }

  /* ---------- PDF ---------- */
  async function buildPDF(PDFLib, tpl, o, artwork) {
    const { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = PDFLib;
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const lay = layout(tpl, o);
    const black = rgb(0, 0, 0);
    const grey = rgb(0.4, 0.4, 0.4);

    let art = null;
    if (o.art && artwork) {
      if (artwork.type === 'image') {
        const im = artwork.mime === 'image/jpeg' ? await out.embedJpg(artwork.bytes) : await out.embedPng(artwork.bytes);
        art = { ref: im, w: im.width, h: im.height, img: true };
      } else {
        const src = await PDFDocument.load(artwork.bytes, { ignoreEncryption: true });
        const pg = src.getPages()[0];
        const e = await out.embedPage(pg);
        art = { ref: e, w: e.width, h: e.height, img: false };
      }
    }

    const doClip = (page, x, y, w, h) => page.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath());

    // draws one copy; (ox, oy) = bottom-left of the template (excluding bleed) in points
    function drawOne(page, ox, oy) {
      const tw = tpl.w * MM;
      const th = tpl.h * MM;
      const P = (x, y) => ({ x: ox + x * MM, y: oy + (tpl.h - y) * MM });
      if (art) {
        const fx = ox - lay.bb;
        const fy = oy - lay.bb;
        const fw = tw + 2 * lay.bb;
        const fh = th + 2 * lay.bb;
        const s = Math.max(fw / art.w, fh / art.h);
        const dw = art.w * s;
        const dh = art.h * s;
        page.pushOperators(pushGraphicsState());
        doClip(page, fx, fy, fw, fh);
        const args = { x: fx + (fw - dw) / 2, y: fy + (fh - dh) / 2, width: dw, height: dh };
        if (art.img) page.drawImage(art.ref, args); else page.drawPage(art.ref, args);
        page.pushOperators(popGraphicsState(), popGraphicsState());
      }
      if (o.lines) {
        for (const f of tpl.fold) page.drawLine({ start: P(f[0], f[1]), end: P(f[2], f[3]), thickness: 0.6, color: grey, dashArray: [4, 3] });
        for (const c of tpl.cut) {
          const n = c.pts.length;
          for (let i = 0; i < (c.closed ? n : n - 1); i++) {
            const a = c.pts[i];
            const b = c.pts[(i + 1) % n];
            page.drawLine({ start: P(a[0], a[1]), end: P(b[0], b[1]), thickness: 0.8, color: black });
          }
        }
      }
      if (o.labels) {
        for (const q of tpl.panels) {
          if (q.w < 14 || q.h < 9) continue;
          const t1 = q.label;
          const t2 = `${+q.w.toFixed(1)} × ${+q.h.toFixed(1)} mm`;
          const c = P(q.x + q.w / 2, q.y + q.h / 2);
          page.drawText(t1, { x: c.x - font.widthOfTextAtSize(t1, 7) / 2, y: c.y + 2, size: 7, font, color: grey });
          page.drawText(t2, { x: c.x - font.widthOfTextAtSize(t2, 6) / 2, y: c.y - 6, size: 6, font, color: grey });
        }
      }
    }

    function drawRuler(page) {
      if (!o.ruler) return;
      const len = o.rulerMM * MM;
      const x = o.margin;
      const y = o.margin + 8;
      page.drawLine({ start: { x, y }, end: { x: x + len, y }, thickness: 0.8, color: black });
      [0, len].forEach((d) => page.drawLine({ start: { x: x + d, y: y - 3 }, end: { x: x + d, y: y + 3 }, thickness: 0.8, color: black }));
      const label = `Check: this line is ${o.rulerLabel} long. If it is not, print at 100% or "Actual size".`;
      page.drawText(label, { x: x + len + 8, y: y - 2.5, size: 7, font, color: grey });
    }

    if (lay.mode === 'grid') {
      const page = out.addPage([lay.W, lay.H]);
      const gw = lay.nx * lay.fw + (lay.nx - 1) * lay.gap;
      const gh = lay.ny * lay.fh + (lay.ny - 1) * lay.gap;
      const sx = lay.a.x + (lay.a.w - gw) / 2;
      const top = lay.a.y + (lay.a.h + gh) / 2;
      for (let j = 0; j < lay.ny; j++) {
        for (let i = 0; i < lay.nx; i++) {
          drawOne(page, sx + i * (lay.fw + lay.gap) + lay.bb, top - (j + 1) * lay.fh - j * lay.gap + lay.bb);
        }
      }
      drawRuler(page);
    } else {
      const total = lay.cols * lay.rows;
      for (let r = 0; r < lay.rows; r++) {
        for (let c = 0; c < lay.cols; c++) {
          const page = out.addPage([lay.W, lay.H]);
          const a = lay.a;
          const tx = c * lay.sx;
          const ty = r * lay.sy;
          page.pushOperators(pushGraphicsState());
          doClip(page, a.x, a.y, a.w, a.h);
          drawOne(page, a.x - tx + lay.bb, a.y + a.h + ty - lay.fh + lay.bb);
          page.pushOperators(popGraphicsState(), popGraphicsState());
          page.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, borderColor: grey, borderWidth: 0.4, borderDashArray: [2, 3], opacity: 0, borderOpacity: 1 });
          page.drawText(`Sheet ${r * lay.cols + c + 1} of ${total} (column ${c + 1}, row ${r + 1}). Overlap the dotted edges and tape the sheets together.`, { x: a.x, y: a.y - 12 > 6 ? a.y - 12 : a.y + a.h + 3, size: 7, font, color: grey });
          drawRuler(page);
        }
      }
    }
    out.setTitle(o.title || 'Template');
    out.setProducer('Print Desk');
    return { bytes: await out.save(), layout: lay, pages: out.getPageCount() };
  }

  /* ---------- SVG (millimetres; red = cut, blue dashed = fold) ---------- */
  function toSVG(tpl, opt) {
    opt = opt || {};
    const pad = opt.pad || 0;
    const w = tpl.w + 2 * pad;
    const h = tpl.h + 2 * pad;
    const f = (n) => +n.toFixed(2);
    const cutC = opt.cut || '#FF0000';
    const foldC = opt.fold || '#0000FF';
    let s = `<svg xmlns="http://www.w3.org/2000/svg" ${opt.sized === false ? '' : `width="${f(w)}mm" height="${f(h)}mm" `}viewBox="${-pad} ${-pad} ${f(w)} ${f(h)}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
    if (opt.labels) {
      for (const q of tpl.panels) {
        s += `<rect x="${f(q.x)}" y="${f(q.y)}" width="${f(q.w)}" height="${f(q.h)}" fill="${opt.panelFill || 'none'}" stroke="none"/>\n`;
      }
    }
    for (const l of tpl.fold) s += `<line x1="${f(l[0])}" y1="${f(l[1])}" x2="${f(l[2])}" y2="${f(l[3])}" stroke="${foldC}" stroke-width="${opt.sw || 0.3}" stroke-dasharray="2 1.5"/>\n`;
    for (const c of tpl.cut) s += `<path d="M${c.pts.map((p) => f(p[0]) + ' ' + f(p[1])).join(' L')}${c.closed ? ' Z' : ''}" stroke="${cutC}" stroke-width="${opt.sw || 0.3}"/>\n`;
    if (opt.labels) {
      for (const q of tpl.panels) {
        if (q.w < 12 || q.h < 8) continue;
        const fs = Math.max(2.2, Math.min(4, q.w / 9));
        s += `<text x="${f(q.x + q.w / 2)}" y="${f(q.y + q.h / 2)}" font-size="${f(fs)}" text-anchor="middle" fill="${opt.text || '#4A4742'}" stroke="none" font-family="Instrument Sans, Arial, sans-serif">${q.label}</text>\n`;
        s += `<text x="${f(q.x + q.w / 2)}" y="${f(q.y + q.h / 2 + fs * 1.3)}" font-size="${f(fs * 0.8)}" text-anchor="middle" fill="${opt.text || '#4A4742'}" stroke="none" font-family="Instrument Sans, Arial, sans-serif">${f(q.w)} × ${f(q.h)} mm</text>\n`;
      }
    }
    return s + '</svg>';
  }

  const api = { MM, TYPES, PRESETS, generate, layout, buildPDF, toSVG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TemplateEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
