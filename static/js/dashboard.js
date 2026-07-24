/* static/js/dashboard.js
 * ─────────────────────────────────────────────────
 * Dashboard: summary cards, production table, vendors,
 * inline charts, history charts, trend chart, PO monitor.
 * Dipindahkan dari script.js baris 547-677, 1417-1697 tanpa perubahan logika.
 * ───────────────────────────────────────────────── */

// =============================================
// SUMMARY CARDS
// =============================================
async function loadSummary() {
    const d = await api(`/api/summary?date=${currentDate}`);
    const container = document.getElementById('summaryCards');
    if (!d || d.status !== 'success') {
        container.innerHTML = '<div class="error-state"><i class="fa-solid fa-circle-exclamation"></i><p>Gagal memuat</p></div>';
        return;
    }
    const summary = d.summary;
    const keys = Object.keys(summary);
    if (keys.length === 0) {
        container.innerHTML = '<div class="no-data"><i class="fa-solid fa-inbox"></i><p>Tidak ada data hari ini</p></div>';
        return;
    }
    container.innerHTML = keys.map((type, idx) => {
        const s = summary[type];
        const icon = getIcon(type);
        const colorIdx = idx % COLORS.length;
        return `
        <div class="summary-card">
            <div class="sc-icon" style="background:${COLORS[colorIdx].bg}; color:${COLORS[colorIdx].border}">
                <i class="fa-solid ${icon}"></i>
            </div>
            <div class="sc-info">
                <span class="sc-label">${type}</span>
                <span class="sc-value">${fmt(s.tonase)}</span>
                <span class="sc-unit">${s.ritase} rit</span>
            </div>
        </div>`;
    }).join('');
}

function getIcon(type) {
    const t = (type || '').toUpperCase();
    for (const [key, icon] of Object.entries(ICONS)) {
        if (t.includes(key)) return icon;
    }
    return ICONS.DEFAULT;
}

// =============================================
// PRODUCTION TABLE
// =============================================
async function loadProduction() {
    const d = await api(`/api/production?date=${currentDate}`);
    const tbody = document.getElementById('productionTableBody');
    if (!d || d.status !== 'success') { tbody.innerHTML = errRow(9, 'Gagal memuat data timbangan.'); return; }
    if (!d.data || d.data.length === 0) { tbody.innerHTML = emptyRow(9, `Tidak ada data untuk ${currentDate}`); return; }

    _prodData = d.data;
    let gt = { s1t: 0, s1r: 0, s2t: 0, s2r: 0, s3t: 0, s3r: 0, tt: 0, tr: 0 };
    let html = d.data.map((r, idx) => {
        const s1t = r.shift1_tonase || 0, s1r = r.shift1_ritase || 0;
        const s2t = r.shift2_tonase || 0, s2r = r.shift2_ritase || 0;
        const s3t = r.shift3_tonase || 0, s3r = r.shift3_ritase || 0;
        const tt = r.today_tonase || 0, tr = r.today_ritase || 0;
        gt.s1t += s1t; gt.s1r += s1r; gt.s2t += s2t; gt.s2r += s2r;
        gt.s3t += s3t; gt.s3r += s3r; gt.tt += tt; gt.tr += tr;
        const c = COLORS[idx % COLORS.length].border;
        return `<tr>
            <td class="item-name"><span class="color-dot" style="background:${c}"></span>${r.type}</td>
            <td class="${z(s1t)}">${fmt(s1t)}</td><td class="${z(s1r)}">${s1r}</td>
            <td class="${z(s2t)}">${fmt(s2t)}</td><td class="${z(s2r)}">${s2r}</td>
            <td class="${z(s3t)}">${fmt(s3t)}</td><td class="${z(s3r)}">${s3r}</td>
            <td class="today-col ${z(tt)}">${fmt(tt)}</td><td class="today-col ${z(tr)}">${tr}</td>
        </tr>`;
    }).join('');
    html += `<tr class="total-row">
        <td class="item-name"><strong>TOTAL</strong></td>
        <td><strong>${fmt(gt.s1t)}</strong></td><td><strong>${gt.s1r}</strong></td>
        <td><strong>${fmt(gt.s2t)}</strong></td><td><strong>${gt.s2r}</strong></td>
        <td><strong>${fmt(gt.s3t)}</strong></td><td><strong>${gt.s3r}</strong></td>
        <td class="today-col"><strong>${fmt(gt.tt)}</strong></td>
        <td class="today-col"><strong>${gt.tr}</strong></td>
    </tr>`;
    tbody.innerHTML = html;
}

// =============================================
// VENDORS
// =============================================
async function loadVendors() {
    const d = await api(`/api/vendors?date=${currentDate}`);
    const grid = document.getElementById('vendorGrid');
    if (!d || d.status !== 'success') { grid.innerHTML = errBlock('Gagal memuat vendor.'); return; }
    if (!d.data || d.data.length === 0) { grid.innerHTML = emptyBlock('Tidak ada data vendor.'); return; }
    grid.innerHTML = d.data.map(v => vendorCard(v)).join('');
}

async function loadVendorDetail() {
    const d = await api(`/api/vendors?date=${currentDate}`);
    const grid = document.getElementById('vendorDetailGrid');
    if (!d || d.status !== 'success' || !d.data || d.data.length === 0) {
        grid.innerHTML = emptyBlock('Tidak ada data vendor.'); return;
    }
    grid.innerHTML = d.data.map(v => vendorCard(v)).join('');
}

function vendorCard(v) {
    const d = v.daily || {};
    const t = v.todate || {};
    const s1r = d.shift1_rit || 0, s1k = d.shift1_kg || 0;
    const s2r = d.shift2_rit || 0, s2k = d.shift2_kg || 0;
    const s3r = d.shift3_rit || 0, s3k = d.shift3_kg || 0;
    const tr = d.today_rit || 0, tk = d.today_kg || 0;
    let todateHtml = '';
    if (t && (t.ritase || t.netto)) {
        todateHtml = `<div class="vendor-todate"><h4>ALL TIME</h4>
            <div class="todate-row"><span class="label">RITASE</span><span><span class="value">${fmt(t.ritase || 0)}</span><span class="unit"> TRUCK</span></span></div>
            <div class="todate-row"><span class="label">NETTO</span><span><span class="value">${fmt(t.netto || 0)}</span><span class="unit"> KG</span></span></div>
        </div>`;
    }
    return `<div class="vendor-card">
        <div class="vendor-card-header"><h3>${v.vendor_name}</h3><span class="vendor-badge">${currentDate}</span></div>
        <div class="vendor-card-body">
            <table class="vendor-shift-table">
                <thead><tr><th colspan="2">SHIFT 1</th><th colspan="2">SHIFT 2</th><th colspan="2">SHIFT 3</th><th colspan="2">TOTAL</th></tr>
                <tr><th>RIT</th><th>KG</th><th>RIT</th><th>KG</th><th>RIT</th><th>KG</th><th>RIT</th><th>KG</th></tr></thead>
                <tbody><tr>
                    <td>${s1r}</td><td>${fmt(s1k)}</td>
                    <td>${s2r}</td><td>${fmt(s2k)}</td>
                    <td>${s3r}</td><td>${fmt(s3k)}</td>
                    <td><strong>${tr}</strong></td><td><strong>${fmt(tk)}</strong></td>
                </tr></tbody>
            </table>
            ${todateHtml}
        </div>
    </div>`;
}

