# app_queries/daily_reports.py
# ─────────────────────────────────────────────────────────────
# CRITICAL: Jangan ubah logika SQL apapun di file ini.
# Khususnya: get_daily_support (LIKE '%support%'),
#            get_daily_cane (MINIBUS/PICKUP),
#            dan semua blok try-except.
# ─────────────────────────────────────────────────────────────

import re
from datetime import datetime, timedelta
from .db_core import dec, query


def get_daily_delivery(date_from, date_to):
    """
    DELIVERY PRODUCT: Gula, Molasse, Bagasse, dll.
    Logika: Anchor Regex Tracking (SPT Tambahan) + Look-Ahead 1 Hari + 30 Menit Filter.
    """
    def parse_time(tgl, jam):
        if not jam: return 0
        try:
            dp = str(tgl).split(' ')[0]
            if '/' in dp:
                p = dp.split('/')
                if len(p)==3: dp = f"{p[2]}-{p[1]}-{p[0]}"
            dt = datetime.strptime(f"{dp} {jam}", "%Y-%m-%d %H:%M:%S")
            return dt.timestamp() * 1000
        except: return 0

    try:
        dt_from_obj = datetime.strptime(date_from, '%Y-%m-%d')
        dt_to_obj = datetime.strptime(date_to, '%Y-%m-%d')
        date_to_plus_1 = (dt_to_obj + timedelta(days=1)).strftime('%Y-%m-%d')

        sql = """
            SELECT 
                NoSystem AS TicketNo,
                UPPER(COALESCE(ItemName, '')) AS material,
                COALESCE(CardName, 'UNKNOWN') AS customer,
                Nomor_SPPB AS nomor_sppb,
                COALESCE(Qty_Netto, 0) AS wb_rmi_ticket,
                COALESCE(Qty_SPMSPB, 0) AS spt,
                Nomor_SPMSPB AS spt_doc,
                Nopol,
                Supir,
                Tanggal_Keluar,
                Jam_Keluar,
                COALESCE(Remarks, '') AS Remarks
            FROM data_timbang
            WHERE Tanggal_Keluar_Clean BETWEEN %s AND %s
            AND (
                UPPER(ItemName) LIKE '%SUGAR%' OR UPPER(ItemName) LIKE '%GULA%' OR
                UPPER(ItemName) LIKE '%MOLASSE%' OR UPPER(ItemName) LIKE '%TETES%' OR
                UPPER(ItemName) LIKE '%BAGASSE%' OR UPPER(ItemName) LIKE '%AMPAS%' OR
                UPPER(ItemName) LIKE '%MILASSE%'
            )
            AND UPPER(COALESCE(Type, '')) = 'FINISHED GOODS LOCO'
            ORDER BY Jam_Keluar ASC
        """
        raw_data = dec(query(sql, (date_from, date_to_plus_1)))
        if not raw_data:
            return []

        physical_trucks = []
        
        for row in raw_data:
            nopol = str(row.get('Nopol') or '').strip().upper()
            supir = str(row.get('Supir') or '').strip().upper()
            tms = parse_time(row.get('Tanggal_Keluar'), row.get('Jam_Keluar'))
            vk = f"{nopol}_{supir}"
            
            mat_raw = str(row['material']).strip().upper()
            remarks = str(row.get('Remarks') or '').lower()
            is_molasse = 'MOLASSE' in mat_raw or 'TETES' in mat_raw
            is_tambahan = is_molasse and 'tambahan' in remarks
            
            anchor_numbers = re.findall(r'\d{5,}', remarks)
            
            matched_truck_id = None
            
            for t_id in range(len(physical_trucks)-1, -1, -1):
                t_data = physical_trucks[t_id]
                
                if is_tambahan and anchor_numbers:
                    found_anchor = False
                    for g in t_data['cust_groups'].values():
                        spt_docs_list = list(g['spt_docs'])
                        if any(num in spt_docs_list for num in anchor_numbers) or any(num == t_data['TicketNo'] for num in anchor_numbers):
                            found_anchor = True
                            break
                    if found_anchor:
                        matched_truck_id = t_id
                        break
                
                if matched_truck_id is None and t_data['vk'] == vk:
                    if is_tambahan:
                        matched_truck_id = t_id
                        break
                    elif abs(t_data['time'] - tms) <= 1800000:
                        matched_truck_id = t_id
                        break
            
            if matched_truck_id is None:
                tgl_str = str(row.get('Tanggal_Keluar')).split(' ')[0]
                try: tgl_obj = datetime.strptime(tgl_str, '%d/%m/%Y')
                except: tgl_obj = dt_from_obj

                physical_trucks.append({
                    'vk': vk, 'time': tms, 'original_date': tgl_obj,
                    'TicketNo': str(row['TicketNo']),
                    'wb_rmi_ticket': float(row['wb_rmi_ticket'] or 0),
                    'total_spt_ticket': 0.0,
                    'cust_groups': {}
                })
                matched_truck_id = len(physical_trucks) - 1
                
            t_ref = physical_trucks[matched_truck_id]
            
            if 'GULA' in mat_raw or 'SUGAR' in mat_raw: mat = 'SUGAR'
            elif is_molasse: mat = 'MOLASSE'
            elif 'BAGASSE' in mat_raw or 'AMPAS' in mat_raw: mat = 'BAGASSE'
            elif 'MILASSE' in mat_raw: mat = 'MILASSE'
            else: mat = mat_raw
                
            cust = str(row['customer']).strip().upper()
            spt_val = float(row['spt'] or 0)
            
            key_cust = f"{mat}_{cust}"
            if key_cust not in t_ref['cust_groups']:
                t_ref['cust_groups'][key_cust] = {'material': mat, 'customer': cust, 'spt': 0.0, 'spt_docs': set(), 'sppbs': set()}
            
            t_ref['cust_groups'][key_cust]['spt'] += spt_val
            t_ref['total_spt_ticket'] += spt_val
            if row['spt_doc']: t_ref['cust_groups'][key_cust]['spt_docs'].add(str(row['spt_doc']))
            if row['nomor_sppb']: t_ref['cust_groups'][key_cust]['sppbs'].add(str(row['nomor_sppb']))

        valid_trucks = [t for t in physical_trucks if dt_from_obj <= t['original_date'] <= dt_to_obj]

        rekap = {}
        for t_id, t_data in enumerate(valid_trucks):
            wb_rmi_ticket = t_data['wb_rmi_ticket']
            total_spt = t_data['total_spt_ticket']
            groups = list(t_data['cust_groups'].values())
            
            if total_spt > 0:
                for g in groups:
                    raw_prop = wb_rmi_ticket * (g['spt'] / total_spt)
                    g['calculated_wb'] = round(raw_prop / 10) * 10
                sum_calc = sum(g['calculated_wb'] for g in groups)
                diff = wb_rmi_ticket - sum_calc
                if diff != 0:
                    largest_g = max(groups, key=lambda x: x['spt'])
                    largest_g['calculated_wb'] += diff
            else:
                num_groups = len(groups) if groups else 1
                bagi_rata = round((wb_rmi_ticket / num_groups) / 10) * 10
                for g in groups: g['calculated_wb'] = bagi_rata
                if groups:
                    diff = wb_rmi_ticket - (bagi_rata * len(groups))
                    if diff != 0: groups[0]['calculated_wb'] += diff
            
            for g in groups:
                key_rekap = f"{g['material']}_{g['customer']}"
                if key_rekap not in rekap:
                    rekap[key_rekap] = {'material': g['material'], 'customer': g['customer'],
                                        'wb_rmi': 0.0, 'spt': 0.0, 'truck_set': set(),
                                        'spt_doc_set': set(), 'sppb_set': set()}
                rekap[key_rekap]['wb_rmi'] += g['calculated_wb']
                rekap[key_rekap]['spt'] += g['spt']
                rekap[key_rekap]['truck_set'].add(t_id) 
                rekap[key_rekap]['spt_doc_set'].update(g['spt_docs'])
                rekap[key_rekap]['sppb_set'].update(g['sppbs'])

        final_results = []
        for key, data in rekap.items():
            mat = data['material']
            is_sugar = ('SUGAR' in mat or 'GULA' in mat)
            bag_qty = round(data['spt'] / 50) if is_sugar and data['spt'] > 0 else None
            avg_netto = round(data['wb_rmi'] / bag_qty, 2) if is_sugar and bag_qty and bag_qty > 0 else (0.0 if is_sugar else None)
            final_results.append({
                'material': mat, 'customer': data['customer'],
                'nomor_spm_list': ", ".join(sorted(filter(None, data['spt_doc_set']))),
                'nomor_sppb_list': ", ".join(sorted(filter(None, data['sppb_set']))),
                'wb_rmi': round(data['wb_rmi'], 2), 'spt': round(data['spt'], 2),
                'truck': len(data['truck_set']), 'spt_doc': len(data['spt_doc_set']),
                'bag_qty': bag_qty, 'avg_netto': avg_netto
            })
        
        def sort_key(x):
            m = x['material']
            if 'SUGAR' in m: return (1, x['customer'])
            if 'MOLASSE' in m: return (2, x['customer'])
            if 'BAGASSE' in m: return (3, x['customer'])
            return (4, x['customer'])

        final_results.sort(key=sort_key)
        return final_results

    except Exception as e:
        print(f"[ERROR] get_daily_delivery: {e}")
        return []
 

