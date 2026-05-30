/* static/js/report_limbah.js
 * Dipindahkan dari script.js baris 1756-1897, 2296-2326 tanpa perubahan logika.
 */

// =============================================
// REPORT LIMBAH EXPORT WA
// =============================================
async function loadReportLimbah() {
    const el = document.getElementById('reportLimbahContent');
    if (!el) return;
    
    // Update label tanggal
    const dateStrObj = document.getElementById('reportLimbahDateStr');
    if (dateStrObj) {
        const dparts = currentDate.split('-');
        dateStrObj.textContent = `${dparts[2]}/${dparts[1]}/${dparts[0]}`;
    }

    const d = await api(`/api/production?date=${currentDate}`);
    if (!d || d.status !== 'success' || !d.data) {
        el.innerHTML = errBlock('Gagal memuat data report limbah.');
        return;
    }

    let fc = null, fa = null;
    let otherLimbah = [];

    // Gunakan subtotal injeksi dari get_production_data()
    d.data.forEach(r => {
        if (r.type === '➡️ TOTAL TODAY FILTER CAKE') fc = r;
        else if (r.type === '➡️ TOTAL TODAY FLY ASH') fa = r;
        // Opsional: jika ingin menampilkan item limbah selain FC/FA:
        // else if (r.type.includes('BLOTONG') || r.type.includes('BOTTOM ASH') dll)
    });

    if (!fc && !fa) {
        el.innerHTML = emptyBlock('Tidak ada data limbah Filter Cake atau Fly Ash hari ini.');
        return;
    }

    // Builder tabel HTML
    const buildTable = (title, data, bgClass) => {
        if (!data) return '';
        return `
            <table class="report-table-wa" style="margin-bottom: 20px;">
                <tr>
                    <th colspan="8" class="report-head-title ${bgClass}">${title}</th>
                </tr>
                <tr class="${bgClass}">
                    <th colspan="2">SHIFT 1</th>
                    <th colspan="2">SHIFT 2</th>
                    <th colspan="2">SHIFT 3</th>
                    <th colspan="2">TOTAL</th>
                </tr>
                <tr class="${bgClass}" style="opacity: 0.9;">
                    <th>RIT</th><th>KG</th>
                    <th>RIT</th><th>KG</th>
                    <th>RIT</th><th>KG</th>
                    <th>RIT</th><th>KG</th>
                </tr>
                <tr>
                    <td>${data.shift1_ritase > 0 ? data.shift1_ritase : ''}</td>
                    <td>${data.shift1_tonase > 0 ? fmt(data.shift1_tonase) : ''}</td>
                    <td>${data.shift2_ritase > 0 ? data.shift2_ritase : ''}</td>
                    <td>${data.shift2_tonase > 0 ? fmt(data.shift2_tonase) : ''}</td>
                    <td>${data.shift3_ritase > 0 ? data.shift3_ritase : ''}</td>
                    <td>${data.shift3_tonase > 0 ? fmt(data.shift3_tonase) : ''}</td>
                    <td>${data.today_ritase > 0 ? data.today_ritase : ''}</td>
                    <td style="font-weight:900;">${data.today_tonase > 0 ? fmt(data.today_tonase) : ''}</td>
                </tr>
            </table>
        `;
    };

    let html = '';
    if (fc) html += buildTable('FILTER CAKE', fc, 'bg-fc');
    if (fa) html += buildTable('FLYASH', fa, 'bg-fa');

    el.innerHTML = html;
}

