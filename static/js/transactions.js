/* static/js/transactions.js
 * Dipindahkan dari script.js baris 474-545, 679-1416 tanpa perubahan logika.
 */

/**
 * Muat ulang dropdown Vendor berdasarkan item & rentang tanggal (cascading).
 * @param {string} selectedItem - Nama item terpilih. Kosong = semua vendor.
 */
async function refreshSupportVendors(selectedItem) {
    const vendorSel = document.getElementById('supportVendorFilter');
    if (!vendorSel) return;

    // Ambil date range aktif dari input filter
    const dateFrom = document.getElementById('txDateFrom')?.value || txDateFrom;
    const dateTo   = document.getElementById('txDateTo')?.value   || txDateTo;

    let endpoint = `/api/support-vendors?date_from=${dateFrom}&date_to=${dateTo}`;
    if (selectedItem) endpoint += `&item=${encodeURIComponent(selectedItem)}`;

    const vRes = await api(endpoint);
    if (vRes && vRes.status === 'success') {
        vendorSel.innerHTML = '<option value="">Semua Vendor</option>' +
            vRes.data.map(v => {
                const sel = currentSupportVendor === v ? 'selected' : '';
                return `<option value="${v}" ${sel}>${v}</option>`;
            }).join('');
    }
}

// =============================================
// HELPER: Persingkat nama Support Item untuk Dropdown
// =============================================
/**
 * Mengubah nama ItemName panjang dari DB menjadi nama ringkas untuk dropdown.
 * Contoh:
 *   "SACK PP BLUE 50 KG BERAT NETTO GULA" → "SACK PP BLUE"
 */
function shortenSupportLabel(name) {
    if (!name) return name;

    let s = name.trim();

    // 1. Hapus kata-kata suffix umum yang tidak informatif (case-insensitive)
    const suffixPatterns = [
        /\s+\d+\s*KG\b.*$/i,          // "50 KG ..." ke belakang
        /\s+BERAT\s+NETTO.*$/i,        // "BERAT NETTO ..." ke belakang
        /\s+UNTUK\s+GULA.*$/i,         // "UNTUK GULA ..." ke belakang
        /\s+UNTUK\s+PENGIRIMAN.*$/i,   // "UNTUK PENGIRIMAN ..." ke belakang
        /\s+SUPPORT\s+OPERASIONAL.*$/i,// "SUPPORT OPERASIONAL ..." ke belakang
        /\s+OPERASIONAL.*$/i,          // "OPERASIONAL ..." ke belakang
    ];
    for (const pat of suffixPatterns) {
        s = s.replace(pat, '').trim();
    }

    // 2. Potong di kata "/" yang ke-2 ke belakang agar tidak terlalu panjang
    const slashIdx = s.indexOf(' / ');
    if (slashIdx !== -1) {
        // Cek apakah ada slash kedua setelah slash pertama
        const slashIdx2 = s.indexOf(' / ', slashIdx + 3);
        if (slashIdx2 !== -1) {
            s = s.substring(0, slashIdx2).trim();
        }
    }

    // 3. Jika masih panjang (> 32 karakter), potong di kata terakhir yang pas
    const MAX_LEN = 32;
    if (s.length > MAX_LEN) {
        // Potong di spasi terdekat sebelum batas
        const cutAt = s.lastIndexOf(' ', MAX_LEN);
        s = (cutAt > 10 ? s.substring(0, cutAt) : s.substring(0, MAX_LEN)) + '…';
    }

    return s || name; // Fallback ke nama asli jika hasil kosong
}


// =============================================
// TRANSACTION SUB-MENU SYSTEM
// =============================================

function buildTransactionSubmenu() {
    const submenu = document.getElementById('transactionSubmenu');
    if (!submenu) return;
    let html = '';
    for (const [key, config] of Object.entries(TRANSACTION_TYPES)) {
        html += `<li data-page="transactions" data-txtype="${key}">
            <a href="#">
                <i class="fa-solid ${config.icon}" style="color:${config.color}"></i>
                <span>${config.label}</span>
            </a>
        </li>`;
    }
    submenu.innerHTML = html;
}

/**
 * Main loader for transaction data.
 * Builds filters, fetches data, renders paginated table.
 */
