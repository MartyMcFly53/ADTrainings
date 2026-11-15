"use strict";

/* ==========================================
   CASTLE BUILDER CHALLENGE - LOGIK (Mit neuen Segmentregeln)
========================================== */

let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);
let lastNumThrows = 0;

let gameConfig = {
    difficultyName: "Anfänger",
    attackerName: "Goblins",
    difficultyLevel: 1,
    maxDarts: 100
};

let gameState = {
    gameStarted: false,
    gameOver: false,
    throws: [],
    waitingForTakeout: false
};

ws.onopen = () => updateBoardStatusUI("ready", false);
ws.onerror = (err) => console.error("WS Fehler:", err);
ws.onclose = () => {
    const badge = document.getElementById("boardStatusBadge");
    if (badge) { badge.textContent = "🔴 Board getrennt"; badge.className = "status-takeout"; }
};

ws.onmessage = (msg) => {
    if (!gameState.gameStarted || gameState.gameOver) return;
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
                updateUI();
            }
        }

        updateBoardStatusUI(status, gameState.waitingForTakeout);
        if (gameState.waitingForTakeout) return;

        if (throws.length > 0) {
            processStateEvent(data);
        }
    }
};

function updateBoardStatusUI(status, isWaitingTakeout) {
    const badge = document.getElementById("boardStatusBadge");
    if (!badge) return;
    if (isWaitingTakeout || status === "takeout") {
        badge.textContent = "🎯 Bitte Pfeile ziehen";
        badge.className = "status-takeout";
    } else {
        badge.textContent = "🟢 Board: Bereit";
        badge.className = "status-ready";
    }
}

function setDifficulty(name, attacker, level) {
    gameConfig.difficultyName = name;
    gameConfig.attackerName = attacker;
    gameConfig.difficultyLevel = level;

    document.querySelectorAll(".diff-card").forEach(card => card.classList.remove("selected"));
    event.currentTarget.classList.add("selected");
}

function startCastleGame() {
    gameState.gameStarted = true;
    gameState.gameOver = false;
    gameState.throws = [];
    gameState.waitingForTakeout = false;

    document.getElementById("startScreen").style.display = "none";
    document.getElementById("gameInterface").style.display = "block";
    document.getElementById("currentAttackerDisplay").innerText = `ANGREIFER: ${gameConfig.attackerName} (${gameConfig.difficultyName})`;

    updateUI();
    showFlash("Burgbau begonnen! Errichte deine Mauern!");
}

function processStateEvent(data) {
    const throws = data.throws;
    if (!Array.isArray(throws) || gameState.waitingForTakeout) return;

    if (throws.length < lastNumThrows) lastNumThrows = 0;
    if (throws.length <= lastNumThrows) return;

    lastNumThrows = throws.length;
    const lastThrow = throws[throws.length - 1];
    const parsed = parseSegment(lastThrow);
    if (parsed) registerThrow(parsed);
}

// NEUE REGELN PRÜFEN:
// - Nur 18, 19, 20 (Single, Double, Triple)
// - Zusätzliche Doppel: D16, D8, D4, D2, D10
// - Bull / DBull
// - Alles andere = Schwachstelle (Miss)
function parseSegment(throwData) {
    const name = throwData.segmentName || "";
    const number = throwData.segmentNumber;
    const multiplier = throwData.multiplier;

    if (!name || name.startsWith("M") || name === "MISS" || multiplier === 0) {
        return { display: "MISS", type: "miss", points: -2 };
    }

    // Bull / DBull prüfen
    if (name.toUpperCase().includes("BULL") || number === 25 || number === 50 || name === "25" || name === "50") {
        const isDouble = (multiplier === 2 || name.toUpperCase() === "DBULL" || number === 50 || name === "50");
        return {
            display: isDouble ? "DBULL" : "SBULL",
            type: "king",
            points: isDouble ? 6 : 4
        };
    }

    // Erlaubte Hauptzahlen: 18, 19, 20
    const validNumbers = [18, 19, 20];
    // Zusätzliche erlaubte Doppel: 16, 8, 4, 2, 10
    const validSpecialDoubles = [16, 8, 4, 2, 10];

    const isTargetNumber = validNumbers.includes(number);
    const isSpecialDouble = (multiplier === 2 && validSpecialDoubles.includes(number));

    if (!isTargetNumber && !isSpecialDouble) {
        // Zählt nicht als Bauteil -> Schwachstelle
        return { display: name, type: "miss", points: -2 };
    }

    if (multiplier === 3 && isTargetNumber) {
        return { display: name, type: "tower", points: 3 };
    }
    if (multiplier === 2) {
        return { display: name, type: "segment", points: 2 };
    }
    if (multiplier === 1 && isTargetNumber) {
        return { display: name, type: "stone", points: 1 };
    }

    return { display: name, type: "miss", points: -2 };
}

