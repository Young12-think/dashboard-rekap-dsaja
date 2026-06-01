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
window.currentUserRole = 'viewer'; // Global role default

async function loadUserInfo() {
    try {
        const d = await api('/api/me');
        const elUsername = document.getElementById('sidebarUsername');
        const elRole = document.querySelector('.sidebar-user-info .user-role');
        const elMenuUser = document.getElementById('menuUserManagement');

        if (d && d.status === 'success') {
            window.currentUserRole = d.role || 'viewer';
            
            if (elUsername) elUsername.textContent = d.username || '—';
            
            if (elRole) {
                if (d.role === 'admin') {
                    elRole.textContent = 'Administrator';
                } else if (d.role === 'viewer_report_only') {
                    elRole.textContent = 'Viewer Laporan';
                } else {
                    elRole.textContent = 'Viewer Standard';
                }
            }
            
            if (elMenuUser) {
                elMenuUser.style.display = d.role === 'admin' ? 'block' : 'none';
            }

            // Atur visibilitas menu via CSS class (tanpa flash/delay)
            if (d.role === 'viewer_report_only') {
                document.body.classList.add('role-viewer-report-only');
                // Alihkan ke report_daily secara otomatis jika saat ini berada di dashboard
                if (currentPage === 'dashboard') {
                    switchPage('report_daily');
                }
            } else {
                document.body.classList.remove('role-viewer-report-only');
            }

            // Tandai role sudah dikonfirmasi → CSS akan menampilkan menu yang sesuai
            document.body.classList.add('role-loaded');

            // Halaman Kelola User: load data jika user adalah admin dan saat ini di halaman tersebut
            if (d.role === 'admin' && typeof loadUsersList === 'function' && currentPage === 'user_management') {
                loadUsersList();
            }
        } else {
            // Kalau gagal auth, tetap set role-loaded agar menu muncul (fallback)
            document.body.classList.add('role-loaded');
        }
    } catch(_) {
        // Error → tetap tampilkan menu (fallback untuk admin)
        document.body.classList.add('role-loaded');
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch(_) {}
    window.location.href = '/login';
}

function initNav() {
    // Guard untuk mencegah touchend + click double-fire di mobile
    let _lastTouchTime = 0;
    function guardedHandler(fn) {
        return function(e) {
            const now = Date.now();
            if (e.type === 'touchend') {
                _lastTouchTime = now;
                e.preventDefault();
            } else if (e.type === 'click' && (now - _lastTouchTime) < 500) {
                return; // Skip click karena sudah dihandle oleh touchend
            }
            fn.call(this, e);
        };
    }

    document.querySelectorAll('.sidebar-nav li[data-page]').forEach(li => {
        function handleNav(e) {
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
        }
        const guarded = guardedHandler(handleNav);
        li.addEventListener('click', guarded);
        li.addEventListener('touchend', guarded, { passive: false });
    });
    document.querySelectorAll('.submenu-toggle').forEach(btn => {
        function handleToggle(e) {
            e.preventDefault();
            e.stopPropagation();
            btn.closest('.has-submenu').classList.toggle('expanded');
        }
        const guarded = guardedHandler(handleToggle);
        btn.addEventListener('click', guarded);
        btn.addEventListener('touchend', guarded, { passive: false });
    });
}

function switchPage(page) {
    // Client-side route guard
    if (page === 'user_management' && window.currentUserRole !== 'admin') {
        page = 'dashboard';
    }

    // Viewer Report Only route guard (tidak bisa mengakses menu Dashboard, Grafik, Transaksi)
    if (window.currentUserRole === 'viewer_report_only' && (page === 'dashboard' || page === 'charts' || page === 'transactions')) {
        page = 'report_daily';
    }

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
    else if (page === 'report_others') title = 'Report Others';
    else if (page === 'user_management') title = 'Kelola Pengguna';
    document.getElementById('pageTitle').textContent = title;

    if (page === 'charts') loadHistoryCharts();
    if (page === 'vendors') loadVendorDetail();
    if (page === 'transactions' && currentTxType) loadTransactionData(currentTxType);
    if (page === 'report_others') loadOthersItemsDropdown();

    // Daily Report: Admin Only — blokir user non-admin
    if (page === 'report_daily') {
        const blocked = document.getElementById('dailyReportBlocked');
        const content = document.getElementById('dailyReportContent');
        if (blocked && content) {
            if (window.currentUserRole !== 'admin') {
                blocked.style.display = 'block';
                content.style.display = 'none';
            } else {
                blocked.style.display = 'none';
                content.style.display = '';
            }
        }
    }

    if (page === 'user_management') {
        if (typeof loadUsersList === 'function') loadUsersList();
    }
}

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const hamburger = document.getElementById('hamburgerBtn');
    const closeBtn = document.getElementById('sidebarClose');
    const overlay = document.getElementById('sidebarOverlay');

    // Guard untuk mencegah touchend + click double-fire di mobile
    let _lastTouch = 0;
    function guard(fn) {
        return function(e) {
            const now = Date.now();
            if (e.type === 'touchend') {
                _lastTouch = now;
                e.preventDefault();
            } else if (e.type === 'click' && (now - _lastTouch) < 500) {
                return;
            }
            fn.call(this, e);
        };
    }

    // Handler function
    function handleHamburger(e) {
        e.stopPropagation();
        if (window.innerWidth <= 768) {
            openSidebar();
        } else {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('sidebar-hidden', isCollapsed);
            localStorage.setItem('rekap_sidebar', isCollapsed ? 'collapsed' : 'open');
        }
    }

    function handleClose(e) {
        e.stopPropagation();
        closeSidebar();
    }

    // Desktop & Mobile Toggle — dual event with guard
    const guardedHamburger = guard(handleHamburger);
    hamburger.addEventListener('click', guardedHamburger);
    hamburger.addEventListener('touchend', guardedHamburger, { passive: false });

    // Restore saved sidebar state on desktop
    const savedSidebar = localStorage.getItem('rekap_sidebar');
    if (savedSidebar === 'collapsed' && window.innerWidth > 768) {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('sidebar-hidden');
    }

    // Mobile close — dual event with guard
    const guardedClose = guard(handleClose);
    closeBtn.addEventListener('click', guardedClose);
    closeBtn.addEventListener('touchend', guardedClose, { passive: false });
    overlay.addEventListener('click', guardedClose);
    overlay.addEventListener('touchend', guardedClose, { passive: false });
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
