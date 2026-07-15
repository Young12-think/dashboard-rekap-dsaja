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
                milling_start_date DATE NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
        """)
        conn.commit()
        cur.execute("SHOW COLUMNS FROM rmi_settings LIKE 'milling_start_date'")
        if not cur.fetchone():
            cur.execute("ALTER TABLE rmi_settings ADD COLUMN milling_start_date DATE NULL AFTER molasses_capacity")
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

def ensure_data_timbang_clean_column():
    conn = get_db()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("SHOW COLUMNS FROM data_timbang LIKE 'Tanggal_Keluar_Clean'")
        if not cur.fetchone():
            print("[INIT] Creating Tanggal_Keluar_Clean column (This might take a minute...)")
            cur.execute("SET SESSION sql_mode = ''")
            cur.execute("""
                ALTER TABLE data_timbang 
                ADD COLUMN Tanggal_Keluar_Clean DATE GENERATED ALWAYS AS (
                    STR_TO_DATE(NULLIF(TRIM(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1)), ''), '%d/%m/%Y')
                ) STORED,
                ADD INDEX idx_tanggal_keluar_clean (Tanggal_Keluar_Clean);
            """)
            conn.commit()
            print("[INIT] Tanggal_Keluar_Clean column created successfully.")
        cur.close()
        return True
    except Exception as e:
        print(f"[DB ERROR] ensure_data_timbang_clean_column: {e}")
        return False
    finally:
        try:
            conn.close()
        except Exception:
            pass

def get_settings():
    ensure_rmi_settings()
    res = query("SELECT gula_capacity, molasses_capacity, milling_start_date FROM rmi_settings WHERE id = 1")
    if res:
        return dec(res[0])
    return {"gula_capacity": 22000, "molasses_capacity": 30000, "milling_start_date": None}

def update_settings(gula_capacity, molasses_capacity, milling_start_date):
    ensure_rmi_settings()
    conn = get_db()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE rmi_settings 
            SET gula_capacity = %s, molasses_capacity = %s, milling_start_date = %s
            WHERE id = 1
        """, (gula_capacity, molasses_capacity, milling_start_date))
        conn.commit()
        cur.close()
        return True
    except Exception as e:
        print(f"[DB ERROR] update_settings: {e}")
        return False
    finally:
        conn.close()

def get_overview():
    ensure_data_timbang_clean_column()
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

def _num(row, key, default=0):
    if not row:
        return default
    try:
        return float(row.get(key, default) or default)
    except (TypeError, ValueError):
        return default

def _date_to_str(value):
    return str(value) if value is not None else None

def _valid_date_str(date_str):
    if not date_str:
        return None
    from datetime import datetime
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return date_str
    except (TypeError, ValueError):
        return None

def _resolve_overview_date(date_str=None):
    requested_date = _valid_date_str(date_str)
    if requested_date:
        return requested_date
    row = query("SELECT MAX(tanggal) as tanggal FROM gula_stok", one=True)
    resolved = (row or {}).get('tanggal')
    if resolved:
        return _date_to_str(resolved)
    from datetime import datetime
    return datetime.now().strftime('%Y-%m-%d')

def _overview_status_from_checks(checks):
    statuses = [c.get('status') for c in checks]
    if any(s in ('mismatch', 'error') for s in statuses):
        return 'mismatch'
    if any(s == 'warning' for s in statuses):
        return 'warning'
    return 'balanced'

def _get_cane_from_timbang(date_str):
    rows = dec(query("""
        SELECT
            Shift as shift,
            COUNT(DISTINCT COALESCE(NULLIF(NoSystem, 0), id)) as ritase,
            SUM(ABS(COALESCE(Qty_Netto, 0))) as netto_kg
        FROM data_timbang
        WHERE UPPER(TRIM(Type)) = 'TEBU'
          AND Tanggal_Keluar_Clean = %s
        GROUP BY Shift
        ORDER BY Shift ASC
    """, (date_str,))) or []

    total_kg = sum(float(row.get('netto_kg') or 0) for row in rows)
    total_ritase = sum(int(row.get('ritase') or 0) for row in rows)
    per_shift = [
        {
            'shift': int(row.get('shift') or 0),
            'ritase': int(row.get('ritase') or 0),
            'netto_kg': float(row.get('netto_kg') or 0),
            'netto_ton': float(row.get('netto_kg') or 0) / 1000
        }
        for row in rows
    ]

    return {
        'cane_tebu_today': total_kg / 1000,
        'cane_netto_kg': total_kg,
        'cane_ritase': total_ritase,
        'cane_source': total_kg / 1000,
        'per_shift': per_shift,
        'source': 'data_timbang.Type=TEBU',
        'status': 'ok'
    }

