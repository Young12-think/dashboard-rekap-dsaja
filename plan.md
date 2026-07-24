# Rencana Perbaikan Dashboard RMI Balance

## Rencana Grafik Analitik Timbangan - 20 Juli 2026

### Tujuan

Halaman `Grafik` harus menjawab empat pertanyaan: berapa hasil hari ini, kapan antrean terjadi, proses mana yang lambat, dan data mana yang perlu diperiksa. Gunakan data transaksi yang sudah tersedia; prediksi menunggu target dan histori stabil.

### Susunan Tampilan

#### 1. Bilah kontrol bersama

- Tanggal analisis, default mengikuti tanggal global aplikasi.
- Pilihan periode: `Hari Ini`, `7 Hari`, dan rentang tanggal.
- Filter item, shift, dan customer.
- Tombol reset filter serta waktu pembaruan terakhir.
- Semua grafik mengikuti filter yang sama agar angka dapat dibandingkan.

#### 2. Ringkasan keputusan

Tampilkan lima KPI sebelum grafik:

| KPI | Nilai | Pembanding |
|---|---|---|
| Tonase | Total netto kg/ton | Perubahan terhadap periode sebelumnya |
| Ritase | Jumlah transaksi selesai | Perubahan terhadap periode sebelumnya |
| Rata-rata TAT | Menit dari timbang masuk sampai keluar | Target operasional |
| Jam tersibuk | Jam dengan truk keluar terbanyak | Jumlah rit pada jam tersebut |
| Anomali tara | Kendaraan dengan selisih tara > 100 kg | Status perlu diperiksa/aman |

Setiap KPI dapat membuka transaksi pembentuknya. Bila data kosong, tampilkan `Tidak ada data`, bukan angka nol yang menyesatkan.

#### 3. Arus operasional

- **Volume per jam:** batang ritase masuk dan keluar per jam sebagai grafik utama pembacaan antrean.
- **TAT per shift:** batang rata-rata menit dengan garis target dan jumlah sampel pada tooltip.
- **TAT per jam dan item:** garis untuk maksimal lima item terbesar; item lain tersedia melalui filter.
- **Tonase dan ritase per shift:** batang berkelompok untuk membandingkan hasil antar-shift.

#### 4. Komposisi dan kontribusi

- **Komposisi item:** batang horizontal berdasarkan tonase; lebih terbaca daripada pie saat item banyak.
- **Top 10 customer:** batang horizontal berdasarkan tonase, dengan ritase dan rata-rata muatan pada tooltip.
- **Produktivitas shift:** ganti radar dengan tabel atau batang berkelompok. Tonase, ritase, TAT, dan variasi item memiliki satuan berbeda sehingga satu skor relatif dapat menyesatkan tanpa target bisnis.

#### 5. Tren dan kualitas data

- **Tren 7/30 hari:** tonase, ritase, dan rata-rata TAT dengan filter item.
- **Loss/gain:** selisih netto terhadap dokumen SPT per hari, garis nol, dan warna berdasarkan tanda.
- **Anomali tara:** NOPOL, frekuensi, tara minimum/maksimum, selisih, item, dan aksi lihat transaksi.
- Tampilkan status kelengkapan, transaksi tanpa waktu keluar, dan timestamp data terakhir.

### Prioritas Implementasi

#### P0 - Rapikan yang sudah ada

1. Tambahkan bilah filter bersama dan state loading, kosong, gagal, serta data parsial.
2. Tambahkan lima KPI analitik di bagian atas.
3. Susun ulang: ringkasan, arus per jam, TAT, kontribusi, tren, lalu anomali.
4. Perbaiki teks encoding `0â€“100` menjadi `0-100` selama radar masih dipakai.
5. Pastikan layout satu kolom pada layar kecil dan tinggi canvas stabil.

#### P1 - Tambah pembanding operasional

1. Simpan target TAT per item atau target global di konfigurasi server.
2. Tambahkan periode sebelumnya sebagai pembanding tonase, ritase, dan TAT.
3. Buat endpoint ringkasan tunggal agar request analitik tidak tumpang tindih.
4. Tambahkan drill-down KPI, batang, dan anomali ke transaksi sumber.

