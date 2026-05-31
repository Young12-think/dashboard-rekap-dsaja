# app_queries/production.py
from datetime import datetime, timedelta
from .db_core import dec, query

def get_production_data(date_str):
    sql = """
        WITH TicketCounts AS (
            SELECT NoSystem, COUNT(*) as jml_tiket
            FROM data_timbang
            WHERE Tanggal_Keluar_Clean = %s
            GROUP BY NoSystem
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
            SUM(CASE WHEN t1.ItemName LIKE '%GULA%' THEN (CASE WHEN t1.Shift=1 THEN COALESCE(t1.Qty_SPMSPB,0) ELSE 0 END) ELSE (CASE WHEN t1.Shift=1 THEN COALESCE(t1.Qty_Netto,0)/tc.jml_tiket ELSE 0 END) END) AS shift1_tonase,
            COUNT(DISTINCT CASE WHEN t1.Shift=1 THEN t1.NoSystem END) AS shift1_ritase,
            SUM(CASE WHEN t1.ItemName LIKE '%GULA%' THEN (CASE WHEN t1.Shift=2 THEN COALESCE(t1.Qty_SPMSPB,0) ELSE 0 END) ELSE (CASE WHEN t1.Shift=2 THEN COALESCE(t1.Qty_Netto,0)/tc.jml_tiket ELSE 0 END) END) AS shift2_tonase,
            COUNT(DISTINCT CASE WHEN t1.Shift=2 THEN t1.NoSystem END) AS shift2_ritase,
            SUM(CASE WHEN t1.ItemName LIKE '%GULA%' THEN (CASE WHEN t1.Shift=3 THEN COALESCE(t1.Qty_SPMSPB,0) ELSE 0 END) ELSE (CASE WHEN t1.Shift=3 THEN COALESCE(t1.Qty_Netto,0)/tc.jml_tiket ELSE 0 END) END) AS shift3_tonase,
            COUNT(DISTINCT CASE WHEN t1.Shift=3 THEN t1.NoSystem END) AS shift3_ritase,
            SUM(CASE WHEN t1.ItemName LIKE '%GULA%' THEN COALESCE(t1.Qty_SPMSPB,0) ELSE COALESCE(t1.Qty_Netto,0)/tc.jml_tiket END) AS today_tonase,
            COUNT(DISTINCT t1.NoSystem) AS today_ritase
        FROM data_timbang t1
        JOIN TicketCounts tc ON t1.NoSystem = tc.NoSystem
        WHERE t1.Tanggal_Keluar_Clean = %s
          AND t1.ItemName IS NOT NULL AND t1.ItemName != ''
        GROUP BY 1
        ORDER BY CASE WHEN MAX(t1.ItemName) LIKE '%TEBU%' THEN 1 WHEN MAX(t1.ItemName) LIKE '%GULA%' THEN 2 WHEN MAX(t1.ItemName) LIKE '%FILTER CAKE%' OR MAX(t1.ItemName) LIKE '%BLOTONG%' THEN 3 WHEN MAX(t1.ItemName) LIKE '%FLY ASH%' OR MAX(t1.ItemName) LIKE '%FLYASH%' THEN 4 ELSE 5 END ASC, 1 ASC
    """
    data = dec(query(sql, (date_str, date_str)))
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
    sql = """
        WITH TicketCounts AS (SELECT NoSystem, COUNT(*) as jml_tiket FROM data_timbang WHERE Tanggal_Keluar_Clean = %s GROUP BY NoSystem)
        SELECT
            CASE WHEN t1.ItemName LIKE '%GULA%' THEN 'TOTAL GULA KRISTAL PUTIH' WHEN t1.ItemName LIKE '%TEBU%' THEN 'TEBU' WHEN t1.ItemName LIKE '%FILTER CAKE%' OR t1.ItemName LIKE '%BLOTONG%' THEN 'FILTER CAKE' WHEN t1.ItemName LIKE '%FLY ASH%' OR t1.ItemName LIKE '%FLYASH%' THEN 'FLY ASH' ELSE t1.ItemName END AS type,
            SUM(CASE WHEN t1.ItemName LIKE '%GULA%' THEN COALESCE(t1.Qty_SPMSPB, 0) ELSE COALESCE(t1.Qty_Netto, 0) / tc.jml_tiket END) AS total_tonase,
            COUNT(DISTINCT t1.NoSystem) AS total_ritase
        FROM data_timbang t1 JOIN TicketCounts tc ON t1.NoSystem = tc.NoSystem
        WHERE t1.Tanggal_Keluar_Clean = %s AND t1.ItemName IS NOT NULL AND t1.ItemName != ''
        GROUP BY 1 ORDER BY total_tonase DESC
    """
    data = dec(query(sql, (date_str, date_str)))
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
        sql = """
            SELECT Tanggal_Keluar_Clean AS tanggal,
                   ItemName AS ItemName, Qty_Netto,
                   Tanggal_Masuk, Jam_Masuk, Tanggal_Keluar, Jam_Keluar
            FROM data_timbang
            WHERE Tanggal_Keluar_Clean BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s
        """
        records = dec(query(sql, (date_str, days, date_str)))
        
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

                # TAT calculation
                tgl_m = r.get("Tanggal_Masuk", "")
                jm = r.get("Jam_Masuk", "")
                tgl_k = r.get("Tanggal_Keluar", "")
                jk = r.get("Jam_Keluar", "")
                
                if tgl_m and jm and tgl_k and jk:
                    try:
                        date_m = tgl_m.split(" ")[0]
                        fmt_m = "%d/%m/%y %H:%M:%S" if len(date_m.split('/')[-1]) == 2 else "%d/%m/%Y %H:%M:%S"
                        dt_m = datetime.strptime(f"{date_m} {jm}", fmt_m)

                        date_k = tgl_k.split(" ")[0]
                        fmt_k = "%d/%m/%y %H:%M:%S" if len(date_k.split('/')[-1]) == 2 else "%d/%m/%Y %H:%M:%S"
                        dt_k = datetime.strptime(f"{date_k} {jk}", fmt_k)

                        tat_min = (dt_k - dt_m).total_seconds() / 60.0
                        if 0 <= tat_min <= 10080: # Max 7 days
                            aggregated[key]['tat_list'].append(tat_min)
                    except:
                        pass
                        
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
