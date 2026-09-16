# Performance — fixtures identificadas, sem carga produtiva

Data UTC: 2026-09-16T20:26:27.385Z. PostgreSQL 17.10, 127.0.0.1:15440. [Planos completos e índices](performance.json), [runner](../../../scripts/test-phase11-performance.mjs). Dois clones novos, um do estado vivo reconstruído F9 e outro do candidato F7 + hotfix. Nomes, versões, endereço, porta e hashes públicos estão no JSON. Não é comparação de um release integrado aplicável: a cadeia F3/F7 continua bloqueada.

## Método

Cada clone tem duas empresas, 6.000 produtos (3.000/empresa), 30.000 lançamentos (15.000/empresa), 18.000 movimentos (9.000/empresa), um usuário multi e permissões granulares ALLOW com legadas DENY. Campos/IDs são inteiramente sintéticos. O bulk seed desabilita triggers apenas dentro da transação de preparação; todas as leituras medidas ocorrem com triggers normais, RLS real e SET LOCAL ROLE authenticated. Isso não certifica os caminhos de escrita do seed. Nenhum dado produtivo foi copiado.

ANALYZE das cinco tabelas relevantes antes da medição. Dez consultas, três execuções independentes cada, nos dois estados: 60 EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), somente SELECT, dentro de READ ONLY, timeout 20s. Sem writes via EXPLAIN, índice novo, mudança de policy, parâmetro global ou fórmula. Conexões psql separadas incluem planejamento normal; Execution Time do Postgres não inclui HTTP/browser. Caches de buffers do cluster estavam aquecidos; concorrência com ferramentas locais e apenas três repetições impedem concluir diferenças pequenas.

## Tempos observados

Mediana local de três execuções, em milissegundos. Valores individuais, planejamento, loops e buffers permanecem no JSON.

| Consulta | Vivo equivalente | Candidato F7 + hotfix |
|---|---:|---:|
| productsRls | 12.344 | 11.597 |
| productsExplicit | 9.597 | 10.340 |
| financePage | 9.705 | 9.221 |
| financeDeepOffset | 18.643 | 18.174 |
| financeKeyset | 9.874 | 9.409 |
| movementsPage | 9.058 | 8.898 |
| stockSummary | 18.076 | 18.598 |
| movementKpis | 22.796 | 24.166 |
| permissionPerRow | 10.938 | 12.139 |
| permissionInitPlan | 13.465 | 10.718 |

## Planos e interpretação

- Produtos sem filtro explícito dependeram de RLS e fizeram Seq Scan/ordenação. Com company_id explícito, o plano usou idx_produtos_company_nome e limitou a página a 50. Isso demonstra valor do predicado redundante para o planner nesta distribuição; não propõe acrescentar filtros indiscriminadamente em tabelas globais.
- Financeiro primeira página e cursor usaram idx_fin_lancamentos_company_data. OFFSET 10000 usou idx_fin_lancamentos_company_id, processou o conjunto anterior e teve custo aproximadamente 2× nesta fixture. Cursor e offset usam pontos de corte distintos e não foram tratados como páginas equivalentes. A comparação ilustra o crescimento do trabalho; não mudou o contrato de paginação do aplicativo.
- Movimentações paginadas usaram idx_movimentacoes_estoque_created_at. Ter company_id em outros índices não obriga o planner a escolhê-los: nesta fixture o LIMIT favoreceu a ordenação existente. Não inferir necessidade de índice adicional só pela escolha.
- Policies efetivas apareceram com 8 InitPlans em produtos vivos e 10 no candidato; financeiro/movimentações tiveram 5. O número maior de policies no candidato não produziu regressão material nas três amostras. Ausência de regressão aqui não é garantia de SLO real.
- O experimento do predicado de permissão adicional com SELECT produziu mais um InitPlan, executado uma vez. O predicado direto foi tratado pelo planner como filtro único neste caso; não houve melhora consistente de tempo. Portanto não se reproduziu o ganho histórico de 185× e não se extrapolou essa cifra. A regra de SELECT nas policies novas permanece, sem alegar que toda função STABLE necessariamente é chamada por linha.
- get_stock_summary e get_movimentacoes_kpis retornam agregados no servidor; o EXPLAIN da chamada PL/pgSQL oculta seus planos internos. Os planos de tabelas medem RLS/índices separadamente; não alegamos que Function Scan exponha a árvore interna de um definer.
- get_stock_summary retornou 3.000 produtos/R$252.000 nos dois estados. O cache tem 12 unidades × R$7 por produto; o ledger sintético tem só 3 entradas de 1. O resultado e a inspeção do corpo confirmam leitura de saldo_atual, sem somar ledger para substituir saldo. SELECT autenticado da empresa B dentro do header A retornou zero.

## Troca de escopo e cache

Browser 17 confirma remoção de A durante contexto B atrasado e retry real em 119ms locais na execução final; esse valor isolado não é benchmark de troca. Unitários reexecutados exercitam abort, eventos/cache CMV por lifetime e cleanup. Não houve carga concorrente de centenas de sessões nem medição de hit ratio produtivo. Nenhuma configuração de cache foi alterada.

## Limite de aceite

Não há p95/p99, cold-start cloud, gateway, custo de rede, locks sob escrita concorrente ou distribuição de cardinalidade produtiva certificados. A fixture tem volume e skew simples 50/50, não replica o negócio. Repetir o mesmo conjunto no pacote reconciliado e em staging representativo antes de definir SLO/limites. Nenhuma otimização de produto foi necessária ou aplicada nesta fase.

Referências consultadas: [RLS/InitPlan](https://supabase.com/docs/guides/database/postgres/row-level-security) e [EXPLAIN PostgreSQL](https://www.postgresql.org/docs/current/using-explain.html). As medidas acima são do runner e seus planos, não números inferidos das referências.