// =============================================
// INLINE CHARTS
// =============================================
function renderInlineCharts() {
    if (!_prodData || _prodData.length === 0) return;
    const items = _prodData.filter(i => (i.today_tonase || 0) > 0);
    if (items.length === 0) return;

    destroyChart('shiftCompareChart');
    const ctx1 = document.getElementById('shiftCompareChart').getContext('2d');
    charts.shiftCompareChart = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: items.map(i => i.type),
            datasets: [
                { label: 'Shift 1', data: items.map(i => i.shift1_tonase || 0), backgroundColor: COLORS[0].bg, borderColor: COLORS[0].border, borderWidth: 1.5, borderRadius: 4 },
                { label: 'Shift 2', data: items.map(i => i.shift2_tonase || 0), backgroundColor: COLORS[1].bg, borderColor: COLORS[1].border, borderWidth: 1.5, borderRadius: 4 },
                { label: 'Shift 3', data: items.map(i => i.shift3_tonase || 0), backgroundColor: COLORS[2].bg, borderColor: COLORS[2].border, borderWidth: 1.5, borderRadius: 4 },
            ]
        },
        options: {
            responsive: true, plugins: { tooltip: { ...TOOLTIP, callbacks: { label: c => `${c.dataset.label}: ${fmt(c.raw)}` } } },
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(48,54,61,0.4)' }, ticks: { callback: v => fmt(v) } }, x: { grid: { display: false } } }
        }
    });

    destroyChart('compositionChart');
    const ctx2 = document.getElementById('compositionChart').getContext('2d');
    charts.compositionChart = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: items.map(i => i.type),
            datasets: [{
                data: items.map(i => i.today_tonase || 0),
                backgroundColor: items.map((_, i) => COLORS[i % COLORS.length].bg),
                borderColor: items.map((_, i) => COLORS[i % COLORS.length].border),
                borderWidth: 2, hoverOffset: 8
            }]
        },
        options: {
            responsive: true, cutout: '55%',
            plugins: {
                legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
                tooltip: { ...TOOLTIP, callbacks: { label: c => `${c.label}: ${fmt(c.raw)}` } }
            }
        }
    });
}

// =============================================
// HISTORICAL CHARTS (TAT & Selisih)
// =============================================
async function loadHistoryCharts() {
    loadAnalytics(); // Load new analytics at the top
    loadInsightCharts(); // Load Radar Shift + Top Transportir
    
    const d = await apiFetch(`/api/analytics/history-insights?days=7&date=${currentDate}`);
    if (!d || d.status !== 'success' || !d.data || !d.data.dates || d.data.dates.length === 0) {
        destroyChart('historyTatChart');
        destroyChart('historySelisihChart');
        return;
    }

    const { dates, tat, selisih } = d.data;

    // 1. Chart TAT (Menit)
    destroyChart('historyTatChart');
    charts.historyTatChart = new Chart(document.getElementById('historyTatChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Rata-rata TAT (Menit)',
                data: tat,
                borderColor: '#e67e22',
                backgroundColor: 'rgba(230,126,34,0.15)',
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                pointRadius: 5,
                pointHoverRadius: 8,
                pointBackgroundColor: '#e67e22',
                pointBorderColor: '#0d1117',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { ...TOOLTIP, callbacks: { label: c => ` Waktu Proses: ${fmtMinutes(c.raw)}` } }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    grid: { color: 'rgba(48,54,61,0.4)' }, 
                    ticks: { 
                        font: { size: 10 },
                        callback: v => {
                            const hrs = Math.floor(v / 60);
                            const mins = Math.round(v % 60);
                            return hrs > 0 ? `${hrs}j ${mins}m` : `${mins}m`;
                        }
                    } 
                },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } }
            }
        }
    });

    // 2. Chart Selisih Loss/Gain (KG)
    destroyChart('historySelisihChart');
    
    // Warnai bar berdasarkan positif/negatif
    const selisihColors = selisih.map(v => v >= 0 ? '#3fb950' : '#f85149'); // Hijau Gain, Merah Loss
    const selisihBgs = selisih.map(v => v >= 0 ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)');

    charts.historySelisihChart = new Chart(document.getElementById('historySelisihChart').getContext('2d'), {
        type: 'bar', // Using bar is often better for loss/gain, but we can make it a line if strictly asked. Let's use Line with colored points or just Bar. Actually, user asked for "line chart aja". I'll use a Line chart with area fill!
        data: {
            labels: dates,
            datasets: [{
                label: 'Selisih (Gain/Loss)',
                data: selisih,
                borderColor: '#58a6ff',
                backgroundColor: 'rgba(88,166,255,0.1)',
                borderWidth: 2.5,
                tension: 0.3,
                fill: true,
                pointRadius: 6,
                pointHoverRadius: 9,
                pointBackgroundColor: selisihColors, // Merah kalau minus, Hijau kalau plus
                pointBorderColor: '#0d1117',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { 
                    ...TOOLTIP, 
                    callbacks: { 
                        label: c => {
                            const val = c.raw;
                            const type = val >= 0 ? 'GAIN (+)' : 'LOSS (-)';
                            return ` ${type}: ${fmt(Math.abs(val))} KG`;
                        }
                    } 
                }
            },
            scales: {
                y: { grid: { color: 'rgba(48,54,61,0.4)' }, ticks: { callback: v => fmt(v), font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } }
            }
        }
    });
}

