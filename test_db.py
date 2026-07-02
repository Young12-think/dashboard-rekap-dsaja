from app_queries.db_core import query

res = query("SELECT DISTINCT ItemName FROM data_timbang WHERE ItemName IS NOT NULL")
for r in res:
    print(r['ItemName'])
