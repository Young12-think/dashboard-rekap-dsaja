# app_queries/auth.py
# ─────────────────────────────────────────────────────────────
# User authentication: hash, ensure table, verify login.
# ─────────────────────────────────────────────────────────────

import bcrypt
import hashlib
import os

from .db_core import get_db, query

# =============================================
# Password Hashing (bcrypt — slow, salt built-in)
# =============================================
def hash_password(password: str, salt: str = None) -> tuple:
    """
    Hash password dengan bcrypt.
    `salt` parameter dipertahankan untuk kompatibilitas tapi tidak dipakai —
    bcrypt sudah meng-handle salt internal.
    Return: (hashed_password, salt_legacy).

    Simpan encoded bcrypt standar (60 karakter), bukan representasi hex
    dari digest (120 karakter), supaya tetap kompatibel dengan instalasi
    lama yang masih memiliki password_hash VARCHAR(64).
    """
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    return hashed.decode('ascii'), ''


def _check_bcrypt_password(password: str, stored_hash: str) -> bool:
    """Cek hash bcrypt standar maupun format hex legacy yang pernah dipakai."""
    try:
        if stored_hash.startswith(('$2a$', '$2b$', '$2y$')):
            encoded_hash = stored_hash.encode('ascii')
        else:
            # Versi sebelumnya menyimpan bytes bcrypt sebagai hex 120 char.
            encoded_hash = bytes.fromhex(stored_hash)
        return bcrypt.checkpw(password.encode('utf-8'), encoded_hash)
    except (TypeError, ValueError, UnicodeEncodeError):
        return False

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
                password_hash VARCHAR(128) NOT NULL,
                salt VARCHAR(32) NOT NULL,
                role VARCHAR(32) DEFAULT 'viewer',
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_username (username)
            ) ENGINE=InnoDB
        """)
        conn.commit()

        # Migrasi schema untuk instalasi lama
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
        cur.execute("ALTER TABLE rekap_users MODIFY password_hash VARCHAR(128) NOT NULL")
        conn.commit()

        # Cek apakah ada user
        cur.execute("SELECT COUNT(*) AS cnt FROM rekap_users")
        row = cur.fetchone()
        count = row[0] if isinstance(row, tuple) else row.get('cnt', 0)

        if count == 0:
            default_pw = os.getenv('DEFAULT_ADMIN_PASSWORD', 'Rmi@dm1n2026!')
            pwd, salt = hash_password(default_pw)
            cur.execute(
                "INSERT INTO rekap_users (username, password_hash, salt, role) VALUES (%s, %s, %s, %s)",
                ('admin', pwd, salt, 'admin')
            )
            conn.commit()
            print("[AUTH] Default admin created. SEGERA GANTI PASSWORD via menu User Management!")
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

    stored_hash = result['password_hash'] or ''
    if stored_hash.startswith(('$2a$', '$2b$', '$2y$')) or len(stored_hash) == 120:
        if _check_bcrypt_password(password, stored_hash):
            return {'username': result['username'], 'role': result.get('role', 'viewer')}
        return None

    if len(stored_hash) == 64:
        legacy_hash = hashlib.sha256(f"{result['salt']}{password}".encode('utf-8')).hexdigest()
        if legacy_hash == stored_hash:
            new_hash, new_salt = hash_password(password)
            conn = get_db()
            if conn:
                cur = None
                try:
                    cur = conn.cursor()
                    cur.execute("UPDATE rekap_users SET password_hash = %s, salt = %s WHERE username = %s", (new_hash, new_salt, result['username']))
                    conn.commit()
                except Exception as e:
                    # Password yang valid tetap boleh login walaupun migrasi
                    # schema/hash gagal (mis. DB server masih VARCHAR(64) atau
                    # user database tidak memiliki privilege ALTER/UPDATE).
                    print(f"[DB ERROR] legacy password migration: {e}")
                finally:
                    if cur:
                        cur.close()
                    conn.close()
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

def change_password(user_id: int, new_password: str) -> tuple:
    """
    Ganti password user berdasarkan ID.
    Return: (success: bool, message: str)
    """
    ensure_users_table()

    # 1. Validasi Password
    new_password = (new_password or '').strip()
    if len(new_password) < 6:
        return False, "Password minimal 6 karakter."
    if not any(char.isdigit() for char in new_password) or not any(char.isalpha() for char in new_password):
        return False, "Password harus kombinasi huruf dan angka."

    # 2. Cek apakah user ada
    check_sql = "SELECT username FROM rekap_users WHERE id = %s LIMIT 1"
    target = query(check_sql, (user_id,), one=True)
    if not target:
        return False, "User tidak ditemukan."

    # 3. Hash password baru & update
    pwd_hash, salt = hash_password(new_password)

    conn = get_db()
    if not conn:
        return False, "Database error."
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE rekap_users SET password_hash = %s, salt = %s WHERE id = %s",
            (pwd_hash, salt, user_id)
        )
        conn.commit()
        cur.close()
        return True, f"Password user \"{target['username']}\" berhasil diubah!"
    except Exception as e:
        print(f"[DB ERROR] change_password: {e}")
        return False, "Gagal mengubah password."
    finally:
        conn.close()
