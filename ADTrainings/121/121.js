"use strict";

/* ==========================================
   121 CHECKOUT SOLO (20 LEGS) - Autodarts
   Mit Zwei-Bedingungen-Prinzip, permanenter Korrektur & sofortigem Takeout-Reset
========================================== */

const MAX_LEGS = 20;

let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);
let lastNumThrows = 0;

const CHECKOUT_PATHS = {
    170: "T20 • T20 • DBULL", 167: "T20 • T19 • DBULL", 164: "T20 • T18 • DBULL",
    161: "T20 • T17 • DBULL", 160: "T20 • T20 • D20",   158: "T20 • T20 • D19",
    157: "T20 • T19 • D20",   156: "T20 • T20 • D18",   155: "T20 • T19 • D19",
    154: "T20 • T18 • D20",   153: "T20 • T19 • D18",   152: "T20 • T20 • D16",
    151: "T20 • T17 • D20",   150: "T20 • T18 • D18",   149: "T20 • T19 • D16",
    148: "T20 • T16 • D20",   147: "T20 • T17 • D18",   146: "T20 • T18 • D16",
    145: "T20 • T15 • D20",   144: "T20 • T20 • D12",   143: "T20 • T17 • D16",
    142: "T20 • T14 • D20",   141: "T20 • T19 • D12",   140: "T20 • T20 • D10",
    139: "T19 • T14 • D20",   138: "T20 • T18 • D12",   137: "T20 • T19 • D10",
    136: "T20 • T20 • D8",    135: "SBULL • T20 • DBULL",134: "T20 • T14 • D16",
    133: "T20 • T19 • D8",    132: "SBULL • SBULL • D16",131: "T20 • T13 • D16",
    130: "T20 • T20 • D5",    129: "T19 • T16 • D12",   128: "T18 • T14 • D16",
    127: "T20 • T17 • D8",    126: "T19 • T19 • D6",    125: "SBULL • T20 • D20",
    124: "T20 • T16 • D8",    123: "T19 • T16 • D9",    122: "T18 • T20 • D4",
    121: "T20 • T11 • D14",   120: "T20 • 20 • D20",    119: "T19 • T12 • D13",
    118: "T20 • 18 • D20",    117: "T20 • 17 • D20",    116: "T20 • 16 • D20",
    115: "T20 • 15 • D20",    114: "T20 • 14 • D20",    113: "T20 • 13 • D20",
    112: "T20 • 12 • D20",    111: "T20 • 19 • D16",    110: "T20 • 10 • D20",
    109: "T20 • 9 • D20",     108: "T20 • 16 • D16",    107: "T19 • 10 • D20",
    106: "T20 • 6 • D20",     105: "T20 • 13 • D16",    104: "T18 • 10 • D20",
    103: "T20 • 3 • D20",     102: "T20 • 10 • D16",    101: "T17 • 10 • D20",
    100: "T20 • D20",         99: "T19 • 10 • D16",     98: "T20 • D19",
    97: "T19 • D20",          96: "T20 • D18",          95: "T19 • D19",
    94: "T18 • D20",          93: "T19 • D18",          92: "T20 • D16",
    91: "T17 • D20",          90: "T18 • D18",          89: "T19 • D16",
    88: "T16 • D20",          87: "T17 • D18",          86: "T18 • D16",
    85: "T15 • D20",          84: "T20 • D12",          83: "T17 • D16",
    82: "DBULL • D16",        81: "T19 • D12",          80: "T20 • D10",
    79: "T13 • D20",          78: "T18 • D12",          77: "T19 • D10",
    76: "T20 • D8",           75: "T17 • D12",          74: "T14 • D16",
    73: "T19 • D8",           72: "T16 • D12",          71: "T13 • D16",
    70: "T10 • D20",          69: "T19 • D6",           68: "T20 • D4",
    67: "T17 • D8",           66: "T10 • D18",          65: "SBULL • D20",
    64: "T16 • D8",           63: "T13 • D12",          62: "T10 • D16",
    61: "SBULL • D18",        60: "20 • D20",           59: "19 • D20",
    58: "18 • D20",           57: "17 • D20",           56: "16 • D20",
    55: "15 • D20",           54: "14 • D20",           53: "13 • D20",
    52: "12 • D20",           51: "11 • D20",           50: "DBULL (oder 10 • D20)",
    49: "9 • D20",            48: "16 • D16",           47: "15 • D16",
    46: "6 • D20",            45: "13 • D16",           44: "12 • D16",
    43: "11 • D16",           42: "10 • D16",           41: "9 • D16"
};

