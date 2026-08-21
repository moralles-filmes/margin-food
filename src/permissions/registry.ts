/**
 * ─── Permission Registry ───
 *
 * Single source of truth for all granular permissions in the system.
 * Naming convention: <module>:<subaba>:<action>
 *
 * Allowed actions are defined in ./actions.ts (11 total).
 *
 * This registry is synced to the `permissions` table via
 * rpc_sync_permissions_from_registry().
 */

import { isAllowedAction, ALLOWED_ACTIONS, validatePermissionKey } from './actions';

export interface PermissionEntry {
  key: string;
  description: string;
  module: string;
  submodule: string;
  action: string;
}

export interface ModuleManifest {
  key: string;
  label: string;
  subtabs: SubtabManifest[];
}

interface SubtabManifest {
  key: string;       // e.g. "dashboard"
  label: string;
  actions: ActionManifest[];
}

interface ActionManifest {
  action: string;    // e.g. "view"
  label: string;
  description?: string;
}

// ─── Helper to build permission key ───
function pk(mod: string, sub: string, action: string): string {
  return `${mod}:${sub}:${action}`;
}

// ─── Standard action sets ───
const VIEW_ONLY: ActionManifest[] = [
  { action: 'view', label: 'Ver' },
];

const VIEW_EXPORT: ActionManifest[] = [
  { action: 'view', label: 'Ver' },
  { action: 'export', label: 'Exportar' },
];

const CRUD: ActionManifest[] = [
  { action: 'view', label: 'Ver' },
  { action: 'create', label: 'Criar' },
  { action: 'edit', label: 'Editar' },
  { action: 'delete', label: 'Excluir' },
];

const VIEW_CREATE: ActionManifest[] = [
  { action: 'view', label: 'Ver' },
  { action: 'create', label: 'Criar' },
];

const VIEW_EDIT: ActionManifest[] = [
  { action: 'view', label: 'Ver' },
  { action: 'edit', label: 'Editar' },
];

const VIEW_MANAGE: ActionManifest[] = [
  { action: 'view', label: 'Ver' },
  { action: 'manage', label: 'Gerenciar' },
];

// ─────────────────────────────────────────
// MODULE MANIFESTS
// ─────────────────────────────────────────

