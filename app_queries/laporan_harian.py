from .db_core import query, dec

def get_laporan_harian(tanggal):
    data = {
        "tanggal": tanggal,
        "gula": {
            "open": 0, "end": 0, "del_actual": 0, "gkm_stok": 0, "gkb_stok": 0, "reject": 0,
            "prod_shifts": [0, 0, 0],
            "prod_total": 0,
            "plan_del": 0, "actual_del_gkm": 0, "actual_del_gkb": 0
        },
        "molasses": {
            "open": 0, "end": 0, "del_actual": 0, "tanka_stok": 0, "tankb_stok": 0,
            "prod_shifts": [0, 0, 0],
            "prod_total": 0,
            "plan_del": 0, "actual_del_a": 0, "actual_del_b": 0
        },
        "cane": {
            "shifts": [0, 0, 0],
            "total": 0
        }
    }

    # Gula Stok
    g_stok = query("SELECT * FROM gula_stok WHERE tanggal = %s LIMIT 1", (tanggal,))
    if g_stok:
        r = dec(g_stok[0])
        data["gula"]["open"] = float(r.get('stok_awal_gkm') or 0) + float(r.get('stok_awal_gkb') or 0)
        data["gula"]["end"] = float(r.get('stok_akhir_gkm') or 0) + float(r.get('stok_akhir_gkb') or 0)
        data["gula"]["gkm_stok"] = float(r.get('stok_akhir_gkm') or 0)
        data["gula"]["gkb_stok"] = float(r.get('stok_akhir_gkb') or 0)
        data["gula"]["reject"] = float(r.get('stok_akhir_reject') or 0)

    # Gula Delivery
    g_del = query("SELECT * FROM gula_delivery WHERE tanggal = %s LIMIT 1", (tanggal,))
    if g_del:
        r = dec(g_del[0])
        data["gula"]["del_actual"] = float(r.get('actual_delivery') or 0)
        data["gula"]["plan_del"] = float(r.get('plan_delivery') or 0)
        data["gula"]["actual_del_gkm"] = float(r.get('delivery_gkm') or 0)
        data["gula"]["actual_del_gkb"] = float(r.get('delivery_gkb') or 0)

    # Gula Penerimaan (Shifts 1, 2, 3)
    g_pen = query("SELECT * FROM gula_penerimaan WHERE tanggal = %s", (tanggal,))
    if g_pen:
        for row in g_pen:
            r = dec(row)
            shift = int(r.get('shift') or 1)
            total_shift = float(r.get('gkm_crushing') or 0) + float(r.get('gkm_melting') or 0) + float(r.get('gkb_crushing') or 0) + float(r.get('gkb_melting') or 0)
            if 1 <= shift <= 3:
                data["gula"]["prod_shifts"][shift-1] = total_shift
                data["gula"]["prod_total"] += total_shift

    # Molasses Stok
    m_stok = query("SELECT * FROM mol_stok_tangki WHERE tanggal = %s LIMIT 1", (tanggal,))
    if m_stok:
        r = dec(m_stok[0])
        data["molasses"]["open"] = float(r.get('stok_awal_tanka') or 0) + float(r.get('stok_awal_tankb') or 0)
        data["molasses"]["end"] = float(r.get('stok_akhir_tanka') or 0) + float(r.get('stok_akhir_tankb') or 0)
        data["molasses"]["tanka_stok"] = float(r.get('stok_akhir_tanka') or 0)
        data["molasses"]["tankb_stok"] = float(r.get('stok_akhir_tankb') or 0)

    # Molasses Delivery
    m_del = query("SELECT * FROM mol_delivery WHERE tanggal = %s LIMIT 1", (tanggal,))
    if m_del:
        r = dec(m_del[0])
        total_act = float(r.get('actual_tank_a') or 0) + float(r.get('actual_tank_b') or 0)
        data["molasses"]["del_actual"] = total_act
        data["molasses"]["plan_del"] = float(r.get('plan_delivery') or 0)
        data["molasses"]["actual_del_a"] = float(r.get('actual_tank_a') or 0)
        data["molasses"]["actual_del_b"] = float(r.get('actual_tank_b') or 0)

    # Molasses Penerimaan (Shifts 1, 2, 3)
    m_pen = query("SELECT * FROM mol_penerimaan WHERE tanggal = %s", (tanggal,))
    if m_pen:
        for row in m_pen:
            r = dec(row)
            shift = int(r.get('shift') or 1)
            total_mol = float(r.get('raw_sugar') or 0) + float(r.get('cane_tebu') or 0)
            if 1 <= shift <= 3:
                data["molasses"]["prod_shifts"][shift-1] = total_mol
                data["molasses"]["prod_total"] += total_mol
                # Cane Tebu is also logged here?
                cane_val = float(r.get('cane_tebu') or 0)
                data["cane"]["shifts"][shift-1] += cane_val
                data["cane"]["total"] += cane_val

    return data
