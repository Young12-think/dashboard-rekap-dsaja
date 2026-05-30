/* static/js/report_tebu.js
 * Dipindahkan dari script.js baris 1899-2294 tanpa perubahan logika.
 */

// =============================================
// REPORT TEBU EXPORT WA & DASHBOARD
// =============================================

/* ============================================================
   REPORT TEBU v2 STATE & PERSISTENCE
   ============================================================ */
const LS_KEY = 'rekap_tebu_settings_v1';

let S = {        
  shift: 1,
  laporanDate: today(),
  rekapFrom: '',
  rekapTo: today(),
  startDate: '',
  target: 12000000,
  caneYard: 0,
  laporanData: null,
  rekapData: null,
};

function loadLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      S.startDate = saved.startDate || '';
      S.target    = saved.target    || 12000000;
      S.caneYard  = saved.caneYard  || 0;
      S.rekapFrom = saved.rekapFrom || S.startDate;
    }
  } catch(e) {}
}

function saveLS() {
  localStorage.setItem(LS_KEY, JSON.stringify({
    startDate: S.startDate,
    target:    S.target,
    caneYard:  S.caneYard,
    rekapFrom: S.rekapFrom,
  }));
}

function today() { return new Date().toISOString().split('T')[0]; }

function fmtDate(iso) {
  if (!iso || iso === '') return '—';
  const d = new Date(iso + 'T00:00:00');
  if(isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function fmtDateShort(iso) {
  if (!iso || iso === '') return '—';
  const d = new Date(iso + 'T00:00:00');
  if(isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

const SHIFT_CONF = {
  1: { name:'Shift 1', time:'00:00–08:00', from:'00:00', to:'08:00' },
  2: { name:'Shift 2', time:'08:00–16:00', from:'08:00', to:'16:00' },
  3: { name:'Shift 3', time:'16:00–24:00', from:'16:00', to:'24:00' },
};

/* ============================================================
   INIT TEBU V2
   ============================================================ */
function initTebuV2() {
  loadLS();
  bindInputsTebu();
  setDefaultDates();
  populateInputs();
}

function bindInputsTebu() {
  const gsd = document.getElementById('globalStartDate');
  if(!gsd) return;

  gsd.addEventListener('change', e => {
    S.startDate = e.target.value;
    if (!document.getElementById('rekapFrom').value) {
      document.getElementById('rekapFrom').value = S.startDate;
    }
    saveLS();
  });
  document.getElementById('globalTarget').addEventListener('change', e => {
    S.target = parseInt(e.target.value) || S.target;
    saveLS();
  });
  document.getElementById('globalCaneYard').addEventListener('change', e => {
    S.caneYard = parseInt(e.target.value) || 0;
    saveLS();
    if (S.laporanData) renderLaporanTebu();
  });

  document.getElementById('rekapFrom').addEventListener('change', e => {
    S.rekapFrom = e.target.value;
    saveLS();
  });
  
  // Image Capture binding
  const btnImgFull = document.getElementById('btnCopyTebuImgFull');
  const btnImg2 = document.getElementById('btnCopyTebuImg2');
  if (btnImgFull) btnImgFull.addEventListener('click', () => captureToClipboard('tebuMainCaptureArea1', 'btnCopyTebuImgFull', '<i class="fa-solid fa-image"></i> Gambar Ringkasan'));
  if (btnImg2) btnImg2.addEventListener('click', () => captureToClipboard('tebuCaptureArea2', 'btnCopyTebuImg2', '<i class="fa-solid fa-image"></i> Gambar Tabel'));
}

function setDefaultDates() {
  const t = today();
  const ld = document.getElementById('laporanDate');
  if(ld) ld.value = t;
  const rt = document.getElementById('rekapTo');
  if(rt) rt.value = t;
  const rf = document.getElementById('rekapFrom');
  if(rf) rf.value = t;
}

function populateInputs() {
  const gsd = document.getElementById('globalStartDate');
  if(!gsd) return;
  gsd.value = S.startDate;
  document.getElementById('globalTarget').value    = S.target;
  document.getElementById('globalCaneYard').value  = S.caneYard;
  if (S.startDate) document.getElementById('rekapFrom').value = S.rekapFrom || S.startDate;
}

window.saveGlobalTebu = function() {
  S.startDate = document.getElementById('globalStartDate').value;
  S.target    = parseInt(document.getElementById('globalTarget').value)  || S.target;
  S.caneYard  = parseInt(document.getElementById('globalCaneYard').value)|| 0;
  saveLS();
  showToastTebu('✓ Pengaturan disimpan permanen', '#f59e0b');
  if (S.laporanData) renderLaporanTebu();
  if (S.rekapData) renderRekapTableTebu();
};

window.syncCaneYard = async function() {
  const btn = document.getElementById('btnSyncCY');
  const input = document.getElementById('globalCaneYard');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  
  try {
    const res = await apiPost('/api/scrape-caneyard', {});
    if (res && res.status === 'success' && res.caneYard !== null) {
       input.value = res.caneYard;
       S.caneYard = parseInt(res.caneYard) || 0;
       saveLS();
       showToastTebu('✓ Cane Yard tersinkronisasi!', '#10b981');
       if (S.laporanData) renderLaporanTebu();
    } else {
       throw new Error(res ? res.message : 'Gagal sinkronisasi');
    }
  } catch (err) {
    console.error(err);
    showToastTebu(err.message || 'Auto-Sync Gagal', '#ef4444');
  }
  
  if (btn) btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Auto-Sync';
};

window.setTebuShift = function(n, el) {
  S.shift = n;
  document.querySelectorAll('.spill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  if (S.laporanData) renderLaporanTebu();
};

/* ============================================================
   GENERATE DATA → hits API
   ============================================================ */
window.generateLaporanTebu = async function() {
  const btn = document.getElementById('btnGenLaporan');
  if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

  S.laporanDate = document.getElementById('laporanDate').value;
  S.target      = parseInt(document.getElementById('globalTarget').value) || S.target;
  S.caneYard    = parseInt(document.getElementById('globalCaneYard').value) || 0;

  // Laporan always to-date from Global Start up to Laporan Date
  const startGiling = S.startDate || document.getElementById('laporanDate').value;

  try {
    const url = `/api/report-tebu?date_from=${S.laporanDate}&date_to=${S.laporanDate}&rekap_from=${startGiling}&rekap_to=${S.laporanDate}`;
    const res = await api(url);
    if (res && res.status === 'success') S.laporanData = res.data;
  } catch(e) {
      console.error(e);
      showToastTebu('Gagal memuat laporan', '#ef4444');
  }

  if (S.laporanData) {
    renderLaporanTebu();
    document.getElementById('laporanCardsArea').style.display = 'block';
    document.getElementById('waBlock').style.display = 'block';
  }
  
  if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Tampilkan Laporan'; }
};

window.generateRekapTebu = async function() {
  const btn = document.getElementById('btnGenRekap');
  if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

  const rf = document.getElementById('rekapFrom').value;
  const rt = document.getElementById('rekapTo').value;
  S.rekapFrom = rf;
  S.rekapTo = rt;

  const startGiling = S.startDate || rf;
  
  try {
    const url = `/api/report-tebu?date_from=${rf}&date_to=${rt}&rekap_from=${startGiling}&rekap_to=${rt}`;
    const res = await api(url);
    if (res && res.status === 'success') S.rekapData = res.data;
  } catch(e) {
      console.error(e);
      document.getElementById('rincianBody').innerHTML = `<tr><td colspan="7" style="color:red;">Gagal memuat: ${e.message}</td></tr>`;
  }

  if (S.rekapData) {
    renderRekapTableTebu();
    document.getElementById('rincianBlock').style.display = 'block';
  }
  
  if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Tampilkan Rekap'; }
};

/* ============================================================
   RENDERING
   ============================================================ */
function renderLaporanTebu() {
  const d  = S.laporanData;
  if(!d) return;

  const sc = SHIFT_CONF[S.shift];
  const sd = d[`shift${S.shift}`];
  const tdt= d[`todate_shift${S.shift}`] || d.todate;
  const cy = S.caneYard;
  const target = S.target;
  const startGiling = S.startDate || S.laporanDate;

  // received card
  document.getElementById('rcvTitle').innerHTML =
    `<i class="fa-solid fa-truck-ramp-box" style="color:var(--blue)"></i> Received ${sc.name} —`;
  document.getElementById('rcvTime').textContent = sc.time;
  setElem('rcv_rit',  `${fmt(sd.ritase)} <span class="u">trk</span>`);
  setElem('rcv_netto',`${fmt(sd.netto_sesudah)} <span class="u">KG</span>`);
  setElem('rcv_sblm', `${fmt(sd.netto_sebelum)} <span class="u">KG</span>`);

  // summary
  document.getElementById('sumRange').textContent =
    `${fmtDate(startGiling)} s/d ${fmtDate(S.laporanDate)}`;
  setElem('sum_cy',    `${fmt(cy)} <span class="u">trk</span>`);
  setElem('sum_rit',   `${fmt(tdt.ritase)} <span class="u">trk</span>`);
  setElem('sum_netto', `${fmt(tdt.netto_sesudah)} <span class="u">KG</span>`);

  // truck types
  setElem('tk_e', fmt(sd.tipe_engkel));  setElem('tdt_e', fmt(tdt.tipe_engkel));
  setElem('tk_f', fmt(sd.tipe_fuso));    setElem('tdt_f', fmt(tdt.tipe_fuso));
  setElem('tk_d', fmt(sd.tipe_double));  setElem('tdt_d', fmt(tdt.tipe_double));

  // progress ring
  const pct    = target > 0 ? (tdt.netto_sesudah / target) * 100 : 0;
  const circ   = 2 * Math.PI * 42;
  const offset = circ * (1 - Math.min(pct, 100) / 100);
  const ring   = document.getElementById('ringFill');
  ring.style.strokeDasharray  = circ;
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = pct >= 90 ? 'var(--green)' : pct >= 60 ? 'var(--blue)' : 'var(--gold)';
  document.getElementById('ringPct').textContent    = pct.toFixed(1) + '%';
  document.getElementById('ringTarget').textContent = fmt(target);
  document.getElementById('ringNetto').textContent  = 'Netto: ' + fmt(tdt.netto_sesudah) + ' KG';

  // WA
  renderWATebuV2(sc, sd, tdt, cy);
}

function renderRekapTableTebu() {
  const d  = S.rekapData;
  if(!d) return;
  const td = d.today;
  const tdt= d.todate;

  document.getElementById('rincianRange').textContent =
    `Tren Rentang: ${fmtDate(S.rekapFrom)} s/d ${fmtDate(S.rekapTo)}`;

  renderTableTebuV2(d, td, tdt);
}

function setElem(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function renderTableTebuV2(d, td, tdt) {
  const mainRows = [
    ['1', 'Ritase Truck',
      d.shift1.ritase,d.shift2.ritase,d.shift3.ritase,td.ritase,tdt.ritase, 'tnum'],
    ['2', 'Netto Sebelum Rafaksi (KG)',
      d.shift1.netto_sebelum,d.shift2.netto_sebelum,d.shift3.netto_sebelum,td.netto_sebelum,tdt.netto_sebelum,''],
    ['3', 'Netto Sesudah Rafaksi (KG)',
      d.shift1.netto_sesudah,d.shift2.netto_sesudah,d.shift3.netto_sesudah,td.netto_sesudah,tdt.netto_sesudah,'tgreen'],
  ];
  const truckRows = [
    ['', 'Engkel',       d.shift1.tipe_engkel,d.shift2.tipe_engkel,d.shift3.tipe_engkel,td.tipe_engkel,tdt.tipe_engkel,''],
    ['', 'Fuso',         d.shift1.tipe_fuso,  d.shift2.tipe_fuso,  d.shift3.tipe_fuso,  td.tipe_fuso,  tdt.tipe_fuso,  ''],
    ['', 'Mini Bus/Pick Up/L300', d.shift1.tipe_double,d.shift2.tipe_double,d.shift3.tipe_double,td.tipe_double,tdt.tipe_double,''],
  ];

  let html = mainRows.map((r, i) => {
    const hl = (i===2) ? 'highlight-row' : '';
    return `<tr class="${hl}">
      <td style="color:var(--t3); font-size:.7rem;">${r[0]}</td>
      <td class="tleft">${r[1]}</td>
      ${[r[2],r[3],r[4],r[5],r[6]].map(v=>`<td class="${r[7]}">${fmt(v)}</td>`).join('')}
    </tr>`;
  }).join('');

  html += `<tr class="rh-row"><td colspan="7"><i class="fa-solid fa-truck-monster" style="margin-right:5px;"></i> Type Kendaraan</td></tr>`;
  html += truckRows.map(r => `<tr>
    <td style="color:var(--t3)">${r[0]}</td>
    <td class="tleft" style="padding-left:24px; color:var(--t2); font-weight:500;">${r[1]}</td>
    ${[r[2],r[3],r[4],r[5],r[6]].map(v=>`<td>${fmt(v)}</td>`).join('')}
  </tr>`).join('');

  document.getElementById('rincianBody').innerHTML = html;
}

function renderWATebuV2(sc, sd, tdt, cy) {
  const lapTgl  = fmtDateShort(S.laporanDate);
  const startGiling = S.startDate || S.laporanDate;
  const startTgl= fmtDateShort(startGiling);
  const endTgl  = fmtDateShort(S.rekapTo);

  // Unified WA format
  const waFull = `*Update cane Received*

Date : ${lapTgl}

Time : ${sc.from} to ${sc.to}

*RECEIVED ${sc.name.toUpperCase()}*
Timbang kosong : ${fmt(sd.ritase)} truck
Total Netto : ${fmt(sd.netto_sesudah)} kg

*SUMMARY*
Date : ${startTgl} - ${lapTgl}

Cane Yard ${fmt(cy)} truck

Total timbang kosong : ${fmt(tdt.ritase)} truck
Total Netto : ${fmt(tdt.netto_sesudah)} kg`;

  window._waFull = waFull;

  // render with highlight
  const hl = t => t
    .replace(/\*([^*]+)\*/g, '<span class="wb">*$1*</span>')
    .replace(/(:[ ]*)([\d.,]+)/g, '$1<span class="wg">$2</span>');

  document.getElementById('waBoxFull').innerHTML = hl(waFull);
}

window.copyWA = function(which) {
  const txt = window._waFull;
  if (!txt) { showToastTebu('Generate report dulu!', '#ef4444'); return; }

  const copyFallback = () => {
    if (window.copyTextFallback(txt)) {
      showToastTebu('✓ Teks WA berhasil disalin!');
    } else {
      alert('Gagal menyalin teks.');
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt)
      .then(() => showToastTebu('✓ Teks WA berhasil disalin!'))
      .catch(() => copyFallback());
  } else {
    copyFallback();
  }
};

function showToastTebu(msg, bg) {
  let t = document.getElementById('toastTebu');
  if (!t) {
      t = document.createElement('div');
      t.id = 'toastTebu';
      t.className = 'toast';
      t.innerHTML = `<i class="fa-solid fa-check-circle"></i> <span id="toastMsgTebu"></span>`;
      document.body.appendChild(t);
  }
  document.getElementById('toastMsgTebu').textContent = msg;
  t.style.background = bg || 'var(--wa)';
  t.style.color = bg ? '#fff' : '#071a10';
  t.classList.add('show');
  clearTimeout(showToastTebu._t);
  showToastTebu._t = setTimeout(() => t.classList.remove('show'), 2800);
}
