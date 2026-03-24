# Enterprise Safe — Padrões Obrigatórios de Desenvolvimento

> Documento de referência para toda nova implementação no sistema MarginPro.
> Última atualização: 2026-03-15

---

## 1. Segurança Backend (RPCs)

### Obrigatório em TODA RPC crítica:
```sql
CREATE OR REPLACE FUNCTION public.minha_funcao(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
BEGIN
  _company_id := public.assert_tenant();

  IF NOT public.has_any_permission(
    auth.uid(),
    ARRAY['modulo:subaba:acao', 'system:global:manage']
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- lógica aqui
END;
$$;

REVOKE ALL ON FUNCTION public.minha_funcao(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.minha_funcao(...) TO authenticated;
```

### Checklist:
- [ ] `SECURITY DEFINER` quando necessário
- [ ] `SET search_path = public`
- [ ] `assert_tenant()` no início
- [ ] `has_permission` ou `has_any_permission` para RBAC
- [ ] `REVOKE ALL ... FROM PUBLIC`
- [ ] `GRANT EXECUTE ... TO authenticated`
- [ ] Sem aceitar `user_id` do frontend — usar `auth.uid()`
- [ ] Sem aceitar `company_id` do frontend — resolver via `assert_tenant()`

---

## 2. Segurança Frontend (RBAC)

### Obrigatório em TODA tela/sub-aba:
```tsx
import { useCan, useModuleAccess } from '@/permissions';

const canView = useCan('modulo:subaba:view');
const canCreate = useCan('modulo:subaba:create');
const canEdit = useCan('modulo:subaba:edit');
const canDelete = useCan('modulo:subaba:delete');
const canExport = useCan('modulo:subaba:export');

if (!canView) return <NoAccess />;
```

### Checklist:
- [ ] `useCan` para cada ação (view, create, edit, delete, export)
- [ ] `<NoAccess />` quando sem permissão de view
- [ ] Botões de ação condicionados a permissão
- [ ] Botões de exportação condicionados a `canExport`

---

## 3. Mutações

### PROIBIDO em operações críticas:
```tsx
// ❌ NUNCA fazer insert/update/delete direto para operações críticas
supabase.from('tabela').insert(...)
supabase.from('tabela').delete()
```

### CORRETO:
```tsx
// ✅ Usar RPC para mutações críticas
supabase.rpc('funcao_guarded', { params })
```

### Quando usar RPC obrigatoriamente:
- Operações financeiras
- Operações multi-step / multi-tabela
- Operações que geram audit trail
- Operações que exigem validação de negócio
- Aprovações / cancelamentos / estornos

### Quando insert direto é aceitável:
- Cadastros simples (categorias, locais, etc.)
- Desde que tenha RLS adequado e trigger de company_id

---

## 4. Listagens e Paginação

### Obrigatório para listas potencialmente grandes:
```tsx
// ✅ Paginação por cursor (preferido)
supabase.rpc('list_entidade_cursor', {
  p_limit: PAGE_SIZE,
  p_cursor_date: cursorDate,
  p_cursor_id: cursorId,
})

// ✅ Ou paginação por offset para listas menores
.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
```

### PROIBIDO:
```tsx
// ❌ NUNCA buscar tudo sem limite
supabase.from('tabela').select('*')

// ❌ Evitar select('*') — usar projeção explícita
supabase.from('tabela').select('id, nome, valor')
```

---

## 5. Cálculos Financeiros

### Regras GLOBAIS obrigatórias:
1. **Excluir TRANSFERENCIA** de receita/despesa/resultado
2. **Incluir CONCILIADO** junto com REALIZADO
3. **Considerar rateios** (`fin_lancamento_rateios`) em breakdowns por categoria
4. **Calcular server-side** via RPC — nunca no frontend
5. **Filtro padrão**: `status IN ('REALIZADO', 'CONCILIADO') AND tipo != 'TRANSFERENCIA'`

### Fórmulas padronizadas:
```sql
-- Receita
SUM(valor) WHERE tipo = 'RECEITA' AND status IN ('REALIZADO','CONCILIADO')

-- Despesa
SUM(valor) WHERE tipo = 'DESPESA' AND status IN ('REALIZADO','CONCILIADO')

-- Resultado
receita - despesa

-- Margem
CASE WHEN receita > 0 THEN (resultado / receita) * 100 ELSE 0 END
```

