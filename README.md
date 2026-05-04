# Dashboard Rekap Timbangan (REKAP DSAJA)

> **Sistem dashboard real-time berbasis web untuk memantau data timbangan produksi pabrik gula.**

---

## Daftar Isi

1. [Gambaran Proyek](#gambaran-proyek)
2. [Arsitektur & Struktur File](#arsitektur--struktur-file)
3. [Setup & Instalasi](#setup--instalasi)
4. [Cara Penggunaan](#cara-penggunaan)
5. [Catatan Teknis Penting](#catatan-teknis-penting)

---

## Gambaran Proyek

**REKAP DSAJA** adalah dashboard web interaktif yang terhubung langsung ke database MySQL sistem timbangan pabrik gula. Sistem ini dirancang untuk memudahkan operator dan manajemen dalam memantau data timbang harian secara real-time tanpa perlu membuka software timbangan secara langsung.

### Fitur Utama

| Fitur | Deskripsi |
|---|---|
| 📊 **Dashboard Utama** | Ringkasan tonase & ritase per shift (Shift 1/2/3 + Today) |
| 📈 **Grafik Tren 7 Hari** | Line chart tonase per material, filter per jenis komoditas |
| 📋 **Report Daily** | Laporan harian multi-seksi: Delivery, Support, Limbah, Cane, Transfer Gula |
| 🌾 **Report Tebu** | Laporan penerimaan tebu harian + rekap to-date + ekspor WA |
| ♻️ **Report Limbah** | Ringkasan Filter Cake & Fly Ash siap salin ke WhatsApp |
| 💼 **Transaksi** | Tabel transaksi dengan filter tanggal, PO, vendor, pencarian |
| 📦 **Monitor PO** | Pantau sisa kuota PO Limbah yang masih aktif |
| 🔐 **Autentikasi** | Login dengan username + password (SHA-256 + salt) |

---

## Arsitektur & Struktur File

```
MT5/
│
├── server.py                   # Titik masuk utama — Flask app & semua route API
├── _old_queries.py             # (CADANGAN) File monolith backend lama — di-rename
│
├── app_queries/                # Modul backend modular (BARU)
│   ├── __init__.py             #   Re-export semua fungsi → import app_queries as queries
│   ├── db_core.py              #   Connection pool, query(), dec(), check_db_health()
│   ├── auth.py                 #   Hash password, ensure_users_table, verify_login
│   ├── production.py           #   Data produksi per shift, summary cards, history chart
│   ├── transactions.py         #   get_transaction_data, support items & vendors
│   ├── vendors.py              #   Data vendor per shift
│   ├── po_management.py        #   CRUD po_stock, monitor PO aktif
│   ├── report_tebu.py          #   Laporan Tebu (shift + todate)
│   └── daily_reports.py        #   Daily Report: delivery, support, limbah, cane, transfer
│
├── static/                     # ★ Frontend modular (BARU — 10 file)
│   └── js/
│       ├── config.js           #   Konstanta global, TRANSACTION_TYPES, COLORS, ICONS
│       ├── utils.js            #   fmt, fmtDecimal, fmtDate, z, destroyChart, DOM helpers
│       ├── api.js              #   api(), apiPost(), checkHealth(), apiFetch(), loadAll()
│       ├── navigation.js       #   Theme, sidebar, nav, clock, modal
│       ├── dashboard.js        #   Summary, production, vendors, charts, trend, PO monitor
│       ├── transactions.js     #   Submenu, filters, pagination, PO modal, export Excel
│       ├── report_limbah.js    #   Report Limbah WA + captureToClipboard
│       ├── report_tebu.js      #   Report Tebu V2 (state, init, generate, render WA)
│       ├── report_daily.js     #   Daily Report 5 seksi + DEMO data
│       └── main.js             #   DOMContentLoaded init + immediate calls
│
├── _old_script.js              # (CADANGAN) File JS monolith lama — di-rename
├── style.css                   # Stylesheet utama (dark/light mode)
│
├── templates/                  # Jinja2 template fragments (Flask)
│   ├── index.html              #   Shell utama
│   ├── sidebar.html            #   Navigasi kiri
│   ├── topbar.html             #   Header bar + datepicker
│   ├── page_dashboard.html     #   Halaman dashboard
│   ├── page_charts.html        #   Halaman grafik
│   ├── page_transactions.html  #   Halaman transaksi
│   ├── page_report_daily.html  #   Laporan harian
│   ├── page_report_tebu.html   #   Laporan tebu
│   ├── page_report_limbah.html #   Laporan limbah WA
│   └── modal_po.html           #   Modal edit PO
│
├── db_config.py                # Konfigurasi koneksi MySQL
├── db_config.example           # Template konfigurasi
├── db_schema.sql               # Skema tabel database
└── requirements.txt            # Dependensi Python
```

### Diagram Alur Data

```
Browser (JS + HTML)
       |  HTTP/JSON
       v
  server.py  <--- import app_queries as queries
       |  Python function call
       v
  app_queries/ (db_core, production, daily_reports, ...)
       |  SQL Query
       v
  MySQL (timbangan.data_timbang)
```

---

## Setup & Instalasi

### Prasyarat

- Python 3.10+
- MySQL 5.7+ / MariaDB 10.4+
- Browser modern (Chrome / Edge / Firefox)

### Langkah Instalasi

**1. Buat virtual environment & install dependensi**

```bash
cd d:\AI\TEST\MT5
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**2. Konfigurasi database**

```bash
copy db_config.example db_config.py
```

Edit `db_config.py`:

```python
DB_CONFIG = {
    "pool_name":  "rekap_pool",
    "pool_size":  5,
    "host":       "localhost",
    "port":       3306,
    "user":       "root",
    "password":   "yourpassword",
    "database":   "timbangan",
    "charset":    "utf8mb4",
}
```

**3. Jalankan server**

```bash
python server.py
```

Akses: **http://localhost:8000** | Login: `admin` / `admin123`

---

### Mengatasi Ghost Server (Port 8000 Terpakai)

```powershell
# Cari proses di port 8000
netstat -ano | findstr :8000

# Kill proses (ganti 12345 dengan PID yang ditemukan)
taskkill /PID 12345 /F
```

---

## Cara Penggunaan

### 1. Dashboard Utama

Setelah login, dashboard memuat:

- **Kartu Ringkasan** — Total tonase & ritase per komoditas hari ini
- **Tabel Data Timbangan** — Rincian per shift & per jenis material
- **Monitor PO Limbah** — Status kuota PO aktif + progress bar
- **Grafik Tren Tonase 7 Hari** — Line chart per komoditas

Gunakan **datepicker di topbar** untuk memilih tanggal yang berbeda. Semua data diperbarui otomatis.

---

### 2. Laporan Harian (Daily Report)

1. Klik **Report - Daily** di sidebar
2. Pilih tanggal laporan
3. Klik tombol **Generate**
4. Sistem memuat 5 seksi:
   - **Delivery Product** — Gula, Molasses, Bagasse
   - **Support Operasional** — Solar, Sack, dll.
   - **Limbah** — Filter Cake & Fly Ash per shift & PO
   - **Cane Received** — Penerimaan tebu hari ini vs. to-date
   - **Transfer Gula** — Pengiriman ke Gudang/Bulog
5. Klik **Print / PDF** untuk ekspor

---

### 3. Laporan Tebu

1. Klik **Report - Tebu** di sidebar
2. Isi **Tanggal Giling Awal** (disimpan permanen di browser)
3. Isi **Target Giling** (KG)
4. Pilih tanggal & klik **Tampilkan Laporan**
5. Salin format WhatsApp dengan tombol **Salin WA**

---

### 4. Filter Grafik Tren

Di bagian **"Tren Tonase (7 Hari)"** pada dashboard:

- **Semua Item** → Multi-line chart, satu garis per komoditas yang ada datanya
- **Pilih komoditas tertentu** → Single line dengan area fill berwarna sesuai komoditas

---

### 5. Manajemen Transaksi

1. Klik **Transaksi** - pilih sub-menu (Gula, Tebu, Limbah, dll.)
2. Atur rentang tanggal - klik **Tampilkan**
3. Gunakan kolom pencarian (Nopol, SPM, Sopir, Customer)
4. Klik **Export Excel** untuk mengunduh ke `.xlsx`

---

## Catatan Teknis Penting

### SQL Yang Tidak Boleh Diubah

File `app_queries/daily_reports.py` mengandung logika bisnis kritis:

| Fungsi | Logika Kritis |
|---|---|
| `get_daily_support` | Filter `LIKE '%support%'` — sengaja fleksibel untuk semua varian nama Type |
| `get_daily_cane` | Kendaraan `MINIBUS / PICKUP` (bukan `DOUBLE TRUCK` — sudah diganti sesuai data aktual) |
| `get_daily_delivery` | Anchor Regex Tracking untuk SPT Tambahan Molasses |
| Semua fungsi | Blok `try-except` dengan `traceback.print_exc()` — wajib dipertahankan untuk debugging |

### Rollback Mudah

**Backend:** File `_old_queries.py` (monolith lama) **tetap ada**. Rename balik & ubah satu baris di `server.py`:

```python
# Gunakan modul baru (default)
import app_queries as queries

# Rollback ke monolith lama
import queries
```

**Frontend:** File `_old_script.js` (monolith lama) **tetap ada**. Rename balik ke `script.js`, lalu di `templates/index.html` uncomment fallback:

```html
<!-- Aktif: modular (10 file) -->
<script src="static/js/config.js"></script>
...

<!-- Fallback: uncomment baris ini -->
<!-- <script src="script.js?v=4.3"></script> -->
```

### Menambah Komoditas Baru ke Filter Tren

1. Edit `MATERIAL_GROUPS` di fungsi `loadDashboardTrend()` dalam `static/js/dashboard.js`
2. Tambahkan `<option>` baru di `#trendFilter` dropdown di `templates/page_dashboard.html`
3. Tambahkan warna di `colorMap` di fungsi yang sama