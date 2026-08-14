from .db_core import dec, query, get_db


def _audit_sum(*values):
    return None if any(value is None for value in values) else sum(float(value) for value in values)


def _audit_status(opening, inbound, outbound, adjustment, calculated, actual, tolerance=0.01):
    if any(value is None for value in (opening, inbound, outbound, actual, calculated)):
        return 'missing_input'
    return 'balanced' if abs(float(calculated) - float(actual)) <= tolerance else 'mismatch'


def _validation_check(code, label, left_label, left, right_label, right,
                      tolerance=0.01, status=None, message=None, details=None):
    """Build a validation result without turning missing values into false zeroes."""
    has_values = left is not None and right is not None
    diff = float(left) - float(right) if has_values else None
    resolved_status = status
    if resolved_status is None:
        if not has_values:
            resolved_status = 'missing_input'
        else:
            resolved_status = 'balanced' if abs(diff) <= tolerance else 'mismatch'

    return {
        'code': code,
        'label': label,
        'leftLabel': left_label,
        'left': float(left) if left is not None else None,
        'rightLabel': right_label,
        'right': float(right) if right is not None else None,
        'diff': diff,
        'tolerance': tolerance,
        'status': resolved_status,
        'message': message,
        'details': details or []
    }


def _build_stock_position_summary(inventory_stock, location_rows, report_date, tolerance=0.01):
    """Reconcile official inventory with the per-location allocation snapshot."""
    locations = []
    for row in location_rows:
        snapshot_date = _date_to_str(row.get('snapshot_date'))
        stock = float(row.get('stok_akhir') or 0)
        locations.append({
            'code': row.get('code', ''),
            'name': row.get('name') or 'Gudang',
            'siteType': row.get('site_type', 'out_site'),
            'stock': stock,
            'capacity': float(row.get('capacity_ton') or 0),
            'snapshotDate': snapshot_date,
            'isStale': bool(snapshot_date and snapshot_date != report_date),
            'hasSnapshot': snapshot_date is not None
        })

    mapped_total = sum(location['stock'] for location in locations if location['hasSnapshot'])
    in_site = sum(location['stock'] for location in locations
                  if location['hasSnapshot'] and location['siteType'] == 'in_site')
    out_site = sum(location['stock'] for location in locations
                   if location['hasSnapshot'] and location['siteType'] == 'out_site')
    mapped_count = sum(1 for location in locations if location['hasSnapshot'])
    fresh_count = sum(1 for location in locations if location['snapshotDate'] == report_date)
    stale_count = sum(1 for location in locations if location['isStale'])
    missing_count = sum(1 for location in locations if not location['hasSnapshot'])

    difference = float(inventory_stock) - mapped_total if inventory_stock is not None else None
    if inventory_stock is None or mapped_count == 0:
        allocation_status = 'missing_input'
        allocation_message = 'Stok resmi atau data posisi lokasi belum tersedia.'
    elif abs(difference) <= tolerance:
        allocation_status = 'balanced'
        allocation_message = 'Seluruh stok resmi sudah terpetakan ke lokasi.'
    elif difference > 0:
        allocation_status = 'mismatch'
        allocation_message = f'{difference:.3f} ton stok belum terpetakan ke lokasi.'
    else:
        allocation_status = 'mismatch'
        allocation_message = f'{abs(difference):.3f} ton posisi melebihi stok resmi.'

    if not locations or missing_count:
        freshness_status = 'missing_input'
        freshness_message = f'{missing_count} lokasi belum memiliki snapshot posisi.'
    elif stale_count:
        freshness_status = 'stale'
        freshness_message = f'{stale_count} lokasi memakai snapshot sebelum {report_date}.'
    else:
        freshness_status = 'balanced'
        freshness_message = f'Seluruh posisi menggunakan snapshot {report_date}.'

    summary = {
        'inventoryTotal': float(inventory_stock) if inventory_stock is not None else None,
        'mappedTotal': mapped_total,
        'difference': difference,
        'unallocated': max(difference, 0) if difference is not None else None,
        'overallocated': max(-difference, 0) if difference is not None else None,
        'status': allocation_status,
        'inSite': in_site,
        'outSite': out_site,
        # Keep the old keys for existing consumers while the UI migrates.
        'insite': in_site,
        'outsite': out_site,
        'locationCount': len(locations),
        'mappedLocationCount': mapped_count,
        'freshLocationCount': fresh_count,
        'staleLocationCount': stale_count,
        'missingLocationCount': missing_count,
        'locations': locations
    }
    checks = [
        _validation_check(
            'LOCATION_ALLOCATION', 'Location Allocation',
            'Official Total Stock', inventory_stock,
            'Mapped Position', mapped_total if mapped_count else None,
            tolerance=tolerance,
            status=allocation_status,
            message=allocation_message
        ),
        _validation_check(
            'POSITION_FRESHNESS', 'Position Freshness',
            'Fresh Locations', fresh_count,
            'Active Locations', len(locations),
            tolerance=0,
            status=freshness_status,
            message=freshness_message
        )
    ]
    return summary, checks


def get_rmi_audit_reconciliation(date_from=None, date_to=None):
    date_from = _valid_date_str(date_from)
    date_to = _valid_date_str(date_to) or date_from
    rows = dec(query("""
        SELECT s.tanggal,
               (SELECT p.stok_akhir_tanka / 1000 FROM mol_stok_tangki p WHERE p.tanggal < s.tanggal ORDER BY p.tanggal DESC LIMIT 1) opening_a,
               (SELECT p.stok_akhir_tankb / 1000 FROM mol_stok_tangki p WHERE p.tanggal < s.tanggal ORDER BY p.tanggal DESC LIMIT 1) opening_b,
               s.stok_akhir_tanka / 1000 actual_a,
               s.stok_akhir_tankb / 1000 actual_b,
               (SELECT SUM(COALESCE(mp.raw_sugar, 0) + COALESCE(mp.cane_tebu, 0)) / 1000 FROM mol_penerimaan mp WHERE mp.tanggal = s.tanggal) inbound,
               (SELECT SUM(COALESCE(md.actual_tank_a, 0)) / 1000 FROM mol_delivery md WHERE md.tanggal = s.tanggal) outbound_a,
               (SELECT SUM(COALESCE(md.actual_tank_b, 0)) / 1000 FROM mol_delivery md WHERE md.tanggal = s.tanggal) outbound_b
        FROM mol_stok_tangki s
        WHERE s.tanggal BETWEEN %s AND %s
        ORDER BY s.tanggal
    """, (date_from, date_to))) or []
    result = []
    for row in rows:
        opening = _audit_sum(row['opening_a'], row['opening_b'])
        actual = _audit_sum(row['actual_a'], row['actual_b'])
        outbound = _audit_sum(row['outbound_a'], row['outbound_b'])
        inbound = row['inbound']
        calculated = opening + inbound - outbound if None not in (opening, inbound, outbound) else None
        result.append({
            'tanggal': str(row['tanggal']),
            'product_code': 'MOLASSES',
            'opening': opening,
            'inbound': inbound,
            'outbound': outbound,
            'adjustment': 0,
            'calculated_closing': calculated,
            'actual_closing': actual,
            'difference': calculated - actual if calculated is not None and actual is not None else None,
            'status': _audit_status(opening, inbound, outbound, 0, calculated, actual),
            'tanks': [
                {'tank': 'A', 'opening': row['opening_a'], 'outbound': row['outbound_a'], 'actual_closing': row['actual_a']},
                {'tank': 'B', 'opening': row['opening_b'], 'outbound': row['outbound_b'], 'actual_closing': row['actual_b']}
            ]
        })
    return result


