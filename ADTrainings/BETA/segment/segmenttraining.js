"use strict";

let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);

let config = {
    targetNumber: 20,   // 1..20 oder 25 (Bull)
    multiplier: "all",  // "all", "double", "triple"
    limit: 30           // 30, 50, 100 oder 0 (Endlos)
};

let gameState = {
    started: false,
    finished: false,
    awaitingFinalTakeout: false, // Wartet nach letztem Dart auf Pfeileziehen
    waitingForTakeout: false,
    lastBoardThrowsCount: 0,     // Doppelte Sicherheit gegen doppelte Events
    currentTurnThrows: [],       // Objekte: { rawName, valid, mult, points }
    historyThrows: []            // Alle abgeschlossenen Runden für exakte Neuberechnung
};

let editingThrowIndex = null;

ws.onopen = () => updateBoardStatus("ready", false);
ws.onerror = () => updateBoardStatus("disconnected", false);
ws.onclose = () => updateBoardStatus("disconnected", false);

/* ---------- WebSocket mit doppelter Sicherheit beim Umschalten ---------- */
ws.onmessage = (msg) => {
    if (!gameState.started || gameState.finished) return;
    const event = JSON.parse(msg.data);
    if (!event.data) return;

    if (event.type === "state") {
        const data = event.data;
        const throws = data.throws || [];
        const status = data.status;

        // 1. Wenn wir auf das Ziehen der Pfeile warten (Rundenende oder Spielende)
        if (gameState.waitingForTakeout || gameState.awaitingFinalTakeout) {
            updateBoardStatus("takeout", true);

            // Doppelte Sicherheit: Erst freigeben, wenn das Board wirklich 0 Pfeile meldet
            // UND nicht mehr im Zustand "takeout" feststeckt (oder throws komplett geleert wurden)
            if (throws.length === 0 && status !== "takeout") {
                if (gameState.awaitingFinalTakeout) {
                    // Jetzt sind die letzten Pfeile gezogen -> Popup öffnen & speichern!
                    gameState.awaitingFinalTakeout = false;
                    gameState.waitingForTakeout = false;
                    completeAndShowEndPopup();
                    return;
                }

                // Regulärer Rundenwechsel: Aktuelle Aufnahme ins Archiv übernehmen
                gameState.historyThrows.push(...gameState.currentTurnThrows);
                gameState.currentTurnThrows = [];
                gameState.waitingForTakeout = false;
                gameState.lastBoardThrowsCount = 0;
                closeCorrectionModal();
                updateBoardStatus("ready", false);
                document.getElementById("gameStatusInfo").textContent = "Neue Aufnahme – bereit!";
                updateUI();
            }
            return;
        }

        updateBoardStatus(status, false);

        // 2. Neue Würfe nur verarbeiten, wenn wir im Wurfmodus sind und die Anzahl exakt steigt
        if (status !== "takeout" && throws.length > gameState.lastBoardThrowsCount && gameState.currentTurnThrows.length < 3) {
            // Falls mehrere Darts gleichzeitig ankamen, Schritt für Schritt verarbeiten
            while (gameState.lastBoardThrowsCount < throws.length && gameState.currentTurnThrows.length < 3) {
                const newThrow = throws[gameState.lastBoardThrowsCount];
                gameState.lastBoardThrowsCount++;
                processThrow(newThrow);
            }
        }
    }
};

function updateBoardStatus(status, waiting) {
    const badge = document.getElementById("boardStatusBadge");
    if (!badge) return;
    if (gameState.awaitingFinalTakeout) {
        badge.textContent = "Fertig! Bitte Pfeile ziehen";
        badge.className = "status-takeout";
    } else if (waiting || status === "takeout") {
        badge.textContent = "Bitte Pfeile ziehen";
        badge.className = "status-takeout";
    } else if (status === "disconnected") {
        badge.textContent = "Board getrennt";
        badge.className = "status-takeout";
    } else {
        badge.textContent = "Board: Bereit";
        badge.className = "status-ready";
    }
}

