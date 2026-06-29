from flask import Flask, jsonify, request, send_from_directory, session, redirect, url_for, render_template
from flask_cors import CORS
from datetime import datetime
import secrets
import hashlib
import logging
import sys
import os
from dotenv import load_dotenv
from waitress import serve

load_dotenv()


import app_queries as queries

# ─── LOGGING SETUP ─────────────────────────────────────────
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'server_debug.log')

# Format log yang informatif
log_format = logging.Formatter(
    '[%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# File handler (tulis ke server_debug.log, max 5MB x 3 backup)
from logging.handlers import RotatingFileHandler
file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8')
file_handler.setFormatter(log_format)
file_handler.setLevel(logging.INFO)

# Console handler (stdout — agar terlihat juga jika ada CMD terbuka)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(log_format)
console_handler.setLevel(logging.INFO)

# Root logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(file_handler)
logger.addHandler(console_handler)

# Redirect print() ke logging juga
class PrintToLogger:
    def write(self, msg):
        msg = msg.strip()
        if msg:
            logger.info(msg)
    def flush(self):
        pass

sys.stdout = PrintToLogger()
sys.stderr = PrintToLogger()

app = Flask(__name__, static_folder='.', static_url_path='')
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.secret_key = secrets.token_hex(32)  # Random secret key setiap restart
CORS(app)

# ─── SESSION AUTH HELPER ───────────────────────────────────
PUBLIC_ROUTES = {'/login', '/login.html', '/api/health', '/api/login'}

def is_logged_in():
    return session.get('user') is not None

def is_admin():
    return session.get('role') == 'admin'

def require_login():
    """Return redirect response jika belum login, else None."""
    if not is_logged_in():
        return redirect('/login')
    return None

# ─── Static / Page Routes ──────────────────────────────────
@app.route('/login')
@app.route('/login.html')
def login_page():
    if is_logged_in():
        return redirect('/')
    return send_from_directory('.', 'login.html')

@app.route('/')
def index():
    guard = require_login()
    if guard: return guard
    #return send_from_directory('.', 'index.html')
    return render_template('index.html')

@app.route('/<path:filename>')
def static_files(filename):
    # API routes, login, favicon, dan folder img tidak perlu guard
    if (filename.startswith('api/') or 
        filename.startswith('img/') or 
        filename in ('login', 'login.html', 'favicon.ico', 'favicon.png')):
        pass
    else:
        guard = require_login()
        if guard: return guard
    return send_from_directory('.', filename)

# =============================================
# API: Production Data (grouped by type & shift)
# =============================================
@app.route('/api/production')
def api_production():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    data = queries.get_production_data(date_str)
    if data is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "date": date_str, "data": data})

# =============================================
# API: Analytics (Grafik & Insight)
# =============================================
@app.route('/api/analytics')
def api_analytics():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    data = queries.get_analytics_data(date_str)
    if data is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "date": date_str, "data": data})

@app.route('/api/analytics/shift-radar')
def api_shift_radar():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    data = queries.get_shift_productivity_data(date_str)
    if data is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "date": date_str, "data": data})

@app.route('/api/analytics/top-transportir')
def api_top_transportir():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    data = queries.get_top_transportir_data(date_str)
    if data is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "date": date_str, "data": data})

@app.route('/api/analytics/history-insights')
def api_history_insights():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    days = int(request.args.get('days', 7))
    data = queries.get_history_insights_data(date_str, days)
    if data is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "date": date_str, "data": data})

# =============================================
# API: Report Tebu
# =============================================
@app.route('/api/report-tebu')
def api_report_tebu():
    date_from = request.args.get('date_from', datetime.now().strftime('%Y-%m-%d'))
    date_to = request.args.get('date_to', datetime.now().strftime('%Y-%m-%d'))
    rekap_from = request.args.get('rekap_from')
    rekap_to = request.args.get('rekap_to', date_to)
    
    data = queries.get_report_tebu(date_from, date_to, rekap_from, rekap_to)
    if data is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "date_from": date_from, "date_to": date_to, "data": data})

