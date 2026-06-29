from playwright.sync_api import sync_playwright
import time

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('http://localhost:8000/login')
        
        # We don't know the password, maybe we can just set the cookie?
        # Let's try password='admin' or just use evaluate to set the cookie
        
        try:
            page.fill('input[name="username"]', 'admin')
            page.fill('input[name="password"]', 'admin')
            page.click('button[type="submit"]')
            page.wait_for_url('http://localhost:8000/', timeout=3000)
        except Exception:
            pass # Maybe not needed or login failed
            
        page.goto('http://localhost:8000/login')
        page.fill('input[name="username"]', 'admin') # or whatever
        page.fill('input[name="password"]', 'admin')
        page.click('button[type="submit"]')
        
        page.wait_for_url('**/dashboard')
        page.goto('http://localhost:8000/rmi-balance')
        
        page.wait_for_selector('.rmi-content', timeout=10000)
        page.wait_for_selector('.rmi-content')
        
        # Click the Laporan Harian tab
        page.evaluate('document.querySelector("li[data-tab=\'laporan-harian\']").click()')
        
        time.sleep(2)
        
        # Take screenshot
        page.screenshot(path="screenshot.png", full_page=True)
        
        # Check what is in the DOM
        inner_html = page.evaluate('document.getElementById("tab-laporan-harian").innerHTML')
        wrapper = page.evaluate('document.querySelector(".laporan-harian-wrapper")')
        if wrapper:
            wrapper_display = page.evaluate('window.getComputedStyle(document.querySelector(".laporan-harian-wrapper")).display')
            wrapper_height = page.evaluate('document.querySelector(".laporan-harian-wrapper").offsetHeight')
            print('Display:', wrapper_display)
            print('Height:', wrapper_height)
        else:
            print('WRAPPER NOT FOUND')
            
        print('HTML Snippet:', inner_html[:1000].strip().encode('utf-8', 'replace').decode('utf-8'))
        browser.close()

try:
    main()
except Exception as e:
    import traceback
    with open("error.txt", "w", encoding="utf-8") as f:
        f.write(traceback.format_exc())
    print('ERROR, see error.txt')
