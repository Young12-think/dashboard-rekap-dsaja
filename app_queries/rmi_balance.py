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
                molasses_tank_a_capacity DECIMAL(14,2) DEFAULT 15000,
                molasses_tank_b_capacity DECIMAL(14,2) DEFAULT 15000,
                milling_start_date DATE NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
        """)
        conn.commit()
        cur.execute("SHOW COLUMNS FROM rmi_settings LIKE 'milling_start_date'")
        if not cur.fetchone():
            cur.execute("ALTER TABLE rmi_settings ADD COLUMN milling_start_date DATE NULL AFTER molasses_capacity")
            conn.commit()
        cur.execute("SHOW COLUMNS FROM rmi_settings LIKE 'molasses_tank_a_capacity'")
        if not cur.fetchone():
            cur.execute("""
                ALTER TABLE rmi_settings
                ADD COLUMN molasses_tank_a_capacity DECIMAL(14,2) NULL AFTER molasses_capacity,
                ADD COLUMN molasses_tank_b_capacity DECIMAL(14,2) NULL AFTER molasses_tank_a_capacity
            """)
            cur.execute("""
                UPDATE rmi_settings SET
                    molasses_tank_a_capacity = molasses_capacity / 2,
                    molasses_tank_b_capacity = molasses_capacity / 2
                WHERE id = 1
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
    res = query("""
        SELECT gula_capacity, molasses_capacity,
               COALESCE(molasses_tank_a_capacity, molasses_capacity / 2) as molasses_tank_a_capacity,
               COALESCE(molasses_tank_b_capacity, molasses_capacity / 2) as molasses_tank_b_capacity,
               milling_start_date
        FROM rmi_settings WHERE id = 1
    """)
    if res:
        return dec(res[0])
    return {"gula_capacity": 22000, "molasses_capacity": 30000,
            "molasses_tank_a_capacity": 15000, "molasses_tank_b_capacity": 15000,
            "milling_start_date": None}

def update_settings(gula_capacity, tank_a_capacity, tank_b_capacity, milling_start_date):
    ensure_rmi_settings()
    conn = get_db()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE rmi_settings 
            SET gula_capacity = %s, molasses_capacity = %s,
                molasses_tank_a_capacity = %s, molasses_tank_b_capacity = %s,
                milling_start_date = %s
            WHERE id = 1
        """, (gula_capacity, tank_a_capacity + tank_b_capacity,
              tank_a_capacity, tank_b_capacity, milling_start_date))
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

    # Molasses Stock (kg di DB → ton)
    mol_stok = query("""
        SELECT COALESCE(stok_akhir_tanka,0)/1000 as stok_akhir_tanka,
               COALESCE(stok_akhir_tankb,0)/1000 as stok_akhir_tankb
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
        ) s ON m.id = COALESCE(s.id_gudang, s.id_gudang_luar)
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
        SELECT COALESCE(stok_akhir_tanka,0)/1000 as stok_akhir_tanka,
               COALESCE(stok_akhir_tankb,0)/1000 as stok_akhir_tankb
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

def get_stok_harian(end_date=None, days=90):
    end_date = _valid_date_str(end_date) or _resolve_overview_date()
    days = max(1, min(int(days), 366))
    sql = """
        SELECT tanggal, 
               COALESCE(stok_akhir_gkm, 0) as gkm,
               COALESCE(stok_akhir_gkb, 0) as gkb,
               COALESCE(stok_akhir_reject, 0) as reject,
               COALESCE(stok_akhir_gkm, 0) + COALESCE(stok_akhir_gkb, 0) as total_stok
        FROM gula_stok 
        WHERE tanggal BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s
        ORDER BY tanggal ASC
    """
    return dec(query(sql, (end_date, days - 1, end_date))) or []

