console.log("SCRIPT.JS LOADED v4.2 — MODULAR");
/* =============================================
   REKAP DSAJA - Dashboard Timbangan
   Fetching from timbangan.timbang_data via Flask API
   ============================================= */

const API = window.location.origin;
const REFRESH_MS = 90000;

let currentDate = new Date().toISOString().split('T')[0];
let currentPage = 'dashboard';
let charts = {};
let _prodData = [];
let currentTxType = null;
let lastBuiltTxType = null;

// ---- Transaction state ----
let txDateFrom = new Date().toISOString().split('T')[0];
let txDateTo = new Date().toISOString().split('T')[0];
let currentLimbahFilter = '';
let currentPOFilter = '';
let currentSupportVendor = '';  // Vendor filter khusus support
let txOriginalData = [];
let txAllData = [];
let txCurrentPage = 0;
const TX_PAGE_SIZE = 25;
let poStocks = {};
let poNumbers = [];

// =============================================
// TRANSACTION TYPES — KONFIGURASI TERPUSAT-JEMBOT MUMET
// =============================================
// ★ PANDUAN EDIT:
//   Menambah sub-menu   → tambahkan entry baru di bawah.
//   Mengubah kolom      → edit array 'columns' di entry yang diinginkan.
//   Mengubah filter DB  → edit array 'filters'.
//   Menambah item filter → set hasItemFilter:true + itemFilterOptions.
//   Menambah PO filter  → set hasPOFilter:true (khusus limbah).
//
// ★ Kolom: { key:'nama_kolom_db', label:'Header', format:'number', bold:true }
//   - key lowercase = nama kolom dari database
//   - format:'number' = format angka dengan separator
//   - bold:true = teks tebal
// =============================================
const TRANSACTION_TYPES = {
    tebu: {
        label: 'Tebu',
        icon: 'fa-seedling',
        color: '#3fb950',
        filters: ['TEBU'],
        columns: [
            { key: 'tanggal_masuk', label: 'Tgl Masuk' },
            { key: 'jam_masuk', label: 'Jam Masuk' },
            { key: 'berat_masuk', label: 'Tara', format: 'number' },
            { key: 'tanggal_keluar', label: 'Tgl Keluar' },
            { key: 'jam_keluar', label: 'Jam Keluar' },
            { key: 'berat_keluar', label: 'Bruto', format: 'number' },
            { key: 'qty_netto', label: 'Netto', format: 'number', bold: true },
            { key: 'nomor_spmspb', label: 'SPM'},
            { key: 'nopol', label: 'Polisi' },
            { key: 'supir', label: 'Sopir' },
            { key: 'kendaraan', label: 'Jenis Kendaraan' },
            { key: 'shift', label: 'Shift' },
        ]
    },
    gula: {
        label: 'Gula',
        icon: 'fa-cubes-stacked',
        color: '#f0c000',
        filters: ['GULA KRISTAL PUTIH', 'GKP', 'GULA KRISTAL PUTIH (MERAH) TITIPAN', 'GULA KRISTAL PUTIH (BIRU) TITIPAN', 'GULA KRISTAL PUTIH (MERAH)', 'GULA KRISTAL PUTIH (BIRU)'],
        columns: [
            { key: 'tanggal_masuk', label: 'Tgl Masuk' },
            { key: 'jam_masuk', label: 'Jam' },
            { key: 'berat_masuk', label: 'Tara', format: 'number' },
            { key: 'tanggal_keluar', label: 'Tgl Keluar' },
            { key: 'jam_keluar', label: 'Jam' },
            { key: 'berat_keluar', label: 'Bruto', format: 'number' },
            { key: 'qty_netto', label: 'Netto', format: 'number', bold: true },
            { key: 'qty_spmspb', label: 'QTY SPM', format: 'number' },
            { key: 'nopol', label: 'Polisi' },
            { key: 'nomor_spt', label: 'SPT' },
            { key: 'nomor_spmspb', label: 'SPM' },
            { key: 'nomor_sppb', label: 'SPPB' },
            { key: 'supir', label: 'Sopir' },
            { key: 'cardname', label: 'Customer' },
            { key: 'itemname', label: 'Type Gula' },
            { key: 'jumlah_karung', label: 'Total Karung', format: 'number' },
            { key: 'berat_rata2_karung', label: 'Toleransi', format: 'decimal' },
            { key: 'kode_produksi', label: 'Kode Produksi' },
        ]
    },
    molasses: {
        label: 'Molasses',
        icon: 'fa-droplet',
        color: '#e67e22',
        filters: ['MOLASSE'],
        columns: [
            { key: 'tanggal_masuk', label: 'Tgl Masuk' },
            { key: 'jam_masuk', label: 'Jam' },
            { key: 'berat_masuk', label: 'Tara', format: 'number' },
            { key: 'tanggal_keluar', label: 'Tgl Keluar' },
            { key: 'jam_keluar', label: 'Jam' },
            { key: 'berat_keluar', label: 'Bruto', format: 'number' },
            { key: 'qty_netto', label: 'Netto WB', format: 'number', bold: true },
            { key: 'nomor_spmspb', label: 'No SPM'},
            { key: 'nopol', label: 'Polisi' },
            { key: 'nomor_spt', label: 'SPT' },
            { key: 'nomor_spmspb', label: 'SPM' },
            { key: 'nomor_sppb', label: 'SPPB' },
            { key: 'supir', label: 'Sopir' },
            { key: 'cardname', label: 'Customer' },
            { key: 'shift', label: 'Shift'},
            { key: 'remarks', label: 'Keterangan' },
        ]
    },
    bagasse: {
        label: 'Bagasse',
        icon: 'fa-leaf',
        color: '#8d6e63',
        filters: ['BAGASSE', 'BAGGASE'],
        columns: [
            { key: 'tanggal_masuk', label: 'Tgl Masuk' },
            { key: 'jam_masuk', label: 'Jam' },
            { key: 'berat_masuk', label: 'Tara', format: 'number' },
            { key: 'tanggal_keluar', label: 'Tgl Keluar' },
            { key: 'jam_keluar', label: 'Jam' },
            { key: 'berat_keluar', label: 'Bruto', format: 'number' },
            { key: 'qty_netto', label: 'Netto WB', format: 'number', bold: true },
            { key: 'nomor_spmspb', label: 'No SPM'},
            { key: 'nopol', label: 'Polisi' },
            { key: 'nomor_spt', label: 'SPT' },
            { key: 'nomor_spmspb', label: 'SPM' },
            { key: 'nomor_sppb', label: 'SPPB' },
            { key: 'supir', label: 'Sopir' },
            { key: 'cardname', label: 'Customer' },
            { key: 'shift', label: 'Shift'},
            { key: 'remarks', label: 'Keterangan' },
        ]
    },
    limbah: {
        label: 'Limbah',
        icon: 'fa-recycle',
        color: '#39d2c0',
        filters: ['FILTER CAKE', 'BLOTONG', 'FLY ASH', 'FLYASH'],
        hasItemFilter: true,
        hasPOFilter: true,
        itemFilterOptions: [
            { label: 'Semua Limbah', value: '' },
            { label: 'Filter Cake ', value: 'FILTER CAKE,BLOTONG' },
            { label: 'Fly Ash ', value: 'FLY ASH,BOTTOM ASH,FLYASH' },
        ],
        columns: [
            { key: 'tanggal_masuk', label: 'Tgl Masuk' },
            { key: 'jam_masuk', label: 'Jam' },
            { key: 'berat_masuk', label: 'Tara', format: 'number' },
            { key: 'tanggal_keluar', label: 'Tgl Keluar' },
            { key: 'jam_keluar', label: 'Jam' },
            { key: 'berat_keluar', label: 'Bruto', format: 'number' },
            { key: 'qty_netto', label: 'Netto KG', format: 'number', bold: true },
            { key: 'nomor_spmspb', label: 'No SPM' },
            { key: 'nopol', label: 'Polisi' },
            { key: 'supir', label: 'Sopir' },
            { key: 'cardname', label: 'Customer' },
            { key: 'shift', label: 'Shift' },
            { key: 'nomor_po', label: 'No. PO' },
            { key: 'itemname', label: 'Item' },
            { key: 'remarks', label: 'Keterangan' },
        ]
    },
    support: {
        label: 'Support',
        icon: 'fa-truck-fast',
        color: '#bc8cff',
        filters: ['SUPPORT OPERASIONAL'],
        hasItemFilter: true,
        hasVendorFilter: true,   // Dropdown vendor dari cardname
        itemFilterOptions: [{ label: 'Semua Item', value: '' }],
        columns: [
            { key: 'tanggal_masuk', label: 'Tgl Masuk' },
            { key: 'jam_masuk', label: 'Jam Masuk' },
            { key: 'berat_masuk', label: 'Tara', format: 'number' },
            { key: 'tanggal_keluar', label: 'Tgl Keluar' },
            { key: 'jam_keluar', label: 'Jam Keluar' },
            { key: 'berat_keluar', label: 'Bruto', format: 'number' },
            { key: 'qty_netto', label: 'Netto', format: 'number', bold: true },
            { key: 'nomor_spmspb', label: 'No SPM' },
            { key: 'nopol', label: 'Polisi' },
            { key: 'supir', label: 'Sopir' },
            { key: 'cardname', label: 'Customer' },
            { key: 'itemname', label: 'Item' },
            { key: 'shift', label: 'Shift' },
            { key: 'remarks', label: 'Keterangan' },
        ]
    },
    asugar: {
        label: 'A Sugar',
        icon: 'fa-candy-cane',
        color: '#e91e63',
        filters: ['RAW SUGAR', 'TRUCKING RAW SUGAR'],
        columns: [
            { key: 'tanggal_masuk', label: 'Tgl Masuk' },
            { key: 'jam_masuk', label: 'Jam Masuk' },
            { key: 'berat_masuk', label: 'Tara', format: 'number' },
            { key: 'tanggal_keluar', label: 'Tgl Keluar' },
            { key: 'jam_keluar', label: 'Jam Keluar' },
            { key: 'berat_keluar', label: 'Bruto', format: 'number' },
            { key: 'qty_netto', label: 'Netto', format: 'number', bold: true },
            { key: 'nomor_spmspb', label: 'No SPM' },
            { key: 'nopol', label: 'Polisi' },
            { key: 'supir', label: 'Sopir' },
            { key: 'cardname', label: 'Customer' },
            { key: 'itemname', label: 'Item' },
            { key: 'shift', label: 'Shift' },
            { key: 'remarks', label: 'Keterangan' },
        ]
    },
    gulatransfer: {
        label: 'Gula Transfer',
        icon: 'fa-truck-arrow-right',
        color: '#f59e0b',
        filters: ['GULA KRISTAL PUTIH', 'GKP'],
        columns: [
            { key: 'tanggal_masuk', label: 'Tgl Masuk' },
            { key: 'jam_masuk', label: 'Jam' },
            { key: 'berat_masuk', label: 'Tara', format: 'number' },
            { key: 'tanggal_keluar', label: 'Tgl Keluar' },
            { key: 'jam_keluar', label: 'Jam' },
            { key: 'berat_keluar', label: 'Bruto', format: 'number' },
            { key: 'qty_netto', label: 'Netto', format: 'number', bold: true },
            { key: 'qty_spmspb', label: 'QTY SPM', format: 'number' },
            { key: 'nopol', label: 'Polisi' },
            { key: 'nomor_spt', label: 'SPT' },
            { key: 'nomor_spmspb', label: 'SPM' },
            { key: 'nomor_sppb', label: 'SPPB' },
            { key: 'supir', label: 'Sopir' },
            { key: 'cardname', label: 'Customer' },
            { key: 'itemname', label: 'Type Gula' },
            { key: 'jumlah_karung', label: 'Total Karung', format: 'number' },
            { key: 'berat_rata2_karung', label: 'Toleransi', format: 'decimal' },
            { key: 'kode_produksi', label: 'Kode Produksi' },
        ]
    },
    others: {
        label: 'Others',
        icon: 'fa-boxes-stacked',
        color: '#78909c',
        filters: [],
        hasItemFilter: true,
        itemFilterOptions: [{ label: 'Semua Item', value: '' }],
        columns: [
            { key: 'tanggal_masuk', label: 'Tgl Masuk' },
            { key: 'jam_masuk', label: 'Jam' },
            { key: 'berat_masuk', label: 'Tara', format: 'number' },
            { key: 'tanggal_keluar', label: 'Tgl Keluar' },
            { key: 'jam_keluar', label: 'Jam' },
            { key: 'berat_keluar', label: 'Bruto', format: 'number' },
            { key: 'qty_netto', label: 'Netto KG', format: 'number', bold: true },
            { key: 'nomor_spmspb', label: 'No SPM' },
            { key: 'nopol', label: 'Polisi' },
            { key: 'supir', label: 'Sopir' },
            { key: 'cardname', label: 'Customer' },
            { key: 'shift', label: 'Shift' },
            { key: 'itemname', label: 'Item' },
            { key: 'remarks', label: 'Keterangan' },
        ]
    }
};

