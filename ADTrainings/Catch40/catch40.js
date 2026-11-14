"use strict";

/* ==========================================
   CATCH 40 - Checkouts 61 bis 100
   Mit Zwei-Bedingungen-Takeout & Chronologischer Neuberechnung
========================================== */

let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);
let lastNumThrows = 0;

// Alle 40 Ziele: 61 bis 100
const CATCH40_TARGETS = Array.from({ length: 40 }, (_, i) => 61 + i);

// Gängige Checkout-Wege für 2 bis 100
const CHECKOUT_ROUTES = {
    100: "T20 D20", 99: "T19 S10 D16", 98: "T20 D19", 97: "T19 D20", 96: "T20 D18",
    95: "T19 D19", 94: "T18 D20", 93: "T19 D18", 92: "T20 D16", 91: "T17 D20",
    90: "T20 D15", 89: "T19 D16", 88: "T16 D20", 87: "T17 D18", 86: "T18 D16",
    85: "T15 D20", 84: "T20 D12", 83: "T17 D16", 82: "DBULL D16", 81: "T19 D12",
    80: "T20 D10", 79: "T13 D20", 78: "T18 D12", 77: "T19 D10", 76: "T20 D8",
    75: "T17 D12", 74: "T14 D16", 73: "T19 D8", 72: "T16 D12", 71: "T13 D16",
    70: "T10 D20", 69: "T19 D6", 68: "T20 D4", 67: "T17 D8", 66: "T10 D18",
    65: "SBULL D20", 64: "T16 D8", 63: "T13 D12", 62: "T10 D16", 61: "T15 D8",
    60: "S20 D20", 59: "S19 D20", 58: "S18 D20", 57: "S17 D20", 56: "S16 D20",
    55: "S15 D20", 54: "S14 D20", 53: "S13 D20", 52: "S12 D20", 51: "S11 D20",
    50: "DBULL", 49: "S9 D20", 48: "S16 D16", 47: "S15 D16", 46: "S6 D20",
    45: "S13 D16", 44: "S12 D16", 43: "S11 D16", 42: "S10 D16", 41: "S9 D16",
    40: "D20", 39: "S7 D16", 38: "D19", 37: "S5 D16", 36: "D18",
    35: "S3 D16", 34: "D17", 33: "S1 D16", 32: "D16", 31: "S15 D8",
    30: "D15", 29: "S13 D8", 28: "D14", 27: "S11 D8", 26: "D13",
    25: "S9 D8", 24: "D12", 23: "S7 D8", 22: "D11", 21: "S5 D8",
    20: "D10", 19: "S3 D8", 18: "D9", 17: "S1 D8", 16: "D8",
    15: "S7 D4", 14: "D7", 13: "S5 D4", 12: "D6", 11: "S3 D4",
    10: "D5", 9: "S1 D4", 8: "D4", 7: "S3 D2", 6: "D3",
    5: "S1 D2", 4: "D2", 3: "S1 D1", 2: "D1"
};

let state = {
    throws: [], // Alle geworfenen Darts chronologisch
    waitingForTakeout: false,
    sessionFinished: false
};

ws.onopen = () => updateBoardStatusUI("ready", false);
ws.onerror = (err) => console.error("WS Fehler:", err);
ws.onclose = () => {
    const badge = document.getElementById("boardStatusBadge");
    if (badge) { badge.textContent = "🔴 Board getrennt"; badge.className = "status-takeout"; }
};

