"use strict";
/* ==========================================
   ROCKET FX – SVG-Rakete, Himmelsszene und Animationen.
   Hängt sich an rocket.js, die Spiellogik bleibt unverändert. Nach rocket.js laden.
========================================== */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); el.addEventListener("animationend", () => el.classList.remove(cls), { once: true }); };

  /* ---------- Grafiken ---------- */
  const ROCKET = `<svg class="rk" viewBox="0 0 60 90"><g class="fs"><g class="flame"><path d="M22 88Q30 138 38 88Z" fill="#ff8a3d"/><path d="M26 88Q30 118 34 88Z" fill="#ffe08a"/></g></g>
    <path d="M19 58L5 84l14-5zM41 58l14 26-14-5z" fill="#c4392f"/><path d="M23 84h14l2 6H21z" fill="#4a5468"/>
    <path d="M30 2C42 18 44 48 40 84H20C16 48 18 18 30 2z" fill="#e8edf7" stroke="#8da2bd" stroke-width="1.5"/>
    <path d="M30 2C36 9 39 18 40.5 27h-21C21 18 24 9 30 2z" fill="#ff5d4d"/><rect x="19" y="64" width="22" height="5" fill="#ff8a3d" opacity=".9"/>
    <circle cx="30" cy="44" r="7" fill="#12254a" stroke="#8da2bd" stroke-width="2"/><circle cx="28" cy="42" r="2" fill="#7fc8ff" opacity=".7"/></svg>`;
  const MARS = `<svg viewBox="0 0 48 48"><defs><radialGradient id="mg" cx=".35" cy=".3"><stop offset="0" stop-color="#ffb07a"/><stop offset=".6" stop-color="#c4561d"/><stop offset="1" stop-color="#5a1f10"/></radialGradient></defs><circle cx="24" cy="24" r="22" fill="url(#mg)"/><circle cx="17" cy="20" r="3" fill="#7a2a12" opacity=".6"/><circle cx="29" cy="30" r="4" fill="#7a2a12" opacity=".5"/><path d="M14 8Q24 3 34 8Q24 11 14 8z" fill="#f4e8e0" opacity=".8"/></svg>`;
  const dot = (body) => `<svg viewBox="0 0 16 16">${body}</svg>`;
  const MARK = [
    dot('<circle cx="8" cy="8" r="7" fill="#d9622b"/><circle cx="6" cy="6" r="1.6" fill="#7a2a12"/>'),
    dot('<circle cx="8" cy="8" r="7" fill="#b8bcc6"/><circle cx="6" cy="6" r="1.6" fill="#8a8f9c"/><circle cx="10" cy="10" r="1.2" fill="#8a8f9c"/>'),
    dot('<circle cx="8" cy="8" r="7" fill="#2a6bd1"/><path d="M4 5l4-1 2 3-3 2-3-1z" fill="#5fae5f"/>'),
    dot('<path d="M3 14h10M6 14V5l2-3 2 3v9M4 14l2-3M12 14l-2-3" stroke="#8da2bd" stroke-width="1.4" fill="none"/>')
  ];
  const MARK_SCORE = [500, 300, 200, 100];
  const MARK_ICON_MARS = null;
  const HEAD = `<span class="h1-mark" style="color:#ff8a3d"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M24 4c8 6 10 16 8 28H16C14 20 16 10 24 4z"/><circle cx="24" cy="19" r="4"/><path d="M16 26l-7 10 7-2M32 26l7 10-7-2M20 36c0 4 1 7 4 9 3-2 4-5 4-9"/></svg></span>`;

  /* ---------- Höhenmodell (gleiche Staffelung wie rocket.js) ---------- */
  const pct = (s) => s <= 100 ? 10 + s / 100 * 20 : s <= 200 ? 30 + (s - 100) / 100 * 20 : s <= 350 ? 50 + (s - 200) / 150 * 20 : 70 + Math.min(500, s - 350) / 150 * 20;
  const tOf = (s) => Math.max(0, Math.min(1, (pct(s) - 10) / 80));
  const bottomOf = (t, extra = 0) => `calc(${t} * (100% - 68px) + ${12 + extra}px)`;

  /* ---------- Partikel ---------- */
  const cv = document.createElement("canvas"); cv.id = "fxCanvas"; document.body.appendChild(cv);
  const ctx = cv.getContext("2d"); let parts = [], raf = 0;
  const fit = () => { cv.width = innerWidth; cv.height = innerHeight; }; fit(); addEventListener("resize", fit);
  const COL = { fire: ["#ffe08a", "#ff8a3d", "#ffffff", "#c4561d"], gas: ["#dbe6f7", "#8da2bd", "#6ee7a8"], dust: ["#d9622b", "#a0482a", "#e8b48a"], win: ["#ffb277", "#7fc8ff", "#6ee7a8", "#ffffff", "#ff8a3d"], debris: ["#6b7488", "#4a5468", "#e8edf7", "#c4392f"] };
  function burst(x, y, o) {
    if (reduce) return;
    for (let i = 0; i < o.count; i++) {
      const a = (o.angle ?? 0) + (Math.random() - .5) * (o.spread ?? Math.PI * 2), v = (o.speed ?? 6) * (.4 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.gravity ?? .2, s: 3 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
        cl: o.clip ? sky.getBoundingClientRect() : null, life: 0, max: o.life ?? 70, c: o.colors[i % o.colors.length], round: !!o.round });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => p.life++ < p.max && p.y < cv.height + 20 && !(p.cl && p.y > p.cl.bottom - 4));
    for (const p of parts) {
      p.vy += p.g; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max); ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 6.3); ctx.fill(); } else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) ctx.clearRect(0, 0, cv.width, cv.height);
  }

  function tween(el, from, to, suffix = "") {
    if (reduce || from === to) return;
    const t0 = performance.now();
    (function step(t) { const k = Math.min(1, (t - t0) / 500); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))) + suffix; if (k < 1) requestAnimationFrame(step); })(t0);
    restart(el, "fx-bump");
  }

  /* ---------- Seite aufbauen ---------- */
  let sky, rocket;
  document.addEventListener("DOMContentLoaded", () => {
    const h1 = document.querySelector(".module-header h1"); if (h1) h1.insertAdjacentHTML("afterbegin", HEAD);
    sky = $("spaceSky"); rocket = $("rocketShip"); if (!sky || !rocket) return;
    rocket.innerHTML = ROCKET; rocket.classList.add("idle");
    sky.insertAdjacentHTML("afterbegin", `<div class="fx-earth"></div><div class="fx-mars-far">${MARS}</div><div class="fx-marsground"></div>`);
    sky.querySelectorAll(".altitude-marker").forEach((m, i) => {
      m.insertAdjacentHTML("afterbegin", MARK[i]); m.style.bottom = bottomOf(tOf(MARK_SCORE[i]), 26);
    });
    updateUI();
  });

  /* ---------- updateUI ---------- */
  const PHASE = ["", "Rakete startbereit", "Erdorbit erreicht", "Mond-Passage", "Mars-Anflug"];
  const prev = { score: 0, darts: 150, inner: 0, outer: 0, stutzen: 0, phase: 0 };
  const origUpdate = window.updateUI;
  window.updateUI = function () {
    origUpdate();
    if (!sky) return;
    const s = calculateMissionStats(), left = Math.max(0, MAX_DARTS - gameState.throws.length), t = tOf(s.score);
    rocket.style.bottom = bottomOf(t); sky.style.setProperty("--alt", t); rocket.style.setProperty("--base", s.score > 0 ? 1 : .35);
    tween($("missionScore"), prev.score, s.score); tween($("dartsLeft"), prev.darts, left);
    for (const [k, id] of [["innerBull", "countInnerBull"], ["outerBull", "countOuterBull"], ["stutzen", "countStutzen"]]) if (s[k] !== prev[k === "innerBull" ? "inner" : k === "outerBull" ? "outer" : k]) restart($(id), "fx-bump");
    const phase = s.score >= 400 ? 4 : s.score >= 300 ? 3 : s.score >= 200 ? 2 : s.score >= 100 ? 1 : 0;
    if (phase > prev.phase && !reduce) {
      const c = document.createElement("div"); c.className = "fx-callout"; c.textContent = PHASE[phase]; sky.appendChild(c); setTimeout(() => c.remove(), 2300);
      ring(false); const [x, y] = nozzle(); burst(x, y, { clip: true, count: 24, colors: COL.win, speed: 5, gravity: .05, life: 60, round: true });
    }
    Object.assign(prev, { score: s.score, darts: left, inner: s.innerBull, outer: s.outerBull, stutzen: s.stutzen, phase });
  };

  /* ---------- Ereignisse ---------- */
  const nozzle = () => { const r = rocket.getBoundingClientRect(); return [r.left + r.width / 2, r.bottom + 6]; };
  const mid = () => { const r = rocket.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  function ring(big) { const r = document.createElement("div"); r.className = "fx-ring" + (big ? " big" : ""); r.style.bottom = rocket.style.bottom; sky.appendChild(r); setTimeout(() => r.remove(), 1100); }
  function boost(m, ms) { rocket.style.setProperty("--boost", m); clearTimeout(rocket._bt); rocket._bt = setTimeout(() => rocket.style.setProperty("--boost", 1), ms); }
  function popup(text, color) { const p = document.createElement("div"); p.className = "fx-pts"; p.style.color = color; p.textContent = text; p.style.bottom = `calc(${rocket.style.bottom} + 62px)`; sky.appendChild(p); setTimeout(() => p.remove(), 1200); }

  const origRegister = window.registerThrow;
  window.registerThrow = function (hit) {
    const before = gameState.throws.length; origRegister(hit);
    const n = gameState.throws.length; if (n === before || !sky) return;
    const card = document.querySelectorAll("#lastThrows .throw-card")[(n - 1) % 3]; if (card) restart(card, "hit-" + hit.type);
    const [x, y] = nozzle();
    if (hit.type === "inner") { boost(2.6, 1100); restart(rocket, "kick"); ring(true); popup("+25", "#ffb277"); burst(x, y, { count: 44, colors: COL.fire, clip: true, speed: 7, gravity: .06, life: 55, angle: Math.PI / 2, spread: 1, round: true }); }
    else if (hit.type === "outer") { boost(1.9, 800); restart(rocket, "kick"); ring(false); popup("+10", "#7fc8ff"); burst(x, y, { count: 22, colors: COL.fire, clip: true, speed: 5.5, gravity: .06, life: 45, angle: Math.PI / 2, spread: 1, round: true }); }
    else if (hit.type === "stutzen") { boost(1.4, 500); popup("+2", "#6ee7a8"); burst(x, y, { count: 8, colors: COL.fire, clip: true, speed: 4, gravity: .05, life: 35, angle: Math.PI / 2, spread: .8, round: true }); }
    else if (hit.type === "scrap" && !reduce) { const d = document.createElement("div"); d.className = "fx-debris"; d.style.top = (15 + Math.random() * 60) + "%"; sky.appendChild(d); setTimeout(() => d.remove(), 1900); }
    else if (hit.type === "miss") {
      restart(rocket, "wobble"); boost(.3, 700); restart(sky, "fx-alarm"); popup("-2", "#ff5d4d");
      const [mx, my] = mid(); burst(mx, my, { count: 18, colors: COL.gas, speed: 2.6, gravity: -.02, life: 70, round: true });
    }
  };

  /* ---------- Missionsende ---------- */
  const origOutcome = window.triggerMissionOutcome;
  window.triggerMissionOutcome = function (success, stats) {
    origOutcome(success, stats);
    const modal = $("missionModal"); modal.classList.add(success ? "result-win" : "result-lose");
    if (reduce || !sky) return;
    modal.classList.add("hidden"); rocket.classList.remove("idle");
    const show = () => modal.classList.remove("hidden");
    if (success) {
      sky.classList.add("arriving"); boost(2.2, 1300);
      setTimeout(() => { rocket.style.setProperty("--base", 0); const [x, y] = nozzle(); burst(x, y, { count: 60, colors: COL.dust, speed: 6, gravity: .12, life: 80, angle: -Math.PI / 2, spread: Math.PI }); }, 2350);
      setTimeout(() => { for (const x of [innerWidth * .15, innerWidth * .85]) burst(x, innerHeight * .85, { count: 70, colors: COL.win, speed: 15, life: 130, angle: -Math.PI / 2, spread: Math.PI / 2, gravity: .3 }); }, 2500);
      setTimeout(show, 3600);
    } else {
      sky.classList.add("failing"); rocket.style.setProperty("--base", 0);
      setTimeout(() => {
        const [x, y] = mid(); rocket.style.visibility = "hidden"; ring(true);
        burst(x, y, { count: 130, colors: COL.fire.concat(COL.debris), speed: 11, gravity: .3, life: 100, round: true });
        restart(document.querySelector(".app"), "fx-shake"); restart(sky, "fx-alarm");
      }, 1550);
      setTimeout(show, 3000);
    }
  };
})();
