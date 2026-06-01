# app_queries/db_core.py
# ─────────────────────────────────────────────────────────────
# Database connection pooling & low-level helpers.
# Semua modul lain import `get_db`, `query`, `dec` dari sini.
# ─────────────────────────────────────────────────────────────

import mysql.connector
from mysql.connector import pooling
from decimal import Decimal
import threading

from db_config import DB_CONFIG

# =============================================
# Connection Pool (thread-safe)
# =============================================
_pool_lock = threading.Lock()
db_pool = None

def get_db_pool():
    global db_pool
    if db_pool is None:
        with _pool_lock:
            if db_pool is None:  # double-check inside lock
                try:
                    db_pool = mysql.connector.pooling.MySQLConnectionPool(**DB_CONFIG)
                except Exception as e:
                    print(f"[DB ERROR] Pool creation failed: {e}")
                    return None
    return db_pool

def _reset_pool():
    """Force recreate the pool (called on fatal pool errors)."""
    global db_pool
    with _pool_lock:
        db_pool = None
    print("[DB INFO] Pool reset — will recreate on next request")

def get_db():
    pool = get_db_pool()
    if not pool:
        return None
    for attempt in range(3):
        try:
            conn = pool.get_connection()
            return conn
        except Exception as e:
            if attempt < 2:
                import time
                time.sleep(0.5 * (attempt + 1))
            else:
                print(f"[DB ERROR] Connection failed after 3 attempts: {e}")
                _reset_pool()
    return None

# =============================================
# Generic Query Helper
# =============================================
def query(sql, params=None, one=False):
    conn = get_db()
    if not conn:
        return None
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params or ())
        result = cur.fetchone() if one else cur.fetchall()
        cur.close()
        return result
    except Exception as e:
        print(f"[DB ERROR] {e}")
        return None
    finally:
        try:
            conn.close()
        except Exception:
            pass

# =============================================
# Decimal → float converter
# =============================================
def dec(data):
    """Convert Decimal values to float in query results."""
    if data is None:
        return data
    if isinstance(data, list):
        return [{k: float(v) if isinstance(v, Decimal) else v for k, v in row.items()} for row in data]
    if isinstance(data, dict):
        return {k: float(v) if isinstance(v, Decimal) else v for k, v in data.items()}
    return data

# =============================================
# Health Check
# =============================================
def check_db_health():
    conn = get_db()
    db_status = "connected" if conn else "disconnected"
    if conn:
        try:
            conn.close()
        except Exception:
            pass
    return db_status

