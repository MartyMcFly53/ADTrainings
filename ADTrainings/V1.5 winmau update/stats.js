"use strict";

window.onload = () => {
    const container = document.getElementById("history");
    const filterSelect = document.getElementById("filterTarget");
    const filterDarts = document.getElementById("filterDarts");
    const sortSelect = document.getElementById("sortBy");
    const chartCanvas = document.getElementById("scoreChart");

    let history = JSON.parse(localStorage.getItem("dartHistory") || "[]");

    if (history.length === 0) {
        container.innerHTML = "<div class='stat-card' style='color: #8ca1b3; margin-top: 20px;'>Noch keine Segmenttraining-Einträge vorhanden.</div>";
        return;
    }

    // Zielzahlen in Dropdown einfügen
    const uniqueTargets = [...new Set(history.map(h => h.target))].sort((a, b) => a - b);
    uniqueTargets.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = `Ziel: ${t}`;
        filterSelect.appendChild(opt);
    });

    // Pfeile in Dropdown einfügen
    const uniqueDarts = [...new Set(history.map(h => h.darts))].sort((a, b) => a - b);
    uniqueDarts.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = `${d} Pfeile`;
        filterDarts.appendChild(opt);
    });

    let chart = null;

    function renderChart(data) {
        // Für das Diagramm IMMER strikt chronologisch von links nach rechts (ältester Eintrag links, neuester rechts)
        const chartData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const labels = chartData.map(e => e.date);
        const averages = chartData.map(e => parseFloat(e.threeAvg) || 0);

        if (chart) chart.destroy();

        chart = new Chart(chartCanvas, {
            type: "line",
            data: {
                labels: labels,
                datasets: [{
                    label: "3-Dart-Average Verlauf",
                    data: averages,
                    borderColor: "#00e5ff",
                    backgroundColor: "rgba(0, 229, 255, 0.15)",
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: "#00ffa2",
                    pointBorderColor: "#00e5ff"
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: { color: "#e2e8f0", font: { weight: "bold" } }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: "#8ca1b3", maxTicksLimit: 10 },
                        grid: { color: "rgba(255, 255, 255, 0.05)" }
                    },
                    y: {
                        ticks: { color: "#8ca1b3" },
                        grid: { color: "rgba(255, 255, 255, 0.05)" }
                    }
                }
            }
        });
    }

    function render() {
        container.innerHTML = "";

        let filtered = [...history];

        const fTarget = filterSelect.value;
        if (fTarget !== "all") {
            filtered = filtered.filter(h => h.target == fTarget);
        }

        const fDarts = filterDarts.value;
        if (fDarts !== "all") {
            filtered = filtered.filter(h => h.darts == fDarts);
        }

        // Diagramm bekommt die gefilterten Daten (unabhängig von der Tabellen-Sortierung chronologisch aufbereitet)
        renderChart(filtered);

        // Sortierung für die Tabelle unten
        const s = sortSelect.value;
        if (s === "score") filtered.sort((a, b) => b.score - a.score);
        if (s === "hitrate") filtered.sort((a, b) => parseFloat(b.hitrate) - parseFloat(a.hitrate));
        if (s === "threeAvg") filtered.sort((a, b) => parseFloat(b.threeAvg) - parseFloat(a.threeAvg));

        const top15 = filtered.slice(0, 15);

        top15.forEach((entry, index) => {
            const div = document.createElement("div");
            div.className = "stat-card";
            div.style.cssText = "margin-bottom: 14px; text-align: left; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;";

            div.innerHTML = `
                <div>
                    <div style="font-size: 13px; font-weight: 700; color: #00e5ff; margin-bottom: 4px;">
                        #${index + 1} — ${entry.date} • <span style="color: #ffc107;">Ziel ${entry.target} (${entry.darts} Pfeile)</span>
                    </div>
                    <div style="font-size: 24px; font-weight: 900; color: #ffffff;">${entry.score} Punkte</div>
                    <div style="font-size: 13px; color: #8ca1b3; margin-top: 6px;">
                        Singles: <b style="color:#00ffa2;">${entry.singles}</b> • 
                        Doubles: <b style="color:#00e5ff;">${entry.doubles}</b> • 
                        Triples: <b style="color:#00e5ff;">${entry.triples}</b> • 
                        Misses: <b style="color:#ff6565;">${entry.misses}</b>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <div style="background: rgba(255,255,255,0.04); padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); text-align: center; min-width: 95px;">
                        <div style="font-size: 11px; color: #8ca1b3; font-weight: 600;">TREFFERQUOTE</div>
                        <div style="font-size: 17px; font-weight: 800; color: #00ffa2; margin-top: 2px;">${entry.hitrate}%</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.04); padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); text-align: center; min-width: 95px;">
                        <div style="font-size: 11px; color: #8ca1b3; font-weight: 600;">3-DART-AVG</div>
                        <div style="font-size: 17px; font-weight: 800; color: #00e5ff; margin-top: 2px;">${entry.threeAvg}</div>
                    </div>
                </div>
            `;

            container.appendChild(div);
        });
    }

    filterSelect.onchange = render;
    filterDarts.onchange = render;
    sortSelect.onchange = render;

    render();
};

function resetStats() {
    if (!confirm("Willst du wirklich ALLE Segmenttraining-Statistikdaten löschen?")) return;
    if (!confirm("Bist du dir GANZ sicher? Alles wird dauerhaft gelöscht!")) return;

    localStorage.removeItem("dartHistory");
    location.reload();
}