#### P2 - Analisis lanjutan

1. Tambahkan `median`, `P90`, dan jumlah TAT di atas target; rata-rata mudah terpengaruh transaksi ekstrem.
2. Pisahkan waktu antre dan waktu proses bila timestamp tahap tersedia.
3. Tambahkan ekspor CSV sesuai filter aktif.

### Kontrak Data Minimum

Endpoint analitik mengembalikan `period`, `filters`, `updated_at`, `sample_count`, `tonase`, `ritase`, `avg_tat`, `median_tat`, `p90_tat`, `hourly_flow`, `by_shift`, `by_item`, `top_customers`, `loss_gain`, dan `tara_anomalies`. Berat memiliki satuan eksplisit; TAT memakai menit.

P0 memakai endpoint yang ada: `/api/analytics`, `/api/analytics/history-insights`, `/api/analytics/shift-radar`, `/api/analytics/top-transportir`, dan endpoint tren dashboard. Endpoint gabungan dibuat pada P1.

### Kriteria Selesai

- Semua angka berubah konsisten saat tanggal atau filter diganti.
- Total tonase dan ritase sama dengan tabel transaksi untuk periode yang sama.
- TAT mengabaikan transaksi tanpa pasangan waktu masuk/keluar dan menampilkan jumlah sampel.
- Grafik terbaca pada desktop dan mobile tanpa teks atau canvas bertumpuk.
- State loading, kosong, gagal, dan data parsial terlihat jelas.
- KPI atau elemen grafik dapat ditelusuri ke transaksi sumber.

Skipped: prediksi dan scoring gabungan; tambah setelah target bisnis, kualitas timestamp, dan histori minimal 30 hari tervalidasi.

---

## Hasil Audit — 18 Juli 2026

### Kesimpulan

Dashboard sudah selaras untuk fungsi inti: stok gula (GKB/GKM/reject), delivery gula, level tangki molasses, stok lokasi, balance, dan validasi harian. Namun belum setara dengan workbook sebagai dashboard pengendalian operasi penuh.

Hambatan utama bukan tampilan web: workbook bernama `2026` masih berisi timeline harian 2025 pada sheet utama dan banyak nilai aktual 2026 masih nol. Beberapa rumus mengarah ke workbook eksternal (`[1]product`, `[2]Data1`) dan sheet `Plan Delivery` tersembunyi mengandung `#REF!`. Jangan mengimpor angka agregat dari file ini sebelum sumber rumus dan musim aktif dikonfirmasi.

## Matriks Kesesuaian

| Area | Excel | Dashboard | Status | Tindakan |
|---|---|---|---|---|
| Balance gula | `Balance 1`: packing/repack, move out, stok GKB/GKM/reject | Overview + laporan + validasi | Sebagian | Tambah komponen repack, transfer, dan raw sugar bila dipakai operasi. |
| Delivery gula | `Plan Delivery-`: plan, actual, diff GKB/GKM | Grafik plan vs actual gula | Sebagian | Tampilkan diff dan % diff secara eksplisit, termasuk nilai to-date. |
| Balance molasses | `Balance โมลาสรายวัน อ้อย1.0`: cane, raw sugar, yield, molass in, move out, inventory | Tangki A/B dan ringkasan molasses | Sebagian | Tampilkan yield, breakdown move-out, dan raw sugar in. |
| Target musim & crushing | `Sheet 1`: target cane 1.450.000 ton, progress, breakdown May–Nov, produksi | Tidak ada endpoint/tab khusus | Belum ada | Tambah KPI season dan tren produksi bulanan. |
| Kapasitas gudang | `Balance 1`: lokasi dan kapasitas operasional | Satu kapasitas gula global di settings | Sebagian | Simpan kapasitas per lokasi, lalu tampilkan utilisasi dan sisa kapasitas. |
| Delivery molasses | `Plan Delivery-`: plan, actual, diff, `% Diff Molasses` | Level tangki saja | Belum ada | Tambah grafik dan alert plan vs actual molasses. |
| Container & losses | `Balance 1`: container GKB/GKM, loading/downgrade RED/BLUE | Tidak terlihat | Belum ada | Tambah kartu harian dan tren bulanan. |
| Delivery per lokasi | `----`: plan/actual/repack per Bulog, Wlingi, Blitar Gedog, Kepanjen | Stok gudang luar | Sebagian | Tambah tabel per lokasi dan produk. |
| Export laporan | Workbook sebagai format kerja | Tidak terlihat | Belum ada | Tambah CSV lebih dulu; XLSX hanya bila format resmi diperlukan. |

