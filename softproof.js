/*
 * Approximate "what will this look like in CMYK ink" preview.
 * Not ICC-accurate: it mixes four ink colours (Neugebauer model with dot gain and a paper tint),
 * so bright screen colours such as fluorescent orange turn duller, the way they do in print.
 */
(function (root) {
  'use strict';

  const lin = (v) => Math.pow(v / 255, 2.2);
  const unlin = (v) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));

  // ink colours as they appear on paper, in sRGB
  const PROFILES = {
    coated: {
      label: 'Coated paper, commercial CMYK', gain: 0.06, n: 2, paper: [255, 255, 255],
      c: [0, 174, 239], m: [236, 0, 140], y: [255, 242, 0], k: [35, 31, 32],
      cm: [46, 49, 146], cy: [0, 166, 81], my: [237, 28, 36], cmy: [58, 54, 56],
    },
    uncoated: {
      label: 'Uncoated paper, commercial CMYK', gain: 0.1, n: 2, paper: [244, 241, 232],
      c: [0, 154, 214], m: [214, 40, 136], y: [247, 226, 24], k: [52, 49, 49],
      cm: [58, 62, 140], cy: [30, 148, 86], my: [222, 56, 50], cmy: [78, 74, 72],
    },
    photo: {
      label: 'Glossy or luster photo paper', gain: 0.05, n: 2, paper: [253, 252, 250],
      c: [0, 168, 232], m: [226, 8, 138], y: [252, 236, 6], k: [30, 28, 30],
      cm: [50, 50, 148], cy: [8, 158, 86], my: [230, 30, 38], cmy: [48, 44, 48],
    },
    textured: {
      label: 'Textured or matte paper', gain: 0.12, n: 2, paper: [247, 244, 236],
      c: [10, 156, 220], m: [212, 36, 136], y: [248, 228, 26], k: [46, 44, 44],
      cm: [54, 56, 142], cy: [30, 148, 86], my: [222, 52, 48], cmy: [66, 62, 62],
    },
    inkjet: {
      label: 'Home inkjet on plain paper', gain: 0.1, n: 2, paper: [246, 244, 238],
      c: [20, 160, 218], m: [208, 52, 138], y: [248, 228, 40], k: [46, 44, 44],
      cm: [56, 56, 148], cy: [40, 150, 90], my: [218, 66, 56], cmy: [74, 72, 70],
    },
  };

  function prepare(p) {
    const keys = ['paper', 'c', 'm', 'y', 'cm', 'cy', 'my', 'cmy', 'k'];
    const L = {};
    keys.forEach((k) => {
      const base = k === 'paper' ? p.paper : p[k];
      // inks sit on the paper: multiply by the paper tint so everything shifts with it
      const tint = k === 'paper' || k === 'k' ? [1, 1, 1] : p.paper.map((v) => v / 255);
      L[k] = base.map((v, i) => Math.pow(lin(v * tint[i]), 1 / p.n));
    });
    return L;
  }
  const cache = {};

  function convert(data, profileKey) {
    const p = PROFILES[profileKey];
    if (!p) return;
    const L = cache[profileKey] || (cache[profileKey] = prepare(p));
    const gain = p.gain;
    const n = p.n;
    const g = (a) => a + gain * 4 * a * (1 - a);
    for (let i = 0; i < data.length; i += 4) {
      let c = 1 - data[i] / 255;
      let m = 1 - data[i + 1] / 255;
      let y = 1 - data[i + 2] / 255;
      const kRaw = Math.min(c, m, y);
      const kk = kRaw * 0.9;
      const d = 1 - kk || 1;
      c = g((c - kk) / d); m = g((m - kk) / d); y = g((y - kk) / d);
      const k = g(kk);
      const wc = c, wm = m, wy = y;
      const nc = 1 - c, nm = 1 - m, ny = 1 - y;
      const w = {
        paper: nc * nm * ny, c: wc * nm * ny, m: nc * wm * ny, y: nc * nm * wy,
        cm: wc * wm * ny, cy: wc * nm * wy, my: nc * wm * wy, cmy: wc * wm * wy,
      };
      for (let ch = 0; ch < 3; ch++) {
        let s = 0;
        for (const key in w) s += w[key] * L[key][ch];
        s = (1 - k) * s + k * L.k[ch];
        data[i + ch] = unlin(Math.pow(Math.max(0, s), n));
      }
    }
  }

  function apply(canvas, profileKey) {
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    convert(img.data, profileKey);
    ctx.putImageData(img, 0, 0);
  }

  root.PrintProof = { PROFILES, apply, convert };
})(window);
