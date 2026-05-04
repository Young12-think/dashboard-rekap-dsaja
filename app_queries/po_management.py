# app_queries/po_management.py
from .db_core import dec, query, get_db

def ensure_po_stock_table():
    conn = get_db()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS po_stock (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nomor_po VARCHAR(100) NOT NULL,
                qty_po DECIMAL(14,2) DEFAULT 0,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_po (nomor_po)
            ) ENGINE=InnoDB
        """)
        conn.commit()
        try:
            cur.execute("ALTER TABLE po_stock ADD COLUMN is_active TINYINT(1) DEFAULT 1")
            conn.commit()
        except:
            pass
        cur.close()
        return True
    except Exception as e:
        print(f"[DB ERROR] ensure_po_stock_table: {e}")
        return False
    finally:
        conn.close()

def get_po_stocks():
    ensure_po_stock_table()
    rows = query("SELECT nomor_po, qty_po FROM po_stock WHERE is_active = 1") or []
    return {r['nomor_po']: float(r['qty_po']) for r in rows}

def save_po_stock(nomor_po, qty_po):
    ensure_po_stock_table()
    conn = get_db()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO po_stock (nomor_po, qty_po, is_active) VALUES (%s, %s, 1)
            ON DUPLICATE KEY UPDATE qty_po = %s, is_active = 1, updated_at = CURRENT_TIMESTAMP
        """, (nomor_po, qty_po, qty_po))
        conn.commit(); cur.close()
        return True
    except Exception as e:
        print(f"[DB ERROR] save_po_stock: {e}"); return False
    finally:
        conn.close()

def close_po_stock(nomor_po):
    ensure_po_stock_table()
    conn = get_db()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO po_stock (nomor_po, qty_po, is_active) VALUES (%s, 0, 0)
            ON DUPLICATE KEY UPDATE is_active = 0, updated_at = CURRENT_TIMESTAMP
        """, (nomor_po,))
        conn.commit(); cur.close()
        return True
    except Exception as e:
        print(f"[DB ERROR] close_po_stock: {e}"); return False
    finally:
        conn.close()

def get_distinct_po_numbers(item_filters):
    ensure_po_stock_table()
    if not item_filters: return []
    TOLERANSI_SISA = 2000
    sql_po = """
        SELECT p.nomor_po, p.is_active,
               p.qty_po - COALESCE((SELECT SUM(Qty_Netto) FROM data_timbang WHERE REPLACE(COALESCE(NULLIF(TRIM(Nomor_PO), ''), 'KOSONG'), ',', '.') = p.nomor_po), 0) as balance
        FROM po_stock p
    """
    po_stats = query(sql_po) or []
    closed_pos = {r['nomor_po'] for r in po_stats if r['balance'] <= TOLERANSI_SISA or r.get('is_active', 1) == 0}
    like_clauses = []; params = []
    for f in item_filters:
        like_clauses.append("ItemName LIKE %s"); params.append(f'%{f}%')
    filter_sql = ' OR '.join(like_clauses)
    sql_trans = f"""
        SELECT DISTINCT REPLACE(COALESCE(NULLIF(TRIM(Nomor_PO), ''), 'KOSONG'), ',', '.') AS nomor_po
        FROM data_timbang WHERE ({filter_sql}) AND Nomor_PO IS NOT NULL AND TRIM(Nomor_PO) != ''
    """
    trans_pos = query(sql_trans, tuple(params)) or []
    result = [r['nomor_po'] for r in trans_pos if r['nomor_po'] not in closed_pos]
    return sorted(result)

def get_po_monitor_data():
    ensure_po_stock_table()
    sql = """
        SELECT p.nomor_po,
               (SELECT ItemName FROM data_timbang 
                WHERE REPLACE(COALESCE(NULLIF(TRIM(Nomor_PO), ''), 'KOSONG'), ',', '.') = p.nomor_po 
                LIMIT 1) as item_name,
               p.qty_po as target_po,
               (SELECT SUM(COALESCE(Qty_Netto, 0)) FROM data_timbang 
                WHERE REPLACE(COALESCE(NULLIF(TRIM(Nomor_PO), ''), 'KOSONG'), ',', '.') = p.nomor_po) as total_terkirim
        FROM po_stock p WHERE p.qty_po > 0 AND p.is_active = 1 ORDER BY p.nomor_po ASC
    """
    data = dec(query(sql))
    return data or []

