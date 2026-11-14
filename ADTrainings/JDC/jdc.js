"use strict";

let boardIp = localStorage.getItem("autodarts_ip") || "192.168.2.91";
const ws = new WebSocket(`ws://${boardIp}:3180/api/events`);

let lastNumThrows = 0;

const JDC_VISITS = [
    // Teil 1: Shanghai 10-15
    { part: 1, targetNum: 10, type: "number", label: "Zahl 10" },
    { part: 1, targetNum: 11, type: "number", label: "Zahl 11" },
    { part: 1, targetNum: 12, type: "number", label: "Zahl 12" },
    { part: 1, targetNum: 13, type: "number", label: "Zahl 13" },
    { part: 1, targetNum: 14, type: "number", label: "Zahl 14" },
    { part: 1, targetNum: 15, type: "number", label: "Zahl 15" },
    // Teil 2: Doubles 1-20 + Bull (in 7 Aufnahmen à 3 Darts)
    { part: 2, targets: [1, 2, 3], type: "doubles", label: "Double 1 • 2 • 3" },
    { part: 2, targets: [4, 5, 6], type: "doubles", label: "Double 4 • 5 • 6" },
    { part: 2, targets: [7, 8, 9], type: "doubles", label: "Double 7 • 8 • 9" },
    { part: 2, targets: [10, 11, 12], type: "doubles", label: "Double 10 • 11 • 12" },
    { part: 2, targets: [13, 14, 15], type: "doubles", label: "Double 13 • 14 • 15" },
    { part: 2, targets: [16, 17, 18], type: "doubles", label: "Double 16 • 17 • 18" },
    { part: 2, targets: [19, 20, 50], type: "doubles", label: "Double 19 • 20 • Bull" },
    // Teil 3: Shanghai 15-20
    { part: 3, targetNum: 15, type: "number", label: "Zahl 15" },
    { part: 3, targetNum: 16, type: "number", label: "Zahl 16" },
    { part: 3, targetNum: 17, type: "number", label: "Zahl 17" },
    { part: 3, targetNum: 18, type: "number", label: "Zahl 18" },
    { part: 3, targetNum: 19, type: "number", label: "Zahl 19" },
    { part: 3, targetNum: 20, type: "number", label: "Zahl 20" }
];

let state = {
    throws: [],
    waitingForTakeout: false,
    trainingActive: false,
    sessionFinished: false
};

ws.onopen = () => updateBoardStatusUI("ready", false);
ws.onerror = (err) => console.error("WS Fehler:", err);
ws.onclose = () => {
    const badge = document.getElementById("boardStatusBadge");
    if (badge) { badge.textContent = "🔴 Board getrennt"; badge.className = "status-takeout"; }
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

                if (state.throws.length >= 57 && !state.sessionFinished) {
                    finishJDCSession();
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
    } else {
        badge.textContent = "🟢 Board: Bereit";
        badge.className = "status-ready";
    }
}

