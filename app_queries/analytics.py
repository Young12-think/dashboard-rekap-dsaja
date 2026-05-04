# app_queries/analytics.py
from datetime import datetime, timedelta
from .db_core import query

def get_analytics_data(date_str):
    """
    Mengambil data analitik timbangan (Jam Sibuk, TAT, Anomali Tara) untuk satu hari.
    date_str format: YYYY-MM-DD
    """
    try:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        # Tanggal_Masuk & Tanggal_Keluar format in DB: DD/MM/YYYY HH:MM:SS
        db_date_str = dt.strftime('%d/%m/%Y')
        db_date_str_short = dt.strftime('%d/%m/%y') # in case using 2 digit year
    except ValueError:
        return None

    # Query utama hari ini
    sql = """
        SELECT 
            Type, ItemName, CardName, Nopol, Supir, 
            Tanggal_Masuk, Jam_Masuk, Berat_Masuk, 
            Tanggal_Keluar, Jam_Keluar, Berat_Keluar, Qty_Netto
        FROM data_timbang
        WHERE (Tanggal_Keluar LIKE %s OR Tanggal_Keluar LIKE %s)
          AND Jam_Masuk IS NOT NULL AND Jam_Keluar IS NOT NULL
          AND Berat_Masuk IS NOT NULL AND Berat_Keluar IS NOT NULL
    """
    params = (f"{db_date_str}%", f"{db_date_str_short}%")
    records = query(sql, params)
    
    if not records:
        return {
            "peak_hours": [],
            "tat_trend": [],
            "tara_anomalies": []
        }
        
    # Proses Data
    hours_count = {f"{h:02d}:00": 0 for h in range(24)}
    tat_by_shift = {"1": [], "2": [], "3": []}
    
    truck_tara_today = {}
    
    for row in records:
        jm = row.get("Jam_Masuk")
        jk = row.get("Jam_Keluar")
        tgl_m = row.get("Tanggal_Masuk")
        tgl_k = row.get("Tanggal_Keluar")
        tara = row.get("Berat_Masuk") or 0
        nopol = str(row.get("Nopol") or "").strip().upper()
        
        # Hitung Peak Hours (berdasarkan jam keluar / selesai proses)
        try:
            hour_str = jk.split(":")[0]
            hours_count[f"{hour_str}:00"] += 1
        except:
            pass
            
        # Hitung TAT (Selisih Jam Keluar - Jam Masuk)
        try:
            # parsing datetime
            # Format: DD/MM/YYYY
            date_m = tgl_m.split(" ")[0]
            if len(date_m.split('/')[-1]) == 2:
                dt_m = datetime.strptime(f"{date_m} {jm}", "%d/%m/%y %H:%M:%S")
            else:
                dt_m = datetime.strptime(f"{date_m} {jm}", "%d/%m/%Y %H:%M:%S")
                
            date_k = tgl_k.split(" ")[0]
            if len(date_k.split('/')[-1]) == 2:
                dt_k = datetime.strptime(f"{date_k} {jk}", "%d/%m/%y %H:%M:%S")
            else:
                dt_k = datetime.strptime(f"{date_k} {jk}", "%d/%m/%Y %H:%M:%S")
                
            tat_minutes = (dt_k - dt_m).total_seconds() / 60.0
            
            # Abaikan yang negatif atau lebih dari 24 jam (biasanya salah input tanggal)
            if 0 <= tat_minutes <= 1440:
                # Tentukan shift berdasarkan jam keluar
                h_keluar = dt_k.hour
                if 0 <= h_keluar < 8: shift = "1"
                elif 8 <= h_keluar < 16: shift = "2"
                else: shift = "3"
                
                tat_by_shift[shift].append(tat_minutes)
        except Exception as e:
            pass
            
        # Kumpulkan Tara untuk Anomali
        if nopol and nopol != "-" and tara > 0:
            if nopol not in truck_tara_today:
                truck_tara_today[nopol] = []
            truck_tara_today[nopol].append({
                "tara": float(tara),
                "jam": jk,
                "item": row.get("ItemName") or row.get("Type") or "-"
            })

    # Format Peak Hours
    peak_hours_data = [{"hour": k, "count": v} for k, v in hours_count.items()]
    
    # Format TAT Trend
    tat_trend_data = []
    for s in ["1", "2", "3"]:
        arr = tat_by_shift[s]
        avg = sum(arr)/len(arr) if arr else 0
        tat_trend_data.append({"shift": s, "avg_minutes": round(avg, 1), "count": len(arr)})
        
    # Hitung Anomali Tara
    # Truk yang nimbang lebih dari 1 kali hari ini dan selisih taranya > 100kg
    anomalies = []
    for nopol, data_tara in truck_tara_today.items():
        if len(data_tara) > 1:
            taras = [d["tara"] for d in data_tara]
            min_t = min(taras)
            max_t = max(taras)
            diff = max_t - min_t
            if diff >= 100: # Threshold 100 kg
                anomalies.append({
                    "nopol": nopol,
                    "min_tara": min_t,
                    "max_tara": max_t,
                    "diff": diff,
                    "freq": len(taras),
                    "items": list(set([d["item"] for d in data_tara]))
                })
    
    # Sort anomalies by largest diff
    anomalies = sorted(anomalies, key=lambda x: x["diff"], reverse=True)

    return {
        "peak_hours": peak_hours_data,
        "tat_trend": tat_trend_data,
        "tara_anomalies": anomalies
    }

