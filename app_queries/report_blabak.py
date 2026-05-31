# app_queries/report_blabak.py
# ─────────────────────────────────────────────────────────────
# BLABAK — Weightbridge Daily Report
# Query data komoditas per shift + Cane Received + Truck Types
# ─────────────────────────────────────────────────────────────

from .db_core import dec, query


def get_blabak_report(date_str, rekap_from=None):
    """
    Menghasilkan data untuk Weightbridge Daily Report (BLABAK).

    Bagian 1: Komoditas (SUGAR, MOLLASE, BAGGASE, FILTER CAKE, FLYASH)
              → netto + ritase per shift (1, 2, 3) + today

    Bagian 2: Cane Received
              → ritase truck + netto per shift + todate

    Bagian 3: Truck Types
              → PICK UP/L300, ENGKEL, FUSO/TRONTON per today + todate
    """
    try:
        result = {
            'commodities': {},
            'cane': None,
            'trucks': None,
        }

        # ═══════════════════════════════════════════════════
        # BAGIAN 1: KOMODITAS per Shift
        # ═══════════════════════════════════════════════════
        commodity_defs = [
            {
                'key': 'SUGAR',
                'where': """(
                    (UPPER(t.ItemName) LIKE '%SUGAR%' OR UPPER(t.ItemName) LIKE '%GULA%')
                    AND UPPER(COALESCE(t.Type, '')) = 'FINISHED GOODS LOCO'
                )""",
            },
            {
                'key': 'MOLLASE',
                'where': """(
                    UPPER(t.ItemName) LIKE '%MOLASSE%' OR UPPER(t.ItemName) LIKE '%TETES%'
                )""",
            },
            {
                'key': 'BAGGASE',
                'where': """(
                    UPPER(t.ItemName) LIKE '%BAGASSE%' OR UPPER(t.ItemName) LIKE '%AMPAS%'
                )""",
            },
            {
                'key': 'FILTER CAKE',
                'where': """(
                    UPPER(t.ItemName) LIKE '%FILTER CAKE%' OR UPPER(t.ItemName) LIKE '%BLOTONG%'
                )""",
            },
            {
                'key': 'FLYASH',
                'where': """(
                    UPPER(t.ItemName) LIKE '%FLY ASH%' OR UPPER(t.ItemName) LIKE '%FLYASH%'
                    OR UPPER(t.ItemName) LIKE '%BOTTOM ASH%'
                )""",
            },
        ]

        for cdef in commodity_defs:
            sql = f"""
                SELECT
                    t.Shift                        AS shift,
                    SUM(ABS(COALESCE(t.Qty_Netto, 0)))  AS netto,
                    COUNT(DISTINCT t.NoSystem)      AS ritase
                FROM data_timbang t
                WHERE t.Tanggal_Keluar_Clean = %s
                AND {cdef['where']}
                GROUP BY t.Shift
            """
            rows = dec(query(sql, (date_str,))) or []

            def empty():
                return {'netto': 0, 'ritase': 0}

            shifts = {1: empty(), 2: empty(), 3: empty()}
            today = empty()

            for r in rows:
                s = int(r.get('shift') or 0)
                netto = float(r.get('netto', 0) or 0)
                ritase = int(r.get('ritase', 0) or 0)
                if s in shifts:
                    shifts[s] = {'netto': netto, 'ritase': ritase}
                today['netto'] += netto
                today['ritase'] += ritase

            result['commodities'][cdef['key']] = {
                'shift1': shifts[1],
                'shift2': shifts[2],
                'shift3': shifts[3],
                'today': today,
            }

        # ═══════════════════════════════════════════════════
        # BAGIAN 2: CANE RECEIVED per Shift + TODATE
        # ═══════════════════════════════════════════════════
        sql_cane_today = """
            SELECT
                t.Shift                                             AS shift,
                COUNT(DISTINCT t.NoSystem)                         AS ritase,
                SUM(ABS(COALESCE(t.Qty_Netto, 0)))                 AS netto
            FROM data_timbang t
            WHERE t.Tanggal_Keluar_Clean = %s
              AND t.ItemName LIKE '%TEBU%'
            GROUP BY t.Shift
        """

        td_from = rekap_from if rekap_from else date_str

        sql_cane_todate = """
            SELECT
                COUNT(DISTINCT t.NoSystem)                         AS ritase,
                SUM(ABS(COALESCE(t.Qty_Netto, 0)))                 AS netto
            FROM data_timbang t
            WHERE t.Tanggal_Keluar_Clean BETWEEN %s AND %s
              AND t.ItemName LIKE '%TEBU%'
        """

        raw_cane_today  = dec(query(sql_cane_today, (date_str,))) or []
        raw_cane_todate = dec(query(sql_cane_todate, (td_from, date_str))) or []

        def empty_cane():
            return {'ritase': 0, 'netto': 0}

        cane_shifts = {1: empty_cane(), 2: empty_cane(), 3: empty_cane()}
        cane_today = empty_cane()

        for r in raw_cane_today:
            s = int(r.get('shift') or 0)
            row = {
                'ritase': int(r.get('ritase', 0) or 0),
                'netto':  float(r.get('netto', 0) or 0),
            }
            if s in cane_shifts:
                cane_shifts[s] = row
            cane_today['ritase'] += row['ritase']
            cane_today['netto']  += row['netto']

        cane_todate = empty_cane()
        if raw_cane_todate and len(raw_cane_todate) > 0:
            r = raw_cane_todate[0]
            cane_todate = {
                'ritase': int(r.get('ritase', 0) or 0),
                'netto':  float(r.get('netto', 0) or 0),
            }

        result['cane'] = {
            'shift1': cane_shifts[1],
            'shift2': cane_shifts[2],
            'shift3': cane_shifts[3],
            'today':  cane_today,
            'todate': cane_todate,
        }

        # ═══════════════════════════════════════════════════
        # BAGIAN 3: TRUCK TYPES — Today + Todate
        # ═══════════════════════════════════════════════════
        sql_truck_today = """
            SELECT
                COUNT(DISTINCT CASE
                    WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%MINI%'
                      OR UPPER(TRIM(t.Kendaraan)) LIKE '%PICKUP%'
                      OR UPPER(TRIM(t.Kendaraan)) LIKE '%L300%'
                    THEN t.NoSystem END) AS tipe_pickup,
                COUNT(DISTINCT CASE
                    WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%ENGK%'
                    THEN t.NoSystem END) AS tipe_engkel,
                COUNT(DISTINCT CASE
                    WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%FUSO%'
                      OR UPPER(TRIM(t.Kendaraan)) LIKE '%TRONTON%'
                    THEN t.NoSystem END) AS tipe_fuso,
                COUNT(DISTINCT t.NoSystem) AS total
            FROM data_timbang t
            WHERE t.Tanggal_Keluar_Clean = %s
              AND t.ItemName LIKE '%TEBU%'
        """

        sql_truck_todate = """
            SELECT
                COUNT(DISTINCT CASE
                    WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%MINI%'
                      OR UPPER(TRIM(t.Kendaraan)) LIKE '%PICKUP%'
                      OR UPPER(TRIM(t.Kendaraan)) LIKE '%L300%'
                    THEN t.NoSystem END) AS tipe_pickup,
                COUNT(DISTINCT CASE
                    WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%ENGK%'
                    THEN t.NoSystem END) AS tipe_engkel,
                COUNT(DISTINCT CASE
                    WHEN UPPER(TRIM(t.Kendaraan)) LIKE '%FUSO%'
                      OR UPPER(TRIM(t.Kendaraan)) LIKE '%TRONTON%'
                    THEN t.NoSystem END) AS tipe_fuso,
                COUNT(DISTINCT t.NoSystem) AS total
            FROM data_timbang t
            WHERE t.Tanggal_Keluar_Clean BETWEEN %s AND %s
              AND t.ItemName LIKE '%TEBU%'
        """

        raw_truck_today  = dec(query(sql_truck_today, (date_str,))) or []
        raw_truck_todate = dec(query(sql_truck_todate, (td_from, date_str))) or []

        def parse_truck(rows):
            if rows and len(rows) > 0:
                r = rows[0]
                return {
                    'pickup': int(r.get('tipe_pickup', 0) or 0),
                    'engkel': int(r.get('tipe_engkel', 0) or 0),
                    'fuso':   int(r.get('tipe_fuso', 0) or 0),
                    'total':  int(r.get('total', 0) or 0),
                }
            return {'pickup': 0, 'engkel': 0, 'fuso': 0, 'total': 0}

        result['trucks'] = {
            'today':  parse_truck(raw_truck_today),
            'todate': parse_truck(raw_truck_todate),
        }

        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[ERROR] get_blabak_report: {e}")
        return None