function processStateEvent(data) {
    const throws = data.throws;
    if (!Array.isArray(throws) || state.waitingForTakeout || !state.trainingActive) return;

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
        return { display: "MISS", number: 0, multiplier: 0, score: 0, isDouble: false };
    }

    if (name.toUpperCase().includes("BULL") || number === 25 || number === 50 || name === "25" || name === "50") {
        const isDouble = (multiplier === 2 || name.toUpperCase() === "DBULL" || number === 50 || name === "50");
        return {
            display: isDouble ? "DBULL" : "SBULL",
            number: isDouble ? 50 : 25,
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

function registerThrow(hit) {
    if (state.throws.length >= 57 || state.sessionFinished) return;

    state.throws.push({
        id: crypto.randomUUID(),
        value: hit.display,
        number: hit.number,
        multiplier: hit.multiplier,
        score: hit.score,
        isDouble: hit.isDouble
    });

    // Prüfen, ob in dieser Aufnahme ein Shanghai erzielt wurde
    const currentVisitIdx = Math.min(18, Math.floor((state.throws.length - 1) / 3));
    const visitDef = JDC_VISITS[currentVisitIdx];
    if (visitDef && visitDef.type === "number") {
        const startIdx = currentVisitIdx * 3;
        const vThrows = state.throws.slice(startIdx, startIdx + 3);
        let hasS = false, hasD = false, hasT = false;
        vThrows.forEach(t => {
            if (t.number === visitDef.targetNum) {
                if (t.multiplier === 1) hasS = true;
                if (t.multiplier === 2) hasD = true;
                if (t.multiplier === 3) hasT = true;
            }
        });
        if (hasS && hasD && hasT && vThrows.length === 3) {
            showFlash("🔥 SHANGHAI BONUS! +100 Punkte!");
        }
    }

    checkProgress();
    updateUI();
}

function checkProgress() {
    if (state.throws.length >= 57) {
        state.waitingForTakeout = true;
        showFlash("JDC Challenge abgeschlossen – Bitte Pfeile ziehen");
    } else if (state.throws.length % 3 === 0) {
        state.waitingForTakeout = true;
        showFlash("Aufnahme beendet – Bitte Pfeile ziehen");
    }
}

// ==========================================
// PUNKTE- & SHIRT-BERECHNUNG
// ==========================================
function calculateScoreAndStats() {
    let part1 = 0;
    let part2 = 0;
    let part3 = 0;

    for (let vIdx = 0; vIdx < JDC_VISITS.length; vIdx++) {
        const visitDef = JDC_VISITS[vIdx];
        const startIdx = vIdx * 3;
        const vThrows = state.throws.slice(startIdx, startIdx + 3);
        if (vThrows.length === 0) break;

        if (visitDef.type === "number") {
            let visitScore = 0;
            let hasSingle = false;
            let hasDouble = false;
            let hasTriple = false;

            vThrows.forEach(t => {
                if (t.number === visitDef.targetNum) {
                    visitScore += t.score;
                    if (t.multiplier === 1) hasSingle = true;
                    if (t.multiplier === 2) hasDouble = true;
                    if (t.multiplier === 3) hasTriple = true;
                }
            });

            if (hasSingle && hasDouble && hasTriple && vThrows.length === 3) {
                visitScore += 100;
            }

            if (visitDef.part === 1) part1 += visitScore;
            else part3 += visitScore;

        } else if (visitDef.type === "doubles") {
            vThrows.forEach((t, i) => {
                const targetVal = visitDef.targets[i];
                if (targetVal === 50) {
                    if (t.isDouble && (t.number === 50 || t.value.toUpperCase().includes("DBULL"))) {
                        part2 += 100;
                    }
                } else {
                    if (t.isDouble && t.number === targetVal) {
                        part2 += 50;
                    }
                }
            });
        }
    }

    const totalScore = part1 + part2 + part3;
    const shirt = getShirtLevel(totalScore);

    return { totalScore, part1, part2, part3, shirt };
}

function getShirtLevel(score) {
    if (score >= 850) return { name: "Schwarz (Black)", info: "Elite (850+ Pkt.)", color: "#ffffff", border: "#ffffff" };
    if (score >= 700) return { name: "Rot (Red)", info: "Ligaspieler / Semi-Profi (700–849 Pkt.)", color: "#ff6565", border: "#ff6565" };
    if (score >= 600) return { name: "Blau (Blue)", info: "Erfahrener Kneipenspieler (600–699 Pkt.)", color: "#00e5ff", border: "#00e5ff" };
    if (score >= 450) return { name: "Grün (Green)", info: "Solider Gelegenheitsspieler (450–599 Pkt.)", color: "#00ffa2", border: "#00ffa2" };
    if (score >= 300) return { name: "Gelb (Yellow)", info: "Fortgeschrittener Einsteiger (300–449 Pkt.)", color: "#ffeb3b", border: "#ffeb3b" };
    if (score >= 150) return { name: "Lila (Purple)", info: "Anfänger mit Grundkenntnissen (150–299 Pkt.)", color: "#ab47bc", border: "#ab47bc" };
    return { name: "Weiß (White)", info: "Einsteiger (0–149 Pkt.)", color: "#cbd5e1", border: "#cbd5e1" };
}

// ==========================================
// UI AKTUALISIERUNG
// ==========================================
function updateUI() {
    const stats = calculateScoreAndStats();

    document.getElementById("score").innerText = stats.totalScore;
    document.getElementById("part1Score").innerText = stats.part1;
    document.getElementById("part2Score").innerText = stats.part2;
    document.getElementById("part3Score").innerText = stats.part3;

    const shirtEl = document.getElementById("shirtLevel");
    shirtEl.innerText = stats.shirt.name;
    shirtEl.style.color = stats.shirt.border;

    const shirtInfoEl = document.getElementById("shirtInfo");
    if (shirtInfoEl) shirtInfoEl.innerText = stats.shirt.info;

    // Aktuelles Ziel im A1-Drill Stil aktualisieren
    const currentVisitIdx = Math.min(18, Math.floor(state.throws.length / 3));
    if (state.trainingActive && !state.sessionFinished) {
        const vDef = JDC_VISITS[currentVisitIdx];
        if (vDef) {
            document.getElementById("partTitleBadge").innerText = `TEIL ${vDef.part}: ${vDef.part === 2 ? "DOUBLES 1–20 + BULL" : "SHANGHAI " + (vDef.part === 1 ? "10–15" : "15–20")}`;
            document.getElementById("currentTargetPath").innerText = vDef.part === 2 ? `D${vDef.targets[state.throws.length % 3] === 50 ? 'Bull' : vDef.targets[state.throws.length % 3]}` : vDef.targetNum;
            document.getElementById("targetInstruction").innerText = `${vDef.label} (Aufnahme ${currentVisitIdx + 1} / 19)`;
        }
    }

    renderCurrentVisitThrows();
}

function renderCurrentVisitThrows() {
    const container = document.getElementById("lastThrows");
    if (!container) return;
    container.innerHTML = "";

    let visitIndex = Math.floor(state.throws.length / 3);
    if (state.waitingForTakeout && state.throws.length > 0 && state.throws.length % 3 === 0) {
        visitIndex -= 1;
    }
    visitIndex = Math.min(18, visitIndex);

    const startIdx = visitIndex * 3;
    const currentThrows = state.throws.slice(startIdx, startIdx + 3);
    const visitDef = JDC_VISITS[visitIndex];

    for (let i = 0; i < 3; i++) {
        const card = document.createElement("div");
        card.className = "stat-card throw-card";

        const t = currentThrows[i];
        const absoluteIndex = startIdx + i;
        let expectedLabel = `Pfeil ${i + 1}`;
        if (visitDef) {
            if (visitDef.type === "number") expectedLabel = `Zahl ${visitDef.targetNum} (Dart ${i+1})`;
            else expectedLabel = `Target: D${visitDef.targets[i] === 50 ? 'Bull' : visitDef.targets[i]}`;
        }

        if (t) {
            let colorClass = "hit-target";
            // Einfache Prüfung ob Treffer auf Ziel
            if (visitDef.type === "number") {
                if (t.number !== visitDef.targetNum || t.multiplier === 0) colorClass = "hit-miss";
            } else {
                const targetVal = visitDef.targets[i];
                if (targetVal === 50) {
                    if (!t.isDouble || (t.number !== 50 && !t.value.toUpperCase().includes("DBULL"))) colorClass = "hit-miss";
                } else {
                    if (!t.isDouble || t.number !== targetVal) colorClass = "hit-miss";
                }
            }

            card.innerHTML = `
                <div class="stat-label">${expectedLabel}</div>
                <div class="stat-value ${colorClass}">${t.value}</div>
            `;
            card.onclick = () => openCorrectionModal(t.id, t.value, absoluteIndex);
        } else {
            card.style.opacity = "0.5";
            card.innerHTML = `
                <div class="stat-label">${expectedLabel}</div>
                <div class="stat-value">-</div>
            `;
            card.onclick = () => openCorrectionModal(null, "MISS", absoluteIndex);
        }
        container.appendChild(card);
    }
}

// ==========================================
// KORREKTUR & MODALS
// ==========================================
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
            state.throws[idx] = { ...state.throws[idx], value: parsed.display, number: parsed.number, multiplier: parsed.multiplier, score: parsed.score, isDouble: parsed.isDouble };
            showFlash("Wurf korrigiert");
        }
    } else if (selectedAbsoluteIndex !== null) {
        while (state.throws.length < selectedAbsoluteIndex) {
            state.throws.push({ id: crypto.randomUUID(), value: "MISS", number: 0, multiplier: 0, score: 0, isDouble: false });
        }
        state.throws.push({ id: crypto.randomUUID(), value: parsed.display, number: parsed.number, multiplier: parsed.multiplier, score: parsed.score, isDouble: parsed.isDouble });
        showFlash("Wurf manuell eingetragen");
    }

    state.waitingForTakeout = false;
    checkProgress();
    updateUI();
    closeCorrectionModal();
}