---

## 6. Reatividade (Auto-refresh)

### Obrigatório:
```tsx
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';

// Escutar mutações relevantes
useDataEvent('financeiro:lancamentos', loadData);

// Emitir após mutação
emitDataEvent('financeiro:lancamentos');
```

### Checklist:
- [ ] `useDataEvent` em toda tela que depende de dados mutáveis
- [ ] `emitDataEvent` após todo save/delete/update
- [ ] Sem stale closure — usar `useRef` para funções ou deps corretas em `useCallback`

---

## 7. UX de Segurança

### Obrigatório:
```tsx
// Loading state + proteção double-click
const [saving, setSaving] = useState(false);
const handleSave = async () => {
  if (saving) return;
  setSaving(true);
  try { /* ... */ } finally { setSaving(false); }
};

// Confirmação em ações destrutivas
const { confirm, ConfirmDialog } = useConfirmDialog();
const ok = await confirm({
  title: 'Excluir registro',
  description: 'Esta ação não pode ser desfeita.',
  variant: 'destructive',
});
if (!ok) return;

// Skeleton loading
{loading ? <Skeleton className="h-8 w-full" /> : <Content />}
```

---

## 8. Type Safety

### PROIBIDO:
```tsx
// ❌ NUNCA usar any em retornos de RPC
const data = result as any;

// ❌ NUNCA usar any em estados
const [items, setItems] = useState<any[]>([]);
```

### CORRETO:
```tsx
// ✅ Criar interface explícita
interface MinhaEntidade { id: string; nome: string; valor: number; }
const [items, setItems] = useState<MinhaEntidade[]>([]);
```

### Contratos tipados centrais (usar quando aplicável):
| Arquivo | Tipos |
|---------|-------|
| `src/types/estoque.ts` | `ProdutoExtended`, `MovimentacaoExtended`, `ProdutoComSaldo`, `ProdutoFormData` |
| `src/types/financeiro.ts` | `ContaBancariaRef`, `CategoriaFinRef`, `LancamentoConciliacao`, `LancamentoCandidate`, `ContaPagarCandidate`, `ContaReceberCandidate`, `AuditRow`, `PaginatedResponse<T>` |
| `src/types/salmon.ts` | `Produto`, `MovimentacaoEstoque`, `Supplier`, etc. |

### Normalização de payloads:
```tsx
// ✅ Padrão: raw → normalize → typed view model → componente
import { narrowRows, narrowScalar } from '@/lib/guards';

const items = narrowRows(data, row => ({
  id: row.id,
  nome: row.nome,
  valor: Number(row.valor),
}));
```

---

## 9. Datas e Timezone

### PROIBIDO:
```tsx
// ❌ NUNCA usar new Date() para lógica de negócio
new Date().toISOString()
// ❌ NUNCA usar toISOString().split('T') para datas de negócio
```

### CORRETO:
```tsx
// ✅ Usar helpers de src/lib/datetime.ts
import { todayBR, formatDateBR, formatDisplayBR, formatInBR, parseUTCToBR } from '@/lib/datetime';

const hoje = todayBR();         // '2026-03-15' em America/Sao_Paulo
const display = formatDisplayBR(); // '15/03/2026'
```

---

## 10. Auditoria

### Mutações críticas devem gerar audit trail:
```sql
INSERT INTO audit_logs (
  action, module, entity, entity_id,
  actor_user_id, company_id,
  before, after, severity
) VALUES (...);
```

---

## 11. Optimistic Locking

### Para edições de registros compartilhados:
```tsx
// Frontend: salvar updated_at ao abrir edição
const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null);

// Backend: validar na RPC
IF (SELECT updated_at FROM tabela WHERE id = p_id) != p_expected_updated_at THEN
  RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
END IF;
```

---

## 12. Exportação

### Padrão oficial de exportação:
```tsx
import { exportTableToPdf, exportTableToExcel } from '@/lib/exportHelpers';

const canExport = useCan('modulo:subaba:export');

{canExport && (
  <>
    <Button onClick={() => exportTableToPdf({...})} disabled={exporting}>PDF</Button>
    <Button onClick={() => exportTableToExcel({...})} disabled={exporting}>Excel</Button>
  </>
)}
```