## Risiko Data yang Harus Ditutup Dulu

1. Tetapkan musim aktif: header di `Balance 1`, `Plan Delivery-`, dan sheet molasses masih mulai `2025-01-01`, sedangkan judul menyebut crushing 2026.
2. Putuskan sumber kebenaran: database aplikasi atau workbook. Dashboard harus membaca satu sumber terverifikasi; Excel hanya template/rekonsiliasi bila database menjadi sumber utama.
3. Ganti atau rekalkulasi rumus eksternal `[1]product` dan `[2]Data1` sebelum data diunggah. Nilai `data_only` dapat menjadi nol atau usang saat Excel belum menghitung ulang.
4. Hapus/perbaiki sheet `Plan Delivery` lama yang tersembunyi dan memiliki `#REF!`; gunakan `Plan Delivery-` bila itu versi aktif.
5. Definisikan toleransi audit dalam ton dan pemilik data untuk tiap angka plan, actual, transfer, dan stok fisik.

## Urutan Implementasi

### 1. Kunci kontrak data dan tanggal aktif

- Konfirmasi rentang musim 2026, zona waktu, satuan ton/kg, dan sheet versi aktif.
- Buat pemetaan field Excel ke tabel/endpoint dashboard; jangan parse posisi baris Excel secara langsung di frontend.
- Tambah pemeriksaan import: tanggal di luar musim, `#REF!`, `#DIV/0!`, dan nilai kosong harus ditolak atau diberi status `data_unavailable`.
- Selesai bila dashboard menampilkan tanggal data, sumber data, dan status kelengkapan dengan benar.

### 2. Lengkapi delivery sebagai kontrol utama

- Tambah KPI: plan, actual, diff ton, dan `% diff` untuk gula serta molasses, harian dan to-date.
- Tambah grafik molasses plan vs actual pada tab `Delivery` atau tab `Molasses`.
- Bedakan gap negatif (kurang dari plan) dan positif (melebihi plan); jangan label keduanya sebagai defisit.
- Selesai bila total dashboard cocok dengan baris total di `Plan Delivery-` untuk tanggal uji.

### 3. Tambah ringkasan season dan crushing

- Tambah endpoint ringkas untuk target cane 1.450.000 ton, actual to-date, sisa target, dan progress.
- Tampilkan cane-in May–Nov serta produksi GKB/GKM/reject per bulan dan komposisi to-date.
- Selesai bila total bulanan sama dengan total season dan periode tanpa data tampil sebagai nol/— secara konsisten.

### 4. Lengkapi balance molasses

- Tampilkan `cane in`, `raw sugar in`, `molass in`, `yield`, begin/end inventory, dan move-out per kategori (`Bio`, `SO`, dan kategori lain yang disetujui).
- Tampilkan `—` untuk yield saat cane-in nol; jangan render `#DIV/0!` atau mengubahnya menjadi nol.
- Selesai bila persamaan: begin inventory + in − seluruh move-out = end inventory, dalam toleransi audit.

### 5. Perjelas stok lokasi dan kapasitas

- Ganti kapasitas gula tunggal menjadi daftar kapasitas per gudang/lokasi.
- Tampilkan stok, kapasitas, utilisasi, sisa ruang, serta selisih total lokasi terhadap `Balance 1`.
- Tambah delivery plan/actual GKB dan GKM per lokasi dari sheet `----`.
- Selesai bila total lokasi dapat direkonsiliasi dan mismatch diberi alasan yang dapat ditindaklanjuti.

### 6. Tambah indikator operasional dan export

