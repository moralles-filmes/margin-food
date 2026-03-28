# Controle de Tarefas - Moralles Food

Este arquivo serve para sincronizar o progresso do desenvolvimento entre os diferentes computadores (MacBook e PC principal) usando o Git e o meu contexto como assistente de IA.

## 📝 Como usar
1. **Sempre puxe as alterações** (`git pull origin main`) antes de começar a trabalhar em qualquer computador.
2. Sempre que eu (a IA) finalizar uma tarefa, vou marcar as caixinhas aqui.
3. **Sempre envie as alterações** (`git push origin main`) ao finalizar o dia de trabalho.
4. Quando abrir o VS Code em outro PC, você pode me dizer: *"Leia o arquivo TAREFAS.md e vamos continuar de onde paramos"*.

---

## 🚀 Próximas Tarefas (To-Do)
- [ ] Descreva aqui o que você estava tentando fazer antes de trocar de computador (ex: "Criar página de login", "Ajustar botão de pagamento").

## 🔄 Em Progresso (Doing)
(Nenhuma tarefa em progresso)

## ✅ Concluído (Done)
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
- [x] Configurar o repositório Git no MacBook e verificar funcionamento.
- [x] Criar arquivo de controle `TAREFAS.md` para manter o contexto do assistente de IA em ambas as máquinas.
- [x] Sincronizar repositório local com o novo nome `margin-food`.
- [x] Corrigir turnos ausentes no banco de dados para a empresa piloto (Migration SQL).
- [x] Consolidar o sistema para **Single-Tenant** (Remoção de empresas legadas e dados órfãos).
- [x] Verificar integridade do banco de dados pós-limpeza.
- [x] Atualizar documentação centralizada (`CLAUDE.md`).