### Regras para exports:
- Nomenclatura: `{modulo}_{subaba}_{YYYY-MM-DD}.{ext}`
- Usar timezone BR para datas no arquivo
- Loading state durante geração
- Toast de sucesso/erro
- RBAC obrigatório via `useCan`
- Usar `src/lib/exportHelpers.ts` — não duplicar lógica de export

---

## 13. Select Projection

### PROIBIDO:
```tsx
// ❌
.select('*')
```

### CORRETO:
```tsx
// ✅ Projeção explícita dos campos usados
.select('id, nome, valor, created_at, updated_at')
```

### Allowlist (exceções documentadas):
| Arquivo | Motivo | Plano de remoção |
|---------|--------|------------------|
| `useEstoqueGeralStore.ts` | Mapeia todas as colunas DB → frontend via `dbToProduto()`. Projeção parcial quebraria o mapeamento. | Migrar para RPC com retorno tipado. |
| `useSalmonStore.ts` | Mesmo padrão — store central mapeia todas as colunas. | Migrar para RPC com retorno tipado. |

---

## 14. Multi-Tenant

### PROIBIDO:
```tsx
// ❌ NUNCA enviar company_id do frontend
.insert({ ...payload, company_id: companyId })
```

### CORRETO:
```sql
-- ✅ Backend resolve via assert_tenant() ou trigger
_company_id := public.assert_tenant();
```

---

## 15. Guards e Helpers Reutilizáveis

### `src/lib/guards.ts`:
```tsx
import { createSubmitGuard, narrowRows, narrowScalar } from '@/lib/guards';

// Submit guard (double-click protection)
const guard = createSubmitGuard();
await guard(async () => { /* mutação */ });

// Narrow RPC response
const items = narrowRows(data, mapperFn);
const count = narrowScalar(data, 0);
```

### `src/hooks/useConfirmDialog.tsx`:
```tsx
const { confirm, ConfirmDialog } = useConfirmDialog();
const ok = await confirm({ description: '...', variant: 'destructive' });
```

### `src/lib/datetime.ts`:
```tsx
import { todayBR, formatDateBR, formatDisplayBR, parseUTCToBR } from '@/lib/datetime';
```

### `src/lib/exportHelpers.ts`:
```tsx
import { exportTableToPdf, exportTableToExcel } from '@/lib/exportHelpers';
```

---

## 16. Templates Base para Novas Telas

Templates prontos em `src/components/templates/`:

| Template | Uso |
|----------|-----|
| `CrudSectionTemplate` | Listagem + CRUD completo |
| `AnalyticsSectionTemplate` | Relatórios / analytics read-only |
| `DashboardSectionTemplate` | Dashboards com KPIs e cards |

Todos já incluem: RBAC, NoAccess, Skeleton, loading, submit guard, confirm dialog, dataEvent, type safety.

**Como usar**: copiar o template, substituir os marcadores `TODO`, conectar à RPC/query real.

---

## 17. Quality Gate — Checks Anti-Regressão (v3)

O projeto inclui 13 checks automatizados em `scripts/rbac-lint.ts`:

| # | Check | Tier | O que detecta |
|---|-------|------|---------------|
| 1 | Registry Actions | 🚫 BLOCKER | Ações inválidas no registry de permissões |
| 2 | Module Access | 🚫 BLOCKER | `useModuleAccess()` referenciando módulo inexistente |
| 3 | Edge Guards | ⚠️ IMPORTANT | Edge function sem `has_permission` |
| 4 | Admin RPC Misuse | 🚫 BLOCKER | `adminClient.rpc()` em RPC que precisa de `auth.uid()` |
| 5 | Bypass Patterns | 🚫 BLOCKER | `isMaster` / `hasRole('admin')` em lógica de autorização |
| 6 | Select Star | ⚠️ IMPORTANT | `select('*')` fora da allowlist |
| 7 | Timezone | ⚠️ IMPORTANT | `toISOString().split('T')` para datas de negócio |
| 8 | Direct Deletes | ⚠️ IMPORTANT | `.delete()` direto em tabelas críticas |
| 9 | Missing RBAC | ⚠️ IMPORTANT | Componente grande com DB queries sem `useCan` |
| 10 | No Confirm | ⚠️ IMPORTANT | `.delete()` sem dialog de confirmação |
| 11 | As Any Critical | ℹ️ INFO | `as any` em arquivos críticos |
| 12 | No Loading | ℹ️ INFO | Mutações DB sem saving/loading state |
| 13 | Missing Export | ℹ️ INFO | Permissão `:export` registrada sem implementação |

