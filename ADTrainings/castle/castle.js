"use strict";

/* ==========================================
   CASTLE BUILDER CHALLENGE - LOGIK
========================================== */

let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);
let lastNumThrows = 0;

const MAX_DARTS = 100;
const VALID_MAIN_NUMBERS = [18, 19, 20];
const SPECIAL_DOUBLES = [16, 8, 4, 2, 10];

let selectedDiff = {
    name: "Anfänger",
    attacker: "Goblins",
    level: 1,
    targetScore: 350
};

let gameState = {
    gameStarted: false,
    gameFinished: false,
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
    if (!gameState.gameStarted || gameState.gameFinished) return;
    const event = JSON.parse(msg.data);
    if (!event.data) return;

    if (event.type === "state") {
        const data = event.data;
        const throws = data.throws || [];
        const status = data.status;

        // Takeout-Logik: Bei Herausziehen der Pfeile (throws.length === 0) Reset für neue Aufnahme
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

function setDifficulty(name, attacker, level, targetScore, element) {
    selectedDiff = { name, attacker, level, targetScore };
    document.querySelectorAll(".diff-card").forEach(card => card.classList.remove("selected"));
    if (element) element.classList.add("selected");
}

function startCastleGame() {
    gameState.gameStarted = true;
    gameState.gameFinished = false;
    gameState.throws = [];
    gameState.waitingForTakeout = false;
    lastNumThrows = 0;

    document.getElementById("startScreen").style.display = "none";
    document.getElementById("gameInterface").style.display = "block";
    document.getElementById("currentAttackerDisplay").innerText = `ANGRIFF: ${selectedDiff.attacker} (${selectedDiff.name})`;
    document.getElementById("targetScoreLabel").innerText = `Ziel: ${selectedDiff.targetScore} Punkte`;
    document.getElementById("castleStatusText").innerText = `Baue deine Festung auf (Ziel: ${selectedDiff.targetScore} Pkt.).`;

    updateUI();
}

function processStateEvent(data) {
    const throws = data.throws;
    if (!Array.isArray(throws) || gameState.waitingForTakeout) return;

    if (throws.length < lastNumThrows) lastNumThrows = 0;
    if (throws.length <= lastNumThrows) return;

    lastNumThrows = throws.length;
    const lastThrow = throws[throws.length - 1];
    const parsed = parseCastleSegment(lastThrow);
    if (parsed) registerThrow(parsed);
}

function parseCastleSegment(throwData) {
    const name = throwData.segmentName || "";
    const number = throwData.segmentNumber;
    const multiplier = throwData.multiplier;

    if (!name || name.startsWith("M") || name === "MISS" || multiplier === 0) {
        return { display: "MISS", category: "weak", points: -2 };
    }

    // Bull / DBull (Königsturm)
    if (name.toUpperCase().includes("BULL") || number === 25 || number === 50 || name === "25" || name === "50") {
        const isDouble = (multiplier === 2 || name.toUpperCase() === "DBULL" || number === 50 || name === "50");
        return {
            display: isDouble ? "DBULL" : "SBULL",
            category: "tower",
            points: isDouble ? 30 : 20
        };
    }

    // Hauptzahlen: 18, 19, 20
    if (VALID_MAIN_NUMBERS.includes(number)) {
        if (multiplier === 3) return { display: name, category: "tower", points: 15 };
        if (multiplier === 2) return { display: name, category: "segment", points: 10 };
        return { display: name, category: "stone", points: 5 };
    }

    // Spezial-Doppel: D16, D8, D4, D2, D10
    if (multiplier === 2 && SPECIAL_DOUBLES.includes(number)) {
        return { display: name, category: "segment", points: 10 };
    }

    // Alles andere = Schwachstelle
    return { display: name, category: "weak", points: -2 };
}

function registerThrow(hit) {
    if (gameState.gameFinished || gameState.waitingForTakeout) return;

    gameState.throws.push({
        id: crypto.randomUUID(),
        value: hit.display,
        category: hit.category,
        points: hit.points
    });

    const dartsThrown = gameState.throws.length;

    if (dartsThrown % 3 === 0) {
        gameState.waitingForTakeout = true;
        showFlash("Aufnahme beendet – Pfeile ziehen");
    }

    updateUI();

    if (dartsThrown >= MAX_DARTS && !gameState.gameFinished) {
        triggerSiegeCinematic();
    }
}

function calculateCastleStats() {
    let towers = 0, segments = 0, stones = 0, weak = 0;
    let score = 0;

    gameState.throws.forEach(t => {
        score += t.points;
        if (t.category === "tower") towers++;
        else if (t.category === "segment") segments++;
        else if (t.category === "stone") stones++;
        else if (t.category === "weak") weak++;
    });

    score = Math.max(0, score);

    // Stabilität in % im Verhältnis zur Zielmarke des gewählten Angreifers
    const rawStability = (score / selectedDiff.targetScore) * 100;
    const stability = Math.min(100, Math.max(0, Math.round(rawStability)));

    return { towers, segments, stones, weak, score, stability };
}

function updateUI() {
    const stats = calculateCastleStats();
    const dartsLeft = MAX_DARTS - gameState.throws.length;

    document.getElementById("dartsLeft").innerText = Math.max(0, dartsLeft);
    document.getElementById("countTowers").innerText = stats.towers;
    document.getElementById("countSegments").innerText = stats.segments;
    document.getElementById("countStones").innerText = stats.stones;
    document.getElementById("countWeak").innerText = stats.weak;
    document.getElementById("castleScore").innerText = stats.score;

    const stabEl = document.getElementById("stabilityDisplay");
    stabEl.innerText = `${stats.stability}%`;

    const castleIcon = document.getElementById("castleGraphic");
    const statusText = document.getElementById("castleStatusText");

    if (stats.stability >= 90) {
        stabEl.style.color = "#00ffa2";
        castleIcon.innerText = "🏰✨";
        statusText.innerText = "Uneinnehmbare Festung! Alle Mauern stehen.";
    } else if (stats.stability >= 70) {
        stabEl.style.color = "#00e5ff";
        castleIcon.innerText = "🏰";
        statusText.innerText = "Solide Wehranlage – hält dem Angriff stand.";
    } else if (stats.stability >= 50) {
        stabEl.style.color = "#ffc107";
        castleIcon.innerText = "🏯";
        statusText.innerText = "Knappe Verteidigung – einige Mauern sind rissig.";
    } else if (stats.stability >= 30) {
        stabEl.style.color = "#ff9800";
        castleIcon.innerText = "🏚️";
        statusText.innerText = "Schwere Verwüstung – viele Schwachstellen!";
    } else {
        stabEl.style.color = "#ff6565";
        castleIcon.innerText = "🧱";
        statusText.innerText = "Instabiles Fundament – mehr Treffer benötigt!";
    }

    renderCurrentThrows();
}

function renderCurrentThrows() {
    const container = document.getElementById("lastThrows");
    container.innerHTML = "";

    // Wenn wir NICHT auf Takeout warten und gerade ein neuer Turn beginnt (throws % 3 === 0), zeige '-'
    if (!gameState.waitingForTakeout && gameState.throws.length % 3 === 0) {
        for (let i = 0; i < 3; i++) {
            const card = document.createElement("div");
            card.className = "stat-card throw-card";
            card.style.opacity = "0.5";
            card.innerHTML = `<div class="stat-label">Pfeil ${i + 1}</div><div class="stat-value">-</div>`;
            card.onclick = () => openCorrectionModal(null, "MISS");
            container.appendChild(card);
        }
        return;
    }

    // Ansonsten ermittle die aktuelle 3er-Aufnahme
    const totalThrows = gameState.throws.length;
    const currentTurnIndex = totalThrows > 0 ? Math.floor((totalThrows - 1) / 3) : 0;
    const startIdx = currentTurnIndex * 3;
    const currentTurnThrows = gameState.throws.slice(startIdx, startIdx + 3);

    for (let i = 0; i < 3; i++) {
        const card = document.createElement("div");
        card.className = "stat-card throw-card";
        const t = currentTurnThrows[i];

        if (t) {
            const color = t.points >= 15 ? "#00ffa2" : (t.points > 0 ? "#00e5ff" : "#ff6565");
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

function triggerSiegeCinematic() {
    gameState.gameFinished = true;
    const stats = calculateCastleStats();
    const modal = document.getElementById("siegeModal");
    modal.classList.remove("hidden");

    const icons = { 1: "🗡️", 2: "🏹", 3: "🛡️", 4: "🐉" };
    document.getElementById("siegeAnimationIcon").innerText = icons[selectedDiff.level] || "🐉";
    document.getElementById("siegeAttackerText").innerText = `${selectedDiff.attacker} greifen deine Festung an!`;

    setTimeout(() => {
        document.getElementById("siegeStatusMessage").style.display = "none";
        const resContainer = document.getElementById("siegeResultContainer");
        const badge = document.getElementById("siegeResultBadge");
        const details = document.getElementById("siegeResultDetails");
        resContainer.style.display = "block";

        let survived = stats.stability >= 70;
        let titleText = "";
        let descText = "";

        if (stats.stability >= 90) {
            titleText = "🏆 DIE ABSOLUTE FESTUNG (SIEG!)";
            badge.style.color = "#00ffa2";
            descText = `Deine Mauern waren unbezwingbar (${stats.stability}% Stabilität • ${stats.score}/${selectedDiff.targetScore} Pkt.). ${selectedDiff.attacker} wurden vernichtend geschlagen!`;
        } else if (stats.stability >= 70) {
            titleText = "🛡️ SOLIDE WEHRANLAGE (ÜBERLEBT!)";
            badge.style.color = "#00e5ff";
            descText = `Starke Verteidigung (${stats.stability}% Stabilität • ${stats.score}/${selectedDiff.targetScore} Pkt.). Der Angriff von ${selectedDiff.attacker} wurde erfolgreich abgewehrt.`;
        } else if (stats.stability >= 50) {
            titleText = "⚠️ KNAPPE RETTUNG (BESCHÄDIGT)";
            badge.style.color = "#ffc107";
            descText = `Ein Turm ist eingestürzt, aber der Kern hat gehalten (${stats.stability}% Stabilität • ${stats.score}/${selectedDiff.targetScore} Pkt.). Für einen klaren Sieg fehlten nur wenige Punkte!`;
        } else if (stats.stability >= 30) {
            titleText = "🔥 SCHWERE VERWÜSTUNG (NIEDERLAGE)";
            badge.style.color = "#ff9800";
            descText = `Zu viele Schwachstellen (${stats.weak} Fehlwürfe) haben die Statik geschwächt (${stats.stability}% Stabilität • ${stats.score}/${selectedDiff.targetScore} Pkt.).`;
        } else {
            titleText = "💀 TOTALER EINSTURZ (NIEDERLAGE)";
            badge.style.color = "#ff6565";
            descText = `Die Festung ist unter dem Ansturm von ${selectedDiff.attacker} komplett kollabiert (${stats.stability}% Stabilität • ${stats.score}/${selectedDiff.targetScore} Pkt.).`;
        }

        badge.innerText = titleText;
        details.innerHTML = descText;

        saveCastleResult(stats, survived);
    }, 1800);
}

function saveCastleResult(stats, survived) {
    const entry = {
        date: new Date().toLocaleString(),
        difficulty: selectedDiff.name,
        attacker: selectedDiff.attacker,
        score: stats.score,
        targetScore: selectedDiff.targetScore,
        stability: stats.stability,
        survived: survived
    };

    let history = JSON.parse(localStorage.getItem("castleHistory") || "[]");
    history.push(entry);
    localStorage.setItem("castleHistory", JSON.stringify(history));
}

// ==========================================
// KORREKTUR MODAL
// ==========================================
let selectedThrowId = null;

function populateCorrectionDropdown() {
    const select = document.getElementById("correctionSelect");
    const options = [
        "MISS", "SBULL", "DBULL",
        "T20", "D20", "S20",
        "T19", "D19", "S19",
        "T18", "D18", "S18",
        "D16", "D10", "D8", "D4", "D2"
    ];
    select.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join("");
}

function openCorrectionModal(throwId, currentVal) {
    if (gameState.gameFinished) return;
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
    const parsed = parseCastleSegmentFromString(newVal);

    if (selectedThrowId) {
        const idx = gameState.throws.findIndex(t => t.id === selectedThrowId);
        if (idx !== -1) {
            gameState.throws[idx] = { ...gameState.throws[idx], value: parsed.display, category: parsed.category, points: parsed.points };
            showFlash("Bauteil korrigiert");
        }
    } else {
        gameState.throws.push({
            id: crypto.randomUUID(),
            value: parsed.display,
            category: parsed.category,
            points: parsed.points
        });
        showFlash("Wurf manuell hinzugefügt");
    }

    gameState.waitingForTakeout = (gameState.throws.length % 3 === 0);
    updateUI();
    closeCorrectionModal();
}

function parseCastleSegmentFromString(val) {
    if (val === "MISS") return { display: "MISS", category: "weak", points: -2 };
    if (val === "SBULL") return { display: "SBULL", category: "tower", points: 20 };
    if (val === "DBULL") return { display: "DBULL", category: "tower", points: 30 };

    const num = parseInt(val.slice(1), 10);
    const mult = val.startsWith("D") ? 2 : val.startsWith("T") ? 3 : 1;

    if (VALID_MAIN_NUMBERS.includes(num)) {
        if (mult === 3) return { display: val, category: "tower", points: 15 };
        if (mult === 2) return { display: val, category: "segment", points: 10 };
        return { display: val, category: "stone", points: 5 };
    }

    if (mult === 2 && SPECIAL_DOUBLES.includes(num)) {
        return { display: val, category: "segment", points: 10 };
    }

    return { display: val, category: "weak", points: -2 };
}

function abortTraining() {
    if (gameState.throws.length === 0) {
        location.reload();
        return;
    }
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