def get_daily_support(date_from, date_to):
    """
    Support Operational: group per material + customer + PO.
    Filter fleksibel: cukup pakai '%support%' agar semua varian nama masuk.
    """
    sql = """
        SELECT
            TRIM(t.ItemName)                                    AS material,
            TRIM(t.CardName)                                    AS customer,
            REPLACE(
                COALESCE(NULLIF(TRIM(t.Nomor_PO), ''), '-'),
                ',', '.'
            )                                                   AS nomor_po,
            SUM(ABS(COALESCE(t.Qty_Netto, 0)))                  AS qty_netto,
            COUNT(DISTINCT t.NoSystem)                          AS truck,
            /* JURUS SAKTI: Ganti GROUP_CONCAT jadi MAX biar MySQL gak muntah (Error 500) */
            MAX(COALESCE(t.Remarks, ''))                        AS remarks
        FROM data_timbang t
        WHERE t.Tanggal_Keluar_Clean BETWEEN %s AND %s
          AND LOWER(COALESCE(t.Type, '')) LIKE CONCAT('%', 'support', '%')
          AND t.ItemName IS NOT NULL AND TRIM(t.ItemName) != ''
        GROUP BY
            TRIM(t.ItemName),
            TRIM(t.CardName),
            REPLACE(COALESCE(NULLIF(TRIM(t.Nomor_PO), ''), '-'), ',', '.')
        ORDER BY material, customer
    """
    try:
        rows = dec(query(sql, (date_from, date_to)))
        return rows or []
    except Exception as e:
        import traceback
        traceback.print_exc() # Pakai ini biar kalau ada error MySQL terminalnya langsung teriak merah!
        return []
 
 