- Tambah container GKB/GKM serta loading/downgrade RED/BLUE sebagai kartu/tren.
- Tambah ekspor CSV untuk tabel yang sudah tampil. Gunakan XLSX hanya jika pengguna membutuhkan format multi-sheet/formatting resmi.
- Selesai bila hasil ekspor menyamai filter tanggal aktif dan dapat dibuka Excel tanpa koreksi manual.

## Aturan Implementasi

- Gunakan database dan endpoint server sebagai sumber data dashboard; jangan hardcode angka Excel di HTML/JavaScript.
- Endpoint harus mengembalikan `date`, `source_status`, `data_quality`, dan nilai numerik mentah; frontend hanya memformat.
- Simpan angka dalam ton secara konsisten. Konversi kg dilakukan sekali pada batas import.
- Semua rumus audit dijalankan server-side dan memiliki toleransi eksplisit.
- Uji minimal: satu tanggal normal, satu tanggal cane-in nol, satu tanggal dengan delivery kosong, dan satu mismatch stok lokasi.

## Backlog Rendah Prioritas

- Status release per LOT (ICUMSA, jumlah karung, siap release): tambah saat data LOT sudah tersedia di database.
- Forecast/target harian: tambah setelah data aktual 2026 stabil minimal satu bulan.
- XLSX berformat penuh: tambah bila CSV tidak diterima proses bisnis.

## Masukan

1. Fokuskan dashboard pada keputusan harian: `apa yang kurang dari plan`, `tangki/gudang mana hampir penuh`, dan `angka mana tidak balance`.
2. Hindari menduplikasi seluruh workbook. Detail Excel tetap dipakai untuk audit; web menyajikan ringkasan, alert, drill-down, dan ekspor.
3. Tambahkan indikator kualitas data di setiap halaman. Dashboard yang terlihat lengkap tetapi memakai data 2025 atau rumus putus lebih berbahaya daripada kartu kosong.

Skipped: forecast, modul LOT, dan ekspor XLSX penuh; tambah setelah data 2026 tervalidasi dan kebutuhan pengguna jelas.

## Audit DB dan App Input — 18 Juli 2026

### Batas Audit

Alur yang dinilai adalah `user input → database → dashboard`. Workbook tidak diposisikan sebagai sumber import. Audit kode ini dapat memastikan tabel yang dibaca dashboard, tetapi tidak menemukan form atau endpoint tulis RMI di repository ini. App input mungkin aplikasi terpisah; perlu schema/API-nya untuk verifikasi end-to-end.

### Field yang Sudah Dipakai Dashboard dari DB

| Domain Excel | Tabel/field DB yang terbaca | Kesesuaian |
|---|---|---|
| Produksi gula GKM/GKB | `gula_penerimaan.gkm_crushing`, `gkm_melting`, `gkb_crushing`, `gkb_melting`, per `tanggal` dan `shift` | Ada untuk total produksi; belum terlihat reject produksi sebagai field utama. |
| Stok gula | `gula_stok.stok_awal_gkm`, `stok_awal_gkb`, `stok_akhir_gkm`, `stok_akhir_gkb`, `stok_akhir_reject` | Ada untuk balance inti. |
| Delivery gula | `gula_delivery.plan_delivery`, `actual_delivery`, `plan_delivery_gkm`, `plan_delivery_gkb`, `delivery_gkm`, `delivery_gkb` | Ada untuk plan/actual per produk. |
| Reject dan remelt | `gula_reject_log`, `gula_remelt_log` dengan `tanggal`, `jenis_reject`, `jumlah_kg` | Ada untuk rincian audit. |
| Produksi/input molasses | `mol_penerimaan.raw_sugar`, `cane_tebu`, per `tanggal` dan `shift` | Ada; query saat ini menjumlahkan keduanya sebagai produksi molasses, perlu verifikasi makna bisnisnya. |
| Stok tangki molasses | `mol_stok_tangki.stok_awal_tanka`, `stok_awal_tankb`, `stok_akhir_tanka`, `stok_akhir_tankb` | Ada untuk balance tangki A/B. |
| Delivery molasses | `mol_delivery.plan_delivery`, `actual_tank_a`, `actual_tank_b`, `next_schedule` | Ada untuk plan/actual dan jadwal berikutnya. |
| Stok gudang luar | `mst_gudang_luar` dan tabel stok lokasi yang dipakai query `get_lokasi_stok()` | Ada untuk stok akhir per lokasi. |
| Cane in | `data_timbang` bertipe `TEBU`, dari `Qty_Netto` dan `Tanggal_Keluar_Clean` | Ada bila timbangan menjadi sumber resmi cane in. |
| Setting umum | `rmi_settings.gula_capacity`, `molasses_capacity`, `milling_start_date` | Ada, tetapi kapasitas masih satu angka total. |