export const MODULE_MANIFESTS: ModuleManifest[] = [
  // 0. System (super-admin)
  {
    key: 'system',
    label: 'Sistema',
    subtabs: [
      { key: 'global', label: 'Acesso Global', actions: [
        { action: 'manage', label: 'Super-Admin (acesso total)' },
      ]},
    ],
  },
  // 1. Relatórios
  {
    key: 'relatorios',
    label: 'Relatórios',
    subtabs: [
      { key: 'cmv', label: 'CMV', actions: VIEW_EXPORT },
      { key: 'estoque', label: 'Estoque', actions: VIEW_EXPORT },
      { key: 'compras', label: 'Compras', actions: VIEW_EXPORT },
      { key: 'tendencia', label: 'Tendência', actions: VIEW_ONLY },
      { key: 'score', label: 'Score', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'simulate', label: 'Simular' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'itens', label: 'Itens', actions: VIEW_EXPORT },
    ],
  },
  // 2. Salmão
  {
    key: 'salmon',
    label: 'Salmão',
    subtabs: [
      { key: 'dashboard', label: 'Dashboard', actions: VIEW_ONLY },
      { key: 'entradas', label: 'Entradas', actions: CRUD },
      { key: 'manipulacao', label: 'Manipulação', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'delete', label: 'Cancelar' },
      ]},
      { key: 'estoque', label: 'Estoque', actions: VIEW_ONLY },
      { key: 'metas', label: 'Metas', actions: VIEW_EDIT },
      { key: 'planejamento', label: 'Planejamento', actions: VIEW_MANAGE },
    ],
  },
  // 3. Estoque Geral
  {
    key: 'estoque',
    label: 'Estoque Geral',
    subtabs: [
      { key: 'dashboard', label: 'Dashboard', actions: VIEW_ONLY },
      
      { key: 'ranking', label: 'Ranking de Consumo', actions: VIEW_ONLY },
      { key: 'perdas', label: 'Relatório de Perdas', actions: VIEW_ONLY },
      { key: 'transferencias', label: 'Transferências', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
      ]},
      { key: 'preditivo', label: 'Estoque Preditivo', actions: VIEW_ONLY },
      { key: 'saldo', label: 'Saldo', actions: VIEW_EXPORT },
      { key: 'movimentacoes', label: 'Movimentações', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'cancel', label: 'Cancelar' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'simulador', label: 'Simulador', actions: VIEW_ONLY },
      { key: 'requisicoes', label: 'Requisições', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'approve', label: 'Aprovar' },
        { action: 'close', label: 'Atender/Finalizar' },
        { action: 'delete', label: 'Excluir' },
        { action: 'export', label: 'Exportar' },
        { action: 'manage', label: 'Gerenciar Listas Fixas' },
      ]},
      { key: 'catalogo', label: 'Catálogo', actions: [
        ...CRUD,
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'cadastros', label: 'Cadastros', actions: [
        ...CRUD,
        { action: 'manage', label: 'Gerenciar' },
        { action: 'export', label: 'Exportar' },
      ]},
    ],
  },
  // 4. Inventário
  {
    key: 'inventario',
    label: 'Inventário',
    subtabs: [
      { key: 'lista', label: 'Lista', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'delete', label: 'Excluir' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'criar', label: 'Criar', actions: [{ action: 'create', label: 'Criar' }] },
      { key: 'rapido', label: 'Inventário Rápido', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
      ]},
      { key: 'detalhe', label: 'Detalhe', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'edit', label: 'Editar' },
        { action: 'close', label: 'Finalizar' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'dashboard', label: 'Dashboard', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'auditoria', label: 'Auditoria', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'approve', label: 'Aprovar' },
        { action: 'edit', label: 'Editar (Reabrir/Corrigir)' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'conferentes', label: 'Conferentes', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'manage', label: 'Gerenciar' },
      ]},
    ],
  },
  // 5. Compras
  {
    key: 'compras',
    label: 'Compras',
    subtabs: [
      { key: 'lista', label: 'Lista (do Dia)', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'approve', label: 'Aprovar' },
        { action: 'cancel', label: 'Cancelar' },
        { action: 'delete', label: 'Excluir' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'pedidos', label: 'Pedidos & Mercado', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'delete', label: 'Excluir' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'checklist', label: 'Checklist', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'edit', label: 'Editar' },
        { action: 'approve', label: 'Aprovar' },
      ]},
      { key: 'calendario', label: 'Calendário', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'edit', label: 'Editar' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'ranking', label: 'Ranking', actions: VIEW_EXPORT },
      { key: 'fornecedores', label: 'Fornecedores', actions: [
        ...CRUD,
        { action: 'export', label: 'Exportar' },
      ]},
      // Cotação (RFQ). NOTA: send_whatsapp/use_ai/convert NÃO são ações RBAC válidas
      // (ver src/permissions/actions.ts) → mapeadas: WhatsApp+IA = 'manage', converter = 'close'.
      { key: 'cotacao', label: 'Cotação', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'delete', label: 'Excluir' },
        { action: 'approve', label: 'Aprovar Sugestão' },
        { action: 'close', label: 'Converter em Pedido' },
        { action: 'manage', label: 'WhatsApp / IA' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'recebimentos', label: 'Recebimentos', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'close', label: 'Fechar' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'confirmacoes', label: 'Confirmações', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'approve', label: 'Confirmar' },
      ]},
      { key: 'alertas_falta', label: 'Itens em Falta', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'approve', label: 'Confirmar Alerta' },
      ]},
    ],
  },
  // 6. Centro de CMV
  {
    key: 'cmv',
    label: 'Centro de CMV',
    subtabs: [
      { key: 'categoria', label: 'Por Categoria', actions: VIEW_EXPORT },
      { key: 'setor', label: 'Por Setor', actions: VIEW_EXPORT },
      { key: 'top-itens', label: 'Top Itens', actions: VIEW_EXPORT },
      { key: 'semanal', label: 'Semanal', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'edit', label: 'Editar' },
        { action: 'export', label: 'Exportar' },
      ]},
    ],
  },
  // 7. Ficha Técnica
  {
    key: 'ficha',
    label: 'Ficha Técnica',
    subtabs: [
      { key: 'pre-preparos', label: 'Pré-Preparos', actions: CRUD },
      { key: 'itens-prontos', label: 'Itens Prontos', actions: CRUD },
      { key: 'produtos-finais', label: 'Produtos Finais', actions: CRUD },
      { key: 'canais', label: 'Canais', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'manage', label: 'Gerenciar' },
      ]},
      { key: 'analise', label: 'Análise', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'simulate', label: 'Simular Cenário' },
      ]},
      { key: 'markup', label: 'Markup', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'manage', label: 'Gerenciar (Precificar/Recalcular)' },
      ]},
    ],
  },
  // 8. Planejamento
  {
    key: 'planning',
    label: 'Planejamento',
    subtabs: [
      { key: 'meta-compras', label: 'Meta Compras', actions: VIEW_EDIT },
      { key: 'projecao', label: 'Projeção Mensal', actions: VIEW_ONLY },
      { key: 'ritmo', label: 'Ritmo Semanal', actions: VIEW_ONLY },
      { key: 'pressao', label: 'Pressão Orçamentária', actions: VIEW_ONLY },
      { key: 'radar', label: 'Radar', actions: VIEW_ONLY },
      { key: 'simulador', label: 'Simulador Compras', actions: VIEW_ONLY },
    ],
  },
  // 9. Central de IA
  {
    key: 'ia',
    label: 'Central de IA',
    subtabs: [
      { key: 'consultor-geral', label: 'Consultor Geral', actions: VIEW_CREATE },
      { key: 'salmon-intelligence', label: 'Salmão Intelligence', actions: VIEW_CREATE },
      { key: 'estoque-geral', label: 'Estoque Geral', actions: VIEW_CREATE },
      { key: 'analista-cmv', label: 'Analista CMV', actions: VIEW_CREATE },
      { key: 'consultor-compras', label: 'Consultor Compras', actions: VIEW_CREATE },
      { key: 'ficha-tecnica', label: 'Ficha Técnica', actions: VIEW_CREATE },
      { key: 'consultor-financeiro', label: 'Consultor Financeiro', actions: VIEW_CREATE },
      { key: 'consultor-rh', label: 'Consultor RH', actions: VIEW_CREATE },
      { key: 'logs', label: 'Logs de IA', actions: VIEW_ONLY },
    ],
  },
  // 10. RH
  {
    key: 'rh',
    label: 'RH — Pessoas',
    subtabs: [
      { key: 'prontuario', label: 'Prontuário', actions: [
        ...CRUD,
        { action: 'manage', label: 'Gerenciar' },
      ]},
      { key: 'escalas', label: 'Escalas', actions: CRUD },
      { key: 'tarefas', label: 'Tarefas', actions: CRUD },
      { key: 'onboarding', label: 'Onboarding', actions: VIEW_MANAGE },
      { key: 'treinamento', label: 'Treinamento', actions: CRUD },
      { key: 'ferias', label: 'Férias', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'approve', label: 'Aprovar' },
      ]},
      { key: 'documentos', label: 'Documentos', actions: [
        ...CRUD,
        { action: 'manage', label: 'Gerenciar (Upload/Compliance)' },
      ]},
      { key: 'folha', label: 'Folha', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'export', label: 'Exportar' },
        { action: 'manage', label: 'Gerenciar (Dados Sensíveis)' },
      ]},
      { key: 'beneficios', label: 'Benefícios', actions: CRUD },
      { key: 'dashboard', label: 'Dashboard', actions: VIEW_ONLY },
      { key: 'custos', label: 'Custos', actions: VIEW_EXPORT },
      { key: 'sst', label: 'SST', actions: CRUD },
      { key: 'disciplinar', label: 'Disciplinar', actions: CRUD },
      { key: 'mural', label: 'Mural', actions: VIEW_CREATE },
      { key: 'ponto', label: 'Ponto', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Registrar' },
        { action: 'manage', label: 'Gerenciar' },
        { action: 'approve', label: 'Aprovar' },
      ]},
      { key: 'banco-horas', label: 'Banco de Horas', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'manage', label: 'Gerenciar' },
        { action: 'reconcile', label: 'Recalcular' },
      ]},
    ],
  },
  // 11. Financeiro
  {
    key: 'financeiro',
    label: 'Financeiro',
    subtabs: [
      { key: 'dashboard', label: 'Dashboard', actions: VIEW_ONLY },
      { key: 'fechamento', label: 'Fechamento', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'close', label: 'Fechar' },
      ]},
      { key: 'cadastros', label: 'Cadastros Base', actions: [
        ...CRUD,
        { action: 'manage', label: 'Gerenciar' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'contas', label: 'Contas', actions: [
        ...CRUD,
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'lancamentos', label: 'Lançamentos', actions: [
        ...CRUD,
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'pagar', label: 'Contas a Pagar', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'approve', label: 'Aprovar' },
        { action: 'delete', label: 'Excluir' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'receber', label: 'Contas a Receber', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'delete', label: 'Excluir' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'fluxo', label: 'Fluxo de Caixa', actions: VIEW_EXPORT },
      { key: 'dre', label: 'DRE', actions: VIEW_EXPORT },
      { key: 'orcamento', label: 'Orçamento', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'edit', label: 'Editar / Criar' },
        { action: 'delete', label: 'Excluir' },
        { action: 'export', label: 'Exportar' },
      ]},
      { key: 'conciliacao', label: 'Conciliação', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'reconcile', label: 'Conciliar' },
      ]},
      { key: 'alertas', label: 'Alertas', actions: VIEW_EXPORT },
      { key: 'recorrencias', label: 'Recorrências', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'delete', label: 'Excluir' },
        { action: 'export', label: 'Exportar' },
      ] },
      { key: 'categorizacao', label: 'Categorização', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar Regra' },
        { action: 'edit', label: 'Editar Regra' },
        { action: 'delete', label: 'Excluir Regra' },
        { action: 'manage', label: 'Aplicar Categorização' },
      ]},
      { key: 'relatorio-socios', label: 'Relatório Sócios', actions: VIEW_EXPORT },
      { key: 'projecao', label: 'Projeção', actions: VIEW_EXPORT },
      { key: 'kpis', label: 'KPIs', actions: VIEW_EXPORT },
      { key: 'auditoria', label: 'Auditoria', actions: VIEW_EXPORT },
      { key: 'comparativo', label: 'Comparativo', actions: VIEW_EXPORT },
    ],
  },
  // 12. Configurações
  {
    key: 'configuracoes',
    label: 'Configurações',
    subtabs: [
      { key: 'geral', label: 'Geral', actions: VIEW_MANAGE },
      { key: 'integracoes', label: 'Integrações', actions: VIEW_MANAGE },
      { key: 'salmon', label: 'Salmão', actions: VIEW_MANAGE },
      { key: 'usuarios', label: 'Usuários', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'delete', label: 'Excluir' },
        { action: 'manage', label: 'Gerenciar Permissões' },
      ]},
      { key: 'auditoria-sistema', label: 'Auditoria Sistema', actions: VIEW_ONLY },
      { key: 'performance', label: 'Performance', actions: VIEW_ONLY },
      { key: 'auditoria-seguranca', label: 'Auditoria Segurança', actions: VIEW_ONLY },
      { key: 'auditoria-compras', label: 'Auditoria Compras', actions: VIEW_ONLY },
      { key: 'empresas', label: 'Empresas', actions: [
        { action: 'view', label: 'Ver' },
        { action: 'create', label: 'Criar' },
        { action: 'edit', label: 'Editar' },
        { action: 'delete', label: 'Desativar' },
      ]},
    ],
  },
];