def first_audit_problem_date(molasses_rows, sugar_rows):
    """Tanggal pertama dengan mismatch, lalu missing_input. None jika semua balanced."""
    def _pick(status):
        dates = [row['tanggal'] for row in molasses_rows if row.get('status') == status]
        dates += [row['tanggal'] for row in sugar_rows
                  for key in ('gkp', 'gkm', 'gkb') if row.get(key, {}).get('status') == status]
        return min(dates) if dates else None

    return _pick('mismatch') or _pick('missing_input')


def get_rmi_audit_movements(date_from=None, date_to=None, product_code=None):
    date_from = _valid_date_str(date_from)
    date_to = _valid_date_str(date_to) or date_from
    rows = dec(query("""
        SELECT tanggal, shift, product_code, movement_type, quantity, unit, source_table, source_reference FROM (
            SELECT tanggal, shift, CONVERT('GKM' USING utf8mb4) product_code, CONVERT('production_in' USING utf8mb4) movement_type, COALESCE(gkm_crushing, 0) + COALESCE(gkm_melting, 0) quantity, CONVERT('TON' USING utf8mb4) unit, CONVERT('gula_penerimaan' USING utf8mb4) source_table, CONVERT(CONCAT(tanggal, '/shift-', shift) USING utf8mb4) source_reference FROM gula_penerimaan
            UNION ALL SELECT tanggal, shift, CONVERT('GKB' USING utf8mb4), CONVERT('production_in' USING utf8mb4), COALESCE(gkb_crushing, 0) + COALESCE(gkb_melting, 0), CONVERT('TON' USING utf8mb4), CONVERT('gula_penerimaan' USING utf8mb4), CONVERT(CONCAT(tanggal, '/shift-', shift) USING utf8mb4) FROM gula_penerimaan
            UNION ALL SELECT tanggal, NULL, CONVERT('GKM' USING utf8mb4), CONVERT('delivery_out' USING utf8mb4), delivery_gkm, CONVERT('TON' USING utf8mb4), CONVERT('gula_delivery' USING utf8mb4), CONVERT(CAST(tanggal AS CHAR) USING utf8mb4) FROM gula_delivery
            UNION ALL SELECT tanggal, NULL, CONVERT('GKB' USING utf8mb4), CONVERT('delivery_out' USING utf8mb4), delivery_gkb, CONVERT('TON' USING utf8mb4), CONVERT('gula_delivery' USING utf8mb4), CONVERT(CAST(tanggal AS CHAR) USING utf8mb4) FROM gula_delivery
            UNION ALL SELECT tanggal, shift, CONVERT(jenis_gula USING utf8mb4),
                CONVERT(CASE WHEN UPPER(TRIM(jenis_reject)) IN ('SUSUT LOADING', 'DOWNGRADE TO REJECT') THEN 'repack_out' ELSE 'reject_out' END USING utf8mb4),
                jumlah_ton, CONVERT('TON' USING utf8mb4), CONVERT('gula_reject_log' USING utf8mb4), CONVERT(COALESCE(NULLIF(keterangan, ''), jenis_reject) USING utf8mb4)
            FROM gula_reject_log WHERE UPPER(TRIM(kategori_transaksi)) = 'DELIVERY'
            UNION ALL SELECT tanggal, NULL, CONVERT('GKM' USING utf8mb4),
                CONVERT('upgrade_to_product' USING utf8mb4),
                upgrade_gkm, CONVERT('TON' USING utf8mb4), CONVERT('gula_upgrade_log' USING utf8mb4), CONVERT(jenis_reject USING utf8mb4)
            FROM gula_upgrade_log WHERE COALESCE(upgrade_gkm, 0) <> 0
            UNION ALL SELECT tanggal, NULL, CONVERT('GKB' USING utf8mb4),
                CONVERT('upgrade_to_product' USING utf8mb4),
                upgrade_gkb, CONVERT('TON' USING utf8mb4), CONVERT('gula_upgrade_log' USING utf8mb4), CONVERT(jenis_reject USING utf8mb4)
            FROM gula_upgrade_log WHERE COALESCE(upgrade_gkb, 0) <> 0
            UNION ALL SELECT tanggal, shift, CONVERT('MOLASSES' USING utf8mb4), CONVERT('production_in' USING utf8mb4), (COALESCE(raw_sugar, 0) + COALESCE(cane_tebu, 0)) / 1000, CONVERT('TON' USING utf8mb4), CONVERT('mol_penerimaan' USING utf8mb4), CONVERT(CONCAT(tanggal, '/shift-', shift) USING utf8mb4) FROM mol_penerimaan
            UNION ALL SELECT tanggal, NULL, CONVERT('MOLASSES_A' USING utf8mb4), CONVERT('delivery_out' USING utf8mb4), actual_tank_a / 1000, CONVERT('TON' USING utf8mb4), CONVERT('mol_delivery' USING utf8mb4), CONVERT(CAST(tanggal AS CHAR) USING utf8mb4) FROM mol_delivery
            UNION ALL SELECT tanggal, NULL, CONVERT('MOLASSES_B' USING utf8mb4), CONVERT('delivery_out' USING utf8mb4), actual_tank_b / 1000, CONVERT('TON' USING utf8mb4), CONVERT('mol_delivery' USING utf8mb4), CONVERT(CAST(tanggal AS CHAR) USING utf8mb4) FROM mol_delivery
            UNION ALL SELECT Tanggal_Keluar_Clean, Shift, CONVERT('CANE' USING utf8mb4), CONVERT('cane_in' USING utf8mb4), SUM(ABS(Qty_Netto)) / 1000, CONVERT('TON' USING utf8mb4), CONVERT('data_timbang' USING utf8mb4), CONVERT(CONCAT(COUNT(*), ' ritase') USING utf8mb4) FROM data_timbang WHERE UPPER(TRIM(Type)) = 'TEBU' AND Tanggal_Keluar_Clean BETWEEN %s AND %s GROUP BY Tanggal_Keluar_Clean, Shift
        ) movements WHERE tanggal BETWEEN %s AND %s
        ORDER BY tanggal DESC, product_code, movement_type LIMIT 500
    """, (date_from, date_to, date_from, date_to))) or []
    if product_code:
        rows = [row for row in rows if row['product_code'] == product_code]
    return rows