### Gap DB terhadap Excel

| Prioritas | Field/struktur yang belum terbukti ada | Dampak |
|---|---|---|
| Tinggi | Target musim cane dan target produksi per musim/bulan | KPI progress target 1.450.000 ton tidak dapat dikelola sebagai master data. |
| Tinggi | Move-out molasses per kategori (`Bio`, `SO`, dan kategori lain) | Balance molasses tidak dapat direkonsiliasi setara Excel; hanya actual delivery tangki yang terlihat. |
| Tinggi | Status/versi periode aktif dan tanggal efektif master data | Risiko dashboard mencampur data musim/tahun berbeda. |
| Sedang | Kapasitas per gudang/lokasi beserta tanggal efektif | Tidak dapat menghitung utilisasi per gudang seperti Excel. |
| Sedang | Container harian GKB/GKM | Indikator operasi Excel belum tersedia. |
| Sedang | Loading loss/downgrade RED/BLUE | Analisis susut dan downgrade belum tersedia. |
| Sedang | Delivery plan/actual per lokasi dan produk | Dashboard hanya dapat menampilkan total delivery, bukan pelaksanaan per gudang. |
| Rendah | Status release per LOT, ICUMSA, jumlah karung | Tidak tersedia untuk kontrol release stok. |

### Temuan Integrasi

1. `server.py` hanya memiliki endpoint baca untuk `/api/rmi-balance/*` dan `POST` untuk settings; tidak ada endpoint tulis untuk `gula_*`, `mol_*`, atau stok lokasi di repository ini.
2. `db_schema.sql` hanya mendefinisikan tabel dashboard/timbangan dasar. Tabel RMI yang dibaca (`gula_stok`, `gula_delivery`, `mol_penerimaan`, dan lainnya) tidak didefinisikan dalam schema tersebut, sehingga bootstrap database baru tidak reproduktif.
3. Koneksi metadata MySQL tidak berhasil dijalankan dari sesi audit ini. Nama dan sebagian field tabel di atas diperoleh dari query aplikasi, bukan hasil `SHOW CREATE TABLE`.
4. Query `rmi_balance.py` menghitung `produksiMolasses` dari `raw_sugar + cane_tebu`. Konfirmasi apakah kedua input tersebut memang tonase molasses; bila `cane_tebu` adalah bahan baku, rumus/dashboard harus dipisah.

### Tindakan Berikutnya

1. Minta schema DDL atau akses read-only ke DB aplikasi input, lalu bandingkan nama, tipe, nullability, unique key, dan foreign key aktual.
2. Dokumentasikan kontrak payload dari app input untuk setiap tabel RMI, termasuk satuan dan aturan update/replace per tanggal-shift.
3. Tambahkan migration versioned untuk seluruh tabel RMI yang sudah dipakai dashboard sebelum menambah field baru.
4. Tambahkan master `season` dan `warehouse_capacity`; tambah tabel transaksi move-out molasses dan delivery per lokasi hanya setelah kebutuhan input disetujui.

Skipped: perubahan schema dan form input; tambah setelah DDL aplikasi input dan definisi proses bisnis dikonfirmasi.

## Audit Source App Input — 18 Juli 2026

### Konfirmasi Alur

`D:\timbangan system\python\excelmysql\app.py` membuka `ModuleMolGula` melalui `_open_mol_gula()` (sekitar baris 1433). `mol_gula_module.py` adalah aplikasi input Tkinter yang menulis langsung ke MySQL menggunakan `pymysql`; bukan importer Excel.

### Input yang Sudah Tersedia

