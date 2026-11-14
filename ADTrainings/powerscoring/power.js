"use strict";

/* ==========================================
   POWER SCORING (Scolia Layout) - Autodarts
   Mit Zwei-Bedingungen-Prinzip & jederzeitiger Korrektur/Manuelleingabe
========================================== */

const MAX_ROUNDS = 10;

let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);
let lastNumThrows = 0;

const state = {
    currentRound: 1,      // 1 bis 10
    throws: [],           // Alle Würfe der aktuellen Einheit
    waitingForTakeout: false,
    sessionFinished: false
};

ws.onopen = () => {
    updateBoardStatusUI("ready", false);
};
ws.onerror = (err) => console.error("WS Fehler:", err);
ws.onclose = () => {
    const badge = document.getElementById("boardStatusBadge");
    if (badge) {
        badge.textContent = "🔴 Board getrennt";
        badge.className = "";
    }
};

ws.onmessage = (msg) => {
    if (state.sessionFinished) return;
    const event = JSON.parse(msg.data);
    if (!event.data) return;

    if (event.type === "state") {
        const data = event.data;
        const throws = data.throws || [];
        const status = data.status;

        // BEDINGUNG 2: Board ist physisch leer (Takeout erfolgt)
        if (state.waitingForTakeout) {
            if (throws.length === 0) {
                state.waitingForTakeout = false;
                lastNumThrows = 0;

                const roundThrows = getCurrentRoundThrows();
                if (roundThrows.length === 3 && state.currentRound < MAX_ROUNDS) {
                    state.currentRound++;
                } else if (roundThrows.length === 3 && state.currentRound === MAX_ROUNDS) {
                    finishPowerSession();
                }
                updateUI();
            }
        }

        updateBoardStatusUI(status, state.waitingForTakeout);

        if (state.waitingForTakeout || state.sessionFinished) return;

        if (throws.length > 0) {
            processStateEvent(data);
        }
    }
};

function updateBoardStatusUI(status, isWaitingTakeout) {
    const badge = document.getElementById("boardStatusBadge");
    if (!badge) return;

    if (isWaitingTakeout || status === "takeout") {
        badge.textContent = "🎯 Bitte Pfeile ziehen (Takeout)";
        badge.className = "status-takeout";
    } else if (status === "throw" || status === "throwDetected" || status === "waitingForThrow" || status === "ready" || status === "idle") {
        badge.textContent = "🟢 Bereit zum Werfen";
        badge.className = "status-ready";
    } else {
        badge.textContent = `⚡ Status: ${status || "Verbunden"}`;
        badge.className = "status-ready";
    }
}

function processStateEvent(data) {
    const throws = data.throws;
    if (!Array.isArray(throws) || state.waitingForTakeout) return;

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
        return { display: "MISS", score: 0, isTriple: false };
    }

    if (name.toUpperCase().includes("BULL") || number === 25 || number === 50 || name === "25" || name === "50") {
        const isDouble = (multiplier === 2 || name.toUpperCase() === "DBULL" || number === 50 || name === "50");
        return {
            display: isDouble ? "DBULL" : "SBULL",
            score: isDouble ? 50 : 25,
            isTriple: false
        };
    }

    return {
        display: name,
        score: number * multiplier,
        isTriple: multiplier === 3
    };
}

function getCurrentRoundThrows() {
    const startIdx = (state.currentRound - 1) * 3;
    return state.throws.slice(startIdx, startIdx + 3);
}

function registerThrow(hit) {
    const roundThrows = getCurrentRoundThrows();
    if (roundThrows.length >= 3 || state.sessionFinished) return;

    state.throws.push({
        id: crypto.randomUUID(),
        value: hit.display,
        score: hit.score,
        isTriple: hit.isTriple
    });

    checkRoundCompletion();
    updateUI();
}

function checkRoundCompletion() {
    const updatedRoundThrows = getCurrentRoundThrows();
    if (updatedRoundThrows.length === 3) {
        state.waitingForTakeout = true;
        const visitSum = updatedRoundThrows.reduce((s, t) => s + t.score, 0);
        showFlash(`Aufnahme ${state.currentRound}: ${visitSum} Punkte – Bitte Pfeile ziehen`);
    }
}

