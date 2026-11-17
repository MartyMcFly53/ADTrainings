"use strict";

let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);
let lastNumThrows = 0;

let config = {
    targetNumber: 20,   // 1..20 oder 25 (Bull)
    multiplier: "all",  // "all", "double", "triple"
    limit: 30           // 30, 50, 100 oder 0 (Endlos)
};

let gameState = {
    started: false,
    finished: false,
    totalDarts: 0,
    validHits: 0,
    countSingle: 0,
    countDouble: 0,
    countTriple: 0,
    totalScore: 0,
    currentTurnThrows: [],
    turnValidHits: 0,
    turnTriples: 0,
    turnDoubleBulls: 0,
    waitingForTakeout: false
};

ws.onopen = () => updateBoardStatus("ready", false);
ws.onerror = () => updateBoardStatus("disconnected", false);
ws.onclose = () => updateBoardStatus("disconnected", false);

ws.onmessage = (msg) => {
    if (!gameState.started || gameState.finished) return;
    const event = JSON.parse(msg.data);
    if (!event.data) return;

    if (event.type === "state") {
        const data = event.data;
        const throws = data.throws || [];
        const status = data.status;

        if (gameState.waitingForTakeout) {
            if (throws.length === 0) {
                gameState.waitingForTakeout = false;
                lastNumThrows = 0;
                gameState.currentTurnThrows = [];
                gameState.turnValidHits = 0;
                gameState.turnTriples = 0;
                gameState.turnDoubleBulls = 0;
                updateUI();
            }
            updateBoardStatus(status, gameState.waitingForTakeout);
            return;
        }

        updateBoardStatus(status, false);

        if (throws.length > lastNumThrows) {
            lastNumThrows = throws.length;
            const newThrow = throws[throws.length - 1];
            processThrow(newThrow);
        }
    }
};

function updateBoardStatus(status, waiting) {
    const badge = document.getElementById("boardStatusBadge");
    if (!badge) return;
    if (waiting || status === "takeout") {
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
        totalDarts: 0,
        validHits: 0,
        countSingle: 0,
        countDouble: 0,
        countTriple: 0,
        totalScore: 0,
        currentTurnThrows: [],
        turnValidHits: 0,
        turnTriples: 0,
        turnDoubleBulls: 0,
        waitingForTakeout: false
    };
    lastNumThrows = 0;

    const isBull = config.targetNumber === 25;
    const targetLabel = isBull ? "BULL" : config.targetNumber;
    const multLabel = config.multiplier === "all" ? "ALL" : (config.multiplier === "double" ? "ONLY DOUBLE" : "ONLY TRIPLE");

    document.getElementById("activeTargetBadge").textContent = `ZIEL: ${targetLabel} • ${multLabel}`;
    document.getElementById("singleLabel").textContent = isBull ? "SINGLE BULL (25)" : `SINGLE ${targetLabel}`;
    document.getElementById("doubleLabel").textContent = isBull ? "BULLSEYE (50)" : `DOUBLE ${targetLabel}`;
    document.getElementById("tripleLabel").textContent = isBull ? "TRIPLE (N/A)" : `TRIPLE ${targetLabel}`;

    document.getElementById("dartsLabel").textContent = config.limit > 0 ? "DARTS ÜBRIG" : "DARTS GEWORFEN";
    document.getElementById("finishSessionBtn").textContent = config.limit > 0
        ? "Vorzeitig beenden & speichern"
        : "Endlos-Session beenden & speichern";

    document.getElementById("startScreen").style.display = "none";
    document.getElementById("gameInterface").style.display = "block";
    updateUI();
}

