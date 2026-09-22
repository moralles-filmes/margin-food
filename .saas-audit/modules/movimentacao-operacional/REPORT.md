# Auditoria de módulo — Movimentação Operacional

**Data:** 2026-09-22
**Branch:** `feat/movimentacao-operacional`
**Modo:** `--fix`
**Veredito:** PASS_WITH_WARNINGS — 0 bloqueantes

---

## Mapa do módulo

```
UI                        AuthZ                  Tenant            Banco
──────────────────────────────────────────────────────────────────────────────
MovimentacaoOperacionalView
  └ FluxoMovimentacao      useCan('operacional:  CompanyScope      —
      ├ LeitorCodigoBarras   movimentacao:*')    (x-company-id)
      ├ ProdutoPicker
      └ QuantidadeStepper
             │
             ▼
useMovimentacaoOperacional   (nenhuma query de tabela — só RPC)
             │
             ▼
op_list_setores          has_any_permission     assert_tenant     stock_sectors
op_list_produtos           operacional:*                          + estoque_setor_produtos
op_find_produto_por_barcode                                       + produtos (projeção segura)
op_barcode_existe
op_registrar_movimentacao                                         movimentacoes_estoque
op_list_historico                                                 (+ trigger → produtos.saldo_atual)
```

**Configuração administrativa** (Controle de Estoque → Cadastros, gate
`estoque:cadastros:*`): `ProdutosPorSetorAdmin` e `AcessoSetorPorUsuarioAdmin`.

**Tenancy-profile:** `company_id`; escopo por `get_current_company_id()`
(header `x-company-id` validado contra `company_memberships`); `assert_tenant()`
levanta `COMPANY_ACCESS_DENIED`.

---

## Dependências compartilhadas tocadas

| Arquivo | Mudança | Risco para o módulo administrativo |
|---|---|---|
| `src/permissions/registry.ts` | módulo `operacional` novo | Nenhum — aditivo |
| `src/pages/Index.tsx` | aba nova, última em `TAB_PRIORITY` | Nenhum — ordem preservada para quem já tem acesso |
| `src/components/AppLayout.tsx` | item de navegação | Nenhum — aditivo |
| `src/types/salmon.ts` | `TabId` ganha valor | Nenhum |
| `src/hooks/useEstoqueGeralStore.ts` | `barcode` no select/insert/update | Aditivo; coluna nullable |
| `src/components/estoque/ProdutoFormPanel.tsx` | campo Código de barras | Aditivo; opcional |
| `src/components/EstoqueGeralView.tsx` | popula `barcode` na edição, limpa na duplicação | Aditivo |
| `src/components/StockCadastrosSection.tsx` | 2 abas novas | Aditivo |
| `scripts/rbac-lint.ts` | `DIRECT_DELETE` exige `from('<tabela>')` | Reduz falso positivo; não afrouxa a regra |

`MovimentacoesSection.tsx` e `NovaMovimentacaoModal.tsx` **não foram tocados**
(declarados `forbidden_files` no pacote do router).

---

## Findings

### MOD-movop-001 — idempotência check-then-insert ✅ CORRIGIDO
- **Severidade:** P2 (reclassificado de P3 — mesma classe do incidente de
  lançamentos duplicados no Financeiro)
- **Causa:** o `SELECT` do `client_request_id` rodava antes do
  `SELECT ... FOR UPDATE` do produto. O lock protegia o saldo, não a chave.
- **Impacto:** duas chamadas simultâneas com o mesmo id gravavam duas
  movimentações.
- **Correção:** índice único parcial `uq_mov_operacional_request` em
  `(company_id, reference_id) where reference_type='OPERACIONAL' and
  status='ATIVO'` + tratamento de `unique_violation` como reenvio
  (migration `20260922175315`).
- **Teste:** 1º envio grava · reenvio devolve `idempotente=true` · request id
  novo grava · INSERT direto com id repetido é **barrado pelo índice** →
  2 movimentações para 3 chamadas.

### MOD-movop-002 — `op_barcode_existe` responde sem filtrar setor ⚠️ ACEITO
- **Severidade:** P3
- **Decisão:** trade-off deliberado, documentado em `CLAUDE.md`.
- **Razão:** a função só devolve `boolean` e existe para separar "código não
  cadastrado" de "produto existe, mas fora dos seus setores" — a orientação ao
  operador muda entre os dois casos. Filtrar por setor faria o operador pedir
  cadastro de um código já existente, que colidiria no índice único. O dado
  exposto é a existência de um EAN impresso na embalagem que ele tem na mão.

### MOD-movop-003 — janela de `EXECUTE` para `PUBLIC` entre CREATE e REVOKE ⚠️ ACEITO
- **Severidade:** P3
- **Decisão:** risco residual de deploy, não de runtime.
- **Razão:** os arquivos são separados por limitação conhecida do CLI
  (`CREATE FUNCTION` + outro statement quebra o `db push`). Ambos foram
  aplicados na mesma sessão. Mesmo com `EXECUTE` liberado, `assert_tenant()`
  recusa sessão sem empresa — verificado: `COMPANY_ACCESS_DENIED`.

