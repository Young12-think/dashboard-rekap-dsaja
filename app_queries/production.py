# app_queries/production.py
# ─────────────────────────────────────────────────────────────
# DASHBOARD: Produksi, Summary, History, Recent.
# Anti-Dobel SPT: CTE + LAG() untuk GULA & MOLASES.
# ─────────────────────────────────────────────────────────────
from datetime import datetime, timedelta
from .db_core import dec, query


# =============================================
# REUSABLE CTE: Anti-Dobel SPT (GULA & MOLASES)
# =============================================
def _dedup_cte():
    """
    SQL CTE fragment untuk mendeteksi dan menandai baris duplikat
    (Double SPT) pada item GULA dan MOLASES.

    Membutuhkan 2 parameter %s: (lookback_start_date, lookback_end_date).
    Menghasilkan virtual table 'Cleaned' dengan kolom tambahan:
      - item_cat  : 'GULA', 'MOLASES', atau 'OTHER'
      - full_dt   : TIMESTAMP lengkap (Tanggal_Keluar_Clean + Jam_Keluar)
      - prev_dt   : Timestamp timbangan sebelumnya dari truk yang sama
      - is_dup    : 1 = duplikat (harus di-exclude), 0 = data asli

    Logika deteksi:
      1. GULA: Nopol+Supir+Qty_Netto sama, jarak waktu keluar <= 30 menit
      2. MOLASES Kasus 1: Sama seperti GULA
      3. MOLASES Kasus 2: Remarks mengandung 'tambahan' → selalu duplikat
    """
    return """WITH RawData AS (
        SELECT d.*,
            CASE
                WHEN UPPER(COALESCE(d.ItemName, '')) LIKE '%GULA%' THEN 'GULA'
                WHEN UPPER(COALESCE(d.ItemName, '')) LIKE '%MOLASSE%'
                  OR UPPER(COALESCE(d.ItemName, '')) LIKE '%TETES%'
                  OR UPPER(COALESCE(d.ItemName, '')) LIKE '%MILASSE%' THEN 'MOLASES'
                ELSE 'OTHER'
            END AS item_cat,
            TIMESTAMP(d.Tanggal_Keluar_Clean, COALESCE(d.Jam_Keluar, '00:00:00')) AS full_dt
        FROM data_timbang d
        WHERE d.Tanggal_Keluar_Clean BETWEEN %s AND %s
    ),
    WithPrev AS (
        SELECT r.*,
            LAG(r.full_dt) OVER (
                PARTITION BY r.item_cat,
                             UPPER(TRIM(COALESCE(r.Nopol, ''))),
                             UPPER(TRIM(COALESCE(r.Supir, ''))),
                             ABS(COALESCE(r.Qty_Netto, 0))
                ORDER BY r.full_dt
            ) AS prev_dt
        FROM RawData r
    ),
    Cleaned AS (
        SELECT w.*,
            CASE
                WHEN w.item_cat = 'MOLASES'
                     AND( LOWER(COALESCE(w.Remarks, '')) LIKE '%%tambahan%%'
                     OR
                     LOWER(COALESCE(w.Remarks, '')) LIKE '%%over%%'
                     OR
                     LOWER(COALESCE(w.Remarks, '')) LIKE '%%DO%%'
                     OR
                     LOWER(COALESCE(w.Remarks, '')) LIKE CONCAT('%', 'spt', '%')
                     )
                THEN 1
                WHEN w.item_cat IN ('GULA', 'MOLASES')
                     AND TRIM(COALESCE(w.Nopol, '')) != ''
                     AND w.prev_dt IS NOT NULL
                     AND TIMESTAMPDIFF(MINUTE, w.prev_dt, w.full_dt) <= 30
                THEN 1
                ELSE 0
            END AS is_dup
        FROM WithPrev w
    )"""