// ---- Chart.js defaults ----
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = 'rgba(48,54,61,0.6)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.padding = 14;
Chart.defaults.animation.duration = 700;

const COLORS = [
    { bg: 'rgba(88,166,255,0.35)', border: '#58a6ff' },
    { bg: 'rgba(63,185,80,0.35)', border: '#3fb950' },
    { bg: 'rgba(240,192,0,0.35)', border: '#f0c000' },
    { bg: 'rgba(188,140,255,0.35)', border: '#bc8cff' },
    { bg: 'rgba(230,126,34,0.35)', border: '#e67e22' },
    { bg: 'rgba(57,210,192,0.35)', border: '#39d2c0' },
    { bg: 'rgba(248,81,73,0.35)', border: '#f85149' },
    { bg: 'rgba(161,136,127,0.35)', border: '#a1887f' },
    { bg: 'rgba(233,30,99,0.35)', border: '#e91e63' },
    { bg: 'rgba(0,188,212,0.35)', border: '#00bcd4' },
    { bg: 'rgba(139,195,74,0.35)', border: '#8bc34a' },
    { bg: 'rgba(255,152,0,0.35)', border: '#ff9800' },
];

const ICONS = {
    'TEBU': 'fa-seedling', 'GULA': 'fa-cubes-stacked', 'MOLASSE': 'fa-droplet',
    'BAGASSE': 'fa-leaf', 'BLOTONG': 'fa-hill-rockslide', 'FLY ASH': 'fa-fire-flame-simple',
    'FILTER CAKE': 'fa-filter', 'RAW SUGAR': 'fa-candy-cane', 'A SUGAR': 'fa-candy-cane',
    'BATU BARA': 'fa-mountain', 'GULA TRANSFER': 'fa-truck-arrow-right',
    'DEFAULT': 'fa-weight-scale'
};

