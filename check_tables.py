import sys
import os
sys.path.append(r'd:\AI\TEST\MT5')
from app_queries.db_core import query

sql = '''
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = DATABASE() AND table_name IN (
  'gula_stok','gula_delivery','gula_penerimaan',
  'gula_reject_log','gudang_luar_stok',
  'mol_delivery','mol_penerimaan','mol_stok_tangki',
  'mst_gudang_luar','mst_jenis_reject'
)
ORDER BY table_name, ordinal_position;
'''
res = query(sql)
if res:
    for r in res:
        print(f"{r['TABLE_NAME']} | {r['COLUMN_NAME']} | {r['DATA_TYPE']}")
else:
    print("No results or tables not found.")
