"use strict";
// "Despot Is Always Watching": a moment after the visitor reaches the final section, Despot notices them. His eyes
// crack open, hesitate for a beat and snap wide; they close again when the visitor scrolls away. The mouth never moves.

(function () {
  const F = (window.F666 = window.F666 || {});

  // One character = one pixel. This is the left eye; the right one is its mirror image.
  const EYE = [
    "##........",
    "####......",
    ".######...",
    "..########",
    "...#######",
    "....######",
    ".....#####",
  ];
  const MOUTH = [
    "...######...",
    ".##########.",
    "############",
  ];
  const GW = 40, GH = 20, EYE_X = 3, EYE_Y = 5, MOUTH_Y = 12;
  const COLOR = { eye: "#8e1020", lid: "#b3192e", slit: "#3d0912", mouth: "#7a0d1b" };
  const NOTICE_DELAY = 0.9;    // seconds the screen has to be in view before he reacts
  const SEEN = 0.65, GONE = 0.2; // share of the screen on display that counts as arriving / leaving
  const CLOSE_TIME = 0.6;
  // How he notices you, as [seconds, how open]: eyes crack open, a beat of hesitation, then wide awake.
  const NOTICE = [[0, 0], [0.08, 0.3], [0.5, 0.3], [0.62, 1]];
  const FLARE = [[0, 1], [0.5, 1], [0.66, 1.4], [1.4, 1]]; // the glow overshoots as the eyes snap open
  const curve = (keys, t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i], [t0, v0] = keys[i - 1];
      if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
    return keys[keys.length - 1][1];
  };

  function init(canvas, screen) {
    if (!canvas || !screen) return;
    canvas.width = GW; canvas.height = GH;
    const ctx = canvas.getContext("2d");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // each eye column is a vertical run of pixels; opening reveals it from the bottom up
    const cols = [];
    for (let x = 0; x < EYE[0].length; x++) {
      let top = -1, bot = -1;
      EYE.forEach((row, y) => { if (row[x] === "#") { if (top < 0) top = y; bot = y; } });
      cols.push([top, bot]);
    }
    // mode: closed → waiting (delay) → noticing → open → closing → closed
    let open = 0, glow = 0, from = 0, mode = "closed", seen = false, timer = 0, raf = 0, t0 = 0, last = 0;

    function draw() {
      ctx.clearRect(0, 0, GW, GH);
      ctx.fillStyle = COLOR.mouth;
      const mx = (GW - MOUTH[0].length) >> 1;
      MOUTH.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === "#") ctx.fillRect(mx + x, MOUTH_Y + y, 1, 1); });
      for (const flip of [false, true]) cols.forEach(([top, bot], x) => {
        if (top < 0) return;
        const gx = flip ? GW - 1 - (EYE_X + x) : EYE_X + x, shown = Math.round(open * (bot - top + 1));
        if (!shown) { ctx.fillStyle = COLOR.slit; ctx.fillRect(gx, EYE_Y + bot, 1, 1); return; }
        ctx.fillStyle = COLOR.eye; ctx.fillRect(gx, EYE_Y + bot - shown + 1, 1, shown);
        ctx.fillStyle = COLOR.lid; ctx.fillRect(gx, EYE_Y + bot - shown + 1, 1, 1);
      });
      canvas.style.filter = glow > 0.01 ? `drop-shadow(0 0 ${(glow * 12).toFixed(1)}px rgba(190, 18, 42, ${Math.min(1, glow * 0.8).toFixed(2)}))` : "none";
      screen.style.setProperty("--o", glow.toFixed(3));
    }
    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (mode === "noticing") {
        const t = (now - t0) / 1000;
        open = Math.max(from, curve(NOTICE, t));
        glow = open * curve(FLARE, t);
        if (t >= FLARE[FLARE.length - 1][0]) { mode = "open"; open = glow = 1; }
      } else if (mode === "closing") {
        open = glow = Math.max(0, open - dt / CLOSE_TIME);
        if (!open) mode = "closed";
      }
      draw();
      if (mode === "noticing" || mode === "closing") raf = requestAnimationFrame(frame);
    }
    const run = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

    function arrive() {
      if (mode === "open" || mode === "noticing") return;
      if (mode === "closed") mode = "waiting";
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (reduce) { mode = "open"; open = glow = 1; draw(); return; }
        from = open; mode = "noticing"; t0 = performance.now(); run();
      }, NOTICE_DELAY * 1000);
    }
    function leave() {
      clearTimeout(timer);
      if (mode === "waiting" || mode === "closed") { mode = "closed"; return; }
      if (reduce) { mode = "closed"; open = glow = 0; draw(); return; }
      mode = "closing"; run();
    }
    function check() {
      const r = screen.getBoundingClientRect(), h = r.height || 1;
      const visible = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / h;
      if (!seen && visible >= Math.min(SEEN, (innerHeight / h) * 0.9)) { seen = true; arrive(); }
      else if (seen && visible < GONE) { seen = false; leave(); }
    }
    draw();
    addEventListener("scroll", check, { passive: true });
    addEventListener("resize", check);
    check();
  }

  F.despot = { init };
})();
