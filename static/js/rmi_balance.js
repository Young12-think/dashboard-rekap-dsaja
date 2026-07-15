// static/js/rmi_balance.js

// Format number utility
function fmt(num) {
    if (num === null || num === undefined || isNaN(num)) return "0";
    return Number(num).toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

// Global chart instances
let chartInstances = {};

const RMI_OVERVIEW_MOCK_DATA = {
    date: "2026-07-09",
    report: {
        status: "draft",
        balance_status: "balanced",
        last_update: "2026-07-09 09:15:00",
        source: "Mock Data"
    },
    sugar: {
        kpi: {
            total_stock: 33880.35,
            good_stock: 32639.35,
            gkm: 19687.05,
            gkb: 12952.30,
            reject: 1241.00,
            delivery_gap: -250.00,
            utilization_percent: 72.24
        },
        balance: {
            opening_good_stock: 32000.00,
            in_gkm: 1200.00,
            in_gkb: 800.00,
            delivery_gkm: 1000.00,
            delivery_gkb: 500.00,
            reject_deduction: 20.00,
            remelt: 10.00,
            calculated_good_stock: 32480.00,
            actual_good_stock: 32480.00,
            difference: 0.00,
            tolerance: 0.01,
            status: "balanced"
        },
        composition: [
            { label: "GKM", value: 19687.05 },
            { label: "GKB", value: 12952.30 },
            { label: "Reject", value: 1241.00 }
        ],
        stock_position: {
            in_site: 24880.35,
            out_site: 9000.00,
            total_position: 33880.35,
            balance1_total: 33880.35,
            difference: 0.00,
            status: "valid",
            locations: [
                { name: "WFG", type: "in_site", stock: 17829.10 },
                { name: "WRS / Curah", type: "in_site", stock: 7051.25 },
                { name: "Kepanjen", type: "out_site", stock: 9000.00 },
                { name: "Bulog Garum", type: "out_site", stock: 0.00 },
                { name: "Blitar / Gedog", type: "out_site", stock: 0.00 }
            ]
        },
        validation: [
            { code: "BALANCE_EQUATION", label: "Balance Equation", status: "ok", message: "Calculated stock matches actual good stock." },
            { code: "STOCK_POSITION", label: "Stock Position", status: "ok", message: "Stock position matches Balance 1 total." },
            { code: "DELIVERY", label: "Delivery Plan vs Actual", status: "warning", message: "Actual delivery is below plan." },
            { code: "REJECT_REMELT", label: "Reject & Remelt", status: "ok", message: "Reject and remelt are recorded." },
            { code: "CAPACITY", label: "Capacity", status: "ok", message: "Warehouse utilization is normal." },
            { code: "MISSING_INPUT", label: "Missing Input", status: "ok", message: "Required inputs are available." }
        ],
        trend: {
            stock: [
                { date: "2026-07-03", total: 33000, good: 31800, reject: 1200 },
                { date: "2026-07-04", total: 33450, good: 32200, reject: 1250 },
                { date: "2026-07-05", total: 33600, good: 32350, reject: 1250 },
                { date: "2026-07-06", total: 33750, good: 32500, reject: 1250 },
                { date: "2026-07-07", total: 33820, good: 32590, reject: 1230 },
                { date: "2026-07-08", total: 33900, good: 32680, reject: 1220 },
                { date: "2026-07-09", total: 33880.35, good: 32639.35, reject: 1241.00 }
            ],
            delivery: [
                { date: "2026-07-03", plan: 1000, actual: 900 },
                { date: "2026-07-04", plan: 1100, actual: 1050 },
                { date: "2026-07-05", plan: 900, actual: 950 },
                { date: "2026-07-06", plan: 1200, actual: 1000 },
                { date: "2026-07-07", plan: 1000, actual: 980 },
                { date: "2026-07-08", plan: 1000, actual: 1000 },
                { date: "2026-07-09", plan: 1250, actual: 1000 }
            ]
        }
    },
    molasses: {
        tank_a: 10500.00,
        tank_b: 8250.00,
        total_stock: 18750.00,
        utilization_percent: 62.50,
        delivery_gap: -100.00,
        status: "ok"
    },
    cane: {
        cane_tebu_today: 7588.61,
        cane_netto_kg: 7588610,
        cane_ritase: 874,
        cane_source: 7588.61,
        source: "data_timbang.Type=TEBU",
        status: "ok"
    }
};
const RMI_USE_MOCK_FALLBACK = ['localhost', '127.0.0.1', ''].includes(window.location.hostname) || window.location.protocol === 'file:';

// Tab Navigation
document.querySelectorAll('#rmiNav li[data-tab]').forEach(li => {
    li.addEventListener('click', function () {
        document.querySelectorAll('#rmiNav li').forEach(el => el.classList.remove('active'));
        this.classList.add('active');

        const tabId = this.getAttribute('data-tab');
        document.querySelectorAll('.rmi-tab-pane').forEach(el => el.classList.remove('active'));
        document.getElementById(`tab-${tabId}`).classList.add('active');

        document.getElementById('pageTitle').textContent = this.textContent.trim();

        // Trigger resize so charts render correctly if they were hidden
        window.dispatchEvent(new Event('resize'));
    });
});

// Fetch all data
async function fetchRmiData() {
    await fetchOverviewData();

    const results = await Promise.allSettled([
        fetch('/api/rmi-balance/stok-harian').then(r => r.json()),
        fetch('/api/rmi-balance/delivery-harian').then(r => r.json()),
        fetch('/api/rmi-balance/molasses-harian').then(r => r.json()),
        fetch('/api/rmi-balance/lokasi').then(r => r.json())
    ]);
    const [stokResult, deliveryResult, molassesResult, lokasiResult] = results;
    const stok = stokResult.status === 'fulfilled' ? stokResult.value : null;
    const delivery = deliveryResult.status === 'fulfilled' ? deliveryResult.value : null;
    const molasses = molassesResult.status === 'fulfilled' ? molassesResult.value : null;
    const lokasi = lokasiResult.status === 'fulfilled' ? lokasiResult.value : null;

    if (stok && stok.status === 'success') {
        renderChartStok(stok.data, 'chartFullStok');
    }
    if (delivery && delivery.status === 'success') {
        renderChartDelivery(delivery.data, 'chartFullDelivery');
    }
    if (molasses && molasses.status === 'success') {
        renderChartMolasses(molasses.data, 'chartFullMolasses');
    }
    if (lokasi && lokasi.status === 'success') {
        renderChartLokasi(lokasi.data, 'chartFullLokasi');
    }
}
window.fetchRmiData = fetchRmiData;

async function fetchOverviewData() {
    const dateValue = document.getElementById('overview-date-picker')?.value;
    const url = '/api/rmi-balance/overview-v2' + (dateValue ? `?date=${encodeURIComponent(dateValue)}` : '');
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        if (payload.status !== 'success') throw new Error(payload.message || 'Overview API failed');
        renderOverview(payload.data);
    } catch (err) {
        console.error("Failed to fetch RMI overview-v2:", err);
        if (RMI_USE_MOCK_FALLBACK) {
            renderOverview(RMI_OVERVIEW_MOCK_DATA);
            showOverviewFallback(`API overview-v2 gagal dimuat (${err.message}). Menampilkan fallback mock data development.`);
        } else {
            showOverviewFallback(`API overview-v2 gagal dimuat (${err.message}).`);
        }
    }
}