### Execução:
```bash
npm run rbac:lint
```

### Política de severidade:
| Tier | Ação obrigatória |
|------|------------------|
| 🚫 BLOCKER | **Bloqueia deploy.** Corrigir imediatamente. |
| ⚠️ IMPORTANT | **Registrar no backlog.** Corrigir antes do próximo sprint. |
| ℹ️ INFO | **Melhoria contínua.** Corrigir oportunisticamente. |

### Saída do quality gate mostra para cada finding:
- Arquivo e linha
- Check e tier
- Descrição do problema
- Sugestão de correção
- Se está na allowlist

---

## 18. Política de Exceções Controladas

### Toda exceção arquitetural DEVE ter:

```tsx
// @enterprise-exception
// motivo: useEstoqueGeralStore mapeia todas as colunas via dbToProduto()
// escopo: select('*') apenas neste store
// risco: over-fetching de colunas, potencial data leak
// plano: migrar para RPC com retorno tipado (backlog Q2)
// owner: equipe estoque
```

### Regras:
- Exceções sem comentário `@enterprise-exception` são consideradas **não documentadas**
- Toda exceção nova precisa de justificativa técnica real
- Revisão a cada novo módulo ou refactor relevante
- Objetivo permanente: **reduzir allowlist a zero**

### Allowlist atual:
| Arquivo | Check | Motivo | Plano |
|---------|-------|--------|-------|
| `useEstoqueGeralStore.ts` | select('*') | Mapeia todas colunas via dbToProduto() | RPC tipada |
| `useSalmonStore.ts` | select('*') | Store central mapeia todas colunas | RPC tipada |

---

## 19. Checklist para Novas Features

Toda nova aba, sub-aba, view ou seção **DEVE** nascer com:

- [ ] Template adequado (`CrudSection`, `AnalyticsSection`, `DashboardSection`)
- [ ] `useCan('modulo:subaba:view')` + `<NoAccess />`
- [ ] Loading skeleton (`<Skeleton />`)
- [ ] Submit guard (double-click protection)
- [ ] `useConfirmDialog()` em ações destrutivas
- [ ] Export padrão se permissão `:export` existir (`exportHelpers.ts`)
- [ ] Timezone helpers (`todayBR`, `formatDateBR`)
- [ ] Type safety (interfaces explícitas, sem `any`)
- [ ] `useDataEvent` para dependências reativas
- [ ] Paginação cursor/offset quando houver potencial de volume
- [ ] RPC guardada para operações críticas
- [ ] Audit trail quando aplicável
- [ ] Sem `select('*')` — projeção explícita

---

## 20. Matriz de Aderência por Módulo (Pós-Onda 5 — Março 2026)

| Módulo | Tipo | Templates | Export Padrão | Guards | Tipos Centrais | Quality Gate | Exceções | `as any` restantes | Aderência |
|--------|------|-----------|---------------|--------|----------------|-------------|----------|-------------------|-----------|
| Financeiro | Híbrido | Parcial | ✅ | ✅ | ✅ `financeiro.ts` | ✅ | 1 (ConciliacaoBancaria) | ~15 (jsPDF + RPC) | 🟢 Alta |
| Estoque | CRUD+Dash | ✅ ProdutoFormPanel | ✅ | ✅ | ✅ `estoque.ts` | ✅ | 1 (allowlist select*) | 0 em View/Store | 🟢 Alta |
| RH | CRUD | Parcial | ✅ | ✅ | Parcial | ✅ | 3 (Json[] casts) | ~5 residuais | 🟢 Alta |
| Compras | CRUD | Parcial | ✅ | ✅ | ✅ PurchaseRequisition | ✅ | 0 | ~15 (PedidosCompras) | 🟡 Média |
| Salmão | CRUD+Dash | Parcial | ✅ | ✅ | ✅ `salmon.ts` | ✅ | 1 (allowlist select*) | ~120 (useSalmonStore) | 🟠 Atenção |
| CMV | Analytics | — | ✅ | ✅ | Parcial | ✅ | 0 | ~3 | 🟢 Alta |
| Inventário | CRUD+Dash | ✅ Dashboard+Audit | ✅ | ✅ | Parcial | ✅ | 0 | 0 | 🟢 Alta |
| Auditoria | Analytics | — | ✅ exportHelpers | ✅ | ✅ AuditRow | ✅ | 0 | ~3 (jsPDF) | 🟢 Alta |
| Admin | Especial | — | — | ✅ | — | ✅ | 0 | ~2 (RPC admin) | 🟢 Alta |