def get_history_insights_data(date_str, days=7):
    """
    Mengambil data tren 7 hari terakhir untuk insight historis:
    1. Tren Rata-rata TAT (Turnaround Time) harian
    2. Tren Selisih Berat (Netto vs Dokumen/SPT) harian (Loss/Gain)
    """
    try:
        end_dt = datetime.strptime(date_str, '%Y-%m-%d')
        start_dt = end_dt - timedelta(days=days)
    except ValueError:
        return None

    sql = """
        SELECT 
            STR_TO_DATE(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1), '%d/%m/%Y') AS tanggal,
            Jam_Masuk, Jam_Keluar, Tanggal_Masuk, Tanggal_Keluar,
            Qty_Netto, Qty_SPMSPB, ItemName
        FROM data_timbang
        WHERE STR_TO_DATE(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1), '%d/%m/%Y') BETWEEN DATE_SUB(%s, INTERVAL %s DAY) AND %s
    """
    records = query(sql, (date_str, days, date_str))

    if not records:
        return {"dates": [], "tat": [], "selisih": []}

    daily_data = {}
    
    # Generate complete date range list to avoid gaps
    current_date = start_dt
    while current_date <= end_dt:
        dt_str = current_date.strftime('%Y-%m-%d')
        daily_data[dt_str] = {"tat_list": [], "netto": 0, "spt": 0}
        current_date += timedelta(days=1)

    for r in records:
        tgl = r.get("tanggal")
        if not tgl: continue
        tgl_str = tgl.strftime('%Y-%m-%d') if hasattr(tgl, 'strftime') else str(tgl)
        
        if tgl_str not in daily_data:
            continue
            
        d = daily_data[tgl_str]
        
        netto = float(r.get("Qty_Netto") or 0)
        spt = float(r.get("Qty_SPMSPB") or 0)
        item = (r.get("ItemName") or "").upper()
        
        # Selisih: Hitung hanya jika ada data SPT (misal Gula/Molasse)
        if spt > 0:
            d["netto"] += netto
            d["spt"] += spt
                
        # TAT: Parse using actual dates
        tgl_m = r.get("Tanggal_Masuk", "")
        jm = r.get("Jam_Masuk", "")
        tgl_k = r.get("Tanggal_Keluar", "")
        jk = r.get("Jam_Keluar", "")
        
        if tgl_m and jm and tgl_k and jk:
            try:
                date_m = tgl_m.split(" ")[0]
                if len(date_m.split('/')[-1]) == 2:
                    dt_m = datetime.strptime(f"{date_m} {jm}", "%d/%m/%y %H:%M:%S")
                else:
                    dt_m = datetime.strptime(f"{date_m} {jm}", "%d/%m/%Y %H:%M:%S")

                date_k = tgl_k.split(" ")[0]
                if len(date_k.split('/')[-1]) == 2:
                    dt_k = datetime.strptime(f"{date_k} {jk}", "%d/%m/%y %H:%M:%S")
                else:
                    dt_k = datetime.strptime(f"{date_k} {jk}", "%d/%m/%Y %H:%M:%S")

                tat_min = (dt_k - dt_m).total_seconds() / 60.0
                if 0 <= tat_min <= 1440: # Max 24 hours to filter anomalies
                    d["tat_list"].append(tat_min)
            except:
                pass

    dates = sorted(list(daily_data.keys()))
    
    # Format dates for labels (e.g. "02 Mei")
    formatted_dates = []
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    for dt_str in dates:
        dt_obj = datetime.strptime(dt_str, '%Y-%m-%d')
        formatted_dates.append(f"{dt_obj.day} {months[dt_obj.month-1]}")

    tat_trend = []
    selisih_trend = []
    
    for dt_str in dates:
        d = daily_data[dt_str]
        
        avg_tat = sum(d["tat_list"]) / len(d["tat_list"]) if d["tat_list"] else 0
        tat_trend.append(round(avg_tat, 1))
        
        # Selisih = Netto - SPT (positif = Gain, negatif = Loss)
        selisih = d["netto"] - d["spt"] if d["spt"] > 0 else 0
        selisih_trend.append(round(selisih, 1))
        
    return {
        "dates": formatted_dates,
        "tat": tat_trend,
        "selisih": selisih_trend
    }