def _get_cane_to_date(start_date, end_date):
    if not start_date or str(start_date) > end_date:
        return {'cane_netto_to_date': 0, 'cane_ritase_to_date': 0}

    row = dec(query("""
        SELECT
            COUNT(DISTINCT COALESCE(NULLIF(NoSystem, 0), id)) as ritase,
            SUM(ABS(COALESCE(Qty_Netto, 0))) as netto_kg
        FROM data_timbang
        WHERE UPPER(TRIM(Type)) = 'TEBU'
          AND Tanggal_Keluar_Clean BETWEEN %s AND %s
    """, (str(start_date), end_date), one=True)) or {}
    return {
        'cane_netto_to_date': float(row.get('netto_kg') or 0) / 1000,
        'cane_ritase_to_date': int(row.get('ritase') or 0)
    }


def get_overview_v2(date_str=None):
    from datetime import datetime, timedelta

    ensure_data_timbang_clean_column()
    settings = get_settings()
    report_date = _resolve_overview_date(date_str)
    tolerance = 0.01

    gula_stok = dec(query("""
        SELECT stok_awal_gkm, stok_awal_gkb, stok_akhir_gkm, stok_akhir_gkb, stok_akhir_reject
        FROM gula_stok
        WHERE tanggal = %s
        LIMIT 1
    """, (report_date,), one=True)) or {}

    gula_in = dec(query("""
        SELECT
            SUM(COALESCE(gkm_crushing,0) + COALESCE(gkm_melting,0)) as in_gkm,
            SUM(COALESCE(gkb_crushing,0) + COALESCE(gkb_melting,0)) as in_gkb
        FROM gula_penerimaan
        WHERE tanggal = %s
    """, (report_date,), one=True)) or {}

    gula_delivery = dec(query("""
        SELECT
            COALESCE(plan_delivery,0) as plan_delivery,
            COALESCE(actual_delivery,0) as actual_delivery,
            COALESCE(delivery_gkm,0) as delivery_gkm,
            COALESCE(delivery_gkb,0) as delivery_gkb
        FROM gula_delivery
        WHERE tanggal = %s
        LIMIT 1
    """, (report_date,), one=True)) or {}

    reject_today = dec(query("""
        SELECT SUM(COALESCE(jumlah_kg,0)) as total_reject
        FROM gula_reject_log
        WHERE tanggal = %s
    """, (report_date,), one=True)) or {}

    opening_gkm = _num(gula_stok, 'stok_awal_gkm')
    opening_gkb = _num(gula_stok, 'stok_awal_gkb')
    gkm = _num(gula_stok, 'stok_akhir_gkm')
    gkb = _num(gula_stok, 'stok_akhir_gkb')
    reject_stock = _num(gula_stok, 'stok_akhir_reject')
    good_stock = gkm + gkb
    total_stock = good_stock + reject_stock

    in_gkm = _num(gula_in, 'in_gkm')
    in_gkb = _num(gula_in, 'in_gkb')
    delivery_gkm = _num(gula_delivery, 'delivery_gkm')
    delivery_gkb = _num(gula_delivery, 'delivery_gkb')
    plan_delivery = _num(gula_delivery, 'plan_delivery')
    actual_delivery = _num(gula_delivery, 'actual_delivery')
    delivery_gap = actual_delivery - plan_delivery

    reject_deduction = _num(reject_today, 'total_reject')
    remelt = 0
    opening_good_stock = opening_gkm + opening_gkb
    calculated_good_stock = opening_good_stock + in_gkm + in_gkb - delivery_gkm - delivery_gkb - reject_deduction - remelt
    balance_difference = calculated_good_stock - good_stock
    balance_status = 'balanced' if abs(balance_difference) <= tolerance else 'mismatch'

    gula_capacity = _num(settings, 'gula_capacity', 0)
    utilization_percent = (total_stock / gula_capacity * 100) if gula_capacity > 0 else 0

    lokasi_rows = dec(query("""
        SELECT m.nama_gudang, COALESCE(s.stok_akhir, 0) as stok_akhir
        FROM mst_gudang_luar m
        LEFT JOIN (
            SELECT id_gudang_luar, id_gudang, COALESCE(stok_akhir, stok_ton, 0) as stok_akhir
            FROM gudang_luar_stok
            WHERE tanggal = (
                SELECT MAX(tanggal)
                FROM gudang_luar_stok
                WHERE tanggal <= %s
            )
        ) s ON m.id_gudang = COALESCE(s.id_gudang, s.id_gudang_luar)
        ORDER BY COALESCE(s.stok_akhir, 0) DESC, m.nama_gudang ASC
    """, (report_date,))) or []
    out_site = sum(float(row.get('stok_akhir') or 0) for row in lokasi_rows)
    in_site = max(total_stock - out_site, 0)
    total_position = in_site + out_site
    position_difference = total_position - total_stock
    position_status = 'valid' if abs(position_difference) <= tolerance else 'mismatch'
    locations = [{'name': 'In Site RMI', 'type': 'in_site', 'stock': in_site}]
    locations.extend([
        {'name': row.get('nama_gudang') or 'Gudang Luar', 'type': 'out_site', 'stock': float(row.get('stok_akhir') or 0)}
        for row in lokasi_rows
    ])

    mol_stok = dec(query("""
        SELECT stok_akhir_tanka, stok_akhir_tankb
        FROM mol_stok_tangki
        WHERE tanggal = %s
        LIMIT 1
    """, (report_date,), one=True)) or {}
    mol_delivery = dec(query("""
        SELECT plan_delivery, actual_tank_a, actual_tank_b
        FROM mol_delivery
        WHERE tanggal = %s
        LIMIT 1
    """, (report_date,), one=True)) or {}
    mol_a = _num(mol_stok, 'stok_akhir_tanka')
    mol_b = _num(mol_stok, 'stok_akhir_tankb')
    mol_total = mol_a + mol_b
    mol_capacity = _num(settings, 'molasses_capacity', 0)
    mol_actual = _num(mol_delivery, 'actual_tank_a') + _num(mol_delivery, 'actual_tank_b')
    mol_gap = mol_actual - _num(mol_delivery, 'plan_delivery')

    cane = _get_cane_from_timbang(report_date)
    milling_start_date = settings.get('milling_start_date')
    cane.update(_get_cane_to_date(milling_start_date, report_date))
    cane['milling_start_date'] = _date_to_str(milling_start_date)
    if not milling_start_date or str(milling_start_date) > report_date:
        cane['status'] = 'warning'

    try:
        end_date = datetime.strptime(report_date, '%Y-%m-%d')
    except (TypeError, ValueError):
        end_date = datetime.now()
        report_date = end_date.strftime('%Y-%m-%d')
    start_date = (end_date - timedelta(days=6)).strftime('%Y-%m-%d')
    trend_stock = dec(query("""
        SELECT
            tanggal,
            COALESCE(stok_akhir_gkm,0) + COALESCE(stok_akhir_gkb,0) + COALESCE(stok_akhir_reject,0) as total,
            COALESCE(stok_akhir_gkm,0) + COALESCE(stok_akhir_gkb,0) as good,
            COALESCE(stok_akhir_reject,0) as reject
        FROM gula_stok
        WHERE tanggal BETWEEN %s AND %s
        ORDER BY tanggal ASC
    """, (start_date, report_date))) or []
    trend_delivery = dec(query("""
        SELECT
            tanggal,
            COALESCE(plan_delivery,0) as plan,
            COALESCE(actual_delivery,0) as actual
        FROM gula_delivery
        WHERE tanggal BETWEEN %s AND %s
        ORDER BY tanggal ASC
    """, (start_date, report_date))) or []

    for row in trend_stock:
        row['date'] = _date_to_str(row.get('tanggal'))
        row.pop('tanggal', None)
    for row in trend_delivery:
        row['date'] = _date_to_str(row.get('tanggal'))
        row.pop('tanggal', None)

    validation = [
        {
            'code': 'BALANCE_EQUATION',
            'label': 'Balance Equation',
            'status': 'ok' if balance_status == 'balanced' else 'mismatch',
            'message': 'Calculated stock matches actual good stock.' if balance_status == 'balanced' else 'Calculated stock does not match actual good stock.'
        },
        {
            'code': 'STOCK_POSITION',
            'label': 'Stock Position',
            'status': 'ok' if position_status == 'valid' else 'mismatch',
            'message': 'Stock position matches Balance 1 total.' if position_status == 'valid' else 'Stock position differs from Balance 1 total.'
        },
        {
            'code': 'DELIVERY',
            'label': 'Delivery Plan vs Actual',
            'status': 'warning' if delivery_gap < 0 else 'ok',
            'message': 'Actual delivery is below plan.' if delivery_gap < 0 else 'Delivery actual meets or exceeds plan.'
        },
        {
            'code': 'REJECT_REMELT',
            'label': 'Reject & Remelt',
            'status': 'ok',
            'message': 'Reject and remelt are recorded.'
        },
        {
            'code': 'CAPACITY',
            'label': 'Capacity',
            'status': 'warning' if utilization_percent > 85 else 'ok',
            'message': 'Warehouse utilization is above 85%.' if utilization_percent > 85 else 'Warehouse utilization is normal.'
        },
        {
            'code': 'MISSING_INPUT',
            'label': 'Missing Input',
            'status': 'warning' if not gula_stok else 'ok',
            'message': 'Gula stock input is missing for selected date.' if not gula_stok else 'Required inputs are available.'
        }
    ]

    report_balance_status = _overview_status_from_checks(validation)

    return {
        'date': report_date,
        'report': {
            'status': 'draft',
            'balance_status': report_balance_status,
            'last_update': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'source': 'MySQL DB'
        },
        'sugar': {
            'kpi': {
                'total_stock': total_stock,
                'good_stock': good_stock,
                'gkm': gkm,
                'gkb': gkb,
                'reject': reject_stock,
                'delivery_gap': delivery_gap,
                'utilization_percent': utilization_percent
            },
            'balance': {
                'opening_good_stock': opening_good_stock,
                'in_gkm': in_gkm,
                'in_gkb': in_gkb,
                'delivery_gkm': delivery_gkm,
                'delivery_gkb': delivery_gkb,
                'reject_deduction': reject_deduction,
                'remelt': remelt,
                'calculated_good_stock': calculated_good_stock,
                'actual_good_stock': good_stock,
                'difference': balance_difference,
                'tolerance': tolerance,
                'status': balance_status
            },
            'composition': [
                {'label': 'GKM', 'value': gkm},
                {'label': 'GKB', 'value': gkb},
                {'label': 'Reject', 'value': reject_stock}
            ],
            'stock_position': {
                'in_site': in_site,
                'out_site': out_site,
                'total_position': total_position,
                'balance1_total': total_stock,
                'difference': position_difference,
                'status': position_status,
                'locations': locations
            },
            'validation': validation,
            'trend': {
                'stock': trend_stock,
                'delivery': trend_delivery
            }
        },
        'molasses': {
            'tank_a': mol_a,
            'tank_b': mol_b,
            'total_stock': mol_total,
            'utilization_percent': (mol_total / mol_capacity * 100) if mol_capacity > 0 else 0,
            'delivery_gap': mol_gap,
            'status': 'ok'
        },
        'cane': {
            **cane,
            'raw_sugar_source': 0
        }
    }

