# Auditoria de módulo — Inventário: contagem via código

**Data:** 2026-09-24
**Branch:** `fix/inventario-contagem-codigo-quantidade`
**Modo:** `--fix`
**Veredito:** PASS_WITH_WARNINGS — 0 bloqueantes em aberto
(1 bloqueante e 4 atenções corrigidos; 1 atenção aceita com evidência)

---

## Mapa do módulo

```
UI                          AuthZ                     Tenant           Banco
────────────────────────────────────────────────────────────────────────────────────
ContagemPorCodigo           useCan('inventario:       CompanyScope     —
  (ler código → quantidade)   detalhe:edit')          (x-company-id)
        │
        ▼
useContagemPorCodigo  ──► store.findItemByBarcode ──► Edge Function inventario
                              (action find_by_barcode, has_permission)
                                   └► inventario_find_item_por_barcode (SECURITY DEFINER)
                      ──► store.ajustarContagem ────► inventario_ajustar_contagem (SECURITY DEFINER)
                                                        assert_tenant + has_any_permission
                                                        inventarios (RASCUNHO→EM_CONTAGEM, FOR SHARE)
                                                        inventario_itens (FOR UPDATE, soma)
                                                        audit_inventario_log (+ chave)
InventarioView (lista de   ──► 'codigo': store.definirContagemPorLista → mesma RPC, origem 'lista'
 inventário 'codigo')          'lista' : store.updateContagem → Edge Function update_contagem (inalterado)
        │
        ▼
finalize_inventory_atomic  — só ajusta itens com contagem_fisica NOT NULL
```

**Tenancy-profile:** `company_id`; `get_current_company_id()` valida o header
`x-company-id` contra `company_memberships`; `assert_tenant()` levanta
`COMPANY_ACCESS_DENIED`.

**Fora do escopo:** fluxo Contagem por Lista de inventário `lista` (Edge Function
`update_contagem`), Movimentação Operacional, leitura por câmera.

---

## Mudanças da branch

| Camada | Arquivo | Mudança |
|---|---|---|
| Banco | `supabase/migrations/20260924195609_inventario_ajustar_contagem.sql` | RPC de soma atômica (v1) |
| Banco | `supabase/migrations/20260924201846_inventario_ajustar_contagem_v2.sql` | v2: `p_origem`/`p_esperado`/`p_chave`, índice `uq_audit_inv_contagem_chave` |
| Store | `src/hooks/useInventarioStore.ts` | `ajustarContagem`, `definirContagemPorLista`, `invoke` lê o motivo real de 4xx |
| Hook | `src/hooks/useContagemPorCodigo.ts` | leitura em 2 passos (buscar → quantidade), chave derivada, desfazer com trava |
| UI | `src/components/inventario/ContagemPorCodigo.tsx` | botão Buscar, quantidade com −/+, leitor próprio |
| UI | `src/components/InventarioView.tsx` | wiring; lista de inventário `codigo` salva via RPC |

Ambas as migrations foram aplicadas em produção via MCP `apply_migration` depois
de testadas no banco de produção dentro de transação revertida.

---

## Achados

### MOD-inventario-contagem-codigo-001 — Lista absoluta × soma da leitura no mesmo item (P1, corrigido)
- **Evidência:** a v1 tirava o inventário `codigo` de RASCUNHO, o que deixava viva a edição
  absoluta pela lista (`InventarioView` → `update_contagem`). Uma correção pela lista
  seguida de "desfazer" de uma leitura anterior subtraía de um total já corrigido; e a
  lista gravava por cima de leituras feitas depois que carregou.
- **Impacto:** `contagem_fisica` divergente sem erro na tela → ajuste de estoque errado na
  finalização e classificação de risco contaminada.
- **Correção:** para inventário `codigo`, a lista grava pela RPC com `origem='lista'`
  (delta = novo − valor exibido) e só se o valor atual for o exibido; "desfazer" só age se
  o item ainda estiver no total que a leitura deixou. Divergência devolve `conflito`, a
  tela recebe o valor atual e pede para conferir.
- **Teste:** cenários 06–08 da transação revertida; testes do hook de desfazer com conflito.

### MOD-inventario-contagem-codigo-002 — Reenvio após resposta perdida somava duas vezes (P2, corrigido)
- **Correção:** `p_chave` derivada da operação (`semente da leitura : delta`), checada no
  `audit_inventario_log` depois do `FOR UPDATE` do item + índice único parcial
  `uq_audit_inv_contagem_chave`. Desfazer usa `desfazer:<chave da leitura>`.
- **Teste:** cenários 02, 05 e 15 da transação revertida; testes do hook (mesma chave no
  reenvio, chave nova ao mudar quantidade, histórico sem duplicata).

### MOD-inventario-contagem-codigo-003 — UPDATE sem `company_id` / sem `IF NOT FOUND` após `FOR UPDATE` (P3, corrigido)
Defesa em profundidade na v2.

### MOD-inventario-contagem-codigo-004 — `invoke()` passaria a exibir texto cru de exceção 5xx (P3, corrigido)
Só repassa `corpo.error` quando o status é < 500; 5xx fica no console.

### MOD-inventario-contagem-codigo-005 — Gate da RPC inclui legados `inventory:count`/`inventory:edit` (P2, aceito)
- **Evidência:** a Edge Function (fluxo Lista) exige só `inventario:detalhe:edit`; a RPC segue
  a regra do CLAUDE.md (granular + legado + `system:global:manage`).
