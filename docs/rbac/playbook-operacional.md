# Playbook Operacional RBAC — Pós-Hardening

> **Status**: Etapas 1–6 concluídas ✅  
> **Data**: 2026-03-01  
> **Versão**: 1.0

---

## 1. Checklist Pré-Deploy (obrigatório)

### 1.1 Code Lint
```bash
npm run rbac:lint
```
- **Resultado esperado**: `✅ PASS`
- **Se FAIL**: corrigir TODOS os erros antes de fazer merge/deploy
- **Anexar output** no PR / changelog

### 1.2 SQL Lint (admin)
```sql
SELECT public.rbac_sql_lint_report();
```
- **Resultado esperado**: `status: "PASS"`
- **Verificar seções**: `tables_without_rls`, `tables_without_force_rls`, `policies_missing_company_filter`
- **Anexar JSON** no PR

### 1.3 Permissions Diff
```sql
-- Passar array com todas as keys do registry
SELECT public.rbac_permissions_diff('["estoque:geral:view", ...]'::jsonb);
```
- **Resultado esperado**: `missing_in_db: []`, `extra_in_db: []`, `invalid_format: []`

---

## 2. Monitoramento de Legado

### 2.1 Relatório semanal
```sql
SELECT * FROM public.rbac_top_legacy_usage(7, 50);
```

### 2.2 Critério para desligar fallback
| Condição | Ação |
|----------|------|
| `rbac_top_legacy_usage(14, 50)` retorna 0 rows | Desligar em staging |
| 48h em staging sem incidente | Desligar em produção |

### 2.3 Kill switch
```env
# .env.staging / .env.production
VITE_ENABLE_LEGACY_PERMISSIONS=false
```

- Quando `false`, `resolvePermission()` ignora o `LEGACY_PERMISSION_MAP` completamente
- Monitorar logs de erro por 48h após ativar strict mode

---

## 3. Adicionando Feature Nova (Checklist)

### 3.1 Registry (`src/permissions/registry.ts`)
```typescript
// 1. Adicionar subtab ao MODULE_MANIFESTS
{
  key: 'nova-subtab',
  label: 'Nova Funcionalidade',
  actions: [
    { action: 'view', label: 'Ver' },
    { action: 'create', label: 'Criar' },
  ],
}
```

### 3.2 Sync no banco
```sql
SELECT sync_permissions_from_registry();
```
- Verificar: `SELECT * FROM permissions WHERE key LIKE 'modulo:nova-subtab:%';`

### 3.3 Gates no frontend
```tsx
// Hook para verificar acesso
const canView = useCan('modulo:nova-subtab:view');
const canCreate = useCan('modulo:nova-subtab:create');

// Componente wrapper
<RequirePermission perm="modulo:nova-subtab:view">
  <NovaFuncionalidade />
</RequirePermission>

// Visibilidade de tabs
const { visibleSubtabs } = useModuleAccess('modulo');
```

### 3.4 Guards no Edge Function / RPC
```typescript
// Edge Function
const permKey = 'modulo:nova-subtab:create';
const { data: allowed } = await supabaseAdmin.rpc('has_permission', {
  _user_id: user.id,
  _permission: permKey,
});
if (!allowed) return new Response('Forbidden', { status: 403 });
```

```sql
-- RPC
CREATE OR REPLACE FUNCTION public.minha_rpc(...)
RETURNS ... LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'modulo:nova-subtab:create') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  -- lógica...
END;
$$;
```

### 3.5 RLS (se nova tabela)
```sql
-- Habilitar RLS
ALTER TABLE public.nova_tabela ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nova_tabela FORCE ROW LEVEL SECURITY;

-- Policy com tenant + permissão
CREATE POLICY "nova_tabela_select" ON public.nova_tabela
  FOR SELECT USING (
    company_id = public.get_current_company_id()
    AND public.has_permission(auth.uid(), 'modulo:nova-subtab:view')
  );
```

### 3.6 Validação final
```bash
npm run rbac:lint          # PASS obrigatório
npm run test               # 0 falhas
```
```sql
SELECT public.rbac_sql_lint_report();        -- PASS
SELECT public.rbac_permissions_diff(...);    -- 0 missing/extra
```

---

## 4. Allowlists do Lint

### 4.1 Code Lint (`scripts/rbac-lint.ts`)
| Allowlist | Itens | Justificativa |
|-----------|-------|---------------|
| `EDGE_ALLOWLIST` | `check-password`, `scheduled-jobs` | Sem ação de usuário / função interna |

### 4.2 SQL Lint (`rbac_sql_lint_report()`)
| Allowlist | Justificativa |
|-----------|---------------|
| `GLOBAL_TABLE_ALLOWLIST` | Tabelas de sistema sem tenant (companies, permissions, roles) |
| `FORCE_RLS_EXCEPTIONS` | profiles (by design), companies |
| `POLICY_EXCEPTIONS` | Tabelas de log global |

---

## 5. Ações Permitidas (Action Set Oficial)

```
view | create | edit | delete | export | manage | approve | close | reconcile | cancel | simulate
```

Qualquer action fora deste set será flagrada pelo lint como `ERROR`.

---

## 6. Arquitetura de Referência

```
┌─────────────────────────────────────────┐
│  Frontend (React)                       │
│  ├─ useCan('mod:sub:action')            │
│  ├─ useModuleAccess('mod')              │
│  └─ <RequirePermission>                 │
├─────────────────────────────────────────┤
│  Edge Functions                         │
│  └─ has_permission() guard → 403        │
├─────────────────────────────────────────┤
│  Database (RLS + RPCs)                  │
│  ├─ has_permission() em policies        │
│  ├─ get_current_company_id() tenant     │
│  └─ FORCE ROW LEVEL SECURITY           │
├─────────────────────────────────────────┤
│  Lint Automático                        │
│  ├─ npm run rbac:lint (code)            │
│  ├─ rbac_sql_lint_report() (schema)     │
│  └─ rbac_permissions_diff() (sync)      │
└─────────────────────────────────────────┘
```

---

## 7. Contatos & Escalação

- **Incidentes de permissão**: verificar `audit_logs` + `rbac_legacy_usage`
- **Falso positivo no lint**: adicionar à allowlist com justificativa documentada
- **Rollback de strict mode**: `VITE_ENABLE_LEGACY_PERMISSIONS=true` e redeploy