// Render Overview Cards
function renderLegacyOverview(data, stokData, deliveryData, lokasiData) {
    function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
    function setHtml(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val; }

    try {
        const today = new Date();
        const dOpt = { month: 'short', year: 'numeric' };
        setText('ov-header-date', `Per ${today.toLocaleDateString('id-ID', dOpt)}`);

        // Gula Stok Card
        setText('ov-gula-stok', fmt(data.gula.total_ton));

        // Gula Util Card
        const utilGula = data.gula.utilization_pct || 0;
        setText('ov-gula-util-text', fmt(utilGula) + '%');
        setText('ov-gula-cap', `cap ${fmt(data.gula.capacity)} ton`);

        const badgeGula = document.getElementById('ov-gula-util-badge');
        const barGula = document.getElementById('ov-gula-util-bar');
        if (badgeGula && barGula) {
            barGula.style.width = Math.min(utilGula, 100) + '%';
            if (utilGula < 15) {
                badgeGula.innerHTML = '⚠ Kritis';
                badgeGula.style.background = 'rgba(226,75,74,0.1)';
                badgeGula.style.color = '#A32D2D';
                barGula.style.background = '#E24B4A';
            } else {
                badgeGula.innerHTML = 'Aman';
                badgeGula.style.background = 'rgba(63,185,80,0.1)';
                badgeGula.style.color = '#3fb950';
                barGula.style.background = '#3fb950';
            }
        }

        // Defisit Card
        setText('ov-gula-defisit', fmt(data.delivery.defisit_ton));
        setText('ov-gula-defisit-pct', `ton · ${fmt(data.delivery.defisit_pct)}% dari plan`);

        // Molasses Card
        const utilMol = data.molasses.utilization_pct || 0;
        setText('ov-mol-stok', fmt(data.molasses.total_ton));
        setText('ov-mol-util-badge', fmt(utilMol) + '% cap');
        const barMol = document.getElementById('ov-mol-util-bar');
        if (barMol) {
            barMol.style.width = Math.min(utilMol, 100) + '%';
            barMol.style.background = utilMol > 80 ? '#E24B4A' : '#1D9E75';
        }

        // Alerts
        let alertsHtml = '';
        if (utilGula < 15) {
            alertsHtml += `
            <div style="background:rgba(226,75,74,0.05); border:0.5px solid rgba(226,75,74,0.3); border-radius:var(--radius-md); padding:9px 12px; display:flex; gap:8px; align-items:flex-start;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:14px; color:#A32D2D; flex-shrink:0; margin-top:1px;"></i>
                <div>
                <div style="font-size:12px; font-weight:500; color:#A32D2D;">Utilization gudang kritis — ${fmt(utilGula)}%</div>
                <div style="font-size:11px; color:#A32D2D; opacity:0.9; margin-top:1px;">Di bawah threshold 15%. Pertimbangkan restok atau relokasi stok antar gudang.</div>
                </div>
            </div>`;
        }
        if (data.delivery.defisit_ton > 0) {
            alertsHtml += `
            <div style="background:rgba(239,159,39,0.05); border:0.5px solid rgba(239,159,39,0.3); border-radius:var(--radius-md); padding:9px 12px; display:flex; gap:8px; align-items:flex-start;">
                <i class="fa-solid fa-box" style="font-size:14px; color:#c27d19; flex-shrink:0; margin-top:1px;"></i>
                <div>
                <div style="font-size:12px; font-weight:500; color:#c27d19;">Defisit delivery gula ${fmt(data.delivery.defisit_pct)}% dari plan</div>
                <div style="font-size:11px; color:#c27d19; opacity:0.9; margin-top:1px;">Total: ${fmt(data.delivery.plan_ton)} plan vs ${fmt(data.delivery.actual_ton)} actual.</div>
                </div>
            </div>`;
        }
        setHtml('ov-alerts-container', alertsHtml);

        // Rendering mini charts if data is present
        if (stokData) {
            setText('ov-chart1-subtitle', `Total stok ${stokData.length} hari (ton)`);
            if (stokData.length > 0) {
                const lastStok = stokData[stokData.length - 1];
                setText('ov-gkb-stok', fmt(lastStok.gkb));
                setText('ov-gkm-stok', fmt(lastStok.gkm));
            }
            renderSparklineStok(stokData, 'ov-spark-gula');
            renderChartStokGKP(stokData, 'ov-chart-stok-gkp');
        }

        if (deliveryData) {
            renderSparklineDefisit(deliveryData, 'ov-spark-defisit');
            renderChartDeliveryGula(deliveryData, 'ov-chart-delivery-gula');
            setText('ov-del-plan', fmt(data.delivery.plan_ton));
            setText('ov-del-actual', fmt(data.delivery.actual_ton));
            setText('ov-del-diff', fmt(data.delivery.defisit_ton));
        }

        if (lokasiData) {
            setText('ov-lokasi-subtitle', stokData ? `Hari ke-${stokData.length} (ton)` : 'Stok per lokasi (ton)');
            let lokHtml = '';
            const maxStok = lokasiData.length > 0
                ? Math.max(...lokasiData.map(d => parseFloat(d.stok_akhir) || 0), 1)
                : 1;
            const colors = ['#BA7517', '#378ADD', '#1D9E75', '#E24B4A'];
            lokasiData.forEach((lok, i) => {
                const val = parseFloat(lok.stok_akhir) || 0;
                const pct = (val / maxStok) * 100;
                const c = colors[i % colors.length];
                lokHtml += `
                <div>
                  <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:3px;">
                    <span style="color:var(--color-text-secondary);">${lok.nama_gudang}</span>
                    <span style="color:var(--color-text-primary); font-weight:500;">${fmt(val)}</span>
                  </div>
                  <div style="height:4px; background:var(--color-background-primary); border-radius:2px;">
                    <div style="width:${pct}%; height:100%; background:${c}; border-radius:2px;"></div>
                  </div>
                </div>`;
            });
            setHtml('ov-lokasi-container', lokHtml);
        }

    } catch (e) {
        console.warn('[RMI] renderOverview skipped:', e.message);
    }
}