def get_daily_limbah(date_from, date_to):
    """
    Limbah: Filter Cake + Fly Ash, per material + PO + customer + shift.
    Khusus Petani (Free Blotong) digabung menjadi 1 nama customer berdasarkan ItemName.
    """
    sql = """
        SELECT
            CASE
                WHEN t.ItemName LIKE '%FILTER CAKE%' OR t.ItemName LIKE '%BLOTONG%'
                THEN 'FILTER CAKE'
                WHEN t.ItemName LIKE '%FLY ASH%' OR t.ItemName LIKE '%FLYASH%'
                  OR t.ItemName LIKE '%BOTTOM ASH%'
                THEN 'FLY ASH / BOTTOM ASH'
                ELSE TRIM(t.ItemName)
            END                                                 AS material,
            t.Shift                                             AS shift,
            
            /* JURUS SAKTI: Paksa nama Customer jadi ItemName kalau dia Petani/Free */
            CASE 
                WHEN UPPER(t.ItemName) LIKE '%PETANI%' OR UPPER(t.ItemName) LIKE '%FREE%' 
                THEN UPPER(TRIM(t.ItemName))
                ELSE TRIM(t.CardName)
            END                                                 AS customer,
            
            REPLACE(
                COALESCE(NULLIF(TRIM(t.Nomor_PO), ''), 'KOSONG'),
                ',', '.'
            )                                                   AS nomor_po,
            SUM(ABS(COALESCE(t.Qty_Netto, 0)))                  AS qty_netto,
            COUNT(DISTINCT t.NoSystem)                          AS truck,
            MAX(COALESCE(t.Remarks, ''))                        AS remarks
        FROM data_timbang t
        WHERE t.Tanggal_Keluar_Clean BETWEEN %s AND %s
          AND (
              t.ItemName LIKE '%FILTER CAKE%'
           OR t.ItemName LIKE '%BLOTONG%'
           OR t.ItemName LIKE '%FLY ASH%'
           OR t.ItemName LIKE '%FLYASH%'
           OR t.ItemName LIKE '%BOTTOM ASH%'
          )
          AND t.ItemName IS NOT NULL AND TRIM(t.ItemName) != ''
        /* GROUP BY pakai alias biar otomatis tergabung rapi */
        GROUP BY material, shift, customer, nomor_po
        ORDER BY material, shift, customer
    """
    try:
        rows = dec(query(sql, (date_from, date_to)))
        return rows or []
    except Exception as e:
        import traceback
        traceback.print_exc()
        return []
 
 
