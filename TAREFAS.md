# Controle de Tarefas - Moralles Food

Este arquivo serve para sincronizar o progresso do desenvolvimento entre os diferentes computadores (MacBook e PC principal) usando o Git e o meu contexto como assistente de IA.

## 📝 Como usar
1. **Sempre puxe as alterações** (`git pull origin main`) antes de começar a trabalhar em qualquer computador.
2. Sempre que eu (a IA) finalizar uma tarefa, vou marcar as caixinhas aqui.
3. **Sempre envie as alterações** (`git push origin main`) ao finalizar o dia de trabalho.
4. Quando abrir o VS Code em outro PC, você pode me dizer: *"Leia o arquivo TAREFAS.md e vamos continuar de onde paramos"*.

---

## 🚀 Próximas Tarefas (To-Do)
- [ ] Monitorar integridade dos dados na empresa piloto após ativação multi-tenant
- [ ] Testar fluxo completo: criar empresa → criar admin → login admin → criar usuários

## 🔄 Em Progresso (Doing)
(Nenhuma tarefa em progresso)

## ✅ Concluído (Done)
- [x] **Multi-Tenant Onboarding — Gestão de Empresas (2026-04-01)**
    - Hardened `get_current_company_id()`: removido fallback perigoso que retornava "primeira empresa ativa" — agora retorna NULL se perfil sem empresa
    - Nova RPC `onboard_new_company()`: cria empresa + seed de cargos padrão + audit log
    - Nova RPC `update_company()`: edita nome, CNPJ, ativo/inativo com validação de CNPJ duplicado
    - Nova RPC `list_companies()`: lista empresas com contagem de usuários (super-admin only)
    - Nova Edge Function `admin-companies`: ação `create-first-user` para criar admin de nova empresa
    - Novo componente `AdminCompaniesView`: CRUD completo com cards, dialogs de criar/editar empresa e criar admin
    - Nova aba "Empresas" no Painel Admin
    - Permissões registradas: `configuracoes:empresas:{view,create,edit,delete}`
    - Migração: `20260401200000_multi_tenant_onboarding.sql`
    - Arquivos: `AdminCompaniesView.tsx`, `AdminPanel.tsx`, `registry.ts`, `admin-companies/index.ts`
- [x] **Hardening de Sincronização Financeira (2026-04-01)**
    - Guard contra deleção de espelhos, estorno de CP/CR, rateio no espelho, validação de conta bancária
    - Auditoria de integridade `fin_audit_integrity_check()`
    - Migração: `20260401140000_financial_sync_hardening.sql`
- [x] **Fix entidade_id type mismatch RPCs auxiliares (2026-04-01)**
    - Removido cast `::text` em 8 RPCs que inseriam UUID como text na `fin_audit_logs`
    - Migração: `20260401120000_fix_auxiliary_audit_entidade_id_type.sql`
- [x] **Fix Fluxo de Caixa — Datas, Contas Vencidas e Cards (2026-04-01)**
    - Fix formato de datas: RPCs recebiam `dd/MM/yyyy` em vez de `yyyy-MM-dd` (afetava FluxoCaixa, DFC e Dashboard)
    - Contas vencidas (data_vencimento < hoje) agora aparecem no fluxo de caixa independente do período
    - Cards "Prev. Entradas" e "Prev. Saídas" exibidos no modo "Só Previsto"
    - Coluna Categoria adicionada na tabela de Contas a Pagar
    - Fix rateios payload (length > 0) e remoção de JSON.stringify redundante
    - Migrações: `20260331170000`, `20260401001000`, `20260401001500`
    - Arquivos: `FluxoCaixaSection`, `DFCSection`, `DashboardFinanceiroSection`, `ContasPagarSection`, `ContasReceberSection`
- [x] **Fix Itens Indisponíveis → Não Entregues (2026-03-31)**
    - Bug: itens marcados "indisponível" no Checklist de Compra não faziam o pedido ir para "Não Entregues" — iam direto para "Concluídos"
    - Fix Backend: RPC `receive_purchase_order_atomic` agora consulta TODOS os itens do pedido para determinar status (não só o batch atual)
    - Fix Frontend: `confirmReceiving` agora inclui itens NOT_AVAILABLE como NOT_DELIVERED no RPC call
    - UI: Adicionada seção "Indisponíveis na compra" em vermelho na tela de recebimento com observação do checklist
    - Migração: `20260331150834_fix_receive_status_not_available.sql`
    - Arquivos: `PedidosComprasMercadoView.tsx`, `usePurchaseOrdersStore.ts`
- [x] **Fix Saldo Estoque & Requisições (2026-03-31)**
    - Corrigida divergência entre `fn_recompute_product_saldo` (cache) e `attend_requisicao_item_atomic` (RPC) — ambas agora ignoram estornos (`ENTRADA_ESTORNO`/`SAIDA_ESTORNO`)
    - Migrações: `20260331132000_fix_saldo_cache_estorno.sql`, `20260331133000_fix_saldo_revert_and_fix_rpc.sql`
    - Recomputados todos os saldos de produtos no banco
- [x] **Fix Error Handling Requisições (2026-03-31)**
    - Frontend agora extrai mensagens reais do backend via `extractEdgeFnErrorMessage()` em vez de mostrar toast genérico
    - Corrigido em `handleConfirmAttend`, `handleAtenderItemDirect`, `handleAtenderTodos`, `handleConfirmReject`
