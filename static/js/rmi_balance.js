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
            upgrade: 0.00,
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

        if (tabId === 'stok') fetchStockHistory();
        if (tabId === 'delivery') fetchDeliveryHistory();
        if (tabId === 'lokasi') fetchWarehouseStock();
        if (tabId === 'audit') fetchRmiAudit();

    });
});

// Fetch all data
async function fetchRmiData() {
    await fetchOverviewData();

    const results = await Promise.allSettled([
        fetch('/api/rmi-balance/stok-harian').then(r => r.json()),
        fetch('/api/rmi-balance/delivery-harian').then(r => r.json()),
        fetch('/api/rmi-balance/molasses-harian').then(r => r.json())
    ]);
    const [stokResult, deliveryResult, molassesResult] = results;
    const stok = stokResult.status === 'fulfilled' ? stokResult.value : null;
    const delivery = deliveryResult.status === 'fulfilled' ? deliveryResult.value : null;
    const molasses = molassesResult.status === 'fulfilled' ? molassesResult.value : null;

    if (stok && stok.status === 'success') {
        renderChartStok(stok.data, 'chartFullStok');
        renderStockHistoryTable(stok.data);
        renderStockHistoryKpis(stok.data);
    }
    if (delivery && delivery.status === 'success') {
        renderChartDelivery(delivery.data, 'chartFullDelivery');
        renderChartDeliveryMolasses(delivery.data, 'chartDeliveryMolasses');
        renderDeliveryHistoryTable(delivery.data);
        renderDeliveryHistoryKpis(delivery.data);
    }
    if (molasses && molasses.status === 'success') {
        renderChartMolasses(molasses.data, 'chartFullMolasses');
    }
}
window.fetchRmiData = fetchRmiData;

