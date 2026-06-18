# MySQL Database Configuration
# Database: timbangan, Table: timbang_data
#
# DEFAULT: Koneksi ke MySQL LOKAL (port 3306)
# OPSIONAL: Jika ingin pakai MySQL remote via SSH Tunnel, ganti port ke 3307

import os
from dotenv import load_dotenv

# Muat variabel dari .env
load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", "raimu123"),
    "database": os.getenv("DB_NAME", "timbangan"),
    "charset": "utf8mb4",
    "collation": "utf8mb4_general_ci",
    "autocommit": True,
    "pool_name": "dashboard_pool",
    "pool_size": 10,
    "pool_reset_session": True,
    "use_pure": True
}
