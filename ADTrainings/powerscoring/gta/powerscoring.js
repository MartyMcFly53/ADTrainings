"use strict";

let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);
let lastNumThrows = 0;

// Konfiguration (Standard: Zahl 20, All, 30 Darts)
let config = {
    targetNumber: 20,   // 1..20 oder 25 (Bull)
    multiplier: "all",  // "all", "double", "triple"
    limit: 30           // 30, 50, 100 oder 0 (Endlos)
};

let gameState = {
    started: false,
    finished: false,
    totalDarts: 0,
    totalScore: 0,
    currentTurnThrows: [],
    turnScore: 0,
    count180: 0,
    count100Plus: 0,
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
                gameState.turnScore = 0;
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

/* ---------- Zahlenraster 1-20 & Bull aufbauen ---------- */
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
function startPowerGame() {
    gameState = {
        started: true,
        finished: false,
        totalDarts: 0,
        totalScore: 0,
        currentTurnThrows: [],
        turnScore: 0,
        count180: 0,
        count100Plus: 0,
        waitingForTakeout: false
    };
    lastNumThrows = 0;

    const targetLabel = config.targetNumber === 25 ? "BULL" : config.targetNumber;
    const multLabel = config.multiplier === "all" ? "ALL" : (config.multiplier === "double" ? "ONLY DOUBLE" : "ONLY TRIPLE");
    document.getElementById("activeTargetBadge").textContent = `ZIEL: ${targetLabel} • ${multLabel}`;

    document.getElementById("dartsLabel").textContent = config.limit > 0 ? "DARTS ÜBRIG" : "DARTS GEWORFEN";
    document.getElementById("finishSessionBtn").textContent = config.limit > 0 ? "Vorzeitig beenden & speichern" : "Endlos-Session beenden & speichern";

    document.getElementById("startScreen").style.display = "none";
    document.getElementById("gameInterface").style.display = "block";
    updateUI();
}

/* ---------- Wurfverarbeitung & Filter ---------- */
function processThrow(throwData) {
    const rawName = throwData.name || throwData.segmentName || "MISS";
    let num = throwData.segmentNumber || 0;
    let mult = throwData.multiplier || 1;

    // Bull-Normalisierung (Autodarts sendet teils 25/50 oder SBULL/DBULL)
    const upper = rawName.toUpperCase();
    if (upper.includes("BULL") || num === 25 || num === 50) {
        num = 25;
        mult = (upper === "DBULL" || upper === "50" || throwData.segmentNumber === 50 || mult === 2) ? 2 : 1;
    }

    const validScore = calculateFilteredScore(num, mult, upper);

    gameState.totalDarts++;
    gameState.totalScore += validScore;
    gameState.turnScore += validScore;
    gameState.currentTurnThrows.push(validScore > 0 ? `${rawName} (+${validScore})` : `${rawName} (0)`);

    document.getElementById("gameStatusInfo").textContent = validScore > 0
        ? `Treffer! +${validScore} Punkte`
        : `Daneben (${rawName}) – zählt nicht`;

    updateUI();

    const isTurnComplete = gameState.currentTurnThrows.length === 3;
    const isLimitReached = config.limit > 0 && gameState.totalDarts >= config.limit;

    if (isTurnComplete || isLimitReached) {
        gameState.waitingForTakeout = true;
        checkTurnAchievements(gameState.turnScore);

        if (isLimitReached) {
            setTimeout(() => {
                finishAndSaveSession(true);
            }, gameState.turnScore === 180 ? 2600 : 800);
        }
    }
}

function calculateFilteredScore(num, mult, upperName) {
    if (upperName === "MISS" || upperName.startsWith("M") || mult === 0) return 0;

    // 1. Prüfen ob richtige Zielzahl getroffen wurde
    if (num !== config.targetNumber) return 0;

    // 2. Multiplikator-Modus prüfen
    if (config.multiplier === "double" && mult !== 2) return 0;
    if (config.multiplier === "triple" && mult !== 3) return 0;

    // Punkte berechnen (Bull = 25 / 50, sonst Zahl * Multiplikator)
    if (num === 25) return mult === 2 ? 50 : 25;
    return num * mult;
}

/* ---------- 100+ (klein) & 180 (groß + Sound) ---------- */
function checkTurnAchievements(turnScore) {
    if (turnScore === 180) {
        gameState.count180++;
        updateUI();
        trigger180Celebration();
    } else if (turnScore >= 100) {
        gameState.count100Plus++;
        trigger100PlusAnimation(turnScore);
    }
}

function trigger100PlusAnimation(score) {
    const card = document.getElementById("mainScoreCard");
    if (card) {
        card.classList.remove("flash-100");
        void card.offsetWidth;
        card.classList.add("flash-100");
    }
    showFlash(`POWER-AUFNAHME: ${score} PUNKTE!`);
}

function trigger180Celebration() {
    // Hier deine MP3-Datei hinterlegen (z.B. "../sounds/180.mp3" oder "180.mp3")
    try {
        const audio = new Audio("180.mp3");
        audio.play().catch(() => play180SynthFallback());
    } catch (e) {
        play180SynthFallback();
    }

    const overlay = document.getElementById("epicOverlay");
    const text = document.getElementById("epicOverlayText");
    text.textContent = "ONE HUNDRED EIGHTY!";
    overlay.classList.add("active");

    setTimeout(() => {
        overlay.classList.remove("active");
    }, 2600);
}

function play180SynthFallback() {
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
        if (!confirm("Session jetzt beenden und in der Statistik speichern?")) return;
    }

    gameState.finished = true;

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
        score: gameState.totalScore,
        average: avg,
        count180: gameState.count180,
        count100Plus: gameState.count100Plus
    };

    const history = JSON.parse(localStorage.getItem("powerScoringHistory") || "[]");
    history.push(entry);
    localStorage.setItem("powerScoringHistory", JSON.stringify(history));

    showFlash(`Gespeichert! ${gameState.totalScore} Pkt. (Avg: ${avg})`);
    setTimeout(() => {
        window.location.href = "powerscoring-stats.html";
    }, 1400);
}

/* ---------- UI Update ---------- */
function updateUI() {
    const dartsDisplay = config.limit > 0
        ? Math.max(0, config.limit - gameState.totalDarts)
        : gameState.totalDarts;

    document.getElementById("dartsLeft").textContent = dartsDisplay;
    document.getElementById("totalScore").textContent = gameState.totalScore;
    document.getElementById("turnScore").textContent = gameState.turnScore;
    document.getElementById("count180").textContent = gameState.count180;

    const avg = gameState.totalDarts > 0
        ? ((gameState.totalScore / gameState.totalDarts) * 3).toFixed(1)
        : "0.0";
    document.getElementById("threeDartAvg").textContent = avg;

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
    if (confirm("Training wirklich abbrechen, ohne zu speichern?")) {
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