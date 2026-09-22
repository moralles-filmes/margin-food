# Auditoria de módulo — Movimentação Operacional

**Data:** 2026-09-22
**Branch:** `feat/movimentacao-operacional`
**Modo:** `--fix`
**Veredito:** PASS_WITH_WARNINGS — 0 bloqueantes em aberto
(3 achados corrigidos, sendo 2 bloqueantes vindos da auditoria de processo)

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

### MOD-movop-004 — chave de idempotência não identificava a operação ✅ CORRIGIDO
- **Severidade:** P1 — bloqueante (auditoria de processo)
- **Causa:** o reenvio era reconhecido só por `reference_id`. A tela guardava o
  `requestId` em estado e só o renovava na tela de sucesso, então uma
  confirmação que falhava na rede deixava a chave presa para o próximo produto.
- **Impacto:** servidor grava e a resposta se perde → operador troca de produto e
  confirma → caminho rápido devolve `idempotente=true` do lançamento ANTERIOR.
  Sucesso na tela, **nada gravado** para o produto novo, com nome e quantidade em
  branco como único sintoma. Perda silenciosa de movimento.
- **Correção:** (a) a RPC compara produto/setor/tipo/quantidade com o lançamento
  achado e levanta `REQUEST_ID_REUTILIZADO` quando não batem — nos dois pontos
  (caminho rápido e `unique_violation`); (b) o retorno idempotente passa a
  carregar os dados reais do lançamento original; (c) no cliente a chave virou
  derivada (`chaveRequisicao` = semente + identidade), então trocar produto,
  setor, tipo ou quantidade gera chave nova sozinho; (d) "Voltar" desabilitado
  enquanto a confirmação está em voo. Migration `20260922180522`.
- **Teste:** 5 chamadas → **2 movimentações**; reenvio idêntico devolve
  `idempotente=true` com produto e quantidade corretos; mesma chave com produto
  diferente → `REQUEST_ID_REUTILIZADO`; mesma chave com quantidade diferente →
  `REQUEST_ID_REUTILIZADO`; chave nova grava normalmente. Mais 3 testes de fluxo.

### MOD-movop-005 — quantidade ≥ 1000 corrompida pelo separador de milhar ✅ CORRIGIDO
- **Severidade:** P1 — bloqueante (auditoria de processo)
- **Causa:** `QuantidadeStepper` escrevia `formatarQuantidade(proximo)` de volta
  no campo editável. `formatarQuantidade(1001)` é `"1.001"` e `parseQuantidade`
  lê o ponto como decimal → **1,001**.
- **Impacto:** digitar `1000` e clicar `[+]` gravava 1,001 em vez de 1001 — ~1000x
  menos do que a tela mostrava, sem erro nenhum. Para SAÍDA o saldo do sistema
  ficaria alto (estoque fantasma); para ENTRADA, baixo. Contamina custo e CMV.
- **Correção:** `quantidadeParaCampo` (`useGrouping: false`) para o texto que
  realimenta o input; `formatarQuantidade` permanece com agrupamento apenas onde
  é exibição pura (sucesso, histórico, picker, saldo disponível).
- **Teste:** round-trip `parseQuantidade(quantidadeParaCampo(x)) === x` em
  `[1, 2.5, 0.125, 999, 1000, 1001, 12345, 999999]`, mais o caso de fluxo
  "digitar 1000 → `[+]` → envia 1001".

### MOD-movop-002 — `op_barcode_existe` responde sem filtrar setor ⚠️ ACEITO
- **Severidade:** P3
- **Decisão:** trade-off deliberado, documentado em `CLAUDE.md`.
- **Razão:** a função só devolve `boolean` e existe para separar "código não
  cadastrado" de "produto existe, mas fora dos seus setores" — a orientação ao
  operador muda entre os dois casos. Filtrar por setor faria o operador pedir
  cadastro de um código já existente, que colidiria no índice único. O dado
  exposto é a existência de um EAN impresso na embalagem que ele tem na mão.

### MOD-movop-006 — `PRODUTO_SEM_CUSTO` sem via de escape na tela operacional ⚠️ ACEITO
- **Severidade:** P3
- **Decisão:** comportamento esperado, não defeito.
- **Razão:** o admin tem "Editar custo" no modal; o operacional não oferece campo
  de custo de propósito — custo é dado financeiro e o operador não o informa.
  Produto sem custo trava a saída até um responsável lançar entrada com custo ou
  preencher `custo_padrao`. Registrado aqui para não ser diagnosticado como bug
  num incidente futuro.

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

### Idempotência ligada à identidade da operação
Operador simulado (chave `operacional:movimentacao:create` + 1 setor), 5 chamadas:

| Sonda | Resultado |
|---|---|
| 1º envio (produto A, 3, ENTRADA) | gravado — `idempotente=false` |
| reenvio idêntico | `idempotente=true`, produto e quantidade corretos no retorno |
| mesma chave + produto diferente | RECUSADO — `REQUEST_ID_REUTILIZADO` |
| mesma chave + quantidade diferente | RECUSADO — `REQUEST_ID_REUTILIZADO` |
| chave nova (produto B) | gravado |
| **movimentações para as 5 chamadas** | **2** |

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
| Testes | 798 | 890 |

Novos: `estoque-operacional-domain.test.ts` (41), `estoque-operacional-barcode.test.ts` (17),
`movimentacao-operacional-fluxo.test.tsx` (34).

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
4. **`supabase db push` está bloqueado por divergência pré-existente do histórico**
   — 16 versões `20260916220000`–`20260916221500` (pacote F12) existem no banco
   remoto sem arquivo local, e o CLI recusa o push inteiro por isso. As migrations
   deste módulo foram aplicadas via MCP `apply_migration`, com o arquivo local
   renomeado para a versão que o MCP gravou. Não reparei o histórico: é trabalho
   de outra frente e o repair reescreveria o estado dela.
