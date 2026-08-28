# PROMPT — APRESENTAÇÃO SÓCIOS — FASE 2: FATURAMENTO

Continue o trabalho no repositório Moralles Food e implemente somente a Fase 2 da nova experiência Apresentação Sócios: o capítulo **Faturamento**.

Antes de alterar qualquer arquivo:

1. Leia `AGENTS.md` integralmente.
2. Leia `docs/apresentacao-socios/FASE-0-AUDITORIA-NOVA-EXPERIENCIA.md` integralmente.
3. Leia `docs/apresentacao-socios/PROMPT-FASE-1-FUNDACAO.md` e inspecione a implementação efetiva da Fase 1.
4. Execute `git status --short --branch` e inspecione todos os diffs relevantes.
5. Preserve integralmente alterações de outros agentes, em especial o redesign azul/branco/preto, `ModuleNav`, `FinanceiroView`, `AppLayout`, primitives de UI, `src/index.css`, `tailwind.config.ts` e `docs/redesign/`.
6. Não faça commit, push ou deploy e não aplique migrations no Supabase remoto.

## Estado esperado após a Fase 1

- `Relatório Sócios` e `Apresentação Sócios` são entradas visuais separadas no Financeiro.
- A apresentação abre diretamente em `/financeiro/apresentacao-socios`.
- Detalhes usam `/financeiro/apresentacao-socios/:detail`.
- Deep links antigos em `/financeiro/relatorio-socios/:detail` redirecionam com `replace`, preservando query string e hash.
- O shell único reutiliza `PresentationMode.tsx` e `PresentationSlideCanvas.tsx` em modo embutido e fullscreen.
- O registry tipado possui, nesta ordem: `revenue`, `expenses`, `results`, `insights`.
- Os capítulos ainda não implementados usam `availability: unavailable/not-requested`.
- A preparação analítica, cenários, decisões, reuniões e atas permanece acessível dentro de Apresentação Sócios.
- As duas entradas visuais compartilham deliberadamente `financeiro:relatorio-socios:*` durante a migração.

Não recrie essa fundação e não crie um segundo shell.

## Objetivo da Fase 2

Substituir somente o estado de fundação do capítulo **Faturamento** por dados canônicos do Fechamento de Caixa, com:

1. faturamento bruto do mês selecionado;
2. faturamento bruto do mês imediatamente anterior;
3. variação absoluta e percentual, com base zero/ausência explícitas;
4. faturamento por dia da semana no mês selecionado;
5. total, número de ocorrências e média por ocorrência para cada dia da semana;
6. histórico mensal de até três anos selecionados.

Os capítulos Despesas, Resultados e Insights novos permanecem fora de escopo. O conteúdo gerencial antigo por competência deve continuar preservado com sua semântica original durante a migração.

## 1. Fonte única da verdade

A fonte oficial de Faturamento é:

```text
public.financeiro_fechamento_caixa.faturamento_bruto
```

Regras obrigatórias:

- usar a data local `financeiro_fechamento_caixa.data`;
- somar `faturamento_bruto`, nunca `faturamento_liquido`;
- não somar o detalhamento por marcas novamente;
- `financeiro_fechamento_marca_valores` apenas decompõe o bruto e não é uma nova receita;
- não usar `fin_lancamentos`, DRE, DFC, Livro Razão ou `get_fin_presentation_socios` como fonte de faturamento;
- não misturar Faturamento com receita de caixa;
- ausência de fechamento deve ser distinguida de faturamento realmente igual a zero.

Não alterar o cadastro, fechamento, marcas, triggers ou regras do Fechamento de Caixa.

## 2. Backend agregado e tenant-scoped

Crie uma única RPC agregada própria do capítulo, evitando uma consulta por card, dia, mês ou ano. Prefira um contrato versionado e extensível, por exemplo `get_fin_presentation_revenue`, sem alterar as RPCs financeiras existentes.

A RPC deve:

