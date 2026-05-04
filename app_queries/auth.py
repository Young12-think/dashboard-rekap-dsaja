# app_queries/auth.py
# ─────────────────────────────────────────────────────────────
# User authentication: hash, ensure table, verify login.
# ─────────────────────────────────────────────────────────────

import hashlib
import os

from .db_core import get_db, query

# =============================================
# Password Hashing
# =============================================
def hash_password(password: str, salt: str = None) -> tuple:
    """
    Hash password dengan SHA-256 + salt.
    Return: (hashed_password, salt)
    """
    if salt is None:
        salt = os.urandom(16).hex()  # 32 char hex salt
    hashed = hashlib.sha256(f"{salt}{password}".encode('utf-8')).hexdigest()
    return hashed, salt

# =============================================
# Table Bootstrap
# =============================================
def ensure_users_table():
    """
    Buat tabel rekap_users jika belum ada.
    Auto-create default admin:admin123 jika tabel kosong.
    """
    conn = get_db()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rekap_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                password_hash VARCHAR(64) NOT NULL,
                salt VARCHAR(32) NOT NULL,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_username (username)
            ) ENGINE=InnoDB
        """)
        conn.commit()

        # Cek apakah ada user
        cur.execute("SELECT COUNT(*) AS cnt FROM rekap_users")
        row = cur.fetchone()
        count = row[0] if isinstance(row, tuple) else row.get('cnt', 0)

        if count == 0:
            # Buat default user: admin / admin123
            pwd, salt = hash_password('admin123')
            cur.execute(
                "INSERT INTO rekap_users (username, password_hash, salt) VALUES (%s, %s, %s)",
                ('admin', pwd, salt)
            )
            conn.commit()
            print("[AUTH] Default user created: username=admin, password=admin123")

        cur.close()
        return True
    except Exception as e:
        print(f"[DB ERROR] ensure_users_table: {e}")
        return False
    finally:
        conn.close()

# =============================================
# Login Verification
# =============================================
def verify_login(username: str, password: str) -> dict | None:
    """
    Verifikasi username + password.
    FULLY SQL INJECTION SAFE — menggunakan parameterized query.
    Return: dict user jika valid, None jika tidak valid.
    """
    ensure_users_table()

    # Parameterized query: username di-bind langsung, TIDAK digabung ke string SQL
    sql = """
        SELECT username, password_hash, salt
        FROM rekap_users
        WHERE username = %s AND is_active = 1
        LIMIT 1
    """
    # query() sudah menggunakan cursor.execute(sql, params) — safe dari SQL injection
    result = query(sql, (username,), one=True)

    if not result:
        return None

    # Bandingkan hash password dari input dengan yang tersimpan
    pw_hash, _ = hash_password(password, result['salt'])
    if pw_hash == result['password_hash']:
        return {'username': result['username']}

    return None