5. **Corrida de relógio entre duas conexões** não pôde ser encenada: o canal MCP
   serializa as consultas (medido: sessão A 17:02:09.757→17:02:13.760, sessão B
   só iniciou 17:02:15.62). A garantia de concorrência está evidenciada pela
   aquisição do lock, não por paralelismo real.

---

# Adendo — múltiplos códigos de barras por produto

**Data:** 2026-09-22
**Branch:** `feat/produto-multiplos-codigos-barras`
**Modo:** `--fix` (auditoria incremental; escopo é a mudança, não o módulo inteiro)
**Veredito:** PASS — 0 bloqueantes; 3 achados P2/P3 corrigidos, 2 aceitos como dívida conhecida

## O que mudou

`produtos.barcode` (coluna única) → tabela `produto_codigos_barras` (N códigos por
produto, com rótulo opcional da marca). O mesmo item de estoque chega em marcas
diferentes, cada uma com seu EAN; a coluna única fazia a segunda marca sobrescrever
a primeira. As três RPCs de leitura do operacional passaram a consultar a tabela nova.
A coluna antiga foi mantida (expand/contract) e será dropada em follow-up.

Auditores rodados: `rls-auditor`, `tenant-isolation-auditor`, `business-process-auditor`.

## Achados corrigidos

### MOD-movop-007 — DELETE e INSERT do diff sem transação (P2)
`salvarCodigosBarras` gravava o diff em duas chamadas PostgREST. Com o DELETE
commitado e o INSERT falhando logo depois (rede, ou corrida com outro produto
reivindicando o mesmo código), o produto ficava **sem nenhum código de barras**: o
leitor parava de reconhecer a embalagem e nada na tela dizia que o código sumira.

Corrigido em `20260922193015` com a RPC `catalogo_salvar_codigos_barras`
(`SECURITY DEFINER`), que faz DELETE e INSERT na mesma transação e devolve a lista
gravada. Evidência (transação revertida): colisão recusada com `unique_violation`
**e** o código que seria removido sobreviveu ao rollback.

### MOD-movop-008 — `produto_id` não validado contra `company_id` (P2)
A FK aponta para `produtos(id)`, único global, e a policy de escrita só exigia
`company_id = get_current_company_id()`. Dava para gravar um código da empresa A
apontando para um produto da empresa B. Nenhuma leitura vazava — as RPCs casam
`company_id` dos dois lados — mas a linha nascia órfã.

Corrigido por três camadas: a RPC valida que o produto é do tenant
(`PRODUTO_NAO_ENCONTRADO`), o DML direto foi revogado de `authenticated` (resta só
`SELECT`) e a policy de escrita ganhou o `exists` cruzando produto × empresa, para
o caso de o GRANT voltar um dia. Evidência: produto de outra empresa recusado.

### MOD-movop-009 — escape de `ILIKE` vazando na comparação exata (P3)
`op_list_produtos` escapava o termo para `ILIKE` (`_` → `\_`) e reusava o MESMO
termo na comparação exata do código. Como `_` é caractere válido pela CHECK,
buscar `ABC_123` comparava contra `ABC\_123` e nunca encontrava. O bug já existia
na versão anterior, com `p.barcode = v_term`.

Corrigido separando `v_like` (escapado, para o ILIKE) de `v_term` (cru, para o
código). Evidência: busca por `ABC_123` devolve 1 linha.

### MOD-movop-010 — INSERT não devolvia os ids gerados (P2, latente)
O código recém-gravado ficava sem `id` no estado do formulário; o diff seguinte
tentaria inseri-lo de novo, colidindo no índice único contra a linha que ele mesmo
acabara de criar. Hoje estava mascarado porque o painel sempre fecha após salvar.
A RPC agora devolve a lista com os ids e o formulário a adota. Coberto por teste
(`produto-form-codigos-barras.test.tsx`: salvar duas vezes seguidas produz diff vazio).

## Achados aceitos, não corrigidos

1. **Policies sem `TO authenticated` explícito** (P3). Não há GRANT para `anon`, então
   o Postgres já barra antes de avaliar a RLS. As tabelas irmãs
   (`estoque_setor_produtos`, `estoque_usuario_setores`) seguem o mesmo padrão —
   corrigir só esta criaria inconsistência. É passe de padronização próprio.
2. **`onUpdate` em `EstoqueGeralView` ignora o parâmetro `shouldClose` que recebe**
   (P3). Pré-existente, não introduzido aqui. O risco apontado (religar "salvar e
   continuar editando" em edição) foi neutralizado pelo MOD-movop-010.

## Riscos residuais

- **Produto e códigos ainda são duas transações.** A RPC tornou o diff atômico, mas
  o UPDATE do produto continua separado. Se os códigos falharem, o produto já foi
  salvo e os códigos ficam **inteiramente** inalterados — estado compreensível e
  informado por toast, não mais perda silenciosa. Unificar os dois exigiria mover o
  save inteiro do produto para RPC, que é refatoração do catálogo, fora deste escopo.
- **`verificarCodigosLivres` é fail-open** por design: falha de rede devolve "pode
  prosseguir". É conveniência de UX; quem garante unicidade é o índice único, e o
  `23505` continua tratado com mensagem correta.
- **Verificação visual em navegador real** não foi possível neste ambiente.
