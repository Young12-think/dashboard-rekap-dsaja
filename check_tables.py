import mysql.connector
from db_config import DB_CONFIG

def check_tables():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        query = """
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name IN (
          'gula_stok','gula_delivery','gula_penerimaan',
          'gula_reject_log','mol_stok_tangki',
          'mol_delivery','mol_penerimaan'
        )
        ORDER BY table_name, ordinal_position;
        """
        
        cursor.execute(query, (DB_CONFIG['database'],))
        results = cursor.fetchall()
        
        if not results:
            print("No tables found in the specified list.")
        else:
            for row in results:
                print(f"{row[0]} | {row[1]} | {row[2]}")
                
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_tables()