def get_stok_harian():
    sql = """
        SELECT tanggal, 
               COALESCE(stok_akhir_gkm, 0) as gkm,
               COALESCE(stok_akhir_gkb, 0) as gkb,
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
            SELECT id_gudang_luar, id_gudang, COALESCE(stok_akhir, stok_ton, 0) as stok_akhir
            FROM gudang_luar_stok
            WHERE tanggal = (SELECT MAX(tanggal) FROM gudang_luar_stok)
        ) s ON m.id_gudang = COALESCE(s.id_gudang, s.id_gudang_luar)
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
        SELECT
            shift,
            SUM(COALESCE(gkm_crushing, 0) + COALESCE(gkm_melting, 0)) AS gkm,
            SUM(COALESCE(gkb_crushing, 0) + COALESCE(gkb_melting, 0)) AS gkb
        FROM gula_penerimaan
        WHERE tanggal = %s
        GROUP BY shift
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
        SELECT shift, SUM(COALESCE(jumlah_kg, 0)) AS total_reject
        FROM gula_reject_log
        WHERE tanggal = %s
        GROUP BY shift
    """, (date_str,))) or []
    for r in g_reject:
        s = str(r.get('shift'))
        if s in ['1','2','3']:
            gula_detail[s]['reject'] = float(r.get('total_reject', 0) or 0)

    # Stock position from latest warehouse record up to selected date.
    lokasi_rows = dec(query("""
        SELECT m.nama_gudang, COALESCE(s.stok_akhir, 0) AS stok_akhir
        FROM mst_gudang_luar m
        LEFT JOIN (
            SELECT id_gudang_luar, id_gudang, COALESCE(stok_akhir, stok_ton, 0) AS stok_akhir
            FROM gudang_luar_stok
            WHERE tanggal = (
                SELECT MAX(tanggal) FROM gudang_luar_stok WHERE tanggal <= %s
            )
        ) s ON m.id_gudang = COALESCE(s.id_gudang, s.id_gudang_luar)
        ORDER BY COALESCE(s.stok_akhir, 0) DESC, m.nama_gudang ASC
    """, (date_str,))) or []

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
    for p in m_penerimaan:
        s = str(p.get('shift'))
        if s in ['1','2','3']:
            rs = float(p.get('raw_sugar', 0) or 0)
            ct = float(p.get('cane_tebu', 0) or 0)
            mol_prod_shift[s] = rs + ct
            mol_prod_shift['total'] += mol_prod_shift[s]

    cane_timbang = _get_cane_from_timbang(date_str)
    cane_shift = [
        {'shift': row['shift'], 'caneKg': row['netto_kg'], 'truck': row['ritase']}
        for row in cane_timbang['per_shift']
        if row['shift'] in [1, 2, 3]
    ]
    cane_hari_ini = cane_timbang['cane_netto_kg']
    truck_hari_ini = cane_timbang['cane_ritase']

    cane_prev_res = dec(query("""
        SELECT
            COUNT(DISTINCT COALESCE(NULLIF(NoSystem, 0), id)) as total_truck,
            SUM(ABS(COALESCE(Qty_Netto, 0))) as total_cane
        FROM data_timbang 
        WHERE UPPER(TRIM(Type)) = 'TEBU'
          AND Tanggal_Keluar_Clean < %s
    """, (date_str,), one=True)) or {}
    truck_kumulatif_prev = int(cane_prev_res.get('total_truck') or 0)
    cane_kumulatif_prev = float(cane_prev_res.get('total_cane') or 0)

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
            "stockPosition": {
                "outsite": sum(float(row.get('stok_akhir') or 0) for row in lokasi_rows),
                "locations": [
                    {
                        "name": row.get('nama_gudang') or 'Gudang Luar',
                        "stock": float(row.get('stok_akhir') or 0)
                    }
                    for row in lokasi_rows
                ]
            },
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
            (SELECT SUM(ABS(COALESCE(t.Qty_Netto,0))) FROM data_timbang t WHERE UPPER(TRIM(t.Type)) = 'TEBU' AND t.Tanggal_Keluar_Clean = gs.tanggal) as caneHariIni
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
            (SELECT SUM(ABS(COALESCE(t.Qty_Netto,0))) / NULLIF(COUNT(DISTINCT t.Tanggal_Keluar_Clean), 0) FROM data_timbang t WHERE t.Shift = gp.shift AND UPPER(TRIM(t.Type)) = 'TEBU' AND t.Tanggal_Keluar_Clean BETWEEN %s AND %s) as avgCane
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
            (SELECT SUM(ABS(COALESCE(t.Qty_Netto,0))) FROM data_timbang t WHERE UPPER(TRIM(t.Type)) = 'TEBU' AND t.Tanggal_Keluar_Clean = gs.tanggal) as caneHariIni
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
            (SELECT SUM(ABS(COALESCE(t.Qty_Netto,0))) / NULLIF(COUNT(DISTINCT t.Tanggal_Keluar_Clean), 0) FROM data_timbang t WHERE t.Shift = gp.shift AND UPPER(TRIM(t.Type)) = 'TEBU' AND t.Tanggal_Keluar_Clean BETWEEN %s AND %s) as avgCane
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