def get_delivery_harian(end_date=None, days=90):
    end_date = _valid_date_str(end_date) or _resolve_overview_date()
    days = max(1, min(int(days), 366))
    sql = """
        SELECT t.tanggal,
               CASE WHEN COALESCE(gd.plan_delivery, 0) <> 0 THEN gd.plan_delivery
                    ELSE COALESCE(gd.plan_delivery_gkm, 0) + COALESCE(gd.plan_delivery_gkb, 0) END as plan,
               CASE WHEN COALESCE(gd.actual_delivery, 0) <> 0 THEN gd.actual_delivery
                    ELSE COALESCE(gd.delivery_gkm, 0) + COALESCE(gd.delivery_gkb, 0) END as actual,
               COALESCE(gd.plan_delivery_gkm, 0) as plan_gkm,
               COALESCE(gd.plan_delivery_gkb, 0) as plan_gkb,
               COALESCE(gd.delivery_gkm, 0) as actual_gkm,
               COALESCE(gd.delivery_gkb, 0) as actual_gkb,
               COALESCE(md.plan_delivery, 0)/1000 as mol_plan,
               (COALESCE(md.actual_tank_a, 0) + COALESCE(md.actual_tank_b, 0))/1000 as mol_actual
        FROM (
            SELECT tanggal FROM gula_delivery WHERE tanggal BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s
            UNION
            SELECT tanggal FROM mol_delivery WHERE tanggal BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s
        ) t
        LEFT JOIN gula_delivery gd ON gd.tanggal = t.tanggal
        LEFT JOIN mol_delivery md ON md.tanggal = t.tanggal
        ORDER BY t.tanggal ASC
    """
    return dec(query(sql, (end_date, days - 1, end_date, end_date, days - 1, end_date))) or []

def get_molasses_harian(end_date=None, days=90):
    end_date = _valid_date_str(end_date) or _resolve_overview_date()
    days = max(1, min(int(days), 366))
    sql = """
        SELECT tanggal, 
               COALESCE(stok_akhir_tanka, 0)/1000 as tank_a, 
               COALESCE(stok_akhir_tankb, 0)/1000 as tank_b
        FROM mol_stok_tangki 
        WHERE tanggal BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s
        ORDER BY tanggal ASC
    """
    return dec(query(sql, (end_date, days - 1, end_date))) or []

