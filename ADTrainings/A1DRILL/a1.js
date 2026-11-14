"use strict";

/* ==========================================
   A1 DRILL - Vollständiger Code mit IP-Konfiguration
========================================== */

// 1. Standard-IP laden oder Fallback auf localhost setzen
let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";

// 2. WebSocket mit dynamischer IP verbinden (Zentrale Instanz)
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);
let lastNumThrows = 0;

ws.onopen = () => console.log("A1 Drill verbunden mit IP:", boardIp);
ws.onerror = (err) => console.error("WS Fehler:", err);
ws.onclose = () => console.log("Vision getrennt");

ws.onmessage = (msg) => {
    if (gameState.gameFinished) return;
    const event = JSON.parse(msg.data);
    if (!event.data) return;

    if (event.type === "state") {
        const data = event.data;
        const throws = data.throws || [];
        const status = data.status; // z.B. "waitingForThrow", "takeout", "throw", etc.

        // WICHTIG: Wenn wir auf Takeout gewartet haben, aber das Board leer ist oder wieder bereit,
        // schalten wir Sofort auf Grün um!
        if (gameState.waitingForTakeout) {
            if (throws.length === 0 || status === "takeout" || status === "waitingForThrow" || status === "ready" || status === "idle") {
                // Wenn das Board jetzt leer ist, beenden wir den Takeout-Wartemodus sofort
                if (throws.length === 0) {
                    gameState.waitingForTakeout = false;
                    lastNumThrows = 0;
                    proceedToNextActiveTarget();
                }
            }
        }

        // Status-Badge in Echtzeit aktualisieren (berücksichtigt auch das direkte Leeren des Boards)
        updateBoardStatusUI(status, gameState.waitingForTakeout);

        if (gameState.waitingForTakeout) {
            return;
        }

        if (throws.length > 0) {
            processStateEvent(data);
        }
    }
};

const TARGETS = [
    15,
    16,
    17,
    18,
    19,
    20,
    "BULL"
];

const gameState = {
    currentTargetIndex: 0,
    roundsCompleted: {
        15: 0,
        16: 0,
        17: 0,
        18: 0,
        19: 0,
        20: 0,
        BULL: 0
    },
    currentTurnThrowsCount: 0,
    turnHitsCount: 0,
    waitingForTakeout: false,
    score: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    misses: 0,
    totalDarts: 0,
    throws: [],
    gameFinished: false,
    startTime: 0
};

function updateBoardStatusUI(status, isWaitingTakeout) {
    const badge = document.getElementById("boardStatusBadge");
    if (!badge) return;

    if (isWaitingTakeout || status === "takeout") {
        badge.textContent = "🎯 Bitte Pfeile ziehen (Takeout)";
        badge.className = "status-takeout";
    } 
    else if (status === "throw" || status === "throwDetected" || status === "waitingForThrow" || status === "ready" || status === "idle") {
        badge.textContent = "🟢 Bereit zum Werfen";
        badge.className = "status-ready";
    } 
    else {
        badge.textContent = `⚡ Status: ${status || "Verbunden"}`;
        badge.className = "status-ready";
    }
}

function resetAutodartsBoard() {
    fetch(`http://${boardIp}:3180/api/reset`, {
        method: "POST"
    })
    .then(response => {
        if (response.ok) {
            showFlash("Board erfolgreich zurückgesetzt!");
        } else {
            console.warn("Reset-Befehl gesendet.");
            showFlash("Board-Reset ausgelöst.");
        }
    })
    .catch(err => {
        console.error("Fehler beim Board-Reset:", err);
        fetch(`http://${boardIp}:3180/api/command?cmd=reset`, { mode: 'no-cors' }).catch(() => {});
        showFlash("Board-Reset gesendet.");
    });
}