// =============================================
// ANALYTICS CHARTS (Peak Hours, TAT, Anomalies)
// =============================================
async function loadAnalytics() {
    const d = await apiFetch(`/api/analytics?date=${currentDate}`);
    if (!d || d.status !== 'success') return;
    
    // 1. Peak Hours (Bar Chart)
    const phData = d.data.peak_hours || [];
    destroyChart('peakHoursChart');
    charts.peakHoursChart = new Chart(document.getElementById('peakHoursChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: phData.map(r => r.hour),
            datasets: [{
                label: 'Truk Keluar',
                data: phData.map(r => r.count),
                backgroundColor: COLORS[0].bg,
                borderColor: COLORS[0].border,
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: { tooltip: TOOLTIP },
            scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
        }
    });

    // 2. TAT Trend (Line/Bar Chart)
    const tatData = d.data.tat_trend || [];
    destroyChart('tatTrendChart');
    charts.tatTrendChart = new Chart(document.getElementById('tatTrendChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: tatData.map(r => `Shift ${r.shift}`),
            datasets: [{
                label: 'Rata-rata Waktu Proses',
                data: tatData.map(r => r.avg_minutes),
                backgroundColor: COLORS[1].bg,
                borderColor: COLORS[1].border,
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: { 
                tooltip: {
                    ...TOOLTIP,
                    callbacks: { label: c => ` ${c.dataset.label}: ${fmtMinutes(c.raw)}` }
                }
            },
            scales: { 
                y: { 
                    beginAtZero: true, 
                    title: { display: false },
                    ticks: {
                        callback: v => {
                            const hrs = Math.floor(v / 60);
                            const mins = Math.round(v % 60);
                            return hrs > 0 ? `${hrs}j ${mins}m` : `${mins}m`;
                        }
                    }
                }, 
                x: { grid: { display: false } } 
            }
        }
    });

    // 2.5 TAT Hourly per Item
    const tatHourlyData = d.data.tat_hourly_item || [];
    destroyChart('tatHourlyItemChart');
    if (tatHourlyData.length > 0) {
        const hours = tatHourlyData.map(r => r.hour);
        const itemKeysSet = new Set();
        tatHourlyData.forEach(r => Object.keys(r).forEach(k => { if (k !== 'hour') itemKeysSet.add(k); }));
        const itemKeys = Array.from(itemKeysSet);
        
        const hDatasets = itemKeys.map((item, idx) => {
            const data = tatHourlyData.map(r => r[item] || 0);
            const c = COLORS[idx % COLORS.length];
            return {
                label: item,
                data: data,
                borderColor: c.border,
                backgroundColor: c.bg,
                borderWidth: 2,
                tension: 0.4,
                fill: false,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: c.border,
                pointBorderColor: '#0d1117',
                pointBorderWidth: 2
            };
        });

        const canvasEl = document.getElementById('tatHourlyItemChart');
        if (canvasEl) {
            charts.tatHourlyItemChart = new Chart(canvasEl.getContext('2d'), {
                type: 'line',
                data: { labels: hours, datasets: hDatasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 12, font: { size: 10 } } },
                        tooltip: {
                            ...TOOLTIP,
                            callbacks: { label: c => ` ${c.dataset.label}: ${fmtMinutes(c.raw)}` }
                        }
                    },
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            grid: { color: 'rgba(48,54,61,0.2)' }, 
                            ticks: {
                                callback: v => {
                                    const hrs = Math.floor(v / 60);
                                    const mins = Math.round(v % 60);
                                    return hrs > 0 ? `${hrs}j ${mins}m` : `${mins}m`;
                                }
                            }
                        },
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 } }
                    }
                }
            });
        }
    }

    // 3. Tara Anomalies Table
    const anomalies = d.data.tara_anomalies || [];
    const tBody = document.getElementById('taraAnomaliesBody');
    if (anomalies.length === 0) {
        tBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--nb-green, #88D66C);"><i class="fa-solid fa-check-circle"></i> Aman, tidak ada indikasi anomali tara berat kosong signifikan hari ini.</td></tr>`;
    } else {
        tBody.innerHTML = anomalies.map(a => `
            <tr>
                <td style="font-weight:bold; font-family:var(--nb-mono);">${a.nopol}</td>
                <td>${a.freq} kali</td>
                <td style="color:var(--nb-green, #88D66C);">${fmt(a.min_tara)}</td>
                <td style="color:var(--nb-red, #FF6B6B);">${fmt(a.max_tara)}</td>
                <td style="font-weight:bold; color:var(--nb-red, #FF6B6B); font-family:var(--nb-mono);">+${fmt(a.diff)}</td>
                <td><span class="vendor-badge" style="padding:2px 6px; font-size:10px;">${a.items.join(', ')}</span></td>
            </tr>
        `).join('');
    }
}

// =============================================
// INSIGHT CHARTS (Radar Shift + Top Transportir)
// =============================================
async function loadInsightCharts() {
    await Promise.all([renderShiftRadar(), renderTopTransportir()]);
}

async function renderShiftRadar() {
    const d = await apiFetch(`/api/analytics/shift-radar?date=${currentDate}`);
    if (!d || d.status !== 'success' || !d.data || !d.data.shifts || d.data.shifts.length === 0) {
        const box = document.getElementById('radarShiftBox');
        if (box) {
            const canvas = box.querySelector('canvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            const stats = document.getElementById('radarStatsCards');
            if (stats) stats.innerHTML = '<p style="text-align:center; color:var(--text-muted); grid-column:1/-1; padding:20px;"><i class="fa-solid fa-inbox"></i> Tidak ada data shift untuk hari ini</p>';
        }
        return;
    }

    const shifts = d.data.shifts;
    const labels = d.data.labels; // ["Tonase", "Ritase", "Kecepatan", "Variasi Item"]

    const SHIFT_COLORS = [
        { bg: 'rgba(88,166,255,0.20)', border: '#58a6ff' },   // Shift 1 - Biru
        { bg: 'rgba(63,185,80,0.20)', border: '#3fb950' },    // Shift 2 - Hijau
        { bg: 'rgba(240,192,0,0.20)', border: '#f0c000' },    // Shift 3 - Kuning
    ];

    const datasets = shifts.map((s, i) => ({
        label: `Shift ${s.shift}`,
        data: [s.tonase, s.ritase, s.kecepatan, s.variasi_item],
        backgroundColor: SHIFT_COLORS[i % 3].bg,
        borderColor: SHIFT_COLORS[i % 3].border,
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: SHIFT_COLORS[i % 3].border,
        pointBorderColor: '#0d1117',
        pointBorderWidth: 2,
    }));

    // Store raw data for tooltips
    const rawDataMap = {};
    shifts.forEach(s => {
        rawDataMap[`Shift ${s.shift}`] = {
            'Tonase': `${fmt(s.tonase_raw)} KG`,
            'Ritase': `${s.ritase_raw} truk`,
            'Kecepatan': `${s.avg_tat_raw} menit (avg TAT)`,
            'Variasi Item': `${s.variasi_raw} jenis`
        };
    });

    destroyChart('shiftRadarChart');
    charts.shiftRadarChart = new Chart(document.getElementById('shiftRadarChart').getContext('2d'), {
        type: 'radar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        stepSize: 25,
                        font: { size: 9 },
                        backdropColor: 'transparent',
                        color: 'rgba(139,148,158,0.6)',
                    },
                    grid: { color: 'rgba(48,54,61,0.35)' },
                    angleLines: { color: 'rgba(48,54,61,0.35)' },
                    pointLabels: {
                        font: { size: 11, weight: '600' },
                        color: '#8b949e'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 14, font: { size: 11 }, usePointStyle: true }
                },
                tooltip: {
                    ...TOOLTIP,
                    callbacks: {
                        label: ctx => {
                            const dsLabel = ctx.dataset.label;
                            const dimLabel = labels[ctx.dataIndex];
                            const raw = rawDataMap[dsLabel]?.[dimLabel] || '';
                            return ` ${dsLabel}: ${ctx.raw.toFixed(0)}% → ${raw}`;
                        }
                    }
                }
            }
        }
    });

    // Render stats cards di bawah radar
    const statsEl = document.getElementById('radarStatsCards');
    if (statsEl) {
        statsEl.innerHTML = shifts.map((s, i) => {
            const c = SHIFT_COLORS[i % 3];
            return `
            <div style="background:${c.bg}; border:1.5px solid ${c.border}; border-radius:8px; padding:10px; text-align:center;">
                <div style="font-size:0.7rem; color:${c.border}; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Shift ${s.shift}</div>
                <div style="font-size:1.1rem; font-weight:800; color:var(--text); margin:4px 0;">${fmt(s.tonase_raw)} <span style="font-size:0.65rem; color:var(--text-muted);">KG</span></div>
                <div style="font-size:0.7rem; color:var(--text-muted);">${s.ritase_raw} rit · ${s.avg_tat_raw} min TAT · ${s.variasi_raw} jenis</div>
            </div>`;
        }).join('');
    }
}

