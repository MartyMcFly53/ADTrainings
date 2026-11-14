"use strict";

function goBack() {
    window.location.href = "index.html";
}

window.onload = () => {
    const container = document.getElementById("history");
    const filterSelect = document.getElementById("filterTarget");
    const filterDarts = document.getElementById("filterDarts");
    const sortSelect = document.getElementById("sortBy");
    const chartCanvas = document.getElementById("scoreChart");

    let history = JSON.parse(localStorage.getItem("dartHistory") || "[]");

    if (history.length === 0) {
        container.innerHTML = "<p>Noch keine Einträge vorhanden.</p>";
        return;
    }

    // Zielzahlen in Dropdown einfügen
    const uniqueTargets = [...new Set(history.map(h => h.target))].sort((a,b)=>a-b);
    uniqueTargets.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = `Ziel ${t}`;
        filterSelect.appendChild(opt);
    });

    // Pfeile in Dropdown einfügen
    const uniqueDarts = [...new Set(history.map(h => h.darts))].sort((a,b)=>a-b);
    uniqueDarts.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = `${d} Pfeile`;
        filterDarts.appendChild(opt);
    });

    let chart = null;

    function renderChart(data) {
        const labels = data.map(e => e.date);
        const scores = data.map(e => e.score);

        if (chart) chart.destroy();

        chart = new Chart(chartCanvas, {
            type: "line",
            data: {
                labels: labels,
                datasets: [{
                    label: "Score Verlauf",
                    data: scores,
                    borderColor: "#00e5ff",
                    backgroundColor: "rgba(0, 229, 255, 0.2)",
                    borderWidth: 3,
                    tension: 0.25,
                    pointRadius: 4,
                    pointBackgroundColor: "#00e5ff",
                    pointBorderColor: "#00e5ff"
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            color: "#ffffff"
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: "#ffffff" }
                    },
                    y: {
                        ticks: { color: "#ffffff" }
                    }
                }
            }
        });
    }

    // Render-Funktion
    function render() {
        container.innerHTML = "";

        let filtered = [...history];

        // Filter Zielzahl
        const fTarget = filterSelect.value;
        if (fTarget !== "all") {
            filtered = filtered.filter(h => h.target == fTarget);
        }

        // Filter Pfeile
        const fDarts = filterDarts.value;
        if (fDarts !== "all") {
            filtered = filtered.filter(h => h.darts == fDarts);
        }

        // Sortierung
        const s = sortSelect.value;
        if (s === "score") filtered.sort((a,b)=>b.score - a.score);
        if (s === "hitrate") filtered.sort((a,b)=>b.hitrate - a.hitrate);
        if (s === "threeAvg") filtered.sort((a,b)=>b.threeAvg - a.threeAvg);

        // Diagramm aktualisieren (ALLE gefilterten Daten)
        renderChart(filtered);

        // Top 10
        const top10 = filtered.slice(0, 10);

        // Rendern mit Rangnummern
        top10.forEach((entry, index) => {
            const div = document.createElement("div");
            div.className = "stat-card";

            div.innerHTML = `
                <div class="stat-label">#${index + 1} — ${entry.date}</div>
                <div class="stat-value">Ziel: ${entry.target}</div>
                <div class="stat-value">Pfeile: ${entry.darts}</div>
                <div class="stat-value">Score: ${entry.score}</div>
                <div class="stat-value">Singles: ${entry.singles}</div>
                <div class="stat-value">Doubles: ${entry.doubles}</div>
                <div class="stat-value">Triples: ${entry.triples}</div>
                <div class="stat-value">Misses: ${entry.misses}</div>
                <div class="stat-value">Trefferquote: ${entry.hitrate}%</div>
                <div class="stat-value">3‑Dart‑Average: ${entry.threeAvg}</div>
            `;

            container.appendChild(div);
        });
    }

    // Events
    filterSelect.onchange = render;
    filterDarts.onchange = render;
    sortSelect.onchange = render;

    // Initiales Rendern
    render();
};
function resetStats() {
    const step1 = confirm("Willst du wirklich ALLE Statistikdaten löschen?");
    if (!step1) return;

    const step2 = confirm("Bist du dir GANZ sicher? Alles wird dauerhaft gelöscht!");
    if (!step2) return;

    localStorage.removeItem("dartHistory");
    alert("Statistik wurde gelöscht.");
    location.reload();
}