async function loadTransactionData(typeKey) {
    const config = TRANSACTION_TYPES[typeKey];
    if (!config) return;

    document.getElementById('transactionTitle').textContent = `Transaksi ${config.label}`;
    document.getElementById('btnExportExcel').style.display = 'inline-flex';

    if (lastBuiltTxType !== typeKey) {
        buildTransactionFilters(typeKey);
        buildTransactionHeader(typeKey);
        lastBuiltTxType = typeKey;
    }
    document.getElementById('poSummary').innerHTML = '';

   // Show loading
    const colCount = config.columns.length + 1; // +1 for No column
    const tbody = document.getElementById('transactionTableBody');
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="loading-cell">
        <div class="loader"></div> Memuat data ${config.label}...
    </td></tr>`;
    document.getElementById('transactionPagination').innerHTML = '';

    // 👇 1. TENTUKAN FILTER DULU
    let filters = config.filters;
    
    if (typeKey === 'limbah' && currentLimbahFilter) {
        // Limbah: value-nya comma-separated group (misal "FILTER CAKE,BLOTONG")
        filters = currentLimbahFilter.split(',');
    }
    // Support: filter item TIDAK ikut campur di array `filters`,
    // karena nama item bisa mengandung koma → dikirim lewat param terpisah: `support_item`

    // 👇 2. TARIK DATA PO (Khusus Limbah)
    if (typeKey === 'limbah') {
        const poRes = await api('/api/po-stock');
        if (poRes && poRes.status === 'success') poStocks = poRes.data || {};
        
        const filterStrPO = encodeURIComponent(filters.join(','));
        const poNumRes = await api(`/api/po-numbers?type=${filterStrPO}`);
        
        if (poNumRes && poNumRes.status === 'success') {
            poNumbers = poNumRes.data || [];
            updatePODropdown();
        }
    }

    // 👇 3. AMBIL ITEM & VENDOR DARI DATABASE (Khusus Support)
    if (typeKey === 'support') {
        // 3a. Ambil daftar item unik
        const res = await api('/api/support-items');
        if (res && res.status === 'success') {
            const options = [{ label: 'Semua Item', value: '' }];
            res.data.forEach(itemName => {
                options.push({
                    label: shortenSupportLabel(itemName),
                    value: itemName
                });
            });
            TRANSACTION_TYPES.support.itemFilterOptions = options;
            const itemSelect = document.getElementById('supportItemFilter');
            if (itemSelect) {
                itemSelect.innerHTML = options.map(opt => {
                    const sel = currentLimbahFilter === opt.value ? 'selected' : '';
                    return `<option value="${opt.value}" ${sel} title="${opt.value}">${opt.label}</option>`;
                }).join('');
            }
        }

        // 3b. Ambil daftar vendor — cascading sesuai item yang aktif
        await refreshSupportVendors(currentLimbahFilter);
    }

    // 👇 4. BANGUN URL API
    // Support: kirim filter item via param `support_item` (bukan via `type`) agar tidak kena split koma
    let url = `/api/transactions?tx_key=${typeKey}&type=${encodeURIComponent(filters.join(','))}&date_from=${txDateFrom}&date_to=${txDateTo}`;
    if (typeKey === 'limbah' && currentPOFilter) url += `&po=${encodeURIComponent(currentPOFilter)}`;
    if (typeKey === 'support' && currentLimbahFilter) url += `&support_item=${encodeURIComponent(currentLimbahFilter)}`;
    if (typeKey === 'support' && currentSupportVendor) url += `&support_vendor=${encodeURIComponent(currentSupportVendor)}`;
    
    const keyword = document.getElementById('txSearchKeyword')?.value || '';
    if (keyword) url += `&search=${encodeURIComponent(keyword)}`;
    
    url += `&page=${txCurrentPage + 1}&limit=100`; // 100 Baris per halaman

    const d = await api(url);

    if (!d || d.status !== 'success') {
        tbody.innerHTML = errRow(colCount, 'Gagal memuat data.');
        return;
    }
    
    const countEl = document.getElementById('txResultCount');
    if (countEl) countEl.textContent = `${d.total_rows} data ditemukan`;

    if (!d.data || d.data.length === 0) {
        tbody.innerHTML = emptyRow(colCount, `Tidak ada data yang cocok.`);
        return;
    }

    // Tampilkan data matang dari Server
    renderTransactionSummary(typeKey, d.summary);
    renderTransactionPage(typeKey, d.data, d.total_rows);
}



/**
 * Builds the date range filter + optional item/PO filters.
 * ★ EDIT LOCATION: Semua filter transaksi dibangun di sini.
 */
/**
 * Builds the date range filter + optional item/PO filters.
 */
function buildTransactionFilters(typeKey) {
    const config = TRANSACTION_TYPES[typeKey];
    const container = document.getElementById('transactionFilters');

    let html = `<div class="transaction-filter-bar">
        <div class="filter-group">
            <span class="filter-label"><i class="fa-regular fa-calendar"></i> Dari:</span>
            <input type="date" id="txDateFrom" class="filter-date-input" value="${txDateFrom}">
        </div>
        <div class="filter-group">
            <span class="filter-label">Sampai:</span>
            <input type="date" id="txDateTo" class="filter-date-input" value="${txDateTo}">
        </div>
        <div class="filter-group">
            <span class="filter-label"><i class="fa-solid fa-search"></i> Cari:</span>
            <input type="text" id="txSearchKeyword" class="filter-date-input" placeholder="Nopol, SPM, Supir..." style="width: 180px;">
        </div>
        <button class="btn-filter" id="btnTxFilter">
            <i class="fa-solid fa-magnifying-glass"></i> Tampilkan
        </button>
        <span class="tx-result-count" id="txResultCount"></span>
    </div>`;

    // Limbah / Support extra filters
    if (config.hasItemFilter || config.hasPOFilter || config.hasVendorFilter) {
        html += `<div class="transaction-filter-bar limbah-filters">`;

        if (config.hasItemFilter) {
            // Support pakai id='supportItemFilter', Limbah pakai id='limbahItemFilter'
            const filterId = typeKey === 'support' ? 'supportItemFilter' : 'limbahItemFilter';
            html += `<div class="filter-group">
                <span class="filter-label"><i class="fa-solid fa-box"></i> Item:</span>
                <select class="filter-select" id="${filterId}">`;
            for (const opt of config.itemFilterOptions) {
                const selected = currentLimbahFilter === opt.value ? 'selected' : '';
                html += `<option value="${opt.value}" ${selected} title="${opt.value}">${opt.label}</option>`;
            }
            html += `</select></div>`;
        }

        // Dropdown Vendor — khusus support
        if (config.hasVendorFilter) {
            html += `<div class="filter-group">
                <span class="filter-label"><i class="fa-solid fa-building"></i> Vendor:</span>
                <select class="filter-select" id="supportVendorFilter">
                    <option value="">Semua Vendor</option>
                </select>
            </div>`;
        }

        if (config.hasPOFilter) {
            html += `<div class="filter-group">
                <span class="filter-label"><i class="fa-solid fa-file-invoice"></i> PO:</span>
                <select class="filter-select" id="poFilter">
                    <option value="">Semua PO</option>
                </select>
            </div>
            <button class="btn-edit-po" id="btnEditPO" style="display:none">
                <i class="fa-solid fa-pen-to-square"></i> Edit Target
            </button>
            <button class="btn-edit-po" id="btnClosePO" style="display:none; background: rgba(248,81,73,0.15); color: #f85149; border-color: rgba(248,81,73,0.3);">
                <i class="fa-solid fa-check-double"></i> Tutup PO
            </button>`;
        }

        html += `</div>`;
    }

    container.innerHTML = html;

    // Attach events
    document.getElementById('btnTxFilter').addEventListener('click', () => {
        txDateFrom = document.getElementById('txDateFrom').value;
        txDateTo = document.getElementById('txDateTo').value;
        txCurrentPage = 0;
        loadTransactionData(typeKey);
    });

    const searchInput = document.getElementById('txSearchKeyword');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            applyTxSearch(typeKey);
        });
    }

    // Item filter: Support
    if (config.hasItemFilter && typeKey === 'support') {
        document.getElementById('supportItemFilter').addEventListener('change', async e => {
            currentLimbahFilter = e.target.value;
            currentSupportVendor = ''; // Reset vendor saat item berubah
            txCurrentPage = 0;
            // Refresh dropdown vendor dulu sesuai item baru, lalu load data
            await refreshSupportVendors(currentLimbahFilter);
            loadTransactionData(typeKey);
        });
    }

    // Item filter: Limbah
    if (config.hasItemFilter && typeKey !== 'support') {
        document.getElementById('limbahItemFilter').addEventListener('change', e => {
            currentLimbahFilter = e.target.value;
            currentPOFilter = '';
            txCurrentPage = 0;
            loadTransactionData(typeKey);
        });
    }

    // Vendor filter: Support
    if (config.hasVendorFilter) {
        document.getElementById('supportVendorFilter').addEventListener('change', e => {
            currentSupportVendor = e.target.value;
            txCurrentPage = 0;
            loadTransactionData(typeKey);
        });
    }

    if (config.hasPOFilter) {
        document.getElementById('poFilter').addEventListener('change', e => {
            currentPOFilter = e.target.value;
            txCurrentPage = 0;
            const editBtn = document.getElementById('btnEditPO');
            const closeBtn = document.getElementById('btnClosePO');
            if (editBtn) editBtn.style.display = currentPOFilter ? 'inline-flex' : 'none';
            if (closeBtn) closeBtn.style.display = currentPOFilter ? 'inline-flex' : 'none';
            loadTransactionData(typeKey);
        });
        
        const editBtn = document.getElementById('btnEditPO');
        const closeBtn = document.getElementById('btnClosePO');
        
        if (editBtn) {
            editBtn.style.display = currentPOFilter ? 'inline-flex' : 'none';
            editBtn.addEventListener('click', () => {
                if (currentPOFilter) openEditPOModal(currentPOFilter);
            });
        }
        
        if (closeBtn) {
            closeBtn.style.display = currentPOFilter ? 'inline-flex' : 'none';
            closeBtn.addEventListener('click', async () => {
                if (currentPOFilter) {
                    if (confirm(`Yakin ingin MENUTUP / FINISH PO ${currentPOFilter}?\nPO ini akan dihapus dari daftar dropdown dan monitor aktif.`)) {
                        const res = await apiPost('/api/po-close', { nomor_po: currentPOFilter });
                        if (res && res.status === 'success') {
                            currentPOFilter = '';
                            loadTransactionData(typeKey);
                        } else {
                            alert('Gagal menutup PO!');
                        }
                    }
                }
            });
        }
    }
}

/** Update the PO dropdown with loaded PO numbers */
function updatePODropdown() {
    const sel = document.getElementById('poFilter');
    if (!sel) return;
    let html = '<option value="">Semua PO</option>';
    for (const po of poNumbers) {
        const selected = currentPOFilter === po ? 'selected' : '';
        html += `<option value="${po}" ${selected}>${po}</option>`;
    }
    sel.innerHTML = html;
}

/** Build table header with auto-No + config columns */
function buildTransactionHeader(typeKey) {
    const config = TRANSACTION_TYPES[typeKey];
    const thead = document.getElementById('transactionTableHead');
    let headerCells = '<th>No</th>';
    headerCells += config.columns.map(col => `<th>${col.label}</th>`).join('');
    thead.innerHTML = `<tr>${headerCells}</tr>`;
}

/** Render the current page of data (pagination) */
function renderTransactionPage(typeKey) {
    const config = TRANSACTION_TYPES[typeKey];
    const tbody = document.getElementById('transactionTableBody');

    // Helper functions untuk normalisasi
    const normalizeStr = (str) => (str || '').toString().toLowerCase().replace(/\s+/g, '');
    const parseTimeMs = (tgl, jam) => {
        if (!jam) return 0;
        let datePart = (tgl || '').split(' ')[0];
        if (datePart.includes('/')) {
            const p = datePart.split('/');
            if (p.length === 3) datePart = `${p[2]}-${p[1]}-${p[0]}`; 
        }
        const ms = new Date(`${datePart}T${jam}`).getTime();
        return isNaN(ms) ? 0 : ms;
    };

    // Fungsi untuk ngecek apakah 2 baris itu "Satu Grup"
    const isSameGroup = (rowA, rowB) => {
        if (typeKey !== 'gula') return false;
        const nopolA = normalizeStr(rowA.nopol);
        const supirA = normalizeStr(rowA.supir);
        const timeA = parseTimeMs(rowA.tanggal_keluar, rowA.jam_keluar);

        const nopolB = normalizeStr(rowB.nopol);
        const supirB = normalizeStr(rowB.supir);
        const timeB = parseTimeMs(rowB.tanggal_keluar, rowB.jam_keluar);

        return nopolA !== '' && nopolA === nopolB && supirA === supirB && Math.abs(timeA - timeB) <= (30 * 60000);
    };

    // ============================================================
    // 1. SMART PAGINATION: Hitung batas halaman agar grup tidak putus
    // ============================================================
    let pageStarts = [0];
    let currentStart = 0;
    
    while (currentStart < txAllData.length) {
        let nextCut = currentStart + TX_PAGE_SIZE; // Standarnya potong per 25
        
        if (nextCut >= txAllData.length) break;
        
        // Logika Pintar: Kalau pas dipotong ternyata memisahkan grup Gula, perpanjang potongannya!
        if (typeKey === 'gula') {
            while (nextCut < txAllData.length) {
                // Cek baris persis sebelum potongan vs sesudah potongan
                if (isSameGroup(txAllData[nextCut - 1], txAllData[nextCut])) {
                    nextCut++; // Bawa baris itu masuk ke halaman ini (jangan dipisah)
                } else {
                    break; // Aman, bukan grup yang sama, potong disini
                }
            }
        }
        
        pageStarts.push(nextCut);
        currentStart = nextCut;
    }

    const totalPages = pageStarts.length;
    // Jaga-jaga kalau filter diubah dan halaman sekarang jadi kelewatan batas
    if (txCurrentPage >= totalPages) txCurrentPage = Math.max(0, totalPages - 1);

    const startIdx = pageStarts[txCurrentPage];
    const endIdx = pageStarts[txCurrentPage + 1] || txAllData.length;
    
    // Ambil data khusus halaman ini (ukuran halamannya sekarang elastis/dinamis)
    const pageData = JSON.parse(JSON.stringify(txAllData.slice(startIdx, endIdx)));

    const countEl = document.getElementById('txResultCount');
    if (countEl) countEl.textContent = `${txAllData.length} data ditemukan`;

    // ============================================================
    // 2. PRE-PROCESSING: Deteksi & Tandai Rowspan Khusus Gula (Netto)
    // ============================================================
    if (typeKey === 'gula') {
        for (let i = 0; i < pageData.length; i++) {
            if (pageData[i].skipNetto) continue; 

            const nopolA = normalizeStr(pageData[i].nopol);
            const supirA = normalizeStr(pageData[i].supir);
            const timeA = parseTimeMs(pageData[i].tanggal_keluar, pageData[i].jam_keluar);
            
            let rowspanCount = 1;

            for (let j = i + 1; j < pageData.length; j++) {
                const nopolB = normalizeStr(pageData[j].nopol);
                const supirB = normalizeStr(pageData[j].supir);
                const timeB = parseTimeMs(pageData[j].tanggal_keluar, pageData[j].jam_keluar);

                if (nopolA !== '' && nopolA === nopolB && supirA === supirB && Math.abs(timeA - timeB) <= (30 * 60000)) {
                    rowspanCount++;
                    pageData[j].skipNetto = true; 
                } else {
                    break;
                }
            }
            pageData[i].nettoRowspan = rowspanCount;
        }
    }

    // ============================================================
    // 3. RENDERING HTML TABEL
    // ============================================================
    tbody.innerHTML = pageData.map((row, idx) => {
        const rowNum = startIdx + idx + 1; // Penomoran tabel tetap akurat
        let cells = `<td class="row-num">${rowNum}</td>`;
        
        cells += config.columns.map(col => {
            if (col.key === 'qty_netto' && typeKey === 'gula' && row.skipNetto) {
                return ''; // Jangan gambar sel ini (karena di-merge dari atas)
            }

            let val = row[col.key];

            if (col.key === 'qty_netto' && val !== null && val !== undefined && val !== '') {
                val = Math.abs(parseFloat(val) || 0);
            }

            if (val === null || val === undefined || val === '') val = '-';
            if (col.format === 'number' && val !== '-') val = fmt(val);
            if (col.format === 'decimal' && val !== '-') val = fmtDecimal(val);
            if (col.bold && val !== '-') val = `<strong>${val}</strong>`;
            
            const cls = (col.format === 'number' && (val === '-' || val === '0')) ? 'zero-val' : '';
            
            let attr = '';
            if (col.key === 'qty_netto' && typeKey === 'gula' && row.nettoRowspan > 1) {
                attr = ` rowspan="${row.nettoRowspan}" style="vertical-align: middle; background-color: rgba(88,166,255,0.05);"`;
            }

            return `<td class="${cls}"${attr}>${val}</td>`;
        }).join('');
        
        return `<tr>${cells}</tr>`;
    }).join('');

    // Update navigasi halamannya
    buildPagination(typeKey, totalPages);
}

/** Build pagination UI */
function renderTransactionPage(typeKey, pageData, totalRows) {
    const config = TRANSACTION_TYPES[typeKey];
    const tbody = document.getElementById('transactionTableBody');

    const countEl = document.getElementById('txResultCount');
    if (countEl) countEl.textContent = `${fmt(totalRows)} data ditemukan`;

    if (!pageData || pageData.length === 0) {
        const colCount = config.columns.length + 1;
        tbody.innerHTML = emptyRow(colCount, 'Tidak ada data di halaman ini.');
        return;
    }

    const normalizeStr = (str) => (str || '').toString().toLowerCase().replace(/\s+/g, '');
    const parseTimeMs = (tgl, jam) => {
        if (!jam) return 0;
        let datePart = (tgl || '').split(' ')[0];
        if (datePart.includes('/')) {
            const p = datePart.split('/');
            if (p.length === 3) datePart = `${p[2]}-${p[1]}-${p[0]}`; 
        }
        const ms = new Date(`${datePart}T${jam}`).getTime();
        return isNaN(ms) ? 0 : ms;
    };

    const isSameGroup = (rowA, rowB) => {
        if (typeKey !== 'gula' && typeKey !== 'molasses') return false;
        
        // Jangan grup-kan kalau salah satunya adalah SPT Tambahan
        const remA = (rowA.remarks || '').toLowerCase();
        const remB = (rowB.remarks || '').toLowerCase();
        if (typeKey === 'molasses' && (remA.includes('tambahan') || remB.includes('tambahan'))) return false;

        const nopolA = normalizeStr(rowA.nopol);
        const supirA = normalizeStr(rowA.supir);
        const timeA = parseTimeMs(rowA.tanggal_keluar, rowA.jam_keluar);

        const nopolB = normalizeStr(rowB.nopol);
        const supirB = normalizeStr(rowB.supir);
        const timeB = parseTimeMs(rowB.tanggal_keluar, rowB.jam_keluar);

        return nopolA !== '' && nopolA === nopolB && supirA === supirB && Math.abs(timeA - timeB) <= (30 * 60000);
    };

    // SMART PAGINATION
    let pageStarts = [0];
    let currentStart = 0;
    while (currentStart < txAllData.length) {
        let nextCut = currentStart + 100; // Limit 100
        if (nextCut >= txAllData.length) break;
        if (typeKey === 'gula' || typeKey === 'molasses') {
            while (nextCut < txAllData.length) {
                if (isSameGroup(txAllData[nextCut - 1], txAllData[nextCut])) nextCut++;
                else break;
            }
        }
        pageStarts.push(nextCut);
        currentStart = nextCut;
    }

    // PRE-PROCESSING ROWSPAN & SPT TAMBAHAN
    if (typeKey === 'gula' || typeKey === 'molasses') {
        for (let i = 0; i < pageData.length; i++) {
            if (pageData[i].skipNetto) continue; 
            
            // Tandai jika ini SPT Tambahan (Molasses)
            const remarksA = (pageData[i].remarks || '').toLowerCase();
            if (typeKey === 'molasses' && remarksA.includes('tambahan')) {
                pageData[i].isTambahan = true;
                continue; // Biarkan berdiri sendiri, jangan di-merge
            }

            const nopolA = normalizeStr(pageData[i].nopol);
            const supirA = normalizeStr(pageData[i].supir);
            const timeA = parseTimeMs(pageData[i].tanggal_keluar, pageData[i].jam_keluar);
            let rowspanCount = 1;

            for (let j = i + 1; j < pageData.length; j++) {
                const nopolB = normalizeStr(pageData[j].nopol);
                const supirB = normalizeStr(pageData[j].supir);
                const timeB = parseTimeMs(pageData[j].tanggal_keluar, pageData[j].jam_keluar);
                const remarksB = (pageData[j].remarks || '').toLowerCase();

                // Stop kalau ketemu SPT tambahan
                if (typeKey === 'molasses' && remarksB.includes('tambahan')) break;

                if (nopolA !== '' && nopolA === nopolB && supirA === supirB && Math.abs(timeA - timeB) <= (30 * 60000)) {
                    rowspanCount++;
                    pageData[j].skipNetto = true; 
                } else {
                    break;
                }
            }
            pageData[i].nettoRowspan = rowspanCount;
        }
    }

    // RENDERING TABEL HTML
    const startIdx = txCurrentPage * 100;
    tbody.innerHTML = pageData.map((row, idx) => {
        const rowNum = startIdx + idx + 1;
        let cells = `<td class="row-num">${rowNum}</td>`;
        
        cells += config.columns.map(col => {
            // Sembunyikan sel netto kalau dia adalah duplikat 30 menit
            if (col.key === 'qty_netto' && (typeKey === 'gula' || typeKey === 'molasses') && row.skipNetto) return ''; 

            let val = row[col.key];

            // === TAMBAHKAN 3 BARIS INI: Ubah Koma jadi Titik Khusus Nomor PO ===
            if (col.key === 'nomor_po' && val) {
                val = String(val).replace(/,/g, '.');
            }

            if (col.key === 'qty_netto' && val !== null && val !== undefined && val !== '') {
                let strVal = String(val).trim();
                if (strVal.includes('.') && strVal.split('.').pop().length === 3) strVal = strVal.replace(/\./g, '');
                strVal = strVal.replace(',', '.');
                val = Math.abs(parseFloat(strVal) || 0);

                // VISUAL CUES: Coret Netto jika SPT Tambahan
                if (row.isTambahan) {
                    return `<td class=""><span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.85em;" title="Netto tidak dihitung (SPT Tambahan)">${fmt(val)}</span></td>`;
                }
            }

            if (val === null || val === undefined || val === '') val = '-';
            if (col.format === 'number' && val !== '-') val = fmt(val);
            if (col.format === 'decimal' && val !== '-') val = fmtDecimal(val);
            if (col.bold && val !== '-') val = `<strong>${val}</strong>`;
            
            const cls = (col.format === 'number' && (val === '-' || val === '0')) ? 'zero-val' : '';
            
            let attr = '';
            if (col.key === 'qty_netto' && (typeKey === 'gula' || typeKey === 'molasses') && row.nettoRowspan > 1) {
                attr = ` rowspan="${row.nettoRowspan}" style="vertical-align: middle; background-color: rgba(88,166,255,0.05);"`;
            }

            return `<td class="${cls}"${attr}>${val}</td>`;
        }).join('');
        
        return `<tr>${cells}</tr>`;
    }).join('');

    buildPagination(typeKey, totalRows);
}