function changeBoardIp() {
    const currentIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
    const newIp = prompt("Gib die IP-Adresse deines Autodarts Boardmanagers ein:", currentIp);
    
    if (newIp && newIp.trim() !== "") {
        localStorage.setItem("autodarts_ip", newIp.trim());
        showFlash("IP gespeichert! Seite wird neu geladen...");
        setTimeout(() => location.reload(), 1000);
    }
}

function abortCurrentGame() {
    if (confirm("Möchtest du das aktuelle Training wirklich abbrechen? Der Fortschritt geht verloren.")) {
        gameState.currentTargetIndex = 0;
        gameState.roundsCompleted = { 15: 0, 16: 0, 17: 0, 18: 0, 19: 0, 20: 0, BULL: 0 };
        gameState.currentTurnThrowsCount = 0;
        gameState.turnHitsCount = 0;
        gameState.waitingForTakeout = false;
        gameState.score = 0;
        gameState.singles = 0;
        gameState.doubles = 0;
        gameState.triples = 0;
        gameState.misses = 0;
        gameState.totalDarts = 0;
        gameState.throws = [];
        gameState.gameFinished = false;
        gameState.startTime = Date.now();

        updateUIAll();
        showFlash("Training abgebrochen & zurückgesetzt");
    }
}

function processStateEvent(data) {
    const throws = data.throws;
    if (!Array.isArray(throws)) return;

    if (gameState.waitingForTakeout) return;

    if (throws.length < lastNumThrows) {
        lastNumThrows = 0;
    }

    if (throws.length <= lastNumThrows) return;

    lastNumThrows = throws.length;
    const lastThrow = throws[throws.length - 1];
    handleVisionThrow(lastThrow);
}

function handleVisionThrow(throwData) {
    if (!throwData) return;
    const parsed = parseSegment(throwData);
    if (!parsed) return;
    registerThrow(parsed);
}

function parseSegment(throwData) {
    const name = throwData.segmentName || "";
    const number = throwData.segmentNumber;
    const multiplier = throwData.multiplier;

    if (!name || name.startsWith("M") || name === "MISS" || multiplier === 0) {
        return { type: "MISS", number: -1, multiplier: 0, score: 0, display: "MISS" };
    }

    if (
        name.toUpperCase().includes("BULL") || 
        number === 25 || 
        number === 50 || 
        name === "25" || 
        name === "50"
    ) {
        const isDouble = (multiplier === 2 || name === "DBULL" || name === "DBull" || number === 50 || name === "50");
        return {
            type: isDouble ? "DBULL" : "SBULL",
            number: "BULL",
            multiplier: isDouble ? 2 : 1,
            score: isDouble ? 50 : 25,
            display: isDouble ? "DBULL" : "SBULL"
        };
    }

    return {
        type: name,
        number: number,
        multiplier: multiplier,
        score: number * multiplier,
        display: name
    };
}

function getCurrentTarget(index = gameState.currentTargetIndex) {
    return TARGETS[index];
}

function isTargetHit(hit, targetIndex) {
    if (hit.display === "MISS") return false;

    const target = TARGETS[targetIndex];
    if (target === "BULL") {
        return (hit.display === "SBULL" || hit.display === "DBULL");
    }
    return hit.number === target;
}

function registerThrow(hit) {
    gameState.totalDarts++;
    gameState.currentTurnThrowsCount++;

    const targetHit = isTargetHit(hit, gameState.currentTargetIndex);

    if (targetHit) {
        gameState.score += hit.score;
        gameState.turnHitsCount++;
        if (hit.multiplier === 1) gameState.singles++;
        if (hit.multiplier === 2) gameState.doubles++;
        if (hit.multiplier === 3) gameState.triples++;
    } else {
        gameState.misses++;
    }

    gameState.throws.push({
        id: crypto.randomUUID(),
        value: hit.display,
        score: hit.score,
        targetHit: targetHit,
        targetIndexAtThrow: gameState.currentTargetIndex,
        corrected: false,
        timestamp: Date.now()
    });

    if (gameState.throws.length > 100) {
        gameState.throws.shift();
    }

    if (gameState.currentTurnThrowsCount >= 3) {
        gameState.waitingForTakeout = true;
    }

    updateUIAll();
}