// Handler untuk tombol copy
// Handler untuk tombol copy
function initReportButtons() {
    const btnImg = document.getElementById('btnCopyReportImg');
    const btnText = document.getElementById('btnCopyReportText');
    const captureArea = document.getElementById('reportLimbahCaptureArea');

    if (btnImg && captureArea) {
        btnImg.addEventListener('click', async () => {
            if (typeof html2canvas === 'undefined') {
                alert('Library html2canvas belum dimuat.');
                return;
            }
            btnImg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyalin...';
            try {
                // Gunakan backgroundColor hitam agar mirip design aslinya
                const canvas = await html2canvas(captureArea, { backgroundColor: '#0d1117' });
                canvas.toBlob(blob => {
                    const fallbackDownload = () => {
                        window.downloadBlob(blob, 'report_limbah.png');
                        btnImg.innerHTML = '<i class="fa-solid fa-download"></i> Diunduh!';
                        setTimeout(() => btnImg.innerHTML = '<i class="fa-solid fa-image"></i> Salin Gambar', 2000);
                        alert('Browser memblokir salin gambar di koneksi HTTP biasa. Gambar otomatis diunduh ke perangkat Anda!');
                    };

                    if (navigator.clipboard && navigator.clipboard.write) {
                        const item = new ClipboardItem({ "image/png": blob });
                        navigator.clipboard.write([item]).then(() => {
                            btnImg.innerHTML = '<i class="fa-solid fa-check"></i> Disalin!';
                            setTimeout(() => btnImg.innerHTML = '<i class="fa-solid fa-image"></i> Salin Gambar', 2000);
                        }).catch(e => {
                            console.error('Clipboard write error', e);
                            fallbackDownload();
                        });
                    } else {
                        fallbackDownload();
                    }
                });
            } catch (err) {
                console.error(err);
                alert('Gagal membuat gambar.');
                btnImg.innerHTML = '<i class="fa-solid fa-image"></i> Salin Gambar';
            }
        });
    }

    if (btnText) {
        btnText.addEventListener('click', () => {
            // Kita generate text plain yang rapi
            const dparts = currentDate.split('-');
            let text = `*REPORT LIMBAH HARIAN*\n*Tanggal:* ${dparts[2]}/${dparts[1]}/${dparts[0]}\n\n`;

            const getVal = (v) => (!v || v === 0) ? '-' : fmt(v);

            // Fungsi ambil data dari element DOM by index (quick & dirty way karena data sudah dirender HTML)
            const tables = captureArea.querySelectorAll('.report-table-wa');
            tables.forEach(table => {
                const title = table.querySelector('.report-head-title').innerText;
                const rows = table.querySelectorAll('tr');
                if (rows.length < 4) return;
                const tds = rows[3].querySelectorAll('td');

                text += `*[${title}]*\n`;
                text += `SHIFT 1 : ${tds[0].innerText || '-'} Rit / ${tds[1].innerText || '-'} Kg\n`;
                text += `SHIFT 2 : ${tds[2].innerText || '-'} Rit / ${tds[3].innerText || '-'} Kg\n`;
                text += `SHIFT 3 : ${tds[4].innerText || '-'} Rit / ${tds[5].innerText || '-'} Kg\n`;
                text += `*TOTAL*   : *${tds[6].innerText || '-'} Rit* / *${tds[7].innerText || '-'} Kg*\n\n`;
            });

            const successAction = () => {
                btnText.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin!';
                setTimeout(() => btnText.innerHTML = '<i class="fa-solid fa-copy"></i> Salin Teks WA', 2000);
            };

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(successAction).catch(e => {
                    if (window.copyTextFallback(text)) successAction();
                    else alert('Gagal menyalin text.');
                });
            } else {
                if (window.copyTextFallback(text)) successAction();
                else alert('Gagal menyalin text.');
            }
        });
    }
}

// Fungsi helper screenshot
async function captureToClipboard(elemId, btnId, origHtml) {
    const btn = document.getElementById(btnId);
    const area = document.getElementById(elemId);
    if (!btn || !area) return;
    
    if (typeof html2canvas === 'undefined') {
        alert('Library html2canvas belum dimuat.');
        return;
    }

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyalin...';
    try {
        const canvas = await html2canvas(area, { backgroundColor: '#0d1219' });
        canvas.toBlob(blob => {
            const fallbackDownload = () => {
                window.downloadBlob(blob, elemId + '.png');
                btn.innerHTML = '<i class="fa-solid fa-download"></i> Diunduh!';
                setTimeout(() => btn.innerHTML = origHtml, 2000);
                alert('Browser memblokir salin gambar di koneksi HTTP biasa. Gambar otomatis diunduh ke perangkat Anda!');
            };

            if (navigator.clipboard && navigator.clipboard.write) {
                const item = new ClipboardItem({ "image/png": blob });
                navigator.clipboard.write([item]).then(() => {
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> Disalin!';
                    setTimeout(() => btn.innerHTML = origHtml, 2000);
                }).catch(e => {
                    console.error(e);
                    fallbackDownload();
                });
            } else {
                fallbackDownload();
            }
        });
    } catch (err) {
        console.error(err);
        alert('Terjadi kesalahan capture.');
        btn.innerHTML = origHtml;
    }
}

// Global helpers untuk download blob dan copy fallback
window.downloadBlob = function(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

window.copyTextFallback = function(txt) {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.setAttribute('readonly', ''); // Cegah keyboard mobile muncul
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.style.width = '2em';
    ta.style.height = '2em';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    
    document.body.appendChild(ta);
    
    // Simpan selection yang aktif sebelum copy
    const selected = document.getSelection().rangeCount > 0 
        ? document.getSelection().getRangeAt(0) 
        : false;
        
    ta.select();
    ta.setSelectionRange(0, txt.length); // Seleksi teks secara aman
    
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (err) {
        console.error('execCommand copy error', err);
    }
    
    document.body.removeChild(ta);
    
    // Kembalikan selection awal agar tidak terkunci
    if (selected) {
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(selected);
    }
    
    return ok;
};