function registerThrow(hit) {
    if (!gameState.gameStarted || gameState.gameOver || gameState.waitingForTakeout) return;

    gameState.throws.push({
        id: crypto.randomUUID(),
        value: hit.display,
        type: hit.type,
        points: hit.points
    });

    const dartsThrown = gameState.throws.length;

    if (dartsThrown % 3 === 0) {
        gameState.waitingForTakeout = true;
        showFlash("Aufnahme beendet – Pfeile ziehen");
    }

    updateUI();

    if (dartsThrown >= gameConfig.maxDarts) {
        triggerSiege();
    }
}

function calculateCastleStats() {
    let towers = 0, segments = 0, stones = 0, weak = 0, kings = 0;
    let totalScore = 0;

    gameState.throws.forEach(t => {
        totalScore += t.points;
        if (t.type === "tower") towers++;
        else if (t.type === "segment") segments++;
        else if (t.type === "stone") stones++;
        else if (t.type === "king") kings++;
        else if (t.type === "miss") weak++;
    });

    let stability = Math.max(0, Math.min(100, Math.round(((totalScore * 0.8) + (kings * 3)) / (gameConfig.maxDarts * 1.5) * 100) - (weak * 3)));
    stability = Math.max(5, Math.min(100, stability + 20));

    return { towers, segments, stones, weak, kings, totalScore, stability };
}

function updateUI() {
    const stats = calculateCastleStats();
    const dartsLeft = gameConfig.maxDarts - gameState.throws.length;

    document.getElementById("dartsLeft").innerText = Math.max(0, dartsLeft);
    document.getElementById("countTowers").innerText = stats.towers + stats.kings;
    document.getElementById("countSegments").innerText = stats.segments;
    document.getElementById("countStones").innerText = stats.stones;
    document.getElementById("countWeak").innerText = stats.weak;
    document.getElementById("castleScore").innerText = stats.totalScore;
    document.getElementById("stabilityDisplay").innerText = `${stats.stability}%`;

    const graphic = document.getElementById("castleGraphic");
    const statusText = document.getElementById("castleStatusText");
    if (stats.stability >= 80) {
        graphic.innerText = "👑🏰";
        statusText.innerText = "Prachtvolle Festung!";
    } else if (stats.stability >= 50) {
        graphic.innerText = "🏰";
        statusText.innerText = "Solide Wehranlage.";
    } else {
        graphic.innerText = "🏚️";
        statusText.innerText = "Achtung, viele Schwachstellen!";
    }

    renderCurrentThrows();
}

function renderCurrentThrows() {
    const container = document.getElementById("lastThrows");
    container.innerHTML = "";

    const remainder = gameState.throws.length % 3;
    const count = remainder === 0 && gameState.throws.length > 0 ? 3 : remainder;
    const startIdx = gameState.throws.length - count;
    const currentTurnThrows = gameState.throws.slice(startIdx >= 0 ? startIdx : 0);

    for (let i = 0; i < 3; i++) {
        const card = document.createElement("div");
        card.className = "stat-card throw-card";
        const t = currentTurnThrows[i];

        if (t) {
            const color = t.points > 0 ? (t.points >= 3 ? "#00ffa2" : "#00e5ff") : "#ff6565";
            card.innerHTML = `
                <div class="stat-label">Pfeil ${i + 1}</div>
                <div class="stat-value" style="color: ${color};">${t.value}</div>
            `;
            card.onclick = () => openCorrectionModal(t.id, t.value);
        } else {
            card.style.opacity = "0.5";
            card.innerHTML = `
                <div class="stat-label">Pfeil ${i + 1}</div>
                <div class="stat-value">-</div>
            `;
            card.onclick = () => openCorrectionModal(null, "MISS");
        }
        container.appendChild(card);
    }
}