/** Build pagination UI */
function buildPagination(typeKey, totalRows) {
    const container = document.getElementById('transactionPagination');
    const totalPages = Math.ceil(totalRows / 100);
    
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    let html = `<div class="pagination-bar">
        <button class="page-btn" id="pagePrev" ${txCurrentPage === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left"></i> Prev
        </button>
        <span class="page-info">Halaman ${txCurrentPage + 1} dari ${totalPages}</span>
        <button class="page-btn" id="pageNext" ${txCurrentPage >= totalPages - 1 ? 'disabled' : ''}>
            Next <i class="fa-solid fa-chevron-right"></i>
        </button>
    </div>`;
    container.innerHTML = html;

    document.getElementById('pagePrev').addEventListener('click', () => {
        if (txCurrentPage > 0) { 
            txCurrentPage--; 
            loadTransactionData(typeKey); 
        }
    });
    document.getElementById('pageNext').addEventListener('click', () => {
        if (txCurrentPage < totalPages - 1) { 
            txCurrentPage++; 
            loadTransactionData(typeKey); 
        }
    });
}

function renderTransactionSummary(typeKey, summaryData) {
    const container = document.getElementById('poSummary');
    if (!summaryData) { container.innerHTML = ''; return; }

    const isLimbah  = (typeKey === 'limbah');
    const isGula    = (typeKey === 'gula');
    const isTebu    = (typeKey === 'tebu');
    const isSupport = (typeKey === 'support');

    let html = `<div class="po-summary-grid">`;

    // TOTAL NETTO
    html += `
        <div class="po-summary-card" style="border-color: #58a6ff; background: rgba(88,166,255,0.05);">
            <span class="po-sum-label" style="color: #58a6ff;">TOTAL NETTO</span>
            <span class="po-sum-value" style="color: #58a6ff;">${fmt(summaryData.total_netto)}</span>
            <span class="po-sum-unit">KG</span>
        </div>`;

    if (isGula) {
        html += `<div class="po-summary-card" style="border-color: #f0c000; background: rgba(240,192,0,0.05);"><span class="po-sum-label" style="color: #f0c000;">TOTAL QTY SPM</span><span class="po-sum-value" style="color: #f0c000;">${fmt(summaryData.total_qty_spm)}</span><span class="po-sum-unit">KG</span></div>`;
    }

    html += `
        <div class="po-summary-card">
            <span class="po-sum-label" style="color:var(--text-secondary);">TOTAL TRUCK / RITASE</span>
            <span class="po-sum-value">${summaryData.total_ritase}</span>
            <span class="po-sum-unit">Truk</span>
        </div>`;

    // Tampilkan TOTAL SPT hanya untuk transaksi yang relevan (bukan limbah, tebu, support)
    if (!isLimbah && !isTebu && !isSupport) {
        html += `<div class="po-summary-card" style="border-color:rgba(188,140,255,0.4); background:rgba(188,140,255,0.05);"><span class="po-sum-label" style="color:#bc8cff;">TOTAL SPT</span><span class="po-sum-value" style="color:#bc8cff;">${summaryData.total_spt}</span><span class="po-sum-unit">Dokumen</span></div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
}
// =============================================
// PO STOCK MODAL
// =============================================
function openEditPOModal(poNumber) {
    document.getElementById('modalPoNumber').value = poNumber;
    document.getElementById('modalPoQty').value = poStocks[poNumber] || '';
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

async function savePOStockFromModal() {
    const poNumber = document.getElementById('modalPoNumber').value;
    const qtyPO = parseFloat(document.getElementById('modalPoQty').value) || 0;

    const saveBtn = document.getElementById('modalSaveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

    const res = await apiPost('/api/po-stock', { nomor_po: poNumber, qty_po: qtyPO });

    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Simpan';

    if (res && res.status === 'success') {
        poStocks[poNumber] = qtyPO;
        closeModal();
        if (currentTxType === 'limbah') {
            renderTransactionSummary(currentTxType);
        }
    } else {
        alert('Gagal menyimpan PO Stock!');
    }
}

// =============================================
// EXPORT TO EXCEL
// =============================================
function exportToExcel(typeKey) {
    const config = TRANSACTION_TYPES[typeKey];
    if (!txAllData || txAllData.length === 0) {
        alert('Tidak ada data untuk di-export!');
        return;
    }

    // Build worksheet data
    const headers = ['No', ...config.columns.map(c => c.label)];
    const rows = txAllData.map((row, idx) => {
        const rowData = [idx + 1];
        config.columns.forEach(col => {
            let val = row[col.key];
            if (val === null || val === undefined) val = '';
            rowData.push(val);
        });
        return rowData;
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, config.label);

    const fileName = `Transaksi_${config.label}_${txDateFrom}_${txDateTo}.xlsx`;
    XLSX.writeFile(wb, fileName);
}