### Legenda:
- 🟢 Alta: segue >80% dos padrões, exceções documentadas
- 🟡 Média: segue padrões core, com backlog residual administrável
- 🟠 Atenção: funcional mas com dívida concentrada em um ponto
- 🔴 Baixa: precisa de migração significativa

---

## 21. Ritual de Manutenção Contínua

### Rotina permanente:
1. **Toda nova feature** → usar template base + checklist seção 19
2. **Todo refactor** → rodar `npm run rbac:lint` antes de finalizar
3. **Toda exceção** → documentar com `@enterprise-exception` no código
4. **Todo módulo crítico** → ter contratos tipados centrais
5. **Revisão periódica** → mirar redução de allowlist, `any` e duplicações

### Backlog saudável de evolução (Pós-Onda 5):
| Prioridade | Item | Status |
|------------|------|--------|
| Alta | Migrar `useSalmonStore` para boundaries tipadas + RPC tipada | Planejado — principal hotspot restante (~120 as any) |
| Média | Tipar RPCs de `PedidosComprasMercadoView` | Planejado |
| Média | Tipar RPCs de `usePurchaseOrdersStore` | Planejado |
| Baixa | Eliminar `(doc as any).autoTable` com wrapper tipado | Oportunístico — afeta 6 arquivos de PDF |
| Baixa | Migrar `AccessManagementCard` RPCs admin para schema tipado | Oportunístico |
| Baixa | Migrar componentes antigos para templates | Oportunístico |

---

## 22. CI/CD Integration

O quality gate está integrado no CI pipeline via GitHub Actions:

```yaml
# .github/workflows/security-gate.yml
- name: RBAC Quality Gate
  run: npm run rbac:lint    # blockers = exit 1 = deploy blocked

- name: Security Gate
  run: npx tsx scripts/verify-security.ts  # SQL lint + code lint
```

Qualquer **BLOCKER** encontrado pelo quality gate **bloqueia o build**.

---

## 23. Allowlist Final (Pós-Onda 5)

| Arquivo | Check | Motivo | Risco | Plano de remoção |
|---------|-------|--------|-------|------------------|
| `useEstoqueGeralStore.ts` | select('*') | Store central mapeia todas colunas via `dbToProduto()` com boundary tipada | Baixo — over-fetching, sem data leak (RLS ativo) | Migrar para RPC com retorno tipado |
| `useSalmonStore.ts` | select('*') | Store central mapeia todas colunas de 8+ tabelas | Baixo — mesmo padrão | Migrar para RPC tipada (principal hotspot futuro) |

---

## 24. Enterprise-Exceptions Documentadas

| Arquivo | Tipo | Motivo |
|---------|------|--------|
| `OnboardingSection.tsx` | `as unknown as Json[]` | Campo dinâmico (checklist/documentos) requer cast para Supabase update |
| `TarefasSection.tsx` | `as unknown as Json[]` | Mesmo padrão — checklist dinâmico |
| `TreinamentoSection.tsx` | `as unknown as Json[]` | Mesmo padrão — checklist dinâmico |
| `ConciliacaoBancariaSection.tsx` | chain cast | Query builder perde tipo após `.or()` condicional |
| `ContasReceberSection.tsx` | `as unknown` | RPC espera Json para p_rateios/p_recorrencia |
| `RequisicaoDetailModal.tsx` | `as unknown as Record` | jsPDF autoTable plugin requer acesso dinâmico |

Todas documentadas com `@enterprise-exception` inline.

---

