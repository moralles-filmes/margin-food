# PROMPT — APRESENTAÇÃO SÓCIOS — FASE 1: FUNDAÇÃO E SEPARAÇÃO SEGURA

Continue o trabalho no repositório Moralles Food e implemente somente a Fase 1 da nova experiência Apresentação Sócios.

Antes de alterar qualquer arquivo:

1. Leia `AGENTS.md` integralmente.
2. Leia `docs/apresentacao-socios/FASE-0-AUDITORIA-NOVA-EXPERIENCIA.md` integralmente.
3. Execute `git status --short --branch` e inspecione todos os diffs relevantes.
4. Preserve integralmente alterações de outros agentes. O worktree possui um redesign azul/branco/preto em andamento, inclusive mudanças em `FinanceiroView`, `AppLayout`, primitives de UI, `index.css` e Tailwind. Não reverta, reformate, sobrescreva nem inclua esses arquivos em uma reescrita ampla. Quando precisar tocar `FinanceiroView`, faça apenas mudanças cirúrgicas sobre a versão atual e preserve a navegação `ModuleNav` existente.
5. Não faça commit, push, deploy nem aplique migrations no Supabase remoto.

## Contexto obrigatório

A `main` já contém uma Apresentação Sócios extensa, concluída nas fases anteriores, com:

- dashboard analítico;
- filtros;
- modo apresentação;
- fullscreen e teclado;
- deep links e drill-down;
- metas, cenários, decisões, ações, reuniões e atas;
- PDF, PowerPoint e impressão;
- RPCs tenant-scoped e testes.

Não crie uma segunda apresentação e não apague essa infraestrutura.

O novo pedido muda a experiência final para a ordem:

1. Faturamento
2. Despesas
3. Resultados
4. Insights

Nesta fase, implemente apenas a fundação de navegação e do shell. Não mude regras financeiras e não tente implementar os gráficos ou cálculos das fases seguintes.

## Objetivo da Fase 1

Separar com segurança Relatório Sócios e Apresentação Sócios, criar uma entrada direta para a apresentação e preparar um único shell reutilizável para os quatro capítulos, preservando URLs, permissões, filtros, fullscreen, exports e governança existentes.

## 1. Nova entrada no Financeiro

Adicionar uma entrada visual própria e fixa chamada:

**Apresentação Sócios**

Requisitos:

- deve aparecer em `Relatórios & Análise`, ao lado do contexto de Relatório Sócios;
- deve usar a arquitetura atual de navegação do módulo, inclusive `ModuleNav` se ela estiver presente no worktree;
- deve ser filtrada pelas permissões atuais;
- o clique deve abrir diretamente a experiência de apresentação, sem página intermediária e sem botão adicional;
- `Relatório Sócios` deve continuar existindo e funcionando.

Durante esta migração, reutilize deliberadamente o namespace RBAC existente `financeiro:relatorio-socios:*`. Não crie um namespace novo nesta fase: as RPCs, decisões, reuniões, exports e grants já dependem desse contrato. Documente no código apenas onde for necessário que as duas entradas visuais compartilham o mesmo escopo de autorização.

Não altere `ALLOWED_ACTIONS`, não rode sync remoto de permissões e não mude grants.

## 2. Separar os componentes atuais

Hoje `RelatorioSociosWorkspace.tsx` mistura:

- `ApresentacaoSociosSection`;
- `RelatorioSociosSection`.

Separe os fluxos:

- a subtab **Relatório Sócios** deve renderizar diretamente o relatório mensal legado, preservando filtros e exports;
- a subtab **Apresentação Sócios** deve renderizar a experiência nova diretamente;
- remova o botão **Iniciar modo apresentação** do fluxo antigo;
- não mantenha duas formas concorrentes de abrir a apresentação;
- não remova dashboard analítico, governança, cenários, decisões, reuniões ou atas. Realoque a preparação/governança dentro do contexto da nova Apresentação Sócios, sem colocá-la de volta dentro do relatório mensal legado.

Se `RelatorioSociosWorkspace.tsx` deixar de ser necessário, remova-o somente depois de confirmar que nenhuma rota, teste ou import depende dele.

## 3. Rotas canônicas e compatibilidade

Criar rotas canônicas:

- `/financeiro/apresentacao-socios`
- `/financeiro/apresentacao-socios/:detail`

Atualizar `PRESENTATION_BASE_PATH` e os builders de navegação para o novo path.

Compatibilidade obrigatória:

- `/financeiro/relatorio-socios` deve continuar abrindo o relatório mensal legado;
- deep links antigos `/financeiro/relatorio-socios/:detail` devem redirecionar para o detalhe equivalente em `/financeiro/apresentacao-socios/:detail`;
- preservar integralmente query string e hash no redirecionamento;
- usar `replace`, evitando duplicar histórico;
- não criar loop de navegação;
- manter os guards de módulo e permissão em `Index.tsx`/`FinanceiroView`.

## 4. Um único shell de apresentação

Reaproveite `PresentationMode.tsx` e `PresentationSlideCanvas.tsx`. Não copie o shell para outro componente quase idêntico.

Extraia/componha responsabilidades somente quando necessário para suportar:

- experiência embutida, aberta diretamente pela subtab;
- modo fullscreen nativo;
- anterior/próximo;
- teclado existente;
- contador `atual / total`;
- nome da seção atual;
- navegação rápida pelos capítulos:
  - Faturamento
  - Despesas
  - Resultados
  - Insights
