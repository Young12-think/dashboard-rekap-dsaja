# app_queries/transactions.py
from decimal import Decimal
from datetime import datetime
from .db_core import dec, query

def get_transaction_data(date_from, date_to, item_filters, po_filter=None, search_term=None,
                         limit=100, offset=0, tx_key='', support_item=None, support_vendor=None):
    if not item_filters and tx_key != 'support':
        return {"total_rows": 0, "summary": {}, "data": []}

    params = []

    if tx_key == 'support':
        filter_sql = "(LOWER(Type) LIKE %s OR LOWER(Type) LIKE %s OR LOWER(Type) LIKE %s)"
        params.extend(['%support operasional%', '%supporting operational%', '%support operational%'])
        if support_item:
            filter_sql += " AND ItemName LIKE %s"; params.append(support_item.strip())
        if support_vendor:
            filter_sql += " AND TRIM(CardName) = %s"; params.append(support_vendor.strip())
    else:
        like_clauses = []
        for f in item_filters:
            like_clauses.append("ItemName LIKE %s"); params.append(f'%{f}%')
        filter_sql = ' OR '.join(like_clauses)

    po_clause = ""
    if po_filter:
        po_clause = " AND REPLACE(COALESCE(NULLIF(TRIM(Nomor_PO), ''), 'KOSONG'), ',', '.') = %s"
        params.append(po_filter)

    search_clause = ""
    if search_term:
        search_clause = " AND (Nopol LIKE %s OR Supir LIKE %s OR Nomor_SPMSPB LIKE %s OR Nomor_SPTA LIKE %s OR Nomor_SPT LIKE %s OR CardName LIKE %s OR ItemName LIKE %s OR REPLACE(Nomor_PO, ',', '.') LIKE %s)"
        st = f"%{search_term}%"
        params.extend([st, st, st, st, st, st, st, st])

    if po_filter:
        date_clause = "1=1"
        final_params = tuple(params)
    else:
        date_clause = "STR_TO_DATE(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1), '%d/%m/%Y') BETWEEN %s AND %s"
        final_params = tuple([date_from, date_to] + params)

    sql = f"""
        SELECT * FROM data_timbang
        WHERE {date_clause}
          AND ({filter_sql}) {po_clause} {search_clause}
        ORDER BY STR_TO_DATE(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1), '%d/%m/%Y') ASC, Jam_Keluar ASC
    """
    all_data = dec(query(sql, final_params)) or []

    total_netto = 0; total_spm = 0; unique_spt = set()
    truck_visits = []; tebu_visits = set(); unique_tickets = set()
    is_gula = (tx_key == 'gula'); is_tebu = (tx_key == 'tebu'); is_molasses = (tx_key == 'molasses')

    def parse_angka(val):
        if not val: return 0
        if isinstance(val, (int, float, Decimal)): return abs(float(val))
        s = str(val).strip()
        if '.' in s and len(s.split('.')[-1]) == 3: s = s.replace('.', '')
        s = s.replace(',', '.')
        try: return abs(float(s))
        except: return 0

    def normalize_str(s): return str(s).lower().replace(" ", "") if s else ""

    def parse_time(tgl, jam):
        if not jam: return 0
        try:
            dp = tgl.split(' ')[0]
            if '/' in dp:
                p = dp.split('/')
                if len(p)==3: dp = f"{p[2]}-{p[1]}-{p[0]}"
            dt = datetime.strptime(f"{dp} {jam}", "%Y-%m-%d %H:%M:%S")
            return dt.timestamp() * 1000
        except: return 0

    for r in all_data:
        netto = parse_angka(r.get('Qty_Netto')); spm = parse_angka(r.get('Qty_SPMSPB'))
        total_spm += spm
        spt = r.get('Nomor_SPT') or r.get('Nomor_SPMSPB') or r.get('Nomor_SPPB') or r.get('Nomor_SPTA')
        if spt and str(spt).strip() not in ('', '-'): unique_spt.add(str(spt).strip())
        if is_gula or is_molasses:
            remarks = str(r.get('Remarks') or '').lower()
            is_tambahan = is_molasses and 'tambahan' in remarks
            if not is_tambahan:
                nopol = normalize_str(r.get('Nopol')); supir = normalize_str(r.get('Supir'))
                vk = f"{nopol}_{supir}"
                tms = parse_time(r.get('Tanggal_Keluar'), r.get('Jam_Keluar'))
                is_dup = False
                if tms > 0 and nopol:
                    for v in truck_visits:
                        if v['key'] == vk and abs(v['time'] - tms) <= 1800000: is_dup = True; break
                if not is_dup:
                    total_netto += netto
                    truck_visits.append({'key': vk if nopol else f"kosong_{len(truck_visits)}", 'time': tms})
        elif is_tebu:
            total_netto += netto
            spta = normalize_str(r.get('Nomor_SPTA') or r.get('Nomor_SPMSPB'))
            if spta: tebu_visits.add(spta)
            else: tebu_visits.add(f"kosong_{normalize_str(r.get('Nopol'))}_{r.get('Jam_Keluar')}")
        else:
            total_netto += netto

    if is_gula or is_molasses: total_ritase = len(truck_visits)
    elif is_tebu: total_ritase = len(tebu_visits) if tebu_visits else len(all_data)
    else: total_ritase = len(unique_tickets) if unique_tickets else len(all_data)

    total_rows = len(all_data)
    paginated_data = all_data[offset: offset + limit]
    normalized = []
    for row in paginated_data:
        nr = {}
        for k, v in row.items():
            key = k.lower()
            if v is not None and hasattr(v, 'isoformat'): nr[key] = str(v)
            else: nr[key] = v
        normalized.append(nr)

    return {
        "total_rows": total_rows,
        "summary": {"total_netto": total_netto, "total_ritase": total_ritase, "total_qty_spm": total_spm, "total_spt": len(unique_spt)},
        "data": normalized
    }


