// ─── Permission templates ───
export interface PermissionTemplate {
  id: string;
  label: string;
  permissions: string[];
}

export const PERMISSION_TEMPLATES: PermissionTemplate[] = [
  {
    id: 'colaborador',
    label: 'Colaborador',
    permissions: ['stock:requisitions:read', 'stock:requisitions:create', 'rh:ponto'],
  },
  {
    id: 'compras',
    label: 'Compras',
    permissions: [
      'stock:read', 'stock:edit', 'stock:movements:read', 'stock:movements:create',
      'stock:requisitions:read', 'stock:requisitions:create', 'stock:requisitions:approve',
      'salmon:dashboard:read', 'salmon:entries:read', 'salmon:entries:create', 'salmon:entries:edit',
      'salmon:manipulation:read', 'salmon:manipulation:create',
      'inventory:read', 'inventory:create', 'inventory:edit',
      'purchases:read', 'purchases:create', 'purchases:approve',
      'purchases:market:read', 'purchases:market:edit',
      'purchases:receiving:read', 'purchases:receiving:confirm',
      'purchases:confirmations:read',
      'suppliers:read', 'suppliers:edit',
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    permissions: [
      'reports:read', 'reports:export',
      'salmon:dashboard:read', 'salmon:entries:read',
      'stock:read', 'stock:movements:read', 'stock:requisitions:read',
      'inventory:read',
      'purchases:read', 'purchases:market:read', 'purchases:receiving:read', 'purchases:confirmations:read',
      'suppliers:read',
      'cmv:read', 'recipes:read', 'planning:read',
      'ai:use',
      'finance:read', 'finance:manage', 'finance:export',
    ],
  },
  {
    id: 'estoquista',
    label: 'Estoquista',
    permissions: [
      'stock:read', 'stock:movements:read',
      'stock:requisitions:read', 'stock:requisitions:approve',
      'purchases:market:read', 'purchases:market:edit',
      'purchases:receiving:read', 'purchases:receiving:confirm',
    ],
  },
];
