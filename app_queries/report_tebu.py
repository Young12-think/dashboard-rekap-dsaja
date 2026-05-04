# app_queries/report_tebu.py
from .db_core import dec, query

def get_report_tebu(date_from, date_to, rekap_from=None, rekap_to=None):
    if not rekap_to:
        rekap_to = date_to

    sql_today = """
        SELECT Shift, COUNT(DISTINCT NoSystem) as ritase,
               SUM(COALESCE(Qty_sblm_Rafaksi, Qty_Netto, 0)) as netto_sebelum,
               SUM(COALESCE(Qty_Netto, 0)) as netto_sesudah,
               SUM(CASE WHEN Kendaraan = 'ENGKEL' THEN 1 ELSE 0 END) as tipe_engkel,
               SUM(CASE WHEN Kendaraan = 'FUSO' THEN 1 ELSE 0 END) as tipe_fuso,
               SUM(CASE WHEN Kendaraan = 'DOUBLE TRUCK' THEN 1 ELSE 0 END) as tipe_double
        FROM data_timbang
        WHERE STR_TO_DATE(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1), '%d/%m/%Y') BETWEEN %s AND %s
          AND ItemName LIKE '%TEBU%'
        GROUP BY Shift
    """
    res_today = dec(query(sql_today, (date_from, date_to))) or []

    if rekap_from:
        sql_todate = """
            SELECT COUNT(DISTINCT NoSystem) as ritase,
                   SUM(COALESCE(Qty_sblm_Rafaksi, Qty_Netto, 0)) as netto_sebelum,
                   SUM(COALESCE(Qty_Netto, 0)) as netto_sesudah,
                   SUM(CASE WHEN Kendaraan = 'ENGKEL' THEN 1 ELSE 0 END) as tipe_engkel,
                   SUM(CASE WHEN Kendaraan = 'FUSO' THEN 1 ELSE 0 END) as tipe_fuso,
                   SUM(CASE WHEN Kendaraan = 'DOUBLE TRUCK' THEN 1 ELSE 0 END) as tipe_double
            FROM data_timbang
            WHERE STR_TO_DATE(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1), '%d/%m/%Y') BETWEEN %s AND %s
              AND ItemName LIKE '%TEBU%'
        """
        res_todate = dec(query(sql_todate, (rekap_from, rekap_to))) or []
    else:
        sql_todate = """
            SELECT COUNT(DISTINCT NoSystem) as ritase,
                   SUM(COALESCE(Qty_sblm_Rafaksi, Qty_Netto, 0)) as netto_sebelum,
                   SUM(COALESCE(Qty_Netto, 0)) as netto_sesudah,
                   SUM(CASE WHEN Kendaraan = 'ENGKEL' THEN 1 ELSE 0 END) as tipe_engkel,
                   SUM(CASE WHEN Kendaraan = 'FUSO' THEN 1 ELSE 0 END) as tipe_fuso,
                   SUM(CASE WHEN Kendaraan = 'DOUBLE TRUCK' THEN 1 ELSE 0 END) as tipe_double
            FROM data_timbang
            WHERE STR_TO_DATE(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1), '%d/%m/%Y') <= %s
              AND ItemName LIKE '%TEBU%'
        """
        res_todate = dec(query(sql_todate, (rekap_to,))) or []

    shifts = {1: {}, 2: {}, 3: {}}
    for i in range(1, 4):
        shifts[i] = {"ritase": 0, "netto_sebelum": 0, "netto_sesudah": 0, "tipe_engkel": 0, "tipe_fuso": 0, "tipe_double": 0}
    today_total = {"ritase": 0, "netto_sebelum": 0, "netto_sesudah": 0, "tipe_engkel": 0, "tipe_fuso": 0, "tipe_double": 0}

    for r in res_today:
        s = r.get('Shift', 1)
        if s in shifts:
            shifts[s]['ritase'] = r.get('ritase', 0)
            shifts[s]['netto_sebelum'] = float(r.get('netto_sebelum', 0))
            shifts[s]['netto_sesudah'] = float(r.get('netto_sesudah', 0))
            shifts[s]['tipe_engkel'] = int(r.get('tipe_engkel', 0))
            shifts[s]['tipe_fuso'] = int(r.get('tipe_fuso', 0))
            shifts[s]['tipe_double'] = int(r.get('tipe_double', 0))
            for k in today_total.keys():
                today_total[k] += shifts[s][k]

    todate_data = {"ritase": 0, "netto_sebelum": 0, "netto_sesudah": 0, "tipe_engkel": 0, "tipe_fuso": 0, "tipe_double": 0}
    if res_todate and len(res_todate) > 0:
        tr = res_todate[0]
        todate_data['ritase'] = tr.get('ritase', 0)
        todate_data['netto_sebelum'] = float(tr.get('netto_sebelum', 0) or 0)
        todate_data['netto_sesudah'] = float(tr.get('netto_sesudah', 0) or 0)
        todate_data['tipe_engkel'] = int(tr.get('tipe_engkel', 0) or 0)
        todate_data['tipe_fuso'] = int(tr.get('tipe_fuso', 0) or 0)
        todate_data['tipe_double'] = int(tr.get('tipe_double', 0) or 0)

    return {"shift1": shifts[1], "shift2": shifts[2], "shift3": shifts[3], "today": today_total, "todate": todate_data}
