// static/js/rmi_balance.js

// Format number utility
function fmt(num) {
    if (num === null || num === undefined || isNaN(num)) return "0";
    return Number(num).toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

// Global chart instances
let chartInstances = {};

// Tab Navigation
document.querySelectorAll('#rmiNav li[data-tab]').forEach(li => {
    li.addEventListener('click', function() {
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
    try {
        const [overview, stok, delivery, molasses, lokasi] = await Promise.all([
            fetch('/api/rmi-balance/overview').then(r => r.json()),
            fetch('/api/rmi-balance/stok-harian').then(r => r.json()),
            fetch('/api/rmi-balance/delivery-harian').then(r => r.json()),
            fetch('/api/rmi-balance/molasses-harian').then(r => r.json()),
            fetch('/api/rmi-balance/lokasi').then(r => r.json())
        ]);
        
        if (overview.status === 'success') {
            renderOverview(overview.data, 
                           stok.status === 'success' ? stok.data : null,
                           delivery.status === 'success' ? delivery.data : null,
                           lokasi.status === 'success' ? lokasi.data : null);
        }
        if (stok.status === 'success') {
            renderChartStok(stok.data, 'chartFullStok');
        }
        if (delivery.status === 'success') {
            renderChartDelivery(delivery.data, 'chartFullDelivery');
        }
        if (molasses.status === 'success') {
            renderChartMolasses(molasses.data, 'chartFullMolasses');
        }
        if (lokasi.status === 'success') {
            renderChartLokasi(lokasi.data, 'chartFullLokasi');
        }
        
    } catch (err) {
        console.error("Failed to fetch RMI data:", err);
    }
}

// Render Overview Cards
function renderOverview(data, stokData, deliveryData, lokasiData) {
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
        if(badgeGula && barGula) {
            barGula.style.width = Math.min(utilGula, 100) + '%';
            if(utilGula < 15) {
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
        if(barMol) {
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
        if (data.delivery.defisit_ton < 0) {
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
            const maxStok = Math.max(...lokasiData.map(d => parseFloat(d.stok_akhir) || 0), 1);
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

    } catch(e) {
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
        return `${dt.getDate()}/${dt.getMonth()+1}`;
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
        return `${dt.getDate()}/${dt.getMonth()+1}`;
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
        return `${dt.getDate()}/${dt.getMonth()+1}`;
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
    
    try {
        const res = await fetch('/api/rmi-balance/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gula_capacity: gula, molasses_capacity: mol })
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

    document.getElementById('laporanDate').value = today;
    document.getElementById('grafikDateFrom').value = firstDayStr;
    document.getElementById('grafikDateTo').value = today;
    
    document.getElementById('laporanDate').addEventListener('change', function() {
        if (this.value) {
            currentLhDate = new Date(this.value + 'T00:00:00');
            if (typeof updateLhDateDisplay === 'function') {
                updateLhDateDisplay();
            }
        }
    });
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
        return `${dt.getDate()}/${dt.getMonth()+1}`;
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
                    const dt = new Date(d.tanggal); return `${dt.getDate()}/${dt.getMonth()+1}`;
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
                    { label: 'Balance Gula (GKP)', data: data.tren.map(d => d.gulaEndBalance), borderColor: '#bc8cff', backgroundColor: 'rgba(188,140,255,0.1)', fill:true, tension: 0.3 },
                    { label: 'Balance Molasses', data: data.tren.map(d => d.molassesEndBalance), borderColor: '#ff7b72', backgroundColor: 'rgba(255,123,114,0.1)', fill:true, tension: 0.3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}


// Init
document.addEventListener('DOMContentLoaded', () => {
    initDates();
    fetchRmiData();
});

// Update event listener for tabs to handle custom actions
document.querySelectorAll('#rmiNav li[data-tab]').forEach(li => {
    li.addEventListener('click', function() {
        const tabId = this.getAttribute('data-tab');
        
        // Show/hide date picker for Laporan Harian
        if(tabId === 'laporan-harian') {
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
        
        if(tabId === 'grafik-analitik') {
            fetchGrafikAnalitik();
        }
    });
});