def get_rmi_audit_yield(date_from=None, date_to=None, target=None):
    date_from = _valid_date_str(date_from)
    date_to = _valid_date_str(date_to) or date_from
    rows = dec(query("""
        SELECT mp.tanggal, mp.shift,
               SUM(COALESCE(mp.raw_sugar, 0) + COALESCE(mp.cane_tebu, 0)) / 1000 molasses_in,
               (SELECT SUM(ABS(COALESCE(dt.Qty_Netto, 0))) / 1000 FROM data_timbang dt
                 WHERE UPPER(TRIM(dt.Type)) = 'TEBU' AND dt.Tanggal_Keluar_Clean = mp.tanggal AND dt.Shift = mp.shift) cane_in
        FROM mol_penerimaan mp
        WHERE mp.tanggal BETWEEN %s AND %s
        GROUP BY mp.tanggal, mp.shift
        ORDER BY mp.tanggal, mp.shift
    """, (date_from, date_to))) or []
    target_value = float(target) if target not in (None, '') else None

    def _yield(mol, cane):
        return mol / cane * 100 if cane and mol is not None else None

    for row in rows:
        row['yield_percent'] = _yield(row.get('molasses_in'), row.get('cane_in'))
        row['target'] = target_value
        row['variance'] = row['yield_percent'] - target_value if row['yield_percent'] is not None and target_value is not None else None
        row['status'] = 'ok' if row['yield_percent'] is not None else 'missing_input'

    # ponytail: yield harian menghindari lag time antar shift; kumulatif ikut dari total periode
    daily = {}
    for row in rows:
        day = daily.setdefault(str(row['tanggal']), {'tanggal': str(row['tanggal']), 'shift': 'Harian', 'molasses_in': 0.0, 'cane_in': 0.0})
        day['molasses_in'] += float(row.get('molasses_in') or 0)
        day['cane_in'] += float(row.get('cane_in') or 0)

    # Produksi GKP harian (GKM + GKB) untuk yield gula
    sugar_rows = dec(query("""
        SELECT tanggal,
               SUM(COALESCE(gkm_crushing, 0) + COALESCE(gkm_melting, 0)
                 + COALESCE(gkb_crushing, 0) + COALESCE(gkb_melting, 0)) gkp_in
        FROM gula_penerimaan
        WHERE tanggal BETWEEN %s AND %s
        GROUP BY tanggal
    """, (date_from, date_to))) or []
    sugar_by_date = {str(row['tanggal']): float(row.get('gkp_in') or 0) for row in sugar_rows}

    for day in daily.values():
        day['gkp_in'] = sugar_by_date.get(day['tanggal'])
        day['yield_percent'] = _yield(day['molasses_in'], day['cane_in'])
        day['yield_gkp_percent'] = _yield(day['gkp_in'], day['cane_in'])
        day['target'] = target_value
        day['variance'] = day['yield_percent'] - target_value if day['yield_percent'] is not None and target_value is not None else None
        day['status'] = 'ok' if day['yield_percent'] is not None else 'missing_input'

    total_mol = sum(day['molasses_in'] for day in daily.values())
    total_cane = sum(day['cane_in'] for day in daily.values())
    total_gkp = sum(day['gkp_in'] or 0 for day in daily.values())

    # ponytail: yield todate sejak awal giling menetralkan lag time tebu -> gula
    milling_start = _valid_date_str(_date_to_str(get_settings().get('milling_start_date')))
    todate = {'from': milling_start, 'to': date_to, 'status': 'missing_input'}
    if milling_start and milling_start <= date_to:
        totals = dec(query("""
            SELECT (SELECT SUM(COALESCE(raw_sugar, 0) + COALESCE(cane_tebu, 0)) / 1000 FROM mol_penerimaan WHERE tanggal BETWEEN %s AND %s) molasses_in,
                   (SELECT SUM(COALESCE(gkm_crushing, 0) + COALESCE(gkm_melting, 0) + COALESCE(gkb_crushing, 0) + COALESCE(gkb_melting, 0)) FROM gula_penerimaan WHERE tanggal BETWEEN %s AND %s) gkp_in,
                   (SELECT SUM(ABS(COALESCE(Qty_Netto, 0))) / 1000 FROM data_timbang WHERE UPPER(TRIM(Type)) = 'TEBU' AND Tanggal_Keluar_Clean BETWEEN %s AND %s) cane_in
        """, (milling_start, date_to, milling_start, date_to, milling_start, date_to), one=True)) or {}
        todate.update({
            'molasses_in': totals.get('molasses_in'),
            'gkp_in': totals.get('gkp_in'),
            'cane_in': totals.get('cane_in'),
            'yield_percent': _yield(totals.get('molasses_in'), totals.get('cane_in')),
            'yield_gkp_percent': _yield(totals.get('gkp_in'), totals.get('cane_in')),
            'status': 'ok' if totals.get('cane_in') else 'missing_input'
        })

    return {
        'shift': rows,
        'daily': sorted(daily.values(), key=lambda day: day['tanggal']),
        'cumulative': {
            'molasses_in': total_mol,
            'cane_in': total_cane,
            'gkp_in': total_gkp,
            'yield_percent': _yield(total_mol, total_cane),
            'yield_gkp_percent': _yield(total_gkp, total_cane),
            'target': target_value,
            'status': 'ok' if total_cane else 'missing_input'
        },
        'todate': todate
    }


def get_rmi_audit_sugar(date_from=None, date_to=None):
    date_from = _valid_date_str(date_from)
    date_to = _valid_date_str(date_to) or date_from
    rows = dec(query("""
        SELECT gs.tanggal,
               (SELECT p.stok_akhir_gkm FROM gula_stok p WHERE p.tanggal < gs.tanggal ORDER BY p.tanggal DESC LIMIT 1) gkm_opening,
               (SELECT p.stok_akhir_gkb FROM gula_stok p WHERE p.tanggal < gs.tanggal ORDER BY p.tanggal DESC LIMIT 1) gkb_opening,
               gs.stok_akhir_gkm gkm_actual,
               gs.stok_akhir_gkb gkb_actual,
               (SELECT SUM(COALESCE(p.gkm_crushing, 0) + COALESCE(p.gkm_melting, 0)) FROM gula_penerimaan p WHERE p.tanggal = gs.tanggal) gkm_production,
               (SELECT SUM(COALESCE(p.gkb_crushing, 0) + COALESCE(p.gkb_melting, 0)) FROM gula_penerimaan p WHERE p.tanggal = gs.tanggal) gkb_production,
               (SELECT SUM(COALESCE(d.delivery_gkm, 0)) FROM gula_delivery d WHERE d.tanggal = gs.tanggal) gkm_delivery,
               (SELECT SUM(COALESCE(d.delivery_gkb, 0)) FROM gula_delivery d WHERE d.tanggal = gs.tanggal) gkb_delivery,
               COALESCE((SELECT SUM(COALESCE(r.jumlah_ton, 0)) FROM gula_reject_log r WHERE r.tanggal = gs.tanggal
                 AND UPPER(TRIM(r.kategori_transaksi)) = 'DELIVERY'
                 AND UPPER(TRIM(r.jenis_reject)) IN ('SUSUT LOADING', 'DOWNGRADE TO REJECT')
                 AND UPPER(TRIM(r.jenis_gula)) = 'GKM'), 0) gkm_repack,
               COALESCE((SELECT SUM(COALESCE(r.jumlah_ton, 0)) FROM gula_reject_log r WHERE r.tanggal = gs.tanggal
                 AND UPPER(TRIM(r.kategori_transaksi)) = 'DELIVERY'
                 AND UPPER(TRIM(r.jenis_reject)) IN ('SUSUT LOADING', 'DOWNGRADE TO REJECT')
                 AND UPPER(TRIM(r.jenis_gula)) = 'GKB'), 0) gkb_repack,
               COALESCE((SELECT SUM(COALESCE(u.upgrade_gkm, 0)) FROM gula_upgrade_log u WHERE u.tanggal = gs.tanggal), 0) gkm_upgrade,
               COALESCE((SELECT SUM(COALESCE(u.upgrade_gkb, 0)) FROM gula_upgrade_log u WHERE u.tanggal = gs.tanggal), 0) gkb_upgrade,
               (SELECT SUM(COALESCE(r.jumlah_ton, 0)) FROM gula_reject_log r WHERE r.tanggal = gs.tanggal
                 AND UPPER(TRIM(r.kategori_transaksi)) = 'RECEIVED') received_reject
        FROM gula_stok gs WHERE gs.tanggal BETWEEN %s AND %s ORDER BY gs.tanggal
    """, (date_from, date_to))) or []
    result = []
    for row in rows:
        products = {}
        for product in ('gkm', 'gkb'):
            # ponytail: repack = susut loading + downgrade (stok yang jadi reject).
            # Reject RECEIVED tidak pernah masuk good stock, jadi hanya informasi.
            products[product] = _audit_sugar_entry(
                row.get(f'{product}_opening'), row.get(f'{product}_production'),
                row.get(f'{product}_delivery'), row.get(f'{product}_repack'),
                row.get(f'{product}_actual'),
                row.get(f'{product}_upgrade')
            )
        products['gkp'] = _audit_sugar_entry(
            _audit_sum(row.get('gkm_opening'), row.get('gkb_opening')),
            _audit_sum(row.get('gkm_production'), row.get('gkb_production')),
            _audit_sum(row.get('gkm_delivery'), row.get('gkb_delivery')),
            _audit_sum(row.get('gkm_repack'), row.get('gkb_repack')),
            _audit_sum(row.get('gkm_actual'), row.get('gkb_actual')),
            _audit_sum(row.get('gkm_upgrade'), row.get('gkb_upgrade'))
        )
        result.append({
            'tanggal': str(row['tanggal']),
            'received_reject': row.get('received_reject'),
            **products
        })
    return result