async function fetchOverviewData() {
    const dateValue = document.getElementById('laporanDate')?.value;
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
            showOverviewFallback(`API overview-v2 gagal dimuat (${err.message}). Coba refresh atau login ulang.`);
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

// Molasses: DB kg / 1000 → butuh >2 desimal agar tidak ada pembulatan
function formatTonPrecise(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + ' ton';
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
        const lastUpdate = formatDateTimeIndo(report.data_updated_at || report.last_update);
        setOverviewText('overview-last-update', lastUpdate);
        setOverviewText('header-last-update', lastUpdate);
        setOverviewText('overview-source', report.source || 'Input DB');
        applyOverviewStatus('overview-report-status', report.status);
        applyOverviewStatus('overview-balance-status', report.balance_status);
        applyOverviewStatus('overview-operational-status', report.operational_status || 'balanced');
        const balanceBadge = document.getElementById('overview-balance-status');
        if (balanceBadge) balanceBadge.textContent = 'Balance: ' + overviewStatusLabel(String(report.balance_status || 'draft').toLowerCase());
        const operationalBadge = document.getElementById('overview-operational-status');
        if (operationalBadge) operationalBadge.textContent = 'Operasional: ' + overviewStatusLabel(String(report.operational_status || 'balanced').toLowerCase());

        const datePicker = document.getElementById('laporanDate');
        // ponytail: jangan timpa pilihan user; hanya isi saat kosong (load awal)
        if (datePicker && data.date && !datePicker.value) datePicker.value = data.date;

        const errorEl = document.getElementById('overview-error');
        if (errorEl) errorEl.style.display = 'none';

        renderOverviewKpiCards(data.sugar.kpi || {});
        renderOverviewBalanceCard(data.sugar.balance || {});
        renderOverviewCompositionCard(data.sugar.composition || [], data.sugar.kpi?.total_stock || 0);
        renderOverviewStockPositionCard(data.sugar.stock_position || {});
        renderOverviewValidationCard(data.sugar.validation || []);
        renderOverviewCharts(data.sugar.trend || {});
        renderOverviewOtherSummary(data.molasses || {}, data.cane || {}, data.sugar.reject_balance || {});
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
        { label: 'Total Stock Gula', value: formatTon(kpi.total_stock), sub: 'GKM + GKB + Reject', cls: 'hero' },
        { label: 'GKM', value: formatTon(kpi.gkm), sub: 'Gula merah', cls: 'flat' },
        { label: 'GKB', value: formatTon(kpi.gkb), sub: 'Gula biru', cls: 'flat' },
        { label: 'Reject', value: formatTon(kpi.reject), sub: 'Reject stock', cls: 'flat' },
        { label: 'Delivery Gap', value: formatTon(kpi.delivery_gap), sub: 'Actual - Plan', cls: "operational " + overviewSignedClass(gap) },
        { label: 'Warehouse Utilization', value: formatPercent(util), sub: 'Stock / capacity', cls: 'operational', progress: util }
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
        ['Reject Received <small>(informasi)</small>', formatTon(balance.received_reject)],
        ['- Delivery GKM', formatTon(balance.delivery_gkm)],
        ['- Delivery GKB', formatTon(balance.delivery_gkb)],
        ['- Reject Deduction (Delivery)', formatTon(balance.delivery_reject ?? balance.reject_deduction)],
        ['+ Upgrade Reject Total', formatTon(balance.upgrade)],
        ['&rarr; Upgrade GKM', formatTon(balance.upgrade_gkm)],
        ['&rarr; Upgrade GKB', formatTon(balance.upgrade_gkb)],
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

function renderOverviewOtherSummary(molasses, cane, reject) {
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
                <div class="overview-summary-row"><span class="overview-summary-label">Tank A</span><span class="overview-summary-value">${formatTonPrecise(molasses.tank_a)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Tank B</span><span class="overview-summary-value">${formatTonPrecise(molasses.tank_b)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Total Molasses</span><span class="overview-summary-value">${formatTonPrecise(molasses.total_stock)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Utilization</span><span class="overview-summary-value">${formatPercent(molasses.utilization_percent)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Delivery Plan / Actual</span><span class="overview-summary-value">${formatTonPrecise(molasses.delivery_plan)} / ${formatTonPrecise(molasses.delivery_actual)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Delivery Gap</span><span class="overview-summary-value">${formatTonPrecise(molasses.delivery_gap)}</span></div>
                <div class="overview-card-subtitle">Sumber Excel/DB kg; ditampilkan dalam ton tanpa pembulatan nilai sumber.</div>
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
                <div class="overview-summary-row"><span class="overview-summary-label">Cane Netto in Day</span><span class="overview-summary-value">${formatTonPrecise(cane.cane_tebu_today)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Ritase in Day</span><span class="overview-summary-value">${fmt(cane.cane_ritase)} truck</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Cane Netto to Date</span><span class="overview-summary-value">${formatTonPrecise(cane.cane_netto_to_date)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Ritase to Date</span><span class="overview-summary-value">${fmt(cane.cane_ritase_to_date)} truck</span></div>
            </div>
        </section>
        <section class="overview-card">
            <div class="overview-card-header">
                <div>
                    <h3 class="overview-card-title">Reject Balance</h3>
                    <div class="overview-card-subtitle">Reject received tidak mengurangi good stock</div>
                </div>
                ${getOverviewStatusBadge(reject.status || 'warning')}
            </div>
            <div class="overview-card-body overview-summary-list">
                <div class="overview-summary-row"><span class="overview-summary-label">Opening Reject</span><span class="overview-summary-value">${formatTon(reject.opening)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Received</span><span class="overview-summary-value">${formatTon(reject.received)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Delivery Reject</span><span class="overview-summary-value">${formatTon(reject.delivery)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Upgrade / Remelt</span><span class="overview-summary-value">${formatTon(reject.upgrade)} / ${formatTon(reject.remelt)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Calculated / Actual</span><span class="overview-summary-value">${formatTon(reject.calculated)} / ${formatTon(reject.actual)}</span></div>
                <div class="overview-summary-row"><span class="overview-summary-label">Difference</span><span class="overview-summary-value">${formatTon(reject.difference)}</span></div>
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

// === Stok & Delivery History (tab Stock Perday / Delivery Plan) ===
async function fetchStockHistory() {
    const startDate = document.getElementById('stockHistoryStart')?.value || '';
    const endDate = document.getElementById('stockHistoryEnd')?.value || '';
    const body = document.getElementById('stockHistoryBody');
    try {
        const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
        const res = await fetch(`/api/rmi-balance/stok-harian?${params}`);
        const payload = await res.json();
        if (payload.status !== 'success') throw new Error(payload.message || 'API error');
        const data = Array.isArray(payload.data) ? payload.data : [];
        renderStockHistoryTable(data);
        renderStockHistoryKpis(data);
        renderChartStok(data, 'chartFullStok');
    } catch (err) {
        console.error('fetchStockHistory failed:', err);
        if (body) body.innerHTML = `<tr><td colspan="5">Gagal memuat data: ${err.message}</td></tr>`;
    }
}
window.fetchStockHistory = fetchStockHistory;

async function fetchDeliveryHistory() {
    const startDate = document.getElementById('deliveryHistoryStart')?.value || '';
    const endInput = document.getElementById('deliveryHistoryEnd');
    const endDate = endInput?.value || document.getElementById('laporanDate')?.value || '';
    if (endInput && !endInput.value) endInput.value = endDate;
    const body = document.getElementById('deliveryHistoryBody');
    try {
        const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
        const res = await fetch(`/api/rmi-balance/delivery-harian?${params}`);
        const payload = await res.json();
        if (payload.status !== 'success') throw new Error(payload.message || 'API error');
        const data = Array.isArray(payload.data) ? payload.data : [];
        renderDeliveryHistoryTable(data);
        renderDeliveryHistoryKpis(data);
        renderChartDelivery(data, 'chartFullDelivery');
        renderChartDeliveryMolasses(data, 'chartDeliveryMolasses');
    } catch (err) {
        console.error('fetchDeliveryHistory failed:', err);
        if (body) body.innerHTML = `<tr><td colspan="5">Gagal memuat data: ${err.message}</td></tr>`;
    }
}
window.fetchDeliveryHistory = fetchDeliveryHistory;

function renderStockHistoryTable(data) {
    const body = document.getElementById('stockHistoryBody');
    if (!body) return;
    if (!data.length) { body.innerHTML = '<tr><td colspan="5">Tidak ada data</td></tr>'; return; }
    const latest = data.slice(-10).reverse();
    body.innerHTML = latest.map(d => {
        const gkm = parseFloat(d.gkm) || 0;
        const gkb = parseFloat(d.gkb) || 0;
        const reject = parseFloat(d.reject) || 0;
        const total = parseFloat(d.total_stok) || (gkm + gkb);
        return `<tr><td>${formatDateIndo(d.tanggal)}</td><td>${fmt(gkm)}</td><td>${fmt(gkb)}</td><td>${fmt(reject)}</td><td>${fmt(total)}</td></tr>`;
    }).join('');
}

function renderStockHistoryKpis(data) {
    const wrap = document.getElementById('stockHistoryKpis');
    if (!wrap) return;
    if (!data.length) { wrap.innerHTML = ''; return; }
    const last = data[data.length - 1];
    const gkm = parseFloat(last.gkm) || 0;
    const gkb = parseFloat(last.gkb) || 0;
    const reject = parseFloat(last.reject) || 0;
    const total = parseFloat(last.total_stok) || (gkm + gkb);
    wrap.innerHTML = [
        { label: 'Total Stok', value: fmt(total) + ' ton' },
        { label: 'GKM', value: fmt(gkm) + ' ton' },
        { label: 'GKB', value: fmt(gkb) + ' ton' },
        { label: 'Reject', value: fmt(reject) + ' ton' }
    ].map(k => `<div class="history-kpi"><span>${k.label}</span><strong>${k.value}</strong></div>`).join('');
}

function renderDeliveryHistoryTable(data) {
    const body = document.getElementById('deliveryHistoryBody');
    if (!body) return;
    if (!data.length) { body.innerHTML = '<tr><td colspan="8">Tidak ada data</td></tr>'; return; }
    const latest = data.slice(-10).reverse();
    body.innerHTML = latest.map(d => {
        const plan = parseFloat(d.plan) || 0;
        const actual = parseFloat(d.actual) || 0;
        const gap = actual - plan;
        const pct = plan ? (actual / plan * 100) : 0;
        const mPlan = parseFloat(d.mol_plan) || 0;
        const mActual = parseFloat(d.mol_actual) || 0;
        const mGap = mActual - mPlan;
        return `<tr>
            <td>${formatDateIndo(d.tanggal)}</td>
            <td>${fmt(plan)}</td><td>${fmt(actual)}</td><td>${fmt(gap)}</td><td>${pct.toFixed(1)}%</td>
            <td>${fmt(mPlan)}</td><td>${fmt(mActual)}</td><td>${fmt(mGap)}</td>
        </tr>`;
    }).join('');
}

function renderDeliveryHistoryKpis(data) {
    const wrap = document.getElementById('deliveryHistoryKpis');
    if (!wrap) return;
    if (!data.length) { wrap.innerHTML = ''; return; }
    const sum = k => data.reduce((s, d) => s + (parseFloat(d[k]) || 0), 0);
    const sumPlan = sum('plan'), sumActual = sum('actual');
    const sumMolPlan = sum('mol_plan'), sumMolActual = sum('mol_actual');
    const pct = sumPlan ? (sumActual / sumPlan * 100) : 0;
    wrap.innerHTML = [
        { label: 'Gula Plan', value: fmt(sumPlan) + ' ton' },
        { label: 'Gula Actual', value: fmt(sumActual) + ' ton' },
        { label: 'Realisasi Gula', value: pct.toFixed(1) + '%' },
        { label: 'Molasses Plan', value: fmt(sumMolPlan) + ' ton' },
        { label: 'Molasses Actual', value: fmt(sumMolActual) + ' ton' }
    ].map(k => `<div class="history-kpi"><span>${k.label}</span><strong>${k.value}</strong></div>`).join('');
}

// Delivery Molasses: Plan vs Actual (bar)
function renderChartDeliveryMolasses(data, canvasId) {
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    const labels = data.map(d => {
        const dt = new Date(d.tanggal);
        return `${dt.getDate()}/${dt.getMonth() + 1}`;
    });
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Plan (MT)', data: data.map(d => parseFloat(d.mol_plan) || 0), backgroundColor: 'rgba(210,153,34,0.55)' },
                { label: 'Actual (MT)', data: data.map(d => parseFloat(d.mol_actual) || 0), backgroundColor: '#d29922' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

async function fetchWarehouseStockData() {
    const startDate = document.getElementById('warehouseStockStart')?.value || '';
    const endDate = document.getElementById('warehouseStockEnd')?.value || '';
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    const res = await fetch(`/api/rmi-balance/lokasi?${params}`);
    const payload = await res.json();
    const data = payload.status === 'success' && Array.isArray(payload.data) ? payload.data : [];
    renderChartLokasi(data, 'chartFullLokasi');
    const latestDate = data.length ? data[data.length - 1].tanggal : null;
    const latest = data.filter(row => row.tanggal === latestDate);
    const total = latest.reduce((sum, row) => sum + (parseFloat(row.stok_akhir) || 0), 0);
    const top = latest.reduce((best, row) => (parseFloat(row.stok_akhir) || 0) > (parseFloat(best?.stok_akhir) || 0) ? row : best, null);
    const kpi = document.getElementById('warehouseStockKpis');
    if (kpi) kpi.innerHTML = `<div class="history-kpi"><span>Total Stock</span><strong>${fmt(total)} ton</strong></div><div class="history-kpi"><span>Gudang Terbesar</span><strong>${top?.nama_gudang || '-'}</strong></div><div class="history-kpi"><span>Tanggal Terakhir</span><strong>${latestDate || '-'}</strong></div>`;
}
window.fetchWarehouseStock = fetchWarehouseStockData;

// Chart 3: Stock Gudang (Line Chart)
function renderChartLokasi(data, canvasId) {
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    const dates = [...new Set(data.map(d => d.tanggal))];
    const warehouses = [...new Set(data.map(d => d.nama_gudang))];
    const colors = ['#58a6ff', '#bc8cff', '#3fb950', '#d29922', '#f85149', '#79c0ff', '#d2a8ff', '#56d364', '#ffa657', '#ff7b72', '#a5d6ff'];
    const datasets = warehouses.map((name, index) => ({
        label: name,
        data: dates.map(date => {
            const row = data.find(d => d.tanggal === date && d.nama_gudang === name);
            return row ? parseFloat(row.stok_akhir) || 0 : null;
        }),
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length],
        tension: 0.25,
        spanGaps: true,
        pointRadius: 2
    }));
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: { labels: dates, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Ton' } } }
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
            document.getElementById('inputCapMolassesA').value = res.data.molasses_tank_a_capacity ?? (res.data.molasses_capacity / 2);
            document.getElementById('inputCapMolassesB').value = res.data.molasses_tank_b_capacity ?? (res.data.molasses_capacity / 2);
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
    const molA = parseFloat(document.getElementById('inputCapMolassesA').value);
    const molB = parseFloat(document.getElementById('inputCapMolassesB').value);
    const millingStartDate = document.getElementById('inputMillingStartDate').value || null;

    if (!(gula > 0) || !(molA > 0) || !(molB > 0)) {
        alert("Kapasitas harus angka lebih dari 0.");
        btn.textContent = oriText;
        btn.disabled = false;
        return;
    }

    try {
        const res = await fetch('/api/rmi-balance/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gula_capacity: gula,
                molasses_tank_a_capacity: molA,
                molasses_tank_b_capacity: molB,
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
    const auditDateFrom = document.getElementById('auditDateFrom');
    const auditDateTo = document.getElementById('auditDateTo');

    if (laporanDate && !laporanDate.value) laporanDate.value = today;
    if (auditDateFrom && !auditDateFrom.value) auditDateFrom.value = firstDayStr;
    if (auditDateTo && !auditDateTo.value) auditDateTo.value = today;

    if (grafikDateFrom && !grafikDateFrom.value) grafikDateFrom.value = firstDayStr;
    if (grafikDateTo && !grafikDateTo.value) grafikDateTo.value = today;

    // Sync awal dari #laporanDate ke currentLhDate (dipakai tab Laporan Harian)
    if (laporanDate?.value && typeof currentLhDate !== 'undefined') {
        const parsed = new Date(laporanDate.value + 'T00:00:00');
        if (!isNaN(parsed.getTime())) currentLhDate = parsed;
    }

    laporanDate?.addEventListener('change', function () {
        if (this.value && typeof currentLhDate !== 'undefined') {
            const parsed = new Date(this.value + 'T00:00:00');
            if (!isNaN(parsed.getTime())) {
                currentLhDate = parsed;
                if (typeof updateLhDateDisplay === 'function'
                    && document.getElementById('tab-laporan-harian')?.classList.contains('active')) {
                    updateLhDateDisplay();
                }
            }
        }
    });
}

function initOverviewControls() {
    const datePicker = document.getElementById('laporanDate');
    if (datePicker) {
        datePicker.addEventListener('change', () => {
            fetchRmiData();
        });
    }

    // Sidebar nav: tampilkan/sembunyikan date picker & lazy-load tab
    document.querySelectorAll('#rmiNav li[data-tab]').forEach(li => {
        li.addEventListener('click', () => {
            const tabId = li.getAttribute('data-tab');
            const datePickerContainer = document.getElementById('datePickerContainer');
            if (datePickerContainer) {
                datePickerContainer.style.display = (tabId === 'laporan-harian' || tabId === 'overview') ? 'block' : 'none';
            }
            if (tabId === 'grafik-analitik') fetchGrafikAnalitik();
            if (tabId === 'molasses') fetchMolassesTanks();
        });
    });
}

let analyticsData = null;
let analyticsMetric = 'production';
let analyticsShiftMetric = 'gula';

function setAnalyticsMetric(metric) {
    analyticsMetric = metric;
    document.querySelectorAll('#analyticsMetrics button').forEach(b => {
        b.classList.toggle('active', b.dataset.metric === metric);
    });
    if (analyticsData) renderAnalyticsTrend(analyticsData);
}

function setAnalyticsShiftMetric(metric) {
    analyticsShiftMetric = metric;
    document.querySelectorAll('#shiftMetrics button').forEach(b => {
        b.classList.toggle('active', b.dataset.shiftMetric === metric);
    });
    if (analyticsData) renderAnalyticsShift(analyticsData.shiftPerformance || []);
}

async function fetchGrafikAnalitik() {
    const kpiGrid = document.getElementById('analyticsKpiGrid');
    const dateFromInput = document.getElementById('grafikDateFrom');
    const dateToInput = document.getElementById('grafikDateTo');
    const dateFrom = dateFromInput?.value;
    const dateTo = dateToInput?.value;

    dateFromInput?.setCustomValidity('');
    dateToInput?.setCustomValidity('');
    if (!dateFrom || !dateTo) {
        const missingInput = !dateFrom ? dateFromInput : dateToInput;
        missingInput?.setCustomValidity('Tanggal wajib diisi.');
        missingInput?.reportValidity();
        return;
    }
    if (dateFrom > dateTo) {
        dateFromInput?.setCustomValidity('Tanggal awal tidak boleh melewati tanggal akhir.');
        dateFromInput?.reportValidity();
        return;
    }

    if (kpiGrid) kpiGrid.innerHTML = '<div class="analytics-empty" style="grid-column:1/-1;">Memuat ringkasan analitik...</div>';
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });

    try {
        const response = await fetch(`/api/rmi-balance/grafik-analitik?${params.toString()}`);
        const res = await response.json();
        if (!response.ok) throw new Error(res.message || 'Permintaan analitik gagal');
        if (res.status !== 'success') throw new Error(res.message || 'Respons API tidak valid');
        analyticsData = res.data;
        renderGrafikAnalitik(analyticsData);
    } catch (err) {
        console.error('Failed to fetch Grafik Analitik:', err);
        if (kpiGrid) kpiGrid.innerHTML = '<div class="analytics-empty" style="grid-column:1/-1;"><i class="fa-solid fa-circle-exclamation"></i> Gagal memuat analitik.</div>';
    }
}

function analyticsNumber(value, decimals = 1) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function analyticsDateLabel(value) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function renderGrafikAnalitik(data) {
    renderAnalyticsKpis(data.kpi || {});
    renderAnalyticsTrend(data);
    renderAnalyticsShift(data.shiftPerformance || []);
    renderAnalyticsInsights(data.insights || []);
}

function renderAnalyticsKpis(kpi) {
    const grid = document.getElementById('analyticsKpiGrid');
    if (!grid) return;
    const stockChange = Number(kpi.stockChangeGula || 0);
    const stockSign = stockChange > 0 ? '+' : '';
    const cards = [
        ['Rata-rata Produksi Gula', `${analyticsNumber(kpi.avgGulaPerDay)} MT`, `${analyticsNumber(kpi.totalGula)} MT total`],
        ['Rata-rata Cane-In', `${analyticsNumber(kpi.avgCanePerDay)} MT`, `${analyticsNumber(kpi.totalCane)} MT total`],
        ['Yield Gula', kpi.avgYieldGula == null ? '—' : `${analyticsNumber(kpi.avgYieldGula, 2)}%`, 'Produksi gula / cane-in'],
        ['Yield Molasses', kpi.avgYieldMolasses == null ? '—' : `${analyticsNumber(kpi.avgYieldMolasses, 2)}%`, 'Molasses masuk / cane-in'],
        ['Perubahan Stok Gula', `${stockSign}${analyticsNumber(stockChange)} MT`, `${kpi.daysWithData || 0} hari data`],
    ];
    grid.innerHTML = cards.map(([label, value, note]) => `
        <div class="analytics-kpi">
            <span class="analytics-kpi-label">${label}</span>
            <strong class="analytics-kpi-value">${value}</strong>
            <span class="analytics-kpi-note">${note}</span>
        </div>`).join('');
}

function renderAnalyticsTrend(data) {
    const metricSets = {
        production: {
            unit: 'MT',
            datasets: [
                ['Cane-In', 'cane', '#f0c000'], ['GKM', 'gkm', '#58a6ff'],
                ['GKB', 'gkb', '#bc8cff'], ['Molasses', 'molasses', '#3fb950']
            ]
        },
        yield: {
            unit: '%',
            datasets: [['Yield Gula', 'yieldGula', '#58a6ff'], ['Yield Molasses', 'yieldMolasses', '#3fb950']]
        },
        stock: {
            unit: 'MT',
            datasets: [['Stok Gula', 'stockGula', '#58a6ff'], ['Stok Molasses', 'stockMolasses', '#3fb950']]
        }
    };
    const selected = metricSets[analyticsMetric] || metricSets.production;
    clearChart('chartAnalyticsTrend');
    const ctx = getCtxSafe('chartAnalyticsTrend');
    if (!ctx) return;
    chartInstances.chartAnalyticsTrend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.chartLabels ? data.chartLabels.map(l => analyticsDateLabel(l)) : [],
            datasets: selected.datasets.map(([label, key, color]) => ({
                label,
                data: data.chartData?.[key] || [],
                borderColor: color,
                backgroundColor: color.replace(')', ', .1)').replace('rgb', 'rgba'),
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                tension: 0.3,
                fill: false
            }))
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderAnalyticsShift(shifts) {
    const canvasId = 'chartAnalyticsShift';
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    const metricConf = {
        gula:     { label: 'Produksi Gula (MT)', unit: 'MT', color: '#58a6ff' },
        cane:     { label: 'Cane-In (MT)',       unit: 'MT', color: '#f0c000' },
        molasses: { label: 'Molasses (MT)',      unit: 'MT', color: '#3fb950' },
        yieldGula:{ label: 'Yield Gula (%)',     unit: '%',  color: '#bc8cff' }
    };
    const conf = metricConf[analyticsShiftMetric] || metricConf.gula;
    const labels = shifts.map(row => `Shift ${row.shift}`);
    const values = shifts.map(row => Number(row[analyticsShiftMetric]) || 0);
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: conf.label,
                data: values,
                backgroundColor: values.map((_, i) => ['#58a6ff', '#3fb950', '#f0c000', '#bc8cff'][i % 4]),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => `${conf.label}: ${analyticsNumber(c.parsed.y)} ${conf.unit}` } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => analyticsNumber(v, 0) + ' ' + conf.unit } }
            }
        }
    });
}

function renderAnalyticsInsights(insights) {
    const container = document.getElementById('analyticsInsights');
    if (!container) return;
    container.innerHTML = insights.map(item => `
        <div class="insight-item">
            <i class="fa-solid fa-lightbulb"></i>
            <div>
                <strong>${item.title}</strong>
                <p>${item.description}</p>
            </div>
        </div>
    `).join('') || '<div class="analytics-empty">Tidak ada insight untuk periode ini.</div>';
}

async function fetchMolassesTanks(existingData = null) {
    try {
        const molStartInput = document.getElementById('molassesStartDate');
        const molDateInput = document.getElementById('molassesDate');
        const startDate = molStartInput?.value || '';
        const selectedDate = molDateInput?.value || '';
        if (startDate && selectedDate && startDate > selectedDate) {
            molStartInput.setCustomValidity('Dari Tanggal tidak boleh melewati S.d. Tanggal.');
            molStartInput.reportValidity();
            return;
        }
        molStartInput?.setCustomValidity('');
        const rangeParams = new URLSearchParams();
        if (startDate) rangeParams.set('start_date', startDate);
        if (selectedDate) rangeParams.set('date', selectedDate);
        const [stockRes, settingsRes] = await Promise.all([
            existingData ? Promise.resolve({ status: 'success', data: existingData }) : fetch(`/api/rmi-balance/molasses-harian?${rangeParams.toString()}`).then(r => r.json()),
            fetch('/api/rmi-balance/settings').then(r => r.json())
        ]);
        if (stockRes.status !== 'success' || settingsRes.status !== 'success') throw new Error('Data tangki tidak tersedia');
        const rows = stockRes.data || [];
        const eligible = (startDate || selectedDate)
            ? rows.filter(row => {
                const d = new Date(row.tanggal);
                if(isNaN(d)) return true;
                const rowDate = d.toISOString().split('T')[0];
                return (!startDate || rowDate >= startDate) && (!selectedDate || rowDate <= selectedDate);
            })
            : rows;
        const settings = Array.isArray(settingsRes.data) ? settingsRes.data[0] : settingsRes.data;
        renderMolassesTanks(eligible.at(-1), settings || {});
        renderMolassesTrend(eligible);
    } catch (error) {
        console.error('Failed to fetch molasses tanks:', error);
        const molTankDate = document.getElementById('molTankDate');
        if (molTankDate) molTankDate.textContent = 'Gagal memuat posisi tangki';
    }
}

function renderMolassesTanks(row, settings) {
    const dateEl = document.getElementById('molTankDate');
    if (dateEl) {
        if (!row) {
            dateEl.textContent = 'Belum ada data';
            return;
        }
        const dt = new Date(row.tanggal);
        dateEl.textContent = `Posisi: ${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
    }

    const tanks = [
        ['A', Number(row?.tank_a || 0), Number(settings?.molasses_tank_a_capacity || 0), Number(row?.suhu_tanka || 0)],
        ['B', Number(row?.tank_b || 0), Number(settings?.molasses_tank_b_capacity || 0), Number(row?.suhu_tankb || 0)]
    ];

    tanks.forEach(([id, stock, capacity, suhu]) => {
        const percentRaw = capacity > 0 ? (stock / capacity) * 100 : 0;
        const percent = Math.min(Math.max(percentRaw, 0), 100);
        
        const liqEl = document.getElementById(`molTankLiquid${id}`);
        const pctEl = document.getElementById(`molTankPercent${id}`);
        const statEl = document.getElementById(`molTankStats${id}`);
        const suhuVessel = document.getElementById(`molTankSuhu${id}`);
        const suhuBadge = document.getElementById(`molSuhuBadge${id}`);
        
        if (liqEl) liqEl.style.height = `${percent}%`;
        if (pctEl) {
            const pctValEl = pctEl.querySelector('.pct-val');
            if (pctValEl) pctValEl.textContent = `${percentRaw.toFixed(1)}%`;
        }
        const suhuStr = suhu > 0 ? `${suhu.toFixed(1)} °C` : '-- °C';
        if (suhuVessel) suhuVessel.textContent = suhuStr;
        if (suhuBadge) suhuBadge.textContent = suhuStr;
        if (statEl) statEl.innerHTML = `
            <div class="mol-tank-stat"><span>Stok Akhir</span><strong>${stock.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 5 })} MT</strong></div>
            <div class="mol-tank-stat"><span>Kapasitas</span><strong>${capacity.toLocaleString('id-ID')} MT</strong></div>
            <div class="mol-tank-stat"><span>Terisi</span><strong>${percentRaw.toFixed(1)}%</strong></div>`;
    });
}

function renderMolassesTrend(data) {
    const canvasId = 'chartMolassesTrend';
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx || !data.length) return;
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(row => analyticsDateLabel(String(row.tanggal).slice(0, 10))),
            datasets: [
                { label: 'Tangki A', data: data.map(row => Number(row.tank_a || 0)), borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,.08)', tension: .3, pointRadius: 3 },
                { label: 'Tangki B', data: data.map(row => Number(row.tank_b || 0)), borderColor: '#bc8cff', backgroundColor: 'rgba(188,140,255,.08)', tension: .3, pointRadius: 3 },
                { label: 'Total A+B', data: data.map(row => Number(row.tank_a || 0) + Number(row.tank_b || 0)), borderColor: '#3fb950', backgroundColor: 'rgba(63,185,80,.1)', fill: true, tension: .3, borderWidth: 2.5, pointRadius: 3 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: { callbacks: { label: context => context.dataset.label + ': ' + analyticsNumber(context.parsed.y) + ' MT' } } },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: false, ticks: { callback: value => analyticsNumber(value, 0) + ' MT' } }
            }
        }
    });

    renderSuhuChart('chartSuhuA', data, 'suhu_tanka', 'Suhu Tangki A', '#ffb84d');
    renderSuhuChart('chartSuhuB', data, 'suhu_tankb', 'Suhu Tangki B', '#ff7f50');
}

function renderSuhuChart(canvasId, data, field, label, color) {
    clearChart(canvasId);
    const ctx = getCtxSafe(canvasId);
    if (!ctx) return;
    const values = data.map(row => {
        const v = Number(row[field]);
        return (isNaN(v) || v === 0) ? null : v;
    });
    const hasData = values.some(v => v !== null);
    if (!hasData) {
        const wrap = document.getElementById(canvasId)?.parentElement;
        if (wrap) {
            const empty = wrap.querySelector('.mol-tank-chart-empty');
            if (!empty) {
                wrap.insertAdjacentHTML('beforeend', '<div class="mol-tank-chart-empty">Belum ada data suhu</div>');
            }
        }
        return;
    }
    const emptyEl = document.getElementById(canvasId)?.parentElement?.querySelector('.mol-tank-chart-empty');
    if (emptyEl) emptyEl.remove();
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(row => analyticsDateLabel(String(row.tanggal).slice(0, 10))),
            datasets: [{
                label,
                data: values,
                borderColor: color,
                backgroundColor: color + '1f',
                tension: .35,
                pointRadius: 3,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { bottom: 8 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ctx.parsed.y !== null ? `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} °C` : null } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7, padding: 6, font: { size: 10 } } },
                y: { ticks: { callback: v => v + ' °C', font: { size: 10 } } }
            }
        }
    });
}

async function fetchRmiAudit(useMovementDate = false) {
    const dateFrom = document.getElementById('auditDateFrom')?.value;
    const dateTo = document.getElementById('auditDateTo')?.value;
    const product = document.getElementById('auditProduct')?.value;
    const movementDate = document.getElementById('auditMovementDate')?.value;
    if (!dateFrom || !dateTo) return;
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (product) params.set('product_code', product);
    if (useMovementDate && movementDate) params.set('movement_date', movementDate);
    try {
        const response = await fetch(`/api/rmi-balance/audit?${params}`);
        const payload = await response.json();
        if (!response.ok || payload.status !== 'success') throw new Error(payload.message || 'Audit gagal dimuat');
        renderRmiAudit(payload.data);
    } catch (error) {
        const kpis = document.getElementById('auditKpis');
        if (kpis) kpis.innerHTML = `<div class="analytics-empty">${error.message}</div>`;
    }
}

function renderRmiAudit(data) {
    const ton = value => value == null ? '—' : `${analyticsNumber(value, 2)} MT`;
    const pct = value => value == null ? '—' : `${analyticsNumber(value, 2)}%`;
    const badge = status => `<span class="overview-status-badge ${status}">${status}</span>`;
    const reconciliations = data.molasses || [];
    const sugar = data.sugar || [];
    const sugarChecks = sugar.flatMap(row => ['gkp', 'gkm', 'gkb'].map(product => row[product])).filter(Boolean);
    const yieldData = data.yield || {};
    const yieldDaily = yieldData.daily || [];
    const yieldShift = yieldData.shift || [];
    const mismatch = reconciliations.filter(row => row.status === 'mismatch').length
        + sugarChecks.filter(row => row.status === 'mismatch').length;
    const missing = reconciliations.filter(row => row.status === 'missing_input').length
        + sugarChecks.filter(row => row.status === 'missing_input').length;
    const todate = yieldData.todate || {};
    document.getElementById('auditKpis').innerHTML = [
        ['Movement', (data.movements || []).length], ['Mismatch', mismatch], ['Missing Input', missing],
        ['Yield Molasses', pct(yieldData.cumulative?.yield_percent)], ['Yield GKP', pct(yieldData.cumulative?.yield_gkp_percent)],
        ['Yield Molasses Todate', pct(todate.yield_percent)], ['Yield GKP Todate', pct(todate.yield_gkp_percent)]
    ].map(([label, value]) => `<div class="analytics-kpi"><span class="analytics-kpi-label">${label}</span><strong class="analytics-kpi-value">${value}</strong></div>`).join('');
    const todateLabel = document.getElementById('auditYieldTodateLabel');
    if (todateLabel) todateLabel.textContent = todate.from ? `Todate sejak awal giling ${todate.from} s.d. ${todate.to}: Molasses ${pct(todate.yield_percent)}, GKP ${pct(todate.yield_gkp_percent)}.` : 'Tanggal awal giling belum diatur di Setting.';
    document.getElementById('auditMolassesBody').innerHTML = reconciliations.map(row => `<tr><td>${row.tanggal}</td><td>${ton(row.opening)}</td><td>${ton(row.inbound)}</td><td>${ton(row.outbound)}</td><td>${ton(row.calculated_closing)}</td><td>${ton(row.actual_closing)}</td><td>${badge(row.status)}</td></tr>`).join('') || '<tr><td colspan="7">Tidak ada data</td></tr>';
    document.getElementById('auditYieldDailyBody').innerHTML = yieldDaily.map(row => `<tr><td>${String(row.tanggal).slice(0, 10)}</td><td>${ton(row.cane_in)}</td><td>${ton(row.molasses_in)}</td><td>${pct(row.yield_percent)}</td><td>${ton(row.gkp_in)}</td><td>${pct(row.yield_gkp_percent)}</td><td>${badge(row.status)}</td></tr>`).join('') || '<tr><td colspan="7">Tidak ada data</td></tr>';
    document.getElementById('auditYieldShiftBody').innerHTML = yieldShift.map(row => `<tr><td>${String(row.tanggal).slice(0, 10)}</td><td>${row.shift}</td><td>${ton(row.cane_in)}</td><td>${ton(row.molasses_in)}</td><td>${pct(row.yield_percent)}</td><td>${badge(row.status)}</td></tr>`).join('') || '<tr><td colspan="6">Tidak ada data</td></tr>';

    document.getElementById('auditGkpBody').innerHTML = sugar.map(row => { const item = row.gkp; return `<tr><td>${String(row.tanggal).slice(0, 10)}</td><td>${ton(item.opening)}</td><td>${ton(item.production)}</td><td>${ton(item.delivery)}</td><td>${ton(item.repack)}</td><td>${ton(item.upgrade)}</td><td>${ton(item.calculated_closing)}</td><td>${ton(item.actual_closing)}</td><td>${ton(item.difference)}</td><td>${badge(item.status)}</td></tr>`; }).join('') || '<tr><td colspan="10">Tidak ada data</td></tr>';
    document.getElementById('auditSugarBody').innerHTML = sugar.flatMap(row => ['gkm', 'gkb'].map(product => { const item = row[product]; return `<tr><td>${String(row.tanggal).slice(0, 10)}</td><td>${product.toUpperCase()}</td><td>${ton(item.opening)}</td><td>${ton(item.production)}</td><td>${ton(item.delivery)}</td><td>${ton(item.repack)}</td><td>${ton(item.upgrade)}</td><td>${ton(item.calculated_closing)}</td><td>${ton(item.actual_closing)}</td><td>${ton(item.difference)}</td><td>${badge(item.status)}</td></tr>`; })).join('') || '<tr><td colspan="11">Tidak ada data</td></tr>';
    document.getElementById('auditMovementBody').innerHTML = (data.movements || []).map(row => `<tr><td>${String(row.tanggal).slice(0, 10)}</td><td>${row.shift ?? '—'}</td><td>${row.product_code}</td><td>${row.movement_type}</td><td>${ton(row.quantity)}</td><td>${row.source_table}</td><td>${row.source_reference ?? '—'}</td></tr>`).join('') || '<tr><td colspan="7">Tidak ada data</td></tr>';
    const movementDateInput = document.getElementById('auditMovementDate');
    if (movementDateInput && data.movement_date) movementDateInput.value = data.movement_date;
    const movementLabel = document.getElementById('auditMovementDateLabel');
    if (movementLabel) movementLabel.textContent = data.movement_date ? `Menampilkan ${data.movement_date}.` : '';
}

document.addEventListener('DOMContentLoaded', () => {

    initDates();
    initOverviewControls();
    fetchRmiData();

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            const tabId = this.dataset.target;
            document.getElementById(`tab-${tabId}`)?.classList.add('active');
            const pageTitle = document.getElementById('pageTitle');
            if (pageTitle) pageTitle.textContent = this.textContent.trim();
            window.dispatchEvent(new Event('resize'));
            
            if (tabId === 'laporan-harian') {
                const datePickerContainer = document.getElementById('datePickerContainer');
                if (datePickerContainer) datePickerContainer.style.display = 'block';
                
                const lhDate = document.getElementById('laporanDate')?.value;
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
                const datePickerContainer = document.getElementById('datePickerContainer');
                if (datePickerContainer) datePickerContainer.style.display = 'none';
            }

            if (tabId === 'grafik-analitik') {
                fetchGrafikAnalitik();
            }
            if (tabId === 'molasses') {
                setTimeout(() => fetchMolassesTanks(), 50);
            }
        });
    });

    const grafikDateFrom = document.getElementById('grafikDateFrom');
    const grafikDateTo = document.getElementById('grafikDateTo');
    const syncGrafikRange = () => {
        if (grafikDateFrom && grafikDateTo) {
            grafikDateFrom.max = grafikDateTo.value || '';
            grafikDateTo.min = grafikDateFrom.value || '';
        }
        fetchGrafikAnalitik();
    };
    grafikDateFrom?.addEventListener('change', syncGrafikRange);
    grafikDateTo?.addEventListener('change', syncGrafikRange);
    if (grafikDateFrom && grafikDateTo) {
        grafikDateFrom.max = grafikDateTo.value || '';
        grafikDateTo.min = grafikDateFrom.value || '';
    }

    document.querySelectorAll('#analyticsMetrics button').forEach(b => {
        b.addEventListener('click', () => setAnalyticsMetric(b.dataset.metric));
    });

    document.querySelectorAll('#shiftMetrics button').forEach(b => {
        b.addEventListener('click', () => setAnalyticsShiftMetric(b.dataset.shiftMetric));
    });

    document.getElementById('deliveryHistoryDays')?.addEventListener('change', fetchDeliveryHistory);
    document.getElementById('stockHistoryDays')?.addEventListener('change', fetchStockHistory);
    const molStartEl = document.getElementById('molassesStartDate');
    const molDateEl = document.getElementById('molassesDate');
    if (molDateEl && !molDateEl.value) {
        molDateEl.value = document.getElementById('laporanDate')?.value || new Date().toISOString().split('T')[0];
    }
    if (molStartEl && !molStartEl.value) molStartEl.value = '2026-01-01';

    const syncMolassesRange = () => {
        if (molStartEl && molDateEl) {
            molStartEl.max = molDateEl.value || '';
            molDateEl.min = molStartEl.value || '';
        }
        fetchMolassesTanks();
    };
    molStartEl?.addEventListener('change', syncMolassesRange);
    molDateEl?.addEventListener('change', syncMolassesRange);
    if (molStartEl && molDateEl) {
        molStartEl.max = molDateEl.value || '';
        molDateEl.min = molStartEl.value || '';
    }
});

// Update the fetchRmiData to also fetch molasses tanks if possible
if (typeof fetchRmiData === 'function') {
    const originalFetchRmiData = fetchRmiData;
    fetchRmiData = async function() {
        await originalFetchRmiData();
        fetchMolassesTanks();
    };
}