/* ---------- Zahlenraster 1-20 & Bull ---------- */
function buildTargetGrid() {
    const grid = document.getElementById("targetNumberGrid");
    if (!grid) return;
    grid.innerHTML = "";

    for (let i = 1; i <= 20; i++) {
        const card = document.createElement("div");
        card.className = "mode-card num-card" + (i === config.targetNumber ? " selected" : "");
        card.textContent = i;
        card.onclick = () => setTargetNumber(i, card);
        grid.appendChild(card);
    }

    const bullCard = document.createElement("div");
    bullCard.className = "mode-card num-card" + (config.targetNumber === 25 ? " selected" : "");
    bullCard.textContent = "BULL";
    bullCard.onclick = () => setTargetNumber(25, bullCard);
    grid.appendChild(bullCard);
}

function setTargetNumber(num, el) {
    config.targetNumber = num;
    updateCardSelection(el);
}

function setMultiplierMode(mult, el) {
    config.multiplier = mult;
    updateCardSelection(el);
}

function setLimit(limit, el) {
    config.limit = limit;
    updateCardSelection(el);
}

function updateCardSelection(el) {
    const parent = el.parentElement;
    parent.querySelectorAll(".mode-card").forEach(c => c.classList.remove("selected"));
    el.classList.add("selected");
}

/* ---------- Spielstart ---------- */
function startSegmentTraining() {
    gameState = {
        started: true,
        finished: false,
        awaitingFinalTakeout: false,
        waitingForTakeout: false,
        lastBoardThrowsCount: 0,
        currentTurnThrows: [],
        historyThrows: []
    };

    const isBull = config.targetNumber === 25;
    const targetLabel = isBull ? "BULL" : config.targetNumber;
    const multLabel = config.multiplier === "all" ? "ALL" : (config.multiplier === "double" ? "ONLY DOUBLE" : "ONLY TRIPLE");

    document.getElementById("activeTargetBadge").textContent = `ZIEL: ${targetLabel} • ${multLabel}`;
    document.getElementById("singleLabel").textContent = isBull ? "SINGLE BULL" : `SINGLE ${targetLabel}`;
    document.getElementById("doubleLabel").textContent = isBull ? "BULLSEYE" : `DOUBLE ${targetLabel}`;
    document.getElementById("tripleLabel").textContent = isBull ? "TRIPLE (N/A)" : `TRIPLE ${targetLabel}`;
    document.getElementById("tripleRateLabel").textContent = isBull ? "BULLSEYE-QUOTE" : `T${targetLabel}-QUOTE`;

    document.getElementById("dartsLabel").textContent = config.limit > 0 ? "DARTS ÜBRIG" : "DARTS GEWORFEN";
    document.getElementById("finishSessionBtn").textContent = config.limit > 0
        ? "Vorzeitig beenden & speichern"
        : "Endlos-Session beenden & speichern";

    document.getElementById("startScreen").style.display = "none";
    document.getElementById("gameInterface").style.display = "block";
    updateUI();
}

/* ---------- Wurfverarbeitung ---------- */
function processThrow(throwData) {
    const rawName = throwData.name || throwData.segmentName || "MISS";
    let num = throwData.segmentNumber || 0;
    let mult = throwData.multiplier || 1;

    const upper = rawName.toUpperCase();
    if (upper.includes("BULL") || num === 25 || num === 50) {
        num = 25;
        mult = (upper === "DBULL" || upper === "50" || throwData.segmentNumber === 50 || mult === 2) ? 2 : 1;
    }

    const evalRes = evaluateSegmentHit(num, mult, upper);
    gameState.currentTurnThrows.push({
        rawName: rawName,
        valid: evalRes.valid,
        mult: evalRes.valid ? mult : 0,
        points: evalRes.points
    });

    document.getElementById("gameStatusInfo").textContent = evalRes.valid
        ? `Treffer! ${rawName} (+${evalRes.points} Pkt.)`
        : `Miss (${rawName})`;

    updateUI();
    checkTurnStateAfterThrow();
}

function checkTurnStateAfterThrow() {
    const stats = getAggregatedStats();
    const isTurnComplete = gameState.currentTurnThrows.length === 3;
    const isLimitReached = config.limit > 0 && stats.totalDarts >= config.limit;

    if (isLimitReached) {
        gameState.awaitingFinalTakeout = true;
        gameState.waitingForTakeout = true;
        checkTurnCelebration();
        updateBoardStatus("takeout", true);
        document.getElementById("gameStatusInfo").textContent = "Letzter Dart! Pfeile prüfen oder ziehen für Auswertung...";
    } else if (isTurnComplete) {
        gameState.waitingForTakeout = true;
        checkTurnCelebration();
        updateBoardStatus("takeout", true);
        document.getElementById("gameStatusInfo").textContent = "Aufnahme beendet – Pfeile ziehen (oder oben korrigieren)";
    }
}

