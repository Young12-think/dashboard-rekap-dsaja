# app_queries/report_others.py
# ─────────────────────────────────────────────────────────────
# OTHERS — Report per ItemName (type = 'others')
# Shift 1/2/3, TODAY, TODATE
# ─────────────────────────────────────────────────────────────

from .db_core import dec, query


def get_others_report(date_str, itemname, todate_from=None):
    """
    Menghasilkan data report untuk item tertentu dari kategori 'others'.

    Return:
    {
      'itemname': 'NAMA ITEM',
      'shift1': { 'rit': N, 'kg': N },
      'shift2': { 'rit': N, 'kg': N },
      'shift3': { 'rit': N, 'kg': N },
      'today':  { 'rit': N, 'kg': N },
      'todate': { 'rit': N, 'kg': N },
    }
    """
    try:
        if not itemname:
            return None

        # ═══════════════════════════════════════════════════
        # TODAY: Per-shift breakdown
        # ═══════════════════════════════════════════════════
        sql_today = """
            SELECT
                t.Shift                              AS shift,
                COUNT(DISTINCT t.NoSystem)            AS rit,
                SUM(ABS(COALESCE(t.Qty_Netto, 0)))   AS kg
            FROM data_timbang t
            WHERE t.Tanggal_Keluar_Clean = %s
              AND LOWER(COALESCE(t.Type, '')) = 'others'
              AND TRIM(t.ItemName) = %s
            GROUP BY t.Shift
        """
        rows_today = dec(query(sql_today, (date_str, itemname.strip()))) or []

        def empty():
            return {'rit': 0, 'kg': 0}

        shifts = {1: empty(), 2: empty(), 3: empty()}
        today = empty()

        for r in rows_today:
            s = int(r.get('shift') or 0)
            rit = int(r.get('rit', 0) or 0)
            kg = float(r.get('kg', 0) or 0)
            if s in shifts:
                shifts[s] = {'rit': rit, 'kg': kg}
            today['rit'] += rit
            today['kg'] += kg

        # ═══════════════════════════════════════════════════
        # TODATE: Dari tanggal awal sampai tanggal laporan
        # ═══════════════════════════════════════════════════
        td_from = todate_from if todate_from else date_str

        sql_todate = """
            SELECT
                COUNT(DISTINCT t.NoSystem)            AS rit,
                SUM(ABS(COALESCE(t.Qty_Netto, 0)))   AS kg
            FROM data_timbang t
            WHERE t.Tanggal_Keluar_Clean BETWEEN %s AND %s
              AND LOWER(COALESCE(t.Type, '')) = 'others'
              AND TRIM(t.ItemName) = %s
        """
        rows_todate = dec(query(sql_todate, (td_from, date_str, itemname.strip()))) or []

        todate = empty()
        if rows_todate and len(rows_todate) > 0:
            r = rows_todate[0]
            todate = {
                'rit': int(r.get('rit', 0) or 0),
                'kg': float(r.get('kg', 0) or 0),
            }

        return {
            'itemname': itemname.strip(),
            'shift1': shifts[1],
            'shift2': shifts[2],
            'shift3': shifts[3],
            'today': today,
            'todate': todate,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[ERROR] get_others_report: {e}")
        return None