## 25. Fechamento da Frente de Estabilização (Março 2026)

### Histórico das ondas:

| Onda | Foco | `as any` removidos | Componentes extraídos | Resultado |
|------|------|--------------------|-----------------------|-----------|
| 1 | Financeiro: extração de seções | ~20 | 3 (Categorias, PlanoContas, CentrosCusto) | FinanceiroView 615→250 linhas |
| 2 | Estoque + Auditoria: tipagem | ~20 | 0 | GlobalAuditView, PlanningView tipados |
| 3 | Inventário + Conciliação + SecurityAudit | ~74 | 2 (InventarioDashboard, InventarioAudit) | Inventário 0 as any, Conciliação 0 as any |
| 4 | EstoqueGeral: formulário + store | ~91 | 1 (ProdutoFormPanel) | EstoqueGeral + store 0 as any |
| 5 | RH + Compras: schema alignment | ~33 | 0 | RH alinhado ao schema, Compras tipado |
| Final | Quick wins + documentação | ~10 | 0 | DRE, Orçamento, Análise, Transfers tipados |

**Total: ~248 `as any` removidos em 5 ondas + fechamento.**

### Estado de encerramento:

- ✅ Módulos críticos (Financeiro, Estoque, Inventário, Auditoria) aderentes
- ✅ Blockers do Quality Gate zerados
- ✅ Exceptions mínimas e 100% documentadas com `@enterprise-exception`
- ✅ Allowlist com 2 itens conscientes e com plano de remoção
- ✅ Contratos centrais em `estoque.ts`, `financeiro.ts`, `salmon.ts`
- ✅ Templates operacionais em `src/components/templates/`
- ✅ Helpers padronizados: `guards.ts`, `exportHelpers.ts`, `datetime.ts`, `dataEvents.ts`
- ✅ CI/CD com security gate bloqueante

### Critério para abrir nova onda:
1. Novo módulo grande nasce fora dos padrões
2. `useSalmonStore` precisa de refactor por motivo funcional
3. Quality Gate detecta regressão significativa
4. Mudança de schema que afete boundaries existentes

### A frente de estabilização Enterprise Safe está **oficialmente encerrada**.

---

## 12. Domain Rules Layer (Camada de Regras de Negócio)

> Adicionado em 2026-03-15. Referência completa: `docs/DOMAIN_RULES.md`

### Objetivo

Eliminar divergência semântica entre módulos que exibem o mesmo indicador financeiro. Cada regra de negócio tem uma única fonte de verdade.

### Estrutura

```
src/domain/
  financeiro/
    contracts.ts    — Contratos tipados (FinancialSummary, InadimplenciaSummary, etc.)
    invariants.ts   — Invariantes assertivas (assertResultado, assertMargem, etc.)
    selectors.ts    — Helpers oficiais (isTransferencia, calcResultado, resolveRateio, etc.)
    rules.ts        — Registry de regras com ID, fórmula e consumidores
    index.ts        — Entry point
  estoque/
    rules.ts        — Placeholder para regras futuras
  rh/
    rules.ts        — Placeholder para regras futuras
```

### Regras obrigatórias para novas features financeiras

1. Consultar `docs/DOMAIN_RULES.md` antes de implementar
2. Usar selectors de `src/domain/financeiro/selectors.ts` (ex: `calcResultado`, `isTransferencia`)
3. Consumir contratos de `src/domain/financeiro/contracts.ts`
4. **NÃO** recalcular Receita, Despesa, Resultado ou Margem inline
5. Documentar novas regras no catálogo oficial
6. Declarar fonte da verdade dos números exibidos

### Módulos já alinhados

| Módulo | Usa Domain Selectors | Status |
|--------|---------------------|--------|
| Dashboard Financeiro | ✅ `calcVariacaoPct` | Alinhado |
| Relatório Sócios | ✅ Regras documentadas | Alinhado |
| KPIs | ✅ `autoTable` tipado | Alinhado |
| Comparativo | ✅ `calcVariacaoPct`, `autoTable` tipado | Alinhado |
| Fluxo de Caixa | ✅ RPC tipado sem `as any` | Alinhado |
| DRE | ✅ Regras documentadas | Alinhado |
| DFC | ✅ Contratos centrais | Alinhado |