ws.onmessage = (msg) => {
    if (state.sessionFinished) return;
    const event = JSON.parse(msg.data);
    if (!event.data) return;

    if (event.type === "state") {
        const data = event.data;
        const throws = data.throws || [];
        const status = data.status;

        // Zwei-Bedingungen-Takeout: Erst umschalten, wenn Takeout aktiv war UND Board leer ist
        if (state.waitingForTakeout) {
            if (throws.length === 0) {
                state.waitingForTakeout = false;
                lastNumThrows = 0;

                const sim = simulateCatch40();
                if (sim.finished && !state.sessionFinished) {
                    finishCatch40Session(sim);
                }
                updateUI();
            }
        }

        updateBoardStatusUI(status, state.waitingForTakeout);

        if (state.waitingForTakeout) return;

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

function processStateEvent(data) {
    const throws = data.throws;
    if (!Array.isArray(throws) || state.waitingForTakeout) return;

    if (throws.length < lastNumThrows) lastNumThrows = 0;
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
        return { display: "MISS", score: 0, isDouble: false };
    }

    if (name.toUpperCase().includes("BULL") || number === 25 || number === 50 || name === "25" || name === "50") {
        const isDouble = (multiplier === 2 || name.toUpperCase() === "DBULL" || number === 50 || name === "50");
        return {
            display: isDouble ? "DBULL" : "SBULL",
            score: isDouble ? 50 : 25,
            isDouble: isDouble
        };
    }

    return {
        display: name,
        score: number * multiplier,
        isDouble: multiplier === 2
    };
}

function registerThrow(hit) {
    if (state.waitingForTakeout || state.sessionFinished) return;

    const beforeSim = simulateCatch40();
    if (beforeSim.finished) return;

    state.throws.push({
        id: crypto.randomUUID(),
        value: hit.display,
        score: hit.score,
        isDouble: hit.isDouble
    });

    const afterSim = simulateCatch40();

    // Wenn ein Ziel gerade beendet wurde (Checkout oder nach 6 Darts verpasst) ODER 3 Darts einer Aufnahme voll sind -> Takeout!
    if (afterSim.completedTargets.length > beforeSim.completedTargets.length) {
        state.waitingForTakeout = true;
        const lastResult = afterSim.completedTargets[afterSim.completedTargets.length - 1];
        if (lastResult.points > 0) {
            showFlash(`🔥 ${lastResult.target} gecheckt! +${lastResult.points} Punkte – Pfeile ziehen`);
        } else {
            showFlash(`❌ ${lastResult.target} verpasst (0 Pkt.) – Pfeile ziehen`);
        }
    } else if (afterSim.currentVisitDarts.length >= 3) {
        state.waitingForTakeout = true;
        showFlash("Aufnahme 1 beendet – Pfeile ziehen für Aufnahme 2");
    }

    updateUI();
}

// ==========================================
// CHRONOLOGISCHE SIMULATION DES GESAMTEN SPIELS
// ==========================================
function simulateCatch40() {
    let targetIdx = 0;
    let currentTarget = CATCH40_TARGETS[targetIdx];
    let remaining = currentTarget;
    let dartsUsedOnTarget = 0;
    let visitStartRemaining = currentTarget;
    let currentVisitDarts = [];

    let totalPoints = 0;
    let count3 = 0, count2 = 0, count1 = 0;
    let doubleAttempts = 0;
    let doubleHits = 0;
    let completedTargets = [];

    for (let i = 0; i < state.throws.length; i++) {
        if (targetIdx >= CATCH40_TARGETS.length) break;

        const t = state.throws[i];
        dartsUsedOnTarget++;
        currentVisitDarts.push(t);

        // Doppelversuch zählen, wenn Rest <= 40 gerade oder 50 (DBULL)
        if ((visitStartRemaining <= 40 && visitStartRemaining % 2 === 0 && visitStartRemaining >= 2) || visitStartRemaining === 50) {
            // Prüfen auf den exakten Rest vor diesem einzelnen Dart
        }
        const remBeforeDart = remaining;
        if ((remBeforeDart <= 40 && remBeforeDart % 2 === 0 && remBeforeDart >= 2) || remBeforeDart === 50) {
            doubleAttempts++;
        }

        const newRem = remaining - t.score;

        // 1. Gültiges Checkout (Rest = 0 und Doppel/DBull)
        if (newRem === 0 && t.isDouble) {
            doubleHits++;
            let pts = 1;
            if (dartsUsedOnTarget <= 2 || (currentTarget === 99 && dartsUsedOnTarget === 3)) {
                pts = 3;
                count3++;
            } else if (dartsUsedOnTarget === 3) {
                pts = 2;
                count2++;
            } else {
                pts = 1;
                count1++;
            }

            totalPoints += pts;
            completedTargets.push({ target: currentTarget, points: pts, darts: dartsUsedOnTarget });

            // Nächstes Ziel vorbereiten
            targetIdx++;
            if (targetIdx < CATCH40_TARGETS.length) {
                currentTarget = CATCH40_TARGETS[targetIdx];
                remaining = currentTarget;
                visitStartRemaining = currentTarget;
                dartsUsedOnTarget = 0;
            }
            // currentVisitDarts behalten wir für die Anzeige, bis Takeout erfolgt, leeren sie aber bei neuem Dart
            if (i < state.throws.length - 1) {
                currentVisitDarts = [];
            }
            continue;
        }

        // 2. Bust (Überworfen, Rest = 1, oder Rest = 0 ohne Doppel)
        if (newRem < 2 || newRem === 0) {
            // Aufnahme ist sofort vorbei (Bust) -> Rest springt auf Start der Aufnahme zurück
            remaining = visitStartRemaining;

            if (dartsUsedOnTarget <= 3) {
                // Bust in Aufnahme 1 -> weiter mit Aufnahme 2 (Darts 4-6)
                dartsUsedOnTarget = 3;
                if (i < state.throws.length - 1) {
                    currentVisitDarts = [];
                }
            } else {
                // Bust in Aufnahme 2 -> Ziel gescheitert (0 Punkte)
                completedTargets.push({ target: currentTarget, points: 0, darts: 6 });
                targetIdx++;
                if (targetIdx < CATCH40_TARGETS.length) {
                    currentTarget = CATCH40_TARGETS[targetIdx];
                    remaining = currentTarget;
                    visitStartRemaining = currentTarget;
                    dartsUsedOnTarget = 0;
                }
                if (i < state.throws.length - 1) {
                    currentVisitDarts = [];
                }
            }
            continue;
        }

        // 3. Normaler Treffer ohne Checkout/Bust
        remaining = newRem;

        if (dartsUsedOnTarget === 3) {
            // Aufnahme 1 regulär vorbei -> Startwert für Aufnahme 2 sichern
            visitStartRemaining = remaining;
            if (i < state.throws.length - 1) {
                currentVisitDarts = [];
            }
        } else if (dartsUsedOnTarget >= 6) {
            // Aufnahme 2 regulär vorbei -> Ziel gescheitert (0 Punkte)
            completedTargets.push({ target: currentTarget, points: 0, darts: 6 });
            targetIdx++;
            if (targetIdx < CATCH40_TARGETS.length) {
                currentTarget = CATCH40_TARGETS[targetIdx];
                remaining = currentTarget;
                visitStartRemaining = currentTarget;
                dartsUsedOnTarget = 0;
            }
            if (i < state.throws.length - 1) {
                currentVisitDarts = [];
            }
        }
    }

    return {
        finished: targetIdx >= CATCH40_TARGETS.length,
        targetIdx,
        currentTarget: targetIdx < CATCH40_TARGETS.length ? CATCH40_TARGETS[targetIdx] : 100,
        remaining,
        dartsUsedOnTarget,
        currentVisitDarts,
        totalPoints,
        count3,
        count2,
        count1,
        doubleAttempts,
        doubleHits,
        completedTargets
    };
}

function getLevelBadge(points) {
    if (points >= 80) return { text: "Semi-Profi / Elite (80+ Pkt.)", color: "#00ffa2" };
    if (points >= 60) return { text: "Starkes Vereinsniveau (60–79 Pkt.)", color: "#00e5ff" };
    if (points >= 40) return { text: "Ligaspieler (40–59 Pkt.)", color: "#ffc107" };
    if (points >= 20) return { text: "Hobbyspieler (20–39 Pkt.)", color: "#ab47bc" };
    return { text: "Einsteiger (0–19 Pkt.)", color: "#cbd5e1" };
}

// ==========================================
// UI AKTUALISIEREN
// ==========================================
function updateUI() {
    const sim = simulateCatch40();

    document.getElementById("totalPoints").innerText = sim.totalPoints;
    document.getElementById("count3Pts").innerText = sim.count3;
    document.getElementById("count2Pts").innerText = sim.count2;
    document.getElementById("count1Pts").innerText = sim.count1;

    const lvl = getLevelBadge(sim.totalPoints);
    const lvlEl = document.getElementById("levelBadge");
    lvlEl.innerText = lvl.text;
    lvlEl.style.color = lvl.color;

    // Ziel & Restscore
    const displayTarget = state.waitingForTakeout && sim.completedTargets.length > 0 && sim.dartsUsedOnTarget === 0
        ? sim.completedTargets[sim.completedTargets.length - 1].target
        : sim.currentTarget;

    const displayIdx = state.waitingForTakeout && sim.completedTargets.length > 0 && sim.dartsUsedOnTarget === 0
        ? sim.targetIdx
        : sim.targetIdx + 1;

    document.getElementById("targetHeaderLabel").innerText = `ZIEL ${Math.min(40, displayIdx)} / 40 • START: ${displayTarget}`;
    document.getElementById("remainingScore").innerText = state.waitingForTakeout && sim.dartsUsedOnTarget === 0 ? "✓" : sim.remaining;
    document.getElementById("checkoutSuggestion").innerText = CHECKOUT_ROUTES[sim.remaining] || "Setup spielen";

    const visitNum = sim.dartsUsedOnTarget < 3 ? 1 : 2;
    document.getElementById("visitInfo").innerText = state.waitingForTakeout
        ? "Bitte Pfeile ziehen (Takeout)"
        : `Aufnahme ${visitNum} / 2 • Dart ${sim.dartsUsedOnTarget + 1} / 6`;

    // Quoten
    const checkedCount = sim.completedTargets.filter(c => c.points > 0).length;
    const totalDone = sim.completedTargets.length;
    const coRate = totalDone > 0 ? ((checkedCount / totalDone) * 100).toFixed(1) : "0.0";
    const dblRate = sim.doubleAttempts > 0 ? ((sim.doubleHits / sim.doubleAttempts) * 100).toFixed(1) : "0.0";
    const avgPts = totalDone > 0 ? (sim.totalPoints / totalDone).toFixed(2) : "0.00";

    document.getElementById("checkoutRate").innerText = `${coRate}%`;
    document.getElementById("checkoutCountText").innerText = `${checkedCount} / ${totalDone} gecheckt`;
    document.getElementById("doubleRate").innerText = `${dblRate}%`;
    document.getElementById("avgPoints").innerText = avgPts;

    renderCurrentVisitThrows(sim);
    renderRecentHistory(sim.completedTargets);
}

function renderCurrentVisitThrows(sim) {
    const container = document.getElementById("lastThrows");
    container.innerHTML = "";

    // Wenn wir auf Takeout warten und gerade ein Ziel abgeschlossen wurde, zeigen wir die Würfe der gerade beendeten Aufnahme
    let displayThrows = sim.currentVisitDarts;
    if (!state.waitingForTakeout && sim.dartsUsedOnTarget % 3 === 0) {
        displayThrows = [];
    }

    for (let i = 0; i < 3; i++) {
        const card = document.createElement("div");
        card.className = "stat-card throw-card";
        const t = displayThrows[i];

        if (t) {
            card.innerHTML = `
                <div class="stat-label">Pfeil ${i + 1}</div>
                <div class="stat-value ${t.isDouble ? 'hit-checkout' : 'hit-good'}">${t.value}</div>
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

function renderRecentHistory(completed) {
    const container = document.getElementById("recentHistory");
    if (completed.length === 0) {
        container.innerHTML = `<span style="color: #8ca1b3; font-size: 13px;">Noch keine Checkouts abgeschlossen.</span>`;
        return;
    }

    container.innerHTML = "";
    const recent = completed.slice(-12).reverse();
    recent.forEach(item => {
        const pill = document.createElement("div");
        pill.className = "history-pill";
        const color = item.points === 3 ? "#00ffa2" : item.points === 2 ? "#00e5ff" : item.points === 1 ? "#ffc107" : "#ff6565";
        pill.style.borderColor = color;
        pill.innerHTML = `<span style="color:#fff;">${item.target}:</span> <span style="color:${color};">+${item.points} Pkt.</span>`;
        container.appendChild(pill);
    });
}

// ==========================================
// KORREKTUR & MODALS
// ==========================================
let selectedThrowId = null;

function populateCorrectionDropdown() {
    const select = document.getElementById("correctionSelect");
    const options = ["MISS", "SBULL", "DBULL"];
    for (let n = 20; n >= 1; n--) {
        options.push(`S${n}`, `D${n}`, `T${n}`);
    }
    select.innerHTML = options.map(opt => `<option value="${opt}">${opt}</option>`).join("");
}

function openCorrectionModal(throwId, currentVal) {
    if (state.sessionFinished) return;
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
        const idx = state.throws.findIndex(t => t.id === selectedThrowId);
        if (idx !== -1) {
            state.throws[idx] = { ...state.throws[idx], value: parsed.display, score: parsed.score, isDouble: parsed.isDouble };
            showFlash("Wurf korrigiert");
        }
    } else {
        state.throws.push({
            id: crypto.randomUUID(),
            value: parsed.display,
            score: parsed.score,
            isDouble: parsed.isDouble
        });
        showFlash("Wurf manuell eingetragen");
    }

    const sim = simulateCatch40();
    if (sim.finished || sim.currentVisitDarts.length >= 3 || (sim.completedTargets.length > 0 && sim.dartsUsedOnTarget === 0)) {
        state.waitingForTakeout = true;
    } else {
        state.waitingForTakeout = false;
    }

    updateUI();
    closeCorrectionModal();
}

function parseSegmentFromString(val) {
    if (val === "MISS") return { display: "MISS", score: 0, isDouble: false };
    if (val === "SBULL") return { display: "SBULL", score: 25, isDouble: false };
    if (val === "DBULL") return { display: "DBULL", score: 50, isDouble: true };

    const prefix = val.charAt(0);
    const num = parseInt(val.slice(1), 10);
    const mult = prefix === "D" ? 2 : prefix === "T" ? 3 : 1;
    return { display: val, score: num * mult, isDouble: mult === 2 };
}

function abortTraining() {
    if (state.throws.length === 0) return;
    if (confirm("Aktuelle Catch 40 Session wirklich abbrechen?")) {
        state.throws = [];
        state.waitingForTakeout = false;
        state.sessionFinished = false;
        lastNumThrows = 0;
        updateUI();
        showFlash("Catch 40 zurückgesetzt");
    }
}

function finishCatch40Session(sim) {
    state.sessionFinished = true;
    const checkedCount = sim.completedTargets.filter(c => c.points > 0).length;
    const coRate = ((checkedCount / 40) * 100).toFixed(1);
    const lvl = getLevelBadge(sim.totalPoints);

    const entry = {
        date: new Date().toLocaleString(),
        totalPoints: sim.totalPoints,
        checkedCount: checkedCount,
        checkoutRate: coRate,
        count3: sim.count3,
        count2: sim.count2,
        count1: sim.count1,
        level: lvl.text
    };

    let history = JSON.parse(localStorage.getItem("catch40History") || "[]");
    history.push(entry);
    localStorage.setItem("catch40History", JSON.stringify(history));

    document.getElementById("modalResultText").innerHTML = `
        Gesamtpunkte: <b style="color:#00ffa2; font-size: 24px;">${sim.totalPoints} / 120</b><br>
        Einstufung: <b style="color:${lvl.color};">${lvl.text}</b><br><br>
        Gecheckt: <b>${checkedCount} / 40</b> (${coRate}%)<br>
        3 Pkt.: ${sim.count3} • 2 Pkt.: ${sim.count2} • 1 Pkt.: ${sim.count1}
    `;
    document.getElementById("sessionFinishedModal").classList.remove("hidden");
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
    updateUI();
});