function evaluateSegmentHit(num, mult, upperName) {
    if (upperName === "MISS" || upperName.startsWith("M") || mult === 0) {
        return { valid: false, points: 0 };
    }
    if (num !== config.targetNumber) {
        return { valid: false, points: 0 };
    }
    if (config.multiplier === "double" && mult !== 2) return { valid: false, points: 0 };
    if (config.multiplier === "triple" && mult !== 3) return { valid: false, points: 0 };

    const points = num === 25 ? (mult === 2 ? 50 : 25) : (num * mult);
    return { valid: true, points };
}

/* ---------- Pfeilkorrektur ---------- */
function openCorrectionModal(index) {
    if (index >= gameState.currentTurnThrows.length) return;
    editingThrowIndex = index;

    const isBull = config.targetNumber === 25;
    const tLabel = isBull ? "BULL" : config.targetNumber;
    document.getElementById("corrModalTitle").textContent = `PFEIL ${index + 1} KORRIGIEREN (ZIEL: ${tLabel})`;

    const grid = document.getElementById("corrButtonsGrid");
    grid.innerHTML = "";

    const options = isBull
        ? [
            { label: "SINGLE BULL (25)", num: 25, mult: 1, name: "SBULL" },
            { label: "BULLSEYE (50)", num: 25, mult: 2, name: "DBULL" },
            { label: "MISS / ANDERES FELD", num: 0, mult: 0, name: "MISS", isMiss: true }
          ]
        : [
            { label: `SINGLE ${tLabel}`, num: config.targetNumber, mult: 1, name: `S${tLabel}` },
            { label: `DOUBLE ${tLabel}`, num: config.targetNumber, mult: 2, name: `D${tLabel}` },
            { label: `TRIPLE ${tLabel}`, num: config.targetNumber, mult: 3, name: `T${tLabel}` },
            { label: "MISS / ANDERES FELD", num: 0, mult: 0, name: "MISS", isMiss: true }
          ];

    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "corr-btn" + (opt.isMiss ? " miss" : "");
        btn.textContent = opt.label;
        btn.onclick = () => applyArrowCorrection(opt);
        grid.appendChild(btn);
    });

    document.getElementById("correctionModal").classList.add("open");
}

function closeCorrectionModal() {
    editingThrowIndex = null;
    document.getElementById("correctionModal").classList.remove("open");
}

function applyArrowCorrection(opt) {
    if (editingThrowIndex === null || editingThrowIndex >= gameState.currentTurnThrows.length) return;

    const evalRes = evaluateSegmentHit(opt.num, opt.mult, opt.name);
    gameState.currentTurnThrows[editingThrowIndex] = {
        rawName: opt.name,
        valid: evalRes.valid,
        mult: evalRes.valid ? opt.mult : 0,
        points: evalRes.points
    };

    closeCorrectionModal();
    updateUI();
    showFlash(`Pfeil ${editingThrowIndex + 1} auf ${opt.name} korrigiert!`);
}

/* ---------- Gesamtwerte live aus Archiv + aktueller Aufnahme berechnen ---------- */
function getAggregatedStats() {
    const all = [...gameState.historyThrows, ...gameState.currentTurnThrows];
    const totalDarts = all.length;
    let validHits = 0;
    let countSingle = 0;
    let countDouble = 0;
    let countTriple = 0;
    let totalScore = 0;

    all.forEach(t => {
        if (t.valid) {
            validHits++;
            totalScore += t.points;
            if (t.mult === 1) countSingle++;
            else if (t.mult === 2) countDouble++;
            else if (t.mult === 3) countTriple++;
        }
    });

    const misses = totalDarts - validHits;
    const hitRate = totalDarts > 0 ? Number(((validHits / totalDarts) * 100).toFixed(1)) : 0.0;
    // Bei Bull gilt Bullseye (mult === 2) als Top-Treffer-Quote, sonst Triple (mult === 3)
    const topHits = config.targetNumber === 25 ? countDouble : countTriple;
    const tripleRate = totalDarts > 0 ? Number(((topHits / totalDarts) * 100).toFixed(1)) : 0.0;
    const average = totalDarts > 0 ? Number(((totalScore / totalDarts) * 3).toFixed(1)) : 0.0;

    return {
        totalDarts, validHits, misses, countSingle, countDouble, countTriple,
        totalScore, hitRate, tripleRate, average
    };
}

