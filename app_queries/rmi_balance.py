from .db_core import dec, query, get_db

def ensure_rmi_settings():
    conn = get_db()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rmi_settings (
                id INT PRIMARY KEY DEFAULT 1,
                gula_capacity DECIMAL(14,2) DEFAULT 22000,
                molasses_capacity DECIMAL(14,2) DEFAULT 30000,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
        """)
        conn.commit()
        # Ensure row 1 exists
        cur.execute("INSERT IGNORE INTO rmi_settings (id, gula_capacity, molasses_capacity) VALUES (1, 22000, 30000)")
        conn.commit()
        cur.close()
        return True
    except Exception as e:
        print(f"[DB ERROR] ensure_rmi_settings: {e}")
        return False
    finally:
        conn.close()

def get_settings():
    ensure_rmi_settings()
    res = query("SELECT gula_capacity, molasses_capacity FROM rmi_settings WHERE id = 1")
    if res:
        return dec(res[0])
    return {"gula_capacity": 22000, "molasses_capacity": 30000}

def update_settings(gula_capacity, molasses_capacity):
    ensure_rmi_settings()
    conn = get_db()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE rmi_settings 
            SET gula_capacity = %s, molasses_capacity = %s 
            WHERE id = 1
        """, (gula_capacity, molasses_capacity))
        conn.commit()
        cur.close()
        return True
    except Exception as e:
        print(f"[DB ERROR] update_settings: {e}")
        return False
    finally:
        conn.close()

def get_overview():
    settings = get_settings()
    
    # Gula Stock (GKM + GKB)
    gula_stok = query("""
        SELECT stok_akhir_gkm, stok_akhir_gkb 
        FROM gula_stok 
        ORDER BY tanggal DESC LIMIT 1
    """)
    total_gula = 0
    if gula_stok:
        total_gula = float(gula_stok[0].get('stok_akhir_gkm', 0) or 0) + float(gula_stok[0].get('stok_akhir_gkb', 0) or 0)
    
    gula_util = 0
    if settings['gula_capacity'] > 0:
        gula_util = (total_gula / float(settings['gula_capacity'])) * 100

    # Molasses Stock
    mol_stok = query("""
        SELECT stok_akhir_tanka, stok_akhir_tankb 
        FROM mol_stok_tangki 
        ORDER BY tanggal DESC LIMIT 1
    """)
    total_molasses = 0
    if mol_stok:
        total_molasses = float(mol_stok[0].get('stok_akhir_tanka', 0) or 0) + float(mol_stok[0].get('stok_akhir_tankb', 0) or 0)
    
    mol_util = 0
    if settings['molasses_capacity'] > 0:
        mol_util = (total_molasses / float(settings['molasses_capacity'])) * 100

    # Delivery Deficit
    delivery = query("""
        SELECT plan_delivery, actual_delivery 
        FROM gula_delivery 
        ORDER BY tanggal DESC LIMIT 1
    """)
    plan = 0
    actual = 0
    defisit_ton = 0
    defisit_pct = 0
    if delivery:
        plan = float(delivery[0].get('plan_delivery', 0) or 0)
        actual = float(delivery[0].get('actual_delivery', 0) or 0)
        defisit_ton = plan - actual
        if plan > 0:
            defisit_pct = (defisit_ton / plan) * 100

    return {
        "gula": {
            "total_ton": total_gula,
            "capacity": float(settings['gula_capacity']),
            "utilization_pct": gula_util
        },
        "molasses": {
            "total_ton": total_molasses,
            "capacity": float(settings['molasses_capacity']),
            "utilization_pct": mol_util
        },
        "delivery": {
            "plan_ton": plan,
            "actual_ton": actual,
            "defisit_ton": defisit_ton,
            "defisit_pct": defisit_pct
        }
    }

def get_stok_harian():
    sql = """
        SELECT tanggal, 
               COALESCE(stok_akhir_gkm, 0) + COALESCE(stok_akhir_gkb, 0) as total_stok
        FROM gula_stok 
        WHERE tanggal >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
        ORDER BY tanggal ASC
    """
    return dec(query(sql)) or []

def get_delivery_harian():
    sql = """
        SELECT tanggal, 
               COALESCE(plan_delivery, 0) as plan, 
               COALESCE(actual_delivery, 0) as actual
        FROM gula_delivery 
        WHERE tanggal >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
        ORDER BY tanggal ASC
    """
    return dec(query(sql)) or []

