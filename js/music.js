"use strict";
// Background music: the Floor 666 theme, looping, on by default. Browsers usually block sound until the visitor
// interacts with the page, so when autoplay is refused the music starts on the first tap, click or key press.
// Turning it off is remembered for later visits. Pausing keeps the position, so the track never restarts.

(function () {
  const F = (window.F666 = window.F666 || {});
  const VOLUME = 0.45, FADE = 0.8;        // seconds
  const KEY = "f666-music";               // localStorage: "off" once the visitor has turned the music off
  const GESTURES = ["pointerdown", "pointerup", "touchend", "keydown"]; // events that let a page start sound

  function init(audio, button) {
    if (!audio || !button) return;
    let on = true, fade = 0;
    try { on = localStorage.getItem(KEY) !== "off"; } catch {}
    audio.volume = 0;

    // iOS ignores volume changes, so there the music simply starts and stops
    function ramp(to, done) {
      cancelAnimationFrame(fade);
      const from = audio.volume, start = performance.now();
      const step = (now) => {
        const k = Math.min(1, Math.max(0, (now - start) / (FADE * 1000))); // a frame can be stamped before `start`
        audio.volume = Math.min(1, Math.max(0, from + (to - from) * k));
        if (k < 1) fade = requestAnimationFrame(step);
        else if (done) done();
      };
      fade = requestAnimationFrame(step);
    }
    function play() {
      ramp(VOLUME);
      return audio.play() || Promise.resolve();
    }
    function show() {
      button.setAttribute("aria-pressed", String(on));
      button.title = on ? "Music: on" : "Music: off";
    }
    // Autoplay was refused: keep the toggle ON and try again on the visitor's first interaction
    // (a first click on the toggle itself is left to the toggle, which then means "off").
    function playOnFirstGesture() {
      const done = () => GESTURES.forEach((type) => removeEventListener(type, attempt, true));
      function attempt(e) {
        if (!on) return done();
        if (button.contains(e.target)) return;
        play().then(done, () => {}); // a touch only unlocks sound on release, so pointerdown may still fail
      }
      GESTURES.forEach((type) => addEventListener(type, attempt, true));
    }

    button.addEventListener("click", () => {
      on = !on;
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
      if (on) play().catch(() => { on = false; show(); });
      else ramp(0, () => { if (!on) audio.pause(); });
      show();
    });
    audio.addEventListener("error", () => { on = false; show(); button.hidden = true; });
    show();
    if (on) play().catch(playOnFirstGesture);
  }

  F.music = { init };
})();