async function renderTopTransportir() {
    const d = await apiFetch(`/api/analytics/top-transportir?date=${currentDate}`);
    if (!d || d.status !== 'success' || !d.data || !d.data.data || d.data.data.length === 0) {
        destroyChart('topTransportirChart');
        const canvas = document.getElementById('topTransportirChart');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '13px Inter, sans-serif';
            ctx.fillStyle = '#8b949e';
            ctx.textAlign = 'center';
            ctx.fillText('Tidak ada data customer untuk hari ini', canvas.width / 2, canvas.height / 2);
        }
        return;
    }

    const items = d.data.data;
    // Truncate long customer names for x-axis
    const labels = items.map(r => {
        const name = r.customer || 'UNKNOWN';
        return name.length > 14 ? name.substring(0, 12) + '…' : name;
    });

    destroyChart('topTransportirChart');
    charts.topTransportirChart = new Chart(document.getElementById('topTransportirChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Tonase (KG)',
                data: items.map(r => r.tonase),
                backgroundColor: items.map((_, i) => COLORS[i % COLORS.length].bg),
                borderColor: items.map((_, i) => COLORS[i % COLORS.length].border),
                borderWidth: 1.5,
                borderRadius: 6,
                barPercentage: 0.75,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...TOOLTIP,
                    callbacks: {
                        title: ctx => items[ctx[0].dataIndex]?.customer || '',
                        label: ctx => {
                            const r = items[ctx.dataIndex];
                            return [
                                ` Tonase: ${fmt(r.tonase)} KG`,
                                ` Ritase: ${r.ritase} truk`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(48,54,61,0.2)' },
                    ticks: { callback: v => fmt(v), font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 9, weight: '600' }, color: '#8b949e', maxRotation: 45, minRotation: 25 }
                }
            }
        }
    });
}

// =============================================
// DASHBOARD BARU: TREN & PO MONITOR
// =============================================
async function loadDashboardAvgTrend(showLoader = false) {
    if (showLoader) {
        destroyChart('dashboardAvgTrendChart');
        const canvas = document.getElementById('dashboardAvgTrendChart');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '13px Inter, sans-serif';
            ctx.fillStyle = '#8b949e';
            ctx.textAlign = 'center';
            ctx.fillText('Memuat data...', canvas.width / 2, canvas.height / 2);
        }
    }
    // Ambil nilai filter dari dropdown
    const filterVal = document.getElementById('trendAvgFilter')?.value || 'ALL';

    // ★ PERBAIKAN: Kirim tanggal aktif dari kalender agar data mundur dari tanggal yang benar
    const d = await api(`/api/production/history?days=7&date=${currentDate}`);
    if (!d || d.status !== 'success' || !d.data || d.data.length === 0) return;

    // Kelompokkan data per tanggal
    const byDate = {};
    d.data.forEach(r => {
        const tgl = r.tanggal || r.date || '';  // handle kedua kemungkinan field name
        if (!tgl) return;
        if (!byDate[tgl]) byDate[tgl] = [];
        byDate[tgl].push(r);
    });
    const dates = Object.keys(byDate).sort();
    if (dates.length === 0) return;

    // ★ Normalisasi: gunakan field ItemName (huruf campuran dari DB) — fallback ke 'type'
    const getItemName = (r) => r.ItemName || r.itemname || r.type || '';

    // Fungsi pencocokan item ke tipe filter
    const matchFilter = (itemName, fv) => {
        if (!fv || fv === 'ALL') return true;
        const n = (itemName || '').toUpperCase();
        if (fv === 'GULA')        return n.includes('GULA');
        if (fv === 'TEBU')        return n.includes('TEBU');
        if (fv === 'MOLASSES')    return n.includes('MOLASSE');
        if (fv === 'FILTER CAKE') return n.includes('FILTER CAKE') || n.includes('BLOTONG');
        if (fv === 'FLY ASH')     return n.includes('FLY ASH') || n.includes('FLYASH');
        if (fv === 'BATU BARA')   return n.includes('BATU BARA') || n.includes('BATUBARA');
        if (fv === 'SUPPORT')     return n.includes('SUPPORT') || n.includes('SOLAR') || n.includes('SACK');
        return n.includes(fv);
    };

    // Warna sesuai filter yang dipilih
    const colorMap = {
        'ALL':         { line: '#58a6ff', bg: 'rgba(88,166,255,0.15)'  },
        'GULA':        { line: '#f0c000', bg: 'rgba(240,192,0,0.12)'   },
        'TEBU':        { line: '#3fb950', bg: 'rgba(63,185,80,0.12)'   },
        'MOLASSES':    { line: '#e67e22', bg: 'rgba(230,126,34,0.12)'  },
        'FILTER CAKE': { line: '#39d2c0', bg: 'rgba(57,210,192,0.12)' },
        'FLY ASH':     { line: '#f85149', bg: 'rgba(248,81,73,0.12)'  },
        'BATU BARA':   { line: '#a1887f', bg: 'rgba(161,136,127,0.12)'},
        'SUPPORT':     { line: '#bc8cff', bg: 'rgba(188,140,255,0.12)'},
    };
    const color = colorMap[filterVal] || colorMap['ALL'];

    const labelMap = {
        'ALL': 'Rata-rata Semua Item', 'GULA': 'Gula', 'TEBU': 'Tebu',
        'MOLASSES': 'Molasses', 'FILTER CAKE': 'Filter Cake',
        'FLY ASH': 'Fly Ash', 'BATU BARA': 'Batu Bara', 'SUPPORT': 'Support'
    };

    // ★ Buat datasets: jika ALL → satu line per material unik; jika filter spesifik → satu line total
    let datasets = [];

    if (filterVal === 'ALL') {
        // Kumpulkan semua material unik (dikelompokkan ke kategori besar)
        const MATERIAL_GROUPS = [
            { key: 'TEBU',        label: 'Tebu',          match: n => n.includes('TEBU'),                                         colorIdx: 1 },
            { key: 'GULA',        label: 'Gula',          match: n => n.includes('GULA'),                                         colorIdx: 2 },
            { key: 'FILTER CAKE', label: 'Filter Cake',   match: n => n.includes('FILTER CAKE') || n.includes('BLOTONG'),         colorIdx: 5 },
            { key: 'FLY ASH',     label: 'Fly Ash',       match: n => n.includes('FLY ASH') || n.includes('FLYASH'),              colorIdx: 6 },
            { key: 'MOLASSES',    label: 'Molasses',      match: n => n.includes('MOLASSE'),                                      colorIdx: 4 },
            { key: 'BATU BARA',   label: 'Batu Bara',     match: n => n.includes('BATU BARA') || n.includes('BATUBARA'),          colorIdx: 7 },
            { key: 'SUPPORT',     label: 'Support',       match: n => n.includes('SUPPORT') || n.includes('SOLAR') || n.includes('SACK'), colorIdx: 3 },
        ];

        // Cek grup mana yang punya data
        const activeGroups = MATERIAL_GROUPS.filter(g => {
            return dates.some(dt =>
                byDate[dt].some(r => g.match((getItemName(r) || '').toUpperCase()))
            );
        });

        datasets = activeGroups.map(g => {
            const data = dates.map(dt => {
                const filtered = byDate[dt].filter(r => g.match((getItemName(r) || '').toUpperCase()));
                const tTon = filtered.reduce((s, r) => s + (r.total_tonase || 0), 0);
                const tRit = filtered.reduce((s, r) => s + (r.total_ritase || 0), 0);
                return tRit > 0 ? (tTon / tRit) : 0;
            });
            const c = COLORS[g.colorIdx % COLORS.length];
            return {
                label: g.label,
                data,
                borderColor: c.border,
                backgroundColor: c.bg,
                borderWidth: 2,
                tension: 0.4,
                fill: false,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: c.border,
                pointBorderColor: '#0d1117',
                pointBorderWidth: 2
            };
        });
    } else {
        // Filter spesifik → satu line total
        const data = dates.map(dt => {
            const filtered = byDate[dt].filter(r => matchFilter(getItemName(r), filterVal));
            const tTon = filtered.reduce((s, r) => s + (r.total_tonase || 0), 0);
            const tRit = filtered.reduce((s, r) => s + (r.total_ritase || 0), 0);
            return tRit > 0 ? (tTon / tRit) : 0;
        });
        datasets = [{
            label: labelMap[filterVal] || filterVal,
            data: data,
            borderColor: color.line,
            backgroundColor: color.bg,
            borderWidth: 2.5,
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: color.line,
            pointBorderColor: '#0d1117',
            pointBorderWidth: 2
        }];
    }

    const chartId = 'dashboardAvgTrendChart';
    if (!showLoader && charts[chartId]) {
        charts[chartId].data.labels = dates.map(fmtDate);
        charts[chartId].data.datasets = datasets;
        charts[chartId].update('none');
        return;
    }

    destroyChart(chartId);
    const ctx = document.getElementById(chartId).getContext('2d');
    charts[chartId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(fmtDate),
            datasets: datasets
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 12, font: { size: 11 } } },
                tooltip: {
                    ...TOOLTIP,
                    callbacks: {
                        label: c => ` ${c.dataset.label}: ${fmt(c.raw.toFixed(2))} KG`
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(48,54,61,0.2)' }, ticks: { callback: v => fmt(v) } },
                x: { grid: { display: false } }
            }
        }
    });
}

