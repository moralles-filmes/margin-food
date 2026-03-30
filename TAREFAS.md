# Controle de Tarefas - Moralles Food

Este arquivo serve para sincronizar o progresso do desenvolvimento entre os diferentes computadores (MacBook e PC principal) usando o Git e o meu contexto como assistente de IA.

## 📝 Como usar
1. **Sempre puxe as alterações** (`git pull origin main`) antes de começar a trabalhar em qualquer computador.
2. Sempre que eu (a IA) finalizar uma tarefa, vou marcar as caixinhas aqui.
3. **Sempre envie as alterações** (`git push origin main`) ao finalizar o dia de trabalho.
4. Quando abrir o VS Code em outro PC, você pode me dizer: *"Leia o arquivo TAREFAS.md e vamos continuar de onde paramos"*.

---

## 🚀 Próximas Tarefas (To-Do)
(Nenhuma tarefa pendente)

## 🔄 Em Progresso (Doing)
(Nenhuma tarefa em progresso)

## ✅ Concluído (Done)
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