- receber o mês principal em formato validado e até três anos distintos para o histórico;
- rejeitar mais de três anos e valores inválidos;
- chamar `assert_tenant()` e resolver o tenant no backend;
- nunca confiar em `company_id` enviado pelo cliente;
- exigir `financeiro:relatorio-socios:view`;
- ser `SECURITY DEFINER` com `SET search_path = ''` e nomes totalmente qualificados;
- revogar execução de `PUBLIC`/`anon` e conceder apenas a `authenticated` e `service_role`;
- retornar JSON tipado e versionado;
- agregar tudo no PostgreSQL;
- ordenar dias da semana de segunda a domingo;
- ordenar histórico por ano e mês de forma determinística;
- incluir metadados suficientes para distinguir `available`, `empty` e período sem cobertura.

Se criar migration, use timestamp `YYYYMMDDHHMMSS`, inclua comentário da função e um `DO`-block que execute/resolva a função para detectar referências de coluna inválidas antes do deploy. Não aplique a migration no remoto nesta fase.

## 3. Contrato do capítulo

Crie/adapte tipos defensivos para representar pelo menos:

- versão do contrato;
- mês selecionado e mês anterior;
- `current`: total, quantidade de fechamentos e cobertura;
- `previous`: total, quantidade de fechamentos e cobertura;
- delta absoluto;
- delta percentual com estado explícito quando a base anterior for zero ou ausente;
- sete linhas de dia da semana, mesmo quando algum dia não possui fechamento;
- em cada dia: índice ISO, rótulo, total, ocorrências e média;
- série histórica mensal por até três anos;
- anos efetivamente solicitados;
- data/hora de geração;
- estado de disponibilidade.

Não use `NaN`, `Infinity`, `null` ambíguo nem converta ausência em zero silenciosamente. Média é `total / ocorrências` somente quando ocorrências > 0.

## 4. Hook e cache

Implemente um hook React Query dedicado ou estenda a camada existente sem acoplar o capítulo ao relatório mensal legado.

- A query key deve incluir `companyId` apenas para isolar o cache, o mês e os anos selecionados.
- Não envie `companyId` como autoridade à RPC.
- Valide defensivamente o payload retornado.
- Preserve os estados `idle`, `loading`, `available`, `empty`, `unavailable` e `error`.
- Não faça waterfalls nem uma RPC por ano/mês.
- Mantenha os filtros e anos ao navegar entre capítulos e ao entrar/sair de fullscreen.

## 5. Seletor de anos

Esta fase pode introduzir o seletor de histórico de até três anos, que ficou explicitamente fora da Fase 1.

- permitir de um a três anos distintos;
- impedir o quarto ano de forma acessível;
- ordenar a seleção de forma determinística;
- persistir os anos na URL compartilhável;
- restaurar a seleção ao abrir um deep link;
- usar aritmética local para `yyyy-MM`; nunca `new Date('yyyy-MM-01')`;
- não alterar os demais filtros existentes.

## 6. Slides de Faturamento

Substitua apenas os slides `chapter-foundation` do capítulo `revenue` por slides reais e tipados. Mantenha IDs estáveis, capítulo, título, ordem e disponibilidade.

A composição mínima deve cobrir:

- resumo do mês atual × anterior;
- leitura por dia da semana com total/ocorrência/média;
- histórico mensal dos anos selecionados.

Requisitos de apresentação:

- rótulos devem dizer claramente **Faturamento bruto — Fechamento de Caixa**;
- não rotular o dado como receita financeira, DFC ou competência;
- não inventar metas, projeções ou insights nesta fase;
- usar o mesmo canvas na tela, PDF, PowerPoint e impressão;
- manter 16:9 sem overflow;
- preservar teclado, contador, capítulos, fullscreen por gesto do usuário e foco;
- respeitar `prefers-reduced-motion`;
- consumir tokens/componentes atuais sem editar primitives globais, CSS global ou Tailwind.

## 7. Drill-down e filtros

Se o slide permitir abrir detalhe, use a rota canônica e preserve query string dos filtros. Não baixe todas as linhas de fechamento no cliente.

