"use strict";

/* ==========================================
   MARS MISSION CHALLENGE - LOGIK (Mit Einfüllstutzen & Takeout)
========================================== */

let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);
let lastNumThrows = 0;

const MAX_DARTS = 150;

let gameState = {
    gameFinished: false,
    throws: [],
    waitingForTakeout: false
};

ws.onopen = () => updateBoardStatusUI("ready", false);
ws.onerror = (err) => console.error("WS Fehler:", err);
ws.onclose = () => {
    const badge = document.getElementById("boardStatusBadge");
    if (badge) { badge.textContent = "Board getrennt"; badge.className = "status-takeout"; }
};

ws.onmessage = (msg) => {
    if (gameState.gameFinished) return;
    const event = JSON.parse(msg.data);
    if (!event.data) return;

    if (event.type === "state") {
        const data = event.data;
        const throws = data.throws || [];
        const status = data.status;

        // Takeout Logik: Wenn auf Takeout gewartet wird und Board leer ist -> Reset für nächste Aufnahme
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
        badge.textContent = "Bitte Pfeile ziehen";
        badge.className = "status-takeout";
    } else {
        badge.textContent = "Board: Bereit";
        badge.className = "status-ready";
    }
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

function parseSegment(throwData) {
    const name = throwData.segmentName || "";
    const number = throwData.segmentNumber;
    const multiplier = throwData.multiplier;

    if (!name || name.startsWith("M") || name === "MISS" || multiplier === 0) {
        return { display: "MISS", type: "miss", points: -2 };
    }

    // Inner / Outer Bull
    if (name.toUpperCase().includes("BULL") || number === 25 || number === 50 || name === "25" || name === "50") {
        const isDouble = (multiplier === 2 || name.toUpperCase() === "DBULL" || number === 50 || name === "50");
        return {
            display: isDouble ? "DBULL" : "SBULL",
            type: isDouble ? "inner" : "outer",
            points: isDouble ? 25 : 10
        };
    }

    // Einfüllstutzen (1, 5, 20 Single)
    if ([1, 5, 20].includes(number) && multiplier === 1) {
        return { display: name, type: "stutzen", points: 2 };
    }

    // Rest = Weltraumschrott (0 Punkte)
    return { display: name, type: "scrap", points: 0 };
}

function registerThrow(hit) {
    if (gameState.gameFinished || gameState.waitingForTakeout) return;

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

    const stats = calculateMissionStats();

    if (stats.score >= 500 && !gameState.gameFinished) {
        triggerMissionOutcome(true, stats);
    } else if (dartsThrown >= MAX_DARTS && !gameState.gameFinished) {
        triggerMissionOutcome(false, stats);
    }
}

function calculateMissionStats() {
    let innerBull = 0, outerBull = 0, stutzen = 0, scrap = 0, miss = 0;
    let score = 0;

    gameState.throws.forEach(t => {
        score += t.points;
        if (t.type === "inner") innerBull++;
        else if (t.type === "outer") outerBull++;
        else if (t.type === "stutzen") stutzen++;
        else if (t.type === "scrap") scrap++;
        else if (t.type === "miss") miss++;
    });

    score = Math.max(0, score);
    const totalBull = innerBull + outerBull;
    const precision = gameState.throws.length > 0 ? ((totalBull / gameState.throws.length) * 100).toFixed(1) : "0.0";

    return { innerBull, outerBull, stutzen, scrap, miss, score, precision };
}

function updateUI() {
    const stats = calculateMissionStats();
    const dartsLeft = MAX_DARTS - gameState.throws.length;

    document.getElementById("missionScore").innerText = stats.score;
    document.getElementById("countInnerBull").innerText = stats.innerBull;
    document.getElementById("countOuterBull").innerText = stats.outerBull;
    document.getElementById("countStutzen").innerText = stats.stutzen;
    document.getElementById("precisionRate").innerText = `${stats.precision}%`;
    document.getElementById("dartsLeft").innerText = Math.max(0, dartsLeft);

    // Präzise, gestaffelte Raketen-Höhenberechnung (0 bis 500 Pkt. auf 10% bis 90% Skala)
    let percent = 10;
    if (stats.score <= 100) {
        percent = 10 + (stats.score / 100) * 20; // 10% bis 30%
    } else if (stats.score <= 200) {
        percent = 30 + ((stats.score - 100) / 100) * 20; // 30% bis 50%
    } else if (stats.score <= 350) {
        percent = 50 + ((stats.score - 200) / 150) * 20; // 50% bis 70%
    } else {
        percent = 70 + (Math.min(500, stats.score - 350) / 150) * 20; // 70% bis 90%
    }
    document.getElementById("rocketShip").style.bottom = `${percent}%`;

    let phaseName = "Vorbereitung (0-99 Pkt.)";
    let altitude = "Startrampe (0 km)";
    if (stats.score >= 400) {
        phaseName = "Mars angenähert (400+ Pkt.)";
        altitude = "Interplanetarer Flug (50 Mio. km)";
    } else if (stats.score >= 300) {
        phaseName = "Mond-Passage (300-399 Pkt.)";
        altitude = "Mond-Orbit (384.400 km)";
    } else if (stats.score >= 200) {
        phaseName = "Erdorbit erreicht (200-299 Pkt.)";
        altitude = "Erdorbit (400 km)";
    } else if (stats.score >= 100) {
        phaseName = "Rakete startbereit (100-199 Pkt.)";
        altitude = "Luftschicht (10 km)";
    }

    document.getElementById("phaseTitle").innerText = phaseName;
    document.getElementById("altitudeText").innerText = `Höhe: ${altitude} (${stats.score} / 500 Pkt)`;

    renderCurrentThrows();
}
function renderCurrentThrows() {
    const container = document.getElementById("lastThrows");
    container.innerHTML = "";

    // Ermittle die aktuelle 3er-Aufnahme (Turn)
    const totalThrows = gameState.throws.length;
    const currentTurnIndex = totalThrows > 0 ? Math.floor((totalThrows - 1) / 3) : 0;
    const startIdx = currentTurnIndex * 3;
    const currentTurnThrows = gameState.throws.slice(startIdx, startIdx + 3);

    for (let i = 0; i < 3; i++) {
        const card = document.createElement("div");
        card.className = "stat-card throw-card";
        const t = currentTurnThrows[i];

        if (t) {
            const color = t.points > 0 ? (t.points >= 15 ? "#6ee7a8" : "#7fc8ff") : (t.points === 0 ? "#c9d4e6" : "#ff5d4d");
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

function triggerMissionOutcome(success, stats) {
    gameState.gameFinished = true;
    const title = success ? "MARS-KOLONIE GEGRÜNDET!" : "MISSION GESCHEITERT!";
    const msg = success 
        ? `Unglaublich! Mission ein voller Erfolg.<br>Treibstoff: <b>${stats.score} Pkt.</b><br>Bull-Präzision: <b style="color:#6ee7a8;">${stats.precision}%</b><br>Benötigte Darts: <b>${gameState.throws.length}</b>`
        : `Der Treibstoff (oder die Darts) ist ausgegangen!<br>Erreichte Punkte: <b>${stats.score} / 500</b>.<br>Versuche es erneut!`;

    document.getElementById("missionModalTitle").innerText = title;
    document.getElementById("missionModalTitle").style.color = success ? "#6ee7a8" : "#ff5d4d";
    document.getElementById("missionModalText").innerHTML = msg;
    document.getElementById("missionModal").classList.remove("hidden");

    saveMissionResult(stats, success);
}

function saveMissionResult(stats, success) {
    const entry = {
        date: new Date().toLocaleString(),
        score: stats.score,
        darts: gameState.throws.length,
        precision: stats.precision,
        success: success
    };

    let history = JSON.parse(localStorage.getItem("rocketHistory") || "[]");
    history.push(entry);
    localStorage.setItem("rocketHistory", JSON.stringify(history));
}

// ==========================================
// KORREKTUR MODAL
// ==========================================
let selectedThrowId = null;

function populateCorrectionDropdown() {
    const select = document.getElementById("correctionSelect");
    const options = ["MISS", "SBULL", "DBULL", "S1", "S5", "S20", "T20", "D20"];
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
    const parsed = parseSegmentFromString(newVal);

    if (selectedThrowId) {
        const idx = gameState.throws.findIndex(t => t.id === selectedThrowId);
        if (idx !== -1) {
            gameState.throws[idx] = { ...gameState.throws[idx], value: parsed.display, type: parsed.type, points: parsed.points };
            showFlash("Wurf korrigiert");
        }
    } else {
        gameState.throws.push({
            id: crypto.randomUUID(),
            value: parsed.display,
            type: parsed.type,
            points: parsed.points
        });
        showFlash("Wurf manuell hinzugefügt");
    }

    gameState.waitingForTakeout = (gameState.throws.length % 3 === 0);
    updateUI();
    closeCorrectionModal();
}

function parseSegmentFromString(val) {
    if (val === "MISS") return { display: "MISS", type: "miss", points: -2 };
    if (val === "SBULL") return { display: "SBULL", type: "outer", points: 10 };
    if (val === "DBULL") return { display: "DBULL", type: "inner", points: 25 };

    const num = parseInt(val.slice(1), 10);
    const mult = val.startsWith("D") ? 2 : val.startsWith("T") ? 3 : 1;

    if ([1, 5, 20].includes(num) && mult === 1) {
        return { display: val, type: "stutzen", points: 2 };
    }

    return { display: val, type: "scrap", points: 0 };
}

function abortTraining() {
    if (gameState.throws.length === 0) return;
    if (confirm("Aktuelle Mars Mission wirklich abbrechen?")) {
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