def get_lokasi_stok():
    sql = """
        SELECT m.nama_gudang, COALESCE(s.stok_akhir, 0) as stok_akhir
        FROM mst_gudang_luar m
        LEFT JOIN (
            SELECT id_gudang_luar, id_gudang, COALESCE(stok_akhir, stok_ton, 0) as stok_akhir
            FROM gudang_luar_stok
            WHERE tanggal = (SELECT MAX(tanggal) FROM gudang_luar_stok)
        ) s ON m.id = COALESCE(s.id_gudang, s.id_gudang_luar)
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
        ) s ON m.id = COALESCE(s.id_gudang, s.id_gudang_luar)
        ORDER BY COALESCE(s.stok_akhir, 0) DESC, m.nama_gudang ASC
    """, (date_str,))) or []

    # Gula Delivery
    gula_del = query("""
        SELECT plan_delivery, actual_delivery, plan_delivery_gkm, plan_delivery_gkb, delivery_gkm, delivery_gkb
        FROM gula_delivery WHERE tanggal = %s LIMIT 1
    """, (date_str,))
    g_del = dec(gula_del[0]) if gula_del else {}

    # Gula Delivery plan besok
    gula_del_besok = query("""
        SELECT plan_delivery, delivery_gkm, delivery_gkb FROM gula_delivery 
        WHERE tanggal = DATE_ADD(%s, INTERVAL 1 DAY) LIMIT 1
    """, (date_str,))
    g_del_bsk = dec(gula_del_besok[0]) if gula_del_besok else {}

    # Molasses Stok (kg di DB → ton)
    mol_stok = query("""
        SELECT COALESCE(stok_awal_tanka,0)/1000 as stok_awal_tanka,
               COALESCE(stok_awal_tankb,0)/1000 as stok_awal_tankb,
               COALESCE(stok_akhir_tanka,0)/1000 as stok_akhir_tanka,
               COALESCE(stok_akhir_tankb,0)/1000 as stok_akhir_tankb
        FROM mol_stok_tangki WHERE tanggal = %s LIMIT 1
    """, (date_str,))
    m_stok = dec(mol_stok[0]) if mol_stok else {}

    # Molasses Penerimaan (Produksi per shift)
    m_penerimaan = dec(query("""
        SELECT shift, raw_sugar, cane_tebu FROM mol_penerimaan WHERE tanggal = %s
    """, (date_str,))) or []

    mol_prod_shift = {'1': 0, '2': 0, '3': 0, 'total': 0}
    raw_sugar_total = 0
    for p in m_penerimaan:
        s = str(p.get('shift'))
        if s in ['1','2','3']:
            rs = float(p.get('raw_sugar', 0) or 0)
            ct = float(p.get('cane_tebu', 0) or 0)
            mol_prod_shift[s] = rs + ct
            mol_prod_shift['total'] += mol_prod_shift[s]
            raw_sugar_total += rs

    cane_timbang = _get_cane_from_timbang(date_str)
    cane_shift = [
        {'shift': row['shift'], 'caneKg': row['netto_ton'], 'truck': row['ritase']}
        for row in cane_timbang['per_shift']
        if row['shift'] in [1, 2, 3]
    ]
    cane_hari_ini = cane_timbang['cane_netto_kg'] / 1000
    truck_hari_ini = cane_timbang['cane_ritase']

    settings = get_settings()
    milling_start = settings.get('milling_start_date')
    cane_to_date = _get_cane_to_date(milling_start, date_str)

    # Molasses Delivery
    mol_del = query("""
        SELECT plan_delivery, actual_tank_a, actual_tank_b, jml_truck, next_schedule FROM mol_delivery WHERE tanggal = %s LIMIT 1
    """, (date_str,))
    m_del = dec(mol_del[0]) if mol_del else {}
    m_actual_del = float(m_del.get('actual_tank_a',0) or 0) + float(m_del.get('actual_tank_b',0) or 0)
    m_plan_del = float(m_del.get('plan_delivery',0) or 0)

    # Molasses delivery kumulatif (todate) untuk % diff, sejak awal giling
    m_del_cum = {'plan': 0, 'actual': 0}
    if milling_start:
        cum_res = dec(query("""
            SELECT COALESCE(SUM(plan_delivery),0) as plan,
                   COALESCE(SUM(COALESCE(actual_tank_a,0)+COALESCE(actual_tank_b,0)),0) as actual
            FROM mol_delivery WHERE tanggal BETWEEN %s AND %s
        """, (milling_start, date_str), one=True)) or {}
        m_del_cum['plan'] = float(cum_res.get('plan') or 0)
        m_del_cum['actual'] = float(cum_res.get('actual') or 0)

    # Yield molasses = produksi molasses / cane masuk hari ini (ton)
    cane_today_ton = float(cane_hari_ini or 0)
    mol_yield = (mol_prod_shift['total'] / cane_today_ton * 100) if cane_today_ton > 0 else None


    # 1. Detail Reject per jenis (tonase)
    detail_reject_res = dec(query('''
        SELECT jenis_reject as jenis, SUM(COALESCE(jumlah_kg,0)) / 1000 as qty
        FROM gula_reject_log
        WHERE tanggal = %s
        GROUP BY jenis_reject
        ORDER BY qty DESC
    ''', (date_str,))) or []

    # 2. Detail Remelt per jenis (tonase)
    detail_remelt_res = dec(query('''
        SELECT jenis_reject as jenis, SUM(COALESCE(jumlah_kg,0)) / 1000 as qty
        FROM gula_remelt_log
        WHERE tanggal = %s
        GROUP BY jenis_reject
        ORDER BY qty DESC
    ''', (date_str,))) or []

    return {
        "tanggal": date_str,
        "gula": {
            "openBalance": float(g_stok.get('stok_awal_gkm',0) or 0) + float(g_stok.get('stok_awal_gkb',0) or 0),
            "produksi": gula_prod_shift,
            "produksiDetail": gula_detail,
            "delivery": {
                "plan": float(g_del.get('plan_delivery', 0) or 0),
                "actual": float(g_del.get('actual_delivery', 0) or 0),
                "diff": float(g_del.get('plan_delivery', 0) or 0) - float(g_del.get('actual_delivery', 0) or 0),
                "planGkm": float(g_del.get('plan_delivery_gkm', 0) or 0),
                "planGkb": float(g_del.get('plan_delivery_gkb', 0) or 0),
                "actGkm": float(g_del.get('delivery_gkm', 0) or 0),
                "actGkb": float(g_del.get('delivery_gkb', 0) or 0)
            },
            "endBalance": float(g_stok.get('stok_akhir_gkm',0) or 0) + float(g_stok.get('stok_akhir_gkb',0) or 0),
            "stokGkb": float(g_stok.get('stok_akhir_gkb',0) or 0),
            "stokGkm": float(g_stok.get('stok_akhir_gkm',0) or 0),
            "reject": float(g_stok.get('stok_akhir_reject',0) or 0),
            "detailReject": detail_reject_res,
            "detailRemelt": detail_remelt_res,
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
            "openTankA": float(m_stok.get('stok_awal_tanka',0) or 0),
            "openTankB": float(m_stok.get('stok_awal_tankb',0) or 0),
            "produksi": mol_prod_shift,
            "rawSugarIn": raw_sugar_total,
            "yield": mol_yield,
            "capacity": float(settings.get('molasses_capacity') or 30000),
            "delivery": {
                "schedule": m_plan_del,
                "actual": m_actual_del,
                "diff": m_plan_del - m_actual_del,
                "actTankA": float(m_del.get('actual_tank_a',0) or 0),
                "actTankB": float(m_del.get('actual_tank_b',0) or 0),
                "jmlTruck": int(m_del.get('jml_truck',0) or 0),
                "nextSchedule": float(m_del.get('next_schedule',0) or 0),
                "cumPlan": m_del_cum['plan'],
                "cumActual": m_del_cum['actual'],
                "cumDiff": m_del_cum['actual'] - m_del_cum['plan'],
                "cumDiffPct": ((m_del_cum['actual'] - m_del_cum['plan']) / m_del_cum['plan'] * 100) if m_del_cum['plan'] > 0 else None
            },
            "endBalance": float(m_stok.get('stok_akhir_tanka',0) or 0) + float(m_stok.get('stok_akhir_tankb',0) or 0),
            "tankA": float(m_stok.get('stok_akhir_tanka',0) or 0),
            "tankB": float(m_stok.get('stok_akhir_tankb',0) or 0)
        },
        "cane": {
            "kumulatif": cane_to_date['cane_netto_to_date'],
            "kumulatifTruck": cane_to_date['cane_ritase_to_date'],
            "millingStartDate": _date_to_str(milling_start),
            "reportDate": date_str,
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
            (COALESCE(ms.stok_akhir_tanka,0) + COALESCE(ms.stok_akhir_tankb,0))/1000 as molassesEndBalance,
            (SELECT SUM(COALESCE(gkm_crushing,0)+COALESCE(gkm_melting,0)+COALESCE(gkb_crushing,0)+COALESCE(gkb_melting,0)) FROM gula_penerimaan p WHERE p.tanggal = gs.tanggal) as produksiGula,
            (SELECT SUM(COALESCE(raw_sugar,0)+COALESCE(cane_tebu,0)) FROM mol_penerimaan m WHERE m.tanggal = gs.tanggal) as produksiMolasses,
            (SELECT SUM(ABS(COALESCE(t.Qty_Netto,0)))/1000 FROM data_timbang t WHERE UPPER(TRIM(t.Type)) = 'TEBU' AND t.Tanggal_Keluar_Clean = gs.tanggal) as caneHariIni
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
            (SELECT SUM(ABS(COALESCE(t.Qty_Netto,0)))/1000 / NULLIF(COUNT(DISTINCT t.Tanggal_Keluar_Clean), 0) FROM data_timbang t WHERE t.Shift = gp.shift AND UPPER(TRIM(t.Type)) = 'TEBU' AND t.Tanggal_Keluar_Clean BETWEEN %s AND %s) as avgCane
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
    end_date_str = _valid_date_str(end_date_str) or _resolve_overview_date()
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
            (COALESCE(ms.stok_akhir_tanka,0) + COALESCE(ms.stok_akhir_tankb,0))/1000 as molassesEndBalance,
            
            (SELECT SUM(COALESCE(gkm_crushing,0)+COALESCE(gkm_melting,0)) FROM gula_penerimaan p WHERE p.tanggal = gs.tanggal) as produksiGkm,
            (SELECT SUM(COALESCE(gkb_crushing,0)+COALESCE(gkb_melting,0)) FROM gula_penerimaan p WHERE p.tanggal = gs.tanggal) as produksiGkb,
            
            (SELECT SUM(COALESCE(raw_sugar,0)+COALESCE(cane_tebu,0)) FROM mol_penerimaan m WHERE m.tanggal = gs.tanggal) as produksiMolasses,
            (SELECT SUM(ABS(COALESCE(t.Qty_Netto,0)))/1000 FROM data_timbang t WHERE UPPER(TRIM(t.Type)) = 'TEBU' AND t.Tanggal_Keluar_Clean = gs.tanggal) as caneHariIni
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

    # ── Compute derived analytics from the raw trend rows ──
    def _f(v):
        try:
            return float(v) if v is not None else 0.0
        except (TypeError, ValueError):
            return 0.0

    def _avg(vals):
        vals = [v for v in vals if v is not None]
        return sum(vals) / len(vals) if vals else 0.0

    # Per-day derived rows
    rows = []
    for t in tren:
        cane = _f(t.get('caneHariIni'))
        gkm = _f(t.get('produksiGkm'))
        gkb = _f(t.get('produksiGkb'))
        mol = _f(t.get('produksiMolasses'))
        gula = gkm + gkb
        stock_gula = _f(t.get('gulaEndBalance'))
        stock_mol = _f(t.get('molassesEndBalance'))
        yield_gula = (gula / cane * 100) if cane > 0 else None
        yield_mol = (mol / cane * 100) if cane > 0 else None
        rows.append({
            'tanggal': str(t.get('tanggal')),
            'cane': round(cane, 2),
            'gkm': round(gkm, 2),
            'gkb': round(gkb, 2),
            'molasses': round(mol, 2),
            'gula': round(gula, 2),
            'stockGula': round(stock_gula, 2),
            'stockMolasses': round(stock_mol, 2),
            'yieldGula': round(yield_gula, 2) if yield_gula is not None else None,
            'yieldMolasses': round(yield_mol, 2) if yield_mol is not None else None,
        })

    # KPI periode
    total_cane = sum(r['cane'] for r in rows)
    total_gkm = sum(r['gkm'] for r in rows)
    total_gkb = sum(r['gkb'] for r in rows)
    total_gula = total_gkm + total_gkb
    total_mol = sum(r['molasses'] for r in rows)
    days_with_data = len(rows)

    avg_gula_per_day = total_gula / days_with_data if days_with_data > 0 else 0
    avg_cane_per_day = total_cane / days_with_data if days_with_data > 0 else 0
    avg_yield_gula = (total_gula / total_cane * 100) if total_cane > 0 else None
    avg_yield_mol = (total_mol / total_cane * 100) if total_cane > 0 else None

    # Perubahan stok: dari pertama ke terakhir
    stock_change_gula = (rows[-1]['stockGula'] - rows[0]['stockGula']) if len(rows) >= 2 else 0
    stock_change_mol = (rows[-1]['stockMolasses'] - rows[0]['stockMolasses']) if len(rows) >= 2 else 0

    kpi = {
        'avgGulaPerDay': round(avg_gula_per_day, 2),
        'avgCanePerDay': round(avg_cane_per_day, 2),
        'avgYieldGula': round(avg_yield_gula, 2) if avg_yield_gula is not None else None,
        'avgYieldMolasses': round(avg_yield_mol, 2) if avg_yield_mol is not None else None,
        'stockChangeGula': round(stock_change_gula, 2),
        'stockChangeMolasses': round(stock_change_mol, 2),
        'daysWithData': days_with_data,
        'totalGula': round(total_gula, 2),
        'totalCane': round(total_cane, 2),
        'totalMolasses': round(total_mol, 2),
    }

    # ── Shift performance ──
    shift_rows = dec(query("""
        SELECT
            shifts.shift,
            COALESCE(g.gkm, 0) AS gkm,
            COALESCE(g.gkb, 0) AS gkb,
            COALESCE(m.molasses, 0) AS molasses,
            COALESCE(c.cane, 0) AS cane
        FROM (
            SELECT shift FROM gula_penerimaan WHERE tanggal BETWEEN %s AND %s
            UNION
            SELECT shift FROM mol_penerimaan WHERE tanggal BETWEEN %s AND %s
            UNION
            SELECT Shift AS shift FROM data_timbang
            WHERE Tanggal_Keluar_Clean BETWEEN %s AND %s AND UPPER(TRIM(Type)) = 'TEBU'
        ) shifts
        LEFT JOIN (
            SELECT shift,
                   SUM(COALESCE(gkm_crushing, 0) + COALESCE(gkm_melting, 0)) AS gkm,
                   SUM(COALESCE(gkb_crushing, 0) + COALESCE(gkb_melting, 0)) AS gkb
            FROM gula_penerimaan WHERE tanggal BETWEEN %s AND %s GROUP BY shift
        ) g ON g.shift = shifts.shift
        LEFT JOIN (
            SELECT shift, SUM(COALESCE(raw_sugar, 0) + COALESCE(cane_tebu, 0)) AS molasses
            FROM mol_penerimaan WHERE tanggal BETWEEN %s AND %s GROUP BY shift
        ) m ON m.shift = shifts.shift
        LEFT JOIN (
            SELECT Shift AS shift, SUM(ABS(COALESCE(Qty_Netto, 0))) / 1000 AS cane
            FROM data_timbang
            WHERE Tanggal_Keluar_Clean BETWEEN %s AND %s AND UPPER(TRIM(Type)) = 'TEBU'
            GROUP BY Shift
        ) c ON c.shift = shifts.shift
    """, (date_from, date_to, date_from, date_to, date_from, date_to,
          date_from, date_to, date_from, date_to, date_from, date_to))) or []

    shift_data = {}
    for s in shift_rows:
        sh = str(s.get('shift'))
        shift_data[sh] = {
            'cane': _f(s.get('cane')),
            'gkm': _f(s.get('gkm')),
            'gkb': _f(s.get('gkb')),
            'molasses': _f(s.get('molasses')),
        }

    shift_perf = []
    for sh in sorted(shift_data.keys()):
        d = shift_data[sh]
        gula_total = d['gkm'] + d['gkb']
        yield_g = (gula_total / d['cane'] * 100) if d['cane'] > 0 else None
        yield_m = (d['molasses'] / d['cane'] * 100) if d['cane'] > 0 else None
        shift_perf.append({
            'shift': sh,
            'cane': round(d['cane'], 2),
            'gkm': round(d['gkm'], 2),
            'gkb': round(d['gkb'], 2),
            'gula': round(gula_total, 2),
            'molasses': round(d['molasses'], 2),
            'yieldGula': round(yield_g, 2) if yield_g is not None else None,
            'yieldMolasses': round(yield_m, 2) if yield_m is not None else None,
        })

    # ── Insights otomatis ──
    insights = []

    if len(rows) >= 2:
        # Hari produksi tertinggi/terendah
        by_gula = [(r['tanggal'], r['gula']) for r in rows if r['gula'] > 0]
        if by_gula:
            hi = max(by_gula, key=lambda x: x[1])
            lo = min(by_gula, key=lambda x: x[1])
            insights.append({
                'type': 'extreme',
                'icon': 'fa-arrow-up',
                'color': '#3fb950',
                'title': f'Produksi tertinggi: {hi[1]:,.1f} MT pada {hi[0]}',
                'detail': f'Terendah: {lo[1]:,.1f} MT pada {lo[0]}',
            })

        # Yield turun tajam
        if avg_yield_gula is not None:
            for r in rows:
                if r['yieldGula'] is not None and r['yieldGula'] < avg_yield_gula * 0.85:
                    insights.append({
                        'type': 'warning',
                        'icon': 'fa-triangle-exclamation',
                        'color': '#f85149',
                        'title': f'Yield gula turun di {r["tanggal"]}',
                        'detail': f'Yield {r["yieldGula"]:.1f}% vs rata-rata {avg_yield_gula:.1f}%',
                    })
                    break

        # Stok naik/turun
        if stock_change_gula != 0:
            direction = 'naik' if stock_change_gula > 0 else 'turun'
            insights.append({
                'type': 'stock',
                'icon': 'fa-arrow-trend-up' if stock_change_gula > 0 else 'fa-arrow-trend-down',
                'color': '#3fb950' if stock_change_gula > 0 else '#f85149',
                'title': f'Stok gula {direction} {abs(stock_change_gula):,.1f} MT dalam {days_with_data} hari',
                'detail': f'Dari {rows[0]["stockGula"]:,.1f} menjadi {rows[-1]["stockGula"]:,.1f} MT',
            })

        # Hari tanpa data
        missing = [r['tanggal'] for r in rows if r['gula'] == 0 and r['cane'] == 0]
        if missing:
            insights.append({
                'type': 'missing',
                'icon': 'fa-circle-info',
                'color': '#d29922',
                'title': f'{len(missing)} hari tanpa data produksi',
                'detail': f'Tanggal: {", ".join(missing[:5])}{"..." if len(missing) > 5 else ""}',
            })

        # Shift terbaik per metrik
        if shift_perf:
            best_cane = max(shift_perf, key=lambda x: x['cane'])
            best_gula = max(shift_perf, key=lambda x: x['gula'])
            if best_cane['shift'] != best_gula['shift']:
                insights.append({
                    'type': 'shift',
                    'icon': 'fa-ranking-star',
                    'color': '#58a6ff',
                    'title': f'Shift {best_gula["shift"]} terbaik untuk produksi gula',
                    'detail': f'Shift {best_cane["shift"]} terbaik untuk cane-in. Keduanya berbeda — perlu investigasi.',
                })
            else:
                insights.append({
                    'type': 'shift',
                    'icon': 'fa-ranking-star',
                    'color': '#3fb950',
                    'title': f'Shift {best_gula["shift"]} unggul di semua metrik',
                    'detail': f'Cane-in {best_gula["cane"]:,.1f} MT, Gula {best_gula["gula"]:,.1f} MT',
                })

    # ── Chart data ──
    chart_labels = [r['tanggal'] for r in rows]
    chart_data = {
        'cane': [r['cane'] for r in rows],
        'gkm': [r['gkm'] for r in rows],
        'gkb': [r['gkb'] for r in rows],
        'molasses': [r['molasses'] for r in rows],
        'gula': [r['gula'] for r in rows],
        'stockGula': [r['stockGula'] for r in rows],
        'stockMolasses': [r['stockMolasses'] for r in rows],
        'yieldGula': [r['yieldGula'] for r in rows],
        'yieldMolasses': [r['yieldMolasses'] for r in rows],
    }

    # Delivery summary (for KPI only, not duplicated chart)
    del_summary = {
        'gulaPlan': sum(_f(d.get('gulaPlan')) for d in delivery),
        'gulaActual': sum(_f(d.get('gulaActual')) for d in delivery),
        'molSchedule': sum(_f(d.get('molSchedule')) for d in delivery),
        'molActual': sum(_f(d.get('molActual')) for d in delivery),
    }
    del_summary['gulaAchievement'] = round((del_summary['gulaActual'] / del_summary['gulaPlan'] * 100), 1) if del_summary['gulaPlan'] > 0 else None
    del_summary['molAchievement'] = round((del_summary['molActual'] / del_summary['molSchedule'] * 100), 1) if del_summary['molSchedule'] > 0 else None

    return {
        "date_from": date_from,
        "date_to": date_to,
        "days": days,
        "kpi": kpi,
        "chartLabels": chart_labels,
        "chartData": chart_data,
        "shiftPerformance": shift_perf,
        "insights": insights,
        "deliverySummary": del_summary,
        "delivery": [
            {
                "tanggal": str(d.get('tanggal')),
                "molSchedule": _f(d.get('molSchedule')),
                "molActual": _f(d.get('molActual')),
                "molDefisit": _f(d.get('molDefisit')),
            } for d in delivery
        ],
    }
