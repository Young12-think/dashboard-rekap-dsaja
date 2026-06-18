# app_queries/__init__.py
# ─────────────────────────────────────────────────────────────
# Package entrypoint — re-export semua fungsi publik agar
# server.py bisa import langsung:  from app_queries import *
# ─────────────────────────────────────────────────────────────

from .db_core import get_db, query, dec, check_db_health
from .auth import verify_login, ensure_users_table, hash_password, get_all_users, add_user, delete_user, change_password
from .po_management import (
    get_po_stocks, save_po_stock, close_po_stock,
    get_distinct_po_numbers, get_po_monitor_data,
    ensure_po_stock_table,
)
from .production import (
    get_production_data, get_summary_data, get_types,
    get_history_data, get_recent_data,
)
from .transactions import (
    get_transaction_data,
    get_support_items, get_support_vendors,
    get_others_items,
)
from .vendors import get_vendor_data
from .daily_reports import (
    get_daily_delivery, get_daily_support,
    get_daily_limbah, get_daily_cane,
    get_daily_transfer_gula,
)
from .report_tebu import get_report_tebu
from .report_blabak import get_blabak_report
from .report_others import get_others_report
from .analytics import get_analytics_data, get_shift_productivity_data, get_top_transportir_data, get_history_insights_data

__all__ = [
    # db
    'get_db', 'query', 'dec', 'check_db_health',
    # auth
    'verify_login', 'ensure_users_table', 'hash_password', 'get_all_users', 'add_user', 'delete_user', 'change_password',
    # po
    'get_po_stocks', 'save_po_stock', 'close_po_stock',
    'get_distinct_po_numbers', 'get_po_monitor_data', 'ensure_po_stock_table',
    # production
    'get_production_data', 'get_summary_data', 'get_types',
    'get_history_data', 'get_recent_data',
    # transactions
    'get_transaction_data', 'get_support_items', 'get_support_vendors', 'get_others_items',
    # vendors
    'get_vendor_data',
    # daily reports
    'get_daily_delivery', 'get_daily_support',
    'get_daily_limbah', 'get_daily_cane',
    'get_daily_transfer_gula',
    # tebu report
    'get_report_tebu',
    # blabak report
    'get_blabak_report',
    # others report
    'get_others_report',
    # analytics
    'get_analytics_data',
    'get_shift_productivity_data',
    'get_top_transportir_data',
    'get_history_insights_data',
]