---

## Verificações executadas no banco real

Todas em transação revertida, contra `wuzxpbixprrgssoeeaez`.

### Integração nos dois sentidos
| Passo | Saldo |
|---|---|
| inicial | 0 |
| ENTRADA operacional +10 | 10 |
| SAÍDA administrativa −3 (INSERT direto, como o `NovaMovimentacaoModal`) | 7 |
| leitura pela RPC operacional | 7 |
| movimentação operacional vista pelo `list_movimentacoes_cursor` do admin | 1 linha |

### Superfície do operador puro
Usuário com **apenas** `operacional:movimentacao:view/create` e só o setor Cozinha:

| Sonda | Resultado |
|---|---|
| `SELECT` direto em `produtos` (custos) | **0 linhas** |
| `SELECT` direto em `movimentacoes_estoque` (custo_unitario/total) | **0 linhas** |
| `SELECT` direto em `stock_sectors` | **0 linhas** |
| `list_movimentacoes_cursor` | RECUSADO — Insufficient permissions |
| `get_movimentacoes_kpis` (total R$) | RECUSADO — sem permissão |
| `get_stock_summary` (valor do estoque) | RECUSADO — Insufficient permissions |
| `get_saldo_produtos` | RECUSADO — `PERMISSION_DENIED: estoque:saldo:view` |
| produtos de outro tenant | 0 linhas |

### Escalação de privilégio
| Vetor | Resultado |
|---|---|
| auto-conceder setor (`estoque_usuario_setores`) | RECUSADO por RLS |
| auto-conceder permissão (`user_permissions`) | RECUSADO por RLS |
| apagar vínculo produto→setor | 0 linhas afetadas (RLS filtra) |
| ler setores de outros usuários | 0 linhas |
| cadastrar código de barras (`UPDATE produtos`) | 0 linhas afetadas |

### Setor e código de barras
| Sonda | Resultado |
|---|---|
| setores devolvidos pela RPC | só Cozinha |
| setores devolvidos pelo leitor | só Cozinha |
| listar produtos de setor alheio (Delivery) | RECUSADO — `SETOR_NAO_AUTORIZADO` |
| movimentar em setor alheio | RECUSADO — `SETOR_NAO_AUTORIZADO` |
| movimentar no setor autorizado | OK |
| histórico sem `operacional:historico:view` | RECUSADO — `PERMISSION_DENIED` |

### Regras de estoque
| Sonda | Resultado |
|---|---|
| saída acima do saldo | RECUSADO — `SALDO_INSUFICIENTE: disponivel=0.000, solicitado=5` |
| lock em concorrência | `RowShareLock` em `produtos` + `ExclusiveLock` da transação |
| tenant inexistente | `COMPANY_ACCESS_DENIED` |
| código com zeros à esquerda | `0007894900011517` preservado |

---

## Testes

| Suíte | Antes | Depois |
|---|---|---|
| Arquivos | 102 | 105 |
| Testes | 798 | 880 |

Novos: `estoque-operacional-domain.test.ts` (34), `estoque-operacional-barcode.test.ts` (17),
`movimentacao-operacional-fluxo.test.tsx` (31).

`tsc --noEmit` limpo · `lint` 0 erros · `build` ok · `rbac:lint` 0 blockers ·
`security:check` PASS.

---

## Impacto fora do módulo

Nenhuma regressão. O único comportamento alterado fora do submódulo é aditivo:
o formulário de produto ganhou o campo opcional Código de barras, e Cadastros
ganhou duas abas.

---

## Riscos residuais e pendências

1. **O módulo administrativo continua sem trava de saldo negativo no banco.**
   Só o caminho operacional tem. Duas saídas administrativas simultâneas ainda
   furam o saldo. Corrigir exigiria mexer no fluxo administrativo, que estava
   fora de escopo.
2. **`stock_sectors` não tem UNIQUE em `(company_id, name)`.** Hoje não há
   duplicata, mas nada impede criar duas "Cozinha" na mesma empresa — e
   `movimentacoes_estoque.setor` é texto, então elas ficariam indistinguíveis
   no CMV por setor e no filtro de histórico do operacional. Adicionar a
   constraint mudaria o que o admin pode fazer em Cadastros; não foi feito sem
   decisão do dono.
3. **Verificação visual em navegador real** (light/dark, mobile/tablet) não foi
   possível neste ambiente — sem Playwright nem credenciais.
4. **Corrida de relógio entre duas conexões** não pôde ser encenada: o canal MCP
   serializa as consultas (medido: sessão A 17:02:09.757→17:02:13.760, sessão B
   só iniciou 17:02:15.62). A garantia de concorrência está evidenciada pela
   aquisição do lock, não por paralelismo real.
