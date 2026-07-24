import pathlib

p = pathlib.Path('templates/rmi_balance_dashboard.html')
content = p.read_text(encoding='utf-8')

target = """              <div class="overview-meta">
                <span class="overview-meta-item"><i class="fa-regular fa-calendar"></i> <span
                    id="overview-date">-</span></span>
                <span id="overview-report-status" class="overview-status-badge draft">Draft</span>
                <span id="overview-balance-status" class="overview-status-badge balanced">Balanced</span>
                <span class="overview-meta-item"><i class="fa-regular fa-clock"></i> <span
                    id="overview-last-update">-</span></span>
                <span class="overview-meta-item"><i class="fa-solid fa-database"></i> <span id="overview-source">Input
                    DB</span></span>
                <label class="overview-date-control">
                  <i class="fa-solid fa-calendar-day"></i>
                  <input type="date" id="overview-date-picker">
                </label>
                <button class="btn-sm" onclick="fetchRmiData()"><i class="fa-solid fa-rotate"></i> Refresh</button>
              </div>
            </div>"""

replacement = """              <div class="overview-meta">
                <span class="overview-meta-item"><i class="fa-regular fa-calendar"></i> <span
                    id="overview-date">-</span></span>
                <span id="overview-report-status" class="overview-status-badge draft">Draft</span>
                <span id="overview-balance-status" class="overview-status-badge balanced">Balanced</span>
                <label class="overview-date-control">
                  <i class="fa-solid fa-calendar-day"></i>
                  <input type="date" id="overview-date-picker">
                </label>
                <button class="btn-sm" onclick="fetchRmiData()"><i class="fa-solid fa-rotate"></i> Refresh</button>
              </div>
            </div>"""

if target in content:
    content = content.replace(target, replacement)
    try:
        p.write_text(content, encoding='utf-8')
        print("Success")
    except Exception as e:
        print("Error:", e)
else:
    print("Target not found")
