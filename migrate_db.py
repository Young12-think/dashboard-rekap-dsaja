# migrate_db.py
import mysql.connector
import sys
import time
from db_config import DB_CONFIG

def run_migration():
    print("=" * 60)
    print("Mulai Migrasi Database: Menambahkan Kolom Tanggal Terindeks")
    print("=" * 60)
    
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cur = conn.cursor()
    except Exception as e:
        print(f"[ERROR] Koneksi database gagal: {e}")
        sys.exit(1)
        
    try:
        # 1. Cek apakah kolom Tanggal_Keluar_Clean sudah ada
        cur.execute("""
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'data_timbang' 
              AND COLUMN_NAME = 'Tanggal_Keluar_Clean'
        """)
        col_exists = cur.fetchone() is not None
        
        if not col_exists:
            print("[1/2] Menambahkan kolom 'Tanggal_Keluar_Clean' (Stored Generated Column)...")
            print("Proses ini dapat memakan waktu hingga satu menit karena memperbarui 158.000+ baris data.")
            start_time = time.time()
            
            cur.execute("""
                ALTER TABLE data_timbang 
                ADD COLUMN Tanggal_Keluar_Clean DATE GENERATED ALWAYS AS (
                    STR_TO_DATE(SUBSTRING_INDEX(Tanggal_Keluar, ' ', 1), '%d/%m/%Y')
                ) STORED
            """)
            conn.commit()
            print(f"-> Kolom berhasil ditambahkan dalam {time.time() - start_time:.2f} detik.")
        else:
            print("[1/2] Kolom 'Tanggal_Keluar_Clean' sudah ada. Melewati penambahan.")
            
        # 2. Cek apakah index idx_tanggal_keluar_clean sudah ada
        cur.execute("""
            SHOW INDEX FROM data_timbang 
            WHERE Key_name = 'idx_tanggal_keluar_clean'
        """)
        idx_exists = cur.fetchone() is not None
        
        if not idx_exists:
            print("[2/2] Membuat index 'idx_tanggal_keluar_clean'...")
            start_time = time.time()
            cur.execute("""
                ALTER TABLE data_timbang 
                ADD INDEX idx_tanggal_keluar_clean (Tanggal_Keluar_Clean)
            """)
            conn.commit()
            print(f"-> Index berhasil dibuat dalam {time.time() - start_time:.2f} detik.")
        else:
            print("[2/2] Index 'idx_tanggal_keluar_clean' sudah ada. Melewati pembuatan.")
            
        print("\n[SUKSES] Migrasi database selesai dengan sukses!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n[ERROR] Migrasi gagal: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    run_migration()
