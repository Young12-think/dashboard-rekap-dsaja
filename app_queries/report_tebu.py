# app_queries/report_tebu.py
from .db_core import dec, query

def get_report_tebu(date_from, date_to, rekap_from=None, rekap_to=None):
    if not rekap_to:
        rekap_to = date_to

    sql_today = """
        SELECT Shift, COUNT(DISTINCT NoSystem) as ritase,
               SUM(COALESCE(Qty_sblm_Rafaksi, Qty_Netto, 0)) as netto_sebelum,
               SUM(COALESCE(Qty_Netto, 0)) as netto_sesudah,
               COUNT(DISTINCT CASE WHEN UPPER(TRIM(Kendaraan)) LIKE '%ENGK%' THEN NoSystem END) as tipe_engkel,
               COUNT(DISTINCT CASE WHEN UPPER(TRIM(Kendaraan)) LIKE '%FUSO%' OR UPPER(TRIM(Kendaraan)) LIKE '%TRONTON%' THEN NoSystem END) as tipe_fuso,
               COUNT(DISTINCT CASE WHEN UPPER(TRIM(Kendaraan)) LIKE '%MINI%' OR UPPER(TRIM(Kendaraan)) LIKE '%PICKUP%' OR UPPER(TRIM(Kendaraan)) LIKE '%L300%' THEN NoSystem END) as tipe_double
        FROM data_timbang
        WHERE Tanggal_Keluar_Clean BETWEEN %s AND %s
          AND ItemName LIKE '%TEBU%'
        GROUP BY Shift
    """
    res_today = dec(query(sql_today, (date_from, date_to))) or []

    if rekap_from:
        sql_prior = """
            SELECT COUNT(DISTINCT NoSystem) as ritase,
                   SUM(COALESCE(Qty_sblm_Rafaksi, Qty_Netto, 0)) as netto_sebelum,
                   SUM(COALESCE(Qty_Netto, 0)) as netto_sesudah,
                   COUNT(DISTINCT CASE WHEN UPPER(TRIM(Kendaraan)) LIKE '%ENGK%' THEN NoSystem END) as tipe_engkel,
                   COUNT(DISTINCT CASE WHEN UPPER(TRIM(Kendaraan)) LIKE '%FUSO%' OR UPPER(TRIM(Kendaraan)) LIKE '%TRONTON%' THEN NoSystem END) as tipe_fuso,
                   COUNT(DISTINCT CASE WHEN UPPER(TRIM(Kendaraan)) LIKE '%MINI%' OR UPPER(TRIM(Kendaraan)) LIKE '%PICKUP%' OR UPPER(TRIM(Kendaraan)) LIKE '%L300%' THEN NoSystem END) as tipe_double
            FROM data_timbang
            WHERE Tanggal_Keluar_Clean >= %s
              AND Tanggal_Keluar_Clean < %s
              AND ItemName LIKE '%TEBU%'
        """
        res_prior = dec(query(sql_prior, (rekap_from, rekap_to))) or []
    else:
        sql_prior = """
            SELECT COUNT(DISTINCT NoSystem) as ritase,
                   SUM(COALESCE(Qty_sblm_Rafaksi, Qty_Netto, 0)) as netto_sebelum,
                   SUM(COALESCE(Qty_Netto, 0)) as netto_sesudah,
                   COUNT(DISTINCT CASE WHEN UPPER(TRIM(Kendaraan)) LIKE '%ENGK%' THEN NoSystem END) as tipe_engkel,
                   COUNT(DISTINCT CASE WHEN UPPER(TRIM(Kendaraan)) LIKE '%FUSO%' OR UPPER(TRIM(Kendaraan)) LIKE '%TRONTON%' THEN NoSystem END) as tipe_fuso,
                   COUNT(DISTINCT CASE WHEN UPPER(TRIM(Kendaraan)) LIKE '%MINI%' OR UPPER(TRIM(Kendaraan)) LIKE '%PICKUP%' OR UPPER(TRIM(Kendaraan)) LIKE '%L300%' THEN NoSystem END) as tipe_double
            FROM data_timbang
            WHERE Tanggal_Keluar_Clean < %s
              AND ItemName LIKE '%TEBU%'
        """
        res_prior = dec(query(sql_prior, (rekap_to,))) or []

    shifts = {1: {}, 2: {}, 3: {}}
    for i in range(1, 4):
        shifts[i] = {"ritase": 0, "netto_sebelum": 0, "netto_sesudah": 0, "tipe_engkel": 0, "tipe_fuso": 0, "tipe_double": 0}
    today_total = {"ritase": 0, "netto_sebelum": 0, "netto_sesudah": 0, "tipe_engkel": 0, "tipe_fuso": 0, "tipe_double": 0}

    for r in res_today:
        s = r.get('Shift', 1)
        if s in shifts:
            shifts[s]['ritase'] = r.get('ritase', 0)
            shifts[s]['netto_sebelum'] = float(r.get('netto_sebelum', 0) or 0)
            shifts[s]['netto_sesudah'] = float(r.get('netto_sesudah', 0) or 0)
            shifts[s]['tipe_engkel'] = int(r.get('tipe_engkel', 0) or 0)
            shifts[s]['tipe_fuso'] = int(r.get('tipe_fuso', 0) or 0)
            shifts[s]['tipe_double'] = int(r.get('tipe_double', 0) or 0)
            for k in today_total.keys():
                today_total[k] += shifts[s][k]

    prior_data = {"ritase": 0, "netto_sebelum": 0, "netto_sesudah": 0, "tipe_engkel": 0, "tipe_fuso": 0, "tipe_double": 0}
    if res_prior and len(res_prior) > 0:
        pr = res_prior[0]
        prior_data['ritase'] = pr.get('ritase', 0) or 0
        prior_data['netto_sebelum'] = float(pr.get('netto_sebelum', 0) or 0)
        prior_data['netto_sesudah'] = float(pr.get('netto_sesudah', 0) or 0)
        prior_data['tipe_engkel'] = int(pr.get('tipe_engkel', 0) or 0)
        prior_data['tipe_fuso'] = int(pr.get('tipe_fuso', 0) or 0)
        prior_data['tipe_double'] = int(pr.get('tipe_double', 0) or 0)

    # Hitung kumulatif per shift (prior + shift)
    todate_shift1 = {}
    todate_shift2 = {}
    todate_shift3 = {}
    for k in prior_data.keys():
        todate_shift1[k] = prior_data[k] + shifts[1][k]
        todate_shift2[k] = prior_data[k] + shifts[1][k] + shifts[2][k]
        todate_shift3[k] = prior_data[k] + shifts[1][k] + shifts[2][k] + shifts[3][k]

    return {
        "shift1": shifts[1], 
        "shift2": shifts[2], 
        "shift3": shifts[3], 
        "today": today_total, 
        "todate": todate_shift3,
        "todate_shift1": todate_shift1,
        "todate_shift2": todate_shift2,
        "todate_shift3": todate_shift3
    }