function proceedToNextActiveTarget() {
    const currentTarget = getCurrentTarget();
    if (gameState.turnHitsCount >= 2) {
        if (gameState.roundsCompleted[currentTarget] < 5) {
            gameState.roundsCompleted[currentTarget]++;
        }
        showFlash(`RUNDE ${currentTarget} GESCHAFFT (${gameState.turnHitsCount}/3 Treffer)`);
    } else {
        showFlash(`Runde verpasst (${gameState.turnHitsCount}/3 Treffer)`);
    }

    gameState.currentTurnThrowsCount = 0;
    gameState.turnHitsCount = 0;

    if (checkAllTargetsCompleted()) {
        endGame();
        return;
    }

    do {
        gameState.currentTargetIndex = (gameState.currentTargetIndex + 1) % TARGETS.length;
    } while (gameState.roundsCompleted[getCurrentTarget()] >= 5);

    showFlash(`NÄCHSTES ZIEL: ${getCurrentTarget()}`);
    updateUIAll();
}

function checkAllTargetsCompleted() {
    return TARGETS.every(target => gameState.roundsCompleted[target] >= 5);
}

function endGame() {
    gameState.gameFinished = true;
    saveA1GameAndGetRank();
}

function saveA1GameAndGetRank() {
    const totalHits = gameState.singles + gameState.doubles + gameState.triples;
    const hitRate = gameState.totalDarts > 0 ? ((totalHits / gameState.totalDarts) * 100).toFixed(1) : "0.0";

    const gameData = {
        id: Date.now() + "-" + Math.random().toString(36).slice(2),
        date: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        totalDarts: gameState.totalDarts,
        hitRate: hitRate,
        score: gameState.score
    };

    let history = JSON.parse(localStorage.getItem("a1History") || "[]");
    history.push(gameData);
    history.sort((a, b) => a.totalDarts - b.totalDarts);
    localStorage.setItem("a1History", JSON.stringify(history));

    const rank = history.findIndex(item => item.id === gameData.id) + 1;

    const resultText = document.getElementById("modalResultText");
    if (resultText) {
        if (rank <= 10) {
            resultText.innerHTML = `🔥 <span style="color:#00ffa2; font-weight:bold;">Neuer Highscore!</span><br>Du bist auf <span style="color:#00e5ff;">Platz ${rank}</span> (${gameState.totalDarts} Darts, ${hitRate}% Treffer).`;
        } else {
            resultText.innerHTML = `Starke Leistung!<br>Du landest auf <span style="color:#00e5ff;">Platz ${rank}</span> in der Gesamttabelle (${gameState.totalDarts} Darts, ${hitRate}% Treffer).`;
        }
    }

    const hsContainer = document.getElementById("modalHighscoreList");
    if (hsContainer) {
        hsContainer.innerHTML = "";
        const top10 = history.slice(0, 10);
        top10.forEach((entry, idx) => {
            const row = document.createElement("div");
            row.style.cssText = "display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 14px;";
            if (entry.id === gameData.id) {
                row.style.color = "#00e5ff";
                row.style.fontWeight = "bold";
            }
            row.innerHTML = `<span>#${idx + 1} - ${entry.date}</span> <span><b>${entry.totalDarts}</b> Darts (${entry.hitRate}%)</span>`;
            hsContainer.appendChild(row);
        });
    }

    const modal = document.getElementById("gameFinishedModal");
    if (modal) modal.classList.remove("hidden");
}

function showFlash(text) {
    const flash = document.getElementById("flashMessage");
    if (!flash) return;
    flash.textContent = text;
    flash.style.display = "block";
    setTimeout(() => { flash.style.display = "none"; }, 1500);
}