def get_molasses_harian():
    sql = """
        SELECT tanggal, 
               COALESCE(stok_akhir_tanka, 0) as tank_a, 
               COALESCE(stok_akhir_tankb, 0) as tank_b
        FROM mol_stok_tangki 
        WHERE tanggal >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
        ORDER BY tanggal ASC
    """
    return dec(query(sql)) or []

def get_lokasi_stok():
    sql = """
        SELECT m.nama_gudang, COALESCE(s.stok_akhir, 0) as stok_akhir
        FROM mst_gudang_luar m
        LEFT JOIN (
            SELECT id_gudang_luar, stok_akhir
            FROM gudang_luar_stok
            WHERE tanggal = (SELECT MAX(tanggal) FROM gudang_luar_stok)
        ) s ON m.id = s.id_gudang_luar
        ORDER BY m.nama_gudang ASC
    """
    return dec(query(sql)) or []

def get_laporan_harian(date_str):
    # Fetch data for Gula Stok
    gula_stok = query("""
        SELECT stok_awal_gkm, stok_awal_gkb, stok_akhir_gkm, stok_akhir_gkb, stok_akhir_reject 
        FROM gula_stok WHERE tanggal = %s LIMIT 1
    """, (date_str,))
    g_stok = dec(gula_stok[0]) if gula_stok else {}

    # Fetch data for Gula Penerimaan (Produksi per shift)
    g_penerimaan = dec(query("""
        SELECT shift, COALESCE(gkm_crushing,0)+COALESCE(gkm_melting,0) as gkm, 
               COALESCE(gkb_crushing,0)+COALESCE(gkb_melting,0) as gkb
        FROM gula_penerimaan WHERE tanggal = %s
    """, (date_str,))) or []

    # Calculate Gula Produksi total
    gula_prod_shift = {'1': 0, '2': 0, '3': 0, 'total': 0}
    gula_detail = {'1': {'gkb': 0, 'gkm': 0, 'reject': 0}, '2': {'gkb': 0, 'gkm': 0, 'reject': 0}, '3': {'gkb': 0, 'gkm': 0, 'reject': 0}}
    for p in g_penerimaan:
        s = str(p.get('shift'))
        if s in ['1','2','3']:
            gula_prod_shift[s] = float(p.get('gkm',0) or 0) + float(p.get('gkb',0) or 0)
            gula_prod_shift['total'] += gula_prod_shift[s]
            gula_detail[s]['gkm'] = float(p.get('gkm',0) or 0)
            gula_detail[s]['gkb'] = float(p.get('gkb',0) or 0)

    # Reject log
    g_reject = dec(query("""
        SELECT shift, SUM(jumlah_kg) as total_reject FROM gula_reject_log 
        WHERE tanggal = %s GROUP BY shift
    """, (date_str,))) or []
    for r in g_reject:
        s = str(r.get('shift'))
        if s in ['1','2','3']:
            gula_detail[s]['reject'] = float(r.get('total_reject', 0) or 0)

    # Gula Delivery
    gula_del = query("""
        SELECT plan_delivery, actual_delivery FROM gula_delivery WHERE tanggal = %s LIMIT 1
    """, (date_str,))
    g_del = dec(gula_del[0]) if gula_del else {}

    # Gula Delivery plan besok
    gula_del_besok = query("""
        SELECT plan_delivery, delivery_gkm, delivery_gkb FROM gula_delivery 
        WHERE tanggal = DATE_ADD(%s, INTERVAL 1 DAY) LIMIT 1
    """, (date_str,))
    g_del_bsk = dec(gula_del_besok[0]) if gula_del_besok else {}

    # Molasses Stok
    mol_stok = query("""
        SELECT stok_awal_tanka, stok_awal_tankb, stok_akhir_tanka, stok_akhir_tankb 
        FROM mol_stok_tangki WHERE tanggal = %s LIMIT 1
    """, (date_str,))
    m_stok = dec(mol_stok[0]) if mol_stok else {}

    # Molasses Penerimaan (Produksi per shift)
    m_penerimaan = dec(query("""
        SELECT shift, raw_sugar, cane_tebu FROM mol_penerimaan WHERE tanggal = %s
    """, (date_str,))) or []
    
    mol_prod_shift = {'1': 0, '2': 0, '3': 0, 'total': 0}
    cane_shift = []
    cane_hari_ini = 0
    for p in m_penerimaan:
        s = str(p.get('shift'))
        if s in ['1','2','3']:
            rs = float(p.get('raw_sugar', 0) or 0)
            ct = float(p.get('cane_tebu', 0) or 0)
            mol_prod_shift[s] = rs + ct
            mol_prod_shift['total'] += mol_prod_shift[s]
            # Truck will be updated below
            cane_shift.append({'shift': int(s), 'caneKg': ct, 'truck': 0})
            cane_hari_ini += ct

    # Hitung jumlah truck dari data_timbang (type='TEBU')
    truck_hari_ini_res = query("""
        SELECT Shift, COUNT(id) as total_truck 
        FROM data_timbang 
        WHERE Type = 'TEBU' AND Tanggal_Keluar_Clean = %s
        GROUP BY Shift
    """, (date_str,))
    
    truck_hari_ini = 0
    if truck_hari_ini_res:
        for r in truck_hari_ini_res:
            s = r.get('Shift')
            c = int(r.get('total_truck') or 0)
            if s in [1,2,3]:
                # find in cane_shift
                for cs in cane_shift:
                    if cs['shift'] == s:
                        cs['truck'] = c
                truck_hari_ini += c

    # Hitung jumlah truck sebelumnya dari data_timbang (kumulatif sebelum date_str)
    # Ini mungkin butuh filter 'season' / tahun, tapi kita ambil kumulatif sederhana dulu
    truck_prev_res = query("""
        SELECT COUNT(id) as total_truck 
        FROM data_timbang 
        WHERE Type = 'TEBU' AND Tanggal_Keluar_Clean < %s
    """, (date_str,))
    truck_kumulatif_prev = int(truck_prev_res[0].get('total_truck') or 0) if truck_prev_res else 0
    
    # Hitung kumulatif cane_tebu sebelumnya (dari mol_penerimaan)
    cane_prev_res = query("""
        SELECT SUM(cane_tebu) as total_cane
        FROM mol_penerimaan
        WHERE tanggal < %s
    """, (date_str,))
    cane_kumulatif_prev = float(cane_prev_res[0].get('total_cane') or 0) if cane_prev_res else 0

    # Molasses Delivery
    mol_del = query("""
        SELECT plan_delivery, actual_tank_a, actual_tank_b FROM mol_delivery WHERE tanggal = %s LIMIT 1
    """, (date_str,))
    m_del = dec(mol_del[0]) if mol_del else {}
    m_actual_del = float(m_del.get('actual_tank_a',0) or 0) + float(m_del.get('actual_tank_b',0) or 0)
    m_plan_del = float(m_del.get('plan_delivery',0) or 0)

    return {
        "tanggal": date_str,
        "gula": {
            "openBalance": float(g_stok.get('stok_awal_gkm',0) or 0) + float(g_stok.get('stok_awal_gkb',0) or 0),
            "produksi": gula_prod_shift,
            "produksiDetail": gula_detail,
            "delivery": {
                "plan": float(g_del.get('plan_delivery', 0) or 0),
                "actual": float(g_del.get('actual_delivery', 0) or 0),
                "diff": float(g_del.get('plan_delivery', 0) or 0) - float(g_del.get('actual_delivery', 0) or 0)
            },
            "endBalance": float(g_stok.get('stok_akhir_gkm',0) or 0) + float(g_stok.get('stok_akhir_gkb',0) or 0),
            "stokGkb": float(g_stok.get('stok_akhir_gkb',0) or 0),
            "stokGkm": float(g_stok.get('stok_akhir_gkm',0) or 0),
            "reject": float(g_stok.get('stok_akhir_reject',0) or 0),
            "deliveryPlanBesok": {
                "gkb": float(g_del_bsk.get('delivery_gkb',0) or 0),
                "gkm": float(g_del_bsk.get('delivery_gkm',0) or 0),
                "total": float(g_del_bsk.get('plan_delivery',0) or 0)
            }
        },
        "molasses": {
            "openBalance": float(m_stok.get('stok_awal_tanka',0) or 0) + float(m_stok.get('stok_awal_tankb',0) or 0),
            "produksi": mol_prod_shift,
            "delivery": {
                "schedule": m_plan_del,
                "actual": m_actual_del,
                "diff": m_plan_del - m_actual_del
            },
            "endBalance": float(m_stok.get('stok_akhir_tanka',0) or 0) + float(m_stok.get('stok_akhir_tankb',0) or 0),
            "tankA": float(m_stok.get('stok_akhir_tanka',0) or 0),
            "tankB": float(m_stok.get('stok_akhir_tankb',0) or 0)
        },
        "cane": {
            "kumulatif": cane_kumulatif_prev,
            "kumulatifTruck": truck_kumulatif_prev,
            "hariIni": cane_hari_ini,
            "hariIniTruck": truck_hari_ini,
            "perShift": cane_shift
        }
    }