async function loadDashboardTatTrend(showLoader = false) {
    if (showLoader) {
        destroyChart('dashboardTatTrendChart');
        const canvas = document.getElementById('dashboardTatTrendChart');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '13px Inter, sans-serif';
            ctx.fillStyle = '#8b949e';
            ctx.textAlign = 'center';
            ctx.fillText('Memuat data...', canvas.width / 2, canvas.height / 2);
        }
    }
    // Ambil nilai filter dari dropdown
    const filterVal = document.getElementById('trendTatFilter')?.value || 'ALL';

    // ★ PERBAIKAN: Kirim tanggal aktif dari kalender agar data mundur dari tanggal yang benar
    const d = await api(`/api/production/history?days=7&date=${currentDate}`);
    if (!d || d.status !== 'success' || !d.data || d.data.length === 0) return;

    // Kelompokkan data per tanggal
    const byDate = {};
    d.data.forEach(r => {
        const tgl = r.tanggal || r.date || '';  // handle kedua kemungkinan field name
        if (!tgl) return;
        if (!byDate[tgl]) byDate[tgl] = [];
        byDate[tgl].push(r);
    });
    const dates = Object.keys(byDate).sort();
    if (dates.length === 0) return;

    // ★ Normalisasi: gunakan field ItemName (huruf campuran dari DB) — fallback ke 'type'
    const getItemName = (r) => r.ItemName || r.itemname || r.type || '';

    // Fungsi pencocokan item ke tipe filter
    const matchFilter = (itemName, fv) => {
        if (!fv || fv === 'ALL') return true;
        const n = (itemName || '').toUpperCase();
        if (fv === 'GULA')        return n.includes('GULA');
        if (fv === 'TEBU')        return n.includes('TEBU');
        if (fv === 'MOLASSES')    return n.includes('MOLASSE');
        if (fv === 'FILTER CAKE') return n.includes('FILTER CAKE') || n.includes('BLOTONG');
        if (fv === 'FLY ASH')     return n.includes('FLY ASH') || n.includes('FLYASH');
        if (fv === 'BATU BARA')   return n.includes('BATU BARA') || n.includes('BATUBARA');
        if (fv === 'SUPPORT')     return n.includes('SUPPORT') || n.includes('SOLAR') || n.includes('SACK');
        return n.includes(fv);
    };

    // Warna sesuai filter yang dipilih
    const colorMap = {
        'ALL':         { line: '#58a6ff', bg: 'rgba(88,166,255,0.15)'  },
        'GULA':        { line: '#f0c000', bg: 'rgba(240,192,0,0.12)'   },
        'TEBU':        { line: '#3fb950', bg: 'rgba(63,185,80,0.12)'   },
        'MOLASSES':    { line: '#e67e22', bg: 'rgba(230,126,34,0.12)'  },
        'FILTER CAKE': { line: '#39d2c0', bg: 'rgba(57,210,192,0.12)' },
        'FLY ASH':     { line: '#f85149', bg: 'rgba(248,81,73,0.12)'  },
        'BATU BARA':   { line: '#a1887f', bg: 'rgba(161,136,127,0.12)'},
        'SUPPORT':     { line: '#bc8cff', bg: 'rgba(188,140,255,0.12)'},
    };
    const color = colorMap[filterVal] || colorMap['ALL'];

    const labelMap = {
        'ALL': 'Rata-rata TAT Semua Item', 'GULA': 'Gula', 'TEBU': 'Tebu',
        'MOLASSES': 'Molasses', 'FILTER CAKE': 'Filter Cake',
        'FLY ASH': 'Fly Ash', 'BATU BARA': 'Batu Bara', 'SUPPORT': 'Support'
    };

    // ★ Buat datasets: jika ALL → satu line per material unik; jika filter spesifik → satu line total
    let datasets = [];

    if (filterVal === 'ALL') {
        // Kumpulkan semua material unik (dikelompokkan ke kategori besar)
        const MATERIAL_GROUPS = [
            { key: 'TEBU',        label: 'Tebu',          match: n => n.includes('TEBU'),                                         colorIdx: 1 },
            { key: 'GULA',        label: 'Gula',          match: n => n.includes('GULA'),                                         colorIdx: 2 },
            { key: 'FILTER CAKE', label: 'Filter Cake',   match: n => n.includes('FILTER CAKE') || n.includes('BLOTONG'),         colorIdx: 5 },
            { key: 'FLY ASH',     label: 'Fly Ash',       match: n => n.includes('FLY ASH') || n.includes('FLYASH'),              colorIdx: 6 },
            { key: 'MOLASSES',    label: 'Molasses',      match: n => n.includes('MOLASSE'),                                      colorIdx: 4 },
            { key: 'BATU BARA',   label: 'Batu Bara',     match: n => n.includes('BATU BARA') || n.includes('BATUBARA'),          colorIdx: 7 },
            { key: 'SUPPORT',     label: 'Support',       match: n => n.includes('SUPPORT') || n.includes('SOLAR') || n.includes('SACK'), colorIdx: 3 },
        ];

        // Cek grup mana yang punya data
        const activeGroups = MATERIAL_GROUPS.filter(g => {
            return dates.some(dt =>
                byDate[dt].some(r => g.match((getItemName(r) || '').toUpperCase()))
            );
        });

        datasets = activeGroups.map(g => {
            const data = dates.map(dt => {
                const filtered = byDate[dt].filter(r => g.match((getItemName(r) || '').toUpperCase()));
                const tSum = filtered.reduce((s, r) => s + (r.sum_tat || 0), 0);
                const tCount = filtered.reduce((s, r) => s + (r.count_tat || 0), 0);
                return tCount > 0 ? (tSum / tCount) : 0;
            });
            const c = COLORS[g.colorIdx % COLORS.length];
            return {
                label: g.label,
                data,
                borderColor: c.border,
                backgroundColor: c.bg,
                borderWidth: 2,
                tension: 0.4,
                fill: false,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: c.border,
                pointBorderColor: '#0d1117',
                pointBorderWidth: 2
            };
        });
    } else {
        // Filter spesifik → satu line total
        const data = dates.map(dt => {
            const filtered = byDate[dt].filter(r => matchFilter(getItemName(r), filterVal));
            const tSum = filtered.reduce((s, r) => s + (r.sum_tat || 0), 0);
            const tCount = filtered.reduce((s, r) => s + (r.count_tat || 0), 0);
            return tCount > 0 ? (tSum / tCount) : 0;
        });
        datasets = [{
            label: labelMap[filterVal] || filterVal,
            data: data,
            borderColor: color.line,
            backgroundColor: color.bg,
            borderWidth: 2.5,
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: color.line,
            pointBorderColor: '#0d1117',
            pointBorderWidth: 2
        }];
    }

    const chartId = 'dashboardTatTrendChart';
    if (!showLoader && charts[chartId]) {
        charts[chartId].data.labels = dates.map(fmtDate);
        charts[chartId].data.datasets = datasets;
        charts[chartId].update('none');
        return;
    }

    destroyChart(chartId);
    const ctx = document.getElementById(chartId).getContext('2d');
    charts[chartId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(fmtDate),
            datasets: datasets
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 12, font: { size: 11 } } },
                tooltip: {
                    ...TOOLTIP,
                    callbacks: {
                        label: c => ` ${c.dataset.label}: ${fmtMinutes(c.raw)}`
                    }
                }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    grid: { color: 'rgba(48,54,61,0.2)' }, 
                    ticks: { 
                        callback: v => {
                            const hrs = Math.floor(v / 60);
                            const mins = Math.round(v % 60);
                            return hrs > 0 ? `${hrs}j ${mins}m` : `${mins}m`;
                        }
                    } 
                },
                x: { grid: { display: false } }
            }
        }
    });
}

