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
        
        if (overview.status === 'success') renderOverview(overview.data);
        if (stok.status === 'success') {
            renderChartStok(stok.data, 'chartOverviewGula');
            renderChartStok(stok.data, 'chartFullStok');
        }
        if (delivery.status === 'success') {
            renderChartDelivery(delivery.data, 'chartOverviewDelivery');
            renderChartDelivery(delivery.data, 'chartFullDelivery');
        }
        if (molasses.status === 'success') {
            renderChartMolasses(molasses.data, 'chartFullMolasses');
        }
        if (lokasi.status === 'success') {
            renderChartLokasi(lokasi.data, 'chartOverviewLokasi');
            renderChartLokasi(lokasi.data, 'chartFullLokasi');
        }
        
    } catch (err) {
        console.error("Failed to fetch RMI data:", err);
    }
}

// Render Overview Cards
function renderOverview(data) {
    // Gula
    document.getElementById('valGulaTotal').textContent = fmt(data.gula.total_ton);
    document.getElementById('capGula').textContent = fmt(data.gula.capacity);
    document.getElementById('valGulaUtil').textContent = fmt(data.gula.utilization_pct) + '%';
    
    const utilGula = data.gula.utilization_pct;
    const cardGula = document.getElementById('cardGulaUtil');
    cardGula.className = 'rmi-card';
    if (utilGula < 15) { cardGula.classList.add('danger'); }
    else if (utilGula < 25) { cardGula.classList.add('warning'); }
    else { cardGula.classList.add('success'); }
    
    // Delivery Deficit
    document.getElementById('valDelivery').textContent = fmt(data.delivery.defisit_ton);
    document.getElementById('subDelivery').textContent = `${fmt(data.delivery.defisit_pct)}% dari Plan (${fmt(data.delivery.plan_ton)} MT)`;
    const cardDel = document.getElementById('cardDelivery');
    cardDel.className = 'rmi-card';
    if (data.delivery.defisit_pct > 5) {
        cardDel.classList.add('danger');
        document.getElementById('valDelivery').style.color = '#f85149';
    } else {
        cardDel.classList.add('success');
        document.getElementById('valDelivery').style.color = '#3fb950';
    }
    
    // Molasses
    document.getElementById('valMolasses').textContent = fmt(data.molasses.total_ton);
    document.getElementById('capMolasses').textContent = fmt(data.molasses.capacity);
    document.getElementById('valMolassesUtil').textContent = fmt(data.molasses.utilization_pct);
}

// Destroy existing chart helper
function clearChart(canvasId) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
}

// Common Chart.js Defaults for Dark Theme
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
Chart.defaults.font.family = "'Inter', sans-serif";

// Chart 1: Stok GKP (Line Chart)
function renderChartStok(data, canvasId) {
    clearChart(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
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
    const ctx = document.getElementById(canvasId).getContext('2d');
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
    const ctx = document.getElementById(canvasId).getContext('2d');
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
    const ctx = document.getElementById(canvasId).getContext('2d');
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

// Init
document.addEventListener('DOMContentLoaded', fetchRmiData);
