import os
from dotenv import load_dotenv

load_dotenv()
try:
    import mysql.connector
    conn = mysql.connector.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', 3306),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', 'raimu123'),
        database=os.getenv('DB_NAME', 'timbangan')
    )
    cursor = conn.cursor()
    query = """
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_name IN (
      'gula_stok','gula_delivery','gula_penerimaan',
      'gula_reject_log','mol_stok_tangki',
      'mol_delivery','mol_penerimaan'
    )
    ORDER BY table_name, ordinal_position;
    """
    cursor.execute(query)
    results = cursor.fetchall()
    
    with open('query_out.txt', 'w') as f:
        for row in results:
            f.write(f"{row[0]} | {row[1]} | {row[2]}\n")
except Exception as e:
    with open('query_out.txt', 'w') as f:
        f.write(f"Error: {e}\n")
