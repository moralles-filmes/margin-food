// ─── Permission catalog & module structure for UI ───

export interface PermissionDef {
  key: string;
  label: string;
  action: string;
}

export interface SubmoduleDef {
  key: string;
  label: string;
  permissions: PermissionDef[];
}

export interface ModuleDef {
  key: string;
  label: string;
  icon?: string;
  permissions: PermissionDef[]; // module-level permissions
  submodules: SubmoduleDef[];
}

/**
 * Full module/submodule/permission tree for the permission matrix UI.
 * The `key` values match the `permissions` table in the database.
 */
export const MODULE_TREE: ModuleDef[] = [
  {
    key: 'reports',
    label: 'Relatórios Gerais',
    permissions: [
      { key: 'reports:read', label: 'Ver', action: 'read' },
      { key: 'reports:export', label: 'Exportar', action: 'export' },
    ],
    submodules: [],
  },
  {
    key: 'salmon',
    label: 'Salmão',
    permissions: [],
    submodules: [
      {
        key: 'salmon:dashboard',
        label: 'Dashboard',
        permissions: [
          { key: 'salmon:dashboard:read', label: 'Ver', action: 'read' },
        ],
      },
      {
        key: 'salmon:entries',
        label: 'Lançamentos',
        permissions: [
          { key: 'salmon:entries:read', label: 'Ver', action: 'read' },
          { key: 'salmon:entries:create', label: 'Criar', action: 'create' },
          { key: 'salmon:entries:edit', label: 'Editar', action: 'edit' },
          { key: 'salmon:entries:delete', label: 'Excluir', action: 'delete' },
        ],
      },
      {
        key: 'salmon:manipulation',
        label: 'Manipulações',
        permissions: [
          { key: 'salmon:manipulation:read', label: 'Ver', action: 'read' },
          { key: 'salmon:manipulation:create', label: 'Criar', action: 'create' },
        ],
      },
    ],
  },
  {
    key: 'stock',
    label: 'Controle de Estoque',
    permissions: [
      { key: 'stock:read', label: 'Ver', action: 'read' },
      { key: 'stock:edit', label: 'Editar', action: 'edit' },
      { key: 'stock:delete', label: 'Excluir', action: 'delete' },
    ],
    submodules: [
      {
        key: 'stock:movements',
        label: 'Movimentações',
        permissions: [
          { key: 'stock:movements:read', label: 'Ver', action: 'read' },
          { key: 'stock:movements:create', label: 'Criar', action: 'create' },
        ],
      },
      {
        key: 'stock:requisitions',
        label: 'Requisições de Estoque',
        permissions: [
          { key: 'stock:requisitions:read', label: 'Ver', action: 'read' },
          { key: 'stock:requisitions:create', label: 'Criar', action: 'create' },
          { key: 'stock:requisitions:approve', label: 'Aprovar', action: 'approve' },
        ],
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventário Geral',
    permissions: [
      { key: 'inventory:read', label: 'Ver', action: 'read' },
      { key: 'inventory:create', label: 'Criar', action: 'create' },
      { key: 'inventory:count', label: 'Lançar Contagem', action: 'count' },
      { key: 'inventory:finalize', label: 'Finalizar', action: 'finalize' },
      { key: 'inventory:edit', label: 'Editar (Admin)', action: 'edit' },
      { key: 'inventory:delete', label: 'Excluir (Admin)', action: 'delete' },
      { key: 'inventory:reopen', label: 'Reabrir (Admin)', action: 'reopen' },
      { key: 'inventory:approve', label: 'Autorizar Bloqueado (Admin)', action: 'approve' },
    ],
    submodules: [],
  },
  {
    key: 'purchases',
    label: 'Compras',
    permissions: [
      { key: 'purchases:read', label: 'Ver', action: 'read' },
      { key: 'purchases:create', label: 'Criar', action: 'create' },
      { key: 'purchases:edit', label: 'Editar', action: 'edit' },
      { key: 'purchases:approve', label: 'Aprovar', action: 'approve' },
      { key: 'purchases:delete', label: 'Excluir', action: 'delete' },
    ],
    submodules: [
      {
        key: 'purchases:market',
        label: 'Mercados & Sazonais',
        permissions: [
          { key: 'purchases:market:read', label: 'Ver', action: 'read' },
          { key: 'purchases:market:edit', label: 'Editar', action: 'edit' },
        ],
      },
      {
        key: 'purchases:receiving',
        label: 'Recebimento de Mercadorias',
        permissions: [
          { key: 'purchases:receiving:read', label: 'Ver', action: 'read' },
          { key: 'purchases:receiving:manage', label: 'Gerenciar', action: 'manage' },
          { key: 'purchases:receiving:confirm', label: 'Confirmar', action: 'confirm' },
        ],
      },
      {
        key: 'purchases:confirmations',
        label: 'Confirmações de Recebimento',
        permissions: [
          { key: 'purchases:confirmations:read', label: 'Ver', action: 'read' },
        ],
      },
    ],
  },
  {
    key: 'suppliers',
    label: 'Fornecedores',
    permissions: [
      { key: 'suppliers:read', label: 'Ver', action: 'read' },
      { key: 'suppliers:edit', label: 'Editar', action: 'edit' },
    ],
    submodules: [],
  },
  {
    key: 'cmv',
    label: 'Centro de CMV',
    permissions: [
      { key: 'cmv:read', label: 'Ver', action: 'read' },
    ],
    submodules: [],
  },
  {
    key: 'recipes',
    label: 'Ficha Técnica',
    permissions: [
      { key: 'recipes:read', label: 'Ver', action: 'read' },
      { key: 'recipes:edit', label: 'Editar', action: 'edit' },
    ],
    submodules: [],
  },
  {
    key: 'planning',
    label: 'Planejamento',
    permissions: [
      { key: 'planning:read', label: 'Ver', action: 'read' },
      { key: 'planning:manage', label: 'Gerenciar', action: 'manage' },
    ],
    submodules: [],
  },
  {
    key: 'ai',
    label: 'Central de IA',
    permissions: [
      { key: 'ai:use', label: 'Usar', action: 'use' },
    ],
    submodules: [],
  },
  {
    key: 'rh',
    label: 'RH — Pessoas',
    permissions: [
      { key: 'rh:read', label: 'Ver', action: 'read' },
      { key: 'rh:manage', label: 'Gerenciar', action: 'manage' },
      { key: 'rh:ponto', label: 'Ponto', action: 'create' },
      { key: 'rh:admin', label: 'Administrar', action: 'admin' },
    ],
    submodules: [],
  },
  {
    key: 'finance',
    label: 'Financeiro',
    permissions: [
      { key: 'finance:read', label: 'Ver', action: 'read' },
      { key: 'finance:manage', label: 'Gerenciar', action: 'manage' },
      { key: 'finance:export', label: 'Exportar', action: 'export' },
    ],
    submodules: [],
  },
  {
    key: 'admin',
    label: 'Administração',
    permissions: [
      { key: 'users:manage', label: 'Gerenciar Usuários', action: 'manage' },
      { key: 'settings:manage', label: 'Gerenciar Config', action: 'manage' },
    ],
    submodules: [],
  },
];

/** Get all permission keys from the tree */
export function getAllPermissionKeys(): string[] {
  const keys: string[] = [];
  MODULE_TREE.forEach(m => {
    m.permissions.forEach(p => keys.push(p.key));
    m.submodules.forEach(s => s.permissions.forEach(p => keys.push(p.key)));
  });
  return keys;
}

/** Get all permission keys for a module (including submodules) */
export function getModulePermissionKeys(moduleKey: string): string[] {
  const mod = MODULE_TREE.find(m => m.key === moduleKey);
  if (!mod) return [];
  const keys: string[] = [];
  mod.permissions.forEach(p => keys.push(p.key));
  mod.submodules.forEach(s => s.permissions.forEach(p => keys.push(p.key)));
  return keys;
}

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
