# CMV Financeiro — diagnóstico (Fase 0), decisões e plano

Data: 2026-10-03 · Módulo: Financeiro → CMV · Branch: `feat/cmv-financeiro`
Checkpoint de execução: [`PROGRESSO.md`](./PROGRESSO.md)

## 1. O que é

Indicador **gerencial**: boletos de Contas a Pagar marcados para o CMV, pela **data de competência**, sobre o **faturamento bruto do Fechamento de Caixa**. Não é o CMV de estoque/ficha técnica (aba CMV, Edge `cmv`, `metas_cmv`) e não altera DRE, DFC, Borderô, fluxo de caixa nem a baixa dos boletos.

## 2. Diagnóstico do sistema (schema vivo, 2026-10-03)

| Tema | O que existe |
|---|---|
| Boleto | `fin_contas_pagar` (`valor`, `data_competencia`, `data_vencimento`, `status`, `categoria_id`, `lancamento_pai_id`, `parcela_atual/total`). Status em uso: `AGUARDANDO_APROVACAO`, `APROVADO`, `PAGO`; `RASCUNHO` (default da coluna) e `CANCELADO` existem no código. Exclusão é `DELETE` físico (`_guarded_delete_conta_pagar`, nunca em PAGO). |
| Rateio | `fin_lancamento_rateios` (`lancamento_id` **sem FK**, compartilhada por lançamento, CP e CR; `valor` monetário + `percentual`). Boleto de **uma** categoria normalmente não tem linha de rateio — a categoria fica no cabeçalho. `trg_validate_rateio_sum` só impede a soma de **passar** do valor; o formulário exige fechar (±R$ 0,01). Nos 66 boletos rateados em produção, todos fecham. |
| Edição | `_guarded_update_conta_pagar` **apaga e reinsere** as linhas (ids novos a cada edição) e recusa `PAGO`/`CANCELADO`. |
| Parcelas | "Repetir lançamento" cria N títulos independentes (cada um com o `valor` cheio, a própria competência deslocada e cópia do rateio); o 1º é o pai. Não existe título-pai com o total somado. |
| Baixa | `pay_conta_pagar`/`reconcile_pay_conta_pagar` criam o espelho em `fin_lancamentos` e copiam o rateio; juros/tarifa/desconto viram lançamento `origem='ajuste_pagamento'`, **fora** do boleto. Estorno devolve o boleto para `APROVADO`. |
| Competência | O formulário grava `data_competencia = competência informada, senão vencimento`. Hoje não há boleto sem competência em produção, mas a coluna é anulável (integrações/legado). |
| Faturamento | `financeiro_fechamento_caixa`: **uma linha por (empresa, data)** (`idx_fechamento_caixa_company_data`), `faturamento_bruto`, `taxas`, `descontos`, `faturamento_liquido` (gerado). Não há turno, caixa individual, status, retificação nem reabertura: editar o dia é upsert da mesma linha. As marcas (`financeiro_fechamento_marca_valores`) só decompõem o bruto. |
| Tenancy | `assert_tenant()` + header `x-company-id`; RPC `SECURITY DEFINER` filtra `company_id = assert_tenant()`. |
| Auditoria | `fin_audit_logs` (antes/depois por RPC) + `audit_trigger_fn` nas tabelas. |
| Feature flag | Não existe mecanismo. Config por empresa: `fin_config(company_id, key, value)`. |
| Testes | Vitest (jsdom), 162 arquivos / 1502 testes verdes no baseline; `tsc -p tsconfig.app.json` limpo. Testes de banco são scripts psql manuais (`supabase/tests/database`), sem Docker neste ambiente. Sem Playwright. |

## 3. Decisões