# =============================================
# ROBUST DATE+TIME PARSER (handles all MySQL return types)
# =============================================
def _parse_dt(tgl_raw, jam_raw):
    """
    Robust parser for Tanggal + Jam fields from MySQL.
    Handles: datetime objects, date objects, timedelta (MySQL TIME columns),
    and various string formats (DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD, HH:MM, HH:MM:SS).
    Returns: datetime object or None on failure.
    """
    try:
        # ─── Parse date part ───
        if hasattr(tgl_raw, 'year'):  # datetime or date object
            year, month, day = tgl_raw.year, tgl_raw.month, tgl_raw.day
        elif isinstance(tgl_raw, str) and tgl_raw.strip():
            s = tgl_raw.strip().split(" ")[0]
            if '/' in s:
                parts = s.split('/')
                if len(parts) == 3:
                    if len(parts[-1]) == 2:
                        d = datetime.strptime(s, "%d/%m/%y")
                    else:
                        d = datetime.strptime(s, "%d/%m/%Y")
                    year, month, day = d.year, d.month, d.day
                else:
                    return None
            elif '-' in s:
                d = datetime.strptime(s, "%Y-%m-%d")
                year, month, day = d.year, d.month, d.day
            else:
                return None
        else:
            return None

        # ─── Parse time part ───
        if isinstance(jam_raw, timedelta):
            total_sec = int(jam_raw.total_seconds())
            h = total_sec // 3600
            m = (total_sec % 3600) // 60
            sec = total_sec % 60
        elif hasattr(jam_raw, 'hour'):  # time object
            h, m, sec = jam_raw.hour, jam_raw.minute, jam_raw.second
        elif isinstance(jam_raw, str) and jam_raw.strip():
            parts = jam_raw.strip().split(':')
            h = int(parts[0])
            m = int(parts[1]) if len(parts) > 1 else 0
            sec = int(float(parts[2])) if len(parts) > 2 else 0
        else:
            return None

        return datetime(year, month, day, h, m, sec)
    except Exception:
        return None


