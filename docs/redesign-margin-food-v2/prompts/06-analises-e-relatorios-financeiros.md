# PROMPT — FASE 06 • DRE/DFC, análises e apresentação de sócios

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Padronizar o conjunto analítico do Financeiro e suas telas de detalhe, preservando a leitura dos demonstrativos e a rastreabilidade dos números.

## Leitura dirigida

Leia DRESection, DFCSection, OrcamentoSection, ProjecaoFluxoSection, KPIsSection, ComparativoSection, BorderoSection, ApresentacaoSociosSection, AuditoriaFinSection, componentes Presentation*, demonstrativos e exportadores associados. Inclua rotas de detalhe e modo apresentação. Consulte invariantes de pais/filhos e realizado/orçado/projetado.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Dashboard e biblioteca de componentes; modelos das demais telas servem para linguagem visual, não para substituir a estrutura dos demonstrativos.

## Implementação / entregáveis

1. Organize cabeçalhos, filtros, abas e ações em todos os relatórios, sem fundir demonstrativos distintos.
2. Destaque totais e subtotais na hierarquia de DRE/DFC com recuo, peso e borda, mantendo abertura de nós, sinais e conceitos. Não usar todos os níveis como cards azuis.
3. Renove comparativos/KPIs com rótulos, base, período e variação; diferencie porcentagem de pontos percentuais e realizado de simulação.
4. Em orçamento/projeção, apresente série real sólida e projetada tracejada, legenda explícita, valores completos e status baseado na regra existente. Não transformar previsão em realização.
5. Redesenhe borderô e apresentação de sócios preservando suas diferenças, navegação de detalhes, slides/tela cheia, controles e conteúdo. A visualização operacional pode herdar tokens; o canvas de apresentação deve respeitar proporções próprias.
6. Revise auditoria com tabelas claras, filtros e leitura de eventos; não mascarar campo necessário nem revelar informação protegida.
7. Preserve exportadores PDF/Excel/PPTX existentes. Mudanças de composição que exigirem alterar template de exportação precisam de verificação específica; não misture redesign de tela com reescrita automática dos arquivos exportados.
8. Verifique se relatórios trabalham sobre dados paginados e como seus totais são obtidos. Não prometer consolidação visual além da fonte atual; registrar divergências funcionais fora da fase.

## Invariantes específicos

Regimes, agregações, hierarquias, sinais, cenários e fórmulas são intocáveis. Não somar pais/filhos novamente. Não renomear receita, faturamento, lucro, resultado ou caixa como equivalentes. Não remover camadas de análise para caber num print. Não inserir simulações como fatos.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Comparar snapshots de dados e arquivos exportados em ambiente de teste: valores, linhas, hierarquia e recortes. Testar expandir/recolher, deep links de sócios, toolbar de apresentação, teclado/tela cheia, filtro customizado, sem dados, negativos e valores grandes. Validar modos claro/escuro e proporção do canvas separadamente do layout responsivo. Registrar cada subárea; subdividir a fase se não houver espaço para QA real.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/06-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 07. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 06.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
