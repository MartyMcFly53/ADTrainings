"use strict";
/* ==========================================
   POWER FX – Animationen und Sound für Aufnahmen über 100 und 180.
   Hängt sich an power.js, die Spiellogik bleibt unverändert. Nach power.js laden.

   Eigener Ansager-Sound: Lege eine Datei  sounds/180.mp3  neben power.html ab,
   dann wird sie bei 180 abgespielt. Ohne Datei nutzt die Seite Fanfare, Publikum
   und eine synthetische Ansager-Stimme (Sprachausgabe des Browsers).
========================================== */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); el.addEventListener("animationend", () => el.classList.remove(cls), { once: true }); };

  /* ---------- Sound ---------- */
  let AC = null, soundOn = localStorage.getItem("power_sound") !== "off";
  const audio = () => { if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); } if (AC.state === "suspended") AC.resume(); return AC; };
  const env = (g, t, a, d, peak) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };
  function tone(f, t, d, type, peak) { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; env(g, t, .01, d, peak); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .05); }
  function brass(f, t, d, peak) {
    for (const det of [-7, 0, 7]) {
      const o = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det; lp.type = "lowpass";
      lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2800, t + .08); lp.frequency.exponentialRampToValueAtTime(900, t + d);
      env(g, t, .03, d, peak / 3); o.connect(lp).connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .1);
    }
  }
  function noise(t, d, o) {
    const n = Math.floor(AC.sampleRate * d), buf = AC.createBuffer(1, n, AC.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    src.buffer = buf; f.type = o.type || "bandpass"; f.frequency.value = o.freq; f.Q.value = o.q ?? .6;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(o.peak, t + d * (o.swell ?? .3)); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    src.connect(f).connect(g).connect(AC.destination); src.start(t);
  }
  function soundTon() {
    if (!soundOn || !audio()) return; const t = AC.currentTime + .02;
    tone(659.25, t, .25, "triangle", .16); tone(880, t + .1, .4, "triangle", .16); tone(1318.5, t + .2, .5, "sine", .07);
    noise(t, 1.2, { peak: .1, freq: 2600, q: .4, swell: .2, type: "highpass" });
  }
  function say(text) {
    if (!("speechSynthesis" in window)) return;
    const vs = speechSynthesis.getVoices();
    const v = vs.find(x => /en-GB/i.test(x.lang) && /male|daniel|george|ryan|arthur/i.test(x.name)) || vs.find(x => /en-GB/i.test(x.lang)) || vs.find(x => /^en/i.test(x.lang));
    const u = new SpeechSynthesisUtterance(text); if (v) u.voice = v; u.lang = v ? v.lang : "en-GB"; u.rate = .78; u.pitch = .55; u.volume = 1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  function synth180() {
    if (!audio()) { say("One hundred and... eighty!"); return; } const t = AC.currentTime + .02;
    [261.63, 329.63, 392].forEach((f, i) => brass(f, t + i * .16, .14, .5));
    [261.63, 329.63, 392, 523.25].forEach(f => brass(f, t + .5, 1.5, .55));
    noise(t + .1, 3.6, { peak: .34, freq: 700, q: .5, swell: .25 }); noise(t + .1, 3.6, { peak: .14, freq: 2400, q: .7, swell: .3 });
    setTimeout(() => say("One hundred and... eighty!"), 250);
  }
  function playFile(url) { return new Promise(res => { const a = new Audio(url); a.addEventListener("error", () => res(false), { once: true }); a.play().then(() => res(true)).catch(() => res(false)); }); }
  async function sound180() { if (!soundOn) return; if (!(await playFile("sounds/180.mp3"))) synth180(); }

  /* ---------- Partikel ---------- */
  const cv = document.createElement("canvas"); cv.id = "fxCanvas"; document.body.appendChild(cv);
  const ctx = cv.getContext("2d"); let parts = [], raf = 0;
  const fit = () => { cv.width = innerWidth; cv.height = innerHeight; }; fit(); addEventListener("resize", fit);
  const GOLD = ["#ffc83d", "#ffe08a", "#fff3c4", "#ffffff"], PARTY = ["#ffc83d", "#ff4d5e", "#6aa8ff", "#ffffff", "#3ddc97", "#ffe08a"];
  function burst(x, y, o) {
    if (reduce) return;
    for (let i = 0; i < o.count; i++) {
      const a = (o.angle ?? 0) + (Math.random() - .5) * (o.spread ?? Math.PI * 2), v = (o.speed ?? 6) * (.4 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.gravity ?? .2, s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .45,
        life: 0, max: o.life ?? 90, c: o.colors[i % o.colors.length], round: !!o.round });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => p.life++ < p.max && p.y < cv.height + 30);
    for (const p of parts) {
      p.vy += p.g; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.globalAlpha = Math.max(0, Math.min(1, (p.max - p.life) / 25)); ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 6.3); ctx.fill(); } else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) ctx.clearRect(0, 0, cv.width, cv.height);
  }

  /* ---------- Effekte ---------- */
  const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const LABEL = (s) => s >= 140 ? "Mega-Aufnahme" : "Starke Aufnahme";

  function effectTon(sum, round) {
    soundTon(); if (reduce) return;
    const card = document.querySelectorAll(".scolia-round-card")[round - 1], box = document.querySelector(".scolia-total-score-container");
    if (card) { restart(card, "fx-pulse"); const [x, y] = center(card); burst(x, y, { count: 30, colors: GOLD, speed: 6.5, gravity: .2, life: 70, round: true }); }
    const t = document.createElement("div"); t.className = "fx-ton"; t.innerHTML = `<b>${sum}</b><span>${LABEL(sum)}</span>`;
    const r = document.createElement("div"); r.className = "fx-ripple"; box.append(r, t); setTimeout(() => { t.remove(); r.remove(); }, 2100);
  }
  let arena;
  function effect180(round) {
    sound180(); if (reduce) return;
    arena.classList.remove("on"); void arena.offsetWidth; arena.classList.add("on"); clearTimeout(arena._t); arena._t = setTimeout(() => arena.classList.remove("on"), 4700);
    const w = innerWidth, h = innerHeight, wave = (delay, fn) => setTimeout(fn, delay);
    const cannons = () => { for (const [x, a] of [[w * .06, -1.1], [w * .94, -Math.PI + 1.1]]) burst(x, h * .95, { count: 90, colors: PARTY, speed: 21, gravity: .35, life: 150, angle: a, spread: .7 }); };
    cannons(); wave(500, () => burst(w / 2, -10, { count: 140, colors: PARTY, speed: 4, gravity: .14, life: 200, angle: Math.PI / 2, spread: 2.6 })); wave(1000, cannons);
    wave(1700, () => burst(w / 2, h * .45, { count: 70, colors: GOLD, speed: 11, gravity: .12, life: 90, round: true }));
    const app = document.querySelector(".scolia-main"); if (app) restart(app, "app-shake");
  }

  /* ---------- Einhängen in power.js ---------- */
  let pending = null, lastKey = "", prevTotal = 0;
  const origCheck = window.checkRoundCompletion;
  window.checkRoundCompletion = function () {
    origCheck();
    const rt = getCurrentRoundThrows();
    if (rt.length === 3) {
      const sum = rt.reduce((s, t) => s + t.score, 0), key = `${state.currentRound}:${state.throws.length}:${sum}`;
      if (key !== lastKey) { lastKey = key; if (sum > 100) pending = { sum, round: state.currentRound }; }
    }
  };
  const origUndo = window.undoLastThrow; window.undoLastThrow = function () { lastKey = ""; origUndo(); };
  const origNew = window.startNewPowerSession; window.startNewPowerSession = function () { lastKey = ""; origNew(); };

  function tween(el, from, to) {
    if (reduce || from === to) return;
    const t0 = performance.now();
    (function step(t) { const k = Math.min(1, (t - t0) / 600); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0);
    restart(el, "fx-bump");
  }
  function decorate() {
    document.querySelectorAll(".scolia-round-card").forEach((c, i) => {
      const sum = state.throws.slice(i * 3, i * 3 + 3).reduce((s, t) => s + t.score, 0), n = state.throws.slice(i * 3, i * 3 + 3).length;
      c.classList.toggle("big", n === 3 && sum > 100 && sum < 180); c.classList.toggle("max", n === 3 && sum === 180);
    });
    document.querySelectorAll("#lastThrows .throw-card").forEach((c, i) => {
      const t = getCurrentRoundThrows()[i]; if (!t) return;
      const v = t.value; c.classList.add(v === "MISS" ? "t-miss" : /BULL/.test(v) ? "t-bull" : v[0] === "T" ? "t-triple" : v[0] === "D" ? "t-double" : "t-single");
    });
  }
  const origUpdate = window.updateUI;
  window.updateUI = function () {
    const nBefore = prevCount; origUpdate();
    const total = state.throws.reduce((s, t) => s + t.score, 0); tween($("totalScore"), prevTotal, total); prevTotal = total;
    decorate();
    if (state.throws.length > nBefore && !reduce) { const cards = document.querySelectorAll("#lastThrows .throw-card"), i = (state.throws.length - 1) % 3; if (cards[i]) cards[i].classList.add("fx-land"); }
    prevCount = state.throws.length;
    if (pending) { const p = pending; pending = null; if (p.sum === 180) effect180(p.round); else effectTon(p.sum, p.round); }
  };
  let prevCount = 0;

  /* ---------- Oberfläche: Sound-Schalter, Entsperren, Test ---------- */
  const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/>';
  const ON = SPK + '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>', OFF = SPK + '<path d="M17 9l5 6M22 9l-5 6"/></svg>';
  function paintBtn(b) { b.innerHTML = (soundOn ? ON : OFF) + (soundOn ? "Sound an" : "Sound aus"); b.classList.toggle("off", !soundOn); }
  document.addEventListener("DOMContentLoaded", () => {
    arena = document.createElement("div"); arena.className = "fx-arena"; arena.id = "fxArena";
    arena.innerHTML = '<div class="fx-beams"><i></i><i></i><i></i><i></i></div><div class="fx-flash"></div><div class="fx-180"><div class="fx-num">180</div><div class="fx-sub">One hundred and eighty</div></div>';
    document.body.appendChild(arena);
    const bar = document.querySelector(".status-control-container");
    if (bar) { const b = document.createElement("button"); b.id = "soundBtn"; paintBtn(b);
      b.onclick = () => { soundOn = !soundOn; localStorage.setItem("power_sound", soundOn ? "on" : "off"); paintBtn(b); if (soundOn) soundTon(); }; bar.insertBefore(b, $("configIpBtn")); }
    const unlock = () => { audio(); if ("speechSynthesis" in window) speechSynthesis.getVoices(); };
    document.addEventListener("pointerdown", unlock, { once: true });
    updateUI();
  });
  window.demo100 = (s = 112) => effectTon(s, state.currentRound);   // Test in der Konsole: demo100()
  window.demo180 = () => effect180(state.currentRound);             // Test in der Konsole: demo180()
})();