- **Por que aceito:** em produção, todo usuário com ALLOW em chave legada também tem
  `inventario:detalhe:edit` (consulta em `user_permissions`/`role_permissions`, 2026-09-24);
  nenhum usuário passa na RPC sendo barrado na Lista. Divergência teórica.

---

## Bug de produção que originou a branch

Inventário `metodo_contagem='codigo'` nascia em RASCUNHO e a tela de leitura não tem o
botão "Iniciar contagem" da Lista; `update_contagem` recusava com 400 ("Inventário ainda
em rascunho") e a tela mostrava só "Edge Function returned a non-2xx status code".
Confirmado por log (`find_by_barcode` 200 seguido de 400) e pelo inventário `543345dc…`
em RASCUNHO com 0/237 contados. A RPC faz a transição na primeira leitura, só para
inventário `codigo`, com registro `MUDANCA_STATUS` na auditoria.

Também corrigido: o "desfazer" da 1ª leitura de um produto deixava `contagem_fisica = 0`
(em vez de NULL) — a finalização zeraria o saldo desse produto.

---

## Testes

- Banco (produção, transação revertida): v1 — 13 cenários; v2 — 16 cenários. Todos ok.
- Cliente: `useContagemPorCodigo.test.ts` (26), `ContagemPorCodigo.test.tsx` (7),
  `useInventarioStore.test.ts` (6 — edição pela lista e mensagem de erro 4xx/5xx;
  mutação do filtro de 5xx detectada).
- `npm run test` e `npm run build`: ok.
- Typecheck: só os 5 erros pré-existentes (FluxoMovimentacao, ProdutoFormPanel, testes de código de barras).

## Regressão (security-regression-verifier)

PASS_WITH_WARNINGS. Achados 001–004 e o bug de produção: FECHADOS, com evidência no
código. Fluxo Lista de inventário `lista` intocado (`updateContagem` sem alteração);
`src/components/estoque-operacional/` e `supabase/functions/` sem diff; nenhum segredo
nos diffs. A lacuna apontada (sem teste de `definirContagemPorLista`) foi fechada com
`src/hooks/useInventarioStore.test.ts`. O verificador não tem acesso ao banco: a execução
dos cenários SQL foi feita pelo agente principal.

---

## Riscos residuais

- Fluxo Lista de inventário `lista`: `update_contagem` compara com a leitura feita dentro
  da própria função, não com o valor que a tela exibia — duas pessoas editando o mesmo
  item pela lista ainda se sobrescrevem. Pré-existente, fora do escopo.
- Desfazer é recusado (com aviso) quando outra pessoa leu o mesmo produto depois — escolha
  conservadora: nunca produzir um total que ninguém contou.
- Reenvio com quantidade diferente após falha de rede é tratado como operação nova.

---

## Rodada 2 — busca automática ao digitar (2026-09-24)

**Branch:** `feat/inventario-busca-automatica-codigo` · **Veredito:** PASS_WITH_WARNINGS — 0 bloqueantes.

A tela carrega os códigos cadastrados dos produtos do inventário
(`inventario_listar_codigos`, migration `20260924204841`, só o texto do código,
`assert_tenant` + `has_any_permission`) e busca sozinha quando o texto digitado é um
desses códigos (`decidirBuscaAutomatica` em `src/domain/estoque/barcode.ts`). A busca
só identifica o produto; gravar continua exigindo "Adicionar".

RPC testada no banco de produção em transação revertida: lista do inventário correta,
inventário de outra empresa e inexistente → `[]`, usuário sem vínculo →
`COMPANY_ACCESS_DENIED`.

### MOD-inventario-contagem-codigo-006 — Código curto cadastrado abria o produto errado (P2, corrigido)
Um código cadastrado curto ("7891") que é começo de um código maior não cadastrado
disparava a busca no meio da digitação; os dígitos seguintes caíam no campo de
quantidade. Correção: a busca automática só dispara para GTIN completo com dígito
verificador válido (`gtinValido`); código interno/curto usa o botão Buscar.
Teste: `ContagemPorCodigo.test.tsx` ("código curto cadastrado não busca sozinho").

### MOD-inventario-contagem-codigo-007 — Falha ao carregar os códigos podia rejeitar sem handler (P3, corrigido)
`listarCodigosDoInventario` agora trata exceção e devolve `[]` (a busca automática só
não acontece; Buscar continua funcionando).

### MOD-inventario-contagem-codigo-008 — `anon` com EXECUTE nas RPCs antigas (P3, pendente)
`create_inventory_atomic` e `inventario_find_item_por_barcode` não têm
`REVOKE ... FROM PUBLIC, anon` (as duas abortam sem `auth.uid()`, sem vazamento). Não
corrigido: o `service_role` só alcança essas funções via `PUBLIC`, e a Edge Function
`inventario` pode depender disso em `create` — revogar exige confirmar o cliente usado
e conceder `service_role` explicitamente.

### MOD-inventario-contagem-codigo-009 — Leitura de códigos fora do domínio do Catálogo (P3, aceito)
A RPC libera o texto dos códigos a quem tem permissão de Inventário, sem permissão de
Catálogo — mesmo desenho da RPC irmã `inventario_find_item_por_barcode`, que expõe mais.

### Testes e regressão
- 976 testes, build ok, typecheck só com os 5 erros pré-existentes, lint limpo.
- security-regression-verifier: PASS — 006 e 007 fechados; Buscar/Enter, card de
  quantidade, histórico e desfazer inalterados; sem busca duplicada; nada em
  `estoque-operacional/` ou `supabase/functions/`; sem segredos. Migration confirmada no
  banco pelo agente principal (`supabase_migrations.schema_migrations`, versão `20260924204841`).
