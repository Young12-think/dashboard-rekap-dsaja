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

    if (btnText && captureArea) {
        btnText.addEventListener('click', () => {
            const mode = document.getElementById('limbahShiftSelect').value;
            const dparts = currentDate.split('-');
            let text = `*REPORT LIMBAH HARIAN*\n*Tanggal:* ${dparts[2]}/${dparts[1]}/${dparts[0]}\n`;
            
            if (mode === 'ALL_NO_TOTAL') {
                text += `*Shift:* Semua (Tanpa Total)\n\n`;
            } else if (mode !== 'ALL') {
                text += `*Shift:* ${mode}\n\n`;
            } else {
                text += `\n`;
            }

            const tables = captureArea.querySelectorAll('.report-table-wa');
            tables.forEach(table => {
                const title = table.querySelector('.report-head-title').innerText;
                const rows = table.querySelectorAll('tr');
                if (rows.length < 4) return;
                const tds = rows[3].querySelectorAll('td');

                text += `*[${title}]*\n`;
                if (mode === 'ALL') {
                    text += `SHIFT 1 : ${tds[0].innerText || '-'} Rit / ${tds[1].innerText || '-'} Kg\n`;
                    text += `SHIFT 2 : ${tds[2].innerText || '-'} Rit / ${tds[3].innerText || '-'} Kg\n`;
                    text += `SHIFT 3 : ${tds[4].innerText || '-'} Rit / ${tds[5].innerText || '-'} Kg\n`;
                    text += `*TOTAL*   : *${tds[6].innerText || '-'} Rit* / *${tds[7].innerText || '-'} Kg*\n\n`;
                } else if (mode === 'ALL_NO_TOTAL') {
                    text += `SHIFT 1 : ${tds[0].innerText || '-'} Rit / ${tds[1].innerText || '-'} Kg\n`;
                    text += `SHIFT 2 : ${tds[2].innerText || '-'} Rit / ${tds[3].innerText || '-'} Kg\n`;
                    text += `SHIFT 3 : ${tds[4].innerText || '-'} Rit / ${tds[5].innerText || '-'} Kg\n\n`;
                } else if (mode === '1') {
                    text += `SHIFT 1 : ${tds[0].innerText || '-'} Rit / ${tds[1].innerText || '-'} Kg\n\n`;
                } else if (mode === '2') {
                    text += `SHIFT 2 : ${tds[2].innerText || '-'} Rit / ${tds[3].innerText || '-'} Kg\n\n`;
                } else if (mode === '3') {
                    text += `SHIFT 3 : ${tds[4].innerText || '-'} Rit / ${tds[5].innerText || '-'} Kg\n\n`;
                }
            });

            const successAction = () => {
                btnText.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin!';
                setTimeout(() => btnText.innerHTML = '<i class="fa-solid fa-copy"></i> Salin Teks', 2000);
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

    if (btnImg && captureArea) {
        btnImg.addEventListener('click', async () => {
            if (typeof html2canvas === 'undefined') {
                alert('Library html2canvas belum dimuat.');
                return;
            }
            const mode = document.getElementById('limbahShiftSelect').value;
            btnImg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyalin...';

            try {
                let targetElement = captureArea;
                let offscreen = null;

                if (mode !== 'ALL') {
                    // Buat container offscreen untuk capture spesifik
                    offscreen = document.createElement('div');
                    let w = '560px';
                    if (mode !== 'ALL_NO_TOTAL') w = '320px'; // Lebar lebih kecil jika hanya 1 shift
                    
                    offscreen.style.cssText = `position:fixed; left:-9999px; top:0; background:#0d1117; padding:20px; width:${w};`;
                    document.body.appendChild(offscreen);

                    // Clone tanggal
                    const dateEl = captureArea.querySelector('#reportLimbahDateStr');
                    if (dateEl) {
                        const dateClone = document.createElement('div');
                        dateClone.style.cssText = 'background:#000; padding:10px 20px; display:inline-block; margin-bottom:20px; text-align:center;';
                        dateClone.innerHTML = `<h2 style="color:#f0c000; font-family:'Orbitron',sans-serif; margin:0; font-size:1.5rem; letter-spacing:2px;">${dateEl.textContent}</h2>`;
                        if (mode !== 'ALL_NO_TOTAL') {
                             dateClone.innerHTML += `<div style="color:#fff; font-size:1.2rem; margin-top:5px; font-weight:bold;">SHIFT ${mode}</div>`;
                        }
                        offscreen.appendChild(dateClone);
                    }

                    const tables = captureArea.querySelectorAll('.report-table-wa');
                    tables.forEach(table => {
                        const clone = document.createElement('table');
                        clone.style.cssText = 'width:100%; border-collapse:collapse; font-family:Arial,sans-serif; color:#000; background:#fff; margin-bottom:20px; table-layout:fixed;';

                        const rows = table.querySelectorAll('tr');
                        if (rows.length < 4) return;

                        const isFC = rows[1].classList.contains('bg-fc');
                        const headerBg = isFC ? '#aad050ff' : '#5c44c4ff';
                        const headerColor = isFC ? '#000' : '#fff';
                        
                        let colCount = mode === 'ALL_NO_TOTAL' ? 6 : 2;

                        // Title Row
                        const titleRow = document.createElement('tr');
                        const titleTd = document.createElement('th');
                        titleTd.colSpan = colCount;
                        titleTd.textContent = rows[0].querySelector('.report-head-title').textContent;
                        titleTd.style.cssText = `background:#000; color:#fff; padding:10px; font-size:18px; text-align:center; border:1px solid #000; font-weight:bold;`;
                        titleRow.appendChild(titleTd);
                        clone.appendChild(titleRow);

                        // Shift Headers Row
                        const shiftRow = document.createElement('tr');
                        shiftRow.style.cssText = `background:${headerBg}; color:${headerColor};`;
                        if (mode === 'ALL_NO_TOTAL') {
                            ['SHIFT 1', 'SHIFT 2', 'SHIFT 3'].forEach(label => {
                                const th = document.createElement('th');
                                th.colSpan = 2;
                                th.textContent = label;
                                th.style.cssText = `border:1px solid #000; text-align:center; padding:8px 4px; font-size:14px; font-weight:bold; width:33.33%;`;
                                shiftRow.appendChild(th);
                            });
                        } else {
                            const th = document.createElement('th');
                            th.colSpan = 2;
                            th.textContent = 'SHIFT ' + mode;
                            th.style.cssText = `border:1px solid #000; text-align:center; padding:8px 4px; font-size:14px; font-weight:bold; width:100%;`;
                            shiftRow.appendChild(th);
                        }
                        clone.appendChild(shiftRow);

                        // Sub headers Row (RIT / KG)
                        const subRow = document.createElement('tr');
                        subRow.style.cssText = `background:${headerBg}; color:${headerColor}; opacity:0.9;`;
                        let iters = mode === 'ALL_NO_TOTAL' ? 3 : 1;
                        let wth = mode === 'ALL_NO_TOTAL' ? '16.66%' : '50%';
                        for (let i = 0; i < iters; i++) {
                            ['RIT', 'KG'].forEach(label => {
                                const th = document.createElement('th');
                                th.textContent = label;
                                th.style.cssText = `border:1px solid #000; text-align:center; padding:6px 4px; font-size:14px; font-weight:bold; width:${wth};`;
                                subRow.appendChild(th);
                            });
                        }
                        clone.appendChild(subRow);

                        // Data Row
                        const dataRow = document.createElement('tr');
                        const origTds = rows[3].querySelectorAll('td');
                        
                        let idxStart = 0;
                        let numCells = 6;
                        if (mode === '1') { idxStart = 0; numCells = 2; }
                        else if (mode === '2') { idxStart = 2; numCells = 2; }
                        else if (mode === '3') { idxStart = 4; numCells = 2; }

                        for (let i = idxStart; i < idxStart + numCells && i < origTds.length; i++) {
                            const td = document.createElement('td');
                            td.textContent = origTds[i].textContent;
                            td.style.cssText = `border:1px solid #000; text-align:center; padding:8px 4px; font-size:14px; font-weight:bold; width:${wth};`;
                            dataRow.appendChild(td);
                        }
                        clone.appendChild(dataRow);
                        offscreen.appendChild(clone);
                    });
                    
                    targetElement = offscreen;
                }

                // Capture gambar
                const canvas = await html2canvas(targetElement, { backgroundColor: '#0d1117' });
                if (offscreen) document.body.removeChild(offscreen);

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
window.downloadBlob = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

window.copyTextFallback = function (txt) {
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
