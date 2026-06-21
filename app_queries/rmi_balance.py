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
