import io
from pathlib import Path
import openpyxl
from .rmi_balance import get_laporan_harian

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def resolve_template_path(template_path=None):
    """Resolve the export template independently of the process CWD.

    The server is often started by a service manager from another directory;
    a relative ``templates/excel/draft.xlsx`` then points at the wrong place.
    Resolve relative paths from the project root and fail with an actionable
    message instead of silently exporting an unformatted workbook.
    """
    candidate = Path(template_path) if template_path else Path('templates/excel/draft.xlsx')
    if not candidate.is_absolute():
        candidate = PROJECT_ROOT / candidate
    candidate = candidate.resolve()
    if not candidate.is_file():
        raise FileNotFoundError(
            f"Template export Excel tidak ditemukan: {candidate}. "
            "Pastikan templates/excel/draft.xlsx ikut dideploy ke server."
        )
    return candidate


def _num(value, default=0.0):
    try:
        return float(value if value is not None else default)
    except (TypeError, ValueError):
        return float(default)


def _position_value(position, code):
    """Find a location value by code/name without inventing missing stock."""
    wanted = str(code or '').strip().upper()
    for row in (position or {}).get('locations', []) or []:
        row_code = str(row.get('code') or '').strip().upper()
        row_name = str(row.get('name') or '').strip().upper()
        if row_code == wanted or wanted in row_name:
            return _num(row.get('stock'))
    return 0.0


def build_export_payload(data):
    """Normalize API data into the cells shared by XLSX and PDF exports."""
    gula = data.get('gula', {}) or {}
    flow = gula.get('gulaFlow', {}) or {}
    opening = flow.get('opening', {}) or {}
    reject_flow = flow.get('reject', {}) or {}
    upgrade = flow.get('upgrade', {}) or {}
    mol = data.get('molasses', {}) or {}
    cane = data.get('cane', {}) or {}
    delivery = gula.get('delivery', {}) or {}
    delivery_reject = gula.get('deliveryReject', {}) or {}
    tomorrow = gula.get('deliveryPlanBesok', {}) or {}
    position = gula.get('stockPosition', {}) or {}
    production = gula.get('produksi', {}) or {}
    production_detail = gula.get('produksiDetail', {}) or {}
    cane_previous = _num(cane.get('tebuSebelumnya'))
    cane_previous_truck = int(_num(cane.get('tebuSebelumnyaTruck')))
    cane_today = _num(cane.get('hariIni'))
    cane_today_truck = int(_num(cane.get('hariIniTruck')))

    return {
        'date': data.get('tanggal'),
        'gula': {
            'opening_gkm': _num(opening.get('gkm')),
            'opening_gkb': _num(opening.get('gkb')),
            'opening_reject': _num(reject_flow.get('opening')),
            'production_total': _num(production.get('total')),
            'production_detail': production_detail,
            'delivery_plan_gkb': _num(delivery.get('planGkb')),
            'delivery_actual_gkb': _num(delivery.get('actGkb')),
            'delivery_plan_gkm': _num(delivery.get('planGkm')),
            'delivery_actual_gkm': _num(delivery.get('actGkm')),
            'delivery_actual_total': _num(delivery.get('actual')),
            'susut_gkb': _num(delivery_reject.get('susutGkb')),
            'susut_gkm': _num(delivery_reject.get('susutGkm')),
            'downgrade_gkb': _num(delivery_reject.get('downgradeGkb')),
            'downgrade_gkm': _num(delivery_reject.get('downgradeGkm')),
            'upgrade_gkb': _num(upgrade.get('gkb')),
            'upgrade_gkm': _num(upgrade.get('gkm')),
            'upgrade_total': _num(upgrade.get('total')),
            'remelt': _num(reject_flow.get('remelt')),
            'closing_gkb': _num(gula.get('stokGkb')),
            'closing_gkm': _num(gula.get('stokGkm')),
            'closing_reject': _num(gula.get('reject')),
            'tomorrow_gkb': _num(tomorrow.get('gkb')),
            'tomorrow_gkm': _num(tomorrow.get('gkm')),
            'position_wfg': _position_value(position, 'WFG'),
            'position_wrs': _position_value(position, 'WRS'),
            'position_outsite': _position_value(position, 'OUTSITE'),
            'position_total': _num(position.get('mappedTotal')),
        },
        'molasses': {
            'open_tank_a': _num(mol.get('openTankA')),
            'open_tank_b': _num(mol.get('openTankB')),
            'production': mol.get('produksi', {}) or {},
            'tank_a': _num(mol.get('tankA')),
            'tank_b': _num(mol.get('tankB')),
            'delivery_schedule': _num((mol.get('delivery') or {}).get('schedule')),
            'delivery_actual': _num((mol.get('delivery') or {}).get('actual')),
            'delivery_diff': _num((mol.get('delivery') or {}).get('diff')),
        },
        'cane': {
            'to_date': _num(cane.get('kumulatif')),
            'to_date_truck': int(_num(cane.get('kumulatifTruck'))),
            'previous': cane_previous,
            'previous_truck': cane_previous_truck,
            'today': cane_today,
            'today_truck': cane_today_truck,
            'total_to_date': cane_previous + cane_today,
            'total_to_date_truck': cane_previous_truck + cane_today_truck,
            'per_shift': cane.get('perShift', []) or [],
        },
    }


