# PROMPT — APRESENTAÇÃO SÓCIOS — FASE 4: RESULTADOS

Continue o trabalho no repositório Moralles Food e implemente somente a Fase 4 da nova experiência Apresentação Sócios: o capítulo Resultados.

## Antes de alterar arquivos

1. Leia `AGENTS.md` integralmente.
2. Leia `docs/apresentacao-socios/FASE-0-AUDITORIA-NOVA-EXPERIENCIA.md`.
3. Inspecione integralmente as Fases 1, 2 e 3, especialmente o shell, registry/canvas, exports, contratos de Faturamento e Despesas e a migration `20260828030805_presentation_expenses.sql`.
4. Execute `git status --short --branch` e preserve todo trabalho paralelo, sobretudo redesign, `ModuleNav`, `FinanceiroView`, `AppLayout`, primitives, `index.css`, Tailwind e `docs/redesign`.
5. Não faça commit, push ou deploy e não aplique migrations no Supabase remoto.

## Estado esperado

- Existe um único shell em `/financeiro/apresentacao-socios`.
- O registry mantém `revenue`, `expenses`, `results`, `insights`.
- Faturamento tem três slides canônicos, exclusivamente de `financeiro_fechamento_caixa.faturamento_bruto`.
- Despesas tem quatro layouts canônicos e drill-down, exclusivamente no regime de caixa do DFC.
- Resultados e Insights novos ainda estão `unavailable/not-requested`.
- O conteúdo gerencial legado por competência continua preservado.
- Tela, impressão, PDF e PowerPoint consomem o mesmo registry tipado.
- O namespace temporário continua `financeiro:relatorio-socios:*`.

Não recrie o shell, não altere os contratos de Faturamento ou Despesas e não implemente Insights.

## Objetivo

Substituir somente a fundação do capítulo `results` por uma leitura executiva do resultado gerencial operacional por competência, cobrindo no mínimo:

1. receita, despesa, resultado e margem do período selecionado;
2. comparação equivalente com período anterior, preservando base zero explícita;
3. evolução do resultado no período na granularidade selecionada;
4. ponte determinística da variação do resultado, separando efeito de receita e efeito de despesa;
5. apresentação separada e informativa de valores não operacionais, sem incluí-los no resultado operacional;
6. drill-down apenas onde já houver contrato tenant-scoped e semanticamente equivalente, sem baixar o razão completo.

Não crie projeções, metas, causalidade ou insights automáticos nesta fase.

## Fonte única da verdade e regime

Resultados usa o contrato gerencial por competência já versionado em `src/domain/financeiro/presentation/contracts.ts` e a RPC efetiva `get_fin_presentation_socios`. Preserve exatamente:

- fonte realizada: `fin_lancamentos` e `fin_lancamento_rateios`;
- data: `data_competencia`;
- status canônicos do contrato gerencial;
- tipos `RECEITA` e `DESPESA`, com `TRANSFERENCIA` fora;
- `origem='conciliacao'` com `conciliado IS NOT TRUE` fora;
- `excluir_dos_relatorios` fora dos totais operacionais;
- rateio prevalecendo sobre categoria/valor do cabeçalho;
- fórmula `resultado = receita - despesa`;
- fórmula `margem = receita === 0 ? 0 : resultado / receita * 100`;
- CP/CR em aberto apenas como indicadores, nunca dentro do resultado.

Antes de alterar SQL, inspecione a definição efetiva mais recente da RPC com `pg_get_functiondef` quando houver acesso somente leitura. Não use DFC, DRE, Fechamento de Caixa ou `faturamento_bruto` como atalho para Resultados. Não misture caixa e competência no mesmo número.

## Backend e contrato

Prefira reutilizar o payload canônico já carregado por `usePresentationSocios`. Só crie uma RPC nova se um dado obrigatório não existir e a equivalência não puder ser demonstrada no contrato atual.

