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
                keterangan VARCHAR(255) DEFAULT '',
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_po (nomor_po)
            ) ENGINE=InnoDB
        """)
        conn.commit()
        # Auto-add columns if missing (migration)
        for col_sql in [
            "ALTER TABLE po_stock ADD COLUMN is_active TINYINT(1) DEFAULT 1",
            "ALTER TABLE po_stock ADD COLUMN keterangan VARCHAR(255) DEFAULT ''",
            "ALTER TABLE po_stock ADD COLUMN is_monitored TINYINT(1) DEFAULT 1",
        ]:
            try:
                cur.execute(col_sql)
                conn.commit()
            except:
                pass
        cur.close()
        # Backfill: row lama yang is_monitored-nya NULL dianggap monitored
        try:
            cur2 = conn.cursor()
            cur2.execute("UPDATE po_stock SET is_monitored = 1 WHERE is_monitored IS NULL")
            conn.commit(); cur2.close()
        except:
            pass
        return True
    except Exception as e:
        print(f"[DB ERROR] ensure_po_stock_table: {e}")
        return False
    finally:
        conn.close()

def get_po_stocks():
    ensure_po_stock_table()
    rows = query("SELECT nomor_po, qty_po, keterangan FROM po_stock WHERE is_active = 1") or []
    return {r['nomor_po']: {'qty_po': float(r['qty_po']), 'keterangan': r.get('keterangan', '')} for r in rows}

def save_po_stock(nomor_po, qty_po, keterangan=None):
    ensure_po_stock_table()
    conn = get_db()
    if not conn: return False
    try:
        cur = conn.cursor()
        if keterangan is not None:
            cur.execute("""
                INSERT INTO po_stock (nomor_po, qty_po, keterangan, is_active) VALUES (%s, %s, %s, 1)
                ON DUPLICATE KEY UPDATE qty_po = %s, keterangan = %s, is_active = 1, updated_at = CURRENT_TIMESTAMP
            """, (nomor_po, qty_po, keterangan, qty_po, keterangan))
        else:
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

def set_po_monitored(nomor_po, is_monitored):
    ensure_po_stock_table()
    conn = get_db()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE po_stock SET is_monitored = %s, updated_at = CURRENT_TIMESTAMP WHERE nomor_po = %s",
            (1 if is_monitored else 0, nomor_po)
        )
        conn.commit(); cur.close()
        return True
    except Exception as e:
        print(f"[DB ERROR] set_po_monitored: {e}"); return False
    finally:
        conn.close()

def get_unmonitored_pos():
    ensure_po_stock_table()
    # Return ALL POs from data_timbang with their po_stock monitor status + item_name
    sql = """
        SELECT
            dt.nomor_po,
            dt.item_name,
            dt.qty_sj,
            ps.is_active,
            ps.is_monitored
        FROM (
            SELECT
                REPLACE(COALESCE(NULLIF(TRIM(Nomor_PO), ''), 'KOSONG'), ',', '.') AS nomor_po,
                MAX(ItemName)  AS item_name,
                MAX(Qty_SJ)    AS qty_sj,
                MAX(Tanggal_Keluar_Clean) AS last_date
            FROM data_timbang
            WHERE Nomor_PO IS NOT NULL AND TRIM(Nomor_PO) != ''
            GROUP BY REPLACE(COALESCE(NULLIF(TRIM(Nomor_PO), ''), 'KOSONG'), ',', '.')
        ) dt
        LEFT JOIN po_stock ps ON ps.nomor_po = dt.nomor_po
        ORDER BY dt.last_date DESC
    """
    data = dec(query(sql))
    return data or []

def get_po_monitor_data():
    ensure_po_stock_table()
    sql = """
        SELECT p.nomor_po,
               (SELECT ItemName FROM data_timbang
                WHERE REPLACE(COALESCE(NULLIF(TRIM(Nomor_PO), ''), 'KOSONG'), ',', '.') = p.nomor_po
                LIMIT 1) as item_name,
               COALESCE((SELECT Qty_SJ FROM data_timbang
                WHERE REPLACE(COALESCE(NULLIF(TRIM(Nomor_PO), ''), 'KOSONG'), ',', '.') = p.nomor_po
                LIMIT 1), p.qty_po) as target_po,
               p.keterangan,
               p.is_monitored,
               (SELECT SUM(COALESCE(Qty_Netto, 0)) FROM data_timbang
                WHERE REPLACE(COALESCE(NULLIF(TRIM(Nomor_PO), ''), 'KOSONG'), ',', '.') = p.nomor_po) as total_terkirim
        FROM po_stock p WHERE p.is_active = 1 ORDER BY p.nomor_po ASC
    """
    data = dec(query(sql))
    return data or []

