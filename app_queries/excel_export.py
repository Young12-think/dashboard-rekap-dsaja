import io
import openpyxl
from .rmi_balance import get_laporan_harian

def export_laporan_harian_to_excel(date_str, template_path):
    data = get_laporan_harian(date_str)
    
    wb = openpyxl.load_workbook(template_path)
    sheet = wb.active
    
    # 1. Date
    sheet['D3'] = date_str
    
    # 2. SUGAR - Begin Inv
    gula = data.get('gula', {})
    sheet['C8'] = gula.get('stokGkm', 0)
    sheet['C9'] = gula.get('stokGkb', 0)
    sheet['C10'] = gula.get('reject', 0)
    
    # 3. SUGAR - Production Gula & Shift
    prod_det = gula.get('produksiDetail', {})
    sheet['G9'] = prod_det.get(1, {}).get('gkb', 0)
    sheet['H9'] = prod_det.get(1, {}).get('gkm', 0)
    sheet['I9'] = prod_det.get(1, {}).get('reject', 0)
    
    sheet['G10'] = prod_det.get(2, {}).get('gkb', 0)
    sheet['H10'] = prod_det.get(2, {}).get('gkm', 0)
    sheet['I10'] = prod_det.get(2, {}).get('reject', 0)
    
    sheet['G11'] = prod_det.get(3, {}).get('gkb', 0)
    sheet['H11'] = prod_det.get(3, {}).get('gkm', 0)
    sheet['I11'] = prod_det.get(3, {}).get('reject', 0)
    
    # 4. SUGAR - Delivery Gula
    del_gula = gula.get('delivery', {})
    sheet['G16'] = del_gula.get('planGkb', 0)
    sheet['H16'] = del_gula.get('actGkb', 0)
    sheet['I16'] = del_gula.get('planGkb', 0) - del_gula.get('actGkb', 0)
    
    sheet['G17'] = del_gula.get('planGkm', 0)
    sheet['H17'] = del_gula.get('actGkm', 0)
    sheet['I17'] = del_gula.get('planGkm', 0) - del_gula.get('actGkm', 0)
    
    sheet['C26'] = gula.get('deliveryPlanBesok', {}).get('gkb', 0)
    sheet['C27'] = gula.get('deliveryPlanBesok', {}).get('gkm', 0)
    
    # 5. SUGAR - Position
    sheet['H27'] = gula.get('stockPosition', {}).get('outsite', 0)
    
    # 6. MOLASSES
    mol = data.get('molasses', {})
    sheet['C33'] = mol.get('openTankA', 0)
    sheet['E33'] = mol.get('openTankB', 0)
    
    sheet['C38'] = mol.get('tankA', 0)
    sheet['E38'] = mol.get('tankB', 0)
    
    prod_mol = mol.get('produksi', {})
    sheet['I33'] = prod_mol.get('1', 0)
    sheet['I34'] = prod_mol.get('2', 0)
    sheet['I35'] = prod_mol.get('3', 0)
    
    del_mol = mol.get('delivery', {})
    sheet['G41'] = del_mol.get('schedule', 0)
    sheet['H41'] = del_mol.get('actual', 0)
    sheet['I41'] = del_mol.get('diff', 0)
    
    # 7. CANE
    cane = data.get('cane', {})
    sheet['D45'] = cane.get('kumulatif', 0)
    sheet['G45'] = cane.get('kumulatifTruck', 0)
    
    sheet['D46'] = cane.get('hariIni', 0)
    sheet['G46'] = cane.get('hariIniTruck', 0)
    
    shift_cane = cane.get('perShift', [])
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