/* ---------- Animationen ---------- */
function checkTurnCelebration() {
    const targetLabel = config.targetNumber === 25 ? "BULL" : config.targetNumber;
    const turnTriples = gameState.currentTurnThrows.filter(t => t.valid && t.mult === 3).length;
    const turnBullseyes = gameState.currentTurnThrows.filter(t => t.valid && config.targetNumber === 25 && t.mult === 2).length;
    const turnValids = gameState.currentTurnThrows.filter(t => t.valid).length;

    if (turnTriples === 3 || turnBullseyes === 3) {
        const banner = turnBullseyes === 3
            ? "TRIPLE BULLSEYE! (150)"
            : `3x TRIPLE ${targetLabel}! (${config.targetNumber * 9})`;
        triggerMajorCelebration(banner);
    } else if (turnTriples === 2 || turnBullseyes === 2 || turnValids === 3) {
        const card = document.getElementById("mainScoreCard");
        if (card) {
            card.classList.remove("flash-100");
            void card.offsetWidth;
            card.classList.add("flash-100");
        }
        showFlash(`STARKE SERIE AUF ${targetLabel}!`);
    }
}

function triggerMajorCelebration(bannerText) {
    try {
        const audio = new Audio("../sounds/180.mp3");
        audio.play().catch(() => playSynthFallback());
    } catch (e) {
        playSynthFallback();
    }

    const overlay = document.getElementById("epicOverlay");
    const text = document.getElementById("epicOverlayText");
    text.textContent = bannerText;
    overlay.classList.add("active");
    setTimeout(() => { overlay.classList.remove("active"); }, 2600);
}

function playSynthFallback() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
            gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.5);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.12);
            osc.stop(ctx.currentTime + idx * 0.12 + 0.5);
        });
    } catch (e) {}
}

/* ---------- Abschluss & Endstatistik-Popup ---------- */
function manualFinishSession() {
    const stats = getAggregatedStats();
    if (stats.totalDarts === 0) {
        alert("Es wurden noch keine Darts geworfen.");
        return;
    }
    if (!confirm("Segmenttraining jetzt beenden und auswerten?")) return;
    completeAndShowEndPopup();
}

function completeAndShowEndPopup() {
    if (gameState.finished) return;
    gameState.finished = true;
    closeCorrectionModal();

    const stats = getAggregatedStats();
    const isBull = config.targetNumber === 25;
    const targetLabel = isBull ? "BULL" : String(config.targetNumber);
    const multLabel = config.multiplier === "all" ? "All" : (config.multiplier === "double" ? "Only Double" : "Only Triple");
    const modeLabel = config.limit > 0 ? `${config.limit} Darts` : `Endlos (${stats.totalDarts} Darts)`;
    const tripleLabelName = isBull ? "Bullseye-Quote" : `T${targetLabel}-Quote`;

    const now = new Date();
    const entry = {
        timestamp: now.getTime(),
        date: now.toLocaleString("de-DE"),
        shortDate: now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " " + now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        target: targetLabel,
        filter: multLabel,
        mode: modeLabel,
        darts: stats.totalDarts,
        validHits: stats.validHits,
        misses: stats.misses,
        hitRate: stats.hitRate,
        tripleRate: stats.tripleRate,
        countSingle: stats.countSingle,
        countDouble: stats.countDouble,
        countTriple: stats.countTriple,
        score: stats.totalScore,
        average: stats.average
    };

    const history = JSON.parse(localStorage.getItem("segmentTrainingHistory") || "[]");
    history.push(entry);
    localStorage.setItem("segmentTrainingHistory", JSON.stringify(history));

    // Endstatistik-Popup befüllen und anzeigen
    document.getElementById("endModalBadge").textContent = `ZIEL: ${targetLabel} (${multLabel}) • ${modeLabel}`;
    document.getElementById("endSummaryGrid").innerHTML = `
        <div class="summary-item">
            <div class="s-lbl">TREFFERQUOTE</div>
            <div class="s-val" style="color: #ffe600;">${stats.hitRate.toFixed(1)}%</div>
        </div>
        <div class="summary-item">
            <div class="s-lbl">${tripleLabelName.toUpperCase()}</div>
            <div class="s-val" style="color: #00e5ff;">${stats.tripleRate.toFixed(1)}%</div>
        </div>
        <div class="summary-item">
            <div class="s-lbl">TREFFER / MISSES</div>
            <div class="s-val">${stats.validHits} / <span style="color: #ff007f;">${stats.misses}</span></div>
        </div>
        <div class="summary-item">
            <div class="s-lbl">S / D / T</div>
            <div class="s-val" style="font-size: 18px;">${stats.countSingle} / ${stats.countDouble} / ${stats.countTriple}</div>
        </div>
        <div class="summary-item">
            <div class="s-lbl">GESAMTPUNKTE</div>
            <div class="s-val">${stats.totalScore}</div>
        </div>
        <div class="summary-item">
            <div class="s-lbl">3-DART-AVERAGE</div>
            <div class="s-val">${stats.average.toFixed(1)}</div>
        </div>
    `;

    document.getElementById("endStatsModal").classList.add("open");
}