async function loadDashboardTrend(showLoader = false) {
    if (showLoader) {
        destroyChart('dashboardTrendChart');
        const canvas = document.getElementById('dashboardTrendChart');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '13px Inter, sans-serif';
            ctx.fillStyle = '#8b949e';
            ctx.textAlign = 'center';
            ctx.fillText('Memuat data...', canvas.width / 2, canvas.height / 2);
        }
    }
    // Ambil nilai filter dari dropdown
    const filterVal = document.getElementById('trendFilter')?.value || 'ALL';

    // ★ PERBAIKAN: Kirim tanggal aktif dari kalender agar data mundur dari tanggal yang benar
    const d = await api(`/api/production/history?days=7&date=${currentDate}`);
    if (!d || d.status !== 'success' || !d.data || d.data.length === 0) return;

    // Kelompokkan data per tanggal
    const byDate = {};
    d.data.forEach(r => {
        const tgl = r.tanggal || r.date || '';  // handle kedua kemungkinan field name
        if (!tgl) return;
        if (!byDate[tgl]) byDate[tgl] = [];
        byDate[tgl].push(r);
    });
    const dates = Object.keys(byDate).sort();
    if (dates.length === 0) return;

    // ★ Normalisasi: gunakan field ItemName (huruf campuran dari DB) — fallback ke 'type'
    const getItemName = (r) => r.ItemName || r.itemname || r.type || '';

    // Fungsi pencocokan item ke tipe filter
    const matchFilter = (itemName, fv) => {
        if (!fv || fv === 'ALL') return true;
        const n = (itemName || '').toUpperCase();
        if (fv === 'GULA')        return n.includes('GULA');
        if (fv === 'TEBU')        return n.includes('TEBU');
        if (fv === 'MOLASSES')    return n.includes('MOLASSE');
        if (fv === 'FILTER CAKE') return n.includes('FILTER CAKE') || n.includes('BLOTONG');
        if (fv === 'FLY ASH')     return n.includes('FLY ASH') || n.includes('FLYASH');
        if (fv === 'BATU BARA')   return n.includes('BATU BARA') || n.includes('BATUBARA');
        if (fv === 'SUPPORT')     return n.includes('SUPPORT') || n.includes('SOLAR') || n.includes('SACK');
        return n.includes(fv);
    };

    // Warna sesuai filter yang dipilih
    const colorMap = {
        'ALL':         { line: '#58a6ff', bg: 'rgba(88,166,255,0.15)'  },
        'GULA':        { line: '#f0c000', bg: 'rgba(240,192,0,0.12)'   },
        'TEBU':        { line: '#3fb950', bg: 'rgba(63,185,80,0.12)'   },
        'MOLASSES':    { line: '#e67e22', bg: 'rgba(230,126,34,0.12)'  },
        'FILTER CAKE': { line: '#39d2c0', bg: 'rgba(57,210,192,0.12)' },
        'FLY ASH':     { line: '#f85149', bg: 'rgba(248,81,73,0.12)'  },
        'BATU BARA':   { line: '#a1887f', bg: 'rgba(161,136,127,0.12)'},
        'SUPPORT':     { line: '#bc8cff', bg: 'rgba(188,140,255,0.12)'},
    };
    const color = colorMap[filterVal] || colorMap['ALL'];

    const labelMap = {
        'ALL': 'Total Semua Item', 'GULA': 'Gula', 'TEBU': 'Tebu',
        'MOLASSES': 'Molasses', 'FILTER CAKE': 'Filter Cake',
        'FLY ASH': 'Fly Ash', 'BATU BARA': 'Batu Bara', 'SUPPORT': 'Support'
    };

    // ★ Buat datasets: jika ALL → satu line per material unik; jika filter spesifik → satu line total
    let datasets = [];

    if (filterVal === 'ALL') {
        // Kumpulkan semua material unik (dikelompokkan ke kategori besar)
        const MATERIAL_GROUPS = [
            { key: 'TEBU',        label: 'Tebu',          match: n => n.includes('TEBU'),                                         colorIdx: 1 },
            { key: 'GULA',        label: 'Gula',          match: n => n.includes('GULA'),                                         colorIdx: 2 },
            { key: 'FILTER CAKE', label: 'Filter Cake',   match: n => n.includes('FILTER CAKE') || n.includes('BLOTONG'),         colorIdx: 5 },
            { key: 'FLY ASH',     label: 'Fly Ash',       match: n => n.includes('FLY ASH') || n.includes('FLYASH'),              colorIdx: 6 },
            { key: 'MOLASSES',    label: 'Molasses',      match: n => n.includes('MOLASSE'),                                      colorIdx: 4 },
            { key: 'BATU BARA',   label: 'Batu Bara',     match: n => n.includes('BATU BARA') || n.includes('BATUBARA'),          colorIdx: 7 },
            { key: 'SUPPORT',     label: 'Support',       match: n => n.includes('SUPPORT') || n.includes('SOLAR') || n.includes('SACK'), colorIdx: 3 },
        ];

        // Cek grup mana yang punya data
        const activeGroups = MATERIAL_GROUPS.filter(g => {
            return dates.some(dt =>
                byDate[dt].some(r => g.match((getItemName(r) || '').toUpperCase()))
            );
        });

        datasets = activeGroups.map(g => {
            const data = dates.map(dt =>
                byDate[dt]
                    .filter(r => g.match((getItemName(r) || '').toUpperCase()))
                    .reduce((s, r) => s + (r.total_tonase || 0), 0)
            );
            const c = COLORS[g.colorIdx % COLORS.length];
            return {
                label: g.label,
                data,
                borderColor: c.border,
                backgroundColor: c.bg,
                borderWidth: 2,
                tension: 0.4,
                fill: false,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: c.border,
                pointBorderColor: '#0d1117',
                pointBorderWidth: 2
            };
        });
    } else {
        // Filter spesifik → satu line total
        const dailyTotals = dates.map(dt =>
            byDate[dt]
                .filter(r => matchFilter(getItemName(r), filterVal))
                .reduce((s, r) => s + (r.total_tonase || 0), 0)
        );
        datasets = [{
            label: labelMap[filterVal] || filterVal,
            data: dailyTotals,
            borderColor: color.line,
            backgroundColor: color.bg,
            borderWidth: 2.5,
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: color.line,
            pointBorderColor: '#0d1117',
            pointBorderWidth: 2
        }];
    }

    const chartId = 'dashboardTrendChart';
    if (!showLoader && charts[chartId]) {
        charts[chartId].data.labels = dates.map(fmtDate);
        charts[chartId].data.datasets = datasets;
        charts[chartId].update('none');
        return;
    }

    destroyChart(chartId);
    const ctx = document.getElementById(chartId).getContext('2d');
    charts[chartId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(fmtDate),
            datasets: datasets
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 12, font: { size: 11 } } },
                tooltip: {
                    ...TOOLTIP,
                    callbacks: {
                        label: c => ` ${c.dataset.label}: ${fmt(c.raw)} KG`
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(48,54,61,0.2)' }, ticks: { callback: v => fmt(v) } },
                x: { grid: { display: false } }
            }
        }
    });
}

