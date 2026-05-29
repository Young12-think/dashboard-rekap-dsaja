/* static/js/report_blabak.js
 * ─────────────────────────────────────────────────
 * BLABAK — Weightbridge Daily Report
 * Generate, render, & copy-to-clipboard as image.
 * Single unified table with table-layout:fixed.
 * ───────────────────────────────────────────────── */

// ── Init date input ──
(function initBlabakDate() {
  const el = document.getElementById('blabakReportDate');
  if (el) el.value = new Date().toISOString().split('T')[0];
})();

/* ============================================================
   FORMAT ANGKA: Titik sebagai thousand separator (64.000)
   ============================================================ */
function blabakFmt(n) {
  const val = parseFloat(n) || 0;
  if (val === 0) return '0';
  return val.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

/* ============================================================
   FORMAT TANGGAL: "28 May 2026"
   ============================================================ */
function blabakFmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/* ============================================================
   CELL STYLE CONSTANTS — reusable across all sections
   ============================================================ */
const BLK = {
  cell:     'border:1px solid #000; padding:5px 8px; text-align:center; background:#fff; overflow:hidden; word-break:break-all;',
  desc:     'border:1px solid #000; padding:5px 8px; font-weight:800; text-align:center; background:#fff; overflow:hidden;',
  todate:   'border:1px solid #000; padding:5px 8px; text-align:center; font-weight:700; background:#fff; overflow:hidden;',
  empty2:   'border-left:1px solid #000; border-right:none; border-top:1px solid #000; border-bottom:1px solid #000; background:#fff;',
};

/* ============================================================
   GENERATE REPORT
   ============================================================ */
async function generateBlabakReport() {
  const btn = document.getElementById('btnGenBlabak');
  try {
    const reportDate = document.getElementById('blabakReportDate').value;
    if (!reportDate) {
      blabakToast('Pilih tanggal dulu!', '#ef4444');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memuat...';

    // Ambil tanggal awal giling dari Report Tebu settings (localStorage)
    const savedTebu = JSON.parse(localStorage.getItem('rekap_tebu_settings_v1') || '{}');
    const rekapFrom = savedTebu.startDate || reportDate;

    const res = await fetch(`${API}/api/report-blabak?date=${reportDate}&rekap_from=${rekapFrom}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.status !== 'success' || !json.data) {
      throw new Error(json.message || 'Data tidak tersedia');
    }

    renderBlabakReport(reportDate, json.data);

    document.getElementById('blabakEmptyState').style.display = 'none';
    document.getElementById('blabakContent').style.display = 'block';

    blabakToast('Laporan berhasil dibuat!');
  } catch (e) {
    console.error('[BLABAK ERROR]', e);
    blabakToast('Gagal: ' + e.message, '#ef4444');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Generate';
    }
  }
}

/* ============================================================
   RENDER REPORT — Single unified table
   ============================================================ */
function renderBlabakReport(reportDate, data) {
  // Date display
  document.getElementById('blabakDateDisplay').textContent = blabakFmtDate(reportDate);

  // ══════════════════════════════════════════════
  // SECTION 1: COMMODITIES
  // ══════════════════════════════════════════════
  const commodities = data.commodities || {};
  const commDefs = [
    { key: 'SUGAR',       label: 'SUGAR',       remarkSuffix: '' },
    { key: 'MOLLASE',     label: 'MOLLASE',     remarkSuffix: '' },
    { key: 'BAGGASE',     label: 'BAGGASE',     remarkSuffix: '' },
    { key: 'FILTER CAKE', label: 'FILTER CAKE', remarkSuffix: ' Truck' },
    { key: 'FLYASH',      label: 'FLYASH',      remarkSuffix: ' Truck' },
  ];

  let commHtml = '';
  commDefs.forEach(def => {
    const c = commodities[def.key] || {};
    const s1 = c.shift1 || { netto: 0, ritase: 0 };
    const s2 = c.shift2 || { netto: 0, ritase: 0 };
    const s3 = c.shift3 || { netto: 0, ritase: 0 };
    const td = c.today  || { netto: 0, ritase: 0 };

    // Ritase display: angka + suffix
    const ritaseDisplay = td.ritase + (def.remarkSuffix ? def.remarkSuffix : '');

    commHtml += `<tr>
      <td style="${BLK.desc}">${def.label}</td>
      <td style="${BLK.cell}">${s1.netto ? blabakFmt(s1.netto) : ''}</td>
      <td style="${BLK.cell}">${s2.netto ? blabakFmt(s2.netto) : ''}</td>
      <td style="${BLK.cell}">${s3.netto ? blabakFmt(s3.netto) : ''}</td>
      <td style="${BLK.cell}">${blabakFmt(td.netto)}</td>
      <td style="${BLK.cell}">${ritaseDisplay}</td>
      <td style="${BLK.cell} cursor:text;" contenteditable="true" data-remark="${def.key}"></td>
    </tr>`;
  });

  document.getElementById('blabakCommodityBody').innerHTML = commHtml;

  // ══════════════════════════════════════════════
  // SECTION 2: CANE RECEIVED (same 7-col grid)
  // ══════════════════════════════════════════════
  const cane = data.cane || {};
  const caneRows = [
    { label: 'RITASE TRUCK', key: 'ritase' },
    { label: 'NETTO',        key: 'netto' },
  ];

  let caneHtml = '';
  caneRows.forEach(row => {
    const s1 = (cane.shift1 || {})[row.key] || 0;
    const s2 = (cane.shift2 || {})[row.key] || 0;
    const s3 = (cane.shift3 || {})[row.key] || 0;
    const td = (cane.today  || {})[row.key] || 0;
    const todate = (cane.todate || {})[row.key] || 0;

    caneHtml += `<tr>
      <td style="${BLK.desc}">${row.label}</td>
      <td style="${BLK.cell}">${s1 ? blabakFmt(s1) : '0'}</td>
      <td style="${BLK.cell}">${s2 ? blabakFmt(s2) : '0'}</td>
      <td style="${BLK.cell}">${s3 ? blabakFmt(s3) : '0'}</td>
      <td style="${BLK.cell}">${blabakFmt(td)}</td>
      <td colspan="2" style="${BLK.todate}">${blabakFmt(todate)}</td>
    </tr>`;
  });

  document.getElementById('blabakCaneBody').innerHTML = caneHtml;

  // ══════════════════════════════════════════════
  // SECTION 3: TRUCK TYPES (same 7-col grid)
  // ══════════════════════════════════════════════
  const trucks = data.trucks || {};
  const trToday  = trucks.today  || { pickup: 0, engkel: 0, fuso: 0, total: 0 };
  const trTodate = trucks.todate || { pickup: 0, engkel: 0, fuso: 0, total: 0 };

  let truckHtml = '';

  // Row: TYPE TRUCK header labels
  truckHtml += `<tr>
    <td style="${BLK.desc}">TYPE TRUCK</td>
    <td style="${BLK.desc}">PICK UP/L300</td>
    <td style="${BLK.desc}">ENGKEL</td>
    <td style="${BLK.desc}">FUSO/TRONTON</td>
    <td style="${BLK.desc}">TOTAL</td>
    <td colspan="2" style="border:none; background:#fff;"></td>
  </tr>`;

  // Row: TOTAL TRUCK TO DAY
  truckHtml += `<tr>
    <td style="${BLK.desc}">TOTAL TRUCK TO DAY</td>
    <td style="${BLK.cell}">${trToday.pickup}</td>
    <td style="${BLK.cell}">${trToday.engkel}</td>
    <td style="${BLK.cell}">${trToday.fuso}</td>
    <td style="${BLK.cell}">${trToday.total}</td>
    <td colspan="2" style="border:none; background:#fff;"></td>
  </tr>`;

  // Row: TOTAL TRUCK TODATE
  truckHtml += `<tr>
    <td style="${BLK.desc}">TOTAL TRUCK TODATE</td>
    <td style="${BLK.cell}">${blabakFmt(trTodate.pickup)}</td>
    <td style="${BLK.cell}">${blabakFmt(trTodate.engkel)}</td>
    <td style="${BLK.cell}">${blabakFmt(trTodate.fuso)}</td>
    <td style="${BLK.cell}">${blabakFmt(trTodate.total)}</td>
    <td colspan="2" style="border:none; background:#fff;"></td>
  </tr>`;

  document.getElementById('blabakTruckBody').innerHTML = truckHtml;
}

/* ============================================================
   COPY TO CLIPBOARD AS IMAGE (html2canvas + Clipboard API)
   ============================================================ */
async function copyBlabakImage() {
  const reportArea = document.getElementById('blabakReportArea');

  if (!reportArea || document.getElementById('blabakContent').style.display === 'none') {
    blabakToast('Generate laporan terlebih dahulu!', '#ef4444');
    return;
  }

  try {
    blabakToast('Memproses gambar...', '#2196f3');

    const canvas = await html2canvas(reportArea, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    // Convert canvas to blob
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => {
        if (b) resolve(b);
        else reject(new Error('Gagal membuat blob'));
      }, 'image/png');
    });

    // Write to clipboard
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);

    blabakToast('✅ Gambar disalin ke clipboard! Paste (Ctrl+V) di WhatsApp/Telegram.', '#2e7d32');
  } catch (err) {
    console.error('[BLABAK COPY ERROR]', err);

    // Fallback: download file
    try {
      const canvas = await html2canvas(reportArea, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `blabak_report_${document.getElementById('blabakReportDate').value}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      blabakToast('Clipboard tidak didukung. File didownload.', '#f59e0b');
    } catch (e2) {
      blabakToast('Gagal menyalin gambar: ' + err.message, '#ef4444');
    }
  }
}

/* ============================================================
   TOAST (local to blabak page)
   ============================================================ */
function blabakToast(msg, bg) {
  const t = document.getElementById('blabakToast');
  if (!t) return;
  document.getElementById('blabakToastMsg').textContent = msg;
  t.style.background = bg || '#1a2332';
  t.style.color = bg ? '#fff' : '#ffd600';
  t.classList.add('show');
  clearTimeout(blabakToast._t);
  blabakToast._t = setTimeout(() => t.classList.remove('show'), 3500);
}