def get_production_data(date_str):
    try:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        lb_start = (dt - timedelta(days=2)).strftime('%Y-%m-%d')
    except ValueError:
        return []

    sql = _dedup_cte() + """,
        TicketCounts AS (
            SELECT NoSystem, COUNT(*) as jml_tiket
            FROM Cleaned
            WHERE Tanggal_Keluar_Clean = %s AND is_dup = 0
            GROUP BY NoSystem
        ),
        /* GULA: Ambil SEMUA Qty_SPMSPB (termasuk is_dup=1) karena tiap SPT punya tonase SPM sendiri */
        AllGulaSpb AS (
            SELECT
                CASE
                    WHEN ItemName LIKE '%%GULA KRISTAL PUTIH (BIRU)%%' THEN 'GULA KRISTAL PUTIH (BIRU)'
                    WHEN ItemName LIKE '%%GULA KRISTAL PUTIH (MERAH)%%' THEN 'GULA KRISTAL PUTIH (MERAH)'
                    ELSE ItemName
                END AS gula_type,
                Shift,
                COALESCE(Qty_SPMSPB, 0) AS spb_val
            FROM Cleaned
            WHERE Tanggal_Keluar_Clean = %s
              AND item_cat = 'GULA'
              AND ItemName IS NOT NULL AND ItemName != ''
        ),
        GulaSpbTotals AS (
            SELECT
                gula_type,
                SUM(CASE WHEN Shift = 1 THEN spb_val ELSE 0 END) AS gula_shift1,
                SUM(CASE WHEN Shift = 2 THEN spb_val ELSE 0 END) AS gula_shift2,
                SUM(CASE WHEN Shift = 3 THEN spb_val ELSE 0 END) AS gula_shift3,
                SUM(spb_val) AS gula_total
            FROM AllGulaSpb
            GROUP BY gula_type
        )
        SELECT
            CASE
                WHEN t1.ItemName LIKE '%GULA KRISTAL PUTIH (BIRU)%' THEN 'GULA KRISTAL PUTIH (BIRU)'
                WHEN t1.ItemName LIKE '%GULA KRISTAL PUTIH (MERAH)%' THEN 'GULA KRISTAL PUTIH (MERAH)'
                WHEN t1.ItemName LIKE '%TEBU%' THEN 'TEBU'
                WHEN t1.ItemName LIKE '%FILTER CAKE%' OR t1.ItemName LIKE '%BLOTONG%' THEN 
                    CONCAT('FILTER CAKE (PO: ', COALESCE(NULLIF(REPLACE(t1.Nomor_PO, ',', '.'), ''), 'KOSONG'), ')')
                WHEN t1.ItemName LIKE '%FLY ASH%' OR t1.ItemName LIKE '%FLYASH%' THEN 
                    CONCAT('FLY ASH (PO: ', COALESCE(NULLIF(REPLACE(t1.Nomor_PO, ',', '.'), ''), 'KOSONG'), ')')
                ELSE t1.ItemName
            END AS type,
            SUM(CASE WHEN t1.ItemName LIKE '%GULA%' THEN 0 ELSE (CASE WHEN t1.Shift=1 THEN COALESCE(t1.Qty_Netto,0)/tc.jml_tiket ELSE 0 END) END) +
                COALESCE(MAX(gs.gula_shift1), 0) AS shift1_tonase,
            COUNT(DISTINCT CASE WHEN t1.Shift=1 THEN t1.NoSystem END) AS shift1_ritase,
            SUM(CASE WHEN t1.ItemName LIKE '%GULA%' THEN 0 ELSE (CASE WHEN t1.Shift=2 THEN COALESCE(t1.Qty_Netto,0)/tc.jml_tiket ELSE 0 END) END) +
                COALESCE(MAX(gs.gula_shift2), 0) AS shift2_tonase,
            COUNT(DISTINCT CASE WHEN t1.Shift=2 THEN t1.NoSystem END) AS shift2_ritase,
            SUM(CASE WHEN t1.ItemName LIKE '%GULA%' THEN 0 ELSE (CASE WHEN t1.Shift=3 THEN COALESCE(t1.Qty_Netto,0)/tc.jml_tiket ELSE 0 END) END) +
                COALESCE(MAX(gs.gula_shift3), 0) AS shift3_tonase,
            COUNT(DISTINCT CASE WHEN t1.Shift=3 THEN t1.NoSystem END) AS shift3_ritase,
            SUM(CASE WHEN t1.ItemName LIKE '%GULA%' THEN 0 ELSE COALESCE(t1.Qty_Netto,0)/tc.jml_tiket END) +
                COALESCE(MAX(gs.gula_total), 0) AS today_tonase,
            COUNT(DISTINCT t1.NoSystem) AS today_ritase
        FROM Cleaned t1
        JOIN TicketCounts tc ON t1.NoSystem = tc.NoSystem
        LEFT JOIN GulaSpbTotals gs ON gs.gula_type = CASE
                WHEN t1.ItemName LIKE '%GULA KRISTAL PUTIH (BIRU)%' THEN 'GULA KRISTAL PUTIH (BIRU)'
                WHEN t1.ItemName LIKE '%GULA KRISTAL PUTIH (MERAH)%' THEN 'GULA KRISTAL PUTIH (MERAH)'
                ELSE NULL
            END
        WHERE t1.Tanggal_Keluar_Clean = %s
          AND t1.is_dup = 0
          AND t1.ItemName IS NOT NULL AND t1.ItemName != ''
        GROUP BY 1
        ORDER BY CASE WHEN MAX(t1.ItemName) LIKE '%TEBU%' THEN 1 WHEN MAX(t1.ItemName) LIKE '%GULA%' THEN 2 WHEN MAX(t1.ItemName) LIKE '%FILTER CAKE%' OR MAX(t1.ItemName) LIKE '%BLOTONG%' THEN 3 WHEN MAX(t1.ItemName) LIKE '%FLY ASH%' OR MAX(t1.ItemName) LIKE '%FLYASH%' THEN 4 ELSE 5 END ASC, 1 ASC
    """
    data = dec(query(sql, (lb_start, date_str, date_str, date_str, date_str)))
    if not data:
        return []
    fc_sub = {"type": "➡️ TOTAL TODAY FILTER CAKE", "shift1_tonase": 0, "shift1_ritase": 0, "shift2_tonase": 0, "shift2_ritase": 0, "shift3_tonase": 0, "shift3_ritase": 0, "today_tonase": 0, "today_ritase": 0}
    fa_sub = {"type": "➡️ TOTAL TODAY FLY ASH", "shift1_tonase": 0, "shift1_ritase": 0, "shift2_tonase": 0, "shift2_ritase": 0, "shift3_tonase": 0, "shift3_ritase": 0, "today_tonase": 0, "today_ritase": 0}
    has_fc = False; has_fa = False
    for row in data:
        if 'FILTER CAKE (PO:' in row['type']:
            has_fc = True
            for k in fc_sub.keys():
                if k != 'type': fc_sub[k] += row.get(k, 0)
        if 'FLY ASH (PO:' in row['type']:
            has_fa = True
            for k in fa_sub.keys():
                if k != 'type': fa_sub[k] += row.get(k, 0)
    if has_fc: data.append(fc_sub)
    if has_fa: data.append(fa_sub)
    return data