/* ---------- Wurfverarbeitung & Segment-Auswertung ---------- */
function processThrow(throwData) {
    const rawName = throwData.name || throwData.segmentName || "MISS";
    let num = throwData.segmentNumber || 0;
    let mult = throwData.multiplier || 1;

    const upper = rawName.toUpperCase();
    if (upper.includes("BULL") || num === 25 || num === 50) {
        num = 25;
        mult = (upper === "DBULL" || upper === "50" || throwData.segmentNumber === 50 || mult === 2) ? 2 : 1;
    }

    const result = evaluateSegmentHit(num, mult, upper);

    gameState.totalDarts++;
    if (result.valid) {
        gameState.validHits++;
        gameState.totalScore += result.points;
        gameState.turnValidHits++;

        if (mult === 1) gameState.countSingle++;
        else if (mult === 2) {
            gameState.countDouble++;
            if (num === 25) gameState.turnDoubleBulls++;
        } else if (mult === 3) {
            gameState.countTriple++;
            gameState.turnTriples++;
        }

        gameState.currentTurnThrows.push(`${rawName} (+${result.points})`);
        document.getElementById("gameStatusInfo").textContent = `Treffer! ${rawName} (+${result.points} Pkt.)`;
    } else {
        gameState.currentTurnThrows.push(`${rawName} (0)`);
        document.getElementById("gameStatusInfo").textContent = `Daneben (${rawName})`;
    }

    updateUI();

    const isTurnComplete = gameState.currentTurnThrows.length === 3;
    const isLimitReached = config.limit > 0 && gameState.totalDarts >= config.limit;

    if (isTurnComplete || isLimitReached) {
        gameState.waitingForTakeout = true;
        const hadMajor = checkTurnCelebration();

        if (isLimitReached) {
            setTimeout(() => {
                finishAndSaveSession(true);
            }, hadMajor ? 2600 : 800);
        }
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

/* ---------- Animationen: Starke Aufnahme (klein) & 3x Triple / 3x Bullseye (groß + Sound) ---------- */
function checkTurnCelebration() {
    const targetLabel = config.targetNumber === 25 ? "BULL" : config.targetNumber;

    // Große Gala: 3x Triple auf dem gewählten Zielsegment (oder 3x Bullseye)
    if (gameState.turnTriples === 3 || gameState.turnDoubleBulls === 3) {
        const banner = gameState.turnDoubleBulls === 3
            ? "TRIPLE BULLSEYE! (150)"
            : `3x TRIPLE ${targetLabel}! (${config.targetNumber * 9})`;
        triggerMajorCelebration(banner);
        return true;
    }

    // Kleine Animation: 2x Triple/Bullseye oder alle 3 Darts gültige Treffer auf dem Segment
    if (gameState.turnTriples === 2 || gameState.turnDoubleBulls === 2 || gameState.turnValidHits === 3) {
        triggerSmallBurst(`STARKE SERIE AUF ${targetLabel}!`);
    }
    return false;
}

function triggerSmallBurst(message) {
    const card = document.getElementById("mainScoreCard");
    if (card) {
        card.classList.remove("flash-100");
        void card.offsetWidth;
        card.classList.add("flash-100");
    }
    showFlash(message);
}

function triggerMajorCelebration(bannerText) {
    // Pfad zu deiner MP3-Datei aus dem sounds-Ordner anpassen (z. B. "../sounds/180.mp3")
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

    setTimeout(() => {
        overlay.classList.remove("active");
    }, 2600);
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

/* ---------- Beenden & in Statistik speichern ---------- */
function finishAndSaveSession(autoFinished = false) {
    if (gameState.finished) return;

    if (!autoFinished) {
        if (gameState.totalDarts === 0) {
            alert("Es wurden noch keine Darts geworfen.");
            return;
        }
        if (!confirm("Segmenttraining jetzt beenden und in der Statistik speichern?")) return;
    }

    gameState.finished = true;

    const hitRate = gameState.totalDarts > 0
        ? Number(((gameState.validHits / gameState.totalDarts) * 100).toFixed(1))
        : 0.0;

    const avg = gameState.totalDarts > 0
        ? Number(((gameState.totalScore / gameState.totalDarts) * 3).toFixed(1))
        : 0.0;

    const targetLabel = config.targetNumber === 25 ? "BULL" : String(config.targetNumber);
    const multLabel = config.multiplier === "all" ? "All" : (config.multiplier === "double" ? "Only Double" : "Only Triple");
    const modeLabel = config.limit > 0 ? `${config.limit} Darts` : `Endlos (${gameState.totalDarts} Darts)`;

    const entry = {
        date: new Date().toLocaleString("de-DE"),
        target: targetLabel,
        filter: multLabel,
        mode: modeLabel,
        darts: gameState.totalDarts,
        validHits: gameState.validHits,
        hitRate: hitRate,
        countSingle: gameState.countSingle,
        countDouble: gameState.countDouble,
        countTriple: gameState.countTriple,
        score: gameState.totalScore,
        average: avg
    };

    const history = JSON.parse(localStorage.getItem("segmentTrainingHistory") || "[]");
    history.push(entry);
    localStorage.setItem("segmentTrainingHistory", JSON.stringify(history));

    showFlash(`Gespeichert! Quote: ${hitRate}% (${gameState.validHits}/${gameState.totalDarts})`);
    setTimeout(() => {
        window.location.href = "segmenttraining-stats.html";
    }, 1400);
}

/* ---------- UI Update ---------- */
function updateUI() {
    const dartsDisplay = config.limit > 0
        ? Math.max(0, config.limit - gameState.totalDarts)
        : gameState.totalDarts;

    document.getElementById("dartsLeft").textContent = dartsDisplay;
    document.getElementById("validHitsDisplay").textContent = `${gameState.validHits} / ${gameState.totalDarts}`;

    const hitRate = gameState.totalDarts > 0
        ? ((gameState.validHits / gameState.totalDarts) * 100).toFixed(1)
        : "0.0";
    document.getElementById("hitRateDisplay").textContent = `${hitRate}%`;

    document.getElementById("totalScore").textContent = gameState.totalScore;
    const avg = gameState.totalDarts > 0
        ? ((gameState.totalScore / gameState.totalDarts) * 3).toFixed(1)
        : "0.0";
    document.getElementById("threeDartAvg").textContent = avg;

    document.getElementById("countSingle").textContent = gameState.countSingle;
    document.getElementById("countDouble").textContent = gameState.countDouble;
    document.getElementById("countTriple").textContent = gameState.countTriple;

    for (let i = 0; i < 3; i++) {
        const box = document.getElementById(`throw${i + 1}`);
        box.textContent = gameState.currentTurnThrows[i] || "-";
    }
}

function abortTraining() {
    if (gameState.totalDarts === 0) {
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