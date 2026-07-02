from app_queries.db_core import query

res = query("SELECT DISTINCT Type, ItemName FROM data_timbang WHERE LOWER(ItemName) LIKE '%bagasse%' OR LOWER(Type) LIKE '%bagasse%' OR LOWER(ItemName) LIKE '%baggase%' OR LOWER(Type) LIKE '%baggase%'")
print(res)
