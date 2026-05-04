/* static/js/utils.js
 * ─────────────────────────────────────────────────
 * Formatting, DOM helpers, chart helpers.
 * Dipindahkan dari script.js baris 1527-1754 tanpa perubahan logika.
 * ───────────────────────────────────────────────── */

// =============================================
// UTILS/FORMAT SU
// =============================================
function fmt(n) {
    if (n === null || n === undefined) return '0';
    const v = parseFloat(n);
    return isNaN(v) ? '0' : v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}
function fmtDecimal(n) {
    if (n === null || n === undefined || n === '') return '0,00';

    // Triknya di sini: Ubah koma jadi titik secara diam-diam biar JS paham
    let cleanNumber = String(n).replace(',', '.');

    const v = parseFloat(cleanNumber);
    return isNaN(v) ? '0,00' : v.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s) {
    const d = new Date(s + 'T00:00:00');
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${d.getDate()} ${m[d.getMonth()]}`;
}
function z(v) { return (!v || v === 0) ? 'zero-val' : ''; }
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); charts[id] = null; } }
function errRow(cols, msg) { return `<tr><td colspan="${cols}" class="loading-cell"><div class="error-state"><i class="fa-solid fa-circle-exclamation"></i><p>${msg}</p></div></td></tr>`; }
function emptyRow(cols, msg) { return `<tr><td colspan="${cols}" class="loading-cell"><div class="no-data"><i class="fa-solid fa-inbox"></i><p>${msg}</p></div></td></tr>`; }
function errBlock(msg) { return `<div class="error-state"><i class="fa-solid fa-circle-exclamation"></i><p>${msg}</p></div>`; }
function emptyBlock(msg) { return `<div class="no-data"><i class="fa-solid fa-inbox"></i><p>${msg}</p></div>`; }

/* ── loadReportTebu: stub so loadAll() does not crash ── */
async function loadReportTebu() {
  // Tebu report is loaded on-demand via window.generateLaporanTebu()
  // This stub prevents the dashboard loadAll() crash
  return;
}