// ─── Flatten manifests into permission entries (with validation) ───
export function buildPermissionEntries(): PermissionEntry[] {
  const entries: PermissionEntry[] = [];
  for (const mod of MODULE_MANIFESTS) {
    for (const sub of mod.subtabs) {
      for (const act of sub.actions) {
        if (!isAllowedAction(act.action)) {
          const msg = `[RBAC] Invalid action "${act.action}" in ${mod.key}:${sub.key}. Allowed: ${ALLOWED_ACTIONS.join(', ')}`;
          if (import.meta.env.DEV) {
            throw new Error(msg);
          } else {
            console.error(msg);
            continue; // skip invalid in production
          }
        }
        const key = pk(mod.key, sub.key, act.action);
        entries.push({
          key,
          description: `${mod.label} → ${sub.label} → ${act.label}`,
          module: mod.key,
          submodule: sub.key,
          action: act.action,
        });
      }
    }
  }
  return entries;
}

/** All permission keys as a flat string array */
export const ALL_PERMISSION_KEYS: string[] = buildPermissionEntries().map(e => e.key);

/** Get the view permission key for a subtab */
export function subtabViewKey(moduleKey: string, subtabKey: string): string {
  return pk(moduleKey, subtabKey, 'view');
}

/** Check if a permission key exists in the registry AND has a valid action */
export function isValidPermission(key: string): boolean {
  const { valid } = validatePermissionKey(key);
  if (!valid) return false;
  return ALL_PERMISSION_KEYS.includes(key);
}

