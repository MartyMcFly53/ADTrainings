"use strict";
/* ==========================================
   CASTLE FX – SVG-Burg, Icons und Animationen.
   Hängt sich an castle.js, die Spiellogik bleibt unverändert. Nach castle.js laden.
========================================== */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); el.addEventListener("animationend", () => el.classList.remove(cls), { once: true }); };

  /* ---------- Icons (Linien-SVG, Farbe über currentColor) ---------- */
  const ico = (d) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    1: ico('<path d="M40 8L16 32" stroke-width="3.8"/><path d="M12 24l12 12M16 32l-8 8"/><circle cx="7" cy="41" r="2"/>'),
    2: ico('<path d="M5 40h38M12 40l12-14 12 14M10 13l17 15"/><path d="M6 11h9l-2 6H8z"/><circle cx="14" cy="42" r="3"/><circle cx="34" cy="42" r="3"/><circle cx="40" cy="14" r="3"/>'),
    3: ico('<path d="M24 5l15 5v12c0 10-7 17-15 21C16 39 9 32 9 22V10z"/><path d="M24 12v26M14 21h20"/>'),
    4: ico('<path d="M24 5c2 8 11 12 11 23a11 11 0 0 1-22 0c0-5 3-8 5-11 0 4 2 6 4 6 0-6-1-11 2-18z"/><path d="M24 40c-4 0-6-3-6-6 2 1 4 0 5-3 3 2 7 4 7 9z"/>'),
    crest: ico('<path d="M6 41V19h6v-6h5v6h4v-6h5v6h4v-6h5v6h6v22zM20 41V31a4 4 0 0 1 8 0v10"/>')
  };

  /* ---------- Burg als SVG aus Einzelteilen (Stufe 0 = Ruine … 4 = uneinnehmbar) ---------- */
  function castleSVG(stage) {
    let n = 0; const P = (s) => `<g class="part" style="--i:${n++}">${s}</g>`;
    const S = "#9a917b", D = "#6b6452", L = "#b8af97", R = stage === 4 ? "#d9b448" : "#8e2a24";
    const brick = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${S}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#brk)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${D}" stroke-width="1.2"/>`;
    const cren = (x, y, w) => { let s = ""; for (let c = x; c < x + w - 4; c += 10) s += `<rect x="${c}" y="${y - 7}" width="6" height="7" fill="${L}" stroke="${D}" stroke-width=".8"/>`; return s; };
    const win = (x, y, lit) => `<path class="${lit ? "glow" : ""}" d="M${x} ${y + 9}V${y + 3}a3 3 0 0 1 6 0V${y + 9}z" fill="${lit ? "#ffcf6a" : "#2a241a"}"/>`;
    const roof = (x, y, w, c) => `<path d="M${x - 3} ${y}L${x + w / 2} ${y - 26}L${x + w + 3} ${y}Z" fill="${c}" stroke="#3a0f0c" stroke-width="1"/>`;
    const flag = (x, y, c) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 17}" stroke="#3a2a1a" stroke-width="1.6"/><path class="flag" d="M${x} ${y - 17}h15l-4 4.5 4 4.5H${x}z" fill="${c}"/>`;
    const gate = `<path d="M88 135V117a12 12 0 0 1 24 0V135z" fill="#3a2a18"/><path d="M88 135V117a12 12 0 0 1 24 0" fill="none" stroke="${D}" stroke-width="3"/><path d="M94 135v-18M100 135v-20M106 135v-18" stroke="#1e150c" stroke-width="1.2"/>`;
    let g = "";
    if (stage === 0) {
      g = P(`<rect x="58" y="124" width="28" height="11" fill="${S}"/>`) + P(`<rect x="94" y="120" width="22" height="15" fill="${D}" transform="rotate(-6 105 128)"/>`) +
          P(`<rect x="120" y="127" width="22" height="8" fill="${L}"/>`) + P(`<rect x="74" y="113" width="18" height="11" fill="${L}" transform="rotate(8 83 118)"/>`);
    } else if (stage === 1) {
      g = P(brick(40, 112, 120, 23) + `<path d="M40 112l14-7 10 7 12-6 14 6 20-5 12 5 18-4v4z" fill="${L}"/>`) + P(gate) + P(brick(16, 96, 32, 39) + `<path d="M16 96l8-6 7 4 9-7 8 9z" fill="${L}"/>`);
    } else if (stage === 2) {
      g = P(brick(40, 95, 120, 40) + cren(40, 95, 120)) + P(brick(14, 62, 36, 73) + cren(14, 62, 36) + win(29, 80, false)) +
          P(brick(150, 88, 36, 47) + `<path d="M150 88l8-8 7 5 8-9 8 7 5-5v10z" fill="${L}"/>`) + P(gate) + P(`<path d="M122 100l-5 12 6 6-4 12" stroke="#2a241a" stroke-width="1.8" fill="none"/>`);
    } else {
      g = P(brick(40, 95, 120, 40) + cren(40, 95, 120)) +
          P(brick(14, 58, 36, 77) + roof(14, 58, 36, "#8e2a24") + win(29, 76, stage === 4)) + P(brick(150, 58, 36, 77) + roof(150, 58, 36, "#8e2a24") + win(165, 76, stage === 4)) +
          P(brick(78, 44, 44, 51) + roof(78, 44, 44, R) + win(97, 62, true)) + P(gate) +
          P(flag(100, 18, "#d9b448") + flag(32, 32, "#8e2a24") + flag(168, 32, "#8e2a24"));
    }
    return `<svg class="fx-castle" viewBox="-6 0 212 150"><defs><pattern id="brk" width="12" height="8" patternUnits="userSpaceOnUse"><path d="M0 0H12M0 4H12M6 0V4M0 4V8M12 4V8" stroke="rgba(0,0,0,.25)" stroke-width=".8" fill="none"/></pattern></defs>` +
      (stage === 4 ? `<ellipse cx="100" cy="100" rx="105" ry="60" fill="rgba(246,217,122,.16)"/>` : "") + `<ellipse cx="100" cy="137" rx="106" ry="8" fill="rgba(0,0,0,.35)"/>${g}</svg>`;
  }
  const stageOf = (s) => s >= 90 ? 4 : s >= 70 ? 3 : s >= 50 ? 2 : s >= 30 ? 1 : 0;
  function setCastle(el, stage, build) {
    el.innerHTML = castleSVG(stage);
    if (build && !reduce) { const svg = el.firstChild; svg.classList.add("building"); setTimeout(() => svg.classList.remove("building"), 1800); }
  }

  /* ---------- Partikel ---------- */
  const cv = document.createElement("canvas"); cv.id = "fxCanvas"; document.body.appendChild(cv);
  const ctx = cv.getContext("2d"); let parts = [], raf = 0;
  const fit = () => { cv.width = innerWidth; cv.height = innerHeight; }; fit(); addEventListener("resize", fit);
  const COL = { dust: ["#b8af97", "#8a8268", "#6b6452"], gold: ["#f6d97a", "#d9b448", "#fff3c4"], ember: ["#ffb347", "#e8651c", "#c4392f"], ash: ["#5b5446", "#3a3228", "#8a8268"], win: ["#f6d97a", "#d9b448", "#9fcf64", "#c4392f", "#eadcb8"] };
  function burst(x, y, o) {
    if (reduce) return;
    for (let i = 0; i < o.count; i++) {
      const a = (o.angle ?? 0) + (Math.random() - .5) * (o.spread ?? Math.PI * 2), v = (o.speed ?? 6) * (.4 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.gravity ?? .25, s: 3 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .4,
        life: 0, max: o.life ?? 80, c: o.colors[i % o.colors.length], round: !!o.round });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => p.life++ < p.max && p.y < cv.height + 20);
    for (const p of parts) {
      p.vy += p.g; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max); ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 6.3); ctx.fill(); } else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) ctx.clearRect(0, 0, cv.width, cv.height);
  }

  /* ---------- Zahlen hochzählen ---------- */
  function tween(el, from, to, suffix = "") {
    if (reduce || from === to) return;
    const t0 = performance.now();
    (function step(t) { const k = Math.min(1, (t - t0) / 500); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))) + suffix; if (k < 1) requestAnimationFrame(step); })(t0);
    restart(el, "fx-bump");
  }

  /* ---------- Seite aufbauen ---------- */
  let art, barFill, curStage = null;
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".diff-card > div:first-child").forEach((d, i) => { d.innerHTML = `<span class="fx-icon">${ICONS[i + 1]}</span>`; });
    const h1 = document.querySelector(".module-header h1");
    if (h1) h1.insertAdjacentHTML("afterbegin", `<span class="h1-crest" style="color:#d9b448">${ICONS.crest}</span>`);
    if ($("castleGraphic")) {
      art = document.createElement("div"); art.className = "castle-art"; art.id = "fxCastle"; $("castleGraphic").after(art);
      const bar = document.createElement("div"); bar.className = "fx-bar"; bar.innerHTML = "<i></i>"; $("stabilityDisplay").after(bar); barFill = bar.firstChild;
      const stage = document.createElement("div"); stage.className = "siege-stage"; stage.innerHTML = '<div class="siege-castle" id="siegeCastle"></div>';
      $("siegeAttackerText").after(stage); stage.appendChild($("siegeAnimationIcon"));
    }
  });

  /* ---------- updateUI ---------- */
  const prev = { score: 0, stab: 0, darts: 100, towers: 0, segments: 0, stones: 0, weak: 0 };
  const origUpdate = window.updateUI;
  window.updateUI = function () {
    origUpdate();
    const s = calculateCastleStats(), left = Math.max(0, MAX_DARTS - gameState.throws.length), stab = $("stabilityDisplay");
    tween($("castleScore"), prev.score, s.score); tween(stab, prev.stab, s.stability, "%"); tween($("dartsLeft"), prev.darts, left);
    for (const [k, id] of [["towers", "countTowers"], ["segments", "countSegments"], ["stones", "countStones"], ["weak", "countWeak"]]) if (s[k] !== prev[k]) restart($(id), "fx-bump");
    if (barFill) { barFill.style.width = s.stability + "%"; barFill.parentNode.style.color = stab.style.color; }
    const st = stageOf(s.stability);
    if (art && st !== curStage) { setCastle(art, st, true); curStage = st; }
    Object.assign(prev, { score: s.score, stab: s.stability, darts: left, towers: s.towers, segments: s.segments, stones: s.stones, weak: s.weak });
  };

  /* ---------- Wurf ---------- */
  const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * .55]; };
  const origRegister = window.registerThrow;
  window.registerThrow = function (hit) {
    const before = gameState.throws.length; origRegister(hit);
    const n = gameState.throws.length; if (n === before || !art) return;
    const card = document.querySelectorAll("#lastThrows .throw-card")[(n - 1) % 3]; if (card) restart(card, "hit-" + hit.category);
    const host = art.closest(".castle-visual-card"), color = { tower: "#f6d97a", segment: "#d9b448", stone: "#d8c9a5", weak: "#c4392f" }[hit.category];
    const pts = document.createElement("div"); pts.className = "fx-pts"; pts.style.color = color; pts.textContent = (hit.points > 0 ? "+" : "") + hit.points;
    host.appendChild(pts); setTimeout(() => pts.remove(), 1200);
    if (hit.category === "weak") {
      restart(art, "fx-hurt"); restart(document.querySelector(".app"), "fx-shake");
      const [x, y] = center(art); burst(x, y, { count: 18, colors: COL.dust.concat(COL.ember.slice(2)), speed: 4.5, gravity: .35, life: 55 });
      return;
    }
    if (reduce) return;
    const hr = host.getBoundingClientRect(), ar = art.getBoundingClientRect();
    const st = document.createElement("div"); st.className = "fx-stone" + (hit.category === "tower" ? " gold" : ""); st.style.setProperty("--drop", (ar.top - hr.top + ar.height * .35) + "px");
    host.appendChild(st);
    st.addEventListener("animationend", () => {
      st.remove(); restart(art, "fx-thump"); const [x, y] = center(art);
      burst(x, y, { count: 14, colors: COL.dust, speed: 3.5, gravity: .18, life: 45, angle: -Math.PI / 2, spread: Math.PI });
      if (hit.category !== "stone") burst(x, y - 20, { count: hit.category === "tower" ? 34 : 14, colors: COL.gold, speed: 7, round: true, life: 65, angle: -Math.PI / 2, spread: Math.PI });
    });
  };

  /* ---------- Belagerung ---------- */
  const origSiege = window.triggerSiegeCinematic;
  window.triggerSiegeCinematic = function () {
    origSiege();
    const s = calculateCastleStats(), box = document.querySelector(".siege-box"), stage = box.querySelector(".siege-stage"), host = $("siegeCastle");
    $("siegeAnimationIcon").innerHTML = ICONS[selectedDiff.level] || ICONS[4];
    setCastle(host, stageOf(s.stability), true);
    box.classList.remove("result-win", "result-lose");
    setTimeout(() => stage.classList.add("shaking"), 1300);
    setTimeout(() => {
      stage.classList.remove("shaking");
      const w = innerWidth, h = innerHeight;
      if (s.stability >= 70) {
        box.classList.add("result-win");
        for (const x of [w * .15, w * .85]) burst(x, h * .85, { count: s.stability >= 90 ? 90 : 45, colors: COL.win, speed: s.stability >= 90 ? 17 : 13, life: 140, angle: -Math.PI / 2, spread: Math.PI / 2, gravity: .3 });
      } else {
        box.classList.add("result-lose");
        const svg = host.firstChild; if (svg && !reduce) svg.classList.add("collapsing");
        const [x, y] = center(host); burst(x, y, { count: 70, colors: COL.dust.concat(COL.ember, COL.ash), speed: 8, gravity: .4, life: 110, round: true });
        setTimeout(() => setCastle(host, 0, true), 1400);
      }
    }, 1850);
  };

  const origStart = window.startCastleGame;
  window.startCastleGame = function () { origStart(); $("gameInterface").classList.add("fx-enter"); };
})();
