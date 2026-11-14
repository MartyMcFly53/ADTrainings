"use strict";

let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);
const t20Sound = new Audio("sounds/t20.mp3");

let lastNumThrows = 0;

const state = {
    targetNumber: 20,
    totalDartsLimit: 30,
    throws: [],
    waitingForTakeout: false,
    trainingActive: false,
    sessionFinished: false
};

ws.onopen = () => updateBoardStatusUI("ready", false);
ws.onerror = (err) => console.error("WebSocket Fehler:", err);
ws.onclose = () => {
    const badge = document.getElementById("boardStatusBadge");
    if (badge) {
        badge.textContent = "🔴 Board getrennt";
        badge.className = "status-takeout";
    }
};

ws.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    if (!event.data) return;

    if (event.type === "state") {
        const data = event.data;
        const throws = data.throws || [];
        const status = data.status;

        if (state.waitingForTakeout) {
            if (throws.length === 0) {
                state.waitingForTakeout = false;
                lastNumThrows = 0;

                if (state.throws.length >= state.totalDartsLimit && !state.sessionFinished) {
                    finishTrainingSession();
                }
                updateUI();
            }
        }

        updateBoardStatusUI(status, state.waitingForTakeout);

        if (state.waitingForTakeout || !state.trainingActive || state.sessionFinished) return;

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
    } else if (["throw", "throwDetected", "waitingForThrow", "ready", "idle"].includes(status)) {
        badge.textContent = "🟢 Board: Bereit";
        badge.className = "status-ready";
    } else {
        badge.textContent = `⚡ Board: ${status || "Verbunden"}`;
        badge.className = "status-ready";
    }
}

function processStateEvent(data) {
    const throws = data.throws;
    if (!Array.isArray(throws) || state.waitingForTakeout || !state.trainingActive) return;

    if (throws.length < lastNumThrows) {
        lastNumThrows = 0;
    }
    if (throws.length <= lastNumThrows) return;

    lastNumThrows = throws.length;
    const lastThrow = throws[throws.length - 1];
    const parsed = parseSegment(lastThrow);
    if (parsed) registerThrow(parsed);
}

function parseSegment(throwData) {
    const name = throwData.segmentName || "";
    const number = throwData.segmentNumber;
    const multiplier = throwData.multiplier;

    if (!name || name.startsWith("M") || name === "MISS" || multiplier === 0) {
        return { display: "MISS", number: 0, multiplier: 0, score: 0 };
    }

    if (name.toUpperCase().includes("BULL") || number === 25 || number === 50 || name === "25" || name === "50") {
        const isDouble = (multiplier === 2 || name.toUpperCase() === "DBULL" || number === 50 || name === "50");
        return {
            display: isDouble ? "DBULL" : "SBULL",
            number: 25,
            multiplier: isDouble ? 2 : 1,
            score: isDouble ? 50 : 25
        };
    }

    return {
        display: name,
        number: number,
        multiplier: multiplier,
        score: number * multiplier
    };
}

function registerThrow(hit) {
    if (state.throws.length >= state.totalDartsLimit || state.sessionFinished) return;

    if (hit.number === 20 && hit.multiplier === 3) {
        t20Sound.currentTime = 0;
        t20Sound.play().catch(() => {});
    }

    state.throws.push({
        id: crypto.randomUUID(),
        value: hit.display,
        number: hit.number,
        multiplier: hit.multiplier,
        score: hit.score
    });

    checkTrainingProgress();
    updateUI();
}

function checkTrainingProgress() {
    if (state.throws.length >= state.totalDartsLimit) {
        state.waitingForTakeout = true;
        showFlash("Training abgeschlossen – Bitte Pfeile ziehen");
    } else if (state.throws.length % 3 === 0) {
        state.waitingForTakeout = true;
        showFlash("Aufnahme beendet – Bitte Pfeile ziehen");
    }
}

