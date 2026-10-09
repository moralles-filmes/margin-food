# CMV Financeiro — despesas de Lançamentos e Conciliação Bancária

Data: 2026-10-05 · Branch: `feat/cmv-financeiro-lancamentos` (a partir de `release/redesign-v2-f01-f05b`, PR #144)
Base do recurso: [`docs/cmv-financeiro/PLANO.md`](../../cmv-financeiro/PLANO.md) e [`PROGRESSO.md`](../../cmv-financeiro/PROGRESSO.md)

## 1. Objetivo

Hoje o CMV Financeiro só soma boletos de Contas a Pagar. Compras pagas direto — um PIX no mercado, o salmão pago pela conciliação — não entram. Em produção, desde agosto, passaram pela conciliação R$ 133 mil de Salmão, R$ 27 mil de CEASA e R$ 28 mil de Orientais que o CMV não vê.

A entrega faz as despesas de `fin_lancamentos` (Livro Razão e Conciliação Bancária) entrarem no CMV pela **data de competência**, com a mesma pergunta por linha "Aparecer no CMV financeiro?" que o boleto já tem.

Sucesso = um PIX de hoje classificado como Sim aparece no CMV desta semana, com a mesma revisão de pendências, os mesmos padrões por categoria e o mesmo PDF; nenhum valor é contado duas vezes.

## 2. Decisões tomadas com o usuário

1. **Uma fonte só (abordagem A).** O CMV lê boletos **e** despesas de `fin_lancamentos` na mesma apuração; relatório, revisão, padrões e PDF continuam únicos.
2. **Decisão na conciliação e em Lançamentos: padrão da categoria + ajuste na linha.** O Sim/Não aparece em toda linha que vira despesa nova, pré-preenchido pelo padrão da categoria (`fin_categorias.cmv_sugerir`); a pessoa pode trocar. Categoria sem padrão começa em branco. Linha sem resposta **não trava** o salvar/processar — vira pendente.
3. **Ajuste de competência** na criação pela conciliação e na reclassificação do lançamento conciliado. A data do banco (`data_pagamento`) nunca muda.
4. **Histórico:** botão "Aplicar padrões" em CMV → Regras de vínculo, com prévia e auditoria, a partir de uma data escolhida. Nada é classificado sem alguém clicar.
5. **Base da branch:** PR #144 do Redesign V2 (telas de Conciliação, Livro Razão e formulário já no visual novo). Este PR só entra depois do #144.

## 3. Regra de apuração — o que entra de `fin_lancamentos`

Uma linha de `fin_lancamentos` entra na apuração quando **todas** valem:

| Condição | Por quê |
|---|---|
| `tipo = 'DESPESA'` | receita e transferência nunca são CMV |
| `status <> 'CANCELADO'` | `PREVISTO` conta, como o boleto aprovado e não pago (regime de competência) |
| `NULLIF(referencia_modulo, '') IS NULL` | exclui espelho de baixa de CP/CR (`espelho_cp`/`espelho_cr`), encargo da baixa (`ajuste_pagamento`) e título criado do extrato — o boleto já é contado pela própria competência |
| `origem <> 'conciliacao' OR conciliado` | regra que todos os relatórios do Financeiro já seguem: linha da conciliação desconciliada não conta |

- **Data:** `data_competencia` (NOT NULL na tabela; lançamento nunca cai em "sem competência").
- **Valor e decisão:** cada linha de `fin_lancamento_rateios` do lançamento, com `cmv_incluir` da linha; sem rateio, o próprio lançamento com `fin_lancamentos.cmv_incluir` ("rateio manda", igual ao boleto). `NULL` = pendente, nunca assumido como Sim.
- **Boleto vinculado na conciliação não duplica:** a baixa gera só o espelho (`referencia_modulo = 'contas_pagar'`), excluído acima; o boleto conta uma vez, com a decisão dele.

Boletos continuam exatamente como hoje (`AGUARDANDO_APROVACAO`/`APROVADO`/`PAGO`, competência do boleto).

## 4. Persistência

- `ALTER TABLE fin_lancamentos ADD COLUMN cmv_incluir boolean` — decisão do lançamento **sem** rateio. Anulável, sem default.
- `fin_lancamento_rateios.cmv_incluir` já existe; o comentário passa a dizer que vale para rateio de boleto **e** de lançamento (continua sem efeito em CR).
- Trigger `trg_fin_cmv_guard_decisao` também em `fin_lancamentos`: recusa escrita de `cmv_incluir` pelo papel `authenticated` (as policies de UPDATE aceitariam, sem gate nem auditoria). Só RPC `SECURITY DEFINER` grava.
- Nenhuma policy alterada. Nada do histórico é classificado pela migration.

## 5. Escrita — onde a resposta é dada

Regra comum: o controle só aparece quando o recurso existe no banco (`get_fin_cmv_config` responde e informa suporte a lançamentos) **e** a unidade ligou a classificação (`classificacao_ativa`), ou o registro já tem decisão. Fora disso a tela é a de hoje e a despesa nova nasce pendente.

### 5.1 Conciliação — linha que vira despesa nova (`reconcile_import_lancamento`)

- Ao lado da categoria da linha: Sim/Não compacto, pré-preenchido por `cmv_sugerir` da categoria; ao trocar a categoria, a sugestão é refeita (mesmo aviso do formulário de Contas a Pagar quando há decisão diferente).
- Rateio da linha: cada linha do rateio tem o seu Sim/Não.
- Vai em cada item de `p_rateio_linhas` como `cmv_incluir` (a conciliação sempre envia ao menos um item). Fica no `sessionStorage` da linha junto com a categoria.
- Linhas que casam com boleto, CR, transferência ou lançamento existente **não** mostram o controle — a decisão é do documento de origem.
- Diálogo "Criar" (destino lançamento): mesmo controle. Destino conta a pagar: fora do escopo (§10).

### 5.2 Livro Razão — despesa manual (`_guarded_upsert_lancamento`)

- O bloco de CMV do `ContaFormDialog` passa a valer também para `variant="lancamento"` com `tipo = DESPESA`: Sim/Não na categoria única ou por linha de rateio, sugestão pelo padrão, aviso ao trocar categoria, resumo Total/Incluído/Fora/Pendente. **Sem** `CMV_DECISAO_OBRIGATORIA` (não trava).
- Novo `p_cmv jsonb DEFAULT NULL` (`{"incluir": true|false|null}`, só para lançamento sem rateio); itens de `p_rateios` passam a aceitar `id` e `cmv_incluir`.
- Hoje a RPC apaga e reinsere o rateio com ids novos. Passa a reinserir com o **mesmo `id`/`created_at`** quando o cliente devolve o id, preservando a decisão (mesma regra de `_guarded_update_conta_pagar`).
- **Cliente sem `p_cmv`** (versão antiga, edição pela tela de Conciliação, integrações): na criação, a decisão nasce pendente; na edição, cada linha herda a decisão que a **mesma categoria** tinha naquele lançamento (se unânime), senão fica pendente.
- Mudança de assinatura: `DROP FUNCTION` da assinatura antiga + `CREATE` (CLAUDE.md). O parâmetro novo tem default, então chamadas sem ele continuam resolvendo.

### 5.3 Lançamento já conciliado — reclassificação (`_guarded_update_reconciled_classification`)

- Ganha o mesmo bloco de CMV (`p_cmv` + `cmv_incluir`/`id` nos itens de `p_rateios`), com a mesma preservação de id e a mesma herança para cliente antigo.
- Ganha `p_data_competencia date DEFAULT NULL` (§6). Continua exigindo justificativa; valor, conta, tipo, status, descrição bancária e data do banco continuam exigindo desconciliar.

## 6. Ajuste de competência

- **Criação pela conciliação:** `reconcile_import_lancamento` ganha `p_data_competencia date DEFAULT NULL`. `data_pagamento = p_data` (data do banco, sempre) e `data_competencia = COALESCE(p_data_competencia, p_data)`. Deduplicação, chave de idempotência e checagem de "possível duplicata" continuam pela data do banco.
- Na tela: campo "Competência" opcional na linha, recolhido por padrão e preenchido com a data do banco; a linha mostra a competência só quando difere. Usa `DateInput`.
- **Diálogo "Criar":** hoje envia a data editável como `p_data` (vira as duas datas) e depois corrige `data_pagamento` com UPDATE direto. Passa a enviar `p_data` = data do banco e `p_data_competencia` = data editada, sem o UPDATE de datas.
- **Reclassificação:** muda só `data_competencia`. Se o lançamento conciliado não tem `data_pagamento` (conciliação de lançamento manual antigo), grava antes `data_pagamento = data_competencia` anterior — o reconhecimento de linha já conciliada usa `data_pagamento || data_competencia` e não pode mudar.
- **Efeitos:** DRE (competência) e CMV passam a usar a competência ajustada. Livro Razão, saldos, DFC, Fluxo de Caixa, Borderô e demais relatórios de caixa usam a data efetiva (`COALESCE(data_pagamento, ...)`) e não mudam.
- O reconhecimento de "já conciliada" foi conferido: `fetchConciliadosExtrato` não filtra por data e `buildConciliadosCounts` usa `data_pagamento` antes de `data_competencia`; o servidor compara `data_pagamento = p_data`.
- Atualizar no CLAUDE.md a regra "Editar lançamento conciliado sem desconciliar é só reclassificação" para incluir competência e CMV.

## 7. Classificação depois (CMV → revisão e Regras de vínculo)

### 7.1 `fin_cmv_classificar`

- Itens aceitam `lancamento_id` no lugar de `conta_pagar_id` (exatamente um dos dois). `rateio_id` nulo atualiza `fin_lancamentos.cmv_incluir`; em lançamento com rateio, `CMV_ALVO_INVALIDO` (igual ao boleto).
- Lock otimista por `fin_lancamentos.updated_at`, travas em ordem de id, `STATUS_INVALIDO` para cancelado, e recusa de lançamento fora da regra do §3 (espelho, receita, transferência).
- Atualiza o `updated_at` do lançamento e grava `fin_audit_logs` (`entidade = 'lancamentos'`, ação `cmv_classificar`, antes/depois).
- Permissão (mesmo formato de gate da função atual, chave granular + legado + `system:global:manage`): um lançamento → `financeiro:lancamentos:edit`, `financeiro:conciliacao:reconcile`, `finance:manage` ou `financeiro:cmv:manage`; mais de um documento → `financeiro:cmv:manage`.
- O trigger `trg_validate_fin_lancamento_update` não vigia `cmv_incluir`, então classificar lançamento conciliado não exige justificativa de edição — conferir no teste de banco.

### 7.2 `fin_cmv_aplicar_padroes(p_desde date, p_simular boolean, p_justificativa text)` (nova)

- Aplica `cmv_sugerir` da categoria **só** às linhas pendentes (`cmv_incluir IS NULL`) com competência `>= p_desde`, de boletos e lançamentos. Linhas de categoria sem padrão continuam pendentes.
- `p_simular = true` devolve a prévia sem gravar: quantas linhas e quanto em R$ viram Sim e Não, separado em boletos e lançamentos, e quantas continuam pendentes.
- Grava em uma transação, com auditoria por documento (antes/depois) e `updated_at` de cada documento alterado. Exige `financeiro:cmv:manage` e justificativa.

### 7.3 `fin_cmv_aplicar_serie`

Continua só para boletos (lançamento recorrente não está em uso — §10).

## 8. Apuração e contrato

- `_fin_cmv_linhas(company)` passa a devolver `fonte` (`'boleto'`/`'lancamento'`), `documento_id`, `rateio_id`, `categoria_id`, `valor`, `cmv_incluir`, `data_competencia`, como `UNION ALL` dos boletos (inalterado) e da regra do §3.
- **Payload aditivo; o contrato continua `cmv-financeiro/v1`.** O parser atual recusa outro contrato; manter v1 evita que a ordem migration × frontend derrube a tela.
  - `cmv` e `qualidade` passam a incluir lançamentos (`qualidade.titulos` conta documentos).
  - `boletos` continua contando só boletos.
  - Novo `lancamentos: [{data, quantidade}]` (lançamentos distintos com linha Sim no dia).
  - Novo `pendentes_geral_por_fonte: {boleto: {titulos, centavos}, lancamento: {titulos, centavos}}`; `pendentes_geral` continua sendo o total das duas fontes.
  - O cliente antigo mostra os totais já com lançamentos (correto) e a contagem só de boletos; o cliente novo mostra "despesas" = boletos + lançamentos.
- `_fin_cmv_retrato` ganha a variante de lançamento para auditoria.
- `list_fin_cmv_linhas`: itens ganham `fonte`, `documento_id`, `origem` (`manual`/`conciliacao`) e `conta_nome`; `fornecedor`/`data_vencimento` vêm nulos para lançamento. O filtro por situação e categoria vale para as duas fontes.
- `get_fin_cmv_config` ganha `recursos: {lancamentos: true}` — é o sinal que liga os controles novos no frontend.
- `src/domain/financeiro/cmv` continua sendo a única implementação de totais/%/variações; acrescenta a contagem por fonte.

## 9. Telas do CMV

- **Texto:** "boletos" → "despesas" onde a frase fala do conjunto (cards, avisos, insights, lista, Regras de vínculo, exportação, PDF); "boleto" continua onde é só boleto (botão "Série", "em Contas a Pagar").
- **Card de documentos:** "Despesas vinculadas ao CMV" com "X boletos · Y lançamentos".
- **Lista de origem e revisão de pendências:** coluna "Origem" (Boleto / Lançamento / Conciliação); "Abrir" leva ao Livro Razão para lançamento (navegação por registro, `useNavigationRecord`); "Série" só em boleto. A classificação em lote mistura as duas fontes.
- **Regras de vínculo:**
  - o switch vira "Pedir a resposta nas novas despesas (boletos, lançamentos e conciliação)";
  - "Revisão do histórico" ganha "Aplicar padrões às pendentes", com data inicial, prévia e confirmação com justificativa;
  - o exemplo prático passa a citar a conciliação.
- O visual das telas do CMV é da Fase 07 do Redesign V2; aqui só texto, coluna e botão, no padrão atual dessas telas.

## 10. Fora do escopo / limitações documentadas

- **Conta a pagar criada a partir do extrato** ("Criar → conta a pagar", 2 casos desde julho): continua como boleto. Com rateio, o rateio fica no lançamento e o boleto aparece sem categoria e pendente no CMV. É comportamento existente.
- **Parcela de lançamento recorrente** (`gerar_parcela_recorrente`) nasce pendente. Recurso sem uso em produção (0 lançamentos recorrentes).
- **Duplicidade boleto × lançamento novo:** se a compra foi lançada como boleto e o pagamento entrou na conciliação como "criar lançamento" em vez de baixar o boleto, as duas despesas existem e as duas contam. É o mesmo risco da DRE; a conciliação já sugere o boleto quando o valor bate no centavo.
- Lançamento de outras unidades, CR e receitas: nada muda.

## 11. Testes

- **Banco real descartável:** estender `supabase/tests/database/cmv_financeiro_ephemeral.sql`. Cobrir:
  - a regra do §3: espelho fora, ajuste fora, transferência fora, conciliação desconciliada fora, `PREVISTO` dentro;
  - rateio × cabeçalho;
  - competência ajustada na conciliação, com `data_pagamento` intacto e a deduplicação ainda pela data do banco;
  - reclassificação com e sem `data_pagamento`;
  - preservação de id/decisão no upsert e na reclassificação;
  - herança para cliente antigo;
  - `fin_cmv_classificar` com lançamento (lock, permissões, alvo inválido, conciliado sem justificativa);
  - `fin_cmv_aplicar_padroes`, prévia × gravação e auditoria;
  - trava de escrita direta em `fin_lancamentos.cmv_incluir`;
  - isolamento entre unidades.
- **Vitest:**
  - parser/relatório com lançamentos e contagem por fonte;
  - payload da conciliação (`cmv_incluir` nos itens, `p_data_competencia`);
  - payload do Livro Razão e da reclassificação;
  - diálogo "Criar" sem UPDATE de datas;
  - sugestão por categoria e linha sem padrão.
- Atualizar os testes que travam o SQL: `src/test/cmvFinanceiroMigration.test.ts` e `src/test/conciliacaoChaveOcorrenciaMigration.test.ts` (assinatura com 11 parâmetros). O `migrationsDataNegocioFuso.test.ts` precisa continuar passando.
- Validação final: `vitest run`, `tsc -p tsconfig.app.json`, `eslint` nos arquivos tocados, `vite build`, `bun run rbac:lint`.

## 12. Publicação e reversão

- **Migration** com `DROP FUNCTION` de três assinaturas: `reconcile_import_lancamento`, `_guarded_upsert_lancamento` e `_guarded_update_reconciled_classification`. O conector MCP já recusou migration com `DROP` (CMV Financeiro, 2026-10-03), então o usuário roda no SQL Editor. Depois eu confiro o catálogo (assinaturas, privilégios, triggers, md5 dos corpos contra o banco de teste) e registro a versão com o nome do arquivo. Nunca `supabase db push`.
- **Ordem:**
  - o frontend (depois do #144) pode ir antes ou depois da migration: os controles novos só aparecem com `recursos.lancamentos`, e o payload continua v1;
  - entre a migration e o deploy, o cliente antigo continua salvando (parâmetros novos com default; decisão herdada pela categoria).
- **Reversão:** desligar "Pedir a resposta" volta as telas ao comportamento atual. Revert do PR não exige mexer no banco. As colunas não são removidas.
- **Mudança visível depois da migration:** nenhuma despesa de lançamento nasce classificada, então o valor do CMV não muda; só cresce a contagem de pendentes (cerca de 967 na Ren Sushi), que a tela já avisa. Os valores mudam quando alguém classifica ou usa "Aplicar padrões".
