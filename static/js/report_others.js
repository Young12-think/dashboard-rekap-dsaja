/* static/js/report_others.js
 * ─────────────────────────────────────────────────
 * OTHERS — Daily Report per ItemName (type = 'others')
 * Generate, render, & copy-to-clipboard as image.
 * Format grid: SHIFT 1/2/3, TODAY, TODATE (RIT + KG)
 * ───────────────────────────────────────────────── */

// ── Init date inputs ──
(function initOthersDate() {
  const elDate = document.getElementById('othersReportDate');
  const elTodate = document.getElementById('othersReportTodateFrom');
  const today = new Date().toISOString().split('T')[0];
  if (elDate) elDate.value = today;
  if (elTodate) elTodate.value = today;
})();

/* ============================================================
   FORMAT ANGKA: Titik sebagai thousand separator (64.000)
   ============================================================ */
function othersFmt(n) {
  const val = parseFloat(n) || 0;
  if (val === 0) return '0';
  return val.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

/* ============================================================
   FORMAT TANGGAL: "01/06/2026"
   ============================================================ */
function othersFmtDate(iso) {
  if (!iso) return '--/--/----';
  const d = new Date(iso + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/* ============================================================
   LOAD ITEMS DROPDOWN — dari /api/others-items
   ============================================================ */
async function loadOthersItemsDropdown() {
  const sel = document.getElementById('othersReportItem');
  if (!sel) return;

  try {
    const res = await fetch(`${API}/api/others-items`);
    if (!res.ok) return;
    const json = await res.json();
    if (json.status !== 'success' || !json.data) return;

    // Rebuild options
    let html = '<option value="">-- Pilih Item --</option>';
    json.data.forEach(item => {
      html += `<option value="${item}">${item}</option>`;
    });
    sel.innerHTML = html;
  } catch (e) {
    console.error('[OTHERS] Failed to load items:', e);
  }
}

/* ============================================================
   CELL STYLE CONSTANTS
   ============================================================ */
const OTH_CELL = 'border:1px solid #000; padding:5px 8px; text-align:center; background:#fff; overflow:hidden; word-break:break-all;';

/* ============================================================
   GENERATE REPORT
   ============================================================ */
async function generateOthersReport() {
  const btn = document.getElementById('btnGenOthers');
  try {
    const reportDate = document.getElementById('othersReportDate').value;
    const itemname = document.getElementById('othersReportItem').value;
    const todateFrom = document.getElementById('othersReportTodateFrom').value;

    if (!reportDate) {
      othersToast('Pilih tanggal dulu!', '#ef4444');
      return;
    }
    if (!itemname) {
      othersToast('Pilih item dulu!', '#ef4444');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memuat...';

    let url = `${API}/api/report-others?date=${reportDate}&itemname=${encodeURIComponent(itemname)}`;
    if (todateFrom) url += `&todate_from=${todateFrom}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.status !== 'success' || !json.data) {
      throw new Error(json.message || 'Data tidak tersedia');
    }

    renderOthersReport(reportDate, json.data);

    document.getElementById('othersEmptyState').style.display = 'none';
    document.getElementById('othersContent').style.display = 'block';

    othersToast('Laporan berhasil dibuat!');
  } catch (e) {
    console.error('[OTHERS ERROR]', e);
    othersToast('Gagal: ' + e.message, '#ef4444');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Generate';
    }
  }
}

/* ============================================================
   RENDER REPORT — populate the data row
   ============================================================ */
function renderOthersReport(reportDate, data) {
  // Date display
  document.getElementById('othersDateDisplay').textContent = othersFmtDate(reportDate);

  // Item name display (mapping khusus)
  let displayName = data.itemname || '—';
  if (displayName.toLowerCase().trim() === 'solid test') {
    displayName = 'solid test/A sugar';
  }
  document.getElementById('othersItemDisplay').textContent = displayName;

  // Data cells
  const s1 = data.shift1 || { rit: 0, kg: 0 };
  const s2 = data.shift2 || { rit: 0, kg: 0 };
  const s3 = data.shift3 || { rit: 0, kg: 0 };
  const td = data.today  || { rit: 0, kg: 0 };
  const todate = data.todate || { rit: 0, kg: 0 };

  const cellVal = (v) => v > 0 ? othersFmt(v) : '0';

  const html = `<tr>
    <td style="${OTH_CELL}">${cellVal(s1.rit)}</td>
    <td style="${OTH_CELL}">${cellVal(s1.kg)}</td>
    <td style="${OTH_CELL}">${cellVal(s2.rit)}</td>
    <td style="${OTH_CELL}">${cellVal(s2.kg)}</td>
    <td style="${OTH_CELL}">${cellVal(s3.rit)}</td>
    <td style="${OTH_CELL}">${cellVal(s3.kg)}</td>
    <td style="${OTH_CELL} font-weight:700;">${cellVal(td.rit)}</td>
    <td style="${OTH_CELL} font-weight:900;">${cellVal(td.kg)}</td>
    <td style="${OTH_CELL} font-weight:700;">${cellVal(todate.rit)}</td>
    <td style="${OTH_CELL} font-weight:900;">${cellVal(todate.kg)}</td>
  </tr>`;

  document.getElementById('othersDataBody').innerHTML = html;
}

/* ============================================================
   COPY TO CLIPBOARD AS IMAGE (html2canvas + Clipboard API)
   ============================================================ */
async function copyOthersImage() {
  const reportArea = document.getElementById('othersReportArea');

  if (!reportArea || document.getElementById('othersContent').style.display === 'none') {
    othersToast('Generate laporan terlebih dahulu!', '#ef4444');
    return;
  }

  try {
    othersToast('Memproses gambar...', '#2196f3');

    const canvas = await html2canvas(reportArea, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    canvas.toBlob(async blob => {
      if (!blob) {
        othersToast('Gagal membuat blob gambar', '#ef4444');
        return;
      }

      const fallbackDownload = () => {
        const link = document.createElement('a');
        link.download = `others_report_${document.getElementById('othersReportDate').value}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        othersToast('⚠️ Koneksi HTTP non-aman. Gambar otomatis diunduh!', '#f59e0b');
      };

      if (navigator.clipboard && navigator.clipboard.write) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          othersToast('✅ Gambar disalin ke clipboard! Paste (Ctrl+V) di WhatsApp/Telegram.', '#2e7d32');
        } catch (clipErr) {
          console.error(clipErr);
          fallbackDownload();
        }
      } else {
        fallbackDownload();
      }
    }, 'image/png');

  } catch (err) {
    console.error('[OTHERS COPY ERROR]', err);
    othersToast('Gagal memproses gambar: ' + err.message, '#ef4444');
  }
}

/* ============================================================
   TOAST (local to others page)
   ============================================================ */
function othersToast(msg, bg) {
  const t = document.getElementById('othersToast');
  if (!t) return;
  document.getElementById('othersToastMsg').textContent = msg;
  t.style.background = bg || '#1a2332';
  t.style.color = bg ? '#fff' : '#ffd600';
  t.classList.add('show');
  clearTimeout(othersToast._t);
  othersToast._t = setTimeout(() => t.classList.remove('show'), 3500);
}
