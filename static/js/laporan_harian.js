let currentLhDate = new Date();

function formatNumber(num) {
    if (!num && num !== 0) return '-';
    return Number(num).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatMolasses(num) {
    if (!num && num !== 0) return '-';
    return Number(num).toLocaleString('id-ID', { minimumFractionDigits: 5, maximumFractionDigits: 5 });
}

function updateLhDateDisplay() {
    const opts = { day: '2-digit', month: 'long', year: 'numeric' };
    const dateEl = document.getElementById('lh-display-date');
    const pickerEl = document.getElementById('lh-date-picker');

    if (dateEl) dateEl.innerText = '📅 ' + currentLhDate.toLocaleDateString('id-ID', opts);
    if (pickerEl) pickerEl.value = currentLhDate.toISOString().split('T')[0];

    // Fetch data whenever date changes
    fetchLaporanHarian();
    fetchLhGrafikAnalitik();
}

function changeLhDate(days) {
    currentLhDate.setDate(currentLhDate.getDate() + days);
    updateLhDateDisplay();
}

document.addEventListener('DOMContentLoaded', () => {
    // Initial setup if elements exist
    if (document.getElementById('lh-date-picker')) {
        updateLhDateDisplay();

        // Date picker listener
        document.getElementById('lh-date-picker').addEventListener('change', (e) => {
            if (e.target.value) {
                const parsed = new Date(e.target.value);
                if (!isNaN(parsed.getTime())) {
                    currentLhDate = parsed;
                    updateLhDateDisplay();
                }
            }
        });

        const exportBtn = document.getElementById('lh-btn-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const dateStr = [
                    currentLhDate.getFullYear(),
                    String(currentLhDate.getMonth() + 1).padStart(2, '0'),
                    String(currentLhDate.getDate()).padStart(2, '0')
                ].join('-');
                window.location.href = `/api/rmi-balance/export-excel?date=${dateStr}`;
            });
        }

        // Period buttons listener
        const periodBtns = document.querySelectorAll('.lh-grafik-btn-period');
        periodBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                periodBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentGrafikDays = parseInt(e.target.getAttribute('data-days')) || 7;
                document.getElementById('lh-ga-del-days').innerText = currentGrafikDays;
                fetchLhGrafikAnalitik();
            });
        });
    }
});

