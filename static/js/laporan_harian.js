let currentLhDate = new Date();

function formatNumber(num) {
    if (!num && num !== 0) return '-';
    return Number(num).toLocaleString('id-ID', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function updateLhDateDisplay() {
    const opts = { day: '2-digit', month: 'long', year: 'numeric' };
    const dateEl = document.getElementById('lh-display-date');
    const pickerEl = document.getElementById('lh-date-picker');
    
    if (dateEl) dateEl.innerText = '📅 ' + currentLhDate.toLocaleDateString('id-ID', opts);
    if (pickerEl) pickerEl.value = currentLhDate.toISOString().split('T')[0];
    
    // Fetch data whenever date changes
    fetchLaporanHarian();
    fetchGrafikAnalitik();
}

function changeLhDate(days) {
    currentLhDate.setDate(currentLhDate.getDate() + days);
    updateLhDateDisplay();
}

document.addEventListener('DOMContentLoaded', () => {
    // Initial setup if elements exist
    if (document.getElementById('lh-display-date')) {
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

        // Period buttons listener
        const periodBtns = document.querySelectorAll('.lh-grafik-btn-period');
        periodBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                periodBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentGrafikDays = parseInt(e.target.getAttribute('data-days')) || 7;
                document.getElementById('lh-ga-del-days').innerText = currentGrafikDays;
                fetchGrafikAnalitik();
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
            
            // Gula Balance
            document.getElementById('lh-val-gula-open').innerText = formatNumber(d.gula.openBalance);
            document.getElementById('lh-val-gula-prod').innerText = formatNumber(d.gula.produksi.total);
            document.getElementById('lh-val-gula-total').innerText = formatNumber(d.gula.openBalance + d.gula.produksi.total);
            document.getElementById('lh-val-gula-del').innerText = formatNumber(d.gula.delivery.actual);
            document.getElementById('lh-val-gula-end').innerText = formatNumber(d.gula.endBalance);
            
            document.getElementById('lh-val-gkb-stok').innerText = formatNumber(d.gula.stokGkb);
            document.getElementById('lh-val-gkm-stok').innerText = formatNumber(d.gula.stokGkm);
            document.getElementById('lh-val-gula-reject').innerText = formatNumber(d.gula.reject);
            
            // Gula Prod Table
            const prodGulaTbody = document.getElementById('lh-table-prod-gula').querySelector('tbody');
            prodGulaTbody.innerHTML = `
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift I</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[1]?.gkb)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[1]?.gkm)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[1]?.reject)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(d.gula.produksi[1])}</td></tr>
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift II</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[2]?.gkb)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[2]?.gkm)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[2]?.reject)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(d.gula.produksi[2])}</td></tr>
                <tr><td style="text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">Shift III</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[3]?.gkb)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[3]?.gkm)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle);">${formatNumber(d.gula.produksiDetail[3]?.reject)}</td><td class="num" style="text-align: right; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(d.gula.produksi[3])}</td></tr>
                <tr style="background: var(--accent-blue-dim);"><td style="text-align: left; padding: 12px 8px; font-weight: 700; color: var(--accent-blue); border: none;">Total</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber((d.gula.produksiDetail[1]?.gkb||0)+(d.gula.produksiDetail[2]?.gkb||0)+(d.gula.produksiDetail[3]?.gkb||0))}</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber((d.gula.produksiDetail[1]?.gkm||0)+(d.gula.produksiDetail[2]?.gkm||0)+(d.gula.produksiDetail[3]?.gkm||0))}</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber((d.gula.produksiDetail[1]?.reject||0)+(d.gula.produksiDetail[2]?.reject||0)+(d.gula.produksiDetail[3]?.reject||0))}</td><td class="num" style="text-align: right; font-weight: 700; color: var(--accent-blue); border: none;">${formatNumber(d.gula.produksi.total)}</td></tr>
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
            document.getElementById('lh-val-mol-open').innerText = formatNumber(d.molasses.openBalance);
            document.getElementById('lh-val-mol-prod').innerText = formatNumber(d.molasses.produksi.total);
            document.getElementById('lh-val-mol-total').innerText = formatNumber((d.molasses.openBalance + d.molasses.produksi.total));
            document.getElementById('lh-val-mol-del').innerText = formatNumber(d.molasses.delivery.actual);
            document.getElementById('lh-val-mol-end').innerText = formatNumber(d.molasses.endBalance);
            
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

            document.getElementById('lh-mol-plan').innerText = formatNumber(d.molasses.delivery.schedule);
            document.getElementById('lh-mol-actual').innerText = formatNumber(d.molasses.delivery.actual);
            document.getElementById('lh-mol-diff').innerText = formatNumber(d.molasses.delivery.diff);

            // Cane received info (Cumulative & Today, Convert Kg to Ton)
            document.getElementById('lh-cane-prev').innerText = formatNumber(d.cane.kumulatif);
            document.getElementById('lh-cane-truck-prev').innerText = formatNumber(d.cane.kumulatifTruck);
            document.getElementById('lh-cane-today').innerText = formatNumber(d.cane.hariIni);
            document.getElementById('lh-cane-truck-today').innerText = formatNumber(d.cane.hariIniTruck);

            // Cane Table
            const caneTbody = document.getElementById('lh-table-cane').querySelector('tbody');
            // Provide default values if shift data is missing
            const s1 = d.cane.perShift.find(x => x.shift === 1) || {caneKg: 0, truck: 0};
            const s2 = d.cane.perShift.find(x => x.shift === 2) || {caneKg: 0, truck: 0};
            const s3 = d.cane.perShift.find(x => x.shift === 3) || {caneKg: 0, truck: 0};

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

async function fetchGrafikAnalitik() {
    const dateStr = currentLhDate.toISOString().split('T')[0];
    try {
        const res = await fetch(`/api/rmi-balance/grafik-analitik?date=${dateStr}&days=${currentGrafikDays}`);
        const result = await res.json();
        
        if (result.status === 'success') {
            const data = result.data;
            renderGrafikAnalitik(data);
        }
    } catch (e) {
        console.error("Failed to fetch grafik analitik", e);
    }
}

function renderGrafikAnalitik(data) {
    // 1. Update Date Range & Time
    const opts = { day: 'numeric', month: 'long', year: 'numeric' };
    const df = new Date(data.date_from);
    const dt = new Date(data.date_to);
    document.getElementById('lh-grafik-date-range').innerText = df.toLocaleDateString('id-ID', {day:'numeric'}) + ' – ' + dt.toLocaleDateString('id-ID', opts);
    
    const now = new Date();
    document.getElementById('lh-grafik-last-update').innerText = 'Update: ' + now.toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'}) + ', ' + now.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});

    // 2. Alert Banners
    const alertsContainer = document.getElementById('lh-grafik-alerts');
    alertsContainer.innerHTML = '';
    
    if (data.alerts.molassesDefisit) {
        alertsContainer.innerHTML += `
        <div style="background: rgba(255, 99, 132, 0.1); border: 1px solid rgba(255, 99, 132, 0.3); border-radius: 4px; padding: 12px 16px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-triangle-exclamation" style="color: var(--accent-red);"></i>
            <div style="font-size: 13px; color: var(--text-primary);">
                <span style="font-weight: 700; color: var(--accent-red);">Defisit delivery molasses</span> — Actual ${formatNumber(data.alerts.molassesDefisit.actual)} Ton vs schedule ${formatNumber(data.alerts.molassesDefisit.schedule)} Ton. Selisih ${formatNumber(data.alerts.molassesDefisit.defisit)} Ton hari ini.
            </div>
        </div>`;
    }
    
    if (data.alerts.gulaOnTrack) {
        alertsContainer.innerHTML += `
        <div style="background: rgba(40, 167, 69, 0.1); border: 1px solid rgba(40, 167, 69, 0.3); border-radius: 4px; padding: 12px 16px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-check" style="color: var(--accent-green);"></i>
            <div style="font-size: 13px; color: var(--text-primary);">
                <span style="font-weight: 700; color: var(--accent-green);">Produksi gula on-track</span> — End balance ${formatNumber(data.alerts.gulaOnTrack.endBalance)} Ton, stok aman.
            </div>
        </div>`;
    }

    // 3. Update Summary Cards (Latest Data)
    if (data.tren.length > 0) {
        const lastTren = data.tren[data.tren.length - 1];
        const prevTren = data.tren.length > 1 ? data.tren[data.tren.length - 2] : null;

        // Gula
        document.getElementById('lh-ga-val-gula').innerText = formatNumber(lastTren.gulaEndBalance);
        if (prevTren) {
            const diffGula = lastTren.gulaEndBalance - prevTren.gulaEndBalance;
            const diffGulaEl = document.getElementById('lh-ga-diff-gula');
            if (diffGula !== 0) {
                diffGulaEl.style.display = 'inline-block';
                diffGulaEl.innerHTML = (diffGula > 0 ? '<i class="fa-solid fa-caret-up"></i> +' : '<i class="fa-solid fa-caret-down"></i> ') + formatNumber(Math.abs(diffGula));
                diffGulaEl.style.color = diffGula > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                diffGulaEl.style.background = diffGula > 0 ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)';
            } else {
                diffGulaEl.style.display = 'none';
            }
        }

        // Molasses
        document.getElementById('lh-ga-val-mol').innerText = formatNumber(lastTren.molassesEndBalance);
        if (prevTren) {
            const diffMol = lastTren.molassesEndBalance - prevTren.molassesEndBalance;
            const diffMolEl = document.getElementById('lh-ga-diff-mol');
            if (diffMol !== 0) {
                diffMolEl.style.display = 'inline-block';
                diffMolEl.innerHTML = (diffMol > 0 ? '<i class="fa-solid fa-caret-up"></i> +' : '<i class="fa-solid fa-caret-down"></i> ') + formatNumber(Math.abs(diffMol));
                diffMolEl.style.color = diffMol > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
                diffMolEl.style.background = diffMol > 0 ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)';
            } else {
                diffMolEl.style.display = 'none';
            }
        }

        // Cane
        document.getElementById('lh-ga-val-cane').innerText = formatNumber(lastTren.caneHariIni);
        // Assuming we pass truck as well in tren, but for now we fallback to 0 or calculate from delivery
        document.getElementById('lh-ga-val-truck').innerText = '-'; 
    }

    if (data.delivery.length > 0) {
        const lastDel = data.delivery[data.delivery.length - 1];
        document.getElementById('lh-ga-val-defisit').innerText = formatNumber(lastDel.molDefisit > 0 ? lastDel.molDefisit : 0);
    }

    // 4. Render Table Rata-rata Shift
    const shiftTbody = document.getElementById('table-ga-shift').querySelector('tbody');
    shiftTbody.innerHTML = '';
    const shiftNames = {1: 'Shift I', 2: 'Shift II', 3: 'Shift III'};
    data.shiftSummary.forEach(s => {
        let statusBadge = `<span style="background: var(--accent-green-dim); color: var(--accent-green); padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 11px;">Normal</span>`;
        if (s.status === 'Terbaik') {
            statusBadge = `<span style="background: var(--accent-blue-dim); color: var(--accent-blue); padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 11px;">Terbaik</span>`;
        }
        shiftTbody.innerHTML += `
            <tr>
                <td style="text-align: left; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary);">${shiftNames[s.shift] || 'Shift '+s.shift}</td>
                <td class="num" style="text-align: right; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(s.avgGkm)} <span style="font-size: 10px; font-weight: 400; color: var(--text-muted);">Ton</span></td>
                <td class="num" style="text-align: right; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(s.avgMolasses)} <span style="font-size: 10px; font-weight: 400; color: var(--text-muted);">Ton</span></td>
                <td class="num" style="text-align: right; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">${formatNumber(s.avgCane)} <span style="font-size: 10px; font-weight: 400; color: var(--text-muted);">Ton</span></td>
                <td style="text-align: center; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle);">${statusBadge}</td>
            </tr>
        `;
    });

    // 5. Render Charts
    const labels = data.tren.map(t => {
        const dateObj = new Date(t.tanggal);
        return dateObj.getDate() + '/' + (dateObj.getMonth() + 1);
    });
    
    // Gula Chart
    const gkbData = data.tren.map(t => t.produksiGkb);
    const gkmData = data.tren.map(t => t.produksiGkm);
    
    if (chartGaGula) chartGaGula.destroy();
    const ctxGula = document.getElementById('chart-ga-gula').getContext('2d');
    chartGaGula = new Chart(ctxGula, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'GKM',
                    data: gkmData,
                    borderColor: '#FF6384',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'GKB',
                    data: gkbData,
                    borderColor: '#36A2EB',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } },
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(200,200,200,0.1)' } }, x: { grid: { display: false } } }
        }
    });

    // Molasses Chart
    const molBalData = data.tren.map(t => t.molassesEndBalance);
    
    if (chartGaMolasses) chartGaMolasses.destroy();
    const ctxMol = document.getElementById('chart-ga-molasses').getContext('2d');
    chartGaMolasses = new Chart(ctxMol, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'End balance molasses',
                    data: molBalData,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } },
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(200,200,200,0.1)' } }, x: { grid: { display: false } } }
        }
    });

    // Delivery Chart
    const delLabels = data.delivery.map(d => {
        const dateObj = new Date(d.tanggal);
        return dateObj.getDate() + '/' + (dateObj.getMonth() + 1);
    });
    const delSched = data.delivery.map(d => d.molSchedule);
    const delAct = data.delivery.map(d => d.molActual);
    const delDef = data.delivery.map(d => d.molDefisit > 0 ? d.molDefisit : 0);

    if (chartGaDelivery) chartGaDelivery.destroy();
    const ctxDel = document.getElementById('chart-ga-delivery').getContext('2d');
    chartGaDelivery = new Chart(ctxDel, {
        type: 'bar',
        data: {
            labels: delLabels,
            datasets: [
                { label: 'Schedule', data: delSched, backgroundColor: '#9bc2e6' },
                { label: 'Actual', data: delAct, backgroundColor: '#2f5597' },
                { label: 'Defisit', data: delDef, backgroundColor: '#ff5c5c' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } },
            scales: { 
                y: { beginAtZero: true, grid: { color: 'rgba(200,200,200,0.1)' } },
                x: { grid: { display: false } }
            }
        }
    });
}