function finishPowerSession() {
    state.sessionFinished = true;

    const totalScore = state.throws.reduce((sum, t) => sum + t.score, 0);
    const totalDarts = state.throws.length;
    const threeDartAvg = totalDarts > 0 ? ((totalScore / totalDarts) * 3).toFixed(1) : "0.0";
    const triples = state.throws.filter(t => t.isTriple).length;

    const sessionRecord = {
        id: Date.now() + "-" + Math.random().toString(36).slice(2),
        date: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        totalScore: totalScore,
        average: parseFloat(threeDartAvg),
        triples: triples
    };

    let history = JSON.parse(localStorage.getItem("powerScoringHistory") || "[]");
    history.push(sessionRecord);
    history.sort((a, b) => b.totalScore - a.totalScore);
    localStorage.setItem("powerScoringHistory", JSON.stringify(history));

    const rank = history.findIndex(item => item.id === sessionRecord.id) + 1;

    const resultText = document.getElementById("modalResultText");
    if (resultText) {
        resultText.innerHTML = `
            Gesamtscore: <b style="color:#00ffa2; font-size:18px;">${totalScore} Punkte</b><br>
            3-Dart Average: <b style="color:#00e5ff; font-size:18px;">${threeDartAvg}</b><br>
            Platz in Bestenliste: <b>#${rank}</b>
        `;
    }

    const hsContainer = document.getElementById("modalHighscoreList");
    if (hsContainer) {
        hsContainer.innerHTML = "";
        history.slice(0, 10).forEach((entry, idx) => {
            const row = document.createElement("div");
            row.style.cssText = "display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px;";
            if (entry.id === sessionRecord.id) {
                row.style.color = "#00e5ff";
                row.style.fontWeight = "bold";
            }
            row.innerHTML = `<span>#${idx + 1} (${entry.date})</span> <span><b>${entry.totalScore} Pkt.</b></span>`;
            hsContainer.appendChild(row);
        });
    }

    document.getElementById("sessionFinishedModal").classList.remove("hidden");
    updateUI();
}

function startNewPowerSession() {
    document.getElementById("sessionFinishedModal").classList.add("hidden");
    state.currentRound = 1;
    state.throws = [];
    state.waitingForTakeout = false;
    state.sessionFinished = false;
    updateUI();
}

function updateUI() {
    const totalScore = state.throws.reduce((sum, t) => sum + t.score, 0);
    const totalDarts = state.throws.length;
    const avg = totalDarts > 0 ? ((totalScore / totalDarts) * 3).toFixed(1) : "0.0";

    document.getElementById("totalScore").textContent = totalScore;
    document.getElementById("averageDisplay").textContent = avg;

    renderRoundsGrid();
    renderCurrentVisitThrows();
    updateFooterStats();
}

// 10 Runden Raster
function renderRoundsGrid() {
    const container = document.getElementById("scoliaRoundsGrid");
    if (!container) return;
    container.innerHTML = "";

    for (let r = 1; r <= MAX_ROUNDS; r++) {
        const startIdx = (r - 1) * 3;
        const roundThrows = state.throws.slice(startIdx, startIdx + 3);
        const card = document.createElement("div");
        card.className = "scolia-round-card";

        if (r === state.currentRound && !state.sessionFinished) {
            card.classList.add("active");
        }

        const sum = roundThrows.reduce((s, t) => s + t.score, 0);
        const displayScore = roundThrows.length > 0 ? sum : 0;
        const percent = Math.min(100, (displayScore / 180) * 100);

        card.innerHTML = `
            <div class="scolia-round-bar" style="height: ${percent}%;"></div>
            <div class="scolia-round-score">${displayScore}</div>
            <div class="scolia-round-label">Runde ${r}</div>
        `;
        container.appendChild(card);
    }
}

// Die 3 Würfe unten: IMMER klickbar (auch wenn noch kein Wurf erkannt wurde!)
function renderCurrentVisitThrows() {
    const container = document.getElementById("lastThrows");
    if (!container) return;
    container.innerHTML = "";

    const currentThrows = getCurrentRoundThrows();

    for (let i = 0; i < 3; i++) {
        const card = document.createElement("div");
        card.className = "throw-card";
        const t = currentThrows[i];

        if (t) {
            card.innerHTML = `
                <div class="throw-hit">${t.value}</div>
                <div class="throw-score">${t.score} Punkte</div>
            `;
            card.onclick = () => openCorrectionModal(t.id, t.value, i);
        } else {
            card.style.opacity = "0.45";
            card.innerHTML = `
                <div class="throw-hit">-</div>
                <div class="throw-score">Pfeil ${i + 1} (Klick zum Eintragen)</div>
            `;
            // Klick auf leeren Slot öffnet ebenfalls das Modal (Standard: MISS)
            card.onclick = () => openCorrectionModal(null, "MISS", i);
        }
        container.appendChild(card);
    }
}