- [x] **SearchableSelect Global (2026-03-31)**
    - Criado componente genérico `components/ui/SearchableSelect.tsx` (Popover + Command/cmdk com campo de busca)
    - Aplicado em 13 arquivos / 25+ selects: produtos, categorias, locais, usuários, fornecedores, módulos, ações
    - Arquivos: `MovimentacoesSection`, `StockLossesSection`, `StockTopConsumedSection`, `StockInactivityAlert`, `SimuladorCompraGeral`, `StockConsumptionHistorySection`, `StockTransfersSection`, `RankingFornecedoresView`, `InventarioView`, `OnboardingSection`, `ProdutoFormPanel`, `CalendarioLembretesView`, `GlobalAuditView`
- [x] **Fix Salmon Module Tenant Isolation**
    - RPCs `create_salmon_entry_atomic`, `cancel_salmon_entry_atomic`, `create_salmon_manipulation_atomic`, `cancel_salmon_manipulation_atomic` atualizadas com `assert_tenant()` e `company_id` explícito em todos os INSERTs/UPDATEs
    - Função `ensure_salmon_raw_product()` tenantizada
    - `get_current_company_id()` atualizada para evitar placeholder UUID
    - `assert_tenant()` reforçada para bloquear placeholder
    - Schema repair: `supplier_item_prices` ganhou colunas `company_id` e `supplier_uuid`
    - Unique constraints atualizadas: `suppliers(name, company_id)` e `supplier_item_prices(supplier_id, stock_item_id, company_id)`
    - Migrações: `20260330124000-124003` (atomic), `20260330130000-130003` (tenantized), `20260330140000` (unblock tenant), `20260330141000` (ensure_salmon_raw_product), `20260330142000` (suppliers repair), `20260330143000` (supplier_item_prices repair)
    - Frontend (`useSalmonStore.ts`): Sem alterações necessárias — usa `_guarded` wrappers que delegam para `*_atomic` que resolvem `company_id` internamente via `assert_tenant()`
- [x] **Fix scroll em dropdowns/comboboxes de todo o sistema** (cmdk 1.x + Radix Popover)
    - Causa: cmdk 1.x aplica `overflow: hidden` e `height: var(--cmdk-list-height)` via inline styles, impedindo scroll
    - Correção: Override global CSS em `index.css` com `[cmdk-list] { max-height: 300px !important; overflow: auto !important; }`
    - Afeta: ProductSearchCombobox, CategoryCombobox, SupplierCombobox, PedidosComprasMercadoView (categorias + fornecedor)
- [x] Corrigido bug de seleção de produtos no modal de Movimentação de Estoque
    - Causa: `useEffect` de reset do formulário incluía `hasPurchaseUnit` como dependência, criando loop de reset
    - Correção: Separado `useEffect` de reset (só depende de `open`, `preset`) de `useEffect` de auto-toggle da unidade de compra
    - Arquivos: `NovaMovimentacaoModal.tsx`, `ProductSearchCombobox.tsx`, `useEstoqueGeralStore.ts`
    - Migração: `20260328147000_fix_produtos_permissions.sql` (GRANTs e RLS)
- [x] Otimizada Edge Function 'admin-users' do Supabase para corrigir timeout de 10s.
- [x] Rodada auditoria inicial de segurança (NPM audit e varredura de chaves).
- [x] Otimização da página de Usuários (Timeout corrigido)
- [x] Cadastro rápido de fornecedores em lançamentos (Concluído)
  - [x] Criar componente `QuickSupplierDialog`
  - [x] Integrar no `SupplierCombobox`
  - [x] Integrar no `EntriesView` (Stoque/Salmon)
  - [x] Monitorar integridade dos dados na empresa piloto
  - [x] Ativar nas telas do Financeiro
- [x] Limpeza de empresas inativas e dados órfãos (20260328144800)
- [x] Sincronização de Perfis e Turnos (20260328145500)
- [x] Reparo de Registros Órfãos (1454+ registros vinculados ao pilot) (20260328146000)
- [x] Otimização da RPC `create_inventory_atomic` para evitar timeouts
- [x] Validação da visibilidade de produtos no Catálogo e Movimentações
- [x] Importação de itens do catálogo antigo (Concluído)
- [x] Sincronização entre máquinas PC e MacBook (Concluído)
- [x] Atualizado pacote Node.js para mitigar vulnerabilidades.
- [x] Corrigir BUG: Contas a Pagar não permite edição/exclusão (Implementado RPCs guardadas e TableActions)
- [x] Corrigir BUG: Contas a Receber não permite edição/exclusão (Implementado RPCs guardadas e TableActions)
- [x] Criar componente `TableActions` para padronização de CRUD
- [x] Implementar RPCs `_guarded_` para update/delete financeiro em `20260330114000_financial_crud_hardening.sql`
- [x] Configurar o repositório Git no MacBook e verificar funcionamento.
- [x] Criar arquivo de controle `TAREFAS.md` para manter o contexto do assistente de IA em ambas as máquinas.
- [x] Sincronizar repositório local com o novo nome `margin-food`.
- [x] Corrigir turnos ausentes no banco de dados para a empresa piloto (Migration SQL).
- [x] Padronizar CRUD de todos os módulos financeiros (Contas, Categorias, Centros, Plano)
- [x] Implementar RPCs `_guarded_` e TableActions em Categorias, Centros de Custo, Plano de Contas e Contas Bancárias
- [x] Criar migração SQL `20260330120000_auxiliary_fin_crud_hardening.sql`
- [x] Implementar Optimistic Locking (updated_at) em todos os cadastros financeiros
- [x] Verificar integridade do banco de dados pós-limpeza.
- [x] Atualizar documentação centralizada (`CLAUDE.md`).