function updateUIAll() {
    renderTargetPanel();
    renderProgressCard();
    renderStatistics();
    renderLastThrows();
}

function renderTargetPanel() {
    const currentTarget = getCurrentTarget();
    const targetElem = document.getElementById("currentTarget");
    if (targetElem) targetElem.textContent = currentTarget === "BULL" ? "BULL" : currentTarget;

    const rounds = gameState.roundsCompleted[currentTarget] || 0;

    const hitText = document.getElementById("roundHitText");
    if (hitText) {
        if (gameState.waitingForTakeout) {
            hitText.textContent = "Pfeile ziehen!";
        } else {
            hitText.textContent = `${gameState.turnHitsCount} / 2 Treffer`;
        }
    }

    const progText = document.getElementById("roundProgressText");
    if (progText) progText.textContent = `${rounds} / 5 Erfolge`;

    const bar = document.getElementById("roundHitBar");
    if (bar) {
        const percent = Math.min((gameState.turnHitsCount / 2) * 100, 100);
        bar.style.width = `${percent}%`;
    }

    const progBar = document.getElementById("roundProgressBar");
    if (progBar) {
        progBar.style.width = `${Math.min((rounds / 5) * 100, 100)}%`;
    }
}

function renderProgressCard() {
    const container = document.getElementById("progressList");
    if (!container) return;
    container.innerHTML = "";
    container.style.cssText = "display: flex; flex-direction: column; gap: 14px;";

    TARGETS.forEach((target, index) => {
        const rounds = gameState.roundsCompleted[target] || 0;
        const percent = Math.min((rounds / 5) * 100, 100);

        const row = document.createElement("div");
        row.className = "progress-row";
        row.style.cssText = "display: grid; grid-template-columns: 40px 1fr 60px; align-items: center; gap: 12px; font-size: 16px;";

        if (index === gameState.currentTargetIndex && !checkAllTargetsCompleted()) {
            row.classList.add("active-target");
        }
        if (rounds >= 5) {
            row.classList.add("completed");
        }

        row.innerHTML = `
            <span style="font-weight: bold; font-size: 18px;">${target === "BULL" ? "B" : target}</span>
            <div class="progress-track" style="height: 16px; background: #1f2738; border-radius: 999px; overflow: hidden;">
                <div style="height: 100%; width: ${percent}%; background: linear-gradient(90deg, #00e5ff, #00ffa2); transition: .25s;"></div>
            </div>
            <span style="text-align: right; font-weight: bold;">${rounds}/5</span>
        `;
        container.appendChild(row);
    });
}

function renderStatistics() {
    const totalHits = gameState.singles + gameState.doubles + gameState.triples;
    const overallHitRate = gameState.totalDarts > 0 ? ((totalHits / gameState.totalDarts) * 100).toFixed(1) : 0;

    const currentTarget = getCurrentTarget();
    const throwsForCurrentTarget = gameState.throws.filter(t => t.targetIndexAtThrow === gameState.currentTargetIndex);
    const targetHitsCurrent = throwsForCurrentTarget.filter(t => t.targetHit).length;
    const currentTargetHitRate = throwsForCurrentTarget.length > 0 
        ? ((targetHitsCurrent / throwsForCurrentTarget.length) * 100).toFixed(1) 
        : "0.0";

    const roundsCount = (gameState.totalDarts / 3).toFixed(1);

    document.getElementById("score").textContent = gameState.score;
    document.getElementById("singleCount").textContent = gameState.singles;
    document.getElementById("doubleCount").textContent = gameState.doubles;
    document.getElementById("tripleCount").textContent = gameState.triples;
    document.getElementById("missCount").textContent = gameState.misses;

    const hitRateElem = document.getElementById("hitRate");
    if (hitRateElem) {
        hitRateElem.innerHTML = `${overallHitRate}%`;
        hitRateElem.style.fontSize = "32px";
    }

    const avgCardTitle = document.querySelector("#threeAvg").closest(".panel").querySelector(".panel-title");
    if (avgCardTitle) avgCardTitle.textContent = `Ziel-Quote (${currentTarget === "BULL" ? "BULL" : currentTarget})`;
    
    const avgElem = document.getElementById("threeAvg");
    if (avgElem) {
        avgElem.textContent = `${currentTargetHitRate}%`;
    }

    const totalDartsElem = document.getElementById("totalDarts");
    if (totalDartsElem) {
        totalDartsElem.innerHTML = `${gameState.totalDarts} <span style="font-size:20px; color:#8ca1b3; display:block;">(${roundsCount} Aufn.)</span>`;
    }
}