# =============================================
# API: Scrape Cane Yard (Playwright)
# =============================================
@app.route('/api/scrape-caneyard', methods=['GET', 'POST'])
def api_scrape_caneyard():
    try:
        import rmi_scraper
        val = rmi_scraper.get_cy_total_truck(headless=True)
        if val is not None:
            return jsonify({"status": "success", "caneYard": val})
        else:
            return jsonify({"status": "error", "message": "Gagal menemukan nilai Cane Yard"}), 404
    except ImportError:
         return jsonify({"status": "error", "message": "Library scraper tidak tersedia"}), 500
    except Exception as e:
         return jsonify({"status": "error", "message": str(e)}), 500

# =============================================
# API: Vendor Data (grouped by card_name & shift)
# =============================================
@app.route('/api/vendors')
def api_vendors():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    data = queries.get_vendor_data(date_str)
    if data is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "date": date_str, "data": data})

# =============================================
# API: Summary stats for cards
# =============================================
@app.route('/api/summary')
def api_summary():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    summary = queries.get_summary_data(date_str)
    if summary is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "date": date_str, "summary": summary})

# =============================================
# API: Distinct types (for dynamic card rendering)
# =============================================
@app.route('/api/types')
def api_types():
    types = queries.get_types()
    if types is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "types": types})

# =============================================
# API: History (for charts — last N days)
# =============================================
@app.route('/api/production/history')
def api_history():
    days = int(request.args.get('days', 7))
    # JURUS SAKTI: Tangkap tanggal dari kalender UI!
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    
    # Masukkan date_str ke dalam fungsi queries
    result = queries.get_history_data(date_str, days)
    
    if result is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", **result})

# =============================================
# API: Recent transactions (raw data table)
# =============================================
@app.route('/api/recent')
def api_recent():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    limit = int(request.args.get('limit', 50))
    data = queries.get_recent_data(date_str, limit)
    if data is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "date": date_str, "data": data or []})

# =============================================
# API: Transaction Data (date range + item filter)
# =============================================
@app.route('/api/laporan-harian')
def api_laporan_harian():
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    data = queries.get_laporan_harian(date_str)
    if data is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "date": date_str, "data": data})

@app.route('/api/transactions')
def api_transactions():
    date_from = request.args.get('date_from', datetime.now().strftime('%Y-%m-%d'))
    date_to = request.args.get('date_to', datetime.now().strftime('%Y-%m-%d'))
    item_type = request.args.get('type', '')
    po_filter = request.args.get('po', '').strip() or None
    
    # Parameter tambahan
    search_term = request.args.get('search', '').strip() or None
    tx_key = request.args.get('tx_key', '')
    limit = int(request.args.get('limit', 100))
    page = int(request.args.get('page', 1))
    offset = (page - 1) * limit

    # Parameter khusus support (dikirim terpisah agar tidak kena split koma)
    support_item = request.args.get('support_item', '').strip() or None
    support_vendor = request.args.get('support_vendor', '').strip() or None
    # Parameter khusus others
    others_item = request.args.get('others_item', '').strip() or None

    filters = [f.strip() for f in item_type.split(',') if f.strip()]

    result = queries.get_transaction_data(
        date_from, date_to, filters, po_filter, search_term,
        limit, offset, tx_key,
        support_item=support_item,
        support_vendor=support_vendor,
        others_item=others_item
    )
    if result is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
        
    return jsonify({
        "status": "success", 
        "date_from": date_from, 
        "date_to": date_to, 
        "total_rows": result.get("total_rows", 0),
        "summary": result.get("summary", {}),
        "data": result.get("data", [])
    })
# =============================================
# API: PO Stock (user-managed PO quantities)
# =============================================
@app.route('/api/po-stock', methods=['GET'])
def api_get_po_stock():
    stocks = queries.get_po_stocks()
    return jsonify({"status": "success", "data": stocks})

# API BARU: Untuk menerima perintah Tutup Paksa PO dari Browser
@app.route('/api/po-close', methods=['POST'])
def api_close_po_stock():
    if not is_logged_in():
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    if not is_admin():
        return jsonify({"status": "error", "message": "Akses ditolak. Khusus Admin!"}), 403

    body = request.get_json()
    if not body or 'nomor_po' not in body:
        return jsonify({"status": "error", "message": "Missing nomor_po"}), 400
    ok = queries.close_po_stock(body['nomor_po'])
    if not ok:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success"})

