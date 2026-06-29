import re
with open('d:/AI/TEST/MT5/dump.html', 'r', encoding='utf-8') as f:
    text = f.read()
match = re.search(r'<div class="rmi-tab-pane" id="tab-laporan-harian">(.*?)</div>\s*<!-- TAB: GRAFIK & ANALITIK -->', text, re.DOTALL)
if match:
    print('FOUND HTML:')
    print(match.group(1)[:2000])
else:
    print('NOT FOUND')