def get_summary_data(date_str):
    try:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        lb_start = (dt - timedelta(days=2)).strftime('%Y-%m-%d')
    except ValueError:
        return None

    sql = _dedup_cte() + """,
        TicketCounts AS (SELECT NoSystem, COUNT(*) as jml_tiket FROM Cleaned WHERE Tanggal_Keluar_Clean = %s AND is_dup = 0 GROUP BY NoSystem),
        /* GULA: Ambil SEMUA Qty_SPMSPB (termasuk is_dup=1) */
        AllGulaSpb AS (
            SELECT SUM(COALESCE(Qty_SPMSPB, 0)) AS total_spb
            FROM Cleaned
            WHERE Tanggal_Keluar_Clean = %s AND item_cat = 'GULA'
              AND ItemName IS NOT NULL AND ItemName != ''
        )
        SELECT
            CASE WHEN t1.ItemName LIKE '%GULA%' THEN 'TOTAL GULA KRISTAL PUTIH' WHEN t1.ItemName LIKE '%TEBU%' THEN 'TEBU' WHEN t1.ItemName LIKE '%FILTER CAKE%' OR t1.ItemName LIKE '%BLOTONG%' THEN 'FILTER CAKE' WHEN t1.ItemName LIKE '%FLY ASH%' OR t1.ItemName LIKE '%FLYASH%' THEN 'FLY ASH' ELSE t1.ItemName END AS type,
            CASE 
                WHEN MAX(CASE WHEN t1.ItemName LIKE '%GULA%' THEN 1 ELSE 0 END) = 1 
                THEN (SELECT total_spb FROM AllGulaSpb)
                ELSE SUM(COALESCE(t1.Qty_Netto, 0) / tc.jml_tiket)
            END AS total_tonase,
            COUNT(DISTINCT t1.NoSystem) AS total_ritase
        FROM Cleaned t1 JOIN TicketCounts tc ON t1.NoSystem = tc.NoSystem
        WHERE t1.Tanggal_Keluar_Clean = %s AND t1.is_dup = 0 AND t1.ItemName IS NOT NULL AND t1.ItemName != ''
        GROUP BY 1 ORDER BY total_tonase DESC
    """
    data = dec(query(sql, (lb_start, date_str, date_str, date_str, date_str)))
    if data is None: return None
    summary = {}
    if data:
        for row in data:
            t = row.get('type', 'UNKNOWN')
            summary[t] = {"tonase": row.get('total_tonase', 0), "ritase": row.get('total_ritase', 0)}
    return summary

def get_types():
    sql = """
        SELECT CASE WHEN ItemName LIKE '%GULA KRISTAL PUTIH (BIRU)%' THEN 'GULA KRISTAL PUTIH (BIRU)' WHEN ItemName LIKE '%GULA KRISTAL PUTIH (MERAH)%' THEN 'GULA KRISTAL PUTIH (MERAH)' WHEN ItemName LIKE '%TEBU%' THEN 'TEBU' WHEN ItemName LIKE '%FILTER CAKE%' OR ItemName LIKE '%BLOTONG%' THEN CONCAT('FILTER CAKE (PO: ', COALESCE(NULLIF(REPLACE(Nomor_PO, ',', '.'), ''), 'KOSONG'), ')') WHEN ItemName LIKE '%FLY ASH%' OR ItemName LIKE '%FLYASH%' THEN CONCAT('FLY ASH (PO: ', COALESCE(NULLIF(REPLACE(Nomor_PO, ',', '.'), ''), 'KOSONG'), ')') ELSE ItemName END AS type
        FROM data_timbang WHERE ItemName IS NOT NULL AND ItemName != '' GROUP BY 1
        ORDER BY CASE WHEN MAX(ItemName) LIKE '%TEBU%' THEN 1 WHEN MAX(ItemName) LIKE '%GULA%' THEN 2 WHEN MAX(ItemName) LIKE '%FILTER CAKE%' OR MAX(ItemName) LIKE '%BLOTONG%' THEN 3 WHEN MAX(ItemName) LIKE '%FLY ASH%' OR MAX(ItemName) LIKE '%FLYASH%' THEN 4 ELSE 5 END ASC, 1 ASC
    """
    data = query(sql)
    if data is None: return None
    return [r['type'] for r in data] if data else []