async function fetchLaporanHarian() {
    const dateStr = currentLhDate.toISOString().split('T')[0];
    try {
        const res = await fetch(`/api/rmi-balance/laporan-harian?date=${dateStr}`);
        const result = await res.json();

        if (result.status === 'success') {
            const d = result.data;

            const statusBadge = document.getElementById('lh-giling-status');
            if (statusBadge) {
                if (d.cane.millingStartDate) {
                    statusBadge.innerHTML = '● Giling Aktif';
                    statusBadge.style.background = 'var(--accent-green-dim)';
                    statusBadge.style.color = 'var(--accent-green)';
                } else {
                    statusBadge.innerHTML = '● Luar Masa Giling';
                    statusBadge.style.background = 'rgba(255,255,255,0.1)';
                    statusBadge.style.color = 'var(--text-secondary)';
                }
            }

            // Gula Balance
            document.getElementById('lh-val-gula-open').innerText = formatNumber(d.gula.openBalance);
            document.getElementById('lh-val-gula-prod').innerText = formatNumber(d.gula.produksi.total);
            document.getElementById('lh-val-gula-total').innerText = formatNumber(d.gula.openBalance + d.gula.produksi.total);
            document.getElementById('lh-val-gula-del').innerText = formatNumber(d.gula.delivery.actual);
            document.getElementById('lh-val-gula-end').innerText = formatNumber(d.gula.endBalance);

            const rejectTon = Number(d.gula.reject || 0) / 1000;
            const totalStockReject = Number(d.gula.stokGkb || 0) + Number(d.gula.stokGkm || 0) + rejectTon;

            document.getElementById('lh-val-gkb-stok').innerText = formatNumber(d.gula.stokGkb);
            document.getElementById('lh-val-gkm-stok').innerText = formatNumber(d.gula.stokGkm);
            document.getElementById('lh-val-gula-reject').innerText = formatNumber(rejectTon);

            
            // UPDATE DETAIL REJECT
            const rejectBody = document.getElementById('lh-detail-reject-body');
            if (rejectBody && d.gula.detailReject) {
                if (d.gula.detailReject.length === 0) {
                    rejectBody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#8b949e;">Tidak ada reject hari ini</td></tr>`;
                } else {
                    let rHtml = '';
                    let tReject = 0;
                    d.gula.detailReject.forEach(r => {
                        rHtml += `<tr><td class="label">${r.jenis}</td><td>${formatNumber(r.qty)}</td></tr>`;
                        tReject += r.qty;
                    });
                    rHtml += `<tr class="total"><td class="label">Total Reject Today</td><td>${formatNumber(tReject)}</td></tr>`;
                    rejectBody.innerHTML = rHtml;
                }
            }

            // UPDATE DETAIL REMELT
            const remeltBody = document.getElementById('lh-detail-remelt-body');
            if (remeltBody && d.gula.detailRemelt) {
                if (d.gula.detailRemelt.length === 0) {
                    remeltBody.innerHTML = `<tr><td colspan="2" style="text-align:center; color:#8b949e;">Tidak ada remelt hari ini</td></tr>`;
                } else {
                    let rmHtml = '';
                    let tRemelt = 0;
                    d.gula.detailRemelt.forEach(rm => {
                        rmHtml += `<tr><td class="label">Remelt ${rm.jenis}</td><td>${formatNumber(rm.qty)}</td></tr>`;
                        tRemelt += rm.qty;
                    });
                    rmHtml += `<tr class="total"><td class="label">Total Remelt Reject Today</td><td>${formatNumber(tRemelt)}</td></tr>`;
                    remeltBody.innerHTML = rmHtml;
                }
            }

            
            // UPDATE TAB DETAIL DELIVERY
            const gDel = d.gula.delivery;
            const mDel = d.molasses.delivery;
            
            if (document.getElementById('lh-del-gkb-plan')) {
                // A. Gula
                document.getElementById('lh-del-gkb-plan').innerText = formatNumber(gDel.planGkb);
                document.getElementById('lh-del-gkm-plan').innerText = formatNumber(gDel.planGkm);
                document.getElementById('lh-del-gula-plan-tot').innerText = formatNumber(gDel.plan);
                
                document.getElementById('lh-del-gkb-act').innerText = formatNumber(gDel.actGkb);
                document.getElementById('lh-del-gkm-act').innerText = formatNumber(gDel.actGkm);
                document.getElementById('lh-del-gula-act-tot').innerText = formatNumber(gDel.actual);
                
                let diffGkb = gDel.actGkb - gDel.planGkb;
                let diffGkm = gDel.actGkm - gDel.planGkm;
                let diffGula = gDel.actual - gDel.plan;
                
                document.getElementById('lh-del-gkb-diff').innerText = formatNumber(diffGkb);
                document.getElementById('lh-del-gkm-diff').innerText = formatNumber(diffGkm);
                document.getElementById('lh-del-gula-diff-tot').innerText = formatNumber(diffGula);
                
                let pctGkb = gDel.planGkb > 0 ? ((gDel.actGkb - gDel.planGkb) / gDel.planGkb * 100) : 0;
                let pctGkm = gDel.planGkm > 0 ? ((gDel.actGkm - gDel.planGkm) / gDel.planGkm * 100) : 0;
                let pctGula = gDel.plan > 0 ? ((gDel.actual - gDel.plan) / gDel.plan * 100) : 0;
                
                document.getElementById('lh-del-gkb-pct').innerText = (pctGkb > 0 ? '+' : '') + formatNumber(pctGkb) + '%';
                document.getElementById('lh-del-gkm-pct').innerText = (pctGkm > 0 ? '+' : '') + formatNumber(pctGkm) + '%';
                document.getElementById('lh-del-gula-pct-tot').innerText = (pctGula > 0 ? '+' : '') + formatNumber(pctGula) + '%';
                
                // B. Molasses
                document.getElementById('lh-del-mol-plan').innerText = formatNumber(mDel.schedule);
                document.getElementById('lh-del-mol-act').innerText = formatNumber(mDel.actual);
                let diffMol = mDel.actual - mDel.schedule;
                document.getElementById('lh-del-mol-diff').innerText = formatNumber(diffMol);
                let pctMol = mDel.schedule > 0 ? ((mDel.actual - mDel.schedule) / mDel.schedule * 100) : 0;
                document.getElementById('lh-del-mol-pct').innerText = (pctMol > 0 ? '+' : '') + formatNumber(pctMol) + '%';
                
                // SUMMARY GULA
                document.getElementById('lh-del-gula-sum-plan').innerText = formatNumber(gDel.plan);
                document.getElementById('lh-del-gula-sum-actual').innerText = formatNumber(gDel.actual);
                document.getElementById('lh-del-gula-sum-diff').innerText = (diffGula > 0 ? '+' : '') + formatNumber(diffGula);
                document.getElementById('lh-del-gula-sum-pct').innerText = (pctGula > 0 ? '+' : '') + formatNumber(pctGula) + '% Diff';
                document.getElementById('lh-del-gula-sum-diff').style.color = diffGula >= 0 ? 'var(--accent-green)' : '#f85149';

                // SUMMARY MOLASSES
                document.getElementById('lh-del-mol-sum-plan').innerText = formatNumber(mDel.schedule);
                document.getElementById('lh-del-mol-sum-actual').innerText = formatNumber(mDel.actual);
                document.getElementById('lh-del-mol-sum-diff').innerText = (diffMol > 0 ? '+' : '') + formatNumber(diffMol);
                document.getElementById('lh-del-mol-sum-pct').innerText = (pctMol > 0 ? '+' : '') + formatNumber(pctMol) + '% Diff';
                document.getElementById('lh-del-mol-sum-diff').style.color = diffMol >= 0 ? 'var(--accent-green)' : '#f85149';
            }

            
            // ===== TAB MOLASSES & CANE =====
            const cane = d.cane || {};
            const mol = d.molasses || {};

            // A. Cane In
            const caneToday = Number(cane.hariIni || 0);
            const caneTodayTon = caneToday;
            const caneKum = Number(cane.kumulatif || 0);
            const caneKumTon = caneKum;

            const elCaneToday = document.getElementById('lh-mc-cane-today');
            if (elCaneToday) elCaneToday.innerText = formatNumber(caneTodayTon);
            const elTruckToday = document.getElementById('lh-mc-truck-today');
            if (elTruckToday) elTruckToday.innerText = (cane.hariIniTruck || 0) + ' Ritase Truck';
            const elCaneKum = document.getElementById('lh-mc-cane-kumulatif');
            if (elCaneKum) elCaneKum.innerText = formatNumber(caneKumTon);
            const elTruckKum = document.getElementById('lh-mc-truck-kumulatif');
            if (elTruckKum) elTruckKum.innerText = (cane.kumulatifTruck || 0) + ' Ritase Truck';

            const caneShiftBody = document.getElementById('lh-mc-cane-shift-body');
            const elCanePeriod = document.getElementById('lh-mc-cane-period');
            if (elCanePeriod && cane.millingStartDate && cane.reportDate) {
                elCanePeriod.innerText = `Dari ${cane.millingStartDate} s/d ${cane.reportDate}`;
            } else if (elCanePeriod) {
                elCanePeriod.innerText = 'Dari awal giling s/d tanggal laporan';
            }

            if (caneShiftBody && cane.perShift) {
                if (cane.perShift.length === 0) {
                    caneShiftBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#8b949e;">Tidak ada data tebu hari ini</td></tr>';
                } else {
                    let csHtml = '';
                    let totalTruck = 0, totalCane = 0;
                    cane.perShift.forEach(s => {
                        let cTon = Number(s.caneKg || 0);
                        let truck = Number(s.truck || 0);
                        totalTruck += truck;
                        totalCane += cTon;
                        csHtml += '<tr><td class="label">Shift ' + ['I','II','III'][s.shift - 1] + '</td><td style="text-align:right;">' + truck + '</td><td style="text-align:right;">' + formatNumber(cTon) + '</td></tr>';
                    });
                    csHtml += '<tr class="total"><td class="label">Total</td><td style="text-align:right;">' + totalTruck + '</td><td style="text-align:right;">' + formatNumber(totalCane) + '</td></tr>';
                    caneShiftBody.innerHTML = csHtml;
                }
            }

            // B. Balance Molasses
            const elMolBegin = document.getElementById('lh-mc-mol-begin');
            if (elMolBegin) elMolBegin.innerText = formatNumber(mol.openBalance);
            const elMolBeginA = document.getElementById('lh-mc-mol-begin-a');
            if (elMolBeginA) elMolBeginA.innerText = formatNumber(mol.openTankA || 0);
            const elMolBeginB = document.getElementById('lh-mc-mol-begin-b');
            if (elMolBeginB) elMolBeginB.innerText = formatNumber(mol.openTankB || 0);

            const elMolIn = document.getElementById('lh-mc-mol-in');
            if (elMolIn) elMolIn.innerText = formatNumber(mol.produksi?.total || 0);

            const elMolRawSugar = document.getElementById('lh-mc-mol-rawsugar');
            if (elMolRawSugar) elMolRawSugar.innerText = formatNumber(mol.rawSugarIn || 0);
            const elMolYield = document.getElementById('lh-mc-mol-yield');
            if (elMolYield) elMolYield.innerText = mol.yield != null ? formatNumber(mol.yield) + ' %' : '—';

            const elMolOut = document.getElementById('lh-mc-mol-out');
            if (elMolOut) elMolOut.innerText = formatNumber(mol.delivery?.actual || 0);
            const elMolOutA = document.getElementById('lh-mc-mol-out-a');
            if (elMolOutA) elMolOutA.innerText = formatNumber(mol.delivery?.actTankA || 0);
            const elMolOutB = document.getElementById('lh-mc-mol-out-b');
            if (elMolOutB) elMolOutB.innerText = formatNumber(mol.delivery?.actTankB || 0);

            const elMolPlan = document.getElementById('lh-mc-mol-plan');
            if (elMolPlan) elMolPlan.innerText = formatNumber(mol.delivery?.schedule || 0);
            const elMolDiff = document.getElementById('lh-mc-mol-diff');
            if (elMolDiff) {
                let mDiff = (mol.delivery?.actual || 0) - (mol.delivery?.schedule || 0);
                elMolDiff.innerText = (mDiff > 0 ? '+' : '') + formatNumber(mDiff);
                elMolDiff.style.color = mDiff >= 0 ? 'var(--accent-green)' : '#f85149';
            }

            const elMolNext = document.getElementById('lh-mc-mol-next-schedule');
            if (elMolNext) elMolNext.innerText = formatNumber(mol.delivery?.nextSchedule || 0);

            // Cumulative delivery diff + badge
            const cumPlan = Number(mol.delivery?.cumPlan || 0);
            const cumActual = Number(mol.delivery?.cumActual || 0);
            const cumDiff = Number(mol.delivery?.cumDiff || 0);
            const cumPct = mol.delivery?.cumDiffPct;
            const elCumPlan = document.getElementById('lh-mc-cum-plan');
            if (elCumPlan) elCumPlan.innerText = formatNumber(cumPlan);
            const elCumActual = document.getElementById('lh-mc-cum-actual');
            if (elCumActual) elCumActual.innerText = formatNumber(cumActual);
            const elCumBadge = document.getElementById('lh-mc-cum-badge');
            if (elCumBadge) {
                if (cumPct == null) {
                    elCumBadge.textContent = '—';
                    elCumBadge.className = 'badge';
                } else {
                    const ok = cumDiff >= 0;
                    elCumBadge.textContent = (cumDiff > 0 ? '+' : '') + formatNumber(cumDiff) + ' Ton (' + (cumPct > 0 ? '+' : '') + formatNumber(cumPct) + '%) ' + (ok ? 'Surplus' : 'Defisit');
                    elCumBadge.className = 'badge ' + (ok ? 'balanced' : 'mismatch');
                }
            }

            const elMolEnd = document.getElementById('lh-mc-mol-end');
            if (elMolEnd) elMolEnd.innerText = formatNumber(mol.endBalance);

            // Tank A & B (capacity section)
            const elTankA = document.getElementById('lh-mc-tank-a');
            if (elTankA) elTankA.innerText = formatNumber(mol.tankA || 0);
            const elTankB = document.getElementById('lh-mc-tank-b');
            if (elTankB) elTankB.innerText = formatNumber(mol.tankB || 0);

            // Capacity bar
            const capMol = Number(mol.capacity || 30000);
            const endMol = Number(mol.endBalance || 0);
            const pctCap = capMol > 0 ? (endMol / capMol * 100) : 0;
            const elCapText = document.getElementById('lh-mc-cap-text');
            if (elCapText) elCapText.innerText = formatNumber(endMol) + ' / ' + formatNumber(capMol) + ' Ton (' + formatNumber(pctCap) + '%)';
            const elCapBar = document.getElementById('lh-mc-cap-bar');
            if (elCapBar) {
                elCapBar.style.width = Math.min(pctCap, 100) + '%';
                if (pctCap > 85) elCapBar.style.background = '#f85149';
                else if (pctCap > 70) elCapBar.style.background = '#f0c000';
                else elCapBar.style.background = 'var(--accent-green)';
            }

            const liveValues = {
                'lh-val-gula-reject-footer': rejectTon,
                'lh-val-gula-total-reject': totalStockReject,
                'lh-stock-gkb': d.gula.stokGkb,
                'lh-stock-gkm': d.gula.stokGkm,
                'lh-stock-reject': rejectTon,
                'lh-stock-total': totalStockReject
            };
            Object.entries(liveValues).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.innerText = formatNumber(value);
            });

            const rejectShiftTbody = document.getElementById('lh-stock-reject-shift');
            if (rejectShiftTbody) {
                rejectShiftTbody.innerHTML = [1, 2, 3].map((shift) => `
                    <tr>
                        <td class="label" style="text-align: left;">Shift ${['I', 'II', 'III'][shift - 1]}</td>
                        <td style="text-align: right;">${formatNumber(Number(d.gula.produksiDetail?.[shift]?.reject || 0) / 1000)}</td>
                    </tr>
                `).join('') + `
                    <tr class="total">
                        <td class="label" style="text-align: left;">Total Reject Hari Ini</td>
                        <td style="text-align: right;">${formatNumber(
                    [1, 2, 3].reduce(
                        (total, shift) => total + Number(d.gula.produksiDetail?.[shift]?.reject || 0),
                        0
                    ) / 1000
                )}</td>
                    </tr>
                `;
            }

            const locationTbody = document.getElementById('lh-stock-location');
            if (locationTbody) {
                const locations = d.gula.stockPosition?.locations || [];
                locationTbody.innerHTML = locations.length
                    ? locations.map((location) => `
                        <tr>
                            <td class="label">${location.name}</td>
                            <td>${formatNumber(location.stock)}</td>
                        </tr>
                    `).join('')
                    : '<tr><td colspan="2">Tidak ada data lokasi</td></tr>';
            }

            // Gula Prod Table
            const prodGulaTbody = document.getElementById('lh-table-prod-gula').querySelector('tbody');
            prodGulaTbody.innerHTML = `
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift I</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[1].gkb)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[1].gkm)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[1].reject)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(d.gula.produksi[1])}</td></tr>
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift II</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[2].gkb)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[2].gkm)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[2].reject)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(d.gula.produksi[2])}</td></tr>
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift III</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[3].gkb)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[3].gkm)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[3].reject)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(d.gula.produksi[3])}</td></tr>
                <tr style="background: var(--accent-blue-dim);"><td style="text-align: left; padding: 12px 8px; font-weight: 700; color: var(--accent-blue); border: none;">Total</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber((d.gula.produksiDetail[1].gkb || 0) + (d.gula.produksiDetail[2].gkb || 0) + (d.gula.produksiDetail[3].gkb || 0))}</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber((d.gula.produksiDetail[1].gkm || 0) + (d.gula.produksiDetail[2].gkm || 0) + (d.gula.produksiDetail[3].gkm || 0))}</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber((d.gula.produksiDetail[1].reject || 0) + (d.gula.produksiDetail[2].reject || 0) + (d.gula.produksiDetail[3].reject || 0))}</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber(d.gula.produksi.total)}</td></tr>
            `;

            // Gula Del Table
            const delGulaTbody = document.getElementById('lh-table-del-gula').querySelector('tbody');

            // We use plan besok directly from data
            const plan_gkb = d.gula.deliveryPlanBesok.gkb;
            const plan_gkm = d.gula.deliveryPlanBesok.gkm;
            const plan_total = d.gula.deliveryPlanBesok.total;

            // Actual is from delivery plan of today vs actual of today
            // The table has plan, actual, diff. Wait, the table shows GKB and GKM
            // In backend we don't strictly separate plan today by GKB/GKM, only total plan. Let's just use what's available
            delGulaTbody.innerHTML = `
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;"><span style="color: var(--accent-blue); margin-right: 6px;">●</span> GKB</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">-</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.delivery.actual)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">-</td></tr>
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;"><span style="color: var(--accent-red); margin-right: 6px;">●</span> GKM</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.delivery.plan)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">-</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.delivery.diff)}</td></tr>
                <tr style="background: var(--accent-blue-dim);"><td style="text-align: left; padding: 12px 8px; font-weight: 700; color: var(--accent-blue); border: none;">Total</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber(d.gula.delivery.plan)}</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber(d.gula.delivery.actual)}</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">-</td></tr>
            `;

            // Plan Besok
            document.getElementById('lh-plan-besok-gkb').innerText = formatNumber(plan_gkb);
            document.getElementById('lh-plan-besok-gkm').innerText = formatNumber(plan_gkm);

            // Molasses Balance (Convert Kg to Ton)
            document.getElementById('lh-val-mol-open').innerText = formatMolasses(d.molasses.openBalance);
            document.getElementById('lh-val-mol-prod').innerText = formatMolasses(d.molasses.produksi.total);
            document.getElementById('lh-val-mol-total').innerText = formatMolasses(d.molasses.openBalance + d.molasses.produksi.total);
            document.getElementById('lh-val-mol-del').innerText = formatMolasses(d.molasses.delivery.actual);
            document.getElementById('lh-val-mol-end').innerText = formatMolasses(d.molasses.endBalance);

            document.getElementById('lh-val-tanka-stok').innerText = formatNumber(d.molasses.tankA);
            document.getElementById('lh-val-tankb-stok').innerText = formatNumber(d.molasses.tankB);

            // Molasses Prod Table
            const prodMolTbody = document.getElementById('lh-table-prod-mol').querySelector('tbody');
            prodMolTbody.innerHTML = `
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift I</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.molasses.produksi[1])}</td></tr>
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift II</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.molasses.produksi[2])}</td></tr>
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift III</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.molasses.produksi[3])}</td></tr>
                <tr style="background: var(--accent-blue-dim);"><td style="text-align: left; padding: 12px 8px; font-weight: 700; color: var(--accent-blue); border: none;">Total</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber(d.molasses.produksi.total)}</td></tr>
            `;

            document.getElementById('lh-mol-plan').innerText = `${formatMolasses(d.molasses.delivery.schedule)} Ton`;
            document.getElementById('lh-mol-actual').innerText = `${formatMolasses(d.molasses.delivery.actual)} Ton`;
            document.getElementById('lh-mol-diff').innerText = `${formatMolasses(d.molasses.delivery.diff)} Ton`;

            // Cane received info (Cumulative & Today, Convert Kg to Ton)
            document.getElementById('lh-cane-prev').innerText = formatNumber(d.cane.kumulatif);
            document.getElementById('lh-cane-truck-prev').innerText = formatNumber(d.cane.kumulatifTruck);
            document.getElementById('lh-cane-today').innerText = formatNumber(d.cane.hariIni);
            document.getElementById('lh-cane-truck-today').innerText = formatNumber(d.cane.hariIniTruck);

            // Cane Table
            const caneTbody = document.getElementById('lh-table-cane').querySelector('tbody');
            // Provide default values if shift data is missing
            const s1 = d.cane.perShift.find(x => x.shift === 1) || { caneKg: 0, truck: 0 };
            const s2 = d.cane.perShift.find(x => x.shift === 2) || { caneKg: 0, truck: 0 };
            const s3 = d.cane.perShift.find(x => x.shift === 3) || { caneKg: 0, truck: 0 };

            caneTbody.innerHTML = `
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift I</td><td style="text-align: right; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(s1.caneKg)}</td><td style="text-align: right; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(s1.truck)}</td></tr>
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift II</td><td style="text-align: right; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(s2.caneKg)}</td><td style="text-align: right; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(s2.truck)}</td></tr>
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift III</td><td style="text-align: right; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(s3.caneKg)}</td><td style="text-align: right; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(s3.truck)}</td></tr>
                <tr style="background: var(--accent-blue-dim);"><td style="text-align: left; padding: 12px 8px; font-weight: 700; color: var(--accent-blue); border: none;">Σ Cane Total</td><td style="text-align: right; padding: 12px 8px; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber(d.cane.hariIni)}</td><td style="text-align: right; padding: 12px 8px; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber(d.cane.hariIniTruck)}</td></tr>
            `;
        }
    } catch (e) {
        console.error("Failed to load laporan harian", e);
    }
}