def get_support_items():
    sql = """
        SELECT DISTINCT TRIM(ItemName) AS ItemName FROM data_timbang
        WHERE (LOWER(Type) LIKE %s OR LOWER(Type) LIKE %s OR LOWER(Type) LIKE %s)
          AND ItemName IS NOT NULL AND TRIM(ItemName) != ''
        ORDER BY TRIM(ItemName) ASC
    """
    params = ['%support operasional%', '%supporting operational%', '%support operational%']
    data = query(sql, tuple(params))
    if not data: return []
    seen = set(); result = []
    for r in data:
        name = r['ItemName'].strip(); key = ' '.join(name.upper().split())
        if key not in seen: seen.add(key); result.append(name)
    return result


def get_support_vendors(item_filter=None, date_from=None, date_to=None):
    params = ['%support operasional%', '%supporting operational%', '%support operational%']
    date_clause = ""
    if date_from and date_to:
        date_clause = "AND STR_TO_DATE(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1), '%d/%m/%Y') BETWEEN %s AND %s"
        params.extend([date_from, date_to])
    item_clause = ""
    if item_filter:
        item_clause = "AND TRIM(ItemName) = %s"; params.append(item_filter.strip())
    sql = f"""
        SELECT DISTINCT TRIM(CardName) AS CardName FROM data_timbang
        WHERE (LOWER(Type) LIKE %s OR LOWER(Type) LIKE %s OR LOWER(Type) LIKE %s)
          AND CardName IS NOT NULL AND TRIM(CardName) != ''
          {date_clause} {item_clause}
        ORDER BY TRIM(CardName) ASC
    """
    data = query(sql, tuple(params))
    if not data: return []
    seen = set(); result = []
    for r in data:
        name = r['CardName'].strip(); key = ' '.join(name.upper().split())
        if key not in seen: seen.add(key); result.append(name)
    return result
