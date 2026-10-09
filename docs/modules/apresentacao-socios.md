# Módulo: Apresentação Sócios

> Regras movidas do `AGENTS.md` em 2026-10-07 (Padrão SaaS, Fase 9), com o texto preservado. É tela do Financeiro; tem documento próprio por ter escopo de unidade, rotas e governança próprios.

- Chave: submódulo `financeiro:relatorio-socios` (ações `view`, `export`, `manage`, `approve`, `simulate`), o mesmo do Borderô
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz: apresentação de resultados para os sócios (faturamento por marca, despesas por grupo, metas e projeção), modo apresentação com exportação em PDF/PPTX, sessões, pauta, decisões, ações e atas.
- Não faz: cálculo de DRE/DFC e Borderô → [financeiro.md](financeiro.md).
- Código: `src/components/financeiro/ApresentacaoSociosSection.tsx`, `src/components/financeiro/Presentation*.tsx`, `src/domain/financeiro/presentation/`, exportadores `src/lib/presentation*Export.ts`.

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `fin_presentation_sessions` / `fin_presentation_session_participants` / `fin_presentation_agenda_items` | empresa | sessões do ritual executivo |
| `fin_presentation_decisions` / `fin_presentation_decision_revisions` / `fin_presentation_decision_actions` | empresa | decisões e ações (entidades canônicas) |
| `fin_presentation_minutes_revisions` | empresa | atas (só referenciam decisões e ações) |
| leitura: `fin_lancamentos`, `fin_categorias`, `fin_orcamentos`, `metas_cmv`, `financeiro_fechamento_*` | empresa | fontes dos números |

## Invariantes

- Apresentação Sócios usa escopo independente no parâmetro `presentationUnit`; queries, permissões, detalhes e exports herdam o provider local. Implantação e rollback: `docs/multi-unidades/02-ARQUITETURA-E-OPERACAO.md`.
- **`fin_categorias.grupo` monta os detalhamentos da Apresentação Sócios (CMV, Folha, Operacionais, Financeiro, Investimentos)** — vale o grupo próprio ou o do ancestral mais próximo (`src/domain/financeiro/categoriaGrupo.ts` no cliente, `own_group`/`effective_group` nas RPCs `get_fin_presentation_*`); despesa sem grupo efetivo, ou em grupo que nenhum detalhamento lê, continua no resultado mas some dos detalhamentos e só aparece no aviso "fora dos detalhamentos" (R$ 111 mil de CMV do Ren Sushi ficaram fora assim). O Cadastro Base exige grupo quando não há o que herdar — sempre na raiz, exceto não operacional — só no cliente. O valor gravado nunca muda (inclusive `'empréstimo'` com acento); DRE/DFC não leem grupo, só a árvore.
- **Apresentação Sócios — metas e projeção** — no comparativo de plano, orçamento monetário vem só de `fin_orcamentos`, meta percentual de CMV só de `metas_cmv.meta_cmv_total` e realizado é o mesmo caixa de Resultados (o bloco não exibe desvio se o realizado do plano divergir de `managerialResult`); orçamento mais específico vence e pai/filho no mesmo mês é bloqueado, ausência nunca vira zero, contas em aberto ficam fora e projeção linear só existe com ao menos 7 dias observados.
- **Ritual executivo e atas são evidência de governança** — decisões e ações permanecem entidades canônicas da Fase 11; atas só as referenciam, e snapshots aprovados nunca viram fonte financeira viva.
- Faturamento por loja e vínculo marca→categoria (`get_fin_presentation_revenue.byBrand`): [financeiro.md](financeiro.md), "Fechamento de Caixa".
- Regime de caixa pelo Livro Razão e chave compartilhada com o Borderô: [financeiro.md](financeiro.md), "Relatórios".
- Sessão e decisão são registros editáveis depois de criados: o reenvio compara com o `idempotency_fingerprint` do pedido original (DATABASE, "Particularidades", idempotência).
- Os 4 exportadores do Modo Apresentação têm paleta literal fora dos tokens: [ui.md](ui.md), "Design system".

## Commands, queries e eventos

- Queries: `get_fin_presentation_*` (ex.: `get_fin_presentation_revenue`), gate de leitura `_fin_presentation_can_view`.
- Notificações de ata aprovada/devolvida nascem no servidor e revalidam o destinatário ([ui.md](ui.md), "Notificações").

## Dependências

- Financeiro (categorias, orçamento, Livro Razão, Fechamento de Caixa); CMV de estoque só pela meta `metas_cmv.meta_cmv_total`.

## Decisões

- Histórico de fases: `docs/apresentacao-socios/`. Escopo de unidade, implantação e rollback: `docs/multi-unidades/02-ARQUITETURA-E-OPERACAO.md`.