/* ---------- UI Update ---------- */
function updateUI() {
    const stats = getAggregatedStats();

    const dartsDisplay = config.limit > 0
        ? Math.max(0, config.limit - stats.totalDarts)
        : stats.totalDarts;

    document.getElementById("dartsLeft").textContent = dartsDisplay;
    document.getElementById("validHitsDisplay").textContent = `${stats.validHits} / ${stats.totalDarts}`;
    document.getElementById("hitRateDisplay").textContent = `${stats.hitRate.toFixed(1)}%`;
    document.getElementById("tripleRateDisplay").textContent = `${stats.tripleRate.toFixed(1)}%`;
    document.getElementById("threeDartAvg").textContent = `${stats.average.toFixed(1)} (${stats.totalScore})`;

    document.getElementById("countSingle").textContent = stats.countSingle;
    document.getElementById("countDouble").textContent = stats.countDouble;
    document.getElementById("countTriple").textContent = stats.countTriple;
    document.getElementById("countMisses").textContent = stats.misses;

    for (let i = 0; i < 3; i++) {
        const box = document.getElementById(`throwBox${i + 1}`);
        const val = document.getElementById(`throw${i + 1}`);
        const hint = document.getElementById(`editHint${i + 1}`);
        const t = gameState.currentTurnThrows[i];

        if (t) {
            box.classList.add("editable");
            val.textContent = t.valid ? `${t.rawName} (+${t.points})` : `${t.rawName} (Miss)`;
            val.style.color = t.valid ? "#ffe600" : "#ff007f";
            hint.textContent = "Klicken zum Ändern";
        } else {
            box.classList.remove("editable");
            val.textContent = "-";
            val.style.color = "#fff";
            hint.textContent = "";
        }
    }
}

function abortTraining() {
    const stats = getAggregatedStats();
    if (stats.totalDarts === 0) {
        location.reload();
        return;
    }
    if (confirm("Segmenttraining wirklich abbrechen, ohne zu speichern?")) {
        location.reload();
    }
}

function resetAutodartsBoard() {
    fetch(`http://${boardIp}:3180/api/reset`, { method: "POST" }).catch(() => {});
    showFlash("Board-Reset gesendet");
}

function changeBoardIp() {
    const newIp = prompt("Gib die IP-Adresse deines Autodarts Boardmanagers ein:", boardIp);
    if (newIp && newIp.trim() !== "") {
        localStorage.setItem("autodarts_ip", newIp.trim());
        showFlash("IP gespeichert! Seite wird neu geladen...");
        setTimeout(() => location.reload(), 1000);
    }
}

function showFlash(text) {
    const flash = document.getElementById("flashMessage");
    if (!flash) return;
    flash.textContent = text;
    flash.style.display = "block";
    clearTimeout(flash._timer);
    flash._timer = setTimeout(() => { flash.style.display = "none"; }, 2200);
}

document.addEventListener("DOMContentLoaded", buildTargetGrid);