@app.route('/api/po-stock', methods=['POST'])
def api_save_po_stock():
    if not is_logged_in():
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    if not is_admin():
        return jsonify({"status": "error", "message": "Akses ditolak. Khusus Admin!"}), 403

    body = request.get_json()
    if not body or 'nomor_po' not in body or 'qty_po' not in body:
        return jsonify({"status": "error", "message": "Missing nomor_po or qty_po"}), 400
    keterangan = body.get('keterangan', None)
    ok = queries.save_po_stock(body['nomor_po'], float(body['qty_po']), keterangan=keterangan)
    if not ok:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success"})

# =============================================
# API: Distinct PO Numbers (for limbah filter dropdown)
# =============================================
@app.route('/api/po-numbers')
def api_po_numbers():
    item_type = request.args.get('type', '')
    filters = [f.strip() for f in item_type.split(',') if f.strip()]
    po_list = queries.get_distinct_po_numbers(filters)
    return jsonify({"status": "success", "data": po_list or []})

# =============================================
# API: PO Monitor (Target vs Terkirim)
# =============================================
@app.route('/api/po-monitor')
def api_po_monitor():
    data = queries.get_po_monitor_data()
    if data is None:
        return jsonify({"status": "error", "message": "Database error"}), 500
    return jsonify({"status": "success", "data": data})

# =============================================
# API: support items & vendors
# =============================================