def export_laporan_harian_to_excel(date_str, template_path):
    data = get_laporan_harian(date_str)
    payload = build_export_payload(data)

    template = resolve_template_path(template_path)
    wb = openpyxl.load_workbook(template)
    if not wb.worksheets:
        raise ValueError(f"Template export tidak memiliki worksheet: {template}")
    sheet = wb.active
    
    # 1. Date
    sheet['D3'] = payload['date'] or date_str
    
    # 2. SUGAR - Begin Inv
    gula = payload['gula']
    sheet['C8'] = gula['opening_gkm']
    sheet['C9'] = gula['opening_gkb']
    sheet['C10'] = gula['opening_reject']
    
    # 3. SUGAR - Production Gula & Shift
    prod_det = gula['production_detail']
    sheet['G9'] = prod_det.get('1', {}).get('gkb', 0)
    sheet['H9'] = prod_det.get('1', {}).get('gkm', 0)
    sheet['I9'] = prod_det.get('1', {}).get('reject', 0)
    
    sheet['G10'] = prod_det.get('2', {}).get('gkb', 0)
    sheet['H10'] = prod_det.get('2', {}).get('gkm', 0)
    sheet['I10'] = prod_det.get('2', {}).get('reject', 0)
    
    sheet['G11'] = prod_det.get('3', {}).get('gkb', 0)
    sheet['H11'] = prod_det.get('3', {}).get('gkm', 0)
    sheet['I11'] = prod_det.get('3', {}).get('reject', 0)
    sheet['C14'] = gula['production_total']
    
    # 4. SUGAR - Delivery Gula
    sheet['G16'] = gula['delivery_plan_gkb']
    sheet['H16'] = gula['delivery_actual_gkb']
    sheet['I16'] = gula['delivery_plan_gkb'] - gula['delivery_actual_gkb']
    
    sheet['G17'] = gula['delivery_plan_gkm']
    sheet['H17'] = gula['delivery_actual_gkm']
    sheet['I17'] = gula['delivery_plan_gkm'] - gula['delivery_actual_gkm']

    sheet['C16'] = gula['delivery_actual_total']
    sheet['C17'] = gula['remelt']
    sheet['C18'] = gula['closing_gkm'] + gula['closing_gkb']
    
    sheet['C21'] = gula['closing_gkb']
    sheet['C22'] = gula['closing_gkm']
    sheet['C23'] = gula['closing_reject']
    sheet['G21'] = gula['susut_gkb']
    sheet['G22'] = gula['susut_gkm']
    sheet['I21'] = gula['downgrade_gkb']
    sheet['I22'] = gula['downgrade_gkm']
    sheet['C26'] = gula['tomorrow_gkb']
    sheet['C27'] = gula['tomorrow_gkm']
    
    # 5. SUGAR - Position
    sheet['H25'] = gula['position_wfg']
    sheet['H26'] = gula['position_wrs']
    sheet['H27'] = gula['position_outsite']
    sheet['H28'] = gula['position_total']
    
    # 6. MOLASSES
    mol = payload['molasses']
    sheet['C33'] = mol['open_tank_a']
    sheet['E33'] = mol['open_tank_b']
    
    sheet['C38'] = mol['tank_a']
    sheet['E38'] = mol['tank_b']
    
    prod_mol = mol['production']
    sheet['I33'] = prod_mol.get('1', 0)
    sheet['I34'] = prod_mol.get('2', 0)
    sheet['I35'] = prod_mol.get('3', 0)
    
    sheet['G41'] = mol['delivery_schedule']
    sheet['H41'] = mol['delivery_actual']
    sheet['I41'] = mol['delivery_diff']
    
    # 7. CANE
    cane = payload['cane']
    sheet['D45'] = cane['to_date']
    sheet['G45'] = cane['to_date_truck']
    
    sheet['D46'] = cane['today']
    sheet['G46'] = cane['today_truck']
    
    shift_cane = cane['per_shift']
    s1 = next((s for s in shift_cane if s.get('shift') == 1), {})
    sheet['H49'] = s1.get('caneKg', 0)
    sheet['I49'] = s1.get('truck', 0)
    
    s2 = next((s for s in shift_cane if s.get('shift') == 2), {})
    sheet['H50'] = s2.get('caneKg', 0)
    sheet['I50'] = s2.get('truck', 0)
    
    s3 = next((s for s in shift_cane if s.get('shift') == 3), {})
    sheet['H51'] = s3.get('caneKg', 0)
    sheet['I51'] = s3.get('truck', 0)
    
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return out


