---
paths:
  - "src/lib/conciliacao*"
  - "src/lib/extratoParser*"
  - "src/components/financeiro/Conciliacao*"
  - "src/components/financeiro/ConfirmarSaldoExtratoDialog*"
  - "src/components/financeiro/CriarLancamentoExtratoDialog*"
---

# Conciliação bancária — ao tocar parser de extrato, matching ou a tela de importação

Antes de alterar, leia `docs/modules/conciliacao.md` inteiro. Cada regra dele custou lançamentos duplicados ou vendas perdidas em produção.

Pontos que não podem regredir:

- FITID não é estável entre downloads (Santander, PagBank): nunca é a única defesa contra reimportação, nem fallback de descrição.
- Dedup por conteúdo compara descrição com acento, caixa **e espaços internos** normalizados (`regexp_replace(..., '\s+', ' ', 'g')`), nos dois lados (cliente e `reconcile_import_lancamento`).
- "Possível duplicata" é sensível à contagem (`p_occurrence_index`, `reservarOcorrencias`), não à existência.
- Linha do extrato × lançamento existente vincula só por `reconcile_link_existing_lancamento`; casa por `COALESCE(data_pagamento, data_competencia)` e inclui espelhos de CP/CR.
- Extrato é lido por bytes (`decodeExtratoBuffer`), nunca por `file.text()`.
- Desconciliar e estornar CP limpam `fin_conciliacao_vinculos`. "0 p/ conciliar" não prova nada: só o banner de conferência de saldo verde.