// ==========================================
// CINEMATIC BELAGERUNG (ENDGAME)
// ==========================================
function triggerSiege() {
    gameState.gameOver = true;
    const stats = calculateCastleStats();

    document.getElementById("siegeAttackerText").innerText = `Der Gegner (${gameConfig.attackerName}) stürmt mit voller Wucht gegen deine Tore!`;
    document.getElementById("siegeModal").classList.remove("hidden");

    setTimeout(() => {
        document.getElementById("siegeAnimationIcon").innerText = "⚔️💥";
        document.getElementById("siegeStatusMessage").innerText = "Kämpfe toben an den Mauern...";
    }, 1500);

    setTimeout(() => {
        document.getElementById("siegeAnimationIcon").style.animation = "none";
        evaluateSiegeOutcome(stats);
    }, 3200);
}

function evaluateSiegeOutcome(stats) {
    const stab = stats.stability;
    let icon = "👑";
    let title = "";
    let desc = "";

    if (stab >= 90) {
        icon = "👑✨";
        title = "DIE BURG HÄLT STAND!";
        desc = `Unglaublich! Deine Festung ist uneinnehmbar. Der ${gameConfig.attackerName} wurde mit verheerenden Verlusten zurückgeschlagen.`;
    } else if (stab >= 70) {
        icon = "🏰🛡️";
        title = "SIEGE ABGEWEHRT!";
        desc = `Einige Außenmauern brachen unter dem Druck ein, aber der innere Burgkern hielt stand. Du hast überlebt!`;
    } else if (stab >= 50) {
        icon = "💥🏚️";
        title = "SCHWER BESCHÄDIGT!";
        desc = `Ein Turm stürzte ein und Feinde drangen in den Hof ein, doch du konntest sie im letzten Moment zurückwerfen. Knapp gerettet!`;
    } else if (stab >= 30) {
        icon = "🔥⚠️";
        title = "GROSSE VERWÜSTUNG!";
        desc = `Große Teile deiner Burg liegen in Schutt und Asche. Die Schwachstellen waren fatal. Deine Burg braucht dringend Reparatur.`;
    } else {
        icon = "☠️💀";
        title = "TOTALER EINSTURZ!";
        desc = `Die Burg war zu schwach gebaut. Unter dem Ansturm des ${gameConfig.attackerName} ist alles kollabiert. Keine Chance.`;
    }

    document.getElementById("siegeAnimationIcon").innerText = icon;
    document.getElementById("siegeStatusMessage").style.display = "none";

    const badge = document.getElementById("siegeResultBadge");
    badge.innerHTML = `${title} <span style="color:#00e5ff;">(${stab}% Stabilität)</span>`;
    badge.style.color = stab >= 70 ? "#00ffa2" : stab >= 50 ? "#ffc107" : "#ff6565";

    document.getElementById("siegeResultDetails").innerHTML = `
        <b>Burg-Statistik:</b><br>
        Türme & Königstürme: ${stats.towers + stats.kings} • Segmente: ${stats.segments} • Steine: ${stats.stones}<br>
        Schwachstellen (Misses): <b style="color:#ff6565;">${stats.weak}</b><br>
        Gesamt-Burgpunkte: ${stats.totalScore}
    `;

    document.getElementById("siegeResultContainer").style.display = "block";
    saveGameResult(stats, title);
}

function saveGameResult(stats, outcomeTitle) {
    const entry = {
        date: new Date().toLocaleString(),
        difficulty: gameConfig.difficultyName,
        attacker: gameConfig.attackerName,
        stability: stats.stability,
        score: stats.totalScore,
        outcome: outcomeTitle
    };

    let history = JSON.parse(localStorage.getItem("castleHistory") || "[]");
    history.push(entry);
    localStorage.setItem("castleHistory", JSON.stringify(history));
}

