/*
 * Reads PNG, JPG, WebP, GIF and SVG files for Print Desk.
 * Returns PNG/JPG bytes plus the physical size in points, so "actual size" means actual size.
 */
(function (root) {
  'use strict';
  const FALLBACK_DPI = 300;
  const MAX_PX = 6000;

  const sane = (d) => (d && d >= 30 && d <= 2400 ? d : null);

  function pngDpi(buf) {
    try {
      const v = new DataView(buf);
      let p = 8;
      while (p + 12 <= buf.byteLength) {
        const len = v.getUint32(p);
        const type = String.fromCharCode(v.getUint8(p + 4), v.getUint8(p + 5), v.getUint8(p + 6), v.getUint8(p + 7));
        if (type === 'pHYs') return v.getUint8(p + 16) === 1 ? sane(v.getUint32(p + 8) * 0.0254) : null;
        if (type === 'IDAT' || type === 'IEND') break;
        p += 12 + len;
      }
    } catch (e) { /* no density */ }
    return null;
  }

  function jpgDpi(buf) {
    try {
      const v = new DataView(buf);
      if (v.getUint16(0) !== 0xFFD8) return null;
      let p = 2;
      while (p + 4 <= buf.byteLength && v.getUint8(p) === 0xFF) {
        const m = v.getUint8(p + 1);
        const len = v.getUint16(p + 2);
        if (m === 0xE0 && String.fromCharCode(v.getUint8(p + 4), v.getUint8(p + 5), v.getUint8(p + 6), v.getUint8(p + 7)) === 'JFIF') {
          const unit = v.getUint8(p + 11);
          const x = v.getUint16(p + 12);
          return unit === 1 ? sane(x) : unit === 2 ? sane(x * 2.54) : null;
        }
        if (m === 0xDA) break;
        p += 2 + len;
      }
    } catch (e) { /* no density */ }
    return null;
  }

  const cssLen = (s) => {
    if (!s) return null;
    const m = String(s).trim().match(/^([\d.]+)\s*(mm|cm|in|pt|pc|px)?$/i);
    if (!m) return null;
    const f = { mm: 72 / 25.4, cm: 72 / 2.54, in: 72, pt: 1, pc: 12, px: 0.75 }[(m[2] || 'px').toLowerCase()];
    return parseFloat(m[1]) * f;
  };

  const loadImg = (url) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image'));
    im.src = url;
  });
  const toPng = (canvas) => new Promise((r) => canvas.toBlob(r, 'image/png'));

  async function fromSvg(file) {
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const el = doc.documentElement;
    if (!el || el.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('svg');
    let w = cssLen(el.getAttribute('width'));
    let h = cssLen(el.getAttribute('height'));
    const vb = (el.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const hasVB = vb.length === 4 && vb.every((n) => !isNaN(n)) && vb[2] > 0 && vb[3] > 0;
    if (hasVB && (!w || !h)) {
      const ratio = vb[3] / vb[2];
      if (w) h = w * ratio; else if (h) w = h / ratio; else { w = vb[2] * 0.75; h = vb[3] * 0.75; }
    }
    if (!w || !h) throw new Error('svg');
    if (!hasVB) el.setAttribute('viewBox', `0 0 ${+(w / 0.75).toFixed(3)} ${+(h / 0.75).toFixed(3)}`);
    if (!el.getAttribute('xmlns')) el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    let pw = Math.round((w * FALLBACK_DPI) / 72);
    let ph = Math.round((h * FALLBACK_DPI) / 72);
    const k = Math.min(1, MAX_PX / Math.max(pw, ph));
    pw = Math.max(1, Math.round(pw * k)); ph = Math.max(1, Math.round(ph * k));
    el.setAttribute('width', pw);
    el.setAttribute('height', ph);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(el)], { type: 'image/svg+xml' }));
    try {
      const im = await loadImg(url);
      const c = document.createElement('canvas');
      c.width = pw; c.height = ph;
      c.getContext('2d').drawImage(im, 0, 0, pw, ph);
      const bytes = await (await toPng(c)).arrayBuffer();
      return { mime: 'image/png', bytes, sizePt: [w, h] };
    } finally { URL.revokeObjectURL(url); }
  }

  async function readImage(file) {
    let out;
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      out = await fromSvg(file);
    } else if (file.type === 'image/png' || file.type === 'image/jpeg') {
      const bytes = await file.arrayBuffer();
      const bmp = await createImageBitmap(file);
      const dpi = (file.type === 'image/png' ? pngDpi(bytes) : jpgDpi(bytes)) || FALLBACK_DPI;
      out = { mime: file.type, bytes, sizePt: [(bmp.width * 72) / dpi, (bmp.height * 72) / dpi] };
    } else if (/^image\//.test(file.type)) {
      const bmp = await createImageBitmap(file);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      out = { mime: 'image/png', bytes: await (await toPng(c)).arrayBuffer(), sizePt: [(bmp.width * 72) / FALLBACK_DPI, (bmp.height * 72) / FALLBACK_DPI] };
    } else {
      throw new Error('type');
    }
    out.aspect = out.sizePt[0] / out.sizePt[1];
    out.thumb = URL.createObjectURL(new Blob([out.bytes], { type: out.mime }));
    return out;
  }

  root.PrintImages = { readImage };
})(window);