function initGame() {
    gameState.startTime = Date.now();
    gameState.gameFinished = false;

    const modal = document.getElementById("gameFinishedModal");
    if (modal) modal.classList.add("hidden");

    updateUIAll();
    setupUndoButton();
}

document.addEventListener("DOMContentLoaded", initGame);

function renderLastThrows() {
    const container = document.getElementById("lastThrows");
    if (!container) return;

    container.innerHTML = "";

    const count = gameState.currentTurnThrowsCount;
    const startIndex = gameState.throws.length - count;
    const currentTurnThrows = gameState.throws.slice(startIndex >= 0 ? startIndex : 0);

    for (let i = 0; i < 3; i++) {
        const card = document.createElement("div");
        card.classList.add("throw-card");
        card.style.cursor = "pointer";

        const throwData = currentTurnThrows[i];

        if (throwData) {
            if (throwData.targetHit) {
                card.classList.add("target-throw");
            } else {
                card.classList.add("miss-throw");
            }

            card.innerHTML = `
                <div class="throw-hit">${throwData.value}</div>
                <div class="throw-score">${throwData.score}</div>
            `;

            card.addEventListener("click", () => {
                openCorrectionModal(throwData.id, throwData.value);
            });
        } else {
            card.style.opacity = "0.4";
            card.innerHTML = `
                <div class="throw-hit">-</div>
                <div class="throw-score">Pfeil ${i + 1}</div>
            `;

            card.addEventListener("click", () => {
                const dummyId = crypto.randomUUID();
                gameState.throws.push({
                    id: dummyId,
                    value: "MISS",
                    score: 0,
                    targetHit: false,
                    targetIndexAtThrow: gameState.currentTargetIndex,
                    corrected: true,
                    timestamp: Date.now()
                });
                gameState.currentTurnThrowsCount++;
                openCorrectionModal(dummyId, "MISS");
            });
        }

        container.appendChild(card);
    }
}

function setupUndoButton() {
    let undoBtn = document.getElementById("undoBtn");
    if (!undoBtn) {
        const header = document.querySelector("header");
        if (header) {
            undoBtn = document.createElement("button");
            undoBtn.id = "undoBtn";
            undoBtn.textContent = "⌫ Letzten Wurf zurücknehmen";
            undoBtn.style.cssText = `
                margin-top: 15px;
                padding: 8px 16px;
                font-size: 14px;
                background: #1f2738;
                color: #00e5ff;
                border: 1px solid #00e5ff;
                border-radius: 8px;
                cursor: pointer;
            `;
            undoBtn.onclick = undoLastThrow;
            header.appendChild(undoBtn);
        }
    }
}

function undoLastThrow() {
    if (gameState.throws.length === 0) return;

    gameState.throws.pop();
    recalculateGameFromScratch();
    showFlash("Wurf zurückgenommen");
}

let selectedThrowId = null;

function openCorrectionModal(throwId, currentValue) {
    selectedThrowId = throwId;
    
    const selectElem = document.getElementById("correctionSelect");
    if (selectElem) {
        selectElem.value = currentValue || "MISS";
    }

    const modal = document.getElementById("correctionModal");
    if (modal) modal.classList.remove("hidden");
}