| Form input | Tabel DB | Field utama | Kesesuaian Excel |
|---|---|---|---|
| Penerimaan molasses per shift | `mol_penerimaan` | tanggal, shift, raw sugar, cane tebu, tangki tujuan | Ada untuk `Raw sugar in`, `Cane in`, dan input molasses. |
| Penerimaan gula per shift | `gula_penerimaan` | GKM/GKB crushing dan melting | Ada untuk produksi gula utama. |
| Delivery molasses harian | `mol_delivery` | plan, actual tank A/B, jumlah truck, next schedule | Ada untuk plan/actual; kategori move-out belum ada. |
| Delivery gula harian | `gula_delivery` | plan GKM/GKB, actual GKM/GKB, tonase, truck, gudang, actual RMI/temp warehouse | Lebih lengkap dari endpoint dashboard saat ini; mendukung lokasi dasar. |
| Reject gula | `gula_reject_log` | tanggal, shift, kategori, jenis gula, bahan, jenis reject, kg/ton, keterangan | Ada untuk reject detail. |
| Remelt | `gula_remelt_log` | tanggal, jenis reject, kg/ton, keterangan | Ada untuk remelt detail. |
| Stok gula dan lokasi | `gula_stok`, `gudang_luar_stok` | saldo awal/akhir, reject, stok per gudang | Ada untuk balance dan rekonsiliasi lokasi. |
| Master gudang | `mst_gudang_luar` | nama, tipe, parent, kapasitas ton, urutan, aktif | Kapasitas per gudang sudah didukung di input. |
| Status laporan | `rmi_daily_report` | draft/submitted/approved/locked, balance status, catatan selisih | Lebih baik daripada Excel; perlu dipakai dashboard. |

### Gap yang Terbukti dari Source

1. **Move-out molasses belum terpisah per kategori.** Form hanya menyimpan actual delivery Tank A/B di `mol_delivery`; Excel membedakan `Bio`, `SO`, dan kategori lainnya. Balance molasses belum bisa menjelaskan seluruh arus keluar.
2. **Container GKB/GKM belum ditemukan di `mol_gula_module.py`.** Excel memiliki blok `CONTAINER`; belum ada tabel/form input yang teridentifikasi.
3. **Loading/downgrade RED/BLUE belum ada sebagai form input khusus.** Reject dan remelt tersedia, tetapi tidak sama dengan susut loading/downgrade pada Excel.
4. **Delivery lokasi masih terbatas pada satu gudang per record delivery.** Belum ada struktur eksplisit untuk plan/actual per lokasi-produk seperti sheet `----`; perlu verifikasi apakah satu record per gudang sudah menjadi pola input yang disepakati.
5. **Target season cane belum terlihat di modul.** `rmi_daily_report` menyimpan status laporan, bukan master target musim dan target bulanan.
6. **Dashboard belum membaca seluruh kemampuan app input.** App sudah menyimpan `jml_truck`, `next_schedule`, `tomorrow_plan_delivery`, tonase, gudang, kapasitas gudang, dan status laporan; endpoint/dashboard belum menampilkan semuanya.

### Risiko Teknis Penting

- `_check_and_alter_db()` melakukan `CREATE TABLE` dan `ALTER TABLE` otomatis dari aplikasi input. Ini memudahkan instalasi, tetapi schema produksi tidak terkontrol versi dan `db_schema.sql` tetap tidak lengkap.
- Penyimpanan stok lokasi melakukan `DELETE` semua baris tanggal lalu `INSERT` ulang. Ini aman hanya jika transaksi atomic dan tidak ada dua operator menyimpan tanggal sama secara bersamaan.
- Input memakai angka ton, sedangkan sebagian tabel juga memiliki kolom kg dan ton. Perlu aturan konversi tunggal agar tidak terjadi input kg ke kolom ton.
- `ON DUPLICATE KEY UPDATE` bergantung pada unique key tabel aktual. DDL tabel utama tidak ada di repository dashboard, jadi key `tanggal/shift` perlu diverifikasi langsung dari DB.
- Modul menghitung dan merekalkulasi stok setelah edit/hapus. Dashboard harus menampilkan waktu pembaruan dan status draft/locked agar user tidak melihat angka perantara.

