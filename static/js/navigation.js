/* static/js/navigation.js
 * ─────────────────────────────────────────────────
 * Theme, sidebar, page navigation, clock, modal init.
 * Dipindahkan dari script.js baris 249-433 tanpa perubahan logika.
 * ───────────────────────────────────────────────── */

/* ---- Theme (Dark / Light) ---- */
function initTheme() {
    const saved = localStorage.getItem('rekap_theme') || 'dark';
    applyTheme(saved);
    // Restore neo mode
    if (localStorage.getItem('rekap_neo') === '1') enableNeoMode(false);
}

/* ---- Neo Brutalism Mode ---- */
function enableNeoMode(save = true) {
    document.body.classList.add('neo-mode');
    const btn = document.getElementById('neoModeBtn');
    if (btn) { btn.style.background = '#C9533A'; btn.style.color = '#fff'; btn.style.border = '2px solid #1A1A1A'; }
    if (save) localStorage.setItem('rekap_neo', '1');
}
function disableNeoMode(save = true) {
    document.body.classList.remove('neo-mode');
    const btn = document.getElementById('neoModeBtn');
    if (btn) { btn.style.background = ''; btn.style.color = ''; btn.style.border = ''; }
    if (save) localStorage.setItem('rekap_neo', '0');
}
function toggleNeoMode() {
    if (document.body.classList.contains('neo-mode')) disableNeoMode();
    else enableNeoMode();
}

function applyTheme(mode) {
    document.body.classList.toggle('light-mode', mode === 'light');
    localStorage.setItem('rekap_theme', mode);
    const icon = document.getElementById('themeIcon');
    if (!icon) return;
    if (mode === 'light') {
        icon.className = 'fa-solid fa-sun';
    } else {
        icon.className = 'fa-solid fa-moon';
    }
}

function toggleTheme() {
    const isLight = document.body.classList.contains('light-mode');
    applyTheme(isLight ? 'dark' : 'light');
}

/* ---- Load Active User Info ---- */
async function loadUserInfo() {
    try {
        const d = await api('/api/me');
        const el = document.getElementById('sidebarUsername');
        if (el && d && d.status === 'success') {
            el.textContent = d.username || '—';
        }
    } catch(_) {}
}

function initNav() {
    document.querySelectorAll('.sidebar-nav li[data-page]').forEach(li => {
        li.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            if (li.dataset.txtype) {
                // Reset semua filter state saat ganti jenis transaksi
                if (currentTxType !== li.dataset.txtype) {
                    currentLimbahFilter = '';
                    currentSupportVendor = '';
                    currentPOFilter = '';
                    lastBuiltTxType = null; // Force rebuild filters
                }
                currentTxType = li.dataset.txtype;
                txCurrentPage = 0;
            }
            switchPage(li.dataset.page);
            closeSidebar();
        });
    });
    document.querySelectorAll('.submenu-toggle').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            btn.closest('.has-submenu').classList.toggle('expanded');
        });
    });
}

function switchPage(page) {
    currentPage = page;
    document.querySelectorAll('.sidebar-nav > ul > li[data-page]').forEach(l =>
        l.classList.toggle('active', l.dataset.page === page));
    document.querySelectorAll('.submenu li[data-page]').forEach(l => {
        if (l.hasAttribute('data-txtype')) {
            l.classList.toggle('active', l.dataset.page === page && l.dataset.txtype === currentTxType);
        } else {
            l.classList.toggle('active', l.dataset.page === page);
        }
    });
    const txMenu = document.getElementById('transactionMenu');
    if (txMenu) txMenu.classList.toggle('parent-active', page === 'transactions');
    const reportMenu = document.getElementById('reportMenu');
    if (reportMenu) reportMenu.classList.toggle('parent-active', page.startsWith('report_'));

    document.querySelectorAll('.page').forEach(p =>
        p.classList.toggle('active', p.id === `page-${page}`));

    let title = 'Dashboard';
    if (page === 'dashboard') title = 'Dashboard Timbangan';
    else if (page === 'charts') title = 'Grafik & Analisis';
    else if (page === 'vendors') title = 'Detail Vendor';
    else if (page === 'transactions' && currentTxType) {
        title = `Transaksi ${TRANSACTION_TYPES[currentTxType]?.label || ''}`;
    }
    else if (page === 'report_daily') title = 'Report Daily';
    else if (page === 'report_tebu') title = 'Report Tebu';
    else if (page === 'report_limbah') title = 'Report Limbah';
    else if (page === 'report_asugar') title = 'Report A Sugar';
    else if (page === 'report_blabak') title = 'Report Blabak';
    document.getElementById('pageTitle').textContent = title;

    if (page === 'charts') loadHistoryCharts();
    if (page === 'vendors') loadVendorDetail();
    if (page === 'transactions' && currentTxType) loadTransactionData(currentTxType);
}

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const hamburger = document.getElementById('hamburgerBtn');
    const closeBtn = document.getElementById('sidebarClose');
    const overlay = document.getElementById('sidebarOverlay');

    // Desktop: toggle collapsed state
    hamburger.addEventListener('click', () => {
        const isCollapsed = sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('sidebar-hidden', isCollapsed);
        localStorage.setItem('rekap_sidebar', isCollapsed ? 'collapsed' : 'open');
    });

    // Restore saved sidebar state on desktop
    const savedSidebar = localStorage.getItem('rekap_sidebar');
    if (savedSidebar === 'collapsed') {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('sidebar-hidden');
    }

    // Mobile close
    closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
}
function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

function initViewToggle() {
    const bT = document.getElementById('btnTableView');
    const bC = document.getElementById('btnChartView');
    bT.addEventListener('click', () => {
        bT.classList.add('active'); bC.classList.remove('active');
        document.getElementById('tableView').classList.add('active');
        document.getElementById('chartView').classList.remove('active');
    });
    bC.addEventListener('click', () => {
        bC.classList.add('active'); bT.classList.remove('active');
        document.getElementById('chartView').classList.add('active');
        document.getElementById('tableView').classList.remove('active');
        renderInlineCharts();
    });
}

function initModal() {
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal();
    });
    document.getElementById('modalSaveBtn').addEventListener('click', savePOStockFromModal);
}

function detectShift() {
    const h = new Date().getHours();
    let shiftNum;
    if (h >= 0 && h < 8)       shiftNum = '1';  // 00:00 - 08:00
    else if (h >= 8 && h < 16) shiftNum = '2';  // 08:00 - 16:00
    else                        shiftNum = '3';  // 16:00 - 24:00
    document.getElementById('currentShift').textContent = shiftNum;
}

// ─── Live WIB Clock ───────────────────────────────────────
function startClock() {
    const el = document.getElementById('wibClock');
    if (!el) return;
    function tick() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        el.textContent = `${h}:${m}:${s}`;
        // Update shift badge juga setiap tick agar selalu akurat
        detectShift();
    }
    tick();
    setInterval(tick, 1000);
}