def get_grafik_laporan(date_from, date_to):
    # Tren Data
    tren_res = query("""
        SELECT 
            gs.tanggal,
            COALESCE(gs.stok_akhir_gkm,0) + COALESCE(gs.stok_akhir_gkb,0) as gulaEndBalance,
            COALESCE(ms.stok_akhir_tanka,0) + COALESCE(ms.stok_akhir_tankb,0) as molassesEndBalance,
            (SELECT SUM(COALESCE(gkm_crushing,0)+COALESCE(gkm_melting,0)+COALESCE(gkb_crushing,0)+COALESCE(gkb_melting,0)) FROM gula_penerimaan p WHERE p.tanggal = gs.tanggal) as produksiGula,
            (SELECT SUM(COALESCE(raw_sugar,0)+COALESCE(cane_tebu,0)) FROM mol_penerimaan m WHERE m.tanggal = gs.tanggal) as produksiMolasses,
            (SELECT SUM(COALESCE(cane_tebu,0)) FROM mol_penerimaan m WHERE m.tanggal = gs.tanggal) as caneHariIni
        FROM gula_stok gs
        LEFT JOIN mol_stok_tangki ms ON gs.tanggal = ms.tanggal
        WHERE gs.tanggal BETWEEN %s AND %s
        ORDER BY gs.tanggal ASC
    """, (date_from, date_to))
    tren = dec(tren_res) or []

    # Delivery Data
    del_res = query("""
        SELECT 
            gd.tanggal,
            COALESCE(md.plan_delivery,0) as molSchedule,
            COALESCE(md.actual_tank_a,0) + COALESCE(md.actual_tank_b,0) as molActual,
            COALESCE(gd.plan_delivery,0) as gulaPlan,
            COALESCE(gd.actual_delivery,0) as gulaActual
        FROM gula_delivery gd
        LEFT JOIN mol_delivery md ON gd.tanggal = md.tanggal
        WHERE gd.tanggal BETWEEN %s AND %s
        ORDER BY gd.tanggal ASC
    """, (date_from, date_to))
    delivery = dec(del_res) or []

    # Shift Summary Average over the period
    shift_sum = dec(query("""
        SELECT 
            gp.shift,
            AVG(COALESCE(gp.gkm_crushing,0)+COALESCE(gp.gkm_melting,0)+COALESCE(gp.gkb_crushing,0)+COALESCE(gp.gkb_melting,0)) as avgGula,
            (SELECT AVG(COALESCE(raw_sugar,0)+COALESCE(cane_tebu,0)) FROM mol_penerimaan m WHERE m.shift = gp.shift AND m.tanggal BETWEEN %s AND %s) as avgMolasses,
            (SELECT AVG(COALESCE(cane_tebu,0)) FROM mol_penerimaan m WHERE m.shift = gp.shift AND m.tanggal BETWEEN %s AND %s) as avgCane
        FROM gula_penerimaan gp
        WHERE gp.tanggal BETWEEN %s AND %s
        GROUP BY gp.shift
    """, (date_from, date_to, date_from, date_to, date_from, date_to))) or []

    return {
        "tren": tren,
        "delivery": delivery,
        "shiftSummary": shift_sum
    }