// ─── Legacy permission mapping ───
// Maps old permission keys to new granular keys for backward compatibility
export const LEGACY_PERMISSION_MAP: Record<string, string[]> = {
  'reports:read': ['relatorios:cmv:view', 'relatorios:estoque:view', 'relatorios:compras:view', 'relatorios:tendencia:view', 'relatorios:score:view', 'relatorios:itens:view'],
  'reports:export': ['relatorios:cmv:export', 'relatorios:estoque:export', 'relatorios:compras:export', 'relatorios:score:export', 'relatorios:itens:export'],
  'reports:simulate': ['relatorios:score:simulate'],
  'salmon:dashboard:read': ['salmon:dashboard:view'],
  'salmon:read': ['salmon:dashboard:view', 'salmon:entradas:view', 'salmon:manipulacao:view', 'salmon:estoque:view', 'salmon:metas:view', 'salmon:planejamento:view'],
  'salmon:entries:read': ['salmon:entradas:view'],
  'salmon:entries:create': ['salmon:entradas:create'],
  'salmon:entries:edit': ['salmon:entradas:edit'],
  'salmon:entries:delete': ['salmon:entradas:delete'],
  'salmon:manipulation:read': ['salmon:manipulacao:view'],
  'salmon:manipulation:create': ['salmon:manipulacao:create'],
  'salmon:write': ['salmon:entradas:create', 'salmon:entradas:edit', 'salmon:manipulacao:create', 'salmon:metas:edit', 'salmon:planejamento:manage'],
  'salmon:delete': ['salmon:entradas:delete', 'salmon:manipulacao:delete'],
  'stock:read': ['estoque:dashboard:view', 'estoque:ranking:view', 'estoque:perdas:view', 'estoque:transferencias:view', 'estoque:preditivo:view', 'estoque:saldo:view', 'estoque:catalogo:view', 'estoque:movimentacoes:view', 'estoque:simulador:view', 'estoque:requisicoes:view', 'estoque:cadastros:view'],
  'stock:edit': ['estoque:catalogo:edit', 'estoque:cadastros:edit', 'estoque:cadastros:manage'],
  'stock:delete': ['estoque:catalogo:delete', 'estoque:cadastros:delete'],
  'stock:write': ['estoque:movimentacoes:create', 'estoque:catalogo:create', 'estoque:cadastros:create', 'estoque:requisicoes:create', 'estoque:requisicoes:approve', 'estoque:requisicoes:close', 'estoque:transferencias:create'],
  'stock:manage': ['estoque:cadastros:manage', 'estoque:saldo:export', 'estoque:movimentacoes:export', 'estoque:catalogo:export', 'estoque:cadastros:export', 'estoque:requisicoes:export'],
  'stock:movements:read': ['estoque:movimentacoes:view'],
  'stock:movements:create': ['estoque:movimentacoes:create'],
  'stock:movements:edit': ['estoque:movimentacoes:edit'],
  'stock:movements:cancel': ['estoque:movimentacoes:cancel'],
  'stock:requisitions:read': ['estoque:requisicoes:view'],
  'stock:requisitions:create': ['estoque:requisicoes:create'],
  'stock:requisitions:approve': ['estoque:requisicoes:approve'],
  'inventory:read': ['inventario:lista:view', 'inventario:detalhe:view', 'inventario:dashboard:view', 'inventario:auditoria:view', 'inventario:rapido:view'],
  'inventory:create': ['inventario:criar:create', 'inventario:lista:create', 'inventario:rapido:create'],
  'inventory:edit': ['inventario:detalhe:edit', 'inventario:lista:edit', 'inventario:auditoria:edit'],
  'inventory:delete': ['inventario:lista:delete'],
  'inventory:finalize': ['inventario:detalhe:close'],
  'inventory:approve': ['inventario:auditoria:approve'],
  'inventory:count': ['inventario:detalhe:edit'],
  'inventory:reopen': ['inventario:auditoria:edit'],
  'inventory:export': ['inventario:lista:export', 'inventario:detalhe:export', 'inventario:dashboard:export', 'inventario:auditoria:export'],
  'purchases:read': ['compras:lista:view', 'compras:pedidos:view', 'compras:checklist:view', 'compras:calendario:view', 'compras:ranking:view', 'compras:recebimentos:view', 'compras:confirmacoes:view', 'compras:alertas_falta:view', 'compras:cotacao:view'],
  'purchases:create': ['compras:lista:create', 'compras:pedidos:create'],
  'purchases:edit': ['compras:lista:edit', 'compras:pedidos:edit'],
  'purchases:approve': ['compras:lista:approve', 'compras:checklist:approve', 'compras:confirmacoes:approve'],
  'purchases:delete': ['compras:lista:delete', 'compras:pedidos:delete'],
  'purchases:export': ['compras:lista:export', 'compras:pedidos:export', 'compras:calendario:export', 'compras:ranking:export', 'compras:fornecedores:export', 'compras:recebimentos:export'],
  'purchases:market:read': ['compras:pedidos:view'],
  'purchases:market:edit': ['compras:pedidos:edit'],
  'purchases:receiving:read': ['compras:recebimentos:view'],
  'purchases:receiving:manage': ['compras:recebimentos:edit', 'compras:recebimentos:close'],
  'purchases:receiving:confirm': ['compras:recebimentos:close', 'compras:confirmacoes:approve'],
  'purchases:confirmations:read': ['compras:confirmacoes:view'],
  'suppliers:read': ['compras:fornecedores:view'],
  'suppliers:edit': ['compras:fornecedores:edit', 'compras:fornecedores:create', 'compras:fornecedores:delete'],
  'compras:read': ['compras:lista:view', 'compras:pedidos:view', 'compras:checklist:view', 'compras:calendario:view', 'compras:ranking:view', 'compras:recebimentos:view', 'compras:confirmacoes:view', 'compras:fornecedores:view', 'compras:alertas_falta:view', 'compras:cotacao:view'],
  'compras:write': ['compras:lista:create', 'compras:lista:edit', 'compras:pedidos:create', 'compras:pedidos:edit', 'compras:recebimentos:create', 'compras:recebimentos:edit', 'compras:recebimentos:close', 'compras:lista:cancel', 'compras:cotacao:create', 'compras:cotacao:edit'],
  'cmv:read': ['cmv:categoria:view', 'cmv:setor:view', 'cmv:top-itens:view', 'cmv:semanal:view'],
  'cmv:export': ['cmv:categoria:export', 'cmv:setor:export', 'cmv:top-itens:export', 'cmv:semanal:export'],
  'cmv:write': ['cmv:semanal:edit'],
  'recipes:read': ['ficha:pre-preparos:view', 'ficha:itens-prontos:view', 'ficha:produtos-finais:view', 'ficha:canais:view', 'ficha:analise:view', 'ficha:markup:view'],
  'recipes:edit': ['ficha:pre-preparos:edit', 'ficha:itens-prontos:edit', 'ficha:produtos-finais:edit', 'ficha:canais:manage', 'ficha:markup:manage'],
  'recipes:delete': ['ficha:pre-preparos:delete', 'ficha:itens-prontos:delete', 'ficha:produtos-finais:delete'],
  'recipes:manage': ['ficha:canais:manage', 'ficha:markup:manage', 'ficha:analise:simulate'],
  'ficha:read': ['ficha:pre-preparos:view', 'ficha:itens-prontos:view', 'ficha:produtos-finais:view', 'ficha:canais:view', 'ficha:analise:view', 'ficha:markup:view'],
  'ficha:write': ['ficha:pre-preparos:create', 'ficha:pre-preparos:edit', 'ficha:itens-prontos:create', 'ficha:itens-prontos:edit', 'ficha:produtos-finais:create', 'ficha:produtos-finais:edit'],
  'ficha:delete': ['ficha:pre-preparos:delete', 'ficha:itens-prontos:delete', 'ficha:produtos-finais:delete'],
  'ficha:manage': ['ficha:canais:manage', 'ficha:markup:manage', 'ficha:analise:simulate'],
  'planning:read': ['planning:meta-compras:view', 'planning:projecao:view', 'planning:ritmo:view', 'planning:pressao:view', 'planning:radar:view', 'planning:simulador:view'],
  'planning:write': ['planning:meta-compras:edit'],
  'planning:manage': ['planning:meta-compras:edit'],
  'planning:export': [],
  'ai:use': ['ia:consultor-geral:view', 'ia:consultor-geral:create', 'ia:salmon-intelligence:view', 'ia:salmon-intelligence:create', 'ia:estoque-geral:view', 'ia:estoque-geral:create', 'ia:analista-cmv:view', 'ia:analista-cmv:create', 'ia:consultor-compras:view', 'ia:consultor-compras:create', 'ia:ficha-tecnica:view', 'ia:ficha-tecnica:create', 'ia:consultor-financeiro:view', 'ia:consultor-financeiro:create', 'ia:consultor-rh:view', 'ia:consultor-rh:create'],
  'ia:read': ['ia:consultor-geral:view', 'ia:salmon-intelligence:view', 'ia:estoque-geral:view', 'ia:analista-cmv:view', 'ia:consultor-compras:view', 'ia:ficha-tecnica:view', 'ia:consultor-financeiro:view', 'ia:consultor-rh:view'],
  'ia:write': ['ia:consultor-geral:create', 'ia:salmon-intelligence:create', 'ia:estoque-geral:create', 'ia:analista-cmv:create', 'ia:consultor-compras:create', 'ia:ficha-tecnica:create', 'ia:consultor-financeiro:create', 'ia:consultor-rh:create'],
  'rh:read': ['rh:prontuario:view', 'rh:escalas:view', 'rh:tarefas:view', 'rh:onboarding:view', 'rh:treinamento:view', 'rh:ferias:view', 'rh:documentos:view', 'rh:folha:view', 'rh:beneficios:view', 'rh:dashboard:view', 'rh:custos:view', 'rh:sst:view', 'rh:disciplinar:view', 'rh:mural:view', 'rh:ponto:view', 'rh:banco-horas:view'],
  'rh:manage': ['rh:prontuario:manage', 'rh:escalas:edit', 'rh:onboarding:manage', 'rh:ponto:manage', 'rh:ponto:approve', 'rh:banco-horas:manage', 'rh:banco-horas:reconcile', 'rh:folha:manage', 'rh:documentos:manage'],
  'rh:ponto': ['rh:ponto:create'],
  'rh:admin': ['rh:prontuario:create', 'rh:prontuario:edit', 'rh:prontuario:delete', 'rh:escalas:create', 'rh:escalas:delete', 'rh:tarefas:create', 'rh:tarefas:edit', 'rh:tarefas:delete', 'rh:treinamento:create', 'rh:treinamento:edit', 'rh:treinamento:delete', 'rh:ferias:create', 'rh:ferias:approve', 'rh:documentos:create', 'rh:documentos:edit', 'rh:documentos:delete', 'rh:documentos:manage', 'rh:beneficios:create', 'rh:beneficios:edit', 'rh:beneficios:delete', 'rh:sst:create', 'rh:sst:edit', 'rh:sst:delete', 'rh:disciplinar:create', 'rh:disciplinar:edit', 'rh:disciplinar:delete', 'rh:mural:create', 'rh:folha:manage', 'rh:ponto:approve', 'rh:banco-horas:reconcile'],
  'rh:write': ['rh:prontuario:create', 'rh:prontuario:edit', 'rh:escalas:create', 'rh:escalas:edit', 'rh:tarefas:create', 'rh:tarefas:edit', 'rh:treinamento:create', 'rh:treinamento:edit', 'rh:ferias:create', 'rh:documentos:create', 'rh:documentos:edit', 'rh:beneficios:create', 'rh:beneficios:edit', 'rh:sst:create', 'rh:sst:edit', 'rh:disciplinar:create', 'rh:disciplinar:edit', 'rh:mural:create'],
  'rh:delete': ['rh:prontuario:delete', 'rh:escalas:delete', 'rh:tarefas:delete', 'rh:treinamento:delete', 'rh:documentos:delete', 'rh:beneficios:delete', 'rh:sst:delete', 'rh:disciplinar:delete'],
  'rh:export': ['rh:folha:export', 'rh:custos:export'],
  'finance:read': ['financeiro:dashboard:view', 'financeiro:fechamento:view', 'financeiro:cadastros:view', 'financeiro:contas:view', 'financeiro:lancamentos:view', 'financeiro:pagar:view', 'financeiro:receber:view', 'financeiro:fluxo:view', 'financeiro:dre:view', 'financeiro:orcamento:view', 'financeiro:conciliacao:view', 'financeiro:alertas:view', 'financeiro:recorrencias:view', 'financeiro:categorizacao:view', 'financeiro:relatorio-socios:view', 'financeiro:projecao:view', 'financeiro:kpis:view', 'financeiro:auditoria:view', 'financeiro:comparativo:view'],
  'finance:manage': ['financeiro:fechamento:create', 'financeiro:fechamento:edit', 'financeiro:fechamento:close', 'financeiro:cadastros:create', 'financeiro:cadastros:edit', 'financeiro:cadastros:manage', 'financeiro:contas:create', 'financeiro:contas:edit', 'financeiro:lancamentos:create', 'financeiro:lancamentos:edit', 'financeiro:pagar:create', 'financeiro:pagar:edit', 'financeiro:pagar:approve', 'financeiro:receber:create', 'financeiro:receber:edit', 'financeiro:orcamento:edit', 'financeiro:orcamento:delete', 'financeiro:conciliacao:reconcile', 'financeiro:recorrencias:create', 'financeiro:recorrencias:edit', 'financeiro:recorrencias:delete', 'financeiro:categorizacao:manage'],
  'finance:delete': ['financeiro:cadastros:delete', 'financeiro:contas:delete', 'financeiro:lancamentos:delete', 'financeiro:pagar:delete', 'financeiro:receber:delete', 'financeiro:orcamento:delete'],
  'finance:export': ['financeiro:lancamentos:export', 'financeiro:fluxo:export', 'financeiro:dre:export', 'financeiro:relatorio-socios:export', 'financeiro:pagar:export', 'financeiro:receber:export', 'financeiro:contas:export', 'financeiro:cadastros:export', 'financeiro:projecao:export', 'financeiro:kpis:export', 'financeiro:auditoria:export', 'financeiro:comparativo:export', 'financeiro:orcamento:export'],
  'users:manage': ['configuracoes:usuarios:view', 'configuracoes:usuarios:create', 'configuracoes:usuarios:edit', 'configuracoes:usuarios:delete', 'configuracoes:usuarios:manage'],
  'settings:manage': ['configuracoes:geral:view', 'configuracoes:geral:manage', 'configuracoes:integracoes:view', 'configuracoes:integracoes:manage', 'configuracoes:salmon:view', 'configuracoes:salmon:manage'],
  'system:admin': ['system:global:manage', 'configuracoes:auditoria-sistema:view', 'configuracoes:performance:view', 'configuracoes:auditoria-seguranca:view', 'configuracoes:auditoria-compras:view'],
};