function updateFooterStats() {
    const history = JSON.parse(localStorage.getItem("powerScoringHistory") || "[]");
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const todayStr = now.toLocaleDateString();

    let bestToday = 0;
    let bestMonth = 0;
    let bestAllTime = 0;

    if (history.length > 0) {
        bestAllTime = Math.max(...history.map(s => s.totalScore));

        const todayEntries = history.filter(s => new Date(s.timestamp || s.date).toLocaleDateString() === todayStr);
        if (todayEntries.length > 0) {
            bestToday = Math.max(...todayEntries.map(s => s.totalScore));
        }

        const monthEntries = history.filter(s => {
            const d = new Date(s.timestamp || s.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });
        if (monthEntries.length > 0) {
            bestMonth = Math.max(...monthEntries.map(s => s.totalScore));
        }
    }

    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    document.getElementById("statMonthLabel").textContent = monthNames[currentMonth];

    document.getElementById("statToday").textContent = bestToday;
    document.getElementById("statMonth").textContent = bestMonth;
    document.getElementById("statAllTime").textContent = bestAllTime;
}

function undoLastThrow() {
    if (state.throws.length === 0 || state.sessionFinished) return;

    state.throws.pop();
    state.currentRound = Math.floor(state.throws.length / 3) + 1;
    state.waitingForTakeout = false;

    updateUI();
    showFlash("Letzter Wurf zurückgenommen");
}

function resetPowerSession() {
    if (confirm("Aktuelle Einheit wirklich abbrechen?")) {
        startNewPowerSession();
        showFlash("Einheit abgebrochen");
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

let selectedThrowId = null;
let selectedSlotIndex = null;

function populateCorrectionDropdown() {
    const select = document.getElementById("correctionSelect");
    if (!select) return;

    const options = ["MISS", "SBULL", "DBULL"];
    for (let n = 20; n >= 1; n--) {
        options.push(`S${n}`, `D${n}`, `T${n}`);
    }
    select.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join("");
}

function openCorrectionModal(throwId, currentVal, slotIndex) {
    if (state.sessionFinished) return;
    selectedThrowId = throwId;
    selectedSlotIndex = slotIndex;
    const select = document.getElementById("correctionSelect");
    if (select) select.value = currentVal;
    document.getElementById("correctionModal").classList.remove("hidden");
}

function closeCorrectionModal() {
    selectedThrowId = null;
    selectedSlotIndex = null;
    document.getElementById("correctionModal").classList.add("hidden");
}

function saveCorrection() {
    const newVal = document.getElementById("correctionSelect").value;
    const parsed = parseSegmentFromString(newVal);

    if (selectedThrowId) {
        // Bestehenden Wurf korrigieren
        const t = state.throws.find(item => item.id === selectedThrowId);
        if (t) {
            t.value = parsed.display;
            t.score = parsed.score;
            t.isTriple = parsed.isTriple;
            showFlash("Wurf korrigiert");
        }
    } else if (selectedSlotIndex !== null) {
        // Leeren Slot manuell auffüllen (falls z. B. Pfeil 2 oder 3 nicht erkannt wurde)
        const currentThrows = getCurrentRoundThrows();
        // Falls z. B. Pfeil 3 angeklickt wurde, obwohl Pfeil 2 auch noch fehlt, füllen wir fehlende Slots davor mit MISS auf
        while (getCurrentRoundThrows().length < selectedSlotIndex) {
            state.throws.push({
                id: crypto.randomUUID(),
                value: "MISS",
                score: 0,
                isTriple: false
            });
        }
        state.throws.push({
            id: crypto.randomUUID(),
            value: parsed.display,
            score: parsed.score,
            isTriple: parsed.isTriple
        });

        checkRoundCompletion();
        showFlash("Wurf manuell eingetragen");
    }

    updateUI();
    closeCorrectionModal();
}

function parseSegmentFromString(val) {
    if (val === "MISS") return { display: "MISS", score: 0, isTriple: false };
    if (val === "SBULL") return { display: "SBULL", score: 25, isTriple: false };
    if (val === "DBULL") return { display: "DBULL", score: 50, isTriple: false };

    const prefix = val.charAt(0);
    const num = parseInt(val.slice(1), 10);
    const mult = prefix === "D" ? 2 : prefix === "T" ? 3 : 1;
    return {
        display: val,
        score: num * mult,
        isTriple: mult === 3
    };
}

document.addEventListener("DOMContentLoaded", () => {
    populateCorrectionDropdown();
    document.getElementById("saveCorrectionBtn").addEventListener("click", saveCorrection);
    document.getElementById("cancelCorrectionBtn").addEventListener("click", closeCorrectionModal);
    updateUI();
});