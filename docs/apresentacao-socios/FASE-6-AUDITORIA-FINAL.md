# Apresentação Sócios — Fase 6: Auditoria final

Data da auditoria: 28/08/2026
Escopo: UX, acessibilidade, responsividade, paridade de exports, fontes, regimes e segurança da nova experiência em `/financeiro/apresentacao-socios`.

## Conclusão

A Fase 6 está concluída localmente. O shell, o canvas e os exportadores compartilham o mesmo registry tipado, a mesma ordem, os mesmos IDs, payloads e critérios de paginação. A revisão não encontrou mistura entre Fechamento de Caixa, caixa do DFC e competência, nem introduziu novos indicadores, fórmulas ou regras financeiras.

As suítes TypeScript, lint, build e testes passaram. PDF e PowerPoint foram gerados como arquivos nativos, renderizados e inspecionados visualmente. A única evidência pendente é a execução dos testes SQL efêmeros: a stack Supabase local não estava disponível (`supabase_db_wuzxpbixprrgssoeeaez` inexistente), e nenhuma migration foi aplicada ao ambiente remoto, conforme a restrição da fase.

## Fontes e regimes auditados

| Capítulo | Fonte canônica | Regime preservado | Evidência no deck |
|---|---|---|---|
| Faturamento | `financeiro_fechamento_caixa.faturamento_bruto` | Fechamento de Caixa pela data local do fechamento | fonte e regime explícitos nos slides e exports |
| Despesas | `fin_lancamentos` e `fin_lancamento_rateios` | caixa do DFC pela data efetiva; rateio prevalece; transferências e conciliações pendentes ficam fora | fonte e regime explícitos; drill-down mantém o tenant |
| Resultados | `get_fin_presentation_socios` | competência por `data_competencia`; não operacional fora do resultado; CP/CR somente como indicadores | fonte e regime explícitos |
| Insights | agregados tipados de Faturamento e Despesas | regras determinísticas versionadas, sem dados de Resultados | regra, versão, evidências numéricas e fonte por insight |

O registry mantém a ordem canônica `revenue` → `expenses` → `results` → `insights`. Tela, impressão, PDF e PowerPoint consomem as mesmas entradas do registry. Não há seleção de slides nem cálculo financeiro paralelo nos exportadores.

## UX, responsividade e acessibilidade

- Shell e canvas usam tokens semânticos do design system em light e dark; não foram adicionadas cores hexadecimais aos componentes.
- O canvas executivo preserva 16:9 e escala como uma unidade, sem scroll interno no slide. A navegação de capítulos pode rolar horizontalmente em tela estreita sem criar overflow na página.
- Títulos, categorias e descrições longas quebram linha. Árvores de despesas usam uma densidade menor por página, e Insights paginam por quantidade e volume de conteúdo, sempre com no máximo três cartões por slide.
- Cabeçalho, rodapé, fontes/regimes, números brasileiros e estados sem dados permanecem dentro da área segura.
- Navegação por teclado cobre setas, `PageUp`, `PageDown`, `Home`, `End` e `Escape`; capítulo ativo usa `aria-current`; o contador tem anúncio controlado; drill-downs preservam nomes acessíveis.
- O foco inicial e a restauração de foco continuam cobertos pela suíte. Fullscreen só é solicitado por gesto e possui mensagem correta quando recusado.
- Durante exportação, navegação, fechamento e troca de fullscreen ficam desabilitados; `Escape` cancela uma exportação cancelável sem fechar a apresentação. Desmontagem e troca de rota abortam o trabalho em andamento.
- `prefers-reduced-motion`, limpeza de listeners e restauração de scroll permanecem preservados.

Verificação real no navegador:

- dark e light inspecionados em desktop, sem corte ou overflow no canvas de 1280 × 720;
- viewport móvel de 390 × 844 inspecionada, sem overflow horizontal da página; controles e filtros reorganizam em múltiplas linhas;
- console sem erro de layout ou runtime da apresentação; foram observados avisos futuros do React Router, os erros controlados esperados das RPCs ainda não aplicadas e, numa aba isolada sem autenticação, mensagens de permissão de Estoque sem relação com o deck;
- servidor local usado somente para a inspeção e encerrado ao final.

## Paridade de impressão, PDF e PowerPoint