// ==========================================
// KORREKTUR MODAL (Dropdown angepasst auf Regeln)
// ==========================================
let selectedThrowId = null;

function populateCorrectionDropdown() {
    const select = document.getElementById("correctionSelect");
    const options = ["MISS", "SBULL", "DBULL"];
    // Nur 18-20 sowie Spezial-Doppel D16, D8, D4, D2, D10 anbieten für einfache Bedienung
    [20, 19, 18].forEach(n => {
        options.push(`S${n}`, `D${n}`, `T${n}`);
    });
    [16, 10, 8, 4, 2].forEach(n => {
        options.push(`D${n}`);
    });
    select.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join("");
}

function openCorrectionModal(throwId, currentVal) {
    if (gameState.gameOver) return;
    selectedThrowId = throwId;
    document.getElementById("correctionSelect").value = currentVal || "MISS";
    document.getElementById("correctionModal").classList.remove("hidden");
}

function closeCorrectionModal() {
    selectedThrowId = null;
    document.getElementById("correctionModal").classList.add("hidden");
}

function saveCorrection() {
    const newVal = document.getElementById("correctionSelect").value;
    const parsed = parseSegmentFromString(newVal);

    if (selectedThrowId) {
        const idx = gameState.throws.findIndex(t => t.id === selectedThrowId);
        if (idx !== -1) {
            gameState.throws[idx] = { ...gameState.throws[idx], value: parsed.display, type: parsed.type, points: parsed.points };
            showFlash("Bauteil korrigiert");
        }
    } else {
        gameState.throws.push({
            id: crypto.randomUUID(),
            value: parsed.display,
            type: parsed.type,
            points: parsed.points
        });
        showFlash("Bauteil manuell hinzugefügt");
    }

    gameState.waitingForTakeout = (gameState.throws.length % 3 === 0);
    updateUI();
    closeCorrectionModal();
}

function parseSegmentFromString(val) {
    if (val === "MISS") return { display: "MISS", type: "miss", points: -2 };
    if (val === "SBULL") return { display: "SBULL", type: "king", points: 4 };
    if (val === "DBULL") return { display: "DBULL", type: "king", points: 6 };

    const prefix = val.charAt(0);
    const num = parseInt(val.slice(1), 10);
    const mult = prefix === "D" ? 2 : prefix === "T" ? 3 : 1;

    const validNumbers = [18, 19, 20];
    const validSpecialDoubles = [16, 8, 4, 2, 10];

    const isTargetNumber = validNumbers.includes(num);
    const isSpecialDouble = (mult === 2 && validSpecialDoubles.includes(num));

    if (!isTargetNumber && !isSpecialDouble) {
        return { display: val, type: "miss", points: -2 };
    }

    if (mult === 3 && isTargetNumber) return { display: val, type: "tower", points: 3 };
    if (mult === 2) return { display: val, type: "segment", points: 2 };
    if (mult === 1 && isTargetNumber) return { display: val, type: "stone", points: 1 };

    return { display: val, type: "miss", points: -2 };
}

function abortTraining() {
    if (gameState.throws.length === 0) return;
    if (confirm("Aktuellen Burgbau wirklich abbrechen?")) {
        location.reload();
    }
}

function resetAutodartsBoard() {
    fetch(`http://${boardIp}:3180/api/reset`, { method: "POST" })
        .then(() => showFlash("Board-Reset gesendet"))
        .catch(() => {
            fetch(`http://${boardIp}:3180/api/command?cmd=reset`, { mode: "no-cors" }).catch(() => {});
            showFlash("Board-Reset ausgelöst");
        });
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
    flash._timer = setTimeout(() => { flash.style.display = "none"; }, 1800);
}

document.addEventListener("DOMContentLoaded", () => {
    populateCorrectionDropdown();
    document.getElementById("saveCorrectionBtn").addEventListener("click", saveCorrection);
    document.getElementById("cancelCorrectionBtn").addEventListener("click", closeCorrectionModal);
});