async function loadPOMonitor() {
    const d = await api('/api/po-monitor');
    const tbody = document.getElementById('poMonitorBody');
    const thead = document.getElementById('poMonitorHead');
    const isAdmin = (window.currentUserRole === 'admin');

    // Render header: tambah kolom AKSI untuk admin
    thead.innerHTML = `<tr>
        <th style="text-align:left; min-width: 150px;">NOMOR PO</th>
        <th style="text-align:left; min-width: 200px;">ITEM (BARANG)</th>
        <th>TARGET PO (KG)</th>
        <th>TERKIRIM (KG)</th>
        <th>SISA KUOTA (KG)</th>
        <th style="min-width: 150px;">STATUS TERPAKAI</th>
        <th style="text-align:left; min-width: 180px;">KETERANGAN</th>
        ${isAdmin ? '<th style="width:56px; text-align:center;">AKSI</th>' : ''}
    </tr>`;

    // Initialize mini monitor button if admin
    const btnMiniMonitorPo = document.getElementById('btnMiniMonitorPo');
    if (btnMiniMonitorPo) {
        if (isAdmin) {
            btnMiniMonitorPo.style.display = 'inline-block';
            btnMiniMonitorPo.onclick = openMiniMonitorPO;
        } else {
            btnMiniMonitorPo.style.display = 'none';
        }
    }

    const colCount = isAdmin ? 8 : 7;
    if (!d || d.status !== 'success') { tbody.innerHTML = errRow(colCount, 'Gagal memuat Monitor PO.'); return; }

    // User biasa hanya lihat PO yang di-monitor; admin lihat semua PO aktif.
    // Toleran terhadap NULL (row lama sebelum kolom is_monitored ada): NULL dianggap monitored.
    const rows = isAdmin ? (d.data || []) : (d.data || []).filter(r => r.is_monitored != 0);

    if (rows.length === 0) { tbody.innerHTML = emptyRow(colCount, 'Tidak ada PO Stock yang sedang aktif.'); return; }

    tbody.innerHTML = rows.map(r => {
        const target = parseFloat(r.target_po) || 0;
        const sent = parseFloat(r.total_terkirim) || 0;
        const balance = target - sent;
        const keterangan = r.keterangan || '';
        const isMonitored = (r.is_monitored == 1);

        let percent = target > 0 ? (sent / target) * 100 : 0;
        if (percent > 100) percent = 100;

        // Ganti warna bar progress: Merah (>90%), Kuning (>75%), Hijau (Aman)
        let barColor = '#3fb950'; // Hijau
        if (percent >= 90) barColor = '#f85149'; // Merah
        else if (percent >= 75) barColor = '#f0c000'; // Kuning

        const itemName = r.item_name || 'LIMBAH / BARANG LAINNYA';
        const balanceColor = balance < 0 ? 'color: #f85149;' : 'color: #3fb950;';

        // Buat NOMOR PO clickable untuk admin
        const poClickStyle = isAdmin
            ? 'cursor:pointer; color:#58a6ff; text-decoration:underline; text-decoration-style:dotted; text-underline-offset:3px;'
            : 'color: #e6edf3;';
        const poClickAttr = isAdmin
            ? `onclick="openEditPOModal('${r.nomor_po}', ${target}, '${keterangan.replace(/'/g, "\\'")}')" title="Klik untuk edit Target PO & Keterangan"`
            : '';

        // Kolom aksi (admin only): toggle monitor + close PO — kecil & rapat
        const aksiCell = isAdmin
            ? `<td style="white-space:nowrap; text-align:center; padding:4px 6px;">
                   <button onclick="togglePOMonitor('${r.nomor_po}', ${isMonitored ? 0 : 1})" title="${isMonitored ? 'Sembunyikan dari Monitor' : 'Tampilkan di Monitor'}"
                       style="background:none;border:none;cursor:pointer;font-size:0.8rem;line-height:1;padding:2px 3px;color:${isMonitored ? '#3fb950' : '#8b949e'};">
                       <i class="fa-solid ${isMonitored ? 'fa-eye' : 'fa-eye-slash'}"></i>
                   </button><button onclick="closePO('${r.nomor_po}')" title="Tutup PO (soft delete)"
                       style="background:none;border:none;cursor:pointer;font-size:0.8rem;line-height:1;padding:2px 3px;color:#f85149;">
                       <i class="fa-solid fa-circle-xmark"></i>
                   </button>
               </td>`
            : '';

        return `<tr>
            <td style="text-align:left; font-weight:700; ${poClickStyle}" ${poClickAttr}>${r.nomor_po}</td>
            <td style="text-align:left">${itemName}</td>
            <td>${fmt(target)}</td>
            <td>${fmt(sent)}</td>
            <td style="font-weight:800; ${balanceColor}">${fmt(balance)}</td>
            <td>
                <div style="background:rgba(255,255,255,0.1); border-radius:4px; height:8px; width:100%; overflow:hidden; position:relative; margin-top:5px;">
                    <div style="background:${barColor}; height:100%; width:${percent}%; transition:width 1s ease;"></div>
                </div>
                <div style="font-size:0.7rem; color:var(--text-muted); text-align:right; margin-top:4px; font-weight:600;">${percent.toFixed(1)}% Terpakai</div>
            </td>
            <td style="text-align:left; font-size:0.85rem; color:var(--text-secondary); max-width:220px; white-space:pre-wrap; word-break:break-word;">${keterangan || '<span style="color:var(--text-muted); font-style:italic;">—</span>'}</td>
            ${aksiCell}
        </tr>`;
    }).join('');
}