const state = {
    currentTargetLevel: 121,
    highestCheckout: 0,
    legsWon: 0,
    legsLost: 0,
    doubleAttempts: 0,
    doubleHits: 0,
    legThrows: [],
    waitingForTakeout: false,
    pendingLegResult: null,
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

        // BEDIENUNG 2: Board ist physisch leer (Takeout erfolgt)
        if (state.waitingForTakeout) {
            if (throws.length === 0) {
                state.waitingForTakeout = false;
                lastNumThrows = 0;

                if (state.pendingLegResult) {
                    finalizeLeg(state.pendingLegResult);
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
        return { display: "MISS", number: 0, multiplier: 0, score: 0, isDouble: false };
    }

    if (name.toUpperCase().includes("BULL") || number === 25 || number === 50 || name === "25" || name === "50") {
        const isDouble = (multiplier === 2 || name.toUpperCase() === "DBULL" || number === 50 || name === "50");
        return {
            display: isDouble ? "DBULL" : "SBULL",
            number: 25,
            multiplier: isDouble ? 2 : 1,
            score: isDouble ? 50 : 25,
            isDouble: isDouble
        };
    }

    return {
        display: name,
        number: number,
        multiplier: multiplier,
        score: number * multiplier,
        isDouble: multiplier === 2
    };
}

function isDoubleFinishPossible(score) {
    return (score === 50) || (score >= 2 && score <= 40 && score % 2 === 0);
}

function registerThrow(hit) {
    if (state.legThrows.length >= 9 || state.pendingLegResult || state.sessionFinished) return;

    const scoreBeforeThrow = getCurrentRemaining();
    const wasOnDouble = isDoubleFinishPossible(scoreBeforeThrow);

    state.legThrows.push({
        id: crypto.randomUUID(),
        value: hit.display,
        score: hit.score,
        isDouble: hit.isDouble,
        wasOnDouble: wasOnDouble
    });

    evaluateLegState();
}

function evaluateLegState() {
    let isLegWon = false;
    let runningScore = state.currentTargetLevel;

    for (let v = 0; v < 3; v++) {
        const startIdx = v * 3;
        const vThrows = state.legThrows.slice(startIdx, startIdx + 3);
        if (vThrows.length === 0) break;

        let vStart = runningScore;
        let vBust = false;

        for (let t of vThrows) {
            if (vBust || t.value === "BUST") {
                t.status = "bust";
                t.score = 0;
                t.isDouble = false;
                continue;
            }
            const next = runningScore - t.score;
            if (next === 0 && t.isDouble) {
                t.status = "checkout";
                runningScore = 0;
                isLegWon = true;
                break;
            } else if (next < 0 || next === 1 || (next === 0 && !t.isDouble)) {
                vBust = true;
                t.status = "bust";
                runningScore = vStart; // Setzt Score für diese Aufnahme sauber auf den Startwert zurück
                break;
            } else {
                t.status = "valid";
                runningScore = next;
            }
        }
        if (isLegWon) break;
    }

    if (isLegWon) {
        state.pendingLegResult = "WIN";
        state.waitingForTakeout = true;
        showFlash(`🎯 CHECKOUT! ${state.currentTargetLevel} gecheckt! – Bitte Pfeile ziehen`);
    } else if (state.legThrows.length >= 9) {
        state.pendingLegResult = "LOSS";
        state.waitingForTakeout = true;
        showFlash(`❌ Nicht gecheckt (Rest: ${runningScore}) – Bitte Pfeile ziehen`);
    } else if (state.legThrows.length % 3 === 0) {
        state.waitingForTakeout = true;
        showFlash(`Aufnahme beendet – Bitte Pfeile ziehen`);
    }

    updateUI();
}

function finalizeLeg(result) {
    state.legThrows.forEach(t => {
        if (t.value !== "BUST" && t.wasOnDouble) {
            state.doubleAttempts++;
            if (t.status === "checkout") {
                state.doubleHits++;
            }
        }
    });

    if (result === "WIN") {
        state.legsWon++;
        if (state.currentTargetLevel > state.highestCheckout) {
            state.highestCheckout = state.currentTargetLevel;
        }
        state.currentTargetLevel += 1;
    } else if (result === "LOSS") {
        state.legsLost++;
        state.currentTargetLevel = Math.max(121, state.currentTargetLevel - 1);
    }

    state.legThrows = [];
    state.pendingLegResult = null;

    const playedLegs = state.legsWon + state.legsLost;
    if (playedLegs >= MAX_LEGS) {
        finish20LegSession();
    } else if (result === "WIN") {
        showFlash(`⬆️ Leg ${playedLegs + 1}/${MAX_LEGS} • Neues Ziel: ${state.currentTargetLevel}`);
    } else {
        showFlash(`⬇️ Leg ${playedLegs + 1}/${MAX_LEGS} • Neues Ziel: ${state.currentTargetLevel}`);
    }
}

function finish20LegSession() {
    state.sessionFinished = true;

    const totalLegs = state.legsWon + state.legsLost;
    const legCheckoutRate = totalLegs > 0 ? ((state.legsWon / totalLegs) * 100).toFixed(1) : "0.0";
    const doubleDartRate = state.doubleAttempts > 0 ? ((state.doubleHits / state.doubleAttempts) * 100).toFixed(1) : "0.0";

    const sessionRecord = {
        id: Date.now() + "-" + Math.random().toString(36).slice(2),
        date: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        legsWon: state.legsWon,
        legsLost: state.legsLost,
        totalLegs: totalLegs,
        checkoutRate: parseFloat(legCheckoutRate),
        doubleDartRate: parseFloat(doubleDartRate),
        highestCheckout: state.highestCheckout,
        endLevel: state.currentTargetLevel
    };

    let history = JSON.parse(localStorage.getItem("checkout121History") || "[]");
    history.push(sessionRecord);
    history.sort((a, b) => (b.checkoutRate - a.checkoutRate) || (b.highestCheckout - a.highestCheckout));
    localStorage.setItem("checkout121History", JSON.stringify(history));

    const rank = history.findIndex(item => item.id === sessionRecord.id) + 1;

    const resultText = document.getElementById("modalResultText");
    if (resultText) {
        resultText.innerHTML = `
            Du hast <b style="color:#00ffa2;">${state.legsWon} von ${MAX_LEGS} Legs</b> gecheckt!<br>
            Checkout-Quote: <b style="color:#00e5ff;">${legCheckoutRate}%</b> • Doppel-Quote: <b>${doubleDartRate}%</b><br>
            Höchstes Finish: <b style="color:#00ffa2;">${state.highestCheckout || "-"}</b> • Platz <b>#${rank}</b>
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
            row.innerHTML = `
                <span>#${idx + 1} (${entry.date})</span>
                <span><b>${entry.checkoutRate.toFixed(1)}%</b> (${entry.legsWon}/${entry.totalLegs}) • Max: ${entry.highestCheckout || "-"}</span>
            `;
            hsContainer.appendChild(row);
        });
    }

    document.getElementById("sessionFinishedModal").classList.remove("hidden");
    updateUI();
}

function startNewSessionAfterFinish() {
    document.getElementById("sessionFinishedModal").classList.add("hidden");
    state.currentTargetLevel = 121;
    state.highestCheckout = 0;
    state.legsWon = 0;
    state.legsLost = 0;
    state.doubleAttempts = 0;
    state.doubleHits = 0;
    state.legThrows = [];
    state.waitingForTakeout = false;
    state.pendingLegResult = null;
    state.sessionFinished = false;
    updateUI();
}

function getCurrentRemaining() {
    let remaining = state.currentTargetLevel;
    for (let v = 0; v < 3; v++) {
        const startIdx = v * 3;
        const vThrows = state.legThrows.slice(startIdx, startIdx + 3);
        if (vThrows.length === 0) break;
        let vStart = remaining;
        let vBust = false;

        for (let t of vThrows) {
            if (vBust || t.value === "BUST") continue;
            const next = remaining - t.score;
            if (next === 0 && t.isDouble) {
                remaining = 0;
                break;
            } else if (next < 0 || next === 1 || (next === 0 && !t.isDouble)) {
                vBust = true;
                remaining = vStart;
                break;
            } else {
                remaining = next;
            }
        }
    }
    return Math.max(0, remaining);
}

function getCheckoutSuggestion(score) {
    if (score === 0) return "CHECKED!";
    if (score > 170 || [169, 168, 166, 165, 163, 162, 159].includes(score)) {
        return "Kein Finish möglich – Stellen!";
    }
    if (CHECKOUT_PATHS[score]) return CHECKOUT_PATHS[score];
    if (score <= 40 && score % 2 === 0) return `D${score / 2}`;
    if (score <= 40 && score % 2 === 1) return `1 • D${(score - 1) / 2}`;
    return "Stellen auf Doppel";
}

function getPlayerLevelText(rate, totalLegs) {
    if (totalLegs === 0) return "Niveau: Noch keine Legs gespielt";
    if (rate > 60) return "Niveau: 🏆 Profispieler (> 60%)";
    if (rate >= 40) return "Niveau: 🎯 Vereins-/Ligaspieler (40–50%)";
    if (rate >= 25) return "Niveau: 🍺 Guter Kneipenspieler (25–35%)";
    if (rate >= 10) return "Niveau: 🌱 Anfänger (10–20%)";
    return "Niveau: 🔥 Warm-Up (< 10%)";
}

function updateUI() {
    const remaining = getCurrentRemaining();
    const playedLegs = state.legsWon + state.legsLost;
    const legRate = playedLegs > 0 ? ((state.legsWon / playedLegs) * 100).toFixed(1) : "0.0";

    let liveDoubleAttempts = state.doubleAttempts;
    let liveDoubleHits = state.doubleHits;
    state.legThrows.forEach(t => {
        if (t.value !== "BUST" && t.wasOnDouble) {
            liveDoubleAttempts++;
            if (t.status === "checkout") liveDoubleHits++;
        }
    });
    const doubleRate = liveDoubleAttempts > 0 ? ((liveDoubleHits / liveDoubleAttempts) * 100).toFixed(1) : "0.0";

    const currentLegDisplay = Math.min(MAX_LEGS, playedLegs + 1);
    const legBadge = document.getElementById("legCounterBadge");
    if (legBadge) {
        legBadge.textContent = state.sessionFinished
            ? `Beendet (${MAX_LEGS} / ${MAX_LEGS} Legs)`
            : `Leg ${currentLegDisplay} / ${MAX_LEGS}`;
    }

    document.getElementById("checkoutRate").textContent = `${legRate}%`;
    document.getElementById("playerLevelBadge").textContent = getPlayerLevelText(parseFloat(legRate), playedLegs);
    document.getElementById("currentLevelTarget").textContent = state.currentTargetLevel;
    document.getElementById("highestCheckout").textContent = state.highestCheckout > 0 ? state.highestCheckout : "-";
    document.getElementById("legsWon").textContent = state.legsWon;
    document.getElementById("legsLost").textContent = state.legsLost;
    document.getElementById("doubleDartRate").textContent = `${doubleRate}%`;

    document.getElementById("remainingScore").textContent = remaining;
    document.getElementById("checkoutGuide").textContent = getCheckoutSuggestion(remaining);

    const dartsUsed = state.legThrows.length;
    const dartsLeft = Math.max(0, 9 - dartsUsed);
    const currentVisitNum = Math.min(3, Math.floor(dartsUsed / 3) + 1);

    document.getElementById("dartsLeftText").textContent = `${dartsLeft} / 9 Darts (Aufnahme ${currentVisitNum}/3)`;
    document.getElementById("dartsLeftBar").style.width = `${(dartsLeft / 9) * 100}%`;

    renderVisitList();
    renderCurrentVisitThrows();
}

function renderVisitList() {
    const container = document.getElementById("visitList");
    if (!container) return;
    container.innerHTML = "";

    let runningScore = state.currentTargetLevel;

    for (let v = 0; v < 3; v++) {
        const startIdx = v * 3;
        const visitThrows = state.legThrows.slice(startIdx, startIdx + 3);
        const row = document.createElement("div");
        row.className = "visit-row";

        const isCurrentVisit = Math.floor(state.legThrows.length / 3) === v && !state.pendingLegResult && !state.waitingForTakeout;
        if (isCurrentVisit) row.classList.add("active");

        if (visitThrows.length === 0) {
            row.innerHTML = `<span>Aufnahme ${v + 1}</span><span>- / - / -</span><span>${v === 0 ? "Start: " + state.currentTargetLevel : "-"}</span>`;
        } else {
            const labels = [0, 1, 2].map(i => visitThrows[i] ? visitThrows[i].value : "-").join(" / ");
            const hasBust = visitThrows.some(t => t.status === "bust");

            if (hasBust) {
                row.classList.add("bust");
                row.innerHTML = `<span>Aufnahme ${v + 1}</span><span>${labels}</span><span>BUST (${runningScore})</span>`;
            } else {
                const scored = visitThrows.reduce((sum, t) => sum + (t.value === "BUST" ? 0 : t.score), 0);
                runningScore -= scored;
                row.innerHTML = `<span>Aufnahme ${v + 1}</span><span>${labels}</span><span>Rest: ${runningScore}</span>`;
            }
        }
        container.appendChild(row);
    }
}

// Die 3 aktuellen Wurf-Karten unten (Setzt sich nach Takeout sofort auf leere Slots zurück)
function renderCurrentVisitThrows() {
    const container = document.getElementById("lastThrows");
    if (!container) return;
    container.innerHTML = "";

    let visitIndex = Math.floor(state.legThrows.length / 3);
    // Solange wir noch auf das Ziehen warten, zeigen wir die geworfene Aufnahme an. Sobald gezogen wurde, springt es sofort auf die nächste freie Aufnahme!
    if (state.waitingForTakeout && state.legThrows.length > 0 && state.legThrows.length % 3 === 0) {
        visitIndex -= 1;
    }

    const startIdx = Math.max(0, visitIndex * 3);
    const currentThrows = state.legThrows.slice(startIdx, startIdx + 3);
    const currentSlotOffset = startIdx;

    for (let i = 0; i < 3; i++) {
        const card = document.createElement("div");
        card.className = "throw-card";
        const t = currentThrows[i];
        const absoluteIndex = currentSlotOffset + i;

        if (t) {
            if (t.status === "checkout") card.classList.add("checkout-throw");
            else if (t.status === "bust") card.classList.add("bust-throw");
            else card.classList.add("valid-throw");

            card.innerHTML = `
                <div class="throw-hit">${t.value}</div>
                <div class="throw-score">${t.score} Punkte</div>
            `;
            card.onclick = () => openCorrectionModal(t.id, t.value, absoluteIndex);
        } else {
            card.style.opacity = "0.45";
            card.innerHTML = `
                <div class="throw-hit">-</div>
                <div class="throw-score">Pfeil ${i + 1} (Klick)</div>
            `;
            card.onclick = () => openCorrectionModal(null, "MISS", absoluteIndex);
        }
        container.appendChild(card);
    }
}

function undoLastThrow() {
    if (state.legThrows.length === 0 || state.sessionFinished) return;

    state.legThrows.pop();
    state.pendingLegResult = null;
    state.waitingForTakeout = false;
    evaluateLegState();
    showFlash("Letzter Wurf zurückgenommen");
}

function resetSession() {
    if (confirm("Aktuelle 20-Legs-Einheit wirklich abbrechen? Es wird nichts in der Statistik gespeichert.")) {
        startNewSessionAfterFinish();
        showFlash("Einheit abgebrochen & zurückgesetzt");
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
    if (state.sessionFinished) return;
    selectedThrowId = throwId;
    selectedAbsoluteIndex = absoluteIndex;
    const select = document.getElementById("correctionSelect");
    if (select && currentVal !== "BUST") {
        select.value = currentVal;
    }
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
        const idx = state.legThrows.findIndex(t => t.id === selectedThrowId);
        if (idx !== -1) {
            state.legThrows[idx].value = parsed.display;
            state.legThrows[idx].score = parsed.score;
            state.legThrows[idx].isDouble = parsed.isDouble;
            showFlash("Wurf korrigiert");
        }
    } else if (selectedAbsoluteIndex !== null) {
        while (state.legThrows.length < selectedAbsoluteIndex) {
            const scoreBefore = getCurrentRemaining();
            const wasOnDouble = isDoubleFinishPossible(scoreBefore);
            state.legThrows.push({
                id: crypto.randomUUID(),
                value: "MISS",
                score: 0,
                isDouble: false,
                wasOnDouble: wasOnDouble
            });
        }
        const scoreBefore = getCurrentRemaining();
        const wasOnDouble = isDoubleFinishPossible(scoreBefore);
        state.legThrows.push({
            id: crypto.randomUUID(),
            value: parsed.display,
            score: parsed.score,
            isDouble: parsed.isDouble,
            wasOnDouble: wasOnDouble
        });
        showFlash("Wurf manuell eingetragen");
    }

    state.pendingLegResult = null;
    state.waitingForTakeout = false;
    evaluateLegState();
    closeCorrectionModal();
}

function parseSegmentFromString(val) {
    if (val === "MISS") return { display: "MISS", score: 0, isDouble: false };
    if (val === "SBULL") return { display: "SBULL", score: 25, isDouble: false };
    if (val === "DBULL") return { display: "DBULL", score: 50, isDouble: true };

    const prefix = val.charAt(0);
    const num = parseInt(val.slice(1), 10);
    const mult = prefix === "D" ? 2 : prefix === "T" ? 3 : 1;
    return {
        display: val,
        score: num * mult,
        isDouble: mult === 2
    };
}

document.addEventListener("DOMContentLoaded", () => {
    populateCorrectionDropdown();
    document.getElementById("saveCorrectionBtn").addEventListener("click", saveCorrection);
    document.getElementById("cancelCorrectionBtn").addEventListener("click", closeCorrectionModal);
    updateUI();
});