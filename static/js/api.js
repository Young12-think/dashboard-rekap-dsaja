/* static/js/api.js
 * ─────────────────────────────────────────────────
 * Network layer: api(), apiPost(), checkHealth(), apiFetch(), loadAll()
 * Dipindahkan dari script.js baris 435-472, 2440-2444 tanpa perubahan logika.
 * ───────────────────────────────────────────────── */

// =============================================
// API
// =============================================
async function api(path) {
    try {
        const r = await fetch(`${API}${path}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } catch (e) { console.error(`[API] ${path}:`, e); return null; }
}

async function apiPost(path, body) {
    try {
        const r = await fetch(`${API}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await r.json();
    } catch (e) { console.error(`[API POST] ${path}:`, e); return null; }
}

async function checkHealth() {
    const el = document.getElementById('connectionStatus');
    const d = await api('/api/health');
    if (d && d.database === 'connected') {
        el.className = 'connection-status connected';
        el.querySelector('span').textContent = 'MySQL Connected';
    } else {
        el.className = 'connection-status disconnected';
        el.querySelector('span').textContent = d ? 'DB Disconnected' : 'Server Offline';
    }
}

async function apiFetch(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(r.status + ' API Error di ' + path);
  return r.json();
}

async function loadAll(showLoader = false) {
    if (showLoader) {
        const sc = document.getElementById('summaryCards');
        if (sc) sc.innerHTML = '<div style="padding:40px; text-align:center; width:100%; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px; font-family:var(--nb-mono);">Memuat data...</p></div>';
        const tbody = document.getElementById('productionTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-circle-notch fa-spin fa-2x"></i><p style="margin-top:10px; font-family:var(--nb-mono);">Sinkronisasi database...</p></td></tr>';
    }
    await Promise.all([loadSummary(), loadProduction(), loadDashboardTrend(showLoader), loadDashboardAvgTrend(showLoader), loadDashboardTatTrend(showLoader), loadPOMonitor(), loadReportLimbah(), loadReportTebu()]);
    if (currentPage === 'charts') {
        loadHistoryCharts();
    }
    checkHealth();
}