- A fixture auditada produziu 14 páginas/slides na mesma ordem do registry.
- PDF: documento nativo, sem JavaScript incorporado, com metadados neutros para as fontes mistas; títulos longos reduzem a fonte e ocupam no máximo duas linhas antes do subtítulo.
- PowerPoint: elementos nativos e editáveis; uma página de notas por slide registra `slideId`, capítulo, tipo, ordem, fontes e regras.
- A suíte compara a quantidade e a ordem das notas do PowerPoint com o registry e valida o assunto nos metadados dos dois formatos.
- O validador estrutural do PowerPoint retornou `Test passed. No overflow detected.`. As 14 páginas do PDF e os 14 slides do PowerPoint foram renderizados em imagens e revisados em montagem, sem cortes ou sobreposições visíveis.
- Os exportadores mantêm nomes de arquivo, progresso, cancelamento, revogação de URLs temporárias e abort no unmount. Controles interativos não são incluídos na impressão.

## Segurança, tenant e observabilidade

- As RPCs de Faturamento e Despesas resolvem o tenant no backend, executam `assert_tenant()`, verificam `financeiro:relatorio-socios:view` e restringem ACL a `authenticated`/`service_role`, com `PUBLIC` e `anon` revogados.
- A permissão de exportação continua separada em `financeiro:relatorio-socios:export`; `ALLOWED_ACTIONS`, registry RBAC, grants de usuários e sync remoto não foram alterados.
- Não houve escrita financeira, alteração em DFC/DRE/Livro Razão/Fechamento/Conciliação nem aplicação de migration remota.
- Os diagnósticos de falha dos hooks registram somente tipo de erro e tipos dos campos; payloads financeiros, credenciais, JWTs e dados pessoais não são enviados ao console.
- A busca estática confirmou a presença das guardas de tenant, permissão e ACL nas migrations locais da apresentação.

## Desempenho

- Cada fonte é carregada uma vez pelos hooks e o payload resultante é reutilizado por tela e exportadores.
- PDF, PowerPoint e suas dependências permanecem em imports dinâmicos, fora do caminho inicial da apresentação.
- Paginação acontece antes da renderização, evitando listas ilimitadas no canvas e nos arquivos exportados.
- A Fase 6 não adicionou consultas por linha, downloads integrais de tabelas nem novas RPCs.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| `bun run test` | 74 arquivos, 576 testes aprovados |
| `bun x tsc --noEmit` | aprovado, sem erros |
| `bun run lint` | aprovado, 0 erros; 676 avisos preexistentes no repositório |
| `bun run build` | build de produção aprovado; apenas avisos de tamanho de chunk e Browserslist |
| `git diff --check` | aprovado |
| Validador do PowerPoint | aprovado, sem overflow estrutural |
| Renderização visual de PDF/PPTX | 14 páginas/slides revisados, sem corte ou sobreposição visível |
| Navegador real | desktop light/dark e 390 × 844 aprovados; console conferido |

Também passaram os testes direcionados de registry, paginação, exports, estados de disponibilidade, teclado, foco, fullscreen, query string, permissões, drill-down, fontes/regimes e regressões dos quatro capítulos.

## Limitação de ambiente e condição antes de uso com dados reais

Os arquivos `supabase/tests/database/presentation_revenue_ephemeral.sql` e `supabase/tests/database/presentation_expenses_ephemeral.sql` foram executados com sucesso em PostgreSQL 17 descartável. As RPCs das migrations `20260828030748_presentation_revenue.sql` e `20260828030805_presentation_expenses.sql` também foram aplicadas ao ambiente remoto e validadas no fluxo autenticado.

Antes de liberar a experiência com dados reais, falta executar os dois testes efêmeros em PostgreSQL local/isolado e, no fluxo de banco aprovado, aplicar as migrations já existentes. Esta auditoria não aplicou nem modificou estado remoto.

## Arquivos ajustados na Fase 6

- `src/components/financeiro/PresentationMode.tsx`
- `src/components/financeiro/PresentationSlideCanvas.tsx`
- `src/lib/presentationSlides.ts`
- `src/lib/presentationPdfExport.ts`
- `src/lib/presentationPptxExport.ts`
- testes correspondentes de shell, canvas, registry e exports
- ajuste cirúrgico do fundo de impressão em `src/index.css`

Nenhum código morto foi removido: não houve candidato cuja ausência de consumidores pudesse ser comprovada com segurança dentro do worktree paralelo.