// Destroy existing chart helper
function clearChart(canvasId) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
}
function getCtxSafe(canvasId) {
    const el = document.getElementById(canvasId);
    return el ? el.getContext('2d') : null;
}

// Common Chart.js Defaults for Dark Theme
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
Chart.defaults.font.family = "'Inter', sans-serif";

function formatTon(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ton';
}

function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

function formatDateIndo(dateString) {
    if (!dateString) return '-';
    const date = new Date(String(dateString).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(dateString);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateTimeIndo(dateString) {
    if (!dateString) return '-';
    const date = new Date(String(dateString).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(dateString);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
        date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function overviewNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function setOverviewText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setOverviewHtml(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}

function showOverviewFallback(message) {
    const errorEl = document.getElementById('overview-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function getOverviewStatusBadge(status) {
    const normalized = String(status || 'draft').toLowerCase();
    return `<span class="overview-status-badge ${normalized}">${overviewStatusLabel(normalized)}</span>`;
}

function overviewStatusLabel(status) {
    const labels = {
        ok: 'OK',
        valid: 'Valid',
        balanced: 'Balanced',
        warning: 'Warning',
        mismatch: 'Mismatch',
        error: 'Error',
        draft: 'Draft',
        submitted: 'Submitted',
        approved: 'Approved',
        locked: 'Locked'
    };
    return labels[status] || String(status || '-').replace(/_/g, ' ');
}

function applyOverviewStatus(id, status) {
    const el = document.getElementById(id);
    if (!el) return;
    const normalized = String(status || 'draft').toLowerCase();
    el.className = `overview-status-badge ${normalized}`;
    el.textContent = overviewStatusLabel(normalized);
}

function overviewSignedClass(value) {
    const num = Number(value || 0);
    if (num < 0) return 'danger';
    if (num > 0) return 'success';
    return '';
}

function renderOverview(data) {
    try {
        if (!data || !data.sugar) throw new Error('Overview data is empty.');
        const report = data.report || {};

        setOverviewText('overview-date', formatDateIndo(data.date));
        setOverviewText('overview-last-update', formatDateTimeIndo(report.last_update));
        setOverviewText('overview-source', report.source || 'Input DB');
        applyOverviewStatus('overview-report-status', report.status);
        applyOverviewStatus('overview-balance-status', report.balance_status);

        const datePicker = document.getElementById('overview-date-picker');
        if (datePicker && data.date) datePicker.value = data.date;

        const errorEl = document.getElementById('overview-error');
        if (errorEl) errorEl.style.display = 'none';

        renderOverviewKpiCards(data.sugar.kpi || {});
        renderOverviewBalanceCard(data.sugar.balance || {});
        renderOverviewCompositionCard(data.sugar.composition || [], data.sugar.kpi?.total_stock || 0);
        renderOverviewStockPositionCard(data.sugar.stock_position || {});
        renderOverviewValidationCard(data.sugar.validation || []);
        renderOverviewCharts(data.sugar.trend || {});
        renderOverviewOtherSummary(data.molasses || {}, data.cane || {});
    } catch (err) {
        console.warn('[RMI] renderOverview failed:', err);
        const errorEl = document.getElementById('overview-error');
        if (errorEl) {
            errorEl.textContent = 'Overview gagal dimuat: ' + err.message;
            errorEl.style.display = 'block';
        }
    }
}

function renderOverviewKpiCards(kpi) {
    const gap = Number(kpi.delivery_gap || 0);
    const util = Number(kpi.utilization_percent || 0);
    const cards = [
        { label: 'Total Stock Gula', value: formatTon(kpi.total_stock), sub: 'GKM + GKB + Reject', cls: 'success' },
        { label: 'GKM', value: formatTon(kpi.gkm), sub: 'Red sugar / Gula merah', cls: 'danger' },
        { label: 'GKB', value: formatTon(kpi.gkb), sub: 'Blue sugar / Gula biru', cls: '' },
        { label: 'Reject', value: formatTon(kpi.reject), sub: 'Reject stock', cls: 'warning' },
        { label: 'Delivery Gap', value: formatTon(kpi.delivery_gap), sub: 'Actual - Plan', cls: overviewSignedClass(gap) || 'warning' },
        { label: 'Warehouse Utilization', value: formatPercent(util), sub: 'Stock / capacity', cls: util > 85 ? 'warning' : 'success', progress: util }
    ];

    setOverviewHtml('overview-kpi-grid', cards.map(card => `
        <article class="overview-kpi-card ${card.cls}">
            <div>
                <div class="overview-kpi-label">${card.label}</div>
                <div class="overview-kpi-value">${card.value}</div>
                <div class="overview-kpi-sub">${card.sub}</div>
            </div>
            ${card.progress === undefined ? '' : `
                <div class="overview-progress">
                    <div class="overview-progress-fill" style="width:${Math.min(Math.max(card.progress, 0), 100)}%;"></div>
                </div>
            `}
        </article>
    `).join(''));
}

function renderOverviewBalanceCard(balance) {
    const status = balance.status || (Math.abs(Number(balance.difference || 0)) <= Number(balance.tolerance || 0.01) ? 'balanced' : 'mismatch');
    applyOverviewStatus('overview-balance-card-status', status);

    const rows = [
        ['Opening Good Stock', formatTon(balance.opening_good_stock)],
        ['+ Penerimaan GKM', formatTon(balance.in_gkm)],
        ['+ Penerimaan GKB', formatTon(balance.in_gkb)],
        ['- Delivery GKM', formatTon(balance.delivery_gkm)],
        ['- Delivery GKB', formatTon(balance.delivery_gkb)],
        ['- Reject Deduction', formatTon(balance.reject_deduction)],
        ['- Remelt', formatTon(balance.remelt)],
        ['= Calculated Good Stock', formatTon(balance.calculated_good_stock), 'total'],
        ['Actual Good Stock', formatTon(balance.actual_good_stock)],
        ['Difference', formatTon(balance.difference), 'final'],
        ['Status', getOverviewStatusBadge(status)]
    ];

    setOverviewHtml('overview-balance-card', `
        <table class="overview-balance-table">
            <tbody>
                ${rows.map(row => `
                    <tr class="${row[2] || ''}">
                        <td>${row[0]}</td>
                        <td>${row[1]}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <div class="overview-card-subtitle" style="margin-top: 12px;">Tolerance: +/- ${overviewNumber(balance.tolerance || 0.01)} ton</div>
    `);
}

function renderOverviewCompositionCard(composition, totalStock) {
    if (!composition.length || !Number(totalStock)) {
        setOverviewHtml('overview-composition-card', '<div class="overview-empty-state">Belum ada data komposisi stock.</div>');
        return;
    }

    const colors = ['#f85149', '#58a6ff', '#d29922'];
    const findCompositionValue = label => {
        const item = composition.find(row => String(row.label || '').toLowerCase() === label);
        return Number(item?.value || 0);
    };
    const gkmValue = findCompositionValue('gkm');
    const gkbValue = findCompositionValue('gkb');
    const rejectValue = findCompositionValue('reject');
    const goodStock = gkmValue + gkbValue;
    const gkmPct = Number(totalStock) ? (gkmValue / Number(totalStock)) * 100 : 0;
    const gkbPct = Number(totalStock) ? (gkbValue / Number(totalStock)) * 100 : 0;
    const goodPct = Number(totalStock) ? (goodStock / Number(totalStock)) * 100 : 0;
    const rejectPct = Number(totalStock) ? (rejectValue / Number(totalStock)) * 100 : 0;
    const compositionStatus = getCompositionStatus(rejectPct);

    const rows = composition.map((item, index) => {
        const pct = Number(totalStock) ? (Number(item.value || 0) / Number(totalStock)) * 100 : 0;
        return `
            <div class="overview-composition-row">
                <div class="overview-composition-label">${item.label}</div>
                <div class="overview-composition-bar">
                    <div class="overview-composition-fill" style="width:${Math.min(pct, 100)}%; background:${colors[index % colors.length]};"></div>
                </div>
                <div class="overview-composition-value">${formatTon(item.value)} / ${formatPercent(pct)}</div>
            </div>
        `;
    }).join('');

    setOverviewHtml('overview-composition-card', `
        <div class="overview-composition-list">${rows}</div>
        <div class="overview-stock-row" style="margin-top: 14px;">
            <span class="overview-stock-label">Total Stock</span>
            <span class="overview-stock-value">${formatTon(totalStock)}</span>
        </div>
        <div class="overview-composition-insight">
            <div class="overview-insight-box">
                <div class="overview-insight-label">Dominant Stock</div>
                <div class="overview-insight-value">GKM ${formatPercent(gkmPct)}</div>
                <div class="overview-insight-note">GKB ${formatPercent(gkbPct)}</div>
            </div>
            <div class="overview-insight-box">
                <div class="overview-insight-label">Reject Ratio</div>
                <div class="overview-insight-value">${formatPercent(rejectPct)}</div>
                <div class="overview-insight-note">Reject / Total Stock</div>
            </div>
            <div class="overview-insight-box">
                <div class="overview-insight-label">Composition Status</div>
                <div class="overview-insight-value">${compositionStatus.label}</div>
                <div class="overview-insight-note">Good stock ${formatPercent(goodPct)}</div>
            </div>
        </div>
    `);
}

function getCompositionStatus(rejectPct) {
    if (rejectPct > 10) return { label: 'High Reject', status: 'mismatch' };
    if (rejectPct > 5) return { label: 'Warning', status: 'warning' };
    return { label: 'Normal', status: 'ok' };
}

function renderOverviewStockPositionCard(position) {
    const status = position.status || (Math.abs(Number(position.difference || 0)) <= 0.01 ? 'valid' : 'mismatch');
    applyOverviewStatus('overview-stock-position-status', status);

    const locations = Array.isArray(position.locations) ? position.locations : [];
    const topLocations = locations.slice(0, 5);
    const moreCount = Math.max(locations.length - topLocations.length, 0);

    setOverviewHtml('overview-stock-position-card', `
        <div class="overview-stock-summary">
            <div class="overview-stock-metric">
                <div class="overview-stock-label">In Site RMI</div>
                <div class="overview-stock-value" style="text-align:left; margin-top:6px;">${formatTon(position.in_site)}</div>
            </div>
            <div class="overview-stock-metric">
                <div class="overview-stock-label">Out Site RMI</div>
                <div class="overview-stock-value" style="text-align:left; margin-top:6px;">${formatTon(position.out_site)}</div>
            </div>
        </div>
        <div class="overview-stock-location-list">
            <div class="overview-stock-row"><span class="overview-stock-label">Total Position</span><span class="overview-stock-value">${formatTon(position.total_position)}</span></div>
            <div class="overview-stock-row"><span class="overview-stock-label">Balance 1 Total</span><span class="overview-stock-value">${formatTon(position.balance1_total)}</span></div>
            <div class="overview-stock-row"><span class="overview-stock-label">Difference</span><span class="overview-stock-value">${formatTon(position.difference)}</span></div>
            <div class="overview-stock-row"><span class="overview-stock-label">Status</span><span class="overview-stock-value">${getOverviewStatusBadge(status)}</span></div>
        </div>
        <div class="overview-card-subtitle" style="margin: 14px 0 8px;">Top lokasi</div>
        <div class="overview-stock-location-list">
            ${topLocations.map(loc => `
                <div class="overview-stock-row">
                    <span class="overview-stock-label">${loc.name}</span>
                    <span class="overview-stock-value">${formatTon(loc.stock)}</span>
                </div>
            `).join('') || '<div class="overview-empty-state">Belum ada data lokasi.</div>'}
            ${moreCount > 0 ? `<div class="overview-card-subtitle">+${moreCount} lokasi lainnya</div>` : ''}
        </div>
    `);
}

function renderOverviewValidationCard(validation) {
    if (!validation.length) {
        setOverviewHtml('overview-validation-card', '<div class="overview-empty-state">Belum ada data validasi.</div>');
        return;
    }

    const iconMap = { ok: 'OK', warning: '!', mismatch: 'x', error: 'x' };
    const allOk = validation.every(item => item.status === 'ok');

    setOverviewHtml('overview-validation-card', `
        ${allOk ? '<div class="overview-card-subtitle" style="margin-bottom: 10px; color: var(--accent-green);">All validation checks passed.</div>' : ''}
        <div class="overview-validation-list">
            ${validation.map(item => {
        const status = String(item.status || 'warning').toLowerCase();
        return `
                    <div class="overview-validation-item">
                        <span class="overview-validation-icon ${status}">${iconMap[status] || '!'}</span>
                        <div>
                            <div class="overview-validation-label">${item.label}</div>
                            <div class="overview-validation-message">${item.message || '-'}</div>
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `);
}

function renderOverviewCharts(trend) {
    const stock = Array.isArray(trend.stock) ? trend.stock : [];
    const delivery = Array.isArray(trend.delivery) ? trend.delivery : [];

    clearChart('overview-chart-stock-trend');
    const stockCtx = getCtxSafe('overview-chart-stock-trend');
    if (stockCtx && stock.length) {
        chartInstances['overview-chart-stock-trend'] = new Chart(stockCtx, {
            type: 'line',
            data: {
                labels: stock.map(item => shortDateLabel(item.date)),
                datasets: [
                    { label: 'Total Stock', data: stock.map(item => item.total), borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,0.12)', fill: true, tension: 0.35 },
                    { label: 'Good Stock', data: stock.map(item => item.good), borderColor: '#3fb950', tension: 0.35 },
                    { label: 'Reject', data: stock.map(item => item.reject), borderColor: '#d29922', tension: 0.35 }
                ]
            },
            options: overviewChartOptions()
        });
    }

    clearChart('overview-chart-delivery-trend');
    const deliveryCtx = getCtxSafe('overview-chart-delivery-trend');
    if (deliveryCtx && delivery.length) {
        chartInstances['overview-chart-delivery-trend'] = new Chart(deliveryCtx, {
            type: 'bar',
            data: {
                labels: delivery.map(item => shortDateLabel(item.date)),
                datasets: [
                    { label: 'Plan', data: delivery.map(item => item.plan), backgroundColor: 'rgba(88,166,255,0.65)' },
                    { label: 'Actual', data: delivery.map(item => item.actual), backgroundColor: 'rgba(63,185,80,0.7)' }
                ]
            },
            options: overviewChartOptions()
        });
    }
}

function overviewChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } }
        },
        scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, ticks: { callback: value => Number(value).toLocaleString('id-ID') } }
        }
    };
}

function shortDateLabel(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString || '-';
    return `${date.getDate()}/${date.getMonth() + 1}`;
}

function renderOverviewOtherSummary(molasses, cane) {
    setOverviewHtml('overview-other-summary', `
        <section class="overview-card">
            <div class="overview-card-header">
                <div>
                    <h3 class="overview-card-title">Molasses Summary</h3>
                    <div class="overview-card-subtitle">Ringkasan kecil material molasses</div>
                </div>
                ${getOverviewStatusBadge(molasses.status || 'ok')}
            </div>
            <div class="overview-card-body overview-summary-list">
                <div class="overview-summary-row"><span class="overview-summary-label">Tank A</span><span class="overview-summary-value">${formatTon(molasses.tank_a)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Tank B</span><span class="overview-summary-value">${formatTon(molasses.tank_b)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Total Molasses</span><span class="overview-summary-value">${formatTon(molasses.total_stock)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Utilization</span><span class="overview-summary-value">${formatPercent(molasses.utilization_percent)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Delivery Gap</span><span class="overview-summary-value">${formatTon(molasses.delivery_gap)}</span></div>
            </div>
        </section>
        <section class="overview-card">
            <div class="overview-card-header">
                <div>
                    <h3 class="overview-card-title">Cane Summary</h3>
                    <div class="overview-card-subtitle">Source: data_timbang.Type = TEBU</div>
                </div>
                ${getOverviewStatusBadge(cane.status || 'ok')}
            </div>
            <div class="overview-card-body overview-summary-list">
                <div class="overview-summary-row"><span class="overview-summary-label">Cane Netto in Day</span><span class="overview-summary-value">${formatTon(cane.cane_tebu_today)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Ritase in Day</span><span class="overview-summary-value">${fmt(cane.cane_ritase)} truck</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Cane Netto to Date</span><span class="overview-summary-value">${formatTon(cane.cane_netto_to_date)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Ritase to Date</span><span class="overview-summary-value">${fmt(cane.cane_ritase_to_date)} truck</span></div>
            </div>
        </section>
    `);
}

function renderSparklineStok(data, canvasId) {
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.tanggal),
            datasets: [{
                data: data.map(d => parseFloat(d.total_stok)),
                borderColor: '#378ADD',
                borderWidth: 1.5,
                tension: 0.2,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } },
            layout: { padding: 0 }
        }
    });
}

