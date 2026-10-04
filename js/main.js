"use strict";
// Floor 666 site: builds the feature sections from features.js and wires up the interface.

(function () {
  const F = (window.F666 = window.F666 || {});
  const $ = (sel, root = document) => root.querySelector(sel);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pad2 = (n) => String(n).padStart(2, "0");
  // Silkscreen's "&" reads like a "€", so headings borrow the body font's one
  const head = (s) => esc(s).replace(/&amp;/g, '<span class="amp">&amp;</span>');

  function card(f, i) {
    const el = document.createElement("article");
    el.className = "card reveal" + (f.variant ? " card--" + f.variant : "");
    el.id = "feature-" + f.id;
    el.dataset.feature = f.id;
    el.style.setProperty("--d", (i % 3) * 80 + "ms");
    let html = f.variant ? '<span class="card-aura" aria-hidden="true"></span>' : "";
    if (f.media) {
      const m = typeof f.media === "string" ? f.media : `<img src="${esc(f.media.src)}" alt="${esc(f.media.alt || "")}" loading="lazy">`;
      html += `<div class="card-media">${m}</div>`;
    }
    html += `<span class="card-code" aria-hidden="true">${pad2(i + 1)}</span>`;
    if (f.tag) html += `<span class="card-tag">${esc(f.tag)}</span>`;
    html += `<h3 class="card-title">${head(f.title)}${f.subtitle ? `<span class="card-sub">${head(f.subtitle)}</span>` : ""}</h3>`;
    html += `<p class="card-text">${esc(f.text)}</p>`;
    el.innerHTML = html;
    return el;
  }

  function renderFeatures() {
    const root = $("#features"), nav = $("#hud-links");
    (F.FEATURES || []).forEach((cat, n) => {
      const sec = document.createElement("section");
      sec.className = "cat";
      sec.id = cat.id;
      sec.setAttribute("aria-labelledby", cat.id + "-title");
      sec.innerHTML = `<header class="cat-head"><p class="cat-code">${esc(cat.code || "Sector " + pad2(n + 1))}</p>` +
        `<h2 class="cat-title" id="${esc(cat.id)}-title">${head(cat.title)}</h2></header><div class="card-grid"></div>`;
      const grid = sec.querySelector(".card-grid");
      cat.features.forEach((f, i) => grid.appendChild(card(f, i)));
      root.appendChild(sec);
      const li = document.createElement("li");
      li.innerHTML = `<a href="#${esc(cat.id)}">${head(cat.nav || cat.title)}</a>`;
      nav.appendChild(li);
    });
  }

  function initNav() {
    const hud = $("#hud"), menu = $("#hud-menu"), links = [...document.querySelectorAll(".hud-links a")];
    const setOpen = (open) => {
      hud.toggleAttribute("data-open", open);
      menu.setAttribute("aria-expanded", String(open));
    };
    menu.addEventListener("click", () => setOpen(!hud.hasAttribute("data-open")));
    links.forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
    document.addEventListener("click", (e) => { if (!hud.contains(e.target)) setOpen(false); });

    // highlight the section being read (the final one is a secret, so nothing is lit there)
    const sections = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean), secret = $("#watching");
    let queued = false;
    const update = () => {
      queued = false;
      const line = innerHeight * 0.35;
      let cur = null;
      for (const s of sections) if (s.getBoundingClientRect().top <= line) cur = s;
      if (secret && secret.getBoundingClientRect().top <= line) cur = null;
      for (const a of links) {
        if (cur && a.hash === "#" + cur.id) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      }
    };
    addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    update();

    // the nav bar flashes when a pulse running along the top tube reaches it
    let t = 0;
    return () => {
      hud.classList.add("is-charged");
      clearTimeout(t);
      t = setTimeout(() => hud.classList.remove("is-charged"), 160);
    };
  }

  function initDownload() {
    const btn = $("#dl-btn"), text = $("#dl-term-text"), status = $("#dl-status"), term = text.parentElement;
    const MSG = "> ACCESS DENIED: Floor 666 is still under construction. Coming soon.";
    let reset = 0, typer = 0;
    btn.addEventListener("click", () => {
      const r = btn.getBoundingClientRect();
      if (F.circuit) F.circuit.burst(r.left + r.width / 2, r.top + r.height / 2, 1);
      btn.classList.remove("is-denied");
      void btn.offsetWidth; // restart the animation
      btn.classList.add("is-denied");
      clearTimeout(reset);
      reset = setTimeout(() => btn.classList.remove("is-denied"), 3200);
      status.textContent = "Coming soon: the mod is not available for download yet.";
      term.classList.add("is-on");
      clearInterval(typer);
      if (reduceMotion) { text.textContent = MSG; return; }
      let i = 0;
      text.textContent = "";
      typer = setInterval(() => {
        text.textContent = MSG.slice(0, ++i);
        if (i >= MSG.length) clearInterval(typer);
      }, 22);
    });
  }

  function initTitleGlitch() {
    const el = $(".title-main");
    if (!el || reduceMotion) return;
    const glitch = () => {
      el.classList.add("is-glitching");
      setTimeout(() => el.classList.remove("is-glitching"), 520);
      setTimeout(glitch, 5500 + Math.random() * 7000);
    };
    setTimeout(glitch, 2200);
  }

  // Hidden detail: now and then "A Little Bit of Everything" glitches into "A Little Much of Everything" for a second.
  function initTitleSwap() {
    const el = $(".ttl-swap");
    if (!el || reduceMotion) return;
    const word = el.textContent, alt = el.dataset.alt, HOLD = 1000, CUT = 110;
    const glitch = () => { el.classList.remove("is-glitching"); void el.offsetWidth; el.classList.add("is-glitching"); };
    const set = (text, swapped) => { el.textContent = text; el.classList.toggle("is-swapped", swapped); };
    const later = (min, max) => setTimeout(run, min + Math.random() * (max - min));
    function run() {
      const r = el.getBoundingClientRect();
      if (document.hidden || r.bottom < 0 || r.top > innerHeight) { later(4000, 9000); return; } // nobody would see it
      glitch();
      setTimeout(() => set(alt, true), CUT);
      setTimeout(() => { glitch(); setTimeout(() => set(word, false), CUT); }, CUT + HOLD);
      later(20000, 55000);
    }
    later(12000, 30000);
  }

  function initReveal() {
    const items = document.querySelectorAll(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("is-in")); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    }), { rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => io.observe(el));
  }

  document.documentElement.classList.add("js");
  renderFeatures();
  const navPulse = initNav();
  initDownload();
  initTitleGlitch();
  initTitleSwap();
  initReveal();
  if (F.music) F.music.init($("#bgm"), $("#hud-music"));
  if (F.circuit) {
    F.circuit.init({ nav: $(".hud-bar") });
    F.circuit.onNav = navPulse;
  }
  if (F.despot) F.despot.init($("#despot-face"), $("#despot-screen"));
})();