### Kesimpulan Revisi

DB dan aplikasi input sudah mencakup sekitar sebagian besar balance harian inti Excel. Gap terbesar bukan form dasar, melainkan tiga lapisan kontrol: arus molasses per kategori, container/losses operasional, dan master target season. Kapasitas gudang serta status laporan ternyata sudah tersedia di app, sehingga prioritas dashboard perlu dinaikkan untuk membaca field tersebut sebelum menambah tabel baru.

### Prioritas Revisi

1. Audit DDL aktual dan unique key tabel RMI.
2. Tambahkan endpoint/dashboard untuk kapasitas gudang, status laporan, jumlah truck, next schedule, dan delivery per gudang yang sudah diinput.
3. Tambahkan input dan tabel move-out molasses per kategori.
4. Tambahkan input container serta loading/downgrade RED/BLUE.
5. Tambahkan master target season dan breakdown target/actual bulanan.
6. Rapikan schema menjadi migration resmi; hentikan ketergantungan pada `ALTER TABLE` ad hoc setelah migrasi selesai.

Sumber pemeriksaan: `D:\timbangan system\python\excelmysql\app.py` sekitar baris 1433; `D:\timbangan system\python\excelmysql\mol_gula_module.py` sekitar baris 55–135, 189–381, 411–550, 1141–1416, 1802–1911, dan 2311–2905.

## Prioritas Inti End-to-End — App Input → DB → Dashboard

### Prinsip Acuan

Excel dipakai sebagai **referensi proses bisnis, rumus balance, nama field, dan hasil rekonsiliasi**. Data operasional tetap berasal dari app input dan DB. Jangan menyalin seluruh bentuk workbook ke web; ambil hanya angka yang membantu keputusan harian.

### P0 — Wajib Sebelum Menambah Fitur

| Bagian | Pertahankan | Tambahkan/perbaiki | Kurangi/hapus |
|---|---|---|---|
| App input | Input harian per tanggal dan shift; edit/hapus; status laporan | Validasi satuan ton/kg, tanggal, shift, angka negatif, duplikasi, dan periode yang sudah locked | Input bebas tanpa kategori, field duplikat, dan penyimpanan tanpa user/operator |
| DB | Tabel transaksi penerimaan, delivery, stok, reject/remelt, gudang | Migration resmi, foreign key, unique key per tanggal-shift, `created_by`, `updated_by`, `updated_at`, status/version data | `ALTER TABLE` ad hoc saat aplikasi dibuka; tabel legacy tanpa pemilik dan satuan jelas |
| Dashboard | Overview balance gula/molasses dan validasi | Tampilkan tanggal data, status `draft/approved/locked`, sumber data, kualitas data, dan waktu update | KPI mock/fallback yang terlihat seperti data produksi nyata |

**Definition of done P0:** satu tanggal dapat diinput, diedit, dikunci, dibaca dashboard, dan direkonsiliasi tanpa angka berubah diam-diam.

### P1 — Balance Harian Inti

| Bagian | Yang diperlukan | Acuan Excel |
|---|---|---|
| App input | Penerimaan cane/raw sugar, produksi GKM/GKB, stok awal/akhir, delivery plan/actual, reject/remelt | `Balance 1` dan sheet molasses harian |
| DB | Formula audit tersimpan atau dihitung server-side: opening + in − out = closing | Baris total dan `Stock Checking` |
| Dashboard | Kartu balance GKM, GKB, reject, molasses, tank A/B; diff ton dan status mismatch | `Balance 1`, `Balance โมลาสรายวัน อ้อย1.0` |

**Tambahkan:** detail penyebab selisih, bukan hanya badge `Balanced/Mismatch`.

**Kurangi:** kartu yang mengulang angka sama dalam beberapa panel.

### P2 — Delivery dan Lokasi

| Bagian | Tambahkan |
|---|---|
| App input | Pastikan setiap delivery memiliki produk, lokasi, plan, actual, truck, dan tanggal; satu transaksi tidak boleh ambigu antara RMI/temp warehouse |
| DB | Model delivery per lokasi-produk; unique key sesuai granularitas transaksi; kapasitas gudang dan stok per gudang |
| Dashboard | Plan vs actual gula dan molasses; diff/% diff harian dan to-date; tabel lokasi, kapasitas, utilisasi, sisa ruang, dan mismatch |

