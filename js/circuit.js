"use strict";
// Floor 666 site: the living circuit that frames the page.
// Everything is drawn in "art pixels" (1 art px = P CSS px) and upscaled with image-rendering: pixelated.
// Layers, bottom to top: wall · traces (slow parallax) · back electricity + glow · page · frame · front electricity
// + glow · nav. Wires are resampled every art px, so an index along a wire is also a distance. Electricity is a set of
// pulses running along those indices and leaving a fading charge behind; the cursor feeds pulses into nearby wires.

(function () {
  const F = (window.F666 = window.F666 || {});

  // Tuning. Distances in CSS px, speeds in CSS px/s, times in seconds.
  const T = {
    reach: 190,           // wires start to electrify when the cursor is this close
    arcReach: 90,         // arcs jump towards the cursor inside this distance
    parallax: 0.3,        // trace layer speed relative to the page scroll
    pulseSpeed: [260, 950],
    ambient: [0.12, 0.5], // pause between idle pulses
    surge: [3, 8],        // pause between big pulses that run around the frame
    bandH: 150,           // traces are generated in bands of this height (art px): a longer page never reshuffles them
  };

  // ---------- helpers ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rnd = Math.random; // swapped for a seeded generator while drawing, so layouts are stable
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (list) => list[Math.floor(rnd() * list.length)];

  // ImageData is RGBA in memory, i.e. 0xAABBGGRR read as a little-endian uint32.
  function rgba(hex, a = 1) {
    const n = parseInt(hex.slice(1), 16);
    return ((Math.round(a * 255) << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >>> 16)) >>> 0;
  }
  const C = {
    void: rgba("#07050d"), dark: rgba("#0e0a19"), base: rgba("#161127"), mid: rgba("#211a38"), light: rgba("#2f2650"),
    hi: rgba("#433770"), hi2: rgba("#5d4e94"), steel: rgba("#29345a"), steelHi: rgba("#3f5283"),
    ledOff: rgba("#3a1020"), tubeOut: rgba("#0a0614"), tubeBody: rgba("#2b1442"), tubeIn: rgba("#3b1a56"),
    tubeHi: rgba("#6b3e8e"), crack: rgba("#7c2a6c"), wireA: rgba("#3d2c60"), wireB: rgba("#2b3e66"),
    hazard: rgba("#5c1527"), hazardBg: rgba("#170c19"),
    wall: rgba("#1d1631"), wallSeam: rgba("#150f26"), wallHi: rgba("#251d3e"), wallCrack: rgba("#110c1f"), wallDot: rgba("#221a39"),
    trace: rgba("#2d2449"), pad: rgba("#3a2f61"), padHole: rgba("#130e23"), chip: rgba("#17112b"), chipHi: rgba("#2a2147"),
    shade1: rgba("#000000", 0.45), shade2: rgba("#000000", 0.2),
  };

  // Electricity palette, darkest to brightest. Index = 1 + level * 2 + ramp (0 = electric, 1 = sparks); when two
  // effects land on the same pixel the higher index wins.
  const ELEC = [["#5a1450", 0.35], ["#7c1a5c", 0.5], ["#a21d5e", 0.65], ["#cf2457", 0.8],
    ["#f0304f", 0.92], ["#ff5a5f", 1], ["#ff9a86", 1], ["#fff1ea", 1]];
  const SPARK = [["#6a1e2a", 0.4], ["#9a2a22", 0.55], ["#d0451e", 0.7], ["#f07020", 0.85],
    ["#ffa030", 1], ["#ffc850", 1], ["#ffe490", 1], ["#fffbe0", 1]];
  const PAL = new Uint32Array(17);
  ELEC.forEach(([c, a], l) => (PAL[1 + l * 2] = rgba(c, a)));
  SPARK.forEach(([c, a], l) => (PAL[2 + l * 2] = rgba(c, a)));
  const ci = (v, ramp = 0) => (v < 0.05 ? 0 : 1 + Math.min(7, Math.floor(v * 8)) * 2 + ramp);

  // ---------- pixel buffers ----------
  class Raster {
    constructor(w, h) {
      this.w = w; this.h = h; this.flip = false;
      this.img = new ImageData(w, h);
      this.buf = new Uint32Array(this.img.data.buffer);
    }
    px(x, y, c) {
      x = Math.round(x); y = Math.round(y);
      if (this.flip) x = this.w - 1 - x;
      if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.buf[y * this.w + x] = c;
    }
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
    hl(x0, x1, y, c) { for (let x = x0; x <= x1; x++) this.px(x, y, c); }
    vl(x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.px(x, y, c); }
    disc(cx, cy, r, c) {
      const rr = r * r + r * 0.8;
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
        for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++)
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rr) this.px(x, y, c);
    }
  }

  // Animated layer: only the pixels touched this frame are cleared next frame, and only the dirty box is uploaded.
  class Dyn {
    constructor(canvas, w, h) {
      canvas.width = w; canvas.height = h;
      this.ctx = canvas.getContext("2d");
      this.w = w; this.h = h;
      this.img = this.ctx.createImageData(w, h);
      this.buf = new Uint32Array(this.img.data.buffer);
      this.pri = new Uint8Array(w * h);
      this.list = new Int32Array(w * h);
      this.n = 0;
      this.box = [w, h, -1, -1];
      this.prev = this.box;
      this.dirty = false;
    }
    begin() {
      for (let k = 0; k < this.n; k++) { const i = this.list[k]; this.pri[i] = 0; this.buf[i] = 0; }
      this.n = 0;
      this.prev = this.box;
      this.box = [this.w, this.h, -1, -1];
    }
    plot(x, y, c) {
      if (!c) return;
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = y * this.w + x;
      if (!this.pri[i]) {
        this.list[this.n++] = i;
        const b = this.box;
        if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
      }
      if (c > this.pri[i]) { this.pri[i] = c; this.buf[i] = PAL[c]; }
    }
    line(x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (let guard = 0; guard < 2000; guard++) {
        this.plot(x0, y0, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    end() {
      const a = this.box, b = this.prev;
      const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[2], b[2]), y1 = Math.max(a[3], b[3]);
      this.dirty = x1 >= x0;
      if (this.dirty) this.ctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }
  }

  // Cheap bloom: shrink the layer twice (the browser averages the pixels) and let CSS stretch it back smoothly.
  class Glow {
    constructor(src, canvas) {
      this.src = src; this.el = canvas;
      const mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
      this.half = mk(Math.ceil(W / 2), Math.ceil(H / 2));
      this.small = mk(Math.ceil(W / 8), Math.ceil(H / 8));
      canvas.width = Math.max(1, Math.ceil(W / 4)); canvas.height = Math.max(1, Math.ceil(H / 4));
      this.hc = this.half.getContext("2d"); this.gc = canvas.getContext("2d"); this.sc = this.small.getContext("2d");
      for (const c of [this.hc, this.gc, this.sc]) { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high"; }
    }
    render() {
      const { hc, gc, sc, half, small, el } = this;
      hc.clearRect(0, 0, half.width, half.height);
      hc.drawImage(this.src, 0, 0, half.width, half.height);
      gc.globalCompositeOperation = "source-over";
      gc.clearRect(0, 0, el.width, el.height);
      gc.drawImage(half, 0, 0, el.width, el.height);
      sc.clearRect(0, 0, small.width, small.height);
      sc.drawImage(el, 0, 0, small.width, small.height);
      gc.globalCompositeOperation = "lighter";
      gc.drawImage(small, 0, 0, el.width, el.height);
      gc.drawImage(half, 0, 0, el.width, el.height);
    }
  }

  // ---------- paths ----------
  // Waypoints → polyline with rounded corners.
  function roundPath(pts, r) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
      const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by), rr = Math.min(r, l1 / 2, l2 / 2);
      const p1 = [bx + ((ax - bx) / l1) * rr, by + ((ay - by) / l1) * rr], p2 = [bx + ((cx - bx) / l2) * rr, by + ((cy - by) / l2) * rr];
      const n = Math.max(2, Math.ceil(rr * 1.5));
      for (let k = 0; k <= n; k++) {
        const t = k / n, u = 1 - t;
        out.push([u * u * p1[0] + 2 * u * t * bx + t * t * p2[0], u * u * p1[1] + 2 * u * t * by + t * t * p2[1]]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  // Polyline → flat [x0, y0, x1, y1, …] with one point per art px.
  function resample(poly) {
    const out = [poly[0][0], poly[0][1]];
    let need = 1;
    for (let i = 1; i < poly.length; i++) {
      const ax = poly[i - 1][0], ay = poly[i - 1][1], dx = poly[i][0] - ax, dy = poly[i][1] - ay, len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      let pos = need;
      for (; pos <= len + 1e-6; pos += 1) out.push(ax + (dx * pos) / len, ay + (dy * pos) / len);
      need = pos - len;
    }
    return Float32Array.from(out);
  }
  function normals(p) {
    const n = p.length >> 1, out = new Float32Array(p.length);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const tx = p[2 * b] - p[2 * a], ty = p[2 * b + 1] - p[2 * a + 1], l = Math.hypot(tx, ty) || 1;
      out[2 * i] = -ty / l; out[2 * i + 1] = tx / l;
    }
    return out;
  }
  function makeWire(kind, layer, pts, o = {}) {
    const n = pts.length >> 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = pts[2 * i], y = pts[2 * i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return {
      kind, layer, pts, n, nrm: kind === "tube" ? normals(pts) : null, r: o.r || 0, color: o.color || 0, pads: o.pads || null,
      bbox: [x0, y0, x1, y1], charge: new Float32Array(n), mask: null, hot: false,
      e: 0, ic: 0, d: Infinity, acc: 0, sacc: 0, active: 0, arcT: 0, arc: null, arcI: 0, on: [null, null],
    };
  }

  // ---------- state ----------
  let P = 3, W = 0, H = 0, S = 14, TB = 15, BB = 12, reach = 60, arcR = 30, off = 0, reduce = false;
  let traces = null, wires = [], bands = [], backWires = [], leds = [], cores = [], hazard = null;
  let front = null, back = null, frontGlow = null, backGlow = null;
  const pulses = [], sparks = [], flashes = [], visibleBack = [], arcWires = [];
  const ptr = { x: -1e4, y: -1e4, on: false };
  const els = {};
  let clock = 0, last = 0, amb = 0, surge = 4, frameNo = 0;

  function measure() {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, dpr = window.devicePixelRatio || 1;
    const target = clamp(Math.round(vw / 640), 2, 6);
    P = Math.max(1, Math.round(target * dpr)) / dpr; // whole device pixels per art pixel keeps the upscale crisp
    W = Math.ceil(vw / P); H = Math.ceil(vh / P);
    S = Math.round(clamp(Math.min(vw * 0.03, vh * 0.05), 14, 60) / P);
    TB = Math.round(clamp(Math.min(vh * 0.05, vw * 0.08), 26, 60) / P);
    BB = Math.round(clamp(Math.min(vh * 0.04, vw * 0.06), 20, 48) / P);
    reach = T.reach / P; arcR = T.arcReach / P;
  }

  // ---------- wall ----------
  function buildWall() {
    const r = new Raster(W, H);
    r.buf.fill(C.wall);
    rnd = mulberry32(W * 31 + H * 7);
    const bw = W > 360 ? 52 : 34, bh = W > 360 ? 30 : 22;
    for (let row = 0, y = -ri(0, bh); y < H; row++, y += bh) {
      r.hl(0, W - 1, y, C.wallSeam); r.hl(0, W - 1, y + 1, C.wallHi);
      for (let x = (row % 2) * (bw >> 1) - bw + ri(-3, 3); x < W; x += bw + ri(-4, 4)) {
        r.vl(x, y, y + bh - 1, C.wallSeam); r.vl(x + 1, y + 2, y + bh - 1, C.wallHi);
        r.hl(x - 2, x + 2, y, C.wallCrack); r.vl(x, y - 2, y + 2, C.wallCrack);
      }
    }
    const crack = (x, y, n) => {
      let dx = rnd() < 0.5 ? -1 : 1, dy = rnd() < 0.5 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        r.px(x, y, C.wallCrack);
        if (rnd() < 0.5) x += dx; else y += dy;
        if (rnd() < 0.12) dx = -dx;
        if (rnd() < 0.08 && n > 8) crack(x, y, n >> 1);
      }
    };
    for (let k = Math.round((W * H) / 7000); k > 0; k--) crack(ri(0, W - 1), ri(0, H - 1), ri(5, 22));
    for (let k = Math.round(W * H * 0.015); k > 0; k--) r.px(ri(0, W - 1), ri(0, H - 1), rnd() < 0.5 ? C.wallDot : C.wallSeam);
    // vignette
    const b = r.buf, hw = W / 2, hh = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - hw) / hw, dy = (y - hh) / hh, d = Math.sqrt(dx * dx * 0.8 + dy * dy * 0.9);
      const t = clamp((d - 0.35) / 0.9, 0, 1), k = 1 - 0.42 * t * t * (3 - 2 * t);
      if (k > 0.999) continue;
      const i = y * W + x, c = b[i];
      b[i] = (0xff000000 | ((((c >>> 16) & 0xff) * k) << 16) | ((((c >>> 8) & 0xff) * k) << 8) | ((c & 0xff) * k)) >>> 0;
    }
    return r;
  }

  // ---------- frame ----------
  const TOP_KINDS = ["vent", "plate", "leds", "vent", "screen", "bolts"];
  const SIDE_KINDS = ["vvent", "plate", "vleds", "bolts", "vvent"];

  function buildFrame(nav) {
    const r = new Raster(W, H);
    const fw = [];
    leds = []; cores = []; hazard = null;
    const RW = S >= 11 ? 4 : 2, RT = TB >= 12 ? 4 : 2, RB = BB >= 12 ? 4 : 2, tr = S >= 13 ? 2 : 1;
    const CW = S + Math.max(6, Math.round(S * 0.6)), CH = TB + Math.max(8, Math.round(TB * 0.7)), CHb = BB + Math.max(8, Math.round(BB * 0.7));
    const halfW = Math.ceil(W / 2);
    const txS = S - RW - 2 - tr, tyT = TB - RT - tr - 2, tyB = H - BB + RB + tr + 1;
    const rc = clamp(Math.round(S * 0.7), 4, 10), cx = S - 2, cy = Math.round(H / 2);
    const hdy = Math.floor(Math.sqrt(Math.max(0, (rc + 3) ** 2 - (txS - cx) ** 2)));
    let hx0 = Math.floor(W / 2) - 20, hx1 = W - 1 - hx0, hy1 = TB + 2;
    if (nav && nav.width) { hx0 = Math.floor(nav.left / P) - 3; hx1 = Math.ceil(nav.right / P) + 2; hy1 = Math.ceil(nav.bottom / P) + 2; }
    const vw = clamp(Math.round(W * 0.14), 24, 70), vx0 = Math.round(W / 2 - vw / 2), vx1 = vx0 + vw - 1;

    const fx = (x) => (r.flip ? W - 1 - Math.round(x) : Math.round(x));
    const led = (x, y) => {
      r.px(x, y, C.ledOff);
      const per = 0.6 + Math.random() * 2.6;
      leds.push({ x: fx(x), y: Math.round(y), per, ph: Math.random() * per, duty: 0.1 + Math.random() * 0.5, lvl: 0.55 + Math.random() * 0.35, seed: Math.random() * 1000 });
    };
    const addWire = (kind, pts, o) => {
      if (r.flip) { pts = Float32Array.from(pts); for (let i = 0; i < pts.length; i += 2) pts[i] = W - 1 - pts[i]; }
      const w = makeWire(kind, 1, pts, o);
      fw.push(w);
      return w;
    };
    function panel(x, y, w, h, kind) {
      if (w < 4 || h < 4) return;
      r.rect(x, y, w, h, C.mid);
      r.hl(x, x + w - 1, y, C.light); r.vl(x, y, y + h - 1, C.light);
      r.hl(x, x + w - 1, y + h - 1, C.void); r.vl(x + w - 1, y, y + h - 1, C.void);
      r.px(x + w - 1, y, C.base); r.px(x, y + h - 1, C.base);
      const ix = x + 2, iy = y + 2, iw = w - 4, ih = h - 4;
      if (!kind || iw < 2 || ih < 2) return;
      if (kind === "vent") for (let j = 0; j < ih; j += 2) r.hl(ix, ix + iw - 1, iy + j, C.void);
      else if (kind === "vvent") for (let i = 0; i < iw; i += 2) r.vl(ix + i, iy, iy + ih - 1, C.void);
      else if (kind === "plate") {
        r.rect(ix, iy, iw, ih, C.light);
        for (let j = 1; j < ih - 1; j += 2) for (let i = 1; i < iw - 1; i++) if (rnd() < 0.5) r.px(ix + i, iy + j, C.base);
      } else if (kind === "leds") {
        const yy = iy + (ih >> 1);
        r.hl(ix, ix + iw - 1, yy, C.void);
        for (let i = 1; i < iw - 1; i += 2) led(ix + i, yy);
      } else if (kind === "vleds") {
        const xx = ix + (iw >> 1);
        r.vl(xx, iy, iy + ih - 1, C.void);
        for (let j = 1; j < ih - 1; j += 2) led(xx, iy + j);
      } else if (kind === "screen") {
        r.rect(ix, iy, iw, ih, C.void);
        for (let i = 1; i < iw - 1; i++) r.px(ix + i, iy + 1 + Math.floor(rnd() * Math.max(1, ih - 2)), C.steel);
      } else if (kind === "bolts") {
        r.px(ix, iy, C.hi2); r.px(ix + iw - 1, iy, C.hi2); r.px(ix, iy + ih - 1, C.hi2); r.px(ix + iw - 1, iy + ih - 1, C.hi2);
      }
    }
    function block(x, y, w, h) {
      panel(x, y, w, h, null);
      r.rect(x + 3, y + 3, w - 6, h - 6, C.base);
      r.hl(x + 3, x + w - 4, y + 3, C.void); r.vl(x + 3, y + 3, y + h - 4, C.void);
      const vEnd = x + 4 + Math.floor((w - 8) * 0.5);
      for (let j = y + 5; j <= y + h - 5; j += 2) r.hl(x + 5, vEnd, j, C.void);
      for (let j = y + 5; j <= y + h - 6; j += 3) led(x + w - 6, j);
      if (w >= 20 && h >= 20) { // gauge window and a steel band
        const gx = vEnd + 2, gw = x + w - 8 - gx;
        if (gw >= 3) { r.rect(gx, y + 5, gw, 5, C.void); r.hl(gx + 1, gx + gw - 2, y + 7, C.steel); }
        r.rect(x + 3, y + h - 8, w - 6, 2, C.steel); r.hl(x + 3, x + w - 4, y + h - 8, C.steelHi);
      }
      r.px(x + 1, y + 1, C.hi2); r.px(x + w - 2, y + 1, C.hi2); r.px(x + 1, y + h - 2, C.hi2); r.px(x + w - 2, y + h - 2, C.hi2);
    }
    // A glass tube with a dormant crack of electricity inside it.
    function tube(way, round = 0) {
      const pts = resample(round ? roundPath(way, round) : way), n = pts.length >> 1;
      if (n < 5) return null;
      const nrm = normals(pts);
      for (let i = 0; i < n; i++) r.disc(pts[2 * i], pts[2 * i + 1], tr + 1, C.tubeOut);
      for (let i = 0; i < n; i++) r.disc(pts[2 * i], pts[2 * i + 1], tr, C.tubeBody);
      if (tr >= 2) for (let i = 0; i < n; i++) r.disc(pts[2 * i], pts[2 * i + 1], tr - 1, C.tubeIn);
      for (let i = 0; i < n; i++) {
        let nx = nrm[2 * i], ny = nrm[2 * i + 1];
        if (nx + ny > 0) { nx = -nx; ny = -ny; }
        r.px(pts[2 * i] + nx * (tr - 0.4), pts[2 * i + 1] + ny * (tr - 0.4), C.tubeHi);
      }
      if (tr >= 2) {
        let o = 0, on = false;
        for (let i = 0; i < n; i++) {
          if (rnd() < 0.08) on = !on;
          if (rnd() < 0.35) o = clamp(o + (rnd() < 0.5 ? -1 : 1), -(tr - 1), tr - 1);
          if (on) r.px(pts[2 * i] + nrm[2 * i] * o, pts[2 * i + 1] + nrm[2 * i + 1] * o, C.crack);
        }
      }
      const w = addWire("tube", pts, { r: tr });
      w.static = { pts, nrm }; // unflipped copy, used to draw clamps on this side
      return w;
    }
    function clamps(w, every) {
      if (!w) return;
      const { pts, nrm } = w.static, n = pts.length >> 1;
      for (let i = 8; i < n - 8; i += every)
        for (let o = -(tr + 1); o <= tr + 1; o++) {
          r.px(pts[2 * i] + nrm[2 * i] * o, pts[2 * i + 1] + nrm[2 * i + 1] * o, C.steelHi);
          r.px(pts[2 * i + 2] + nrm[2 * i + 2] * o, pts[2 * i + 3] + nrm[2 * i + 3] * o, C.steel);
        }
    }
    function wireLine(way, color) {
      const pts = resample(way);
      if (pts.length < 10) return null;
      for (let i = 0; i < pts.length; i += 2) r.px(pts[i], pts[i + 1], color);
      return addWire("wire", pts, { color });
    }
    const collarV = (x, y) => { r.rect(x - 1, y - tr - 2, 3, 2 * tr + 5, C.steel); r.hl(x - 1, x + 1, y - tr - 2, C.steelHi); };
    const collarH = (x, y) => { r.rect(x - tr - 2, y - 1, 2 * tr + 5, 3, C.steel); r.vl(x - tr - 2, y - 1, y + 1, C.steelHi); };
    function core() {
      r.disc(cx, cy, rc + 3, C.void);
      r.disc(cx, cy, rc + 2, C.mid);
      for (let dy = -rc - 3; dy <= rc + 3; dy++) for (let dx = -rc - 3; dx <= rc + 3; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > rc + 0.5 && d <= rc + 2.3) r.px(cx + dx, cy + dy, dx + dy < -2 ? C.light : dx + dy > 2 ? C.base : C.mid);
      }
      r.disc(cx, cy, rc, C.void);
      r.disc(cx, cy, rc - 1, C.steel);
      r.disc(cx, cy, rc - 2, C.dark);
      r.hl(cx - rc + 3, cx + rc - 3, cy, C.mid); r.vl(cx, cy - rc + 3, cy + rc - 3, C.mid);
      r.disc(cx, cy, 2, C.void); r.disc(cx, cy, 1, C.ledOff);
      const n = rc >= 7 ? 12 : 8, ring = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 - Math.PI / 2, x = Math.round(cx + Math.cos(a) * (rc - 1)), y = Math.round(cy + Math.sin(a) * (rc - 1));
        r.px(x, y, C.ledOff);
        ring.push(fx(x), y);
      }
      const c = { x: fx(cx), y: cy, ring, e: 0, kick: 0, ph: Math.random() * n, dir: r.flip ? -1 : 1 };
      cores.push(c);
      return c;
    }

    // Left half; the right half is the same drawing mirrored.
    function half(flip) {
      r.flip = flip;
      rnd = mulberry32(0x6660 + W * 3 + H);
      r.rect(0, 0, halfW, TB, C.dark); r.rect(0, H - BB, halfW, BB, C.dark); r.rect(0, 0, S, H, C.dark);
      // background panels, partly hidden behind tubes and wires
      for (let x = CW + 1; x < hx0 - 5;) {
        const w = Math.min(ri(9, 24), hx0 - 2 - x); if (w < 5) break;
        panel(x, 0, w, TB - RT, pick(TOP_KINDS)); x += w + ri(1, 2);
      }
      for (let y = CH + 1; y < H - CHb - 5;) {
        const h = Math.min(ri(10, 26), H - CHb - 2 - y); if (h < 5) break;
        panel(0, y, S - RW, h, pick(SIDE_KINDS)); y += h + ri(1, 2);
      }
      for (let x = CW + 1; x < vx0 - 5;) {
        const w = Math.min(ri(9, 24), vx0 - 2 - x); if (w < 5) break;
        panel(x, H - BB + RB, w, BB - RB, pick(TOP_KINDS)); x += w + ri(1, 2);
      }
      // bundles of thin exposed wires
      wireLine([[CW - 2, 2], [hx0 + 2, 2]], C.wireA);
      if (tyT - tr - 1 >= 6) wireLine([[CW - 2, 4], [hx0 + 2, 4]], C.wireB);
      wireLine([[CW - 2, H - 2], [vx0 + 2, H - 2]], C.wireA);
      const gapAt = (x) => Math.ceil(Math.sqrt(Math.max(0, (rc + 3) ** 2 - (x - cx) ** 2))) + 1;
      for (const [x, color, minS] of [[2, C.wireA, 12], [4, C.wireB, 16]]) {
        if (S < minS) continue;
        wireLine([[x, CH - 2], [x, cy - gapAt(x)]], color);
        wireLine([[x, cy + gapAt(x)], [x, H - CHb + 1]], color);
      }
      // glass tubes
      const top = tube([[CW - 3, tyT], [hx0 + 3, tyT]]);
      const sideA = tube([[txS, CH - 3], [txS, cy - hdy + 2]]);
      const sideB = tube([[txS, cy + hdy - 2], [txS, H - CHb + 2]]);
      const bottom = tube([[CW - 3, tyB], [vx0 + 3, tyB]]);
      // rails
      const railRows = (n) => (n === 4 ? [C.hi, C.light, C.mid, C.void] : [C.light, C.void]);
      railRows(RT).forEach((c, k) => r.hl(0, halfW - 1, TB - RT + k, c));
      railRows(RB).forEach((c, k) => r.hl(0, halfW - 1, H - BB + k, c));
      for (let x = 6; x < halfW; x += 12) { r.px(x, TB - RT + 1, C.hi2); r.px(x, H - BB + 1, C.hi2); }
      railRows(RW).forEach((c, k) => r.vl(S - RW + k, 0, H - 1, c));
      for (let y = 6; y < H; y += 12) r.px(S - RW + 1, y, C.hi2);
      // cables hanging out of the corners
      const lx = CW + 5;
      const loopT = tube([[lx, TB - RT - 1], [lx, CH + 4], [txS + 1, CH + 4]], 5);
      const loopB = tube([[lx, H - BB + RB], [lx, H - CHb - 4], [txS + 1, H - CHb - 4]], 5);
      block(0, 0, CW, CH);
      block(0, H - CHb, CW, CHb);
      [top, sideA, sideB, bottom, loopT, loopB].forEach((w) => clamps(w, 26));
      // junction boxes the electricity disappears into
      const tl = hx0 - CW, bl = vx0 - CW;
      if (tl > 44) panel(CW + Math.round(tl * 0.3), 0, ri(9, 13), TB - RT, "leds");
      if (tl > 110) panel(CW + Math.round(tl * 0.82), 0, ri(9, 13), TB - RT, "vent");
      if (bl > 50) panel(CW + Math.round(bl * 0.55), H - BB + RB, ri(9, 13), BB - RB, "vent");
      const sl = cy - hdy - CH;
      if (sl > 40) {
        const h = ri(9, 12);
        panel(1, CH + Math.round(sl * 0.6), S - RW - 1, h, "vleds");
        panel(1, cy + hdy + Math.round(sl * 0.4) - h, S - RW - 1, h, "vvent");
      }
      // a cable sagging under the top bar, and boxes bolted onto the inside of the frame
      if (S >= 12 && tl > 70) {
        const pw = clamp(Math.round(tl * 0.12), 14, 28), px0 = CW + Math.round(tl * 0.56) - (pw >> 1), ph = Math.max(5, Math.round(TB * 0.35));
        const a = lx + 6, b = px0 + 1, depth = clamp(Math.round((b - a) * 0.08), 3, 9);
        if (b - a > 16) {
          const way = [];
          for (let k = 0; k <= 24; k++) { const t = k / 24; way.push([lerp(a, b, t), TB + depth * 4 * t * (1 - t)]); }
          wireLine(way, C.wireB);
        }
        panel(px0, TB - 1, pw, ph + 1, "leds");
      }
      if (S >= 12) {
        const pw = Math.max(4, Math.round(S * 0.3)), ph = clamp(Math.round(H * 0.06), 12, 26);
        const ya = Math.round(lerp(CH + 12, cy - rc - 4, 0.45) - ph / 2), yb = Math.round(lerp(cy + rc + 4, H - CHb - 8, 0.55) - ph / 2);
        for (const y of [ya, yb]) if (y > CH + 8 && y + ph < H - CHb - 4) panel(S - 2, y, pw + 2, ph, "vleds");
      }
      // collars where tubes meet blocks and each other
      if (top) collarV(CW, tyT);
      if (bottom) collarV(CW, tyB);
      if (sideA) { collarH(txS, CH); collarH(txS, cy - hdy - 1); }
      if (sideB) { collarH(txS, cy + hdy + 1); collarH(txS, H - CHb - 1); }
      if (loopT) { collarH(lx, TB); r.rect(txS - tr - 2, CH + 4 - tr - 2, 2 * tr + 5, 2 * tr + 5, C.steel); r.hl(txS - tr - 2, txS + tr + 2, CH + 2 - tr, C.steelHi); }
      if (loopB) { collarH(lx, H - BB - 1); r.rect(txS - tr - 2, H - CHb - 4 - tr - 2, 2 * tr + 5, 2 * tr + 5, C.steel); r.hl(txS - tr - 2, txS + tr + 2, H - CHb - 6 - tr, C.steelHi); }
      const c = core();
      // where pulses go when they reach the end of a tube
      const pass = (to, atEnd) => (p) => {
        const I = p.I * 0.82;
        if (to && I > 0.15) spawnPulse(to, atEnd ? to.n - 1 : 0, atEnd ? -1 : 1, I, p.v, p.tail);
      };
      const kick = (p) => (c.kick = Math.min(1.5, c.kick + p.I));
      if (top) top.on = [pass(sideA, false), (p) => navPulse(top, p)];
      if (sideA) sideA.on = [pass(top, false), (p) => { kick(p); pass(sideB, false)(p); }];
      if (sideB) sideB.on = [(p) => { kick(p); pass(sideA, true)(p); }, pass(bottom, false)];
      if (bottom) bottom.on = [pass(sideB, true), (p) => { if (hazard) hazard.kick = Math.min(1, hazard.kick + p.I * 0.8); }];
    }
    // Housing that holds the navigation bar.
    function housing() {
      const x0 = hx0, x1 = hx1, y1 = Math.max(hy1, TB);
      r.rect(x0 - 1, 0, x1 - x0 + 3, y1 + 2, C.void);
      r.rect(x0, 0, x1 - x0 + 1, y1 + 1, C.mid);
      r.vl(x0, 0, y1, C.light); r.vl(x1, 0, y1, C.base); r.hl(x0, x1, y1, C.base);
      r.rect(x0 + 2, 0, x1 - x0 - 3, y1 - 2, C.void);
      for (let x = x0 + 5; x < x1 - 3; x += 9) r.px(x, y1 - 1, C.hi2);
      for (const sx of [x0 - 1, x1 + 1]) {
        r.rect(sx - 1, tyT - tr - 2, 3, 2 * tr + 5, C.steel);
        r.hl(sx - 1, sx + 1, tyT - tr - 2, C.steelHi);
        led(sx, tyT);
      }
    }
    // Vent with hazard stripes in the middle of the bottom bar.
    function vent() {
      const y0 = H - BB - 3;
      panel(vx0, y0, vw, BB + 3, null);
      const sx0 = vx0 + 3, sx1 = vx1 - 3, sy0 = y0 + 3, sy1 = H - 3, px = [];
      r.rect(sx0 - 1, sy0 - 1, sx1 - sx0 + 3, sy1 - sy0 + 3, C.void);
      for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
        if ((((x - y) % 6) + 6) % 6 < 3) { r.px(x, y, C.hazard); px.push(x, y); } else r.px(x, y, C.hazardBg);
      }
      r.px(vx0 + 1, y0 + 1, C.hi2); r.px(vx1 - 1, y0 + 1, C.hi2);
      for (const sx of [vx0 - 1, vx1 + 1]) collarV(sx, tyB);
      hazard = { px: Int16Array.from(px), x: (vx0 + vx1) / 2, y: H - BB / 2, e: 0, kick: 0 };
    }

    half(false);
    half(true);
    r.flip = false;
    rnd = mulberry32(0x777 + W);
    housing();
    vent();
    const b = r.buf;
    for (let i = 0; i < b.length; i++) {
      if (b[i] === C.mid && rnd() < 0.012) b[i] = C.light;
      else if (b[i] === C.light && rnd() < 0.015) b[i] = C.steelHi;
    }
    // Electricity is only drawn where its wire is actually visible (not under a clamp, box or housing).
    for (const w of fw) {
      w.mask = new Uint8Array(w.n);
      for (let i = 0; i < w.n; i++) {
        const x = Math.round(w.pts[2 * i]), y = Math.round(w.pts[2 * i + 1]);
        const c = x >= 0 && y >= 0 && x < W && y < H ? b[y * W + x] : 0;
        const vis = w.kind === "tube" ? c === C.tubeIn || c === C.tubeBody || c === C.crack || c === C.tubeHi : c === w.color;
        w.mask[i] = vis ? 0 : 1;
      }
    }
    // Soft shadow the frame casts on the page.
    const solid = new Uint8Array(W * H);
    for (let i = 0; i < b.length; i++) solid[i] = b[i] >>> 24 === 255 ? 1 : 0;
    const ring1 = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!solid[i] && ((x > 0 && solid[i - 1]) || (x < W - 1 && solid[i + 1]) || (y > 0 && solid[i - W]))) { b[i] = C.shade1; ring1[i] = 1; }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!solid[i] && !ring1[i] && ((x > 0 && ring1[i - 1]) || (x < W - 1 && ring1[i + 1]) || (y > 0 && ring1[i - W]))) b[i] = C.shade2;
    }
    wires = fw;
    return r;
  }

  // ---------- traces ----------
  // Printed-circuit traces on a 3 px grid: buses leave the frame on both sides, bend at 45°, end on pads or chips.
  function genBand(b) {
    rnd = mulberry32(((b + 1) * 2654435761) ^ (W * 40503) ^ 0x666);
    const G = 3, BH = T.bandH, y0 = b * BH, cols = Math.floor((W - 1) / G), rows = Math.floor(BH / G);
    const OW = cols * 2 + 1, OH = rows * 2 + 1, occ = new Uint8Array(OW * OH), R = traces, list = [];
    const free = (x2, y2) => x2 >= 0 && y2 >= 0 && x2 < OW && y2 < OH && !occ[y2 * OW + x2];
    const take = (x2, y2) => { if (x2 >= 0 && y2 >= 0 && x2 < OW && y2 < OH) occ[y2 * OW + x2] = 1; };
    const edge = Math.ceil(S / G) + 1, maxReach = Math.floor((W * 0.44) / G);

    function walk(gx, gy, dir, plan, reachCells) {
      const cells = [gx, gy];
      if (!free(gx * 2, gy * 2)) return cells;
      let x = gx, y = gy, run = 0;
      for (const [dy, len] of plan) for (let s = 0; s < len; s++) {
        if (run >= reachCells) return cells;
        const nx = x + dir, ny = y + dy;
        if (ny < 1 || ny > rows - 1 || nx < 0 || nx > cols) return cells;
        if (!free(x + nx, y + ny) || !free(nx * 2, ny * 2)) return cells; // the step's midpoint, then its end
        cells.push(nx, ny); x = nx; y = ny; run++;
      }
      return cells;
    }
    function padRoom(cells, atStart) {
      const n = cells.length, ex = atStart ? cells[0] : cells[n - 2], ey = atStart ? cells[1] : cells[n - 1];
      const qx = atStart ? cells[2] : cells[n - 4], qy = atStart ? cells[3] : cells[n - 3];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x2 = ex * 2 + dx, y2 = ey * 2 + dy;
        if ((!dx && !dy) || (x2 === qx * 2 && y2 === qy * 2) || (x2 === ex + qx && y2 === ey + qy)) continue;
        if (!free(x2, y2)) return false;
      }
      return true;
    }
    function commit(cells, padStart, padEnd) {
      for (let i = 0; i < cells.length; i += 2) {
        take(cells[i] * 2, cells[i + 1] * 2);
        if (i >= 2) take(cells[i - 2] + cells[i], cells[i - 1] + cells[i + 1]);
      }
      let x = cells[0] * G + 1, y = y0 + cells[1] * G + 1;
      const pts = [x, y];
      for (let i = 2; i < cells.length; i += 2) {
        const sx = Math.sign(cells[i] - cells[i - 2]), sy = Math.sign(cells[i + 1] - cells[i - 1]);
        for (let k = 0; k < G; k++) { x += sx; y += sy; pts.push(x, y); }
      }
      for (let i = 0; i < pts.length; i += 2) R.px(pts[i], pts[i + 1], C.trace);
      const pad = (px, py) => { R.rect(px - 1, py - 1, 3, 3, C.pad); R.px(px, py, C.padHole); return [px, py]; };
      const pads = [padStart ? pad(pts[0], pts[1]) : null, padEnd ? pad(x, y) : null];
      list.push(makeWire("trace", 0, Float32Array.from(pts), { pads }));
    }
    function chip(x, y, w, h) {
      R.rect(x, y, w + 1, h + 1, C.chip);
      R.hl(x, x + w, y, C.chipHi); R.vl(x, y, y + h, C.chipHi);
      R.hl(x, x + w, y + h, C.void); R.vl(x + w, y, y + h, C.void);
      R.px(x + 2, y + 2, C.pad);
      for (let i = x + 1; i < x + w; i += 2) { R.px(i, y - 1, C.pad); R.px(i, y + h + 1, C.pad); }
    }

    for (let side = 0; side < 2; side++) for (let k = ri(0, 2); k > 0; k--) {
      const cw = ri(3, 6), ch = ri(2, 3);
      let gx = ri(edge + 1, edge + Math.max(2, Math.floor(maxReach * 0.5)));
      if (side) gx = cols - gx - cw;
      const gy = ri(2, rows - ch - 3);
      let ok = true;
      for (let y = (gy - 1) * 2; y <= (gy + ch + 1) * 2 && ok; y++) for (let x = (gx - 1) * 2; x <= (gx + cw + 1) * 2; x++) if (!free(x, y)) { ok = false; break; }
      if (!ok) continue;
      for (let y = (gy - 1) * 2; y <= (gy + ch + 1) * 2; y++) for (let x = (gx - 1) * 2; x <= (gx + cw + 1) * 2; x++) take(x, y);
      chip(gx * G + 1, y0 + gy * G + 1, cw * G, ch * G);
    }
    for (let side = 0; side < 2; side++) {
      const dir = side ? -1 : 1, gx0 = side ? cols : 0;
      for (let k = 0; k < 7; k++) {
        const sy = ri(1, rows - 2);
        const reachCells = edge + Math.floor((maxReach - edge) * Math.pow(rnd(), 1.5));
        const v1 = rnd() < 0.5 ? -1 : 1, v2 = rnd() < 0.5 ? v1 : -v1;
        const plan = [[0, edge - 1 + ri(0, 4)], [v1, ri(1, 5)], [0, ri(1, 10)], [v2, ri(1, 4)], [0, 60]];
        const bus = [1, 1, 1, 2, 2, 3, 4][ri(0, 6)];
        for (let j = 0; j < bus && sy + j <= rows - 1; j++) {
          const cells = walk(gx0, sy + j, dir, plan, reachCells);
          if (cells.length < (edge + 2) * 2) continue;
          commit(cells, false, rnd() < 0.75 && padRoom(cells, false));
        }
      }
    }
    for (let k = 0; k < 3; k++) {
      const gx = ri(Math.floor(cols * 0.22), Math.floor(cols * 0.78)), gy = ri(2, rows - 3);
      const plan = [[0, ri(1, 4)], [rnd() < 0.5 ? -1 : 1, ri(0, 3)], [0, ri(1, 5)]];
      const cells = walk(gx, gy, rnd() < 0.5 ? -1 : 1, plan, 99);
      if (cells.length < 8 || !padRoom(cells, false) || !padRoom(cells, true)) continue;
      commit(cells, true, true);
    }
    return list;
  }

  function ensureBands() {
    const docH = document.documentElement.scrollHeight, vh = window.innerHeight;
    const need = H + Math.ceil(((reduce ? 0 : T.parallax) * Math.max(0, docH - vh)) / P) + 8;
    const nb = Math.max(1, Math.ceil(need / T.bandH));
    if (traces && traces.w === W && nb <= bands.length) return false;
    const old = traces && traces.w === W ? traces : null;
    if (!old) bands = [];
    traces = new Raster(W, Math.max(nb, bands.length) * T.bandH);
    if (old) traces.buf.set(old.buf);
    for (let b = bands.length; b < nb; b++) bands.push(genBand(b));
    backWires = bands.flat();
    put(els.traces, traces);
    return true;
  }

  function put(canvas, r) {
    canvas.width = r.w; canvas.height = r.h;
    canvas.getContext("2d").putImageData(r.img, 0, 0);
    canvas.style.width = r.w * P + "px";
    canvas.style.height = r.h * P + "px";
  }

  function build() {
    measure();
    const navRect = els.nav ? els.nav.getBoundingClientRect() : null;
    const st = document.documentElement.style;
    st.setProperty("--frame-side", S * P + "px");
    st.setProperty("--frame-top", TB * P + "px");
    st.setProperty("--frame-bottom", BB * P + "px");
    if (navRect) st.setProperty("--hud-h", Math.max(0, Math.round(navRect.bottom + 4 * P - TB * P)) + "px");
    put(els.wall, buildWall());
    put(els.frame, buildFrame(navRect));
    if (traces && traces.w !== W) traces = null;
    ensureBands();
    for (const w of backWires) { w.active = 0; w.e = 0; w.hot = false; w.arc = null; w.charge.fill(0); }
    pulses.length = 0; sparks.length = 0; flashes.length = 0;
    front = new Dyn(els.front, W, H);
    back = new Dyn(els.back, W, H);
    frontGlow = new Glow(els.front, els["front-glow"]);
    backGlow = new Glow(els.back, els["back-glow"]);
    for (const id of ["front", "back", "front-glow", "back-glow"]) { els[id].style.width = W * P + "px"; els[id].style.height = H * P + "px"; }
    off = -1;
  }

  // ---------- simulation ----------
  function spawnPulse(w, s, dir, I, v, tail) {
    if (pulses.length > 260) return;
    pulses.push({ w, s, dir, I, v, tail, done: false });
    w.active++;
  }
  function navPulse(w, p) {
    flashes.push({ layer: 1, x: w.pts[w.pts.length - 2], y: w.pts[w.pts.length - 1], life: 0.3, max: 0.3, I: p.I });
    if (F.circuit.onNav) F.circuit.onNav(p.I);
  }
  function spark(layer, x, y, tx, ty, e) {
    if (sparks.length > 320) return;
    const a = Math.random() < 0.55 ? Math.atan2(ty - y, tx - x) + (Math.random() - 0.5) * 1.6 : -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
    const v = ((70 + Math.random() * 230) * (0.6 + 0.6 * e)) / P, life = 0.18 + Math.random() * 0.5;
    sparks.push({ layer, x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life });
  }
  function nearest(w, x, y, R) {
    const b = w.bbox;
    if (x < b[0] - R || x > b[2] + R || y < b[1] - R || y > b[3] + R) return Infinity;
    const p = w.pts, m = w.mask;
    let best = Infinity, bi = -1;
    for (let i = 0; i < w.n; i++) {
      if (m && m[i]) continue;
      const dx = p[2 * i] - x, dy = p[2 * i + 1] - y, d = dx * dx + dy * dy;
      if (d < best) { best = d; bi = i; }
    }
    if (bi >= 0) w.ic = bi;
    return Math.sqrt(best);
  }
  // The closer the cursor, the more charge, pulses and sparks the wire gets.
  function stepWire(w, dt, x, y) {
    w.d = ptr.on ? nearest(w, x, y, reach) : Infinity;
    const f = w.d < reach ? 1 - w.d / reach : 0, target = f * f;
    w.e += (target - w.e) * (1 - Math.exp(-dt * (target > w.e ? 5 : 1.6)));
    if (w.e < 0.004) { w.e = 0; return; }
    const e = w.e, i0 = w.ic, c = w.charge, spread = 2 + e * 18, top = e * 0.85;
    for (let j = -Math.floor(spread); j <= spread; j++) {
      const i = i0 + j;
      if (i < 0 || i >= w.n) continue;
      const v = top * Math.pow(1 - Math.abs(j) / (spread + 1), 1.4) * (0.7 + 0.3 * Math.random());
      if (c[i] < v) c[i] = v;
    }
    w.hot = true;
    for (w.acc += dt * 22 * Math.pow(e, 1.6); w.acc >= 1; w.acc--) {
      if (w.active >= 3 + e * 8) continue;
      spawnPulse(w, clamp(i0 + Math.round(Math.random() * 4 - 2), 0, w.n - 1), Math.random() < 0.5 ? 1 : -1,
        0.45 + 0.55 * e * (0.7 + 0.3 * Math.random()),
        lerp(T.pulseSpeed[0], T.pulseSpeed[1], Math.random() * (0.4 + 0.6 * e)) / P,
        ((14 + 50 * e) * (0.7 + 0.6 * Math.random())) / P);
    }
    if (e > 0.35) for (w.sacc += dt * 45 * (e - 0.35); w.sacc >= 1; w.sacc--) spark(w.layer, w.pts[2 * i0], w.pts[2 * i0 + 1], x, y, e);
  }
  function stepPulses(dt) {
    for (let k = pulses.length - 1; k >= 0; k--) {
      const p = pulses[k], w = p.w, s0 = p.s;
      p.s += p.dir * p.v * dt;
      const a = clamp(Math.round(Math.min(s0, p.s)), 0, w.n - 1), b = clamp(Math.round(Math.max(s0, p.s)), 0, w.n - 1), q = p.I * 0.55;
      for (let i = a; i <= b; i++) if (w.charge[i] < q) w.charge[i] = q;
      w.hot = true;
      if (!p.done && (p.s < 0 || p.s > w.n - 1)) {
        p.done = true;
        const end = p.s > 0 ? 1 : 0;
        if (w.on[end]) w.on[end](p);
        const pad = w.pads && w.pads[end];
        if (pad) flashes.push({ layer: w.layer, x: pad[0], y: pad[1], life: 0.35, max: 0.35, I: p.I });
      }
      const tailPos = p.s - p.dir * p.tail;
      if (p.dir > 0 ? tailPos > w.n - 1 : tailPos < 0) { w.active--; pulses[k] = pulses[pulses.length - 1]; pulses.pop(); }
    }
  }
  function bolt(out, x0, y0, x1, y1, disp) { // midpoint displacement; polylines are separated by a NaN pair
    out.push(NaN, NaN, x0, y0);
    const seg = (ax, ay, bx, by, d) => {
      if (d < 0.8) { out.push(bx, by); return; }
      const mx = (ax + bx) / 2 + (Math.random() - 0.5) * d, my = (ay + by) / 2 + (Math.random() - 0.5) * d;
      seg(ax, ay, mx, my, d * 0.55); seg(mx, my, bx, by, d * 0.55);
    };
    seg(x0, y0, x1, y1, disp);
  }
  function pickArcs(list, x, y, dt) {
    if (!ptr.on) return;
    const lim = arcR * 1.4;
    let a = null, b = null;
    for (const w of list) if (w.d < lim) { if (!a || w.d < a.d) { b = a; a = w; } else if (!b || w.d < b.d) b = w; }
    for (const w of [a, b]) {
      if (!w) continue;
      arcWires.push(w);
      if ((w.arcT -= dt) > 0) continue;
      w.arcT = 0.035 + Math.random() * 0.07;
      const s = 1 - w.d / lim;
      if (Math.random() > 0.3 + s) { w.arc = null; continue; } // arcs flicker in and out
      const x0 = w.pts[2 * w.ic], y0 = w.pts[2 * w.ic + 1], dx = x - x0, dy = y - y0, d = Math.hypot(dx, dy) || 1;
      const len = Math.min(d, arcR * (0.45 + 0.55 * Math.random())), out = [];
      bolt(out, x0, y0, x0 + (dx / d) * len, y0 + (dy / d) * len, len * 0.5);
      if (Math.random() < 0.35) {
        const k = 2 + 2 * Math.floor(Math.random() * ((out.length - 2) / 2)), ang = Math.random() * Math.PI * 2, l = len * 0.35;
        bolt(out, out[k], out[k + 1], out[k] + Math.cos(ang) * l, out[k + 1] + Math.sin(ang) * l, l * 0.6);
      }
      if (Math.random() < 0.6 * s && w.n > 12) { // a second arc crawling along the wire itself
        const k = 3 + Math.floor(Math.random() * 6), i1 = clamp(w.ic - k, 0, w.n - 1), i2 = clamp(w.ic + k, 0, w.n - 1);
        bolt(out, w.pts[2 * i1], w.pts[2 * i1 + 1], w.pts[2 * i2], w.pts[2 * i2 + 1], k * 0.9);
      }
      w.arc = out; w.arcI = s;
    }
  }
  function ambient(dt) {
    if ((amb -= dt) <= 0) {
      amb = lerp(T.ambient[0], T.ambient[1], Math.random());
      const pool = Math.random() < 0.6 && visibleBack.length ? visibleBack : wires;
      const w = pool[Math.floor(Math.random() * pool.length)];
      if (w && w.n > 6) {
        const fwd = w.kind === "trace" ? Math.random() < 0.85 : Math.random() < 0.5;
        spawnPulse(w, fwd ? 0 : w.n - 1, fwd ? 1 : -1, 0.28 + Math.random() * 0.32, (160 + Math.random() * 280) / P, (14 + Math.random() * 30) / P);
      }
    }
    if ((surge -= dt) <= 0) {
      surge = lerp(T.surge[0], T.surge[1], Math.random());
      const tubes = wires.filter((w) => w.kind === "tube" && w.on[0]);
      const w = tubes[Math.floor(Math.random() * tubes.length)];
      if (w) { const fwd = Math.random() < 0.5; spawnPulse(w, fwd ? 0 : w.n - 1, fwd ? 1 : -1, 0.9, 560 / P, 44 / P); }
    }
  }

  // ---------- drawing ----------
  function drawCharge(w, L, oy) {
    const c = w.charge, pts = w.pts, m = w.mask, nrm = w.nrm;
    let any = false;
    for (let i = 0; i < w.n; i++) {
      const v = c[i];
      if (v < 0.004) { c[i] = 0; continue; }
      any = true;
      if (v >= 0.05 && !(m && m[i])) {
        const x = pts[2 * i], y = pts[2 * i + 1] + oy;
        L.plot(x, y, ci(v * 0.8));
        if (nrm && v > 0.15) { L.plot(x + nrm[2 * i], y + nrm[2 * i + 1], ci(v * 0.45)); L.plot(x - nrm[2 * i], y - nrm[2 * i + 1], ci(v * 0.45)); }
      }
    }
    w.hot = any;
  }
  function decay(w, k) { const c = w.charge; for (let i = 0; i < w.n; i++) c[i] *= k; }
  function drawPulse(p) {
    const w = p.w, pts = w.pts, m = w.mask, L = w.layer ? front : back, oy = w.layer ? 0 : -off;
    if (w.kind === "tube") {
      // electricity crackling inside the glass
      const nrm = w.nrm, amp = Math.max(0.6, w.r - 1);
      let px = NaN, py = NaN;
      for (let t = 0; t <= p.tail + 0.01; t += 2) {
        const i = Math.round(p.s - p.dir * t);
        if (i < 0 || i >= w.n || m[i]) { px = NaN; continue; }
        const o = t === 0 ? 0 : clamp((Math.random() * 2 - 1) * amp * 1.3, -amp, amp);
        const x = pts[2 * i] + nrm[2 * i] * o, y = pts[2 * i + 1] + nrm[2 * i + 1] * o;
        const c = ci(p.I * (0.4 + 0.6 * (1 - t / (p.tail + 2))));
        if (px === px) L.line(px, py, x, y, c); else L.plot(x, y, c);
        px = x; py = y;
      }
      const h = Math.round(p.s);
      if (h >= 0 && h < w.n && !m[h]) L.plot(pts[2 * h], pts[2 * h + 1], ci(Math.min(1, p.I * 1.2)));
      return;
    }
    const tail = Math.max(2, p.tail);
    for (let t = 0; t <= tail; t++) {
      const i = Math.round(p.s - p.dir * t);
      if (i < 0 || i >= w.n || (m && m[i])) continue;
      const k = 1 - t / (tail + 1);
      L.plot(pts[2 * i], pts[2 * i + 1] + oy, ci(Math.min(1, p.I * k * k * (t === 0 ? 1.15 : 1))));
    }
  }
  function drawArc(w) {
    const o = w.arc;
    if (!o) return;
    const L = w.layer ? front : back, oy = w.layer ? 0 : -off, c = ci(0.55 + 0.45 * w.arcI);
    let px = NaN, py = NaN;
    for (let i = 0; i < o.length; i += 2) {
      const x = o[i], y = o[i + 1] + oy;
      if (x !== x) { px = NaN; continue; }
      if (px === px) L.line(px, py, x, y, c);
      px = x; py = y;
    }
  }

  function render(dt, cx, cy) {
    front.begin(); back.begin();
    const k = Math.exp(-dt * 3.5);
    for (const w of wires) if (w.hot) { drawCharge(w, front, 0); decay(w, k); }
    for (const w of visibleBack) if (w.hot) { drawCharge(w, back, -off); decay(w, k); }
    for (const p of pulses) if (p.w.layer || p.w.vis === frameNo) drawPulse(p);
    for (const w of arcWires) drawArc(w);
    for (const s of sparks) {
      const L = s.layer ? front : back, oy = s.layer ? 0 : -off, q = s.life / s.max;
      L.line(s.px, s.py + oy, s.x, s.y + oy, ci(0.25 + 0.4 * q, 1));
      L.plot(s.x, s.y + oy, ci(0.35 + 0.65 * q, 1));
    }
    for (const f of flashes) {
      const L = f.layer ? front : back, oy = f.layer ? 0 : -off, q = f.life / f.max, c1 = ci(Math.min(1, f.I * q * 1.1)), c2 = ci(f.I * q * 0.6);
      L.plot(f.x, f.y + oy, c1);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) L.plot(f.x + dx, f.y + dy + oy, c2);
    }
    // status lights
    const nearR = reach * 0.6;
    for (const l of leds) {
      const near = ptr.on && Math.abs(l.x - cx) < nearR && Math.abs(l.y - cy) < nearR;
      const on = near ? hash(Math.floor(clock * 14) + l.seed) < 0.45 : (clock + l.ph) % l.per < l.per * l.duty;
      if (on) front.plot(l.x, l.y, ci(l.lvl));
    }
    for (const c of cores) {
      const d = ptr.on ? Math.hypot(cx - c.x, cy - c.y) : Infinity, R = reach * 1.2, tg = d < R ? Math.pow(1 - d / R, 1.5) : 0;
      c.e += (tg - c.e) * (1 - Math.exp(-dt * (tg > c.e ? 4 : 1.5)));
      c.kick *= Math.exp(-dt * 2.5);
      const en = Math.min(1, c.e + c.kick), n = c.ring.length / 2;
      c.ph += dt * (0.5 + 5 * en) * c.dir;
      const head = ((c.ph % n) + n) % n;
      for (let i = 0; i < n; i++) {
        const behind = (head - i + n) % n;
        const v = behind < 1 ? 0.7 + 0.3 * en : behind < 2.2 ? 0.45 + 0.3 * en : behind < 3.5 ? 0.25 + 0.2 * en : 0;
        front.plot(c.ring[2 * i], c.ring[2 * i + 1], ci(v * (0.55 + 0.45 * en)));
      }
      const lv = 0.32 + 0.12 * Math.sin(clock * 2.1 + c.ph * 0.2) + 0.55 * en;
      front.plot(c.x, c.y, ci(Math.min(1, lv + 0.15)));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) front.plot(c.x + dx, c.y + dy, ci(lv * 0.75));
    }
    if (hazard) {
      const d = ptr.on ? Math.hypot(cx - hazard.x, cy - hazard.y) : Infinity, R = reach * 1.3, tg = d < R ? 1 - d / R : 0;
      hazard.e += (tg - hazard.e) * (1 - Math.exp(-dt * (tg > hazard.e ? 4 : 1.5)));
      hazard.kick *= Math.exp(-dt * 2);
      const c = ci(0.16 + 0.07 * Math.sin(clock * 1.7) + 0.5 * hazard.e + 0.5 * hazard.kick);
      if (c) for (let i = 0; i < hazard.px.length; i += 2) front.plot(hazard.px[i], hazard.px[i + 1], c);
    }
    front.end(); back.end();
    if (front.dirty) frontGlow.render();
    if (back.dirty) backGlow.render();
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (now - last < 13) return; // ~60 fps is plenty, even on 120 Hz screens
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; clock += dt;
    const o = Math.round((Math.max(0, window.scrollY) * T.parallax) / P);
    if (o !== off) { off = o; els.traces.style.transform = `translate3d(0, ${-off * P}px, 0)`; }
    const cx = ptr.x / P, cy = ptr.y / P;
    for (const w of wires) stepWire(w, dt, cx, cy);
    visibleBack.length = 0;
    frameNo++;
    for (const w of backWires) {
      const b = w.bbox;
      if (b[3] >= off - 4 && b[1] <= off + H + 4) { w.vis = frameNo; visibleBack.push(w); stepWire(w, dt, cx, cy + off); }
      else w.e = 0;
    }
    ambient(dt);
    stepPulses(dt);
    for (let k = sparks.length - 1; k >= 0; k--) {
      const s = sparks[k];
      if ((s.life -= dt) <= 0) { sparks[k] = sparks[sparks.length - 1]; sparks.pop(); continue; }
      s.px = s.x; s.py = s.y; s.vy += (520 / P) * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    }
    for (let k = flashes.length - 1; k >= 0; k--) if ((flashes[k].life -= dt) <= 0) { flashes[k] = flashes[flashes.length - 1]; flashes.pop(); }
    arcWires.length = 0;
    pickArcs(wires, cx, cy, dt);
    pickArcs(visibleBack, cx, cy + off, dt);
    render(dt, cx, cy);
  }

  // Shock wave from a point on screen (CSS px), e.g. when the download button is pressed.
  function burst(x, y, strength = 1) {
    if (reduce || !front) return;
    const ax = x / P, ay = y / P;
    for (let k = 0; k < 44 * strength; k++) {
      const a = Math.random() * Math.PI * 2, v = (120 + Math.random() * 380) / P, life = 0.25 + Math.random() * 0.55;
      sparks.push({ layer: 1, x: ax, y: ay, px: ax, py: ay, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80 / P, life, max: life });
    }
    flashes.push({ layer: 1, x: ax, y: ay, life: 0.25, max: 0.25, I: 1 });
    const R = reach * 2.5;
    const hit = (w, yy) => {
      if (nearest(w, ax, yy, R) < R) for (const dir of [1, -1]) spawnPulse(w, w.ic, dir, 0.95, 700 / P, 50 / P);
    };
    for (const w of wires) hit(w, ay);
    for (const w of visibleBack) hit(w, ay + off);
  }

  function init(opts = {}) {
    els.nav = opts.nav || null;
    for (const id of ["wall", "traces", "back", "back-glow", "frame", "front", "front-glow"]) els[id] = document.getElementById("bg-" + id);
    if (!els.wall || !window.ImageData) return;
    reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    build();
    let rt = 0;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(build, 160); });
    if (window.ResizeObserver) {
      let bt = 0;
      new ResizeObserver(() => { clearTimeout(bt); bt = setTimeout(ensureBands, 120); }).observe(document.body);
      if (els.nav) {
        let nt = 0, size = els.nav.getBoundingClientRect();
        new ResizeObserver(() => {
          const r = els.nav.getBoundingClientRect();
          if (Math.abs(r.width - size.width) < 1 && Math.abs(r.height - size.height) < 1) return;
          size = r;
          clearTimeout(nt); nt = setTimeout(build, 120);
        }).observe(els.nav);
      }
    }
    const move = (x, y) => { ptr.x = x; ptr.y = y; ptr.on = true; };
    addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") move(e.clientX, e.clientY); }, { passive: true });
    addEventListener("pointerdown", (e) => { if (e.pointerType !== "touch") move(e.clientX, e.clientY); }, { passive: true });
    addEventListener("touchstart", (e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }, { passive: true });
    addEventListener("touchmove", (e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }, { passive: true });
    addEventListener("touchend", (e) => { if (!e.touches.length) ptr.on = false; }, { passive: true });
    addEventListener("touchcancel", () => (ptr.on = false));
    addEventListener("mouseout", (e) => { if (!e.relatedTarget) ptr.on = false; });
    addEventListener("blur", () => (ptr.on = false));
    if (!reduce) requestAnimationFrame(loop);
  }

  F.circuit = { init, burst, onNav: null };
})();