1. **Onde mora a decisão.** `fin_lancamento_rateios.cmv_incluir` (linha de rateio) e `fin_contas_pagar.cmv_incluir` (boleto **sem** rateio — a linha implícita única). `NULL` = pendente. Com rateio, a coluna do cabeçalho é ignorada ("rateio manda", igual ao DRE/DFC).
2. **Identificador estável do rateio.** A edição continua "apaga e reinsere" (mesmo comportamento de triggers/auditoria), mas reinsere com o **mesmo `id` e `created_at`** quando o cliente devolve o id da linha.
3. **Compatibilidade.** `p_cmv jsonb DEFAULT NULL` novo em `_guarded_create/update_conta_pagar`. Cliente antigo (sem `p_cmv`) continua funcionando: na criação a decisão nasce pendente; na edição a linha herda a decisão que a **mesma categoria** tinha naquele boleto (se unânime) e fica pendente quando a categoria muda.
4. **Decisão obrigatória só em fluxo novo.** `CMV_DECISAO_OBRIGATORIA` apenas na **criação**, pelo cliente novo, com a classificação **ativada** para a empresa. Edição de boleto legado nunca é bloqueada por pendência.
5. **Boletos pagos.** A edição comum não alcança `PAGO`; `fin_cmv_classificar` altera **só** a decisão (qualquer status ≠ CANCELADO), com lock otimista por boleto e auditoria antes/depois. Um boleto: `financeiro:pagar:edit` ou `financeiro:cmv:manage`. Lote: só `financeiro:cmv:manage`.
6. **Reconhecimento (numerador).** Contam `AGUARDANDO_APROVACAO`, `APROVADO`, `PAGO`, pelo valor da linha incluída, na `data_competencia` do boleto. Pagamento, pagamento parcial, estorno da baixa e mudança de vencimento/pagamento não alteram nada. `RASCUNHO`, `CANCELADO` e excluídos ficam fora. Cada parcela é um título com a sua competência — pai, parcelas e baixa nunca se somam. Encargos da baixa (`ajuste_pagamento`) não são boleto e não entram.
7. **Faturamento (denominador).** `SUM(faturamento_bruto)` de `financeiro_fechamento_caixa` por `data` — a mesma "fonte oficial" do DRE (CLAUDE.md). Dia **com linha** = fechamento registrado (inclusive R$ 0,00 = "zero confirmado"); dia **sem linha** = "sem fechamento". Como o sistema não distingue loja fechada de fechamento esquecido, dia sem linha é sinalizado, não tratado como erro.
8. **Semana** de segunda a domingo (não há configuração de início de semana; é a mesma convenção do Borderô). **Fuso** `America/Sao_Paulo`; "hoje" vem do servidor.
9. **Período em andamento.** Corte no último dia encerrado: hoje se o fechamento de hoje existe, senão ontem (no 1º dia do período, hoje). O anterior é limitado ao mesmo nº de dias. Dias depois do corte não entram como zero.
10. **Onde se calcula.** O servidor devolve fatos por dia em **centavos inteiros** (uma RPC, sem join rateio×fechamento); `src/domain/financeiro/cmv` é a única implementação de totais, %, variações, faixas, árvore e insights — a mesma para tela e PDF.
11. **Nível de análise.** O CMV é agrupado no primeiro nível da árvore de categorias em que ele se divide (desce enquanto houver um único ramo sem valor próprio).
12. **Cor de categoria** vem do índice estável da categoria no cadastro (ordem de criação), calculada por ângulo áureo; mesma função na tela e no PDF.
13. **Status/meta.** Não existe meta de CMV financeiro por categoria; a coluna "Status" do mockup **não é exibida** (não importar meta genérica nem reusar `metas_cmv`, que é do CMV de estoque).
14. **Ativação controlada.** (a) chaves novas `financeiro:cmv:view/export/manage`, concedidas só a admin/diretor/gerente_geral e fora do `LEGACY_PERMISSION_MAP`; (b) chave por empresa `fin_config.cmv_financeiro_ativo` (default desligado) que liga a pergunta "Aparecer no CMV financeiro?" no formulário de Contas a Pagar; (c) o frontend só mostra os campos novos quando `get_fin_cmv_config` responde — sem a migration aplicada o formulário se comporta como hoje.
15. **Padrão por categoria.** `fin_categorias.cmv_sugerir` (NULL = sem padrão). Só sugere em lançamento novo; nenhum relatório lê essa coluna.