function renderSparklineDefisit(data, canvasId) {
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    const defisits = data.map(d => {
        let diff = parseFloat(d.actual) - parseFloat(d.plan);
        return diff < 0 ? diff : 0;
    });
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.tanggal),
            datasets: [{
                data: defisits,
                backgroundColor: '#E24B4A',
                borderRadius: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false, max: 0 } },
            layout: { padding: 0 }
        }
    });
}

function renderChartStokGKP(data, canvasId) {
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.tanggal),
            datasets: [{
                data: data.map(d => parseFloat(d.total_stok)),
                borderColor: '#378ADD',
                backgroundColor: 'rgba(55,138,221,0.2)',
                fill: true,
                borderWidth: 1.5,
                tension: 0.2,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { display: false } },
            layout: { padding: 0 }
        }
    });
}

function renderChartDeliveryGula(data, canvasId) {
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.tanggal),
            datasets: [
                { data: data.map(d => parseFloat(d.plan)), backgroundColor: '#85B7EB', borderRadius: 1 },
                { data: data.map(d => parseFloat(d.actual)), backgroundColor: '#EF9F27', borderRadius: 1 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false, stacked: false }, y: { display: false } },
            layout: { padding: 0 },
            barPercentage: 0.9,
            categoryPercentage: 1.0
        }
    });
}