def get_history_data(date_str, days=7):
    try:
        end_dt = datetime.strptime(date_str, '%Y-%m-%d')
        start_dt = end_dt - timedelta(days=days)
        lb_start = (start_dt - timedelta(days=2)).strftime('%Y-%m-%d')

        sql = _dedup_cte() + """
            SELECT Tanggal_Keluar_Clean AS tanggal,
                   t1.ItemName AS ItemName, t1.Qty_Netto,
                   t1.Tanggal_Masuk, t1.Jam_Masuk, t1.Tanggal_Keluar, t1.Jam_Keluar
            FROM Cleaned t1
            WHERE t1.Tanggal_Keluar_Clean BETWEEN %s AND %s
              AND t1.is_dup = 0
        """
        records = dec(query(sql, (lb_start, date_str, start_dt.strftime('%Y-%m-%d'), date_str)))
        
        aggregated = {}
        if records:
            for r in records:
                tgl = str(r.get('tanggal')) if r.get('tanggal') else None
                if not tgl: continue
                item = r.get('ItemName')
                key = (tgl, item)
                
                if key not in aggregated:
                    aggregated[key] = {'total_tonase': 0, 'total_ritase': 0, 'tat_list': []}
                
                aggregated[key]['total_tonase'] += float(r.get('Qty_Netto') or 0)
                aggregated[key]['total_ritase'] += 1

                # TAT calculation (robust: handles datetime/date/timedelta/string)
                dt_m = _parse_dt(r.get("Tanggal_Masuk"), r.get("Jam_Masuk"))
                dt_k = _parse_dt(r.get("Tanggal_Keluar"), r.get("Jam_Keluar"))
                if dt_m and dt_k:
                    tat_min = (dt_k - dt_m).total_seconds() / 60.0
                    if 0 <= tat_min <= 10080:
                        aggregated[key]['tat_list'].append(tat_min)
                        
        data = []
        for (tgl, item), val in aggregated.items():
            avg_tat = sum(val['tat_list']) / len(val['tat_list']) if val['tat_list'] else 0
            data.append({
                'tanggal': tgl,
                'ItemName': item,
                'total_tonase': val['total_tonase'],
                'total_ritase': val['total_ritase'],
                'avg_tat': avg_tat,
                'sum_tat': sum(val['tat_list']),
                'count_tat': len(val['tat_list'])
            })
        
        data = sorted(data, key=lambda x: (x['tanggal'], x['ItemName'] or ""))
        
        return {"start_date": start_dt.strftime('%Y-%m-%d'), "end_date": end_dt.strftime('%Y-%m-%d'), "data": data}
    except Exception as e:
        import traceback; traceback.print_exc()
        return None

def get_recent_data(date_str, limit=50):
    sql = """
        SELECT No AS no, ItemName AS ItemName, Status AS status, CardName AS card_name, ItemName AS item_name,
               Qty_Netto AS qty_netto, Qty_SJ AS qty_sj, Nopol AS nopol, Supir AS supir, Transportir AS transportir,
               Tanggal_Masuk AS tanggal_masuk, Berat_Masuk AS berat_masuk, Jam_Masuk AS jam_masuk,
               Tanggal_Keluar AS tanggal_keluar, Berat_Keluar AS berat_keluar, Jam_Keluar AS jam_keluar,
               Shift AS shift, Remarks AS remarks
        FROM data_timbang WHERE Tanggal_Keluar_Clean = %s ORDER BY id DESC LIMIT %s
    """
    data = dec(query(sql, (date_str, limit)))
    if data:
        for row in data:
            for key in ['tanggal_masuk', 'tanggal_keluar']:
                if row.get(key): row[key] = str(row[key])
    return data