**Acuan Excel:** `Plan Delivery-` dan sheet `----`.

**Kurangi:** grafik delivery total tanpa rincian produk/lokasi dan tanpa periode data.

### P3 — Molasses Lengkap

| Bagian | Tambahkan |
|---|---|
| App input | Move-out molasses per kategori: `Bio`, `SO`, `Water/Connection Out`, `Demand`, dan kategori bisnis yang disetujui |
| DB | Tabel transaksi arus molasses dengan `tanggal`, `shift`, `kategori`, `qty_ton`, tujuan, operator, dan keterangan |
| Dashboard | Yield `molass in ÷ cane in`, raw sugar in terpisah, move-out breakdown, tank balance, dan alert bila yield/arus tidak wajar |

**Acuan Excel:** baris `Yield`, `Raw sugar in`, `Molass In`, dan `Move Out`.

**Aturan:** bila cane-in nol, yield tampil `—`, bukan `0%` atau `#DIV/0!`.

### P4 — Operasi dan Produksi

| Bagian | Tambahkan |
|---|---|
| App input | Container GKB/GKM; loading loss/downgrade RED/BLUE; target season cane dan target bulanan |
| DB | Tabel transaksi container/losses; master season dengan target total dan target bulanan |
| Dashboard | KPI progress cane, crushing GKB/GKM/reject bulanan, container harian, losses, dan tren yield |

**Acuan Excel:** `Sheet 1`, `CONTAINER`, `Stock Checking`, dan `DELIVERY & REJECT MONTHLY`.

**Kurangi:** menambahkan forecast sebelum data aktual dan definisi target stabil.

### P5 — Audit dan Pelaporan

| Bagian | Tambahkan |
|---|---|
| App input | Approval workflow dan alasan perubahan setelah submit |
| DB | Audit log perubahan nilai lama/baru, user, waktu, alasan, serta snapshot laporan harian |
| Dashboard | Filter tanggal yang konsisten, drill-down ke transaksi, export CSV, dan ringkasan audit |

**Kurangi:** prioritas XLSX penuh, status LOT, dan desain grafik tambahan sampai kontrol P0–P4 stabil.

## Urutan Pengerjaan Praktis

1. Bekukan definisi field, satuan, dan granularitas transaksi.
2. Buat DDL/migration resmi dari tabel yang saat ini dibuat oleh `mol_gula_module.py`.
3. Tambahkan validasi input dan locking pada app.
4. Perbaiki query dashboard agar membaca field aktual app, terutama kapasitas gudang, status laporan, truck, next schedule, dan delivery lokasi.
5. Implementasikan audit balance dan delivery diff.
6. Tambahkan move-out molasses per kategori.
7. Tambahkan container, losses, dan target season.
8. Tambahkan audit log dan export CSV.

## Daftar Field Minimum yang Harus Konsisten

`tanggal`, `shift`, `produk`, `lokasi`, `kategori_transaksi`, `qty_ton`, `qty_kg`, `plan_ton`, `actual_ton`, `stok_awal_ton`, `stok_akhir_ton`, `jenis_reject`, `kapasitas_ton`, `status_laporan`, `created_by`, `updated_at`.

Jangan membuat semua field wajib pada satu form. Field wajib mengikuti domain transaksi; dashboard menggabungkan hasilnya melalui endpoint server.

## Ukuran Keberhasilan

- Input satu tanggal menghasilkan angka yang sama pada DB dan dashboard.
- Total GKB/GKM, molasses, reject, dan stok lokasi dapat ditelusuri sampai transaksi.
- Selisih plan vs actual memiliki rumus dan tanda yang konsisten.
- Laporan locked tidak dapat diedit tanpa alasan dan jejak audit.
- Excel dapat direkonsiliasi terhadap dashboard tanpa input ulang atau penyesuaian manual.

Skipped: forecast, LOT release, dan XLSX multi-sheet; tambah setelah P0–P5 lulus.