function updateUI() {
    let totalScore = 0;
    let singleCount = 0;
    let doubleCount = 0;
    let tripleCount = 0;
    let missCount = 0;
    let totalHits = 0;

    state.throws.forEach((t) => {
        const isTarget = (t.number === state.targetNumber && t.multiplier > 0);
        if (isTarget) {
            totalScore += t.score;
            totalHits++;
            if (t.multiplier === 1) singleCount++;
            if (t.multiplier === 2) doubleCount++;
            if (t.multiplier === 3) tripleCount++;
        } else {
            missCount++;
        }
    });

    const totalDartsThrown = state.throws.length;
    const dartsLeft = state.trainingActive || state.sessionFinished
        ? Math.max(0, state.totalDartsLimit - totalDartsThrown)
        : parseInt(document.getElementById("darts").value) || 30;

    document.getElementById("score").innerText = totalScore;
    document.getElementById("left").innerText = dartsLeft;

    document.getElementById("singleCount").innerText = singleCount;
    document.getElementById("doubleCount").innerText = doubleCount;
    document.getElementById("tripleCount").innerText = tripleCount;
    document.getElementById("missCount").innerText = missCount;

    const rate = totalDartsThrown > 0 ? (totalHits / totalDartsThrown) * 100 : 0;
    document.getElementById("hitRate").innerText = rate.toFixed(1) + "%";
    document.getElementById("hitrate-fill").style.width = rate + "%";

    const threeAvg = totalDartsThrown > 0 ? (totalScore / totalDartsThrown) * 3 : 0;
    document.getElementById("threeAvg").innerText = threeAvg.toFixed(1);

    renderCurrentVisitThrows();
}

// Die 3 Wurf-Karten: Zieltreffer grün/cyan, Fehlwürfe rot!
function renderCurrentVisitThrows() {
    const container = document.getElementById("lastThrows");
    if (!container) return;
    container.innerHTML = "";

    let visitIndex = Math.floor(state.throws.length / 3);
    if (state.waitingForTakeout && state.throws.length > 0 && state.throws.length % 3 === 0) {
        visitIndex -= 1;
    }

    const startIdx = Math.max(0, visitIndex * 3);
    const currentThrows = state.throws.slice(startIdx, startIdx + 3);

    for (let i = 0; i < 3; i++) {
        const card = document.createElement("div");
        card.className = "stat-card throw-card";

        const t = currentThrows[i];
        const absoluteIndex = startIdx + i;

        if (t) {
            const isTarget = (t.number === state.targetNumber && t.multiplier > 0);
            let colorClass = "hit-miss"; // Standard: Rot, wenn falsches Segment oder Miss
            if (isTarget) {
                colorClass = t.multiplier === 1 ? "hit-single" : "hit-multi";
            }

            card.innerHTML = `
                <div class="stat-label">Pfeil ${i + 1}</div>
                <div class="stat-value ${colorClass}">${t.value}</div>
            `;
            card.onclick = () => openCorrectionModal(t.id, t.value, absoluteIndex);
        } else {
            card.style.opacity = "0.5";
            card.innerHTML = `
                <div class="stat-label">Pfeil ${i + 1}</div>
                <div class="stat-value">-</div>
            `;
            card.onclick = () => openCorrectionModal(null, "MISS", absoluteIndex);
        }
        container.appendChild(card);
    }
}

let selectedThrowId = null;
let selectedAbsoluteIndex = null;

function populateCorrectionDropdown() {
    const select = document.getElementById("correctionSelect");
    if (!select) return;

    const options = ["MISS", "SBULL", "DBULL"];
    for (let n = 20; n >= 1; n--) {
        options.push(`S${n}`, `D${n}`, `T${n}`);
    }
    select.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join("");
}

function openCorrectionModal(throwId, currentVal, absoluteIndex) {
    if (state.sessionFinished || !state.trainingActive) return;
    selectedThrowId = throwId;
    selectedAbsoluteIndex = absoluteIndex;
    const select = document.getElementById("correctionSelect");
    if (select && currentVal) select.value = currentVal;
    document.getElementById("correctionModal").classList.remove("hidden");
}

function closeCorrectionModal() {
    selectedThrowId = null;
    selectedAbsoluteIndex = null;
    document.getElementById("correctionModal").classList.add("hidden");
}