let currentGrafikDays = 7;
let chartGaGula, chartGaMolasses, chartGaDelivery;

async function fetchLhGrafikAnalitik() {
    const dateStr = currentLhDate.toISOString().split('T')[0];
    try {
        const res = await fetch(`/api/rmi-balance/grafik-analitik?date=${dateStr}&days=${currentGrafikDays}`);
        const result = await res.json();

        if (result.status === 'success') {
            const data = result.data;
            renderLhGrafikAnalitik(data);
        }
    } catch (e) {
        console.error("Failed to fetch grafik analitik", e);
    }
}

function renderLhGrafikAnalitik(data) {
    const labels = (data.chartLabels || []).map(l => {
        const d = new Date(`${l}T00:00:00`);
        return isNaN(d) ? l : `${d.getDate()}/${d.getMonth() + 1}`;
    });
    const cd = data.chartData || {};
    const n = labels.length;
    const lastOf = arr => (Array.isArray(arr) && arr.length) ? arr[arr.length - 1] : null;
    const prevOf = arr => (Array.isArray(arr) && arr.length > 1) ? arr[arr.length - 2] : null;
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    const setDiff = (id, diff) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (diff !== null && diff !== 0) {
            el.style.display = 'inline-block';
            el.innerHTML = (diff > 0 ? '<i class="fa-solid fa-caret-up"></i> +' : '<i class="fa-solid fa-caret-down"></i> ') + formatNumber(Math.abs(diff));
            el.style.color = diff > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
            el.style.background = diff > 0 ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)';
        } else {
            el.style.display = 'none';
        }
    };

    // 1. Date range & update time
    const opts = { day: 'numeric', month: 'long', year: 'numeric' };
    const df = new Date(`${data.date_from}T00:00:00`);
    const dt = new Date(`${data.date_to}T00:00:00`);
    setText('lh-grafik-date-range', df.toLocaleDateString('id-ID', { day: 'numeric' }) + ' – ' + dt.toLocaleDateString('id-ID', opts));
    const now = new Date();
    setText('lh-grafik-last-update', 'Update: ' + now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));

    // 2. Alerts dari insights
    const alertsContainer = document.getElementById('lh-grafik-alerts');
    if (alertsContainer) {
        const insights = Array.isArray(data.insights) ? data.insights : [];
        alertsContainer.innerHTML = insights.slice(0, 3).map(it => `
        <div style="background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); border-left: 3px solid ${it.color || 'var(--accent-blue)'}; border-radius: 4px; padding: 12px 16px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid ${it.icon || 'fa-circle-info'}" style="color: ${it.color || 'var(--accent-blue)'};"></i>
            <div style="font-size: 13px; color: var(--text-primary);">
                <span style="font-weight: 700;">${it.title}</span>${it.detail ? ' — ' + it.detail : ''}
            </div>
        </div>`).join('');
    }

    // 3. Summary cards (nilai terakhir)
    setText('lh-ga-val-gula', formatNumber(lastOf(cd.stockGula) ?? 0));
    setDiff('lh-ga-diff-gula', n > 1 ? (lastOf(cd.stockGula) - prevOf(cd.stockGula)) : null);
    setText('lh-ga-val-mol', formatNumber(lastOf(cd.stockMolasses) ?? 0));
    setDiff('lh-ga-diff-mol', n > 1 ? (lastOf(cd.stockMolasses) - prevOf(cd.stockMolasses)) : null);
    setText('lh-ga-val-cane', formatNumber(lastOf(cd.cane) ?? 0));
    setText('lh-ga-val-truck', '-');
    const delDays = Array.isArray(data.delivery) ? data.delivery : [];
    const lastDef = delDays.length ? delDays[delDays.length - 1].molDefisit : 0;
    setText('lh-ga-val-defisit', formatNumber(lastDef > 0 ? lastDef : 0));

    // 4. Tabel rata-rata per shift
    const shiftTable = document.getElementById('table-ga-shift');
    const shiftTbody = shiftTable ? shiftTable.querySelector('tbody') : null;
    if (shiftTbody) {
        const days = Math.max(n, 1);
        const shifts = Array.isArray(data.shiftPerformance) ? data.shiftPerformance : [];
        const bestGula = shifts.reduce((best, s) => Math.max(best, Number(s.gula) || 0), 0);
        const shiftNames = { 1: 'Shift I', 2: 'Shift II', 3: 'Shift III' };
        shiftTbody.innerHTML = shifts.length ? shifts.map(s => {
            const isBest = bestGula > 0 && Number(s.gula) === bestGula;
            const badge = isBest
                ? `<span class="badge balanced" style="margin-top: 0;">Terbaik</span>`
                : `<span class="badge" style="margin-top: 0;">Normal</span>`;
            const cell = 'text-align: right; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;';
            const unit = '<span style="font-size: 10px; font-weight: 400; color: var(--text-muted);">Ton</span>';
            return `<tr>
                <td style="text-align: left; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">${shiftNames[s.shift] || 'Shift ' + s.shift}</td>
                <td class="num" style="${cell}">${formatNumber((Number(s.gkm) || 0) / days)} ${unit}</td>
                <td class="num" style="${cell}">${formatNumber((Number(s.molasses) || 0) / days)} ${unit}</td>
                <td class="num" style="${cell}">${formatNumber((Number(s.cane) || 0) / days)} ${unit}</td>
                <td style="text-align: center; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle);">${badge}</td>
            </tr>`;
        }).join('') : '<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--text-muted);">Belum ada data shift.</td></tr>';
    }

    // 5. Charts
    const lineOpts = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } },
        scales: { y: { beginAtZero: true, grid: { color: 'rgba(200,200,200,0.1)' } }, x: { grid: { display: false } } }
    };

    const ctxGula = document.getElementById('chart-ga-gula')?.getContext('2d');
    if (ctxGula) {
        if (chartGaGula) chartGaGula.destroy();
        chartGaGula = new Chart(ctxGula, {
            type: 'line',
            data: { labels, datasets: [
                { label: 'GKM', data: cd.gkm || [], borderColor: '#FF6384', backgroundColor: 'rgba(255,99,132,0.1)', borderWidth: 2, fill: true, tension: 0.4 },
                { label: 'GKB', data: cd.gkb || [], borderColor: '#36A2EB', backgroundColor: 'rgba(54,162,235,0.1)', borderWidth: 2, fill: true, tension: 0.4 }
            ] },
            options: lineOpts
        });
    }

    const ctxMol = document.getElementById('chart-ga-molasses')?.getContext('2d');
    if (ctxMol) {
        if (chartGaMolasses) chartGaMolasses.destroy();
        chartGaMolasses = new Chart(ctxMol, {
            type: 'line',
            data: { labels, datasets: [
                { label: 'End balance molasses', data: cd.stockMolasses || [], borderColor: '#28a745', backgroundColor: 'rgba(40,167,69,0.1)', borderWidth: 2, fill: true, tension: 0.4 }
            ] },
            options: lineOpts
        });
    }

    const ctxDel = document.getElementById('chart-ga-delivery')?.getContext('2d');
    if (ctxDel) {
        const delLabels = delDays.map(d => {
            const dt2 = new Date(`${d.tanggal}T00:00:00`);
            return isNaN(dt2) ? d.tanggal : `${dt2.getDate()}/${dt2.getMonth() + 1}`;
        });
        if (chartGaDelivery) chartGaDelivery.destroy();
        chartGaDelivery = new Chart(ctxDel, {
            type: 'bar',
            data: { labels: delLabels, datasets: [
                { label: 'Schedule', data: delDays.map(d => d.molSchedule), backgroundColor: '#9bc2e6' },
                { label: 'Actual', data: delDays.map(d => d.molActual), backgroundColor: '#2f5597' },
                { label: 'Defisit', data: delDays.map(d => d.molDefisit > 0 ? d.molDefisit : 0), backgroundColor: '#ff5c5c' }
            ] },
            options: lineOpts
        });
    }
}