// Chart 1: Stok GKP (Line Chart)
function renderChartStok(data, canvasId) {
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    const labels = data.map(d => {
        const dt = new Date(d.tanggal);
        return `${dt.getDate()}/${dt.getMonth() + 1}`;
    });
    const values = data.map(d => parseFloat(d.total_stok));

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Stok GKP (MT)',
                data: values,
                borderColor: '#58a6ff',
                backgroundColor: 'rgba(88, 166, 255, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// Chart 2: Delivery Plan vs Actual (Bar Chart)
function renderChartDelivery(data, canvasId) {
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    const labels = data.map(d => {
        const dt = new Date(d.tanggal);
        return `${dt.getDate()}/${dt.getMonth() + 1}`;
    });
    const plan = data.map(d => parseFloat(d.plan));
    const actual = data.map(d => parseFloat(d.actual));

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Plan (MT)',
                    data: plan,
                    backgroundColor: 'rgba(88, 166, 255, 0.6)',
                    borderColor: '#58a6ff',
                    borderWidth: 1
                },
                {
                    label: 'Actual (MT)',
                    data: actual,
                    backgroundColor: 'rgba(63, 185, 80, 0.6)',
                    borderColor: '#3fb950',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// Chart 3: Lokasi Gudang Luar (Horizontal Bar)
function renderChartLokasi(data, canvasId) {
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    const labels = data.map(d => d.nama_gudang);
    const values = data.map(d => parseFloat(d.stok_akhir));

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Stok Akhir (MT)',
                data: values,
                backgroundColor: '#bc8cff',
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

// Chart 4: Molasses Tangki A & B (Line Chart)
function renderChartMolasses(data, canvasId) {
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    const labels = data.map(d => {
        const dt = new Date(d.tanggal);
        return `${dt.getDate()}/${dt.getMonth() + 1}`;
    });
    const tankA = data.map(d => parseFloat(d.tank_a));
    const tankB = data.map(d => parseFloat(d.tank_b));

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Tank A (MT)',
                    data: tankA,
                    borderColor: '#f0c000',
                    tension: 0.3
                },
                {
                    label: 'Tank B (MT)',
                    data: tankB,
                    borderColor: '#ff7b72',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// Settings Modal Logic
async function openSettings() {
    try {
        const res = await fetch('/api/rmi-balance/settings').then(r => r.json());
        if (res.status === 'success') {
            document.getElementById('inputCapGula').value = res.data.gula_capacity;
            document.getElementById('inputCapMolasses').value = res.data.molasses_capacity;
            document.getElementById('inputMillingStartDate').value = res.data.milling_start_date || '';
            document.getElementById('settingsModal').classList.add('active');
        }
    } catch (e) {
        console.error(e);
    }
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
}

async function saveSettings() {
    const btn = document.querySelector('.btn-save');
    const oriText = btn.textContent;
    btn.textContent = "Menyimpan...";
    btn.disabled = true;

    const gula = parseFloat(document.getElementById('inputCapGula').value);
    const mol = parseFloat(document.getElementById('inputCapMolasses').value);
    const millingStartDate = document.getElementById('inputMillingStartDate').value || null;

    try {
        const res = await fetch('/api/rmi-balance/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gula_capacity: gula,
                molasses_capacity: mol,
                milling_start_date: millingStartDate
            })
        }).then(r => r.json());

        if (res.status === 'success') {
            closeSettings();
            fetchRmiData(); // Refresh overview
        } else {
            alert(res.message || "Gagal menyimpan pengaturan.");
        }
    } catch (err) {
        alert("Terjadi kesalahan jaringan.");
    } finally {
        btn.textContent = oriText;
        btn.disabled = false;
    }
}


// --- LAPORAN HARIAN & GRAFIK LOGIC ---

function initDates() {
    const today = new Date().toISOString().split('T')[0];
    const firstDay = new Date();
    firstDay.setDate(1);
    const firstDayStr = firstDay.toISOString().split('T')[0];

    const laporanDate = document.getElementById('laporanDate');
    const grafikDateFrom = document.getElementById('grafikDateFrom');
    const grafikDateTo = document.getElementById('grafikDateTo');

    if (laporanDate) laporanDate.value = today;
    if (grafikDateFrom) grafikDateFrom.value = firstDayStr;
    if (grafikDateTo) grafikDateTo.value = today;

    laporanDate?.addEventListener('change', function () {
        if (this.value) {
            currentLhDate = new Date(this.value + 'T00:00:00');
            if (typeof updateLhDateDisplay === 'function') {
                updateLhDateDisplay();
            }
        }
    });
}

function initOverviewControls() {
    const datePicker = document.getElementById('overview-date-picker');
    if (datePicker) {
        datePicker.addEventListener('change', () => {
            fetchRmiData();
        });
    }
}

async function fetchGrafikAnalitik() {
    const dateFrom = document.getElementById('grafikDateFrom').value;
    const dateTo = document.getElementById('grafikDateTo').value;
    try {
        const res = await fetch(`/api/rmi-balance/grafik?date_from=${dateFrom}&date_to=${dateTo}`).then(r => r.json());
        if (res.status === 'success') {
            renderGrafikAnalitik(res.data);
        }
    } catch (err) {
        console.error("Failed to fetch Grafik Analitik:", err);
    }
}

function renderGrafikAnalitik(data) {
    const labels = data.tren.map(d => {
        const dt = new Date(d.tanggal);
        return `${dt.getDate()}/${dt.getMonth() + 1}`;
    });

    // Chart Produksi
    clearChart('chartGrafikProduksi');
    const ctxProd = getCtxSafe('chartGrafikProduksi');
    if (ctxProd) {
        chartInstances['chartGrafikProduksi'] = new Chart(ctxProd, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Produksi Gula', data: data.tren.map(d => d.produksiGula), borderColor: '#58a6ff', tension: 0.3 },
                    { label: 'Produksi Molasses', data: data.tren.map(d => d.produksiMolasses), borderColor: '#3fb950', tension: 0.3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // Chart Delivery
    clearChart('chartGrafikDelivery');
    const ctxDel = getCtxSafe('chartGrafikDelivery');
    if (ctxDel) {
        chartInstances['chartGrafikDelivery'] = new Chart(ctxDel, {
            type: 'bar',
            data: {
                labels: data.delivery.map(d => {
                    const dt = new Date(d.tanggal); return `${dt.getDate()}/${dt.getMonth() + 1}`;
                }),
                datasets: [
                    { label: 'Gula Plan', data: data.delivery.map(d => d.gulaPlan), backgroundColor: 'rgba(88, 166, 255, 0.4)' },
                    { label: 'Gula Actual', data: data.delivery.map(d => d.gulaActual), backgroundColor: '#58a6ff' },
                    { label: 'Molasses Plan', data: data.delivery.map(d => d.molSchedule), backgroundColor: 'rgba(240, 192, 0, 0.4)' },
                    { label: 'Molasses Actual', data: data.delivery.map(d => d.molActual), backgroundColor: '#f0c000' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // Chart Balance
    clearChart('chartGrafikBalance');
    const ctxBal = getCtxSafe('chartGrafikBalance');
    if (ctxBal) {
        chartInstances['chartGrafikBalance'] = new Chart(ctxBal, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Balance Gula (GKP)', data: data.tren.map(d => d.gulaEndBalance), borderColor: '#bc8cff', backgroundColor: 'rgba(188,140,255,0.1)', fill: true, tension: 0.3 },
                    { label: 'Balance Molasses', data: data.tren.map(d => d.molassesEndBalance), borderColor: '#ff7b72', backgroundColor: 'rgba(255,123,114,0.1)', fill: true, tension: 0.3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}


// Init
document.addEventListener('DOMContentLoaded', () => {
    initOverviewControls();
    initDates();
    fetchRmiData();
});

// Update event listener for tabs to handle custom actions
document.querySelectorAll('#rmiNav li[data-tab]').forEach(li => {
    li.addEventListener('click', function () {
        const tabId = this.getAttribute('data-tab');

        // Show/hide date picker for Laporan Harian
        if (tabId === 'laporan-harian') {
            document.getElementById('datePickerContainer').style.display = 'block';
            const lhDate = document.getElementById('laporanDate').value;
            if (lhDate && typeof currentLhDate !== 'undefined') {
                const parsedDate = new Date(lhDate + 'T00:00:00');
                if (!isNaN(parsedDate.getTime())) {
                    currentLhDate = parsedDate;
                }
            }
            if (typeof updateLhDateDisplay === 'function') {
                updateLhDateDisplay();
            } else if (typeof fetchLaporanHarian === 'function') {
                fetchLaporanHarian();
            }
        } else {
            document.getElementById('datePickerContainer').style.display = 'none';
        }

        if (tabId === 'grafik-analitik') {
            fetchGrafikAnalitik();
        }
    });
});