def export_laporan_harian_to_pdf(date_str, template_path=None):
    """Create a printable PDF with the same sections and values as the XLSX."""
    # Validate deployment of the source template even though reportlab draws
    # the PDF itself. This prevents a server from silently using a stale layout.
    resolve_template_path(template_path)
    data = get_laporan_harian(date_str)
    payload = build_export_payload(data)

    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError as exc:
        raise RuntimeError(
            'Dependensi PDF belum terpasang. Jalankan: pip install -r requirements.txt'
        ) from exc

    def fmt(value, digits=2):
        return f'{_num(value):,.{digits}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=12 * mm, leftMargin=12 * mm,
        topMargin=10 * mm, bottomMargin=10 * mm,
        title=f'Balance Stock Product - {date_str}',
        author='RMI Balance'
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle('PdfTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=14, leading=17, alignment=TA_CENTER, spaceAfter=3)
    subtitle = ParagraphStyle('PdfSubtitle', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10, alignment=TA_CENTER, textColor=colors.HexColor('#4b5563'), spaceAfter=8)
    section = ParagraphStyle('PdfSection', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=10, leading=12, textColor=colors.white, spaceBefore=5, spaceAfter=4)
    small = ParagraphStyle('PdfSmall', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9)
    small_center = ParagraphStyle('PdfSmallCenter', parent=small, alignment=TA_CENTER)
    small_right = ParagraphStyle('PdfSmallRight', parent=small, alignment=TA_RIGHT)

    navy = colors.HexColor('#1f4e78')
    light_blue = colors.HexColor('#d9eaf7')
    light_gray = colors.HexColor('#f3f4f6')
    border = colors.HexColor('#94a3b8')

    def text(value, style=small):
        return Paragraph(str(value if value is not None else '-'), style)

    def table(rows, widths, header=True):
        t = Table(rows, colWidths=widths, repeatRows=1 if header else 0, hAlign='LEFT')
        commands = [
            ('GRID', (0, 0), (-1, -1), 0.35, border),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]
        if header:
            commands += [('BACKGROUND', (0, 0), (-1, 0), light_blue), ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold')]
        t.setStyle(TableStyle(commands))
        return t

    story = [
        Paragraph('BALANCE STOCK PRODUCT, CANE AND RAW SUGAR', title),
        Paragraph(f'DATE: {date_str} &nbsp;&nbsp; | &nbsp;&nbsp; Periode 00:00-24:00', subtitle),
        Paragraph('SUGAR', section),
    ]
    g = payload['gula']
    story.append(table([
        [text('BEGIN INV', small_center), text('QTY (TON)', small_center)],
        [text('GKM'), text(fmt(g['opening_gkm']), small_right)],
        [text('GKB'), text(fmt(g['opening_gkb']), small_right)],
        [text('REJECT'), text(fmt(g['opening_reject']), small_right)],
        [text('TOTAL BEGIN INV', small), text(fmt(g['opening_gkm'] + g['opening_gkb'] + g['opening_reject']), small_right)],
    ], [110 * mm, 65 * mm]))
    story.append(Spacer(1, 4))

    prod = g['production_detail']
    story.append(table([
        [text('PRODUCTION GULA', small_center), text('GKB', small_center), text('GKM', small_center), text('REJECT', small_center), text('TOTAL', small_center)],
        [text('SHIFT I'), text(fmt((prod.get('1') or {}).get('gkb')), small_right), text(fmt((prod.get('1') or {}).get('gkm')), small_right), text(fmt((prod.get('1') or {}).get('reject')), small_right), text(fmt(_num((prod.get('1') or {}).get('gkb')) + _num((prod.get('1') or {}).get('gkm')) + _num((prod.get('1') or {}).get('reject'))), small_right)],
        [text('SHIFT II'), text(fmt((prod.get('2') or {}).get('gkb')), small_right), text(fmt((prod.get('2') or {}).get('gkm')), small_right), text(fmt((prod.get('2') or {}).get('reject')), small_right), text(fmt(_num((prod.get('2') or {}).get('gkb')) + _num((prod.get('2') or {}).get('gkm')) + _num((prod.get('2') or {}).get('reject'))), small_right)],
        [text('SHIFT III'), text(fmt((prod.get('3') or {}).get('gkb')), small_right), text(fmt((prod.get('3') or {}).get('gkm')), small_right), text(fmt((prod.get('3') or {}).get('reject')), small_right), text(fmt(_num((prod.get('3') or {}).get('gkb')) + _num((prod.get('3') or {}).get('gkm')) + _num((prod.get('3') or {}).get('reject'))), small_right)],
        [text('TOTAL', small),
         text(fmt(sum(_num((prod.get(str(i)) or {}).get('gkb')) for i in (1, 2, 3))), small_right),
         text(fmt(sum(_num((prod.get(str(i)) or {}).get('gkm')) for i in (1, 2, 3))), small_right),
         text(fmt(sum(_num((prod.get(str(i)) or {}).get('reject')) for i in (1, 2, 3))), small_right),
         text(fmt(g['production_total']), small_right)],
    ], [43 * mm, 31 * mm, 31 * mm, 31 * mm, 39 * mm]))
    story.append(Spacer(1, 4))
    story.append(table([
        [text('DELIVERY GULA', small_center), text('PLAN', small_center), text('ACTUAL', small_center), text('DIFF', small_center)],
        [text('GKB'), text(fmt(g['delivery_plan_gkb']), small_right), text(fmt(g['delivery_actual_gkb']), small_right), text(fmt(g['delivery_plan_gkb'] - g['delivery_actual_gkb']), small_right)],
        [text('GKM'), text(fmt(g['delivery_plan_gkm']), small_right), text(fmt(g['delivery_actual_gkm']), small_right), text(fmt(g['delivery_plan_gkm'] - g['delivery_actual_gkm']), small_right)],
        [text('TOTAL'), text(fmt(g['delivery_plan_gkb'] + g['delivery_plan_gkm']), small_right), text(fmt(g['delivery_actual_total']), small_right), text(fmt(g['delivery_plan_gkb'] + g['delivery_plan_gkm'] - g['delivery_actual_total']), small_right)],
    ], [60 * mm, 38 * mm, 38 * mm, 40 * mm]))
    story.append(Spacer(1, 4))
    story.append(table([
        [text('STOCK TODAY', small_center), text('QTY (TON)', small_center)],
        [text('GKB'), text(fmt(g['closing_gkb']), small_right)],
        [text('GKM'), text(fmt(g['closing_gkm']), small_right)],
        [text('REJECT'), text(fmt(g['closing_reject']), small_right)],
        [text('DELIVERY PLAN (TOMORROW) - GKB'), text(fmt(g['tomorrow_gkb']), small_right)],
        [text('DELIVERY PLAN (TOMORROW) - GKM'), text(fmt(g['tomorrow_gkm']), small_right)],
    ], [110 * mm, 65 * mm]))
    story.append(Spacer(1, 4))
    story.append(table([
        [text('DELIVERY REJECT', small_center), text('GKB', small_center), text('GKM', small_center), text('TOTAL', small_center)],
        [text('Susut Loading'), text(fmt(g['susut_gkb']), small_right), text(fmt(g['susut_gkm']), small_right), text(fmt(g['susut_gkb'] + g['susut_gkm']), small_right)],
        [text('Downgrade'), text(fmt(g['downgrade_gkb']), small_right), text(fmt(g['downgrade_gkm']), small_right), text(fmt(g['downgrade_gkb'] + g['downgrade_gkm']), small_right)],
        [text('GULA UPGRADE'), text(fmt(g['upgrade_gkb']), small_right), text(fmt(g['upgrade_gkm']), small_right), text(fmt(g['upgrade_total']), small_right)],
    ], [60 * mm, 38 * mm, 38 * mm, 40 * mm]))
    story.append(Spacer(1, 4))
    story.append(table([
        [text('SUGAR STOCK POSITION', small_center), text('QTY (TON)', small_center)],
        [text('WFG'), text(fmt(g['position_wfg']), small_right)],
        [text('WRS'), text(fmt(g['position_wrs']), small_right)],
        [text('OUTSITE'), text(fmt(g['position_outsite']), small_right)],
        [text('TOTAL'), text(fmt(g['position_total']), small_right)],
    ], [110 * mm, 65 * mm]))

    story += [Paragraph('MOLASSES', section)]
    m = payload['molasses']
    mp = m['production']
    story.append(table([
        [text('ITEM', small_center), text('TANK A', small_center), text('TANK B', small_center), text('TOTAL', small_center)],
        [text('BEGIN INV'), text(fmt(m['open_tank_a']), small_right), text(fmt(m['open_tank_b']), small_right), text(fmt(m['open_tank_a'] + m['open_tank_b']), small_right)],
        [text('PRODUCTION'), text('-', small_right), text('-', small_right), text(fmt(_num(mp.get('total')) / 1000), small_right)],
        [text('END INV'), text(fmt(m['tank_a']), small_right), text(fmt(m['tank_b']), small_right), text(fmt(m['tank_a'] + m['tank_b']), small_right)],
        [text('DELIVERY'), text('-', small_right), text('-', small_right), text(fmt(m['delivery_actual']), small_right)],
        [text('PLAN TOMORROW'), text('-', small_right), text('-', small_right), text(fmt(m['delivery_schedule']), small_right)],
    ], [55 * mm, 35 * mm, 35 * mm, 50 * mm]))

    story += [Paragraph('CANE', section)]
    c = payload['cane']
    cane_rows = [[text('PERIOD', small_center), text('CANE (TON)', small_center), text('TRUCK', small_center)],
                 [text('Σ TEBU SEBELUMNYA'), text(fmt(c['previous']), small_right), text(str(c['previous_truck']), small_right)],
                 [text('PENERIMAAN TEBU (TODAY)'), text(fmt(c['today']), small_right), text(str(c['today_truck']), small_right)]]
    for row in c['per_shift']:
        cane_rows.append([text(f"SHIFT {row.get('shift')}"), text(fmt(row.get('caneKg')), small_right), text(str(int(_num(row.get('truck')))), small_right)])
    cane_rows.append([
        text('TOTAL TEBU (TODATE)', small),
        text(fmt(c['total_to_date']), small_right),
        text(str(c['total_to_date_truck']), small_right),
    ])
    story.append(table(cane_rows, [85 * mm, 50 * mm, 40 * mm]))

    doc.build(story)
    buffer.seek(0)
    return buffer