- foco acessível e restauração de foco;
- layout responsivo 16:9 sem overflow;
- exports continuando a usar o mesmo canvas.

Não force `requestFullscreen()` automaticamente: navegadores exigem gesto do usuário. A experiência deve abrir diretamente ocupando a área da apresentação, e o botão de fullscreen deve continuar disponível.

Ao fechar/sair da experiência embutida, não deixe uma tela vazia. Preserve uma forma clara de acessar a preparação analítica e a governança já existentes dentro do novo submódulo.

## 5. Modelo estrutural dos capítulos

Crie um registry tipado e testável para capítulos/slides, com ordem determinística:

1. `revenue` / Faturamento
2. `expenses` / Despesas
3. `results` / Resultados
4. `insights` / Insights

Cada slide deve conhecer pelo menos:

- id estável;
- capítulo;
- título;
- ordem;
- disponibilidade.

Não invente números, categorias ou gráficos nesta fase.

Como esta fase não implementa os novos datasets financeiros, use estados explícitos de indisponibilidade/“não solicitado nesta fase” no ambiente de desenvolvimento, ou preserve conteúdo canônico atual com sua semântica original de competência. É proibido rotular dados por competência como DFC, fluxo de caixa ou Fechamento de Caixa.

Não remova ainda contratos antigos usados por dashboard, governança ou exports. Prepare uma migração incremental.

## 6. Filtros e contexto

Reaproveite `PresentationPeriodFilters` e os helpers atuais.

O shell precisa manter visível, de forma compacta:

- empresa atual (`profile.company_name`);
- período principal;
- controles necessários para o filtro atual.

Regras:

- filtros persistem ao navegar entre capítulos e detalhes;
- URL continua sendo a fonte compartilhável do contexto;
- `company_id` não deve ser enviado como autoridade para RPCs;
- o backend continua resolvendo tenant por `assert_tenant()`;
- não implemente ainda o seletor de até três anos — isso pertence à Fase 2;
- não use parsing UTC para rótulos `yyyy-MM`.

## 7. Design e alterações paralelas

- Use os tokens e componentes atuais do worktree.
- Não altere `src/index.css`, `tailwind.config.ts`, primitives globais ou arquivos em `docs/redesign/`.
- Não reintroduza dourado/hex legado em componentes novos.
- Não troque a fonte global.
- Garanta estrutura correta em light e dark, mas deixe o refinamento visual completo para a Fase 6.
- Respeite `prefers-reduced-motion` e foco visível.

## 8. Fora de escopo desta fase

Não alterar:

- `get_fin_presentation_socios`;
- `get_fin_dfc_summary`;
- `get_fin_dre_summary`;
- Fechamento de Caixa;
- Livro Razão;
- Importação/Conciliação Bancária;
- lançamentos, categorias ou rateios;
- regras de competência/caixa;
- tabelas ou dados;
- migrations já aplicadas;
- permissões remotas;
- cálculos de Faturamento, Despesas, Resultados ou Insights.

Não criar migration nesta fase, salvo se uma necessidade incontornável for comprovada. A arquitetura esperada permite concluir a fundação somente no frontend.

## 9. Testes obrigatórios

Adicionar/ajustar testes para provar:

- a nova entrada aparece para quem possui `financeiro:relatorio-socios:view`;
- a entrada não aparece sem acesso;
- clicar em Apresentação Sócios abre diretamente o shell;
- o botão antigo não existe mais no Relatório Sócios;
- o relatório mensal legado continua renderizando;
- as quatro seções existem e seguem a ordem obrigatória;
- anterior/próximo e navegação por capítulo funcionam;
- teclado e Escape não regrediram;
- fullscreen continua protegido por ação do usuário;
- filtros permanecem ao mudar de capítulo;
- os novos paths funcionam;
- deep links antigos redirecionam preservando query/hash;
- não há duas instâncias conflitantes do modo apresentação.

Execute pelo menos:

```bash
bun run test -- <suítes alteradas da apresentação e navegação>
bun run lint
bun run build
```

Como há alterações paralelas no worktree, se lint/build falharem em arquivos não tocados por esta fase, isole e documente a falha sem modificar o trabalho do outro agente.

## 10. Critérios de aceite da Fase 1

- [ ] Existe subtab visual própria Apresentação Sócios.
- [ ] O clique abre diretamente um único shell de apresentação.
- [ ] Relatório Sócios continua separado e funcional.
- [ ] O botão antigo foi removido.
- [ ] Rotas novas funcionam.
- [ ] Deep links antigos continuam válidos por redirect compatível.
- [ ] Quatro capítulos estão tipados e ordenados.
- [ ] Filtros e empresa permanecem no contexto.
- [ ] Navegação, teclado e fullscreen funcionam.
- [ ] Permissões atuais são preservadas.
- [ ] Nenhuma regra ou número financeiro foi alterado.
- [ ] Nenhuma mudança de outro agente foi revertida ou reformatada.
- [ ] Testes da fase passam.

## 11. Entrega

Ao concluir:

1. liste arquivos criados/alterados/removidos;
2. explique a separação de rotas e componentes;
3. confirme que DRE, DFC, Fechamento, Livro Razão e Conciliação não foram alterados;
4. informe testes, lint e build;
5. registre qualquer limitação do worktree paralelo;
6. entregue um prompt autocontido para a **Fase 2 — Faturamento**, sem executar a Fase 2.

