/* static/js/main.js
 * ─────────────────────────────────────────────────
 * App init: DOMContentLoaded + immediate calls.
 * Dipindahkan dari script.js baris 209-247, 2329-2330 tanpa perubahan logika.
 * HARUS DIMUAT TERAKHIR — semua fungsi sudah tersedia.
 * ───────────────────────────────────────────────── */

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('datePicker').value = currentDate;
    document.getElementById('datePicker').addEventListener('change', e => {
        currentDate = e.target.value;
        loadAll(true);
    });
    buildTransactionSubmenu();
    initNav();
    initSidebar();
    initTheme();
    loadUserInfo();
    initViewToggle();
    initModal();
    detectShift();
    startClock();
    checkHealth();
    loadAll();
    setInterval(() => loadAll(), REFRESH_MS);
    // Init trend filter dropdown
    const trendSel = document.getElementById('trendFilter');
    if (trendSel) trendSel.addEventListener('change', () => loadDashboardTrend(true));
    const trendAvgSel = document.getElementById('trendAvgFilter');
    if (trendAvgSel) trendAvgSel.addEventListener('change', () => loadDashboardAvgTrend(true));
    const trendTatSel = document.getElementById('trendTatFilter');
    if (trendTatSel) trendTatSel.addEventListener('change', () => loadDashboardTatTrend(true));
    document.getElementById('refreshBtn').addEventListener('click', () => {
        const b = document.getElementById('refreshBtn');
        b.classList.add('spinning');
        loadAll(true).then(() => setTimeout(() => b.classList.remove('spinning'), 500));
    });
    document.getElementById('btnExportExcel').addEventListener('click', () => {
        if (currentTxType) exportToExcel(currentTxType);
    });
    // Theme toggle button
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    // Neo Brutalism toggle button
    const neoBtn = document.getElementById('neoModeBtn');
    if (neoBtn) neoBtn.addEventListener('click', toggleNeoMode);
    // Sidebar logout mini button
    const logoutSm = document.getElementById('btnLogoutSm');
    if (logoutSm) logoutSm.addEventListener('click', () => { if (confirm('Yakin mau logout?')) logout(); });
});

// Panggil init
initReportButtons();
setTimeout(() => { initTebuV2(); }, 500);
