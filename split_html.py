import os

def process_html():
    source = 'd:/AI/TEST/MT5/index.html'
    template_dir = 'd:/AI/TEST/MT5/templates'
    
    if not os.path.exists(template_dir):
        os.makedirs(template_dir)
        
    with open(source, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    sections = [
        ('sidebar.html', 24, 77),
        ('topbar.html', 81, 103),
        ('page_dashboard.html', 106, 222),
        ('page_charts.html', 223, 240),
        ('page_report_limbah.html', 243, 262),
        ('page_report_tebu.html', 265, 517),
        ('page_vendors.html', 519, 530),
        ('page_transactions.html', 532, 562),
        ('page_report_daily.html', 564, 838),
        ('modal_po.html', 844, 866),
    ]
    
    # Write components
    for filename, start, end in sections:
        # line numbers are 1-indexed, so we use start-1 to end
        with open(os.path.join(template_dir, filename), 'w', encoding='utf-8') as out_f:
            comp_lines = lines[start-1:end]
            out_f.writelines(comp_lines)
            
    # Now reconstruct the main index.html
    new_index_lines = []
    
    # Helper to check if a line is within any extracted section
    # If it is, and it's the start line, we insert the {% include %} tag.
    # If it is inside, we skip it.
    
    skip_until = -1
    for i, line in enumerate(lines):
        line_num = i + 1
        
        # Are we currently skipping inside an extracted block?
        if line_num <= skip_until:
            continue
            
        inserted_include = False
        for filename, start, end in sections:
            if line_num == start:
                # get original indentation
                indent = len(line) - len(line.lstrip())
                new_index_lines.append(f"{' ' * indent}{{% include '{filename}' %}}\n")
                skip_until = end
                inserted_include = True
                break
                
        if not inserted_include:
            new_index_lines.append(line)
            
    # Write the new index.html to templates/
    with open(os.path.join(template_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.writelines(new_index_lines)
        
    print("Done refactoring HTML!")

if __name__ == '__main__':
    process_html()
