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

const TOOLTIP = {
    backgroundColor: 'rgba(22,27,34,0.95)', titleColor: '#e6edf3',
    bodyColor: '#8b949e', borderColor: 'rgba(48,54,61,0.8)',
    borderWidth: 1, padding: 12, cornerRadius: 8
};