def get_shift_productivity_data(date_str):
    """
    Radar/Spider Chart: Produktivitas multi-dimensi per shift.
    Dimensi: Tonase, Ritase, Kecepatan (1/TAT), Variasi Item.
    """
    try:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        db_date_str = dt.strftime('%d/%m/%Y')
        db_date_str_short = dt.strftime('%d/%m/%y')
    except ValueError:
        return None

    sql = """
        SELECT 
            Shift, ItemName, Qty_Netto, NoSystem,
            Tanggal_Masuk, Jam_Masuk, Tanggal_Keluar, Jam_Keluar
        FROM data_timbang
        WHERE (Tanggal_Keluar LIKE %s OR Tanggal_Keluar LIKE %s)
          AND Shift IS NOT NULL
          AND Jam_Masuk IS NOT NULL AND Jam_Keluar IS NOT NULL
    """
    params = (f"{db_date_str}%", f"{db_date_str_short}%")
    records = query(sql, params)

    if not records:
        return {"shifts": [], "labels": ["Tonase", "Ritase", "Kecepatan", "Variasi Item"]}

    # Kumpulkan data per shift
    shift_data = {}
    for r in records:
        s = int(r.get("Shift") or 0)
        if s not in (1, 2, 3):
            continue
        if s not in shift_data:
            shift_data[s] = {
                "tonase": 0, "systems": set(), "items": set(), "tat_list": []
            }
        sd = shift_data[s]
        sd["tonase"] += float(r.get("Qty_Netto") or 0)
        if r.get("NoSystem"):
            sd["systems"].add(r["NoSystem"])
        if r.get("ItemName"):
            sd["items"].add(r["ItemName"].strip().upper())

        # Hitung TAT
        try:
            tgl_m = r.get("Tanggal_Masuk", "")
            jm = r.get("Jam_Masuk", "")
            tgl_k = r.get("Tanggal_Keluar", "")
            jk = r.get("Jam_Keluar", "")

            date_m = tgl_m.split(" ")[0]
            if len(date_m.split('/')[-1]) == 2:
                dt_m = datetime.strptime(f"{date_m} {jm}", "%d/%m/%y %H:%M:%S")
            else:
                dt_m = datetime.strptime(f"{date_m} {jm}", "%d/%m/%Y %H:%M:%S")

            date_k = tgl_k.split(" ")[0]
            if len(date_k.split('/')[-1]) == 2:
                dt_k = datetime.strptime(f"{date_k} {jk}", "%d/%m/%y %H:%M:%S")
            else:
                dt_k = datetime.strptime(f"{date_k} {jk}", "%d/%m/%Y %H:%M:%S")

            tat_min = (dt_k - dt_m).total_seconds() / 60.0
            if 0 <= tat_min <= 1440:
                sd["tat_list"].append(tat_min)
        except:
            pass

    if not shift_data:
        return {"shifts": [], "labels": ["Tonase", "Ritase", "Kecepatan", "Variasi Item"]}

    # Normalisasi: temukan max masing-masing dimensi untuk skala 0-100
    all_tonase = [sd["tonase"] for sd in shift_data.values()]
    all_ritase = [len(sd["systems"]) for sd in shift_data.values()]
    all_items  = [len(sd["items"]) for sd in shift_data.values()]
    all_speed  = []
    for sd in shift_data.values():
        if sd["tat_list"]:
            avg_tat = sum(sd["tat_list"]) / len(sd["tat_list"])
            all_speed.append(1.0 / max(avg_tat, 0.1))  # inverse TAT = kecepatan
        else:
            all_speed.append(0)

    max_ton = max(all_tonase) if all_tonase else 1
    max_rit = max(all_ritase) if all_ritase else 1
    max_itm = max(all_items) if all_items else 1
    max_spd = max(all_speed) if all_speed else 1

    result_shifts = []
    shift_idx = 0
    for s in sorted(shift_data.keys()):
        sd = shift_data[s]
        ritase = len(sd["systems"])
        variasi = len(sd["items"])
        if sd["tat_list"]:
            avg_tat = sum(sd["tat_list"]) / len(sd["tat_list"])
            speed_raw = 1.0 / max(avg_tat, 0.1)
        else:
            avg_tat = 0
            speed_raw = 0

        result_shifts.append({
            "shift": s,
            "tonase_raw": round(sd["tonase"], 1),
            "ritase_raw": ritase,
            "avg_tat_raw": round(avg_tat, 1),
            "variasi_raw": variasi,
            # Normalized 0-100
            "tonase": round((sd["tonase"] / max_ton) * 100, 1) if max_ton else 0,
            "ritase": round((ritase / max_rit) * 100, 1) if max_rit else 0,
            "kecepatan": round((speed_raw / max_spd) * 100, 1) if max_spd else 0,
            "variasi_item": round((variasi / max_itm) * 100, 1) if max_itm else 0,
        })
        shift_idx += 1

    return {
        "shifts": result_shifts,
        "labels": ["Tonase", "Ritase", "Kecepatan", "Variasi Item"]
    }


def get_top_transportir_data(date_str):
    """
    Top 10 Customer/Transportir berdasarkan tonase dan ritase hari ini.
    """
    try:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
    except ValueError:
        return None

    sql = """
        SELECT 
            TRIM(CardName) AS customer,
            SUM(ABS(COALESCE(Qty_Netto, 0))) AS total_tonase,
            COUNT(DISTINCT NoSystem) AS total_ritase
        FROM data_timbang
        WHERE STR_TO_DATE(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1), '%d/%m/%Y') = %s
          AND CardName IS NOT NULL AND TRIM(CardName) != ''
        GROUP BY TRIM(CardName)
        ORDER BY total_tonase DESC
        LIMIT 10
    """
    from .db_core import dec
    records = dec(query(sql, (date_str,)))

    if not records:
        return {"data": []}

    return {
        "data": [
            {
                "customer": r["customer"],
                "tonase": float(r["total_tonase"] or 0),
                "ritase": int(r["total_ritase"] or 0)
            }
            for r in records
        ]
    }