## 4. Limitações conhecidas (documentadas, não contornadas)

- Não há devolução/ajuste negativo em Contas a Pagar (`valor > 0` por trigger). O motor preserva negativos e troca a rosca por barras, mas hoje o caso não ocorre.
- Rateio que não fecha (possível só por caminho legado): o resto não rateado não é classificado nem entra no CMV.
- Sem conceito de fechamento reaberto/retificado: nada a deduplicar; edição do dia substitui a linha.
- Parcela filha não é atualizada quando o pai é editado (comportamento existente): a decisão do CMV de cada parcela é independente depois de criada.

## 5. Fases

| Fase | Entrega |
|---|---|
| 0 | Este diagnóstico + baseline |
| 1–2 | Migration `supabase/migrations/20261003140000_cmv_financeiro.sql`, RBAC, formulário/detalhe de Contas a Pagar |
| 3 | `src/domain/financeiro/cmv` + testes |
| 4 | `src/components/financeiro/cmv/*` (Visão Geral, Análise por Categoria, Comparativo, Regras de vínculo, revisão de pendências) |
| 5 | `src/lib/cmvFinanceiroPdfExport.ts` + painel de exportação |
| 6 | Revisão, auditoria de módulo, plano de ativação/reversão |

## 6. Extensão (2026-10-05): despesas de Lançamentos e da Conciliação

Spec: [`../superpowers/specs/2026-10-05-cmv-financeiro-lancamentos-design.md`](../superpowers/specs/2026-10-05-cmv-financeiro-lancamentos-design.md) · Plano: [`../superpowers/plans/2026-10-05-cmv-financeiro-lancamentos.md`](../superpowers/plans/2026-10-05-cmv-financeiro-lancamentos.md)

1. **Fonte única.** `_fin_cmv_linhas_fontes` = boletos (regra do §3, inalterada) + despesas de `fin_lancamentos` (`DESPESA`, não `CANCELADO`, sem `referencia_modulo`, não referenciada por `fin_contas_pagar.lancamento_id`, conciliada quando vem da conciliação). Relatório, lista, classificação, "Aplicar padrões" e PDF leem dela.
2. **Decisão.** Linha de rateio (`fin_lancamento_rateios.cmv_incluir`) ou, sem rateio, `fin_lancamentos.cmv_incluir`. Livro Razão e conciliação **não exigem** a resposta (a linha nasce sugerida pelo padrão da categoria quando a classificação está ativa); a pendência aparece na revisão.
3. **Sem dupla contagem.** O espelho da baixa do boleto (`referencia_modulo = 'contas_pagar'`) fica fora: o boleto conta pela própria competência. A baixa legada que perdeu o `referencia_modulo`, mas é apontada por `fin_contas_pagar.lancamento_id`, também fica fora (1 caso em produção em 2026-10-05).
4. **Competência na conciliação.** `p_data` continua a data do banco (chave e duplicata). `p_data_competencia` muda só `data_competencia` (DRE e CMV); caixa, saldos e Livro Razão não mudam. A reclassificação de lançamento conciliado também ajusta a competência.
5. **Histórico.** Nada é classificado pela migration. "Aplicar padrões às pendentes" (Regras de vínculo) grava o padrão da categoria só nas linhas pendentes a partir de uma data, depois de prévia, com justificativa e auditoria por documento; exige `financeiro:cmv:manage`.
6. **Compatibilidade.** O contrato do relatório continua `v1` (só ganha `lancamentos` e `pendentes_geral_por_fonte`). As três RPCs com parâmetro novo têm default: o cliente antigo segue funcionando. O frontend só mostra os controles com `get_fin_cmv_config().recursos.lancamentos`.

Limites (aceitos): conta a pagar criada a partir do extrato continua como boleto (com rateio, aparece sem categoria e pendente); parcela gerada por `gerar_parcela_recorrente` nasce pendente; compra lançada como boleto **e** paga na conciliação como "criar lançamento" conta duas vezes (como na DRE).
