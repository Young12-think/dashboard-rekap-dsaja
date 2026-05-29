import os, re
from pathlib import Path
from dotenv import load_dotenv

# ==================== SETTING PORTABLE BROWSER ====================
# Force Playwright untuk mengunduh & menggunakan browser dari dalam folder project ini
PROJECT_DIR = Path(__file__).resolve().parent
os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(PROJECT_DIR / "playwright_browsers")
# ==================================================================

import asyncio
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup

load_dotenv()
BASE = os.getenv("BASE_URL", "").rstrip("/")
USER = os.getenv("RMI_USER")
PASS = os.getenv("RMI_PASS")
TARGET_PATH = os.getenv("TARGET_PATH", "/crushingmonitor/MDC")

LOGIN_URL = f"{BASE}/auth/login"
MOD_SEL_URL = f"{BASE}/auth/moduleselector"
TARGET_URL  = f"{BASE}{TARGET_PATH}"

# selector login
USER_SELECTOR   = 'input[name="uname"]'
PASS_SELECTOR   = 'input[name="passwd"]'
SUBMIT_SELECTOR = 'button[type="submit"], input[type="submit"]'

# selector tombol
APPS_SELECTOR    = 'a.btn-info[href="/auth"]'
PROCEED_SELECTOR = "button.btn.btn-md.btn-primary.btn-block, button[type='submit']"

STORAGE_STATE = Path("rmi_storage_state.json")

# ==================== UTIL & PARSER ====================

def _to_float(s: str):
    if s is None:
        return None
    s = str(s).strip()
    s = s.replace(".", "").replace(",", ".")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None

def _extract_cy_total_truck(html_text: str):
    """Ambil nilai CANE YARD -> TOTAL ALL -> TRUCK dari HTML."""
    soup = BeautifulSoup(html_text, "lxml")
    for tbl in soup.select("table.table, table.table-striped, table.table-bordered"):
        for tr in tbl.select("tbody tr"):
            th_or_td = tr.find("th") or tr.find("td")
            label = th_or_td.get_text(strip=True).upper() if th_or_td else ""
            if "TOTAL ALL" in label:
                td = tr.find("td", class_=lambda c: c and "total_cy" in c.split())
                if td:
                    return _to_float(td.get_text())

    # fallback via teks kalau struktur berubah
    text = soup.get_text("\n", strip=True)
    m = re.search(r"CANE\s*YARD.*?TOTAL\s+ALL.*?TRUCK[^\d\-]*([0-9][0-9\.,]*)",
                  text, re.I | re.S)
    return _to_float(m.group(1)) if m else None

def _has_login_form(page):
    return page.locator(USER_SELECTOR).count() > 0 and page.locator(PASS_SELECTOR).count() > 0

def _has_mdc_table(container):
    try:
        container.wait_for_selector("table.table", timeout=2500)
        return True
    except:
        return False

# ==================== FLOW HELPERS ====================

def _go_to_apps(page):
    print("[STEP] click APPS button")
    page.wait_for_selector(APPS_SELECTOR, timeout=5000)
    page.locator(APPS_SELECTOR).first.click()
    page.wait_for_load_state("domcontentloaded")

def _do_login_if_needed(page):
    """Asumsikan sudah di /auth/login, lakukan login."""
    if _has_login_form(page):
        print("[STEP] do login")
        page.locator(USER_SELECTOR).fill(USER)
        page.locator(PASS_SELECTOR).fill(PASS)
        page.locator(SUBMIT_SELECTOR).click()
        page.wait_for_load_state("networkidle")

def _proceed_default_module(page):
    print("[STEP] click Proceed (module selector)")
    page.wait_for_selector(PROCEED_SELECTOR, timeout=8000)
    page.locator(PROCEED_SELECTOR).click()
    page.wait_for_load_state("networkidle")

def _fast_path_try_target(page):
    """
    Coba langsung buka TARGET_URL mengandalkan cookies (storage_state).
    Return True jika langsung bisa melihat tabel MDC (sesi masih valid).
    """
    print("[STEP] fast-path: goto MDC langsung")
    page.goto(TARGET_URL, wait_until="domcontentloaded")
    # Kalau diarahkan ke /auth/login, berarti sesi kadaluarsa
    if "login" in page.url.lower():
        print("[INFO] fast-path gagal: diarahkan ke login")
        return False
    # Kadang redirect ke moduleselector kalau butuh pilih modul dulu
    if "/auth/moduleselector" in page.url.lower():
        print("[INFO] fast-path diarahkan ke moduleselector (butuh Proceed)")
        return False
    # Jika tetap di MDC dan tabel ada, sukses
    try:
        page.wait_for_selector("table.table", timeout=4000)
        print("[INFO] fast-path sukses: tabel MDC terlihat")
        return True
    except:
        print("[INFO] fast-path tidak menemukan tabel, akan fallback")
        return False

def _full_login_flow(page):
    """
    Jalur lengkap: Home -> APPS -> Login -> Proceed -> (kembali) MDC.
    """
    print("[STEP] goto home")
    page.goto(f"{BASE}/", wait_until="domcontentloaded")

    _go_to_apps(page)                 # klik APPS
    if "login" not in page.url.lower():
        # sebagian flow bisa me-redirect ke login otomatis
        page.goto(LOGIN_URL, wait_until="domcontentloaded")

    _do_login_if_needed(page)         # isi uname/passwd bila form ada

    # Jika setelah login, bukan di moduleselector, arahkan ke sana
    if "/auth/moduleselector" not in page.url.lower():
        page.goto(MOD_SEL_URL, wait_until="domcontentloaded")

    _proceed_default_module(page)     # klik Proceed
    # terakhir masuk ke MDC
    page.goto(TARGET_URL, wait_until="networkidle")

# ==================== PUBLIC API ====================

def get_cy_total_truck(headless: bool = True):
    """
    Fleksibel: kalau sesi masih valid -> langsung ambil.
    Kalau sesi expired/belum login -> login dulu baru ambil.
    """
    if not BASE or not USER or not PASS:
        return None # Require credentials

    # Pastikan thread memiliki event loop sendiri (Solusi untuk Flask/Waitress di thread sekunder)
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    with sync_playwright() as p:
        ctx_kwargs = {}
        if STORAGE_STATE.exists():
            ctx_kwargs["storage_state"] = STORAGE_STATE.as_posix()

        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(**ctx_kwargs)
        page = context.new_page()

        fast_ok = _fast_path_try_target(page)
        if not fast_ok:
            _full_login_flow(page)

        if "/crushingmonitor" not in page.url.lower():
            page.goto(TARGET_URL, wait_until="networkidle")

        container = page
        if not _has_mdc_table(page):
            for fr in page.frames:
                u = (fr.url or "") + " " + (fr.name or "")
                if re.search(r"(crushing|mdc)", u, re.I):
                    if _has_mdc_table(fr):
                        container = fr
                        break

        html = container.content()
        value = _extract_cy_total_truck(html)
        digit_str = None

        if value is not None:
            digit_str = str(int(value))     # int() buang bagian desimal tanpa pembulatan
        else:
            print("[WARN] Tidak menemukan nilai CANE YARD TOTAL ALL TRUCK")

        context.storage_state(path=STORAGE_STATE.as_posix())
        browser.close()
        return digit_str