def _audit_sugar_entry(opening, production, delivery, repack, actual, upgrade=0):
    # ponytail: repack NULL = tidak ada transaksi susut/downgrade hari itu, jadi
    # diperlakukan nol. Opening/production/delivery tetap wajib ada.
    # Upgrade reject menjadi produk menambah good stock dan mengurangi reject stock.
    repack_value = float(repack or 0)
    upgrade_value = float(upgrade or 0)
    calculated = (opening + production - delivery - repack_value + upgrade_value
                  if None not in (opening, production, delivery) else None)
    return {
        'opening': opening,
        'production': production,
        'delivery': delivery,
        'repack': repack_value,
        'upgrade': upgrade_value,
        'remelt': None,
        'calculated_closing': calculated,
        'actual_closing': actual,
        'difference': calculated - actual if calculated is not None and actual is not None else None,
        'status': _audit_status(opening, production, delivery, 0, calculated, actual)
    }


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

    # Molasses Stock (kg di DB â†’ ton)
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

    previous_gula_stok = {}
    if gula_stok:
        previous_gula_stok = dec(query("""
            SELECT stok_akhir_gkm, stok_akhir_gkb
            FROM gula_stok
            WHERE tanggal < %s
            ORDER BY tanggal DESC
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

    # RECEIVED reject never enters good production. DELIVERY reject (loading
    # loss/downgrade) reduces good stock and is shown separately in the audit.
    reject_today_raw = query("""
        SELECT
            SUM(CASE WHEN UPPER(TRIM(kategori_transaksi)) = 'RECEIVED' THEN COALESCE(jumlah_ton,0) ELSE 0 END) as received_reject,
            SUM(CASE WHEN UPPER(TRIM(kategori_transaksi)) = 'DELIVERY' THEN COALESCE(jumlah_ton,0) ELSE 0 END) as delivery_reject,
            SUM(COALESCE(jumlah_ton,0)) as total_reject
        FROM gula_reject_log
        WHERE tanggal = %s
    """, (report_date,), one=True)
    reject_today = dec(reject_today_raw) if reject_today_raw is not None else None
    upgrade_today_raw = query("""
        SELECT
            SUM(COALESCE(upgrade_gkm, 0)) as upgrade_gkm,
            SUM(COALESCE(upgrade_gkb, 0)) as upgrade_gkb,
            SUM(COALESCE(upgrade_gkm, 0) + COALESCE(upgrade_gkb, 0)) as total_upgrade
        FROM gula_upgrade_log
        WHERE tanggal = %s
    """, (report_date,), one=True)
    upgrade_today = dec(upgrade_today_raw) if upgrade_today_raw is not None else None

    opening_gkm = _num(gula_stok, 'stok_awal_gkm')
    opening_gkb = _num(gula_stok, 'stok_awal_gkb')
    gkm = _num(gula_stok, 'stok_akhir_gkm')
    gkb = _num(gula_stok, 'stok_akhir_gkb')
    reject_stock = _num(gula_stok, 'stok_akhir_reject')
    # Good stock excludes reject: reject has already been deducted from the
    # calculated good-stock balance and is reported separately as physical stock.
    good_stock = gkm + gkb
    total_stock = good_stock + reject_stock

    in_gkm = _num(gula_in, 'in_gkm')
    in_gkb = _num(gula_in, 'in_gkb')
    delivery_gkm = _num(gula_delivery, 'delivery_gkm')
    delivery_gkb = _num(gula_delivery, 'delivery_gkb')
    plan_delivery = _num(gula_delivery, 'plan_delivery')
    actual_delivery = _num(gula_delivery, 'actual_delivery')
    delivery_gap = actual_delivery - plan_delivery

    reject_deduction = _num(reject_today, 'delivery_reject')
    received_reject = _num(reject_today, 'received_reject')
    delivery_reject = reject_deduction
    upgrade_gkm = _num(upgrade_today, 'upgrade_gkm')
    upgrade_gkb = _num(upgrade_today, 'upgrade_gkb')
    upgrade = _num(upgrade_today, 'total_upgrade')
    remelt_raw = query("""
        SELECT SUM(COALESCE(jumlah_ton,0)) as remelt_out
        FROM gula_remelt_log
        WHERE tanggal = %s
    """, (report_date,), one=True)
    remelt_row = dec(remelt_raw) if remelt_raw is not None else None
    remelt = _num(remelt_row, 'remelt_out')
    # The imported opening field contains total physical stock (good + reject),
    # so derive opening good stock from the latest prior closing GKM + GKB.
    # Keep the stored opening fields only as a fallback for the first available day.
    if previous_gula_stok:
        opening_good_stock = (
            _num(previous_gula_stok, 'stok_akhir_gkm')
            + _num(previous_gula_stok, 'stok_akhir_gkb')
        )
    else:
        opening_good_stock = opening_gkm + opening_gkb
    calculated_good_stock = (opening_good_stock + in_gkm + in_gkb - delivery_gkm - delivery_gkb - reject_deduction + upgrade - remelt)
    balance_difference = calculated_good_stock - good_stock
    balance_status = 'balanced' if abs(balance_difference) <= tolerance else 'mismatch'

    gula_capacity = _num(settings, 'gula_capacity', 0)
    utilization_percent = (total_stock / gula_capacity * 100) if gula_capacity > 0 else 0

    # Canonical stock-position source: same location snapshot used by Detail
    # Harian, so Overview and Detail cannot silently disagree.
    lokasi_rows = dec(query("""
        SELECT l.id, l.code, l.name, l.site_type, COALESCE(l.capacity_ton, 0) as capacity_ton,
               p.stock_date AS snapshot_date,
               COALESCE(p.total_stock_ton, 0) AS stok_akhir
        FROM mst_gula_lokasi l
        LEFT JOIN (
            SELECT gp.location_id, gp.stock_date,
                   SUM(COALESCE(gp.total_stock_ton, 0)) AS total_stock_ton
            FROM gula_position gp
            INNER JOIN (
                SELECT location_id, MAX(stock_date) AS stock_date
                FROM gula_position
                WHERE stock_date <= %s
                GROUP BY location_id
            ) latest ON latest.location_id = gp.location_id
                    AND latest.stock_date = gp.stock_date
            GROUP BY gp.location_id, gp.stock_date
        ) p ON p.location_id = l.id
        WHERE l.active = 1
        ORDER BY l.sort_order ASC
    """, (report_date,))) or []
    stock_position, position_checks = _build_stock_position_summary(
        total_stock, lokasi_rows, report_date, tolerance
    )
    out_site = stock_position.get('outSite', 0)
    in_site = stock_position.get('inSite', 0)
    total_position = stock_position.get('mappedTotal', 0)
    position_difference = stock_position.get('difference')
    position_status = stock_position.get('status', 'missing_input')

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
    # Excel/DB stores Molasses delivery in kg; dashboard displays Ton.
    mol_plan = _num(mol_delivery, 'plan_delivery') / 1000
    mol_actual = (_num(mol_delivery, 'actual_tank_a') + _num(mol_delivery, 'actual_tank_b')) / 1000
    mol_gap = mol_actual - mol_plan

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

    previous_reject_row = dec(query("""
        SELECT stok_akhir_reject
        FROM gula_stok
        WHERE tanggal < %s
        ORDER BY tanggal DESC
        LIMIT 1
    """, (report_date,), one=True))
    reject_opening = _num(previous_reject_row, 'stok_akhir_reject') if previous_reject_row else None
    reject_actual = reject_stock if gula_stok else None
    reject_calculated = (
        reject_opening + received_reject + delivery_reject - upgrade - remelt
        if reject_opening is not None and reject_today is not None and upgrade_today is not None and remelt_row is not None
        else None
    )
    reject_difference = (
        reject_calculated - reject_actual
        if reject_calculated is not None and reject_actual is not None else None
    )
    if reject_calculated is None or reject_actual is None:
        reject_status = 'missing_input'
        if reject_calculated is None:
            reject_message = 'Opening reject atau sumber reject/remelt belum tersedia.'
        else:
            reject_message = 'Saldo reject closing pada gula_stok belum tersedia untuk tanggal laporan.'
    elif abs(reject_difference) <= tolerance:
        reject_status = 'ok'
        reject_message = (
            'Tidak ada transaksi reject/remelt hari ini; saldo reject tetap.'
            if received_reject == 0 and delivery_reject == 0 and upgrade == 0 and remelt == 0
            else 'Reject opening + movement sesuai dengan reject closing.'
        )
    else:
        reject_status = 'mismatch'
        reject_message = 'Reject calculated berbeda dari reject closing.'

    normalized_position_status = {
        'balanced': 'ok',
        'mismatch': 'mismatch',
        'stale': 'warning',
        'missing_input': 'warning'
    }.get(stock_position.get('status'), 'warning')
    normalized_position_checks = []
    for check in position_checks:
        item = dict(check)
        item['status'] = normalized_position_status if check.get('code') == 'LOCATION_ALLOCATION' else (
            'ok' if check.get('status') == 'balanced' else 'warning'
        )
        normalized_position_checks.append(item)
    validation = [
        {
            'code': 'BALANCE_EQUATION',
            'label': 'Balance Equation',
            'status': 'ok' if balance_status == 'balanced' else 'mismatch',
            'message': 'Calculated stock matches actual good stock.' if balance_status == 'balanced' else 'Calculated stock does not match actual good stock.'
        },
        *normalized_position_checks,
        {
            'code': 'DELIVERY',
            'label': 'Delivery Plan vs Actual',
            'status': 'warning' if delivery_gap < 0 else 'ok',
            'message': 'Actual delivery is below plan.' if delivery_gap < 0 else 'Delivery actual meets or exceeds plan.'
        },
        {
            'code': 'REJECT_BALANCE',
            'label': 'Reject Balance',
            'status': reject_status,
            'message': reject_message
        },
        {
            'code': 'CAPACITY',
            'label': 'Capacity Alert',
            'status': 'warning' if utilization_percent > 85 else 'ok',
            'message': 'Warehouse utilization is above 85%.' if utilization_percent > 85 else 'Warehouse utilization is normal.'
        },
        {
            'code': 'MISSING_INPUT',
            'label': 'Data Source Availability',
            'status': 'warning' if not gula_stok or not gula_delivery or reject_today is None or upgrade_today is None or remelt_row is None else 'ok',
            'message': 'Required source table/stock row is missing for selected date.' if not gula_stok or not gula_delivery or reject_today is None or upgrade_today is None or remelt_row is None else 'Required source data is available.'
        }
    ]

    report_balance_status = 'balanced' if balance_status == 'balanced' else 'mismatch'
    operational_status = _overview_status_from_checks(validation)
    position_ui_status = {
        'balanced': 'valid',
        'mismatch': 'mismatch',
        'stale': 'warning',
        'missing_input': 'warning'
    }.get(stock_position.get('status'), 'warning')

    # Metadata timestamp: when source rows for this report date were last
    # written, separate from the API query time shown as last_update.
    source_meta = dec(query("""
        SELECT GREATEST(
            COALESCE((SELECT MAX(updated_at) FROM gula_stok WHERE tanggal = %s), '1000-01-01'),
            COALESCE((SELECT MAX(created_at) FROM gula_penerimaan WHERE tanggal = %s), '1000-01-01'),
            COALESCE((SELECT MAX(created_at) FROM gula_delivery WHERE tanggal = %s), '1000-01-01'),
            COALESCE((SELECT MAX(created_at) FROM gula_reject_log WHERE tanggal = %s), '1000-01-01'),
            COALESCE((SELECT MAX(created_at) FROM gula_upgrade_log WHERE tanggal = %s), '1000-01-01'),
            COALESCE((SELECT MAX(updated_at) FROM mol_stok_tangki WHERE tanggal = %s), '1000-01-01'),
            COALESCE((SELECT MAX(created_at) FROM mol_delivery WHERE tanggal = %s), '1000-01-01'),
            COALESCE((SELECT MAX(updated_at) FROM gula_position WHERE stock_date <= %s), '1000-01-01')
        ) AS data_updated_at
    """, (report_date, report_date, report_date, report_date, report_date,
            report_date, report_date, report_date), one=True)) or {}
    data_updated_at = _date_to_str(source_meta.get('data_updated_at'))
    if not data_updated_at or data_updated_at.startswith('1000-01-01'):
        data_updated_at = None

    return {
        'date': report_date,
        'report': {
            'status': 'draft',
            'balance_status': report_balance_status,
            'operational_status': operational_status,
            'last_update': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'data_updated_at': data_updated_at,
            'source': 'MySQL DB',
            'unit_note': 'Gula: ton; Molasses delivery Excel/DB: kg dikonversi ke ton untuk dashboard.'
        },
        'sugar': {
            'kpi': {
                'total_stock': total_stock,
                'good_stock': good_stock,
                'gkm': gkm,
                'gkb': gkb,
                'reject': reject_stock,
                'delivery_gap': delivery_gap,
                'utilization_percent': utilization_percent,
                'received_reject': received_reject,
                'delivery_reject': delivery_reject,
                'upgrade_gkm': upgrade_gkm,
                'upgrade_gkb': upgrade_gkb
            },
            'balance': {
                'opening_good_stock': opening_good_stock,
                'in_gkm': in_gkm,
                'in_gkb': in_gkb,
                'delivery_gkm': delivery_gkm,
                'delivery_gkb': delivery_gkb,
                'reject_deduction': reject_deduction,
                'received_reject': received_reject,
                'delivery_reject': delivery_reject,
                'upgrade': upgrade,
                'upgrade_gkm': upgrade_gkm,
                'upgrade_gkb': upgrade_gkb,
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
                'status': position_ui_status,
                'canonical_status': stock_position.get('status'),
                'snapshot_date': report_date,
                'locations': stock_position.get('locations', [])
            },
            'reject_balance': {
                'opening': reject_opening,
                'received': received_reject,
                'delivery': delivery_reject,
                'upgrade': upgrade,
                'remelt': remelt,
                'calculated': reject_calculated,
                'actual': reject_actual,
                'difference': reject_difference,
                'status': reject_status
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
            'delivery_plan': mol_plan,
            'delivery_actual': mol_actual,
            'delivery_gap': mol_gap,
            'unit': 'ton',
            'source_unit': 'kg',
            'status': 'ok'
        },
        'cane': {
            **cane,
            'raw_sugar_source': 0
        }
    }

def get_stok_harian(start_date=None, end_date=None):
    start_date = _valid_date_str(start_date)
    end_date = _valid_date_str(end_date)
    sql = """
        SELECT tanggal,
               COALESCE(stok_akhir_gkm, 0) as gkm,
               COALESCE(stok_akhir_gkb, 0) as gkb,
               COALESCE(stok_akhir_reject, 0) as reject,
               COALESCE(stok_akhir_gkm, 0) + COALESCE(stok_akhir_gkb, 0) + COALESCE(stok_akhir_reject, 0) as total_stok
        FROM gula_stok
        WHERE (%s IS NULL OR tanggal >= %s)
          AND (%s IS NULL OR tanggal <= %s)
        ORDER BY tanggal ASC
    """
    return dec(query(sql, (start_date, start_date, end_date, end_date))) or []

def get_delivery_harian(start_date=None, end_date=None):
    start_date = _valid_date_str(start_date)
    end_date = _valid_date_str(end_date)
    if start_date and end_date and start_date > end_date:
        return []
    sql = """
        SELECT t.tanggal,
               CASE WHEN gd.plan_delivery <> 0 THEN gd.plan_delivery
                    ELSE gd.plan_delivery_gkm + gd.plan_delivery_gkb END as plan,
               CASE WHEN gd.actual_delivery <> 0 THEN gd.actual_delivery
                    ELSE gd.delivery_gkm + gd.delivery_gkb END as actual,
               gd.plan_delivery_gkm as plan_gkm,
               gd.plan_delivery_gkb as plan_gkb,
               gd.delivery_gkm as actual_gkm,
               gd.delivery_gkb as actual_gkb,
               md.plan_delivery/1000 as mol_plan,
               (md.actual_tank_a + md.actual_tank_b)/1000 as mol_actual
        FROM (
            SELECT tanggal FROM gula_delivery
            WHERE (%s IS NULL OR tanggal >= %s) AND (%s IS NULL OR tanggal <= %s)
            UNION
            SELECT tanggal FROM mol_delivery
            WHERE (%s IS NULL OR tanggal >= %s) AND (%s IS NULL OR tanggal <= %s)
        ) t
        LEFT JOIN (
            SELECT tanggal,
                   SUM(COALESCE(plan_delivery,0)) as plan_delivery,
                   SUM(COALESCE(plan_delivery_gkm,0)) as plan_delivery_gkm,
                   SUM(COALESCE(plan_delivery_gkb,0)) as plan_delivery_gkb,
                   SUM(COALESCE(actual_delivery,0)) as actual_delivery,
                   SUM(COALESCE(delivery_gkm,0)) as delivery_gkm,
                   SUM(COALESCE(delivery_gkb,0)) as delivery_gkb
            FROM gula_delivery GROUP BY tanggal
        ) gd ON gd.tanggal = t.tanggal
        LEFT JOIN (
            SELECT tanggal,
                   SUM(COALESCE(plan_delivery,0)) as plan_delivery,
                   SUM(COALESCE(actual_tank_a,0)) as actual_tank_a,
                   SUM(COALESCE(actual_tank_b,0)) as actual_tank_b
            FROM mol_delivery GROUP BY tanggal
        ) md ON md.tanggal = t.tanggal
        ORDER BY t.tanggal ASC
    """
    return dec(query(sql, (
        start_date, start_date, end_date, end_date,
        start_date, start_date, end_date, end_date
    ))) or []

def get_molasses_harian(end_date=None, days=90, start_date=None):
    from datetime import datetime, timedelta
    end_date = _valid_date_str(end_date) or datetime.now().strftime('%Y-%m-%d')
    start_date = _valid_date_str(start_date)
    days = max(1, min(int(days), 366))
    sql = """
        SELECT tanggal,
               COALESCE(stok_akhir_tanka, 0)/1000 as tank_a,
               COALESCE(stok_akhir_tankb, 0)/1000 as tank_b,
               COALESCE(suhu_tanka, 0) as suhu_tanka,
               COALESCE(suhu_tankb, 0) as suhu_tankb
        FROM mol_stok_tangki
        WHERE tanggal BETWEEN %s AND %s
        ORDER BY tanggal ASC
    """
    if not start_date:
        start_date = (datetime.strptime(end_date, '%Y-%m-%d') - timedelta(days=days - 1)).strftime('%Y-%m-%d')
    if start_date > end_date:
        return []
    return dec(query(sql, (start_date, end_date))) or []

def get_lokasi_stok(start_date=None, end_date=None):
    start_date = _valid_date_str(start_date)
    end_date = _valid_date_str(end_date)
    if start_date and end_date and start_date > end_date:
        return []
    sql = """
        SELECT p.stock_date as tanggal,
               l.name as nama_gudang,
               l.site_type,
               COALESCE(p.total_stock_ton, 0) as stok_akhir
        FROM gula_position p
        JOIN mst_gula_lokasi l ON l.id = p.location_id
        WHERE l.active = 1
          AND (%s IS NULL OR p.stock_date >= %s)
          AND (%s IS NULL OR p.stock_date <= %s)
        ORDER BY p.stock_date ASC, l.sort_order ASC
    """
    return dec(query(sql, (
        start_date, start_date, end_date, end_date
    ))) or []

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

    # Reject received from production. Delivery reject (susut loading / downgrade)
    # is a good-stock deduction, so it must not be shown as production reject.
    g_reject = dec(query("""
        SELECT shift, SUM(COALESCE(jumlah_ton, 0)) AS total_reject
        FROM gula_reject_log
        WHERE tanggal = %s
          AND UPPER(TRIM(kategori_transaksi)) = 'RECEIVED'
        GROUP BY shift
    """, (date_str,))) or []
    for r in g_reject:
        s = str(r.get('shift'))
        if s in ['1','2','3']:
            gula_detail[s]['reject'] = float(r.get('total_reject', 0) or 0)

    # Latest per-location snapshot as of the selected report date. Keep the
    # snapshot date so stale carry-forward values are visible to validation/UI.
    lokasi_rows = dec(query("""
        SELECT l.id, l.code, l.name, l.site_type, COALESCE(l.capacity_ton, 0) as capacity_ton,
               p.stock_date AS snapshot_date,
               COALESCE(p.total_stock_ton, 0) AS stok_akhir
        FROM mst_gula_lokasi l
        LEFT JOIN (
            SELECT gp.location_id, gp.stock_date,
                   SUM(COALESCE(gp.total_stock_ton, 0)) AS total_stock_ton
            FROM gula_position gp
            INNER JOIN (
                SELECT location_id, MAX(stock_date) AS stock_date
                FROM gula_position
                WHERE stock_date <= %s
                GROUP BY location_id
            ) latest ON latest.location_id = gp.location_id
                    AND latest.stock_date = gp.stock_date
            GROUP BY gp.location_id, gp.stock_date
        ) p ON p.location_id = l.id
        WHERE l.active = 1
        ORDER BY l.sort_order ASC
    """, (date_str,))) or []
    # Gula Delivery
    gula_del = query("""
        SELECT plan_delivery, actual_delivery, plan_delivery_gkm, plan_delivery_gkb, delivery_gkm, delivery_gkb
        FROM gula_delivery WHERE tanggal = %s LIMIT 1
    """, (date_str,))
    g_del = dec(gula_del[0]) if gula_del else {}

    # Gula Delivery plan besok
    gula_del_besok = query("""
        SELECT plan_delivery, plan_delivery_gkm, plan_delivery_gkb FROM gula_delivery
        WHERE tanggal = DATE_ADD(%s, INTERVAL 1 DAY) LIMIT 1
    """, (date_str,))
    g_del_bsk = dec(gula_del_besok[0]) if gula_del_besok else {}

    # Molasses Stok (kg di DB â†’ ton)
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
    cane_tebu_total = 0
    for p in m_penerimaan:
        s = str(p.get('shift'))
        if s in ['1','2','3']:
            rs = float(p.get('raw_sugar', 0) or 0)
            ct = float(p.get('cane_tebu', 0) or 0)
            mol_prod_shift[s] = rs + ct
            mol_prod_shift['total'] += mol_prod_shift[s]
            raw_sugar_total += rs
            cane_tebu_total += ct

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
    m_actual_del = (float(m_del.get('actual_tank_a',0) or 0) + float(m_del.get('actual_tank_b',0) or 0)) / 1000
    m_plan_del = float(m_del.get('plan_delivery',0) or 0) / 1000

    # Molasses delivery kumulatif (todate) untuk % diff, sejak awal giling
    m_del_cum = {'plan': 0, 'actual': 0}
    if milling_start:
        cum_res = dec(query("""
            SELECT COALESCE(SUM(plan_delivery),0) as plan,
                   COALESCE(SUM(COALESCE(actual_tank_a,0)+COALESCE(actual_tank_b,0)),0) as actual
            FROM mol_delivery WHERE tanggal BETWEEN %s AND %s
        """, (milling_start, date_str), one=True)) or {}
        m_del_cum['plan'] = float(cum_res.get('plan') or 0) / 1000
        m_del_cum['actual'] = float(cum_res.get('actual') or 0) / 1000

    # Yield molasses = produksi molasses (ton) / cane masuk hari ini (ton)
    cane_today_ton = float(cane_hari_ini or 0)
    mol_prod_total_ton = mol_prod_shift['total'] / 1000
    mol_yield = (mol_prod_total_ton / cane_today_ton * 100) if cane_today_ton > 0 else None


    # 1. Detail reject/remelt. Preserve query availability so a DB error or
    # missing source cannot become a false green 0 == 0 validation.
    detail_reject_query = query('''
        SELECT kategori_transaksi, jenis, SUM(qty) as qty
        FROM (
            SELECT CONVERT(kategori_transaksi USING utf8mb4) COLLATE utf8mb4_0900_ai_ci as kategori_transaksi,
                   CONVERT(jenis_reject USING utf8mb4) COLLATE utf8mb4_0900_ai_ci as jenis,
                   SUM(COALESCE(jumlah_ton,0)) as qty
            FROM gula_reject_log
            WHERE tanggal = %s
            GROUP BY kategori_transaksi, jenis_reject
            UNION ALL
            SELECT CONVERT('UPGRADE' USING utf8mb4) COLLATE utf8mb4_0900_ai_ci as kategori_transaksi,
                   CONVERT(jenis_reject USING utf8mb4) COLLATE utf8mb4_0900_ai_ci as jenis,
                   SUM(COALESCE(upgrade_gkm,0) + COALESCE(upgrade_gkb,0)) as qty
            FROM gula_upgrade_log
            WHERE tanggal = %s
            GROUP BY jenis_reject
        ) movements
        GROUP BY kategori_transaksi, jenis
        ORDER BY qty DESC
    ''', (date_str, date_str))
    detail_reject_res = dec(detail_reject_query) or []

    # The workbook has dedicated fields for delivery reject. Keep it separated
    # by source good-stock product so exports never mix it into production reject.
    delivery_reject_rows = dec(query('''
        SELECT UPPER(TRIM(jenis_reject)) AS jenis_reject,
               UPPER(TRIM(jenis_gula)) AS jenis_gula,
               SUM(COALESCE(jumlah_ton, 0)) AS qty
        FROM gula_reject_log
        WHERE tanggal = %s
          AND UPPER(TRIM(kategori_transaksi)) = 'DELIVERY'
        GROUP BY UPPER(TRIM(jenis_reject)), UPPER(TRIM(jenis_gula))
    ''', (date_str,))) or []
    delivery_reject = {
        'susutGkb': 0.0, 'susutGkm': 0.0,
        'downgradeGkb': 0.0, 'downgradeGkm': 0.0,
    }
    for row in delivery_reject_rows:
        reject_type = str(row.get('jenis_reject') or '').strip().upper()
        product = str(row.get('jenis_gula') or '').strip().upper()
        if product not in ('GKB', 'GKM'):
            continue
        if reject_type == 'SUSUT LOADING':
            delivery_reject[f"susut{product.title()}"] += float(row.get('qty') or 0)
        elif reject_type == 'DOWNGRADE TO REJECT':
            delivery_reject[f"downgrade{product.title()}"] += float(row.get('qty') or 0)

    detail_remelt_query = query('''
        SELECT jenis_reject as jenis, SUM(COALESCE(jumlah_ton,0)) as qty
        FROM gula_remelt_log
        WHERE tanggal = %s
        GROUP BY jenis_reject
        ORDER BY qty DESC
    ''', (date_str,))
    detail_remelt_res = dec(detail_remelt_query) or []

    # 2. Official inventory versus mapped location allocation.
    tolerance = 0.01
    inventory_stock = None if not g_stok else (
        float(g_stok.get('stok_akhir_gkm', 0) or 0)
        + float(g_stok.get('stok_akhir_gkb', 0) or 0)
        + float(g_stok.get('stok_akhir_reject', 0) or 0)
    )
    stock_position, position_checks = _build_stock_position_summary(
        inventory_stock, lokasi_rows, date_str, tolerance
    )

    # 3. Good-stock movement uses the established GKP audit equation and keeps
    # required NULL inputs as missing_input instead of coercing them to zero.
    sugar_audit_rows = get_rmi_audit_sugar(date_str, date_str)
    sugar_audit = sugar_audit_rows[0].get('gkp', {}) if sugar_audit_rows else {}
    movement_status = sugar_audit.get('status', 'missing_input')
    movement_messages = {
        'balanced': 'Opening + production - delivery - repack + upgrade matches closing good stock.',
        'mismatch': 'Calculated good stock differs from the recorded closing stock.',
        'missing_input': 'Opening, production, delivery, or closing stock is missing.'
    }
    stock_movement_check = _validation_check(
        'STOCK_MOVEMENT', 'Stock Movement Balance',
        'Calculated Good Stock', sugar_audit.get('calculated_closing'),
        'Actual Good Stock', sugar_audit.get('actual_closing'),
        tolerance=tolerance,
        status=movement_status,
        message=movement_messages.get(movement_status),
        details=[
            {'label': 'Opening', 'value': sugar_audit.get('opening')},
            {'label': 'Production', 'value': sugar_audit.get('production')},
            {'label': 'Delivery', 'value': sugar_audit.get('delivery')},
            {'label': 'Repack/Reject Deduction', 'value': sugar_audit.get('repack')},
            {'label': 'Upgrade to Product', 'value': sugar_audit.get('upgrade')}
        ]
    )

    # 4. Reject stock is a closing balance, so compare it with a movement
    # equation across the same time scope rather than with only today's log.
    previous_reject = dec(query("""
        SELECT tanggal, stok_akhir_reject
        FROM gula_stok
        WHERE tanggal < %s
        ORDER BY tanggal DESC
        LIMIT 1
    """, (date_str,), one=True))
    reject_opening = (
        float(previous_reject.get('stok_akhir_reject') or 0)
        if previous_reject and previous_reject.get('stok_akhir_reject') is not None
        else None
    )
    reject_in = (
        sum(float(row.get('qty') or 0) for row in detail_reject_res
            if str(row.get('kategori_transaksi') or '').strip().upper() in ('RECEIVED', 'DELIVERY'))
        if detail_reject_query is not None else None
    )
    upgrade_out = (
        sum(float(row.get('qty') or 0) for row in detail_reject_res
            if str(row.get('kategori_transaksi') or '').strip().upper() == 'UPGRADE')
        if detail_reject_query is not None else None
    )
    remelt_out = (
        sum(float(row.get('qty') or 0) for row in detail_remelt_res)
        if detail_remelt_query is not None else None
    )
    reject_actual = (
        float(g_stok.get('stok_akhir_reject') or 0)
        if g_stok and g_stok.get('stok_akhir_reject') is not None else None
    )
    reject_calculated = (
        reject_opening + reject_in - remelt_out - upgrade_out
        if None not in (reject_opening, reject_in, remelt_out, upgrade_out) else None
    )
    reject_check = _validation_check(
        'REJECT_BALANCE', 'Reject Balance',
        'Calculated Reject Stock', reject_calculated,
        'Actual Reject Stock', reject_actual,
        tolerance=tolerance,
        message=(
            'Previous reject + reject logged - remelt - upgrade matches closing reject stock.'
            if reject_calculated is not None and reject_actual is not None
            else 'Previous reject, reject log, remelt log, or closing reject is missing.'
        ),
        details=[
            {'label': 'Previous Reject', 'value': reject_opening},
            {'label': 'Reject Logged Today', 'value': reject_in},
            {'label': 'Upgrade to Product', 'value': upgrade_out},
            {'label': 'Remelt Out', 'value': remelt_out}
        ]
    )

    # There is currently no independent source for "sent to process". Expose
    # that limitation honestly instead of comparing the remelt log with itself.
    remelt_source_check = _validation_check(
        'REMELT_SOURCE', 'Remelt Source',
        'Independent Process Source', None,
        'Remelt Log', remelt_out,
        status='not_available',
        message='Belum ada sumber proses independen; validasi silang remelt belum tersedia.'
    )


    validation = [
        stock_movement_check,
        *position_checks,
        reject_check,
        remelt_source_check
    ]

    # Structured daily Gula flow for the report tree. Values are sourced from
    # the same product-level audit equation used by reconciliation: received
    # reject is informational, while delivery reject/repack reduces good stock.
    sugar_audit_day = sugar_audit_rows[0] if sugar_audit_rows else {}
    gkm_audit = sugar_audit_day.get('gkm', {}) or {}
    gkb_audit = sugar_audit_day.get('gkb', {}) or {}
    gkp_audit = sugar_audit_day.get('gkp', {}) or {}
    delivery_reject = (
        sum(float(row.get('qty') or 0) for row in detail_reject_res
            if str(row.get('kategori_transaksi') or '').strip().upper() == 'DELIVERY')
        if detail_reject_query is not None else None
    )
    received_reject = sugar_audit_day.get('received_reject')
    if received_reject is not None:
        received_reject = float(received_reject or 0)
    gula_flow = {
        'opening': {
            'gkm': gkm_audit.get('opening'),
            'gkb': gkb_audit.get('opening'),
            'total': gkp_audit.get('opening')
        },
        'production': {
            'gkm': gkm_audit.get('production'),
            'gkb': gkb_audit.get('production'),
            'total': gkp_audit.get('production')
        },
        'receivedReject': received_reject,
        'delivery': {
            'gkm': gkm_audit.get('delivery'),
            'gkb': gkb_audit.get('delivery'),
            'total': gkp_audit.get('delivery')
        },
        'deliveryPlan': {
            'gkm': float(g_del.get('plan_delivery_gkm', 0) or 0),
            'gkb': float(g_del.get('plan_delivery_gkb', 0) or 0),
            'total': float(g_del.get('plan_delivery', 0) or 0)
        },
        'deliveryDiff': {
            'gkm': float(g_del.get('delivery_gkm', 0) or 0) - float(g_del.get('plan_delivery_gkm', 0) or 0),
            'gkb': float(g_del.get('delivery_gkb', 0) or 0) - float(g_del.get('plan_delivery_gkb', 0) or 0),
            'total': float(g_del.get('actual_delivery', 0) or 0) - float(g_del.get('plan_delivery', 0) or 0)
        },
        'repack': {
            'gkm': gkm_audit.get('repack'),
            'gkb': gkb_audit.get('repack'),
            'total': gkp_audit.get('repack')
        },
        'upgrade': {
            'gkm': gkm_audit.get('upgrade'),
            'gkb': gkb_audit.get('upgrade'),
            'total': gkp_audit.get('upgrade')
        },
        'calculated': {
            'gkm': gkm_audit.get('calculated_closing'),
            'gkb': gkb_audit.get('calculated_closing'),
            'total': gkp_audit.get('calculated_closing')
        },
        'actual': {
            'gkm': gkm_audit.get('actual_closing'),
            'gkb': gkb_audit.get('actual_closing'),
            'total': gkp_audit.get('actual_closing')
        },
        'difference': {
            'gkm': gkm_audit.get('difference'),
            'gkb': gkb_audit.get('difference'),
            'total': gkp_audit.get('difference')
        },
        'status': gkp_audit.get('status', movement_status),
        'reject': {
            'opening': reject_opening,
            'received': received_reject,
            'delivery': delivery_reject,
            'upgrade': upgrade_out,
            'remelt': remelt_out,
            'calculated': reject_calculated,
            'actual': reject_actual,
            'difference': (reject_calculated - reject_actual
                           if reject_calculated is not None and reject_actual is not None else None),
            'status': reject_check.get('status')
        }
    }
    return {
        "tanggal": date_str,
        "validation": validation,
        "gula": {
            "openBalance": float(g_stok.get('stok_awal_gkm',0) or 0) + float(g_stok.get('stok_awal_gkb',0) or 0),
            "produksi": gula_prod_shift,
            "produksiDetail": gula_detail,
            "gulaFlow": gula_flow,
            "delivery": {
                "plan": float(g_del.get('plan_delivery', 0) or 0),
                "actual": float(g_del.get('actual_delivery', 0) or 0),
                "diff": float(g_del.get('actual_delivery', 0) or 0) - float(g_del.get('plan_delivery', 0) or 0),
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
            "deliveryReject": delivery_reject,
            "detailRemelt": detail_remelt_res,
            "stockPosition": stock_position,
            "deliveryPlanBesok": {
                "gkb": float(g_del_bsk.get('plan_delivery_gkb',0) or 0),
                "gkm": float(g_del_bsk.get('plan_delivery_gkm',0) or 0),
                "total": float(g_del_bsk.get('plan_delivery',0) or 0)
            }
        },
        "molasses": {
            "openBalance": float(m_stok.get('stok_awal_tanka',0) or 0) + float(m_stok.get('stok_awal_tankb',0) or 0),
            "openTankA": float(m_stok.get('stok_awal_tanka',0) or 0),
            "openTankB": float(m_stok.get('stok_awal_tankb',0) or 0),
            "produksi": {
                str(k): float(v) / 1000 for k, v in mol_prod_shift.items()
            },
            "rawSugarIn": raw_sugar_total / 1000,
            "caneIn": cane_tebu_total / 1000,
            "yield": mol_yield,
            "capacity": float(settings.get('molasses_capacity') or 30000),
            "delivery": {
                "schedule": m_plan_del,
                "actual": m_actual_del,
                "diff": m_actual_del - m_plan_del,
                "actTankA": float(m_del.get('actual_tank_a',0) or 0) / 1000,
                "actTankB": float(m_del.get('actual_tank_b',0) or 0) / 1000,
                "jmlTruck": int(m_del.get('jml_truck',0) or 0),
                "nextSchedule": float(m_del.get('next_schedule',0) or 0) / 1000,
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

def get_grafik_analitik(end_date_str, days=7, start_date_str=None):
    from datetime import datetime, timedelta
    end_date_str = _valid_date_str(end_date_str) or datetime.now().strftime('%Y-%m-%d')
    end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
    valid_start_date = _valid_date_str(start_date_str) if start_date_str else None
    start_date = datetime.strptime(valid_start_date, '%Y-%m-%d') if valid_start_date else end_date - timedelta(days=max(1, days)-1)
    if start_date > end_date:
        start_date = end_date
    date_from = start_date.strftime('%Y-%m-%d')
    date_to = end_date_str
    range_days = (end_date - start_date).days + 1

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

    # â”€â”€ Compute derived analytics from the raw trend rows â”€â”€
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

    # â”€â”€ Shift performance â”€â”€
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

    # â”€â”€ Insights otomatis â”€â”€
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
                    'detail': f'Shift {best_cane["shift"]} terbaik untuk cane-in. Keduanya berbeda â€” perlu investigasi.',
                })
            else:
                insights.append({
                    'type': 'shift',
                    'icon': 'fa-ranking-star',
                    'color': '#3fb950',
                    'title': f'Shift {best_gula["shift"]} unggul di semua metrik',
                    'detail': f'Cane-in {best_gula["cane"]:,.1f} MT, Gula {best_gula["gula"]:,.1f} MT',
                })

    # â”€â”€ Chart data â”€â”€
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
        "days": range_days,
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