def get_daily_cane(date_from, date_to, rekap_from=None, rekap_to=None):
    """
    Cane received: Today vs Todate.
    Truk Double diganti menjadi pencarian MINIBUS / PICKUP.
    """
    # 1. SQL UNTUK TODAY
    sql_today = """
        SELECT
            t.Shift                                             AS shift,
            COUNT(DISTINCT t.NoSystem)                         AS ritase,
            SUM(ABS(COALESCE(t.Qty_Netto, 0)))                 AS netto,
            SUM(ABS(COALESCE(COALESCE(t.Qty_sblm_Rafaksi, t.Qty_Netto), 0))) AS netto_sebelum,
            COUNT(DISTINCT CASE WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%ENGK%' THEN t.NoSystem END) AS tipe_engkel,
            COUNT(DISTINCT CASE WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%FUSO%' THEN t.NoSystem END) AS tipe_fuso,
            COUNT(DISTINCT CASE WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%DOUBLE%' THEN t.NoSystem END) AS tipe_double,
            COUNT(DISTINCT CASE WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%MINI%' OR UPPER(TRIM(t.Kendaraan)) LIKE '%PICKUP%' OR UPPER(TRIM(t.Kendaraan)) LIKE '%L300%' THEN t.NoSystem END) AS tipe_pickup
        FROM data_timbang t
        WHERE t.Tanggal_Keluar_Clean BETWEEN %s AND %s
          AND t.ItemName LIKE '%TEBU%'
        GROUP BY t.Shift
    """

    td_from = rekap_from if rekap_from else date_from
    td_to   = rekap_to   if rekap_to   else date_to

    # 2. SQL UNTUK TODATE
    sql_todate = """
        SELECT
            COUNT(DISTINCT t.NoSystem)                         AS ritase,
            SUM(ABS(COALESCE(t.Qty_Netto, 0)))                 AS netto,
            SUM(ABS(COALESCE(COALESCE(t.Qty_sblm_Rafaksi, t.Qty_Netto), 0))) AS netto_sebelum,
            COUNT(DISTINCT CASE WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%ENGK%' THEN t.NoSystem END) AS tipe_engkel,
            COUNT(DISTINCT CASE WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%FUSO%' THEN t.NoSystem END) AS tipe_fuso,
            COUNT(DISTINCT CASE WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%DOUBLE%' THEN t.NoSystem END) AS tipe_double,
            COUNT(DISTINCT CASE WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%MINI%' OR UPPER(TRIM(t.Kendaraan)) LIKE '%PICKUP%' OR UPPER(TRIM(t.Kendaraan)) LIKE '%L300%' THEN t.NoSystem END) AS tipe_pickup
        FROM data_timbang t
        WHERE t.Tanggal_Keluar_Clean BETWEEN %s AND %s
          AND t.ItemName LIKE '%TEBU%'
    """

    try:
        raw_today  = dec(query(sql_today,  (date_from, date_to))) or []
        raw_todate = dec(query(sql_todate, (td_from, td_to)))     or []

        def empty_shift():
            return dict(ritase=0, netto=0, netto_sebelum=0, tipe_engkel=0, tipe_fuso=0, tipe_double=0, tipe_pickup=0)

        shifts = {1: empty_shift(), 2: empty_shift(), 3: empty_shift()}
        today  = empty_shift()

        for r in raw_today:
            s = int(r.get('shift') or 0)
            row = {
                'ritase':       int(r.get('ritase',       0) or 0),
                'netto':        float(r.get('netto',      0) or 0),
                'netto_sebelum':float(r.get('netto_sebelum', 0) or 0),
                'tipe_engkel':  int(r.get('tipe_engkel',  0) or 0),
                'tipe_fuso':    int(r.get('tipe_fuso',    0) or 0),
                'tipe_double':  int(r.get('tipe_double',  0) or 0),
                'tipe_pickup':  int(r.get('tipe_pickup',  0) or 0),
            }
            if s in shifts: shifts[s] = row
            for k in today: today[k] += row[k]

        todate = empty_shift()
        if raw_todate and len(raw_todate) > 0:
            r = raw_todate[0]
            todate = {
                'ritase':       int(r.get('ritase',       0) or 0),
                'netto':        float(r.get('netto',      0) or 0),
                'netto_sebelum':float(r.get('netto_sebelum', 0) or 0),
                'tipe_engkel':  int(r.get('tipe_engkel',  0) or 0),
                'tipe_fuso':    int(r.get('tipe_fuso',    0) or 0),
                'tipe_double':  int(r.get('tipe_double',  0) or 0),
                'tipe_pickup':  int(r.get('tipe_pickup',  0) or 0),
            }

            # ============================================================
            # JURUS SAKTI: Gua matiin auto-hide-nya.
            # Jadi walaupun Tebu hari itu 0, tabelnya bakal tetep MUNCUL!
            # ============================================================
            # if today['ritase'] == 0 and todate['ritase'] == 0:
            #     return None

        return {'shift1': shifts[1], 'shift2': shifts[2], 'shift3': shifts[3], 'today': today, 'todate': todate}
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return None
 

