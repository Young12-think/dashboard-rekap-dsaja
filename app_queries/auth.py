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
        
        # Buat tabel dengan kolom role jika belum ada sama sekali
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rekap_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                password_hash VARCHAR(64) NOT NULL,
                salt VARCHAR(32) NOT NULL,
                role VARCHAR(32) DEFAULT 'viewer',
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_username (username)
            ) ENGINE=InnoDB
        """)
        conn.commit()

        # Migrasi kolom 'role' jika tabel sudah ada sebelumnya tapi belum punya kolom ini
        cur.execute("""
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'rekap_users' 
              AND COLUMN_NAME = 'role'
        """)
        if not cur.fetchone():
            cur.execute("ALTER TABLE rekap_users ADD COLUMN role VARCHAR(32) DEFAULT 'viewer'")
            conn.commit()

        # Cek apakah ada user
        cur.execute("SELECT COUNT(*) AS cnt FROM rekap_users")
        row = cur.fetchone()
        count = row[0] if isinstance(row, tuple) else row.get('cnt', 0)

        if count == 0:
            # Buat default user: admin / admin123
            pwd, salt = hash_password('admin123')
            cur.execute(
                "INSERT INTO rekap_users (username, password_hash, salt, role) VALUES (%s, %s, %s, %s)",
                ('admin', pwd, salt, 'admin')
            )
            conn.commit()
            print("[AUTH] Default user created: username=admin, password=admin123, role=admin")
        else:
            # Pastikan user 'admin' memiliki role 'admin'
            cur.execute("UPDATE rekap_users SET role = 'admin' WHERE username = 'admin'")
            conn.commit()

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
        SELECT username, password_hash, salt, role
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
        return {'username': result['username'], 'role': result.get('role', 'viewer')}

    return None

# =============================================
# User Management Helpers
# =============================================
import re

def get_all_users() -> list:
    """
    Ambil semua daftar user dari database.
    """
    ensure_users_table()
    sql = """
        SELECT id, username, role, is_active, created_at
        FROM rekap_users
        ORDER BY username ASC
    """
    result = query(sql)
    return result or []

def add_user(username: str, password_raw: str, role: str) -> tuple:
    """
    Tambah user baru dengan validasi keamanan.
    Return: (success: bool, message: str)
    """
    ensure_users_table()
    
    # 1. Sanitize & Validasi Username
    username = (username or '').strip()
    if len(username) < 4:
        return False, "Username minimal 4 karakter."
    if not re.match(r"^[a-zA-Z0-9_]+$", username):
        return False, "Username hanya boleh huruf, angka, dan underscore (_)."
        
    # 2. Validasi Password
    password_raw = (password_raw or '').strip()
    if len(password_raw) < 6:
        return False, "Password minimal 6 karakter."
    if not any(char.isdigit() for char in password_raw) or not any(char.isalpha() for char in password_raw):
        return False, "Password harus kombinasi huruf dan angka."

    # 3. Validasi Role
    if role not in ('admin', 'viewer', 'viewer_report_only'):
        role = 'viewer'

    # 4. Cek duplikasi username
    check_sql = "SELECT id FROM rekap_users WHERE username = %s LIMIT 1"
    existing = query(check_sql, (username,), one=True)
    if existing:
        return False, "Username sudah terdaftar."

    # 5. Hash password & simpan
    pwd_hash, salt = hash_password(password_raw)
    
    conn = get_db()
    if not conn:
        return False, "Database error."
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO rekap_users (username, password_hash, salt, role) VALUES (%s, %s, %s, %s)",
            (username, pwd_hash, salt, role)
        )
        conn.commit()
        cur.close()
        return True, "User berhasil ditambahkan!"
    except Exception as e:
        print(f"[DB ERROR] add_user: {e}")
        return False, "Gagal menyimpan user ke database."
    finally:
        conn.close()

def delete_user(user_id: int) -> tuple:
    """
    Hapus user berdasarkan ID (tidak boleh menghapus admin utama).
    """
    ensure_users_table()
    
    # Cek apakah target hapus adalah admin utama
    check_sql = "SELECT username FROM rekap_users WHERE id = %s LIMIT 1"
    target = query(check_sql, (user_id,), one=True)
    if not target:
        return False, "User tidak ditemukan."
    if target['username'] == 'admin':
        return False, "Akun admin utama tidak boleh dihapus!"

    conn = get_db()
    if not conn:
        return False, "Database error."
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM rekap_users WHERE id = %s", (user_id,))
        conn.commit()
        cur.close()
        return True, "User berhasil dihapus!"
    except Exception as e:
        print(f"[DB ERROR] delete_user: {e}")
        return False, "Gagal menghapus user."
    finally:
        conn.close()
