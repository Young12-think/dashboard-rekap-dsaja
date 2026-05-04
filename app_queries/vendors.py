# app_queries/vendors.py
from .db_core import dec, query

def get_vendor_data(date_str):
    sql_daily = """
        SELECT
            CardName AS vendor_name,
            SUM(CASE WHEN Shift=1 THEN 1 ELSE 0 END) AS shift1_rit,
            SUM(CASE WHEN Shift=1 THEN COALESCE(Qty_Netto,0) ELSE 0 END) AS shift1_kg,
            SUM(CASE WHEN Shift=2 THEN 1 ELSE 0 END) AS shift2_rit,
            SUM(CASE WHEN Shift=2 THEN COALESCE(Qty_Netto,0) ELSE 0 END) AS shift2_kg,
            SUM(CASE WHEN Shift=3 THEN 1 ELSE 0 END) AS shift3_rit,
            SUM(CASE WHEN Shift=3 THEN COALESCE(Qty_Netto,0) ELSE 0 END) AS shift3_kg,
            COUNT(*) AS today_rit,
            SUM(COALESCE(Qty_Netto,0)) AS today_kg
        FROM data_timbang
        WHERE STR_TO_DATE(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1), '%d/%m/%Y') = %s
          AND CardName IS NOT NULL AND CardName != ''
        GROUP BY CardName ORDER BY today_kg DESC
    """
    sql_todate = """
        SELECT CardName AS vendor_name,
               COUNT(*) AS ritase, SUM(COALESCE(Qty_Netto,0)) AS netto
        FROM data_timbang
        WHERE CardName IS NOT NULL AND CardName != ''
        GROUP BY CardName
    """
    daily = dec(query(sql_daily, (date_str,))) or []
    todate_raw = dec(query(sql_todate)) or []
    todate_map = {r['vendor_name']: r for r in todate_raw}

    result = []
    for row in daily:
        vn = row['vendor_name']
        td = todate_map.get(vn, {})
        result.append({
            'vendor_name': vn,
            'daily': {
                'shift1_rit': row.get('shift1_rit', 0), 'shift1_kg': row.get('shift1_kg', 0),
                'shift2_rit': row.get('shift2_rit', 0), 'shift2_kg': row.get('shift2_kg', 0),
                'shift3_rit': row.get('shift3_rit', 0), 'shift3_kg': row.get('shift3_kg', 0),
                'today_rit':  row.get('today_rit', 0),  'today_kg':  row.get('today_kg', 0),
            },
            'todate': {
                'ritase': td.get('ritase', 0),
                'netto':  td.get('netto', 0),
            }
        })
    return result