function saveCorrection() {
    const newVal = document.getElementById("correctionSelect").value;
    const parsed = parseSegmentFromString(newVal);

    if (selectedThrowId) {
        const idx = state.throws.findIndex(t => t.id === selectedThrowId);
        if (idx !== -1) {
            state.throws[idx] = { ...state.throws[idx], value: parsed.display, number: parsed.number, multiplier: parsed.multiplier, score: parsed.score };
            showFlash("Wurf korrigiert");
        }
    } else if (selectedAbsoluteIndex !== null) {
        while (state.throws.length < selectedAbsoluteIndex) {
            state.throws.push({ id: crypto.randomUUID(), value: "MISS", number: 0, multiplier: 0, score: 0 });
        }
        state.throws.push({ id: crypto.randomUUID(), value: parsed.display, number: parsed.number, multiplier: parsed.multiplier, score: parsed.score });
        showFlash("Wurf manuell eingetragen");
    }

    state.waitingForTakeout = false;
    checkTrainingProgress();
    updateUI();
    closeCorrectionModal();
}

function parseSegmentFromString(val) {
    if (val === "MISS") return { display: "MISS", number: 0, multiplier: 0, score: 0 };
    if (val === "SBULL") return { display: "SBULL", number: 25, multiplier: 1, score: 25 };
    if (val === "DBULL") return { display: "DBULL", number: 25, multiplier: 2, score: 50 };

    const prefix = val.charAt(0);
    const num = parseInt(val.slice(1), 10);
    const mult = prefix === "D" ? 2 : prefix === "T" ? 3 : 1;
    return { display: val, number: num, multiplier: mult, score: num * mult };
}

function startGame() {
    state.targetNumber = parseInt(document.getElementById("target").value) || 20;
    state.totalDartsLimit = parseInt(document.getElementById("darts").value) || 30;

    state.throws = [];
    state.waitingForTakeout = false;
    state.trainingActive = true;
    state.sessionFinished = false;
    lastNumThrows = 0;

    updateUI();
    showFlash(`Training auf ${state.targetNumber} gestartet!`);
}

function abortTraining() {
    if (!state.trainingActive && state.throws.length === 0) return;
    if (confirm("Aktuelles Training wirklich abbrechen? Es wird nichts gespeichert.")) {
        state.throws = [];
        state.waitingForTakeout = false;
        state.trainingActive = false;
        state.sessionFinished = false;
        updateUI();
        showFlash("Training abgebrochen");
    }
}

function finishTrainingSession() {
    state.sessionFinished = true;
    state.trainingActive = false;

    let totalScore = 0;
    let totalHits = 0;
    state.throws.forEach(t => {
        if (t.number === state.targetNumber && t.multiplier > 0) {
            totalScore += t.score;
            totalHits++;
        }
    });

    const totalDarts = state.throws.length;
    const hitrate = totalDarts > 0 ? ((totalHits / totalDarts) * 100).toFixed(1) : "0.0";
    const threeAvg = totalDarts > 0 ? ((totalScore / totalDarts) * 3).toFixed(1) : "0.0";

    const singleCount = state.throws.filter(t => t.number === state.targetNumber && t.multiplier === 1).length;
    const doubleCount = state.throws.filter(t => t.number === state.targetNumber && t.multiplier === 2).length;
    const tripleCount = state.throws.filter(t => t.number === state.targetNumber && t.multiplier === 3).length;
    const missCount = state.throws.length - (singleCount + doubleCount + tripleCount);

    const entry = {
        date: new Date().toLocaleString(),
        target: state.targetNumber,
        darts: totalDarts,
        score: totalScore,
        singles: singleCount,
        doubles: doubleCount,
        triples: tripleCount,
        misses: missCount,
        hitrate: hitrate,
        threeAvg: threeAvg
    };

    const history = JSON.parse(localStorage.getItem("dartHistory") || "[]");
    history.push(entry);
    localStorage.setItem("dartHistory", JSON.stringify(history));

    const resultText = document.getElementById("modalResultText");
    if (resultText) {
        resultText.innerHTML = `
            Ziel: <b>${state.targetNumber}</b> | Pfeile: <b>${totalDarts}</b><br>
            Score: <b style="color:#00ffa2;">${totalScore} Punkte</b><br>
            Trefferquote: <b style="color:#00e5ff;">${hitrate}%</b> • 3DA: <b>${threeAvg}</b>
        `;
    }
    document.getElementById("sessionFinishedModal").classList.remove("hidden");
}

function closeFinishModal() {
    document.getElementById("sessionFinishedModal").classList.add("hidden");
    state.throws = [];
    state.sessionFinished = false;
    updateUI();
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

function openStats() {
    window.location.href = "stats.html";
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
    updateUI();
});