/* static/js/report_daily.js
 * Dipindahkan dari script.js baris 2332-2916 tanpa perubahan logika.
 */

/* ============================================================
    DAILY REPORT
   ============================================================ */

 
function today() { return new Date().toISOString().split('T')[0]; }
// function fmt(n)   { return (parseFloat(n)||0).toLocaleString('id-ID'); }
 
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  const nm= ['Januari','Februari','Maret','April','Mei','Juni',
              'Juli','Agustus','September','Oktober','November','Desember'];
  return `${d.getDate()} ${nm[d.getMonth()]} ${d.getFullYear()}`;
}
 
function fmtShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function fmtDateSlash(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
 
// Init date input (single date for daily report)
(function initDailyDate() {
  const el = document.getElementById('dailyReportDate');
  if (el) el.value = today();
})();
 
/* ============================================================
   GENERATE
   ============================================================ */
async function generateReport() {
  const btn = document.getElementById('btnGen');
  try {
    const reportDate = document.getElementById('dailyReportDate').value;
    if (!reportDate) { showToast('Pilih tanggal dulu!', '#ef4444'); return; }
  
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memuat...';

    // AMBIL TANGGAL AWAL GILING DARI SETTING TEBU (LocalStorage)
    const savedTebu = JSON.parse(localStorage.getItem('rekap_tebu_settings_v1') || '{}');
    const tglAwalGiling = savedTebu.startDate || reportDate; // Fallback ke hari ini jika kosong
  
    // ── FETCH ALL DATA IN PARALLEL ──
    const [
      prodRes,
      supportRes,
      limbahRes,
      caneRes,
      transferRes,
      productionRes,
    ] = await Promise.all([
      apiFetch(`/api/report-daily/delivery?date_from=${reportDate}&date_to=${reportDate}`),
      apiFetch(`/api/report-daily/support?date_from=${reportDate}&date_to=${reportDate}`),
      apiFetch(`/api/report-daily/limbah?date_from=${reportDate}&date_to=${reportDate}`),
      apiFetch(`/api/report-daily/cane?date_from=${reportDate}&date_to=${reportDate}&rekap_from=${tglAwalGiling}`),
      apiFetch(`/api/report-daily/transfer?date_from=${reportDate}&date_to=${reportDate}`),
      apiFetch(`/api/production?date=${reportDate}`),
    ]);
  
    // Build document
    renderHeader(reportDate);
    renderDelivery(prodRes?.data || []);
    renderSupport(supportRes?.data || []);
    renderLimbah(limbahRes?.data || []);
    renderCane(caneRes?.data || null);
    renderTransfer(transferRes?.data || []);
    renderAsugar(productionRes?.data || []);
  
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('docContent').style.display = 'block';
  
    showToast('Dokumen berhasil dibuat!');
  } catch(e) {
    console.error("ERROR GENERATE REPORT:", e);
    // Explicitly show frontend alert of the issue
    alert("SYSTEM ERROR DETECTED:\n" + e.message + "\nLine: " + e.lineNumber);
    
    // DEMO fallback
    try {
        const reportDate = document.getElementById('dailyReportDate') ? document.getElementById('dailyReportDate').value : "2024-04-24";
        renderHeader(reportDate);
        renderDelivery(DEMO.delivery);
        renderSupport(DEMO.support);
        renderLimbah(DEMO.limbah);
        renderCane(DEMO.cane);
        renderTransfer(DEMO.transfer);
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('docContent').style.display = 'block';
        showToast('Demo mode aktif (Network/DB error)', '#f59e0b');
    } catch(errFallback) {
        alert("DEMO FALLBACK CRASHED:\n" + errFallback.message);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Generate';
    }
  }
}
 
async function apiFetch(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(r.status + ' API Error di ' + path);
  return r.json();
}
 
/* ============================================================
   RENDER: HEADER — matching template exactly
   ============================================================ */
function renderHeader(reportDate) {
  // Display date as dd/mm/yyyy format
  const dateStr = fmtDateSlash(reportDate);
  document.getElementById('docDateDisplay').textContent = 
    dateStr !== '—' ? dateStr : reportDate;
}
 
/* ============================================================
   RENDER: DELIVERY PRODUCT
   ── Groups by ItemName (GULA, MOLASSES, BAGASSE, BLOTONG…)
   ── Each group shows sub-rows (per customer/SPT/etc)
   ── Shows TOTAL row per group in yellow
   ============================================================ */
function renderDelivery(data) {
  const sec = document.getElementById('secDelivery');
  const tbody = document.getElementById('tblDeliveryBody');
 
  sec.style.display = 'block';
  
  const defaultGroups = [
    { key: 'SUGAR',   matches: ['GULA', 'SUGAR'] },
    { key: 'MOLASSE', matches: ['MOLASSE', 'TETES'] },
    { key: 'BAGASSE', matches: ['BAGASSE', 'AMPAS'] },
    { key: 'MILASSE', matches: ['MILASSE'] }
  ];
  
  const groups = {};
  defaultGroups.forEach(g => groups[g.key] = []);
  
  if (data && data.length > 0) {
    data.forEach(r => {
      const mat = (r.material || r.nama_material || r.ItemName || '—').toUpperCase();
      let matched = false;
      for (const g of defaultGroups) {
        if (g.matches.some(m => mat.includes(m))) {
          groups[g.key].push(r);
          matched = true;
          break;
        }
      }
      if (!matched) {
        if (!groups[mat]) groups[mat] = [];
        groups[mat].push(r);
      }
    });
  }
 
  // ─── JURUS MEGA MERGE: Hitung total semua baris untuk selain GULA ───
  let totalNonSugarRows = 0;
  for (const [key, arr] of Object.entries(groups)) {
      if (key !== 'SUGAR') {
          const c = arr.length > 0 ? arr.length : 1;
          totalNonSugarRows += (c + 1); // +1 untuk baris TOTAL-nya
      }
  }
 
  let html = '';
  let no = 1;
  let nonSugarMerged = false; // Flag sakti biar cuma dirender 1x

  for (const [matKey, rows] of Object.entries(groups)) {
    const isSugar = (matKey === 'SUGAR');
    const count = rows.length > 0 ? rows.length : 1;
    
    const displayRows = [];
    for (let i = 0; i < count; i++) {
        displayRows.push(rows[i] || { isEmpty: true });
    }
    
    let totalNetto = 0, totalSptNetto = 0, totalTruck = 0, totalSptDoc = 0, totalBag = 0;
 
    displayRows.forEach((r, i) => {
      if (!r.isEmpty) {
          totalNetto += parseFloat(r.wb_rmi || r.qty_netto || 0);
          totalSptNetto += parseFloat(r.spt || r.spt_netto || 0);
          totalTruck += parseInt(r.truck || r.ritase || 0);
          totalSptDoc += parseInt(r.spt_doc || r.spt_total || 0);
          totalBag += parseInt(r.bag_qty || 0);
      }
      
      const isFirst = i === 0;
      
      const d_wb = r.isEmpty ? '' : r.wb_rmi || r.qty_netto ? fmt(r.wb_rmi || r.qty_netto) : '';
      const d_spt = r.isEmpty ? '' : r.spt || r.spt_netto ? fmt(r.spt || r.spt_netto) : '';
      const d_tr = r.isEmpty ? '' : r.truck || r.ritase || '';
      const d_sdoc = r.isEmpty ? '' : r.spt_doc || r.spt_total ? fmt(r.spt_doc || r.spt_total) : '';
      const d_cust = r.isEmpty ? '' : r.customer || r.CardName || '';
      const d_sp = r.isEmpty ? '' : r.nomor_sppb_list || r.nomor_spm_list || r.sppr || r.nomor_sppb || '';
      
      const d_bag = (isSugar && !r.isEmpty && r.bag_qty) ? fmt(r.bag_qty) : '';
      const d_avg = (isSugar && !r.isEmpty && r.avg_netto) ? fmt(r.avg_netto) : '';

      html += `<tr>
        ${isFirst ? `<td rowspan="${count + 1}" class="mat-label">${no}</td>
                     <td rowspan="${count}" class="mat-label" style="font-size:.76rem;">${matKey}</td>` : ''}
        <td>${d_wb}</td>
        <td>${d_spt}</td>
        <td>${d_tr}</td>
        <td>${d_sdoc}</td>
        <td class="tleft" style="font-size:.7rem;">${d_cust}</td>
        <td>${d_sp}</td>`;

      if (isSugar) {
          html += `<td>${d_bag}</td><td>${d_avg}</td>`;
      } else {
          if (!nonSugarMerged) {
              html += `<td rowspan="${totalNonSugarRows}" colspan="2" style="background:#fff !important; border:none !important;"></td>`;
              nonSugarMerged = true;
          }
      }

      html += `</tr>`;
      
      if (i === count - 1) {
        const totalBagDisp = (isSugar && totalBag > 0) ? fmt(totalBag) : '';
        const averageDisp  = (isSugar && totalBag > 0) ? fmt(Math.round((totalNetto / totalBag)*100)/100) : '';

        html += `<tr class="total-row">
          <td style="text-align:center; font-weight:bold;">TOTAL</td>
          <td style="font-weight:bold;">${totalNetto ? fmt(totalNetto) : ''}</td>
          <td style="font-weight:bold;">${totalSptNetto ? fmt(totalSptNetto) : ''}</td>
          <td style="font-weight:bold;">${totalTruck || ''}</td>
          <td style="font-weight:bold;">${totalSptDoc || ''}</td>
          <td></td>
          <td></td>`;

        if (isSugar) {
            html += `<td style="font-weight:bold;">${totalBagDisp}</td>
                     <td style="font-weight:bold;">${averageDisp}</td>`;
        }
        // Jika non-sugar, kolom 9-10 sudah di-cover oleh rowspan dari baris pertama Molasse
        html += `</tr>`;
      }
    });
    no++;
  }
 
  tbody.innerHTML = html;
}

/* ============================================================
   RENDER: SUPPORT OPERATIONAL
   ============================================================ */
function renderSupport(data) {
  const sec = document.getElementById('secSupport');
  const tbody = document.getElementById('tblSupportBody');
 
  // Support SELALU TAMPIL — jika tidak ada data, tampilkan 1 baris kosong
  sec.style.display = 'block';
 
  let html = '';
  if (data && data.length > 0) {
    data.forEach((r, i) => {
      html += `<tr>
        <td>${i+1}</td>
        <td class="tleft">${r.material || r.ItemName || ''}</td>
        <td>${r.qty_netto ? fmt(r.qty_netto) : ''}</td>
        <td>${r.truck || r.ritase || ''}</td>
        <td class="tleft" style="font-size:.7rem;">${r.customer || r.CardName || ''}</td>
        <td>${r.nomor_po || r.po || ''}</td>
        <td style="font-size:.7rem; text-align:left;">${r.remarks || ''}</td>
      </tr>`;
    });
  } else {
    // Tampilkan 1 baris kosong sesuai template Excel
    html = `<tr>
      <td>1</td>
      <td class="tleft"></td>
      <td></td>
      <td></td>
      <td class="tleft"></td>
      <td></td>
      <td></td>
    </tr>`;
  }
 
  tbody.innerHTML = html;
}
 
/* ============================================================
   RENDER: LIMBAH
   ── Groups by material (FILTER CAKE, FLY ASH, etc.)
   ── Sub rows: Shift 1, Shift 2, Shift 3 per PO/customer
   ── TOTAL row per group
   ============================================================ */
/* ============================================================
   RENDER: LIMBAH (SMART ROWSPAN SESUAI EXCEL)
   ============================================================ */
/* ============================================================
   jembot
   ============================================================ */
function renderLimbah(data) {
  const sec = document.getElementById('secLimbah');
  const tbody = document.getElementById('tblLimbahBody');
 
  if (!data || data.length === 0) {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';
 
  const SHIFT_LABELS = { 1:'SHIFT 1', 2:'SHIFT 2', 3:'SHIFT 3', 0:'FREE' };
 
  const materials = {};
  data.forEach(r => {
    const mat = (r.material || r.ItemName || '—').toUpperCase();
    const custPO = (r.customer || r.CardName || '') + '||' + (r.po || r.nomor_po || '');

    if (!materials[mat]) materials[mat] = {};
    if (!materials[mat][custPO]) materials[mat][custPO] = [];
    materials[mat][custPO].push(r);
  });

  let html = '';
  let noCounter = 1;

  for (const [mat, custGroups] of Object.entries(materials)) {
    let matTotalTruck = 0;
    let matTotalNetto = 0;

    let matRowspan = 0;
    for (const [custPO, shifts] of Object.entries(custGroups)) {
      matRowspan += shifts.length;
    }

    let isFirstMatRow = true;

    for (const [custPO, shifts] of Object.entries(custGroups)) {
      const custRowspan = shifts.length;

      shifts.forEach((r, i) => {
        const shiftLabel = SHIFT_LABELS[r.shift] || `SHIFT ${r.shift}`;
        const isFirstCustRow = (i === 0);

        const truck = parseInt(r.truck || r.ritase || 0);
        const netto = parseFloat(r.qty_netto || 0);

        matTotalTruck += truck;
        matTotalNetto += netto;

        html += `<tr>`;

        if (isFirstCustRow) {
            html += `<td rowspan="${custRowspan}">${noCounter}</td>`;
        }
        if (isFirstMatRow) {
            html += `<td rowspan="${matRowspan}">${mat}</td>`;
        }

        html += `<td>${shiftLabel}</td>`;
        html += `<td>${truck || ''}</td>`;
        html += `<td>${netto ? fmt(netto) : ''}</td>`;

        if (isFirstCustRow) {
            html += `<td rowspan="${custRowspan}" style="font-size:.7rem;">${r.customer || r.CardName || ''}</td>`;
            html += `<td rowspan="${custRowspan}">${r.po || r.nomor_po || ''}</td>`;
            html += `<td rowspan="${custRowspan}" style="font-size:.7rem; text-align:left;">${r.remarks || ''}</td>`;
        }

        html += `</tr>`;
        isFirstMatRow = false; 
      });
      noCounter++;
    }

    html += `<tr class="total-row">
      <td colspan="3" style="text-align:center; font-weight:bold;">TOTAL</td>
      <td>${matTotalTruck || ''}</td>
      <td>${matTotalNetto ? fmt(matTotalNetto) : ''}</td>
      <td colspan="3"></td>
    </tr>`;
  }

  // NOTE: Baris "LIMBAH" dan "TOTAL" paling bawah sudah gue hapus bersih sesuai *request* lu!
  tbody.innerHTML = html;
}

/* ============================================================
   RENDER: CANE RECEIVED (SESUAI DESAIN EXCEL)
   ============================================================ */
/* ============================================================
   RENDER: CANE RECEIVED (Smart Loop, Text Center, Colspan 2)
   ============================================================ */
function renderCane(data) {
  const sec   = document.getElementById('secCane');
  const tbody = document.getElementById('tblCaneBody');
  const ttruck = document.getElementById('tblCaneTruckBody');
 
  if (!data) {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';
 
  const rows = [
    { no:'1', label:'RITASE TRUCK', key:'ritase' },
    { no:'2', label:'NETTO',        key:'netto'  },
  ];
 
  // RITASE & NETTO: Tambahkan text-align:center ke semua kolom angka
  tbody.innerHTML = rows.map(r => `<tr>
    <td style="text-align:center;">${r.no}</td>
    <td class="tleft">${r.label}</td>
    <td style="text-align:center;">${data?.shift1?.[r.key] ? fmt(data.shift1[r.key]) : ''}</td>
    <td style="text-align:center;">${data?.shift2?.[r.key] ? fmt(data.shift2[r.key]) : ''}</td>
    <td style="text-align:center;">${data?.shift3?.[r.key] ? fmt(data.shift3[r.key]) : ''}</td>
    <td style="font-weight:700; text-align:center;">${data?.today?.[r.key] ? fmt(data.today[r.key]) : ''}</td>
    <td style="font-weight:700; text-align:center;">${data?.todate?.[r.key] ? fmt(data.todate[r.key]) : ''}</td>
  </tr>`).join('');
 
  // TRUCK TYPE SECTION: Pakai loop lu, ganti label DOUBLE, dan key-nya biarkan tipe_double
  const trucks = [
    { label:'ENGKLE',           keyToday: data?.today?.tipe_engkel, keyTodate: data?.todate?.tipe_engkel },
    { label:'FUSO',             keyToday: data?.today?.tipe_fuso,   keyTodate: data?.todate?.tipe_fuso   },
    { label:'MINIBUS / PICKUP', keyToday: data?.today?.tipe_double, keyTodate: data?.todate?.tipe_double },
  ];
 
  let truckHtml = '';
  trucks.forEach((t, i) => {
    truckHtml += `<tr>
      ${i === 0 ? `<td colspan="2" rowspan="3" style="font-weight:700; vertical-align:middle; text-align:center; letter-spacing:1px;">TRUCK TYPE</td>` : ''}
      <td colspan="3" style="background:#ffe082; font-weight:700; text-align:center; color:#0d1117;">${t.label}</td>
      <td style="background:#ffe082; font-weight:700; text-align:center; color:#0d1117;">${t.keyToday || ''}</td>
      <td style="background:#ffe082; font-weight:700; text-align:center; color:#0d1117;">${t.keyTodate || ''}</td>
    </tr>`;
  });
 
  ttruck.innerHTML = truckHtml;
}
 
/* ============================================================
   RENDER: TRANSFER GULA
   ============================================================ */
function renderTransfer(data) {
  const sec = document.getElementById('secTransfer');
  const tbody = document.getElementById('tblTransferBody');
 
  if (!data || data.length === 0) {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';
 
  let html = '';
  let total = { wb_rmi:0, spt_netto:0, truck:0, spt_total:0, todate_truck:0, todate_netto:0 };
  
  data.forEach((r, i) => {
    total.wb_rmi      += parseFloat(r.wb_rmi||0);
    total.spt_netto   += parseFloat(r.spt_netto||0);
    total.truck       += parseInt(r.truck||0);
    total.todate_netto+= parseFloat(r.todate_netto||0);
    total.todate_truck+= parseInt(r.todate_truck||0);
    html += `<tr>
      <td>${i+1}</td>
      <td class="tleft">${r.warehouse || r.nama||'—'}</td>
      <td>${r.wb_rmi ? fmt(r.wb_rmi) : ''}</td>
      <td>${r.spt_netto ? fmt(r.spt_netto) : ''}</td>
      <td>${r.truck||''}</td>
      <td>${r.spt_total ? fmt(r.spt_total) : ''}</td>
      <td>${r.todate_truck||''}</td>
      <td>${r.todate_netto ? fmt(r.todate_netto) : ''}</td>
    </tr>`;
  });
 
  html += `<tr class="total-row">
    <td colspan="2" style="text-align:center; font-weight:bold;">TOTAL</td>
    <td>${total.wb_rmi ? fmt(total.wb_rmi) : ''}</td>
    <td>${total.spt_netto ? fmt(total.spt_netto) : ''}</td>
    <td>${total.truck || ''}</td>
    <td></td>
    <td>${total.todate_truck || ''}</td>
    <td>${total.todate_netto ? fmt(total.todate_netto) : ''}</td>
  </tr>`;
 
  tbody.innerHTML = html;
}
 
/* ============================================================
   RENDER: ASUGAR (BAGASSE)
   ============================================================ */
function renderAsugar(data) {
  const sec = document.getElementById('secAsugar');
  const tbody = document.getElementById('tblAsugarBody');

  // Filter Bagasse/Ampas from production data
  const bagasse = data.find(r => r.type && (r.type.toUpperCase().includes('BAGASSE') || r.type.toUpperCase().includes('AMPAS')));

  if (!bagasse || (bagasse.today_ritase === 0 && (parseFloat(bagasse.today_tonase) || 0) === 0)) {
    sec.style.display = 'none';
    return;
  }
  sec.style.display = 'block';

  let html = `<tr>
    <td>1</td>
    <td class="tleft">BAGASSE (AMPAS)</td>
    <td>${bagasse.shift1_ritase || ''}</td>
    <td>${bagasse.shift1_tonase ? fmt(bagasse.shift1_tonase) : ''}</td>
    <td>${bagasse.shift2_ritase || ''}</td>
    <td>${bagasse.shift2_tonase ? fmt(bagasse.shift2_tonase) : ''}</td>
    <td>${bagasse.shift3_ritase || ''}</td>
    <td>${bagasse.shift3_tonase ? fmt(bagasse.shift3_tonase) : ''}</td>
    <td style="font-weight:700; background:#00695c; color:#fff;">${bagasse.today_ritase || ''}</td>
    <td style="font-weight:700; background:#00695c; color:#fff;">${bagasse.today_tonase ? fmt(bagasse.today_tonase) : ''}</td>
  </tr>`;

  tbody.innerHTML = html;
}

/* ============================================================
   PRINT / PDF
   ============================================================ */
function printDoc() {
  if (document.getElementById('docContent').style.display === 'none') {
    showToast('Generate laporan dulu!', '#ef4444');
    return;
  }
  window.print();
}
 
/* ============================================================
   TOAST
   ============================================================ */
function showToast(msg, bg) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.style.background = bg || '#1a2332';
  t.style.color = bg ? '#fff' : '#ffd600';
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>t.classList.remove('show'), 2800);
}
 
/* ============================================================
   DEMO DATA — remove / replace with real API
   ============================================================ */
const DEMO = {
  delivery: [
    { material:'GULA KRISTAL PUTIH (BIRU)', qty_netto:300, truck:3, customer:'PT. BULOG DIVRE JAWA TIMUR', nomor_sppb:'SPPB-001' },
    { material:'GULA KRISTAL PUTIH (BIRU)', qty_netto:200, truck:2, customer:'PT. BULOG DIVRE JAWA TIMUR', nomor_sppb:'SPPB-002' },
    { material:'GULA KRISTAL PUTIH (MERAH)', qty_netto:400, truck:4, customer:'PT. RAJAWALI NUSINDO', nomor_sppb:'SPPB-003' },
    { material:'MOLASSES', qty_netto:35820, truck:15, customer:'PT. SOCHI INDUTAMA INDONESIA', sppr:'ASBO015A' },
  ],
  support: [
    { material:'SOLAR / BAHAN BAKAR', qty_netto:2500, truck:3, customer:'PT. PERTAMINA', po:'PO-2024-001', remarks:'' },
    { material:'SACK PP BLUE 50KG',   qty_netto:1800, truck:2, customer:'CV. JAYA MAKMUR', po:'PO-2024-002', remarks:'' },
  ],
  limbah: [
    { material:'FILTER CAKE', shift:1, truck:12, qty_netto:120000, customer:'PT. SELARAS TRI GUNA', po:'24020264.1' },
    { material:'FILTER CAKE', shift:2, truck:10, qty_netto:98000,  customer:'PT. SELARAS TRI GUNA', po:'24020264.1' },
    { material:'FILTER CAKE', shift:3, truck:8,  qty_netto:85000,  customer:'PT. SELARAS TRI GUNA', po:'24020264.1' },
    { material:'FILTER CAKE', shift:0, truck:5,  qty_netto:48000,  customer:'PETANI', po:'24020115.1' },
    { material:'FLY ASH / BOTTOM ASH', shift:1, truck:8, qty_netto:75000, customer:'PT. SELARAS TRI GUNA', po:'24020063.1' },
    { material:'FLY ASH / BOTTOM ASH', shift:2, truck:7, qty_netto:68000, customer:'PT. SELARAS TRI GUNA', po:'24020063.1' },
    { material:'FLY ASH / BOTTOM ASH', shift:3, truck:6, qty_netto:60000, customer:'PT. SELARAS TRI GUNA', po:'24020063.1' },
  ],
  cane: {
    shift1:  { ritase:378, netto:3195990, tipe_engkel:210, tipe_fuso:130, tipe_double:38 },
    shift2:  { ritase:367, netto:3050000, tipe_engkel:200, tipe_fuso:120, tipe_double:47 },
    shift3:  { ritase:381, netto:3180000, tipe_engkel:220, tipe_fuso:125, tipe_double:36 },
    today:   { ritase:1126,netto:9425990, tipe_engkel:630, tipe_fuso:375, tipe_double:121 },
    todate:  { ritase:100979, netto:854881290, tipe_engkel:58000, tipe_fuso:37000, tipe_double:5979 },
  },
  transfer: [
    { warehouse:'GD. BULOG JEMBER', wb_rmi:50000, spt_netto:49800, truck:10, spt_total:10, todate_truck:120, todate_netto:598000 },
  ],
};