def get_daily_transfer_gula(date_from, date_to):
    """
    Transfer Gula ke Warehouse/Bulog. Group per CardName.
    """
    sql_today = """
        SELECT
            TRIM(t.CardName)                                    AS warehouse,
            SUM(ABS(COALESCE(t.Qty_Netto,  0)))                AS wb_rmi,
            SUM(ABS(COALESCE(t.Qty_SPMSPB, 0)))                AS spt_netto,
            COUNT(DISTINCT t.NoSystem)                          AS truck,
            SUM(ABS(COALESCE(t.Qty_SPMSPB, 0)))                AS spt_total
        FROM data_timbang t
        WHERE t.Tanggal_Keluar_Clean BETWEEN %s AND %s
          AND (LOWER(t.Type) LIKE '%warehouse transfer%' OR LOWER(t.Type) LIKE '%werehouse tranfer%')
          AND t.CardName IS NOT NULL AND TRIM(t.CardName) != ''
        GROUP BY TRIM(t.CardName)
        ORDER BY TRIM(t.CardName)
    """
 
    sql_todate = """
        SELECT
            TRIM(t.CardName)                                    AS warehouse,
            COUNT(DISTINCT t.NoSystem)                          AS todate_truck,
            SUM(ABS(COALESCE(t.Qty_SPMSPB, 0)))                AS todate_netto
        FROM data_timbang t
        WHERE t.Tanggal_Keluar_Clean <= %s
          AND (LOWER(t.Type) LIKE '%warehouse transfer%' OR LOWER(t.Type) LIKE '%werehouse tranfer%')
          AND t.CardName IS NOT NULL AND TRIM(t.CardName) != ''
        GROUP BY TRIM(t.CardName)
    """
 
    today_rows  = dec(query(sql_today,  (date_from, date_to))) or []
    todate_rows = dec(query(sql_todate, (date_to,)))           or []
    todate_map  = {r['warehouse']: r for r in todate_rows}
 
    result = []
    for r in today_rows:
        wh = r['warehouse']
        td = todate_map.get(wh, {})
        result.append({
            'warehouse':    wh,
            'wb_rmi':       float(r.get('wb_rmi',      0) or 0),
            'spt_netto':    float(r.get('spt_netto',    0) or 0),
            'truck':        int(r.get('truck',          0) or 0),
            'spt_total':    float(r.get('spt_total',    0) or 0),
            'todate_truck': int(td.get('todate_truck',  0) or 0),
            'todate_netto': float(td.get('todate_netto',0) or 0),
        })
    return result