function closeCorrectionModal() {
    selectedThrowId = null;
    const modal = document.getElementById("correctionModal");
    if (modal) modal.classList.add("hidden");
    recalculateGameFromScratch();
}

function saveCorrection() {
    if (!selectedThrowId) return;

    const selectElem = document.getElementById("correctionSelect");
    if (!selectElem) return;

    const throwData = gameState.throws.find(t => t.id === selectedThrowId);
    if (!throwData) return;

    throwData.value = selectElem.value;
    throwData.corrected = true;

    closeCorrectionModal();
    recalculateGameFromScratch();
}

function recalculateGameFromScratch() {
    gameState.roundsCompleted = { 15: 0, 16: 0, 17: 0, 18: 0, 19: 0, 20: 0, BULL: 0 };
    gameState.score = 0;
    gameState.singles = 0;
    gameState.doubles = 0;
    gameState.triples = 0;
    gameState.misses = 0;
    gameState.totalDarts = 0;
    gameState.gameFinished = false;

    let activeTargetIdx = 0;
    const savedThrows = [...gameState.throws];
    gameState.throws = [];

    let currentTurn = 0;
    let turnHits = 0;

    savedThrows.forEach((t) => {
        const hit = parseThrowValue(t.value);
        if (!hit) return;

        gameState.totalDarts++;
        currentTurn++;

        const targetHit = isTargetHit(hit, activeTargetIdx);
        t.targetIndexAtThrow = activeTargetIdx;
        t.targetHit = targetHit;

        if (targetHit) {
            gameState.score += hit.score;
            turnHits++;
            if (hit.multiplier === 1) gameState.singles++;
            if (hit.multiplier === 2) gameState.doubles++;
            if (hit.multiplier === 3) gameState.triples++;
        } else {
            gameState.misses++;
        }

        gameState.throws.push(t);

        if (currentTurn >= 3) {
            if (turnHits >= 2) {
                const targetName = TARGETS[activeTargetIdx];
                if (gameState.roundsCompleted[targetName] < 5) {
                    gameState.roundsCompleted[targetName]++;
                }
            }
            currentTurn = 0;
            turnHits = 0;

            if (checkAllTargetsCompleted()) {
                gameState.gameFinished = true;
                return;
            }

            do {
                activeTargetIdx = (activeTargetIdx + 1) % TARGETS.length;
            } while (gameState.roundsCompleted[TARGETS[activeTargetIdx]] >= 5);
        }
    });

    gameState.currentTargetIndex = activeTargetIdx;
    gameState.currentTurnThrowsCount = currentTurn;
    gameState.turnHitsCount = turnHits;

    if (currentTurn === 0 && savedThrows.length > 0 && savedThrows.length % 3 === 0) {
        gameState.waitingForTakeout = true;
    } else {
        gameState.waitingForTakeout = false;
    }

    updateUIAll();
}

function parseThrowValue(value) {
    if (value === "MISS" || value.startsWith("M")) {
        return { display: "MISS", number: -1, multiplier: 0, score: 0 };
    }
    if (value === "SBULL" || value === "25") {
        return { display: "SBULL", number: "BULL", multiplier: 1, score: 25 };
    }
    if (value === "DBULL" || value === "50") {
        return { display: "DBULL", number: "BULL", multiplier: 2, score: 50 };
    }

    const type = value.charAt(0);
    const number = Number(value.slice(1));
    let multiplier = 1;

    if (type === "D") multiplier = 2;
    if (type === "T") multiplier = 3;

    return {
        display: value,
        number: number,
        multiplier: multiplier,
        score: number * multiplier
    };
}

document.addEventListener("DOMContentLoaded", () => {
    const saveId = document.getElementById("saveCorrectionBtn");
    const cancelId = document.getElementById("cancelCorrectionBtn");

    if (saveId) saveId.addEventListener("click", saveCorrection);
    if (cancelId) cancelId.addEventListener("click", closeCorrectionModal);
});