@app.route('/api/support-items', methods=['GET'])
def api_support_items():
    try:
        items = queries.get_support_items()
        return jsonify({"status": "success", "data": items or []})
    except Exception as e:
        print(f"[API ERROR] /api/support-items: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/support-vendors', methods=['GET'])
def api_support_vendors():
    try:
        item_filter = request.args.get('item', '').strip() or None
        date_from   = request.args.get('date_from', '').strip() or None
        date_to     = request.args.get('date_to', '').strip() or None
        vendors = queries.get_support_vendors(
            item_filter=item_filter,
            date_from=date_from,
            date_to=date_to
        )
        return jsonify({"status": "success", "data": vendors or []})
    except Exception as e:
        print(f"[API ERROR] /api/support-vendors: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# =============================================
# API: Others Items & Report
# =============================================
@app.route('/api/others-items', methods=['GET'])
def api_others_items():
    try:
        items = queries.get_others_items()
        return jsonify({"status": "success", "data": items or []})
    except Exception as e:
        print(f"[API ERROR] /api/others-items: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/report-others')
def api_report_others():
    date_str    = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    itemname    = request.args.get('itemname', '').strip()
    todate_from = request.args.get('todate_from', '').strip() or None
    if not itemname:
        return jsonify({"status": "error", "message": "Parameter itemname wajib diisi"}), 400
    try:
        data = queries.get_others_report(date_str, itemname, todate_from)
        if data is None:
            return jsonify({"status": "error", "message": "Database error"}), 500
        return jsonify({"status": "success", "date": date_str, "data": data})
    except Exception as e:
        print(f"[API ERROR] /api/report-others: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# =============================================
# API: Health check
# =============================================
@app.route('/api/health')
def health():
    db_status = queries.check_db_health()
    return jsonify({
        "status": "ok",
        "database": db_status,
        "timestamp": datetime.now().isoformat()
    })

# =============================================
# API: Login / Logout
# =============================================
@app.route('/api/login', methods=['POST'])
def api_login():
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"status": "error", "message": "Invalid request"}), 400

    # Strip dan batasi panjang input (defense in depth)
    username = str(body.get('username', '')).strip()[:64]
    password = str(body.get('password', '')).strip()[:128]

    if not username or not password:
        return jsonify({"status": "error", "message": "Username dan password wajib diisi"}), 400

    # Verifikasi credential via PARAMETERIZED QUERY (100% SQL injection safe)
    user = queries.verify_login(username, password)

    if user:
        session['user'] = user['username']
        session['role'] = user['role']
        session.permanent = False
        token = secrets.token_urlsafe(32)
        return jsonify({
            "status": "success",
            "username": user['username'],
            "role": user['role'],
            "token": token
        })
    else:
        # Delay kecil untuk mencegah brute force timing attack
        import time; time.sleep(0.5)
        return jsonify({"status": "error", "message": "Username atau password salah"}), 401

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({"status": "success"})

# =============================================
# API & Pages: RMI Balance Molasses
# =============================================
@app.route('/rmi-balance')
def page_rmi_balance():
    if not is_logged_in(): return redirect(url_for('login_page'))
    return render_template('rmi_balance_dashboard.html')

@app.route('/api/rmi-balance/overview')
def api_rmi_balance_overview():
    if not is_logged_in(): return jsonify({"status": "error", "message": "Unauthorized"}), 401
    return jsonify({"status": "success", "data": queries.rmi_balance.get_overview()})

@app.route('/api/rmi-balance/stok-harian')
def api_rmi_balance_stok_harian():
    if not is_logged_in(): return jsonify({"status": "error", "message": "Unauthorized"}), 401
    return jsonify({"status": "success", "data": queries.rmi_balance.get_stok_harian()})

@app.route('/api/rmi-balance/delivery-harian')
def api_rmi_balance_delivery_harian():
    if not is_logged_in(): return jsonify({"status": "error", "message": "Unauthorized"}), 401
    return jsonify({"status": "success", "data": queries.rmi_balance.get_delivery_harian()})

@app.route('/api/rmi-balance/molasses-harian')
def api_rmi_balance_molasses_harian():
    if not is_logged_in(): return jsonify({"status": "error", "message": "Unauthorized"}), 401
    return jsonify({"status": "success", "data": queries.rmi_balance.get_molasses_harian()})

@app.route('/api/rmi-balance/lokasi')
def api_rmi_balance_lokasi():
    if not is_logged_in(): return jsonify({"status": "error", "message": "Unauthorized"}), 401
    return jsonify({"status": "success", "data": queries.rmi_balance.get_lokasi_stok()})

@app.route('/api/rmi-balance/settings', methods=['GET', 'POST'])
def api_rmi_balance_settings():
    if not is_logged_in(): return jsonify({"status": "error", "message": "Unauthorized"}), 401
    if request.method == 'GET':
        return jsonify({"status": "success", "data": queries.rmi_balance.get_settings()})
    else:
        if not is_admin(): return jsonify({"status": "error", "message": "Khusus Admin!"}), 403
        body = request.get_json(silent=True) or {}
        gula_cap = body.get('gula_capacity', 22000)
        mol_cap = body.get('molasses_capacity', 30000)
        ok = queries.rmi_balance.update_settings(gula_cap, mol_cap)
        if ok:
            return jsonify({"status": "success"})
        return jsonify({"status": "error", "message": "Gagal update setting"}), 500

@app.route('/api/rmi-balance/laporan-harian')
def api_rmi_balance_laporan_harian():
    if not is_logged_in(): return jsonify({"status": "error", "message": "Unauthorized"}), 401
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    return jsonify({"status": "success", "data": queries.rmi_balance.get_laporan_harian(date_str)})

@app.route('/api/rmi-balance/grafik')
def api_rmi_balance_grafik():
    if not is_logged_in(): return jsonify({"status": "error", "message": "Unauthorized"}), 401
    date_from = request.args.get('date_from', datetime.now().strftime('%Y-%m-%d'))
    date_to = request.args.get('date_to', datetime.now().strftime('%Y-%m-%d'))
    return jsonify({"status": "success", "data": queries.rmi_balance.get_grafik_laporan(date_from, date_to)})

@app.route('/api/rmi-balance/grafik-analitik')
def api_rmi_balance_grafik_analitik():
    if not is_logged_in(): return jsonify({"status": "error", "message": "Unauthorized"}), 401
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    days = int(request.args.get('days', 7))
    return jsonify({"status": "success", "data": queries.rmi_balance.get_grafik_analitik(date_str, days)})

@app.route('/api/me')
def api_me():
    if not is_logged_in():
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    return jsonify({
        "status": "success", 
        "username": session.get('user'),
        "role": session.get('role', 'viewer')
    })

# =============================================
# API: Admin User Management
# =============================================
@app.route('/api/admin/users', methods=['GET'])
def api_admin_get_users():
    if not is_logged_in():
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    if not is_admin():
        return jsonify({"status": "error", "message": "Akses ditolak"}), 403
    
    users = queries.get_all_users()
    return jsonify({"status": "success", "data": users})

@app.route('/api/admin/users', methods=['POST'])
def api_admin_add_user():
    if not is_logged_in():
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    if not is_admin():
        return jsonify({"status": "error", "message": "Akses ditolak"}), 403
        
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"status": "error", "message": "Invalid request"}), 400
        
    username = body.get('username')
    password = body.get('password')
    role = body.get('role', 'viewer')
    
    ok, msg = queries.add_user(username, password, role)
    if not ok:
        return jsonify({"status": "error", "message": msg}), 400
        
    return jsonify({"status": "success", "message": msg})

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
def api_admin_delete_user(user_id):
    if not is_logged_in():
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    if not is_admin():
        return jsonify({"status": "error", "message": "Akses ditolak"}), 403
        
    ok, msg = queries.delete_user(user_id)
    if not ok:
        return jsonify({"status": "error", "message": msg}), 400
        
    return jsonify({"status": "success", "message": msg})

@app.route('/api/admin/users/<int:user_id>/password', methods=['PUT'])
def api_admin_change_password(user_id):
    if not is_logged_in():
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    if not is_admin():
        return jsonify({"status": "error", "message": "Akses ditolak. Khusus Admin!"}), 403

    body = request.get_json(silent=True)
    if not body or 'new_password' not in body:
        return jsonify({"status": "error", "message": "Missing new_password"}), 400

    ok, msg = queries.change_password(user_id, body['new_password'])
    if not ok:
        return jsonify({"status": "error", "message": msg}), 400

    return jsonify({"status": "success", "message": msg})

# =============================================
# DAILY REPORT ENDPOINTS
# =============================================

# ── SECTION 1: DELIVERY ──────────────────────────────────────


@app.route('/api/report-daily/delivery', methods=['GET'])
def api_delivery():
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    if not date_from or not date_to:
        return jsonify({"error": "Parameter date_from dan date_to wajib diisi"}), 400

    try:
        # Panggil otak perhitungannya dari modul queries
        data = queries.get_daily_delivery(date_from, date_to)
        return jsonify({"status": "success", "data": data or []})
    except Exception as e:
        print(f"[API ERROR Delivery] {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# ── SECTION 2: SUPPORT ───────────────────────────────────────
@app.route('/api/report-daily/support')
def api_daily_support():
    date_from = request.args.get('date_from', datetime.now().strftime('%Y-%m-%d'))
    date_to   = request.args.get('date_to',   datetime.now().strftime('%Y-%m-%d'))
    try:
        data = queries.get_daily_support(date_from, date_to)
        return jsonify({"status": "success", "data": data or []})
    except Exception as e:
        print(f"[API ERROR] /api/report-daily/support: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ── SECTION 3: LIMBAH ────────────────────────────────────────
@app.route('/api/report-daily/limbah')
def api_daily_limbah():
    date_from = request.args.get('date_from', datetime.now().strftime('%Y-%m-%d'))
    date_to   = request.args.get('date_to',   datetime.now().strftime('%Y-%m-%d'))
    try:
        data = queries.get_daily_limbah(date_from, date_to)
        return jsonify({"status": "success", "data": data or []})
    except Exception as e:
        print(f"[API ERROR] /api/report-daily/limbah: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ── SECTION 4: CANE RECEIVED ─────────────────────────────────
@app.route('/api/report-daily/cane')
def api_daily_cane():
    date_from  = request.args.get('date_from',  datetime.now().strftime('%Y-%m-%d'))
    date_to    = request.args.get('date_to',    datetime.now().strftime('%Y-%m-%d'))
    rekap_from = request.args.get('rekap_from', '').strip() or None
    rekap_to   = request.args.get('rekap_to',   '').strip() or None
    try:
        data = queries.get_daily_cane(date_from, date_to, rekap_from, rekap_to)
        # data = None berarti tidak ada data tebu → return null agar seksi disembunyikan
        return jsonify({"status": "success", "data": data})
    except Exception as e:
        print(f"[API ERROR] /api/report-daily/cane: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ── SECTION 5: TRANSFER GULA ─────────────────────────────────
@app.route('/api/report-daily/transfer')
def api_daily_transfer():
    date_from = request.args.get('date_from', datetime.now().strftime('%Y-%m-%d'))
    date_to   = request.args.get('date_to',   datetime.now().strftime('%Y-%m-%d'))
    try:
        data = queries.get_daily_transfer_gula(date_from, date_to)
        return jsonify({"status": "success", "data": data or []})
    except Exception as e:
        print(f"[API ERROR] /api/report-daily/transfer: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ── BONUS: Single endpoint (ambil semua sekaligus) ───────────
@app.route('/api/report-daily/all')
def api_daily_all():
    """
    Satu endpoint yang mengembalikan semua section sekaligus.
    Lebih efisien karena hanya 1 round-trip dari browser.
    """
    date_from  = request.args.get('date_from',  datetime.now().strftime('%Y-%m-%d'))
    date_to    = request.args.get('date_to',    datetime.now().strftime('%Y-%m-%d'))
    rekap_from = request.args.get('rekap_from', '').strip() or None
    rekap_to   = request.args.get('rekap_to',   '').strip() or None
    try:
        delivery = queries.get_daily_delivery(date_from, date_to)
        support  = queries.get_daily_support(date_from, date_to)
        limbah   = queries.get_daily_limbah(date_from, date_to)
        cane     = queries.get_daily_cane(date_from, date_to, rekap_from, rekap_to)
        transfer = queries.get_daily_transfer_gula(date_from, date_to)

        return jsonify({
            "status":    "success",
            "date_from": date_from,
            "date_to":   date_to,
            "delivery":  delivery or [],
            "support":   support  or [],
            "limbah":    limbah   or [],
            "cane":      cane,          # bisa None
            "transfer":  transfer or [],
        })
    except Exception as e:
        print(f"[API ERROR] /api/report-daily/all: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# =============================================
# API: BLABAK (Weightbridge Daily Report)
# =============================================
@app.route('/api/report-blabak')
def api_report_blabak():
    date_str   = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    rekap_from = request.args.get('rekap_from', '').strip() or None
    try:
        data = queries.get_blabak_report(date_str, rekap_from)
        if data is None:
            return jsonify({"status": "error", "message": "Database error"}), 500
        return jsonify({"status": "success", "date": date_str, "data": data})
    except Exception as e:
        print(f"[API ERROR] /api/report-blabak: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# =============================================
# SSH CONFIG
# =============================================
import threading
import time
import socket

SSH_CONFIG = {
    'host': os.getenv('SSH_VPS_IP', '157.15.40.39'),
    'port': 22,
    'username': os.getenv('SSH_USER', 'ubuntu'),
    'password': os.getenv('SSH_PASSWORD', 'raimu123'),
}

# ── Reverse Tunnel: expose localhost:8000 → VPS:8080 (agar web bisa diakses via VPS) ──
ENABLE_REVERSE_TUNNEL = os.getenv('SSH_ENABLE', 'True').lower() in ['true', '1', 't', 'y', 'yes']
REVERSE_TUNNEL_REMOTE_PORT = int(os.getenv('SSH_REMOTE_PORT', 8080))
REVERSE_TUNNEL_LOCAL_HOST = '127.0.0.1'
REVERSE_TUNNEL_LOCAL_PORT = int(os.getenv('SERVER_PORT', 8000))

# ── MySQL Tunnel: localhost:3307 → VPS MySQL:3306 (untuk akses DB langsung) ──
ENABLE_MYSQL_TUNNEL = False     # Hanya nyalakan saat butuh akses DB remote via Workbench dll


# =============================================
# REVERSE SSH TUNNEL (ssh -R) — Web Access via VPS
# =============================================
_reverse_client = None
_reverse_running = False
_reverse_lock = threading.Lock()
_reverse_stop = threading.Event()

def _reverse_forward_channel(chan, local_host, local_port):
    """Forward satu koneksi dari VPS ke local server."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((local_host, local_port))
    except Exception:
        chan.close()
        return

    def copy(src, dst):
        try:
            while True:
                data = src.recv(8192)
                if not data:
                    break
                dst.sendall(data)
        except Exception:
            pass
        try:
            dst.close()
        except Exception:
            pass

    t1 = threading.Thread(target=copy, args=(chan, sock), daemon=True)
    t2 = threading.Thread(target=copy, args=(sock, chan), daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()


def start_reverse_tunnel():
    """Buka reverse SSH tunnel: VPS:8080 → localhost:8000."""
    global _reverse_client, _reverse_running
    import paramiko

    with _reverse_lock:
        if _reverse_client and _reverse_client.get_transport() and _reverse_client.get_transport().is_active():
            return True

        try:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(
                SSH_CONFIG['host'], SSH_CONFIG['port'],
                username=SSH_CONFIG['username'],
                password=SSH_CONFIG['password'],
                timeout=15,
            )
            transport = client.get_transport()
            transport.set_keepalive(30)
            transport.request_port_forward('0.0.0.0', REVERSE_TUNNEL_REMOTE_PORT)
            _reverse_client = client
            _reverse_running = True

            logging.info(
                f"==> [SSH-R] Reverse Tunnel AKTIF: "
                f"{SSH_CONFIG['host']}:{REVERSE_TUNNEL_REMOTE_PORT} → "
                f"localhost:{REVERSE_TUNNEL_LOCAL_PORT}"
            )

            # Thread untuk accept koneksi masuk dari VPS
            def serve():
                while _reverse_running:
                    try:
                        chan = transport.accept(1)
                        if chan is None:
                            if not transport.is_active():
                                break
                            continue
                        t = threading.Thread(
                            target=_reverse_forward_channel,
                            args=(chan, REVERSE_TUNNEL_LOCAL_HOST, REVERSE_TUNNEL_LOCAL_PORT),
                            daemon=True
                        )
                        t.start()
                    except Exception:
                        if not _reverse_running:
                            break

            srv = threading.Thread(target=serve, daemon=True, name="ReverseSSH-Serve")
            srv.start()
            return True

        except Exception as e:
            logging.error(f"==> [SSH-R] Reverse Tunnel GAGAL: {e}")
            _reverse_client = None
            return False


def stop_reverse_tunnel():
    """Hentikan reverse SSH tunnel."""
    global _reverse_client, _reverse_running
    with _reverse_lock:
        _reverse_running = False
        if _reverse_client:
            try:
                _reverse_client.close()
            except Exception:
                pass
            _reverse_client = None
    logging.info("==> [SSH-R] Reverse Tunnel ditutup.")


def _reverse_tunnel_watchdog():
    """Watchdog: cek reverse tunnel tiap 15 detik, auto-reconnect."""
    logging.info("==> [SSH-R] Watchdog aktif...")
    retry_delay = 5

    while not _reverse_stop.is_set():
        _reverse_stop.wait(15)
        if _reverse_stop.is_set():
            break

        with _reverse_lock:
            is_alive = (_reverse_client
                        and _reverse_client.get_transport()
                        and _reverse_client.get_transport().is_active())

        if not is_alive:
            logging.warning("==> [SSH-R] Tunnel MATI! Reconnect...")
            stop_reverse_tunnel()
            if start_reverse_tunnel():
                retry_delay = 5
                logging.info("==> [SSH-R] Reconnect berhasil!")
            else:
                logging.error(f"==> [SSH-R] Reconnect gagal. Retry dalam {retry_delay}s...")
                _reverse_stop.wait(retry_delay)
                retry_delay = min(retry_delay * 2, 60)

    logging.info("==> [SSH-R] Watchdog berhenti.")


# =============================================
# MYSQL SSH TUNNEL (ssh -L) — Opsional
# =============================================
_mysql_tunnel = None
_mysql_lock = threading.Lock()
_mysql_stop = threading.Event()

def start_mysql_tunnel():
    """Buka forward tunnel: localhost:3307 → VPS MySQL:3306."""
    global _mysql_tunnel
    try:
        from sshtunnel import SSHTunnelForwarder
    except ImportError:
        logging.error("==> [SSH-L] Library 'sshtunnel' belum terinstal!")
        return False

    with _mysql_lock:
        if _mysql_tunnel and _mysql_tunnel.is_active:
            return True
        if _mysql_tunnel:
            try:
                _mysql_tunnel.stop()
            except Exception:
                pass
            _mysql_tunnel = None

        try:
            _mysql_tunnel = SSHTunnelForwarder(
                (SSH_CONFIG['host'], SSH_CONFIG['port']),
                ssh_username=SSH_CONFIG['username'],
                ssh_password=SSH_CONFIG['password'],
                remote_bind_address=('127.0.0.1', 3306),
                local_bind_address=('127.0.0.1', 3307),
                set_keepalive=30,
            )
            _mysql_tunnel.start()
            logging.info("==> [SSH-L] MySQL Tunnel AKTIF: localhost:3307 → VPS:3306")
            return True
        except Exception as e:
            logging.error(f"==> [SSH-L] MySQL Tunnel GAGAL: {e}")
            _mysql_tunnel = None
            return False


def stop_mysql_tunnel():
    global _mysql_tunnel
    with _mysql_lock:
        if _mysql_tunnel:
            try:
                _mysql_tunnel.stop()
            except Exception:
                pass
            _mysql_tunnel = None
    logging.info("==> [SSH-L] MySQL Tunnel ditutup.")


def _mysql_tunnel_watchdog():
    logging.info("==> [SSH-L] Watchdog aktif...")
    retry_delay = 5
    while not _mysql_stop.is_set():
        _mysql_stop.wait(15)
        if _mysql_stop.is_set():
            break
        with _mysql_lock:
            is_alive = _mysql_tunnel and _mysql_tunnel.is_active
        if not is_alive:
            logging.warning("==> [SSH-L] Tunnel MATI! Reconnect...")
            if start_mysql_tunnel():
                retry_delay = 5
            else:
                _mysql_stop.wait(retry_delay)
                retry_delay = min(retry_delay * 2, 60)
    logging.info("==> [SSH-L] Watchdog berhenti.")


# =============================================
# INIT & SHUTDOWN
# =============================================
def init_all_tunnels():
    """Inisialisasi semua tunnel yang diaktifkan."""
    if ENABLE_REVERSE_TUNNEL:
        logging.info("==> [INIT] Memulai Reverse SSH Tunnel (web access via VPS)...")
        start_reverse_tunnel()
        threading.Thread(target=_reverse_tunnel_watchdog, daemon=True, name="ReverseSSH-WD").start()
    else:
        logging.info("==> [SSH-R] Reverse Tunnel DIMATIKAN.")

    if ENABLE_MYSQL_TUNNEL:
        logging.info("==> [INIT] Memulai MySQL SSH Tunnel (DB remote)...")
        start_mysql_tunnel()
        threading.Thread(target=_mysql_tunnel_watchdog, daemon=True, name="MySQLSSH-WD").start()
    else:
        logging.info("==> [SSH-L] MySQL Tunnel DIMATIKAN.")


def shutdown_all_tunnels():
    """Hentikan semua tunnel."""
    if ENABLE_REVERSE_TUNNEL:
        _reverse_stop.set()
        stop_reverse_tunnel()
    if ENABLE_MYSQL_TUNNEL:
        _mysql_stop.set()
        stop_mysql_tunnel()


# =============================================
if __name__ == '__main__':
    print("=" * 50)
    print("  REKAP DSAJA - Production Dashboard")
    print("  DB: MySQL lokal (localhost:3306)")
    print("  Web Lokal : http://localhost:8000")
    if ENABLE_REVERSE_TUNNEL:
        print(f"  Web VPS   : http://{SSH_CONFIG['host']}:{REVERSE_TUNNEL_REMOTE_PORT}")
    print("=" * 50)

    # ── 1. Nyalakan SSH Tunnels ──
    init_all_tunnels()

    # ── 2. Jalankan Waitress server ──
    try:
        server_host = os.getenv('SERVER_HOST', '0.0.0.0')
        server_port = int(os.getenv('SERVER_PORT', 8000))
        print(f"==> [INIT] Server Waitress berjalan di host {server_host} port {server_port}...\n")
        serve(app, host=server_host, port=server_port, threads=16)
    except KeyboardInterrupt:
        print("\n==> [INFO] Server dihentikan oleh user (Ctrl+C)")
    finally:
        # ── 3. Shutdown semua tunnel ──
        shutdown_all_tunnels()
        print("==> [INFO] Shutdown selesai. Bye!")