Um drill-down detalhado novo não é obrigatório nesta fase. Se não houver contrato paginado existente adequado, mantenha o slide agregado e registre o drill-down para uma fase posterior em vez de criar uma listagem sem paginação.

## 8. Segurança e RBAC

- Reutilizar `financeiro:relatorio-socios:view` e `:export`.
- Não criar namespace `financeiro:apresentacao-socios:*` nesta fase.
- Não alterar `ALLOWED_ACTIONS`, registry remoto, grants de usuários ou sync de permissões.
- Não criar tabela nova.
- Não receber `company_id` como filtro confiável.
- Toda consulta deve ser restrita ao tenant resolvido por `assert_tenant()`.

## 9. Fora de escopo

Não alterar:

- Despesas, Resultados ou o novo motor de Insights;
- `get_fin_dfc_summary`;
- `get_fin_dre_summary`;
- `get_fin_presentation_socios` e sua semântica por competência;
- Livro Razão;
- Importação/Conciliação Bancária;
- lançamentos, categorias ou rateios;
- escrita do Fechamento de Caixa;
- decomposição por marcas;
- decisões, reuniões, atas ou ações;
- namespace RBAC;
- redesign global.

## 10. Testes obrigatórios

Adicionar/ajustar testes para provar:

- isolamento tenant da RPC;
- recusa sem `financeiro:relatorio-socios:view`;
- ausência de `EXECUTE` para `anon`;
- soma exata de `faturamento_bruto` sem duplicar marcas;
- mês selecionado e mês anterior em virada de ano;
- segunda a domingo em ordem fixa;
- total, ocorrências e média corretos;
- dia sem fechamento distinto de dia com fechamento zero;
- base anterior zero/ausente sem `Infinity`/`NaN`;
- seleção de um, dois e três anos;
- rejeição do quarto ano;
- histórico ordenado e agregado no banco;
- URL restaura mês e anos;
- filtro persiste entre capítulos;
- apenas Faturamento deixa `not-requested`;
- Despesas/Resultados/Insights ainda não recebem números novos;
- canvas, PDF, PowerPoint e impressão usam o mesmo conjunto de slides;
- teclado, Escape, foco e fullscreen não regrediram.

Execute pelo menos:

```bash
bun run test -- <suítes alteradas de Faturamento, apresentação e exports>
bun run lint
bun run build
```

Para SQL, use banco local/efêmero real; não substitua as regras financeiras por mocks. Se o ambiente local não permitir o teste SQL, deixe a migration e os testes preparados e documente objetivamente o bloqueio sem aplicar no remoto.

## 11. Critérios de aceite

- [ ] O capítulo Faturamento usa somente `financeiro_fechamento_caixa.faturamento_bruto`.
- [ ] Atual/anterior, dias da semana e histórico de até três anos são agregados no banco.
- [ ] Ausência e zero são distintos.
- [ ] Nenhum número de competência/DFC foi renomeado como Faturamento.
- [ ] O seletor limita e persiste até três anos.
- [ ] O shell único, rotas, filtros, teclado, fullscreen e exports continuam funcionando.
- [ ] Despesas, Resultados e Insights novos permanecem fora de escopo.
- [ ] Relatório Sócios legado e preparação/governança permanecem funcionais.
- [ ] RBAC e tenant isolation estão preservados.
- [ ] Nenhuma mudança paralela foi revertida.
- [ ] Testes, lint e build passam ou falhas externas estão isoladas e documentadas.

## 12. Entrega

Ao concluir:

1. liste arquivos criados/alterados/removidos;
2. descreva o contrato e a fonte canônica de Faturamento;
3. informe a migration criada, sem aplicá-la remotamente;
4. confirme que DRE, DFC, Livro Razão, Conciliação e escrita do Fechamento não foram alterados;
5. informe testes, lint e build;
6. registre limitações do worktree paralelo;
7. entregue um prompt autocontido para a **Fase 3 — Despesas**, sem executar a Fase 3.