Se criar ou refatorar SQL:

- preserve assinaturas e payloads públicos existentes;
- use `assert_tenant()` e `financeiro:relatorio-socios:view`;
- não aceite `company_id` do cliente;
- use `SECURITY DEFINER`, `SET search_path = ''` e nomes qualificados em endpoint novo;
- revogue `PUBLIC/anon` e conceda somente `authenticated/service_role`;
- use agregação no PostgreSQL, ordenação determinística e estados explícitos;
- use timestamp `YYYYMMDDHHMMSS`, comentários e `DO`-block de resolução de colunas;
- prove equivalência antes/depois se tocar numa RPC vigente.

O frontend deve ter payloads tipados para cada slide, sem `NaN`, `Infinity` ou `null` ambíguo. Deltas de resultado e margem precisam distinguir `available` de base zero/indisponibilidade. Uma despesa maior reduz resultado: a ponte deve aplicar o sinal econômico, não apenas o sinal matemático bruto.

## Slides de Resultados

Substitua somente `chapter-results`, com IDs estáveis e ordem determinística. Composição mínima:

1. resumo de Receita, Despesa, Resultado e Margem;
2. comparação com o período anterior;
3. evolução temporal do Resultado;
4. ponte determinística da variação;
5. informativo não operacional, somente quando houver valores.

Todos os rótulos e rodapés devem declarar “resultado gerencial — regime de competência” ou equivalente. Faturamento deve continuar rotulado como Fechamento de Caixa e Despesas como caixa do DFC. `Insights` continua `unavailable/not-requested`.

Use o mesmo registry/canvas para tela, impressão, PDF e PowerPoint. Preserve 16:9, paginação, ausência de overflow, teclado, foco, `Escape`, fullscreen e `prefers-reduced-motion`.

## Navegação e segurança

- Preserve período, granularidade, comparação e `years` na query string ao alternar capítulos e detalhes.
- Reutilize apenas `financeiro:relatorio-socios:view` e `:export`.
- Não altere `ALLOWED_ACTIONS`, registry RBAC, grants de usuários ou sync.
- Não crie tabelas nem escrita financeira.
- Não altere Livro Razão, DRE, DFC, Conciliação, lançamentos, categorias, rateios, decisões, reuniões, atas ou ações.

## Testes obrigatórios

Prove no frontend:

- somente Resultados deixa `not-requested` nesta fase;
- Faturamento e Despesas não regridem nem trocam de fonte/regime;
- Insights continua sem números;
- resultado e margem batem exatamente com o payload canônico;
- base zero e ausência não geram `NaN`/`Infinity`;
- a ponte fecha exatamente na variação do resultado;
- despesa maior tem efeito desfavorável e despesa menor, favorável;
- não operacional fica fora do total operacional;
- tela, impressão, PDF e PPTX usam o mesmo conjunto de slides;
- teclado, foco, `Escape`, fullscreen, relatório legado e preparação/governança permanecem funcionais.

Se houver SQL novo ou refatorado, use PostgreSQL local/efêmero real e prove tenant, RBAC, ACL, semântica de rateio, exclusões, períodos, agregados e equivalência com a RPC anterior.

Execute pelo menos:

```bash
bun run test -- <suítes alteradas>
bun run lint
bun x tsc --noEmit
bun run build
```

Não aplique migrations remotamente.

## Entrega

Ao concluir:

1. liste arquivos criados, alterados e removidos;
2. descreva a fonte canônica e as fórmulas do capítulo;
3. documente qualquer prova de equivalência SQL;
4. informe migrations criadas sem aplicá-las;
5. confirme que Faturamento, Despesas/DFC, DRE, Livro Razão, Conciliação e escrita financeira não foram alterados;
6. informe SQL, testes, lint, typecheck e build;
7. registre limitações do worktree paralelo;
8. entregue um prompt autocontido para a Fase 5 — Insights, sem executá-la.