const NEO_COLORS = [
    { bg: '#88AAEE', border: '#000000' }, // Blue
    { bg: '#88D66C', border: '#000000' }, // Green
    { bg: '#FFD93D', border: '#000000' }, // Yellow
    { bg: '#C4A1FF', border: '#000000' }, // Purple
    { bg: '#FF8C42', border: '#000000' }, // Orange
    { bg: '#77CDFF', border: '#000000' }, // Cyan
    { bg: '#FF6B6B', border: '#000000' }, // Red
    { bg: '#C5E17A', border: '#000000' }, // Lime
    { bg: '#FF6EB4', border: '#000000' }, // Pink
    { bg: '#00D4E8', border: '#000000' }, // Bright Blue
    { bg: '#B5E550', border: '#000000' }, // Yellow Green
    { bg: '#FFAA33', border: '#000000' }  // Mango
];

const neoBrutalismPlugin = {
    id: 'neoBrutalism',
    beforeUpdate(chart) {
        const isNeo = document.body.classList.contains('neo-mode');
        chart.data.datasets.forEach((ds, i) => {
            // Backup original properties on first run
            if (!ds._origBg) {
                ds._origBg = ds.backgroundColor;
                ds._origBorder = ds.borderColor;
                ds._origBorderWidth = ds.borderWidth;
                ds._origBorderRadius = ds.borderRadius;
                ds._origPointRadius = ds.pointRadius;
                ds._origPointBorderWidth = ds.pointBorderWidth;
            }

            if (isNeo) {
                const c = NEO_COLORS[i % NEO_COLORS.length];
                
                // For bar charts: solid color, black border, 0 radius
                if (ds.type === 'bar' || !ds.type && chart.config.type === 'bar') {
                    ds.backgroundColor = c.bg;
                    ds.borderColor = c.border;
                    ds.borderWidth = 3;
                    ds.borderRadius = 0;
                } 
                // For line/radar charts: pakai warna cerah per dataset, bukan hitam
                else {
                    ds.borderColor = c.bg;
                    ds.backgroundColor = c.bg + '33'; // transparan ringan untuk fill area
                    ds.borderWidth = 3;
                    ds.pointBackgroundColor = '#fff';
                    ds.pointBorderColor = c.bg;
                    ds.pointBorderWidth = 2;
                    ds.pointRadius = 5;
                    ds.pointHoverRadius = 7;
                }

                // If dataset was manually assigned a color index via original code (e.g., colorIdx)
                if (ds._origBg && typeof ds._origBg === 'string' && ds._origBg.startsWith('rgba')) {
                    const matchIdx = COLORS.findIndex(cl => cl.bg === ds._origBg);
                    if (matchIdx >= 0) {
                        const customNeo = NEO_COLORS[matchIdx % NEO_COLORS.length];
                        if (ds.type === 'bar' || !ds.type && chart.config.type === 'bar') {
                            ds.backgroundColor = customNeo.bg;
                            ds.borderColor = customNeo.border; // #000
                        } else {
                            ds.borderColor = customNeo.bg;
                            ds.backgroundColor = customNeo.bg + '33';
                            ds.pointBorderColor = customNeo.bg;
                        }
                    }
                }
            } else {
                // Restore original
                ds.backgroundColor = ds._origBg;
                ds.borderColor = ds._origBorder;
                ds.borderWidth = ds._origBorderWidth !== undefined ? ds._origBorderWidth : 1;
                ds.borderRadius = ds._origBorderRadius;
                ds.pointRadius = ds._origPointRadius !== undefined ? ds._origPointRadius : 3;
                ds.pointBorderWidth = ds._origPointBorderWidth !== undefined ? ds._origPointBorderWidth : 1;
            }
        });

        // Toggle text and grid colors
        if (chart.options.plugins?.legend?.labels) {
            chart.options.plugins.legend.labels.color = isNeo ? '#000' : Chart.defaults.color;
            chart.options.plugins.legend.labels.font = { family: isNeo ? "'Space Mono', monospace" : Chart.defaults.font.family, weight: isNeo ? 'bold' : 'normal' };
        }
        if (chart.options.plugins?.title) {
            chart.options.plugins.title.color = isNeo ? '#000' : Chart.defaults.color;
            chart.options.plugins.title.font = { family: isNeo ? "'Space Mono', monospace" : Chart.defaults.font.family, weight: isNeo ? 'bold' : 'normal' };
        }
        if (chart.options.scales) {
            Object.values(chart.options.scales).forEach(scale => {
                if (scale.grid) {
                    scale.grid.color = isNeo ? 'rgba(0,0,0,0.1)' : Chart.defaults.borderColor;
                    if (isNeo) scale.grid.tickLength = 0; // cleaner look
                }
                if (scale.ticks) {
                    scale.ticks.color = isNeo ? '#000' : Chart.defaults.color;
                    scale.ticks.font = { family: isNeo ? "'Space Mono', monospace" : Chart.defaults.font.family, weight: isNeo ? 'bold' : 'normal' };
                }
            });
        }
    }
};

// Register plugin globally
Chart.register(neoBrutalismPlugin);

const TOOLTIP = {
    backgroundColor: 'rgba(22,27,34,0.95)', titleColor: '#e6edf3',
    bodyColor: '#8b949e', borderColor: 'rgba(48,54,61,0.8)',
    borderWidth: 1, padding: 12, cornerRadius: 8
};
