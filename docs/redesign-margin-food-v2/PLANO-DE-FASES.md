# Plano de fases — Margin Food • V2

Roteiro de execução, não relatório de trabalho concluído. Atualizado na Fase 00 (2026-10-03) com as subfases definidas a partir do inventário. O estado real de cada fase fica em `PROGRESSO.md`.

O caminho até o primeiro dashboard é 00 → 01 → 02 → 03. As demais fases propagam a identidade a TODO o sistema. Não executar o prompt 03 isoladamente antes de confirmar as fundações. Uma fase (ou subfase) por chat.

| Fase | Escopo | Prompt | Linhas da matriz | Estado |
|---|---|---|---|---|
| 00 | Auditoria, cobertura e baseline | [Abrir](prompts/00-auditoria-e-inventario.md) | — | Concluída com ressalva (sem baseline em navegador) |
| 01 | Fundação visual, cards e gráficos compartilhados | [Abrir](prompts/01-fundacao-cards-e-graficos.md) | GLB-001…008 | Não iniciada |
| 02 | Sidebar, cabeçalho, seletor de loja e navegação | [Abrir](prompts/02-sidebar-e-seletor-de-loja.md) | GLB-009…021 | Não iniciada |
| 03 | Dashboard Financeiro completo | [Abrir](prompts/03-dashboard-financeiro.md) | FIN-B (Fase 03), 11 linhas | Não iniciada |
| 04A | Contas Bancárias, Livro Razão, Fluxo de Caixa, Projeção | [Abrir](prompts/04-contas-bancarias-e-movimentacao-financeira.md) | FIN-A (Fase 04), 35 linhas no total da fase | Não iniciada |
| 04B | Conciliação Bancária | idem | idem | Não iniciada |
| 05A | Contas a Pagar, Contas a Receber, Códigos de Pagamento, Recorrências, Alertas | [Abrir](prompts/05-operacoes-e-cadastros-financeiros.md) | FIN-A (Fase 05), 32 linhas no total da fase | Não iniciada |
| 05B | Fechamento de Caixa, Cadastros Base, Categorização | idem | idem | Não iniciada |
| 06A | DRE/DFC, Orçamento, KPIs, Comparativo, Auditoria, Borderô | [Abrir](prompts/06-analises-e-relatorios-financeiros.md) | FIN-B (Fase 06), 55 linhas no total da fase | Não iniciada |
| 06B | Apresentação Sócios (tela, detalhes, modo apresentação, governança) | idem | idem | Não iniciada |
| 07 | CMV Financeiro | [Abrir](prompts/07-cmv-financeiro.md) | FIN-B (Fase 07), 11 linhas | Não iniciada |
| 08A | Estoque: Dashboard, Ranking, Perdas, Preditivo, Simulador | [Abrir](prompts/08-controle-de-estoque.md) | EST, 32 linhas no total da fase | Não iniciada |
| 08B | Estoque: Saldo, Movimentações, Requisições, Transferências, Catálogo, Cadastros | idem | idem | Não iniciada |
| 09A | Movimentação Operacional e leitura por câmera | [Abrir](prompts/09-movimentacao-e-inventario.md) | OPE, 11 linhas | Não iniciada |
| 09B | Inventário Geral | idem | INV, 13 linhas | Não iniciada |
| 10 | Dashboard e Controle de Salmão | [Abrir](prompts/10-salmao.md) | SAL, 15 linhas | Não iniciada |
| 11A | Compras: Pedidos, Checklist, Calendário, Recebimentos, Confirmações, Alertas de falta | [Abrir](prompts/11-compras-e-fornecedores.md) | COM, 31 linhas no total da fase | Não iniciada |
| 11B | Compras: Cotação, Fornecedores, Ranking | idem | idem | Não iniciada |
| 12A | Centro de CMV | [Abrir](prompts/12-centro-cmv-e-ficha-tecnica.md) | CMV, 12 linhas | Não iniciada |
| 12B | Ficha Técnica | idem | FIC, 12 linhas | Não iniciada |
| 13A | Planejamento | [Abrir](prompts/13-planejamento-e-relatorios-gerais.md) | PLA, 11 linhas | Não iniciada |
| 13B | Relatórios Gerais | idem | REL, 13 linhas | Não iniciada |
| 14A | RH: Dashboard, Prontuário, Folha, Custos, Benefícios, Ponto, Banco de horas | [Abrir](prompts/14-rh-pessoas.md) | RH, 38 linhas no total da fase | Não iniciada |
| 14B | RH: Escalas, Tarefas, Onboarding, Treinamento, Férias, Documentos, SST, Disciplinar, Mural | idem | idem | Não iniciada |
| 15 | Central de IA | [Abrir](prompts/15-central-ia.md) | IA, 5 linhas | Não iniciada |
| 16A | Usuários e Configurações | [Abrir](prompts/16-administracao-e-telas-auxiliares.md) | ADM, 30 linhas no total | Não iniciada |
| 16B | `/admin`, Login, Reset de senha, 404 e superfícies globais (sininho, avisos, calculadora, PWA, erros) | idem | AUX, 20 linhas | Não iniciada |
| 17 | QA integrado, cobertura total e entrega | [Abrir](prompts/17-qa-integrado-e-fechamento.md) | Todas | Não iniciada |

Os prompts originais em `prompts/` não foram alterados. Cada subfase usa o prompt da fase base, restringindo o escopo às linhas indicadas; o `PROXIMO-CHAT.md` de cada entrega diz qual subfase executar.

## Por que estas subdivisões

- **04B** — `ConciliacaoBancariaSection.tsx` tem cerca de 3.700 linhas e concentra regras caras (duplicata, FITID, ocorrência). Merece chat próprio, com mudança só de apresentação.
- **06B** — a Apresentação Sócios soma mais de dez componentes, rotas próprias e modo de impressão. Os quatro arquivos de exportação (`src/lib/presentation*Export.ts`) têm paleta impressa literal e **ficam fora** do redesign (CLAUDE.md).
- **08, 11, 14** — 32, 31 e 38 linhas de matriz; dividir mantém validação em navegador viável por chat.
- **09, 12, 13, 16** — módulos independentes que o plano original agrupava em uma fase.

## Regras de divisão

Uma subfase pode ser dividida de novo (ex.: 06B1/06B2) se o chat não comportar. Cada uma tem escopo pequeno, validação e handoff próprios. Atualizar a matriz antes de avançar. "Mesmo componente base" não elimina revisão de consumidor. A auditoria final não é local para descobrir que um módulo inteiro ficou sem responsável.

Um bloqueio funcional de uma área não autoriza remover a área. Documentar e pedir decisão. Trabalho independente em outra área só pode avançar com dependências explicitadas, sem marcar a bloqueada como concluída.

## Pré-requisito de todas as fases de implementação

Navegador com sessão de teste (ver bloqueio B1 em `fases/00-RELATORIO.md`). Sem ele a fase pode ser implementada, mas termina como "implementada, aguardando validação" e o chat seguinte é de validação, não de avanço (decisão D13).