// Toggle PO ditampilkan/disembunyikan di Monitor (admin only)
async function togglePOMonitor(nomorPo, isMonitored) {
    const res = await apiPost('/api/po-monitor-toggle', { nomor_po: nomorPo, is_monitored: isMonitored });
    if (res && res.status === 'success') {
        loadPOMonitor();
    } else {
        alert('Gagal mengubah status monitor PO!');
    }
}

// Close PO (soft delete, admin only)
async function closePO(nomorPo) {
    if (!confirm(`Tutup PO "${nomorPo}"?\n\nPO akan disembunyikan dari monitor & tidak bisa dipakai lagi. Data histori tetap tersimpan.`)) return;
    const res = await apiPost('/api/po-close', { nomor_po: nomorPo });
    if (res && res.status === 'success') {
        loadPOMonitor();
    } else {
        alert('Gagal menutup PO!');
    }
}

// Monitoring PO mini popup — tampilkan PO dari data_timbang yang belum dimonitor
let _miniPoAllRows = [];
const _MINI_PO_LIMIT = 50;

function renderMiniPoRows(rows) {
    _miniPoAllRows = rows || [];
    _filterMiniPoRows();
}

function _filterMiniPoRows() {
    const q = (document.getElementById('searchInputPoMini')?.value || '').toLowerCase();
    const matched = q
        ? _miniPoAllRows.filter(r => (r.nomor_po || '').toLowerCase().includes(q) || (r.item_name || '').toLowerCase().includes(q))
        : _miniPoAllRows;
    const display = matched.slice(0, _MINI_PO_LIMIT);
    const tbody = document.getElementById('poMiniListBody');
    if (!display.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--text-muted); font-style:italic;">${q ? 'Tidak ditemukan.' : 'Tidak ada data PO.'}</td></tr>`;
        return;
    }
    let html = display.map(r => {
        const noPo = r.nomor_po || '-';
        const item = r.item_name || '-';
        const qtySj = parseFloat(r.qty_sj) || 0;
        const isActive = r.is_active == 1;
        const isMonitored = r.is_monitored == 1;

        let statusLabel, statusColor;
        if (isActive && isMonitored) {
            statusLabel = 'Aktif'; statusColor = '#3fb950';
        } else if (isActive && !isMonitored) {
            statusLabel = 'Hidden'; statusColor = '#8b949e';
        } else {
            statusLabel = 'Belum'; statusColor = '#f0c000';
        }

        let aksiHtml;
        if (isActive && isMonitored) {
            aksiHtml = `<button onclick="togglePOMonitor('${noPo}', 0); _refreshMiniPo();" title="Sembunyikan"
                style="background:none; border:1px solid #8b949e; color:#8b949e; cursor:pointer; font-size:0.75rem; border-radius:4px; padding:2px 8px;">
                <i class="fa-solid fa-eye-slash"></i> Hide
            </button>`;
        } else if (isActive && !isMonitored) {
            aksiHtml = `<button onclick="togglePOMonitor('${noPo}', 1); _refreshMiniPo();" title="Tampilkan kembali"
                style="background:var(--accent-green); border:none; color:#fff; cursor:pointer; font-size:0.75rem; border-radius:4px; padding:2px 8px; font-weight:600;">
                <i class="fa-solid fa-eye"></i> Show
            </button>`;
        } else {
            aksiHtml = `<button onclick="addPoToMonitor('${noPo}', ${qtySj})" title="Tambahkan ke Monitoring"
                style="background:var(--accent-green); border:none; color:#fff; cursor:pointer; font-size:0.75rem; border-radius:4px; padding:2px 8px; font-weight:600;">
                <i class="fa-solid fa-plus"></i> Monitor
            </button>`;
        }

        return `<tr>
            <td style="text-align:left; font-weight:600; font-size:0.82rem;">${noPo}</td>
            <td style="text-align:left; font-size:0.82rem;">${item}</td>
            <td style="text-align:center;">${qtySj > 0 ? fmt(qtySj) : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td style="text-align:center;"><span style="color:${statusColor}; font-weight:600; font-size:0.75rem;">${statusLabel}</span></td>
            <td style="text-align:center; white-space:nowrap;">${aksiHtml}</td>
        </tr>`;
    }).join('');
    
    if (matched.length > _MINI_PO_LIMIT && !q) {
        html += `<tr><td colspan="5" style="text-align:center; padding:8px; color:var(--text-muted); font-size:0.8rem; font-style:italic;">Menampilkan ${_MINI_PO_LIMIT} dari ${matched.length} PO. Gunakan pencarian untuk menemukan PO lain.</td></tr>`;
    }
    tbody.innerHTML = html;
}

async function openMiniMonitorPO() {
    const overlay = document.getElementById('modalPoMiniOverlay');
    const tbody = document.getElementById('poMiniListBody');
    if (!overlay || !tbody) return;
    overlay.classList.add('active');
    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell"><div class="loader"></div> Memuat...</td></tr>';

    const searchInput = document.getElementById('searchInputPoMini');
    if (searchInput) { searchInput.value = ''; searchInput.oninput = _filterMiniPoRows; }

    document.getElementById('modalPoMiniClose').onclick = () => overlay.classList.remove('active');
    overlay.onclick = e => { if (e.target === overlay) overlay.classList.remove('active'); };

    const d = await api('/api/po-unmonitored');
    renderMiniPoRows(d && d.status === 'success' ? d.data : []);
}

async function _refreshMiniPo() {
    await loadPOMonitor();
    const d = await api('/api/po-unmonitored');
    renderMiniPoRows(d && d.status === 'success' ? d.data : []);
}

async function addPoToMonitor(nomorPo, qtySj) {
    const qty = qtySj > 0 ? qtySj : 0;
    const res = await apiPost('/api/po-stock', { nomor_po: nomorPo, qty_po: qty });
    if (res && res.status === 'success') {
        await _refreshMiniPo();
    } else {
        alert('Gagal menambahkan PO ke monitoring!');
    }
}

