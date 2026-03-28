import { buildPermissionEntries } from './src/permissions/registry';

const entries = buildPermissionEntries();
console.log('-- SQL REPAIR SCRIPT');
console.log('INSERT INTO permissions (key, module, submodule, action, description)');
console.log('VALUES');
const values = entries.map(e => `('${e.key}', '${e.module}', '${e.submodule}', '${e.action}', '${e.description}')`);
console.log(values.join(',\n') + ';');

console.log('\n-- Sync Admin Role');
console.log(`INSERT INTO role_permissions (role, permission_key)
SELECT 'admin', key FROM permissions
ON CONFLICT (role, permission_key) DO NOTHING;`);