def get_grafik_analitik(end_date_str, days=7):
    from datetime import datetime, timedelta
    end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
    start_date = end_date - timedelta(days=days-1)
    date_from = start_date.strftime('%Y-%m-%d')
    date_to = end_date_str

    # Tren Data
    tren_res = query("""
        SELECT 
            gs.tanggal,
            COALESCE(gs.stok_akhir_gkm,0) as gkmEndBalance,
            COALESCE(gs.stok_akhir_gkb,0) as gkbEndBalance,
            (COALESCE(gs.stok_akhir_gkm,0) + COALESCE(gs.stok_akhir_gkb,0)) as gulaEndBalance,
            COALESCE(ms.stok_akhir_tanka,0) + COALESCE(ms.stok_akhir_tankb,0) as molassesEndBalance,
            
            (SELECT SUM(COALESCE(gkm_crushing,0)+COALESCE(gkm_melting,0)) FROM gula_penerimaan p WHERE p.tanggal = gs.tanggal) as produksiGkm,
            (SELECT SUM(COALESCE(gkb_crushing,0)+COALESCE(gkb_melting,0)) FROM gula_penerimaan p WHERE p.tanggal = gs.tanggal) as produksiGkb,
            
            (SELECT SUM(COALESCE(raw_sugar,0)+COALESCE(cane_tebu,0)) FROM mol_penerimaan m WHERE m.tanggal = gs.tanggal) as produksiMolasses,
            (SELECT SUM(COALESCE(cane_tebu,0)) FROM mol_penerimaan m WHERE m.tanggal = gs.tanggal) as caneHariIni
        FROM gula_stok gs
        LEFT JOIN mol_stok_tangki ms ON gs.tanggal = ms.tanggal
        WHERE gs.tanggal BETWEEN %s AND %s
        ORDER BY gs.tanggal ASC
    """, (date_from, date_to))
    tren = dec(tren_res) or []

    # Delivery Data
    del_res = query("""
        SELECT 
            gd.tanggal,
            COALESCE(md.plan_delivery,0) as molSchedule,
            COALESCE(md.actual_tank_a,0) + COALESCE(md.actual_tank_b,0) as molActual,
            (COALESCE(md.plan_delivery,0) - (COALESCE(md.actual_tank_a,0) + COALESCE(md.actual_tank_b,0))) as molDefisit
        FROM gula_delivery gd
        LEFT JOIN mol_delivery md ON gd.tanggal = md.tanggal
        WHERE gd.tanggal BETWEEN %s AND %s
        ORDER BY gd.tanggal ASC
    """, (date_from, date_to))
    delivery = dec(del_res) or []

    # Shift Summary Average over the period
    shift_sum = dec(query("""
        SELECT 
            gp.shift,
            AVG(COALESCE(gp.gkm_crushing,0)+COALESCE(gp.gkm_melting,0)) as avgGkm,
            (SELECT AVG(COALESCE(raw_sugar,0)+COALESCE(cane_tebu,0)) FROM mol_penerimaan m WHERE m.shift = gp.shift AND m.tanggal BETWEEN %s AND %s) as avgMolasses,
            (SELECT AVG(COALESCE(cane_tebu,0)) FROM mol_penerimaan m WHERE m.shift = gp.shift AND m.tanggal BETWEEN %s AND %s) as avgCane
        FROM gula_penerimaan gp
        WHERE gp.tanggal BETWEEN %s AND %s
        GROUP BY gp.shift
    """, (date_from, date_to, date_from, date_to, date_from, date_to))) or []

    # Format shift summary output to list of dicts with statuses
    formatted_shifts = []
    for s in shift_sum:
        sh = s.get('shift')
        gkm = float(s.get('avgGkm') or 0)
        mol = float(s.get('avgMolasses') or 0)
        cane = float(s.get('avgCane') or 0)
        
        status = 'Normal'
        if gkm > 130 and cane > 3600000:
            status = 'Terbaik'
            
        formatted_shifts.append({
            'shift': sh,
            'avgGkm': gkm,
            'avgMolasses': mol,
            'avgCane': cane,
            'status': status
        })

    # Alert Calculation for End Date
    mol_defisit_alert = None
    gula_on_track = None
    
    # Get last delivery for defisit
    if delivery:
        last_del = delivery[-1]
        if last_del.get('molDefisit', 0) > 0:
            mol_defisit_alert = {
                "schedule": float(last_del.get('molSchedule', 0)),
                "actual": float(last_del.get('molActual', 0)),
                "defisit": float(last_del.get('molDefisit', 0))
            }
            
    # Get last gula end balance
    if tren:
        last_tren = tren[-1]
        end_bal = float(last_tren.get('gulaEndBalance', 0))
        if end_bal > 1000: # Threshold aman dummy
            gula_on_track = {
                "endBalance": end_bal
            }

    # Format Tren Data (ensure all dates in range exist, but for now just pass SQL result)
    # Convert dates to string for JSON serialization
    for t in tren:
        if t.get('tanggal'): t['tanggal'] = str(t['tanggal'])
    for d in delivery:
        if d.get('tanggal'): d['tanggal'] = str(d['tanggal'])

    return {
        "date_from": date_from,
        "date_to": date_to,
        "days": days,
        "tren": tren,
        "delivery": delivery,
        "shiftSummary": formatted_shifts,
        "alerts": {
            "molassesDefisit": mol_defisit_alert,
            "gulaOnTrack": gula_on_track
        }
    }