function parseSegmentFromString(val) {
    if (val === "MISS") return { display: "MISS", number: 0, multiplier: 0, score: 0, isDouble: false };
    if (val === "SBULL") return { display: "SBULL", number: 25, multiplier: 1, score: 25, isDouble: false };
    if (val === "DBULL") return { display: "DBULL", number: 50, multiplier: 2, score: 50, isDouble: true };

    const prefix = val.charAt(0);
    const num = parseInt(val.slice(1), 10);
    const mult = prefix === "D" ? 2 : prefix === "T" ? 3 : 1;
    return { display: val, number: num, multiplier: mult, score: num * mult, isDouble: mult === 2 };
}

function startGame() {
    state.throws = [];
    state.waitingForTakeout = false;
    state.trainingActive = true;
    state.sessionFinished = false;
    lastNumThrows = 0;

    document.getElementById("startBtn").style.display = "none";
    document.getElementById("mainGameGrid").style.display = "grid";
    updateUI();
    showFlash("JDC Challenge gestartet!");
}

function abortTraining() {
    if (!state.trainingActive && state.throws.length === 0) return;
    if (confirm("Aktuelle JDC Challenge wirklich abbrechen?")) {
        state.throws = [];
        state.trainingActive = false;
        state.sessionFinished = false;
        document.getElementById("startBtn").style.display = "inline-block";
        document.getElementById("mainGameGrid").style.display = "none";
        updateUI();
        showFlash("Challenge abgebrochen");
    }
}

function finishJDCSession() {
    state.sessionFinished = true;
    state.trainingActive = false;

    const stats = calculateScoreAndStats();

    const entry = {
        date: new Date().toLocaleString(),
        totalScore: stats.totalScore,
        part1: stats.part1,
        part2: stats.part2,
        part3: stats.part3,
        shirt: stats.shirt.name
    };

    let history = JSON.parse(localStorage.getItem("jdcHistory") || "[]");
    history.push(entry);
    localStorage.setItem("jdcHistory", JSON.stringify(history));

    const resultText = document.getElementById("modalResultText");
    if (resultText) {
        resultText.innerHTML = `
            Gesamtscore: <b style="color:#00ffa2; font-size: 22px;">${stats.totalScore} Punkte</b><br>
            Shirt-Stufe: <b style="color:${stats.shirt.border};">${stats.shirt.name}</b><br><br>
            Teil 1: ${stats.part1} | Teil 2: ${stats.part2} | Teil 3: ${stats.part3}
        `;
    }
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

function openStats() {
    window.location.href = "jdc-stats.html";
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