import re
import os

file_path = 'c:/Users/morae/Downloads/marginpro-app-main/src/permissions/registry.ts'
if not os.path.exists(file_path):
    print(f"File not found: {file_path}")
    exit(1)

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Helper for action sets
sets = {
    'VIEW_ONLY': ['view'],
    'VIEW_EXPORT': ['view', 'export'],
    'CRUD': ['view', 'create', 'edit', 'delete'],
    'VIEW_CREATE': ['view', 'create'],
    'VIEW_EDIT': ['view', 'edit'],
    'VIEW_MANAGE': ['view', 'manage']
}

# Regex to find modules
module_blocks = re.split(r'// \d+\. ', content)[1:]

sql_lines = []
for block in module_blocks:
    m_mod = re.search(r"key: '([^']+)',", block)
    if not m_mod: continue
    mod_key = m_mod.group(1)
    
    # Find subtabs in this module block
    subtab_blocks = re.findall(r"\{ key: '([^']+)', label: '([^']+)', actions: ([^}]+)\}", block)
    for sub_key, sub_label, actions_raw in subtab_blocks:
        actions_list = []
        if '...' in actions_raw: # CRUD etc
            m_set = re.search(r'\.\.\.([A-Z_]+)', actions_raw)
            if m_set: actions_list.extend(sets.get(m_set.group(1), []))
        
        # Literal matches like { action: 'view', label: 'Ver' }
        literal_actions = re.findall(r"action: '([^']+)'", actions_raw)
        actions_list.extend(literal_actions)
        
        for act in set(actions_list):
            key = f"{mod_key}:{sub_key}:{act}"
            sql_lines.append(f"INSERT INTO permissions (key, module, submodule, action) VALUES ('{key}', '{mod_key}', '{sub_key}', '{act}') ON CONFLICT (key) DO NOTHING;")

for line in sql_lines:
    print(line)
