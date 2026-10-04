# TODOS OS PROMPTS — MARGIN FOOD • V2

Documento de consulta. Execute uma fase por chat; não tratar esta compilação como ordem para executar tudo de uma vez.

## Mensagem inicial

Quero implementar o Redesign Visual V2 do MARGIN FOOD, meu sistema EMPRESARIAL de gestão para restaurantes, no repositório moralles-filmes/margin-food. Não é meu sistema pessoal.

O pacote está em docs/redesign-margin-food-v2/. Comece lendo:
- PROMPT-MESTRE.md;
- PLANO-DE-FASES.md;
- referencias/MANIFESTO.md;
- prompts/00-auditoria-e-inventario.md.

Leia também CLAUDE.md e AGENTS.md nos nomes reais existentes, a arquitetura, as regras do domínio e o histórico pertinente. Confirme branch/SHA/git status e não sobrescreva alterações anteriores. A documentação antiga em docs/redesign/ é histórico: seus checkmarks NÃO comprovam a execução desta V2.

Quero a sidebar e o seletor de loja no estilo aprovado, o card azul de saldo como variante de destaque e os demais cards claros com as cores semânticas corretas. Evolua os componentes já existentes; não crie um segundo design system. Preserve o tema escuro.

O redesign abrange TODOS os módulos, submódulos, telas, detalhes, formulários, diálogos e estados encontrados no código. Inclui Financeiro inteiro, Estoque, Movimentação Operacional, Inventário, Salmão, Compras/Fornecedores, Centro de CMV, Ficha Técnica, Planejamento, Relatórios Gerais, RH, Central de IA, Usuários, Configurações, Administração e telas auxiliares. A lista deve ser conferida contra navegação, rotas, registry de permissões e componentes reais, e ampliada quando necessário.

Os oito cards do Dashboard Financeiro são obrigatórios: Saldo em Caixa, Contas a Receber, Contas a Pagar, Contas Vencidas, Receita do Período, Despesa Realizada, Despesas Provisionadas e Resultado. Não remover cards, números, filtros, comparativos, cliques nem exportações. Dados das referências nunca podem ser hardcodados no produto.

Mude apresentação, não o negócio. Preserve cálculos, regime, unidades, RPCs, dados, RLS, permissões, company_id, caches, eventos, rotas, estados e confirmações. O seletor de loja deve usar a lista autorizada e o fluxo existente, sem autenticação paralela ou exposição de dados de outra empresa. Não alterar schema, migrations, backend ou dependências por conveniência estética. Não executar escritas reais, push, merge ou deploy. Problemas funcionais encontrados entram em pendências separadas.

Faça UMA fase por chat. Agora execute exclusivamente a FASE 00: inventário completo, diagnóstico atualizado, baseline, riscos, proposta por módulo e matriz de cobertura. Não altere o visual nesta fase.

Nas fases de implementação, valide os componentes reais em navegador, desktop/mobile, claro/escuro, teclado, valores longos, negativos, zero, vazio, loading e erro. Não trate leitura de código como teste executado. Registre limitações e bloqueios, sem enfraquecer segurança para obter acesso.

Ao final de cada fase:
1. Atualize progresso, matriz e decisões, registrando arquivos, testes e evidências reais.
2. Salve um relatório e handoff numerado.
3. Escreva PROXIMO-CHAT.md e MOSTRE NA RESPOSTA o prompt completo para o outro chat executar a próxima fase, com contexto e critérios reais.
4. Se a fase não passou, o próximo prompt será de correção/retomada, não de avanço.
5. PARE, sem implementar a próxima fase automaticamente.

Use checkpoints curtos; não dependa da memória desta conversa. Se o contexto ficar grande, grave o estado antes de usar compactação nativa disponível ou encerrar para outro chat. Não afirme que compactou ou testou sem realmente fazê-lo.

Comece agora pela Fase 00 e entregue os artefatos dela e o prompt pronto para iniciar a Fase 01.

---

# PROMPT MESTRE — MARGIN FOOD • REDESIGN VISUAL V2

Você é o engenheiro responsável por evoluir o frontend do Margin Food com fidelidade às referências aprovadas e sem alterar o funcionamento do produto. Trabalhe no repositório `moralles-filmes/margin-food`.

Este é o sistema EMPRESARIAL de gestão para restaurantes. Não é o aplicativo pessoal do proprietário. Não introduza hábitos, treino, finanças pessoais, cartões de terceiros ou qualquer funcionalidade de outro produto.

## 1. Resultado solicitado e limites

Implantar a identidade visual aprovada no sistema inteiro: sidebar clara, seletor de loja destacado, azul como cor de marca, cards brancos com cores semânticas pontuais, cards azuis de destaque nos locais relevantes, gráficos legíveis, tabelas operacionais organizadas e responsividade real.

O Dashboard Financeiro é a primeira tela funcional de referência, depois das fundações e da sidebar. O trabalho NÃO termina nele. Todos os módulos, submódulos, detalhes, formulários, diálogos, estados e áreas administrativas encontrados no repositório entram no inventário.

Não recriar o app. Não trocar stack, roteador, biblioteca de gráficos, gerenciador de estado, autenticação ou modelo de dados. Não atualizar dependências por conveniência. Evoluir componentes existentes com compatibilidade e migração controlada. Instalação de ferramenta adicional de teste exige justificativa e deve respeitar as permissões do ambiente.

As imagens são referências de aparência. NÃO são fonte de dados, cálculos, permissões, navegação ou funcionalidades. Nunca copiar valores, empresas, datas ou percentuais ilustrativos para o produto.

## 2. Fontes de verdade e preparação de cada chat

Antes de editar:

1. Confirme diretório, repositório, branch, SHA e `git status`. Registre alterações preexistentes; não as reverta, sobrescreva ou inclua inadvertidamente em commits.
2. Leia `CLAUDE.md` e `AGENTS.md` nos nomes reais existentes, além das instruções pertinentes nos diretórios de trabalho. Consulte `docs/ARCHITECTURE.md`, `docs/DOMAIN_RULES.md` e os padrões de segurança quando necessários.
3. Leia este mestre, `PROGRESSO.md`, a parte relevante da `MATRIZ-DE-COBERTURA.md`, `DECISOES.md`, o último handoff e SOMENTE o prompt da fase atual. Não carregar todo o código nem todas as fases por reflexo.
4. Inspecione implementação, imports, consumidores e testes antes de propor alterações. Caminhos deste pacote são pontos de partida, não autorização para presumir que um arquivo ainda existe ou tem a mesma API.
5. Leia as imagens pertinentes diretamente. Se não tiver acesso a uma referência, registre a limitação e solicite o arquivo somente quando bloquear uma decisão de fidelidade.

O repositório tem documentação de um redesign anterior em `docs/redesign/`. Leia-a para entender decisões, mas NÃO reutilize seus checkmarks de conclusão. Esta V2 é uma nova evolução visual. Preserve o histórico; mantenha a documentação nova em `docs/redesign-margin-food-v2/`. Uma restrição visual antiga conflitante, como proibir todo card de fundo colorido, deve ser reconciliada com o destaque azul agora aprovado, sem relaxar segurança ou regras de negócio.

Ordem de decisão: comportamento e invariantes atuais confirmados + instruções deste trabalho; referências aprovadas para aparência; histórico para contexto. Conflitos funcionais exigem registro, não improviso. Divergências de aparência entre os mockups são resolvidas pelo manifesto de referências, não pela escolha arbitrária da imagem mais recente.

## 3. Regras de segurança e não regressão

- Não alterar migrations, schema, RLS, políticas, permissões, contratos de RPC/API, Edge Functions ou cálculos de domínio para atender ao layout. Não executar comandos contra produção, deploy, push, merge ou publicação sem autorização específica.
- Não usar `service_role`, desativar autenticação, forjar perfil ou abrir acesso para obter screenshots. Não remover guards de permissão para simplificar componentes.
- Não imprimir, copiar para relatórios ou versionar segredos, `.env`, tokens, cookies, senhas, conexões privadas ou dados pessoais reais. Evidências devem ser saneadas; usar fixtures sintéticas apenas em testes/demonstrações isoladas.
- Não fazer `git reset --hard`, `git clean`, force-push, limpeza ampla ou exclusão de backups/documentos alheios. Rollback significa reversão seletiva do diff desta fase, não restauração destrutiva do projeto.
- Preservar `company_id`, escopo da empresa, chaves de cache, eventos, Realtime, subscriptions, invalidações e fluxo de troca de unidade. Não adicionar filtragem apenas no cliente como substituto de autorização.
- Preservar IDs, `TabId`, abas persistidas, rotas especiais e deep links. Não assumir que toda navegação é rota nem que nenhuma rota especial existe. Consultar a implementação atual.
- Preservar paginação, ordenação, buscas, filtros, ações em lote, exportações, confirmações, validações, guards de formulário sujo, concorrência e feedback de erro.
- Não executar pagamentos, transferências, envio de mensagens, finalização de inventário, aprovação, exclusão ou outras escritas reais para validar estética. Testes de escrita somente em ambiente isolado autorizado.
- Não corrigir problemas de negócio incidentalmente. Registre em `PENDENCIAS-FUNCIONAIS.md`, com evidência e impacto. Se o problema impedir uma entrega segura, bloqueie a etapa afetada e peça decisão; não esconda nem enfraqueça a regra.
- Sem dados disponíveis não significa zero. Mantenha a distinção entre zero real, campo ausente, erro, carregamento, sem permissão, dado parcial e base de comparação inexistente. Preserve as regras atuais; divergências preexistentes são pendências separadas.

## 4. Cobertura obrigatória e execução em fases

Execute UMA fase por chat, iniciando na Fase 00. Não implemente a seguinte automaticamente. O plano detalhado está em `PLANO-DE-FASES.md` e cada fase tem seu próprio prompt em `prompts/`.

A Fase 00 deve cruzar sidebar, `pages/Index.tsx`, roteamento, registro de permissões, componentes carregados sob demanda e navegações internas. Inventarie também as telas ocultas para o perfil atual, SEM obter acesso indevido a elas. A matriz deve conter: módulo, submódulo, tela/estado, caminho real, cards/gráficos, interações, permissões, fonte de dados, fase, status e evidências.

Cobertura mínima: estrutura global; Financeiro inteiro; Relatórios Gerais; Dashboard/Controle de Salmão; Controle de Estoque; Movimentação Operacional; Inventário Geral; Compras e Fornecedores; Centro de CMV; Ficha Técnica; Planejamento; RH; Central de IA; Usuários; Configurações; Administração; telas de acesso e auxiliares. O Centro de CMV e o CMV Financeiro permanecem distintos.

Descobriu tela adicional? Inclua na matriz e atribua uma fase antes de declarar cobertura. Descobriu fase extensa? Divida em subfases com identificadores estáveis e atualize plano, progresso e handoff. Não comprima várias implementações arriscadas no fim do chat. Não deixe a descoberta de módulos para a auditoria final.

Uma tela pode ser mantida sem alteração somente depois de revisão e justificativa objetiva de aderência ao novo padrão. Atualizar uma primitiva não comprova que todos os consumidores foram revisados.

## 5. Identidade visual aprovada

### Superfícies, tipografia e ritmo

Use as imagens do manifesto: fundo branco/cinza-azulado muito claro, texto azul-marinho, azul vivo nas ações, sombras suaves, bordas discretas, espaços consistentes e ícones Lucide ou os já padronizados no projeto.

Evolua tokens HSL e mapeamentos Tailwind existentes em vez de espalhar valores literais. Cores de partida propostas, não números obrigatórios: marca próxima de `#2563EB`, superfície suave próxima de `#F5F8FF`, card branco e texto principal próximo de `#172B4D`. Amostre a referência e ajuste o necessário para contraste. Defina equivalentes do tema escuro; não force fundo branco quando o usuário usa dark mode.

Prefira a fonte sans já disponível no projeto, com sistema como fallback. Não importar fontes proprietárias ou adicionar várias fontes externas. Hierarquia sugerida: título 24–30 px no desktop e 22–26 px no celular; texto operacional 14–16 px; apoio 12–14 px; valores em `tabular-nums`, com tamanho proporcional ao espaço. Números nunca menores apenas para esconder problemas de grid.

Raio sugerido: 16–20 px para cards de resumo, 10–12 px para controles; espaçamento em passos coerentes de 4/8 px. A aparência deve se aproximar das referências sem transformar telas densas em enormes cartões vazios. Não alterar globalmente todos os raios/alturas sem revisar os consumidores.

### Família de cards — separar aparência de significado

1. Destaque azul: fundo azul/gradiente discreto, valor branco, ícone em quadrado translúcido, arcos decorativos leves no canto, título e descrição legíveis. Usar no Saldo em Caixa e em saldos de contas ou indicadores principais pertinentes. Em geral, um destaque por grupo; uma grade de contas pode repetir o padrão porque as contas têm o mesmo papel.
2. Card padrão: superfície clara, título e valor bem hierarquizados, ícone com tint suave, comparativo e explicação preservados. Não pintar tudo de azul.
3. Card semântico: verde, âmbar, vermelho ou neutro em ícone, texto, badge ou borda suave conforme o significado existente. Cor não é o único sinal; use rótulo/ícone/direção.

Proponha uma propriedade visual opt-in, por exemplo `appearance`, separada da variante semântica existente, sem impor esse nome se a arquitetura já resolver o caso. Preserve `variant`, `delta`, `sub`, `onClick`, acessibilidade e os contratos atuais. Não fazer todos os consumidores de `primary` virarem cards azuis.

O azul representa destaque, não lucro. Um saldo negativo num card azul precisa manter sinal e identificação inequívoca; estado crítico pode exigir aparência semântica. Custos absolutos maiores não implicam automaticamente pior desempenho. Não modificar a regra de interpretação existente por estética.

Valores devem usar os formatadores canônicos: moeda, sinal negativo, casas decimais, unidades, porcentagem e pontos percentuais. Não truncar dinheiro com reticências, não remover centavos nos cards e não quebrar os dígitos ao meio. Quando faltar espaço, reorganize a grade. Arcos decorativos devem ficar atrás do conteúdo, sem capturar eventos, sem anúncio ao leitor de tela e sem reduzir contraste.

### Sidebar e seletor de loja

Reproduza o estilo do recorte aprovado: marca no alto, bloco destacado de loja/empresa logo abaixo, seções legíveis, ícones finos, item ativo azul arredondado e conta do usuário no rodapé.

Preserve módulos, ordem e agrupamentos atuais por padrão. Não remova entradas duplicadas de Salmão nem mude seus destinos sem verificar a intenção existente. O estado ativo deve refletir a navegação real. Não trocar os nomes do produto ou das empresas por textos de demonstração.

Preserve recolhimento, redimensionamento, largura persistida, tooltips, badges e comportamento mobile existente. Referência de largura expandida: aproximadamente 240–260 px, sem descartar preferência de largura salva.

O seletor deve reutilizar `CompanySelector`, `accessibleCompanies`, `activeCompanyId` e `setActiveCompany` ou seus equivalentes reais. Aparência de cartão, nome atual, linha secundária somente se houver informação real, chevron, seleção marcada e busca local na lista JÁ autorizada quando ela for grande. Empresa e unidade não devem virar dois níveis fictícios do modelo.

Uma única loja: bloco informativo coerente, sem menu de troca falso. Múltiplas lojas: seleção por teclado e toque, nome completo acessível e lista com scroll. Loading/erro da troca não podem mostrar cabeçalho de B com valores de A. Testar A → B → A, cliques rápidos, falha e permissões diferentes. Preservar a proteção de formulário sujo. Não criar fluxo de autenticação paralelo.

### Gráficos

Evolua `chartTheme.ts`, `ChartCard`, `ChartTooltip`, `ChartLegend` e wrappers existentes. Não criar outro tema concorrente nem trocar Recharts por outra biblioteca apenas pelo visual.

Use molduras consistentes, títulos claros, período/unidade visíveis, áreas de plotagem com altura adequada, margem para eixos e legendas que reorganizam. Para rankings com nomes longos, preferir barras horizontais ou lista com barra. Composição pode usar donut com legenda externa; evolução temporal pode usar linha, área ou barras conforme a pergunta.

Mantenha granularidade, ordem temporal, filtros e agregações atuais. Nada de suavizar linhas de modo enganoso, omitir negativos, inventar histórico ou remover séries para melhorar a estética. Barras quantitativas devem ter base adequada, em geral zero; dados negativos não podem sumir. Nulo não vira zero e não se conecta através de lacunas sem explicação.

Séries categóricas precisam de cores distinguíveis e associação estável; não usar oito azuis quase iguais. Uma única série/ranking pode usar azul com destaque pontual. Receitas/despesas/status devem preservar semântica. Realizado e projetado precisam também de traço sólido/tracejado e legenda, não apenas cores.

Dinheiro e percentual usam eixos separados explicitamente identificados quando coexistirem. R$ e centavos não podem ser confundidos. Tooltip mostra o valor completo; eixo pode usar abreviação documentada. Percentual de participação no total, percentual do Top N e percentual sobre faturamento são denominadores diferentes. Não substituir um pelo outro.

Top N não é o total da base. Não somar pais e filhos hierárquicos duas vezes. Não transformar uma amostra paginada em indicador consolidado. Se um mockup exibir informação sem fonte confiável no sistema, não implementá-la como dado real.

Tooltip deve funcionar no contexto de toque e teclado quando aplicável; oferecer resumo ou tabela equivalente para dados importantes. Não colocar toda a informação relevante exclusivamente no hover. Testar 1 ponto, zero, negativos, grandes valores, nomes extensos, muitas séries, ausência de dados e erro.

### Tabelas, formulários e estados

Filtros alinhados; ação principal clara; busca e filtros existentes preservados; cabeçalhos legíveis; colunas numéricas à direita; status com texto; ações de linha acessíveis e área de toque suficiente. Não ocultar botão essencial apenas no hover.

Diálogos e sheets devem caber na tela, ter rolagem interna quando necessária, foco correto, botão de fechar acessível e validações próximas do campo. Não mudar payloads, máscaras, parse de moeda/data, IDs, nomes técnicos ou regras de gravação.

Padronizar skeleton, vazio, erro com retry, carregamento parcial, atualização, indisponibilidade e sem permissão. Um skeleton não deve fazer a página saltar radicalmente. Não usar dados fictícios como fallback de produção.

## 6. Regras específicas do Dashboard Financeiro

Preservar exatamente os oito indicadores existentes: Saldo em Caixa; Contas a Receber; Contas a Pagar; Contas Vencidas; Receita do Período; Despesa Realizada; Despesas Provisionadas; Resultado.

Desktop: duas linhas de quatro, organizadas em Posição Financeira e Desempenho do Período. O saldo recebe o destaque azul. Mobile: duas colunas quando os valores completos couberem; uma coluna nas larguras em que seja necessário. Nunca esconder cards em carrossel, menu, aba alternativa ou sob um botão de expansão para imitar o print.

Preservar RPC, parâmetros, cálculos, filtros Dia/Mês/Período, Atualizar, PDF/Excel, comparativos e navegações dos cards. A composição hoje observada de Despesas Provisionadas é despesa realizada + contas a pagar; confirme no código atual, explique-a visualmente, mas não reescreva a regra contábil nem some novamente esse total aos seus componentes.

Receitas vs Despesas, Resultado Mensal e despesas por categoria permanecem disponíveis. A lista/ranking proposta pode substituir a representação da pizza, não a fonte nem o conteúdo. Preservar a distinção entre período do resumo e janela histórica dos gráficos; torná-la clara em vez de sincronizar silenciosamente os dois filtros.

Resultado negativo continua negativo e perceptível. Zero vencido não pode parecer erro por decoração. Comparação com período parcial precisa ser identificada quando for possível determiná-lo pela lógica existente; não inventar fechamento concluído. Todos os números das referências são exemplos ou retratos anteriores, não valores fixos.

## 7. Responsividade, acessibilidade e desempenho

Validar pelo menos larguras de 320, 390, 768, 1024, 1366 e 1920 CSS px, incluindo sidebar expandida/recolhida/redimensionada, tema claro/escuro e zoom. Usar os breakpoints do projeto como ponto de partida, mas considerar a largura real do conteúdo. Em 320 px, aceitar uma coluna de cards em vez de texto ilegível.

Sem scroll horizontal da página para o layout comum. Tabelas/matrizes que realmente precisem de duas dimensões podem ter rolagem localizada e identificada. Não colocar `overflow:hidden` no body para mascarar cortes. Testar menus/tooltip nos extremos da viewport, teclado virtual, orientação e barras fixas cobrindo ações.

Meta de qualidade: contraste de texto normal pelo menos 4,5:1; texto grande pelo menos 3:1; controles/elementos gráficos essenciais pelo menos 3:1 onde o critério se aplica. Validar no fundo real, inclusive gradiente. Não declarar conformidade completa WCAG apenas com essas checagens. Ver fontes W3C em `FONTES-E-LIMITES.md`.

Foco visível, nomes acessíveis, sem botões aninhados, navegação por teclado, fechamento e retorno de foco, estado selecionado não dependente só de cor. Respeitar `prefers-reduced-motion`. Meta interna de área de toque para ações principais no mobile: 44 × 44 CSS px quando viável; isso não é apresentado como o mínimo universal de WCAG.

Não adicionar novas consultas por card, subscriptions duplicadas, imagens decorativas pesadas, animação contínua ou renderização custosa sem necessidade. Preservar carregamento sob demanda. Comparar rede, tamanho de bundle e tempos com baseline equivalente. Não inventar ganho de performance.

## 8. Validação e critérios de conclusão

Antes/depois deve usar mesma empresa de teste, perfil, filtros, período e conjunto de dados. Preferir fixtures determinísticas ligadas aos componentes reais em ambiente de teste isolado. Uma página estática montada só para ficar bonita NÃO valida o sistema real.

Em cada fase: executar os comandos reais do `package.json`, typecheck, lint, testes pertinentes e build conforme aplicável; registrar comando, resultado e limitações. Não assumir que `tsc --noEmit` sozinho cobre todo projeto sem inspecionar os tsconfigs. Nunca declarar execução de testes apenas por ler código.

Verificar fidelidade em navegador: sidebar, cards, fontes, espaçamentos, cores, gráficos, tabelas, estados e interações. Screenshots de antes/depois precisam vir dos componentes reais. Falta de navegador, login ou dados deve ser registrada como bloqueio da validação afetada. Não marcar a fase como validada por inspeção de classes CSS.

Não aceitar novas regressões de segurança, navegação, cálculos, dados, acessibilidade ou responsividade. Falhas preexistentes devem ser distinguidas de novas; falhas críticas relevantes impedem liberação. Não desativar testes nem regras de lint para obter verde. Fotos/snapshots não devem ser atualizados cegamente para aceitar uma regressão.

Critério final: 100% das telas inventariadas com decisão explícita; nenhuma pendência crítica; referências aplicadas onde pertinentes; dados e fluxos preservados; testes executados e limitações documentadas. Se existir parte bloqueada, a conclusão deve dizer isso claramente e não anunciar redesign integralmente validado.

## 9. Controle de contexto e entrega para o próximo chat

Use documentação curta e verificável. Mantenha `PROGRESSO.md`, `MATRIZ-DE-COBERTURA.md`, `DECISOES.md` e o relatório da fase atual. Preserve decisões importantes em `CLAUDE.md`/`AGENTS.md` conforme a convenção real, com ambos coerentes/idênticos quando exigido pelo projeto, sem inflar esses arquivos com logs.

Quando o contexto crescer ou houver perda de precisão, grave um checkpoint antes de prosseguir. Use compactação nativa somente se a ferramenta realmente oferecer esse recurso. Se não oferecer, entregue handoff e peça novo chat; nunca afirme que compactou sem ter feito.

Ao finalizar cada fase:

- Descreva o que mudou e o que foi preservado, arquivos exatos, testes, evidências e pendências.
- Registre branch, SHA base e final se houver commit, ou estado de diff se ainda não houver. Não invente hash ou commit.
- Atualize a matriz com estados precisos: não analisado, analisado, implementado, validado, mantido com justificativa, bloqueado.
- Grave um handoff numerado em `handoffs/` e o prompt pronto em `PROXIMO-CHAT.md`.
- Mostre na resposta o prompt completo para o próximo chat, com objetivo, escopo, arquivos de leitura, referências, decisões vigentes, bloqueios e critérios da fase seguinte. Não basta dizer “continue o plano”.
- Se a fase não passou nos gates, o próximo prompt é de CORREÇÃO/RETOMADA da fase atual, não de avanço.
- PARE. Não execute a fase seguinte no mesmo chat.

## 10. Ação inicial

Comece exclusivamente pela Fase 00: diagnóstico atualizado, inventário completo, baseline, priorização e planejamento. A análise deve resultar em arquivos úteis e um prompt pronto para a Fase 01; não apenas em uma descrição abstrata. As fases posteriores devem implementar e validar, não repetir uma auditoria genérica indefinidamente.

---

# Plano de fases — Margin Food • V2

Este é o roteiro de execução, não um relatório de trabalho concluído. Todas as fases começam **não iniciadas**. O Claude deve ajustar subdivisões após a Fase 00, preservando cobertura e identificadores rastreáveis.

O caminho até o primeiro dashboard é 00 → 01 → 02 → 03. As demais fases propagam a identidade a TODO o sistema. Não executar o prompt 03 isoladamente antes de confirmar as fundações.

| Fase | Escopo | Prompt | Estado inicial |
|---|---|---|---|
| 00 | Auditoria, cobertura e baseline | [Abrir](prompts/00-auditoria-e-inventario.md) | Não iniciada |
| 01 | Fundação visual, cards e gráficos compartilhados | [Abrir](prompts/01-fundacao-cards-e-graficos.md) | Não iniciada |
| 02 | Sidebar, cabeçalho, seletor de loja e navegação | [Abrir](prompts/02-sidebar-e-seletor-de-loja.md) | Não iniciada |
| 03 | Dashboard Financeiro completo | [Abrir](prompts/03-dashboard-financeiro.md) | Não iniciada |
| 04 | Contas bancárias, lançamentos, conciliação e fluxo | [Abrir](prompts/04-contas-bancarias-e-movimentacao-financeira.md) | Não iniciada |
| 05 | Contas a pagar/receber, códigos, caixa e cadastros | [Abrir](prompts/05-operacoes-e-cadastros-financeiros.md) | Não iniciada |
| 06 | DRE/DFC, análises e apresentação de sócios | [Abrir](prompts/06-analises-e-relatorios-financeiros.md) | Não iniciada |
| 07 | CMV Financeiro | [Abrir](prompts/07-cmv-financeiro.md) | Não iniciada |
| 08 | Controle de Estoque e análises de estoque | [Abrir](prompts/08-controle-de-estoque.md) | Não iniciada |
| 09 | Movimentação Operacional e Inventário Geral | [Abrir](prompts/09-movimentacao-e-inventario.md) | Não iniciada |
| 10 | Dashboard e Controle de Salmão | [Abrir](prompts/10-salmao.md) | Não iniciada |
| 11 | Compras, cotações e fornecedores | [Abrir](prompts/11-compras-e-fornecedores.md) | Não iniciada |
| 12 | Centro de CMV e Ficha Técnica | [Abrir](prompts/12-centro-cmv-e-ficha-tecnica.md) | Não iniciada |
| 13 | Planejamento e Relatórios Gerais | [Abrir](prompts/13-planejamento-e-relatorios-gerais.md) | Não iniciada |
| 14 | RH / Pessoas | [Abrir](prompts/14-rh-pessoas.md) | Não iniciada |
| 15 | Central de IA | [Abrir](prompts/15-central-ia.md) | Não iniciada |
| 16 | Usuários, Configurações, Administração e auxiliares | [Abrir](prompts/16-administracao-e-telas-auxiliares.md) | Não iniciada |
| 17 | QA integrado, cobertura total e entrega | [Abrir](prompts/17-qa-integrado-e-fechamento.md) | Não iniciada |

## Regras de divisão

Uma fase extensa pode virar 05A/05B, 06A/06B etc. Cada subfase tem escopo pequeno, validação e handoff próprios. Atualizar a matriz antes de avançar. “Mesmo componente base” não elimina revisão de consumidor. A auditoria final não é local para descobrir que um módulo inteiro ficou sem responsável.

Um bloqueio funcional de uma área não autoriza remover a área. Documentar e pedir decisão. Trabalho independente em outra área só pode avançar com dependências explicitadas, sem marcar a bloqueada como concluída.

---

# PROMPT — FASE 00 • Auditoria, cobertura e baseline

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Levantar o estado real do Margin Food, definir a implementação da identidade aprovada e distribuir TODAS as telas entre as fases. Esta etapa produz documentação e evidências, sem alterar o visual ou o negócio.

## Leitura dirigida

Inspecione `CLAUDE.md`, `AGENTS.md`, `package.json`, lockfiles, tsconfigs, `src/pages/Index.tsx`, `src/App.tsx`, `src/components/AppLayout.tsx`, `src/components/FinanceiroView.tsx`, `src/permissions/registry` e os componentes referenciados. Confirme caminhos existentes. Leia o histórico de `docs/redesign/` sem herdar seus estados de conclusão. Confira `CompanySelector`, `KpiCard`, tema, wrappers de gráficos e documentação do domínio.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Todas as referências, começando pelos recortes `00-card-azul-aprovado.png` e `00-sidebar-aprovada.png`; manifesto com prioridade.

## Implementação / entregáveis

1. Faça uma varredura da árvore de componentes, rotas, abas, registry, imports lazy e navegações internas. Deduplique aliases que apontam para a mesma tela, mas preserve os diferentes caminhos de acesso na matriz.
2. Crie `MATRIZ-DE-COBERTURA.md` com linhas por tela e por estado relevante: principal, detalhe, modal, formulário, empty/error/loading e mobile. Classifique tabelas, cards, gráficos e dependências compartilhadas.
3. Registre para cada indicador rótulo, significado, fonte, unidade, filtros, nulidade, clique e permissão. Faça um inventário de gráficos com tipo, eixos, unidades, denominadores, legenda, tooltip e pontos de overflow a testar.
4. Identifique todas as áreas de Financeiro, Estoque, Salmão, Operação/Inventário, Compras/Fornecedores, CMVs, Ficha Técnica, Planejamento, Relatórios, RH, IA, usuários/configurações/admin e acesso. Inclua superfícies fora da sidebar.
5. Compare as referências com o estado real. Para cada módulo proponha mudanças concretas de layout, cards, gráficos e operações. Diferencie problema confirmado em navegador de suspeita por leitura de código.
6. Capture baseline de testes/build, tema claro/escuro, perfis de teste disponíveis, viewports, rede e bundle. Use ambiente isolado autorizado. Sem ambiente, documente o bloqueio com o procedimento necessário.
7. Crie `PLANO-DE-FASES.md`, `PROGRESSO.md`, `DECISOES.md`, `PENDENCIAS-FUNCIONAIS.md` e relatório `fases/00-RELATORIO.md` a partir dos templates. Preserve os prompts originais deste pacote.
8. Defina a primeira migração opt-in e como validar consumidores antigos das primitivas. Registre a estratégia de rollback seletivo e os critérios de aceitação visual.
9. Atribua fase a cada tela descoberta. Subdivida as etapas grandes sem perder escopo. Registre a lista de referências e divergências de mockups.

## Invariantes específicos

Não mudar CSS, JSX, dependências, dados ou configuração de produção nesta fase. Não chamar algo de bug confirmado apenas porque parece suspeito. Não confundir um redesign histórico concluído com execução desta V2. Não depender exclusivamente dos módulos visíveis ao perfil logado para inventariar o sistema.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Demonstre como o inventário cruza registry, navegação e renderização. Todos os módulos encontrados precisam de responsável/fase. Os oito cards financeiros e seus contratos devem estar descritos. Registre comandos realmente executados e falhas de baseline. Aponte exatamente os acessos que faltam para QA; não os contorne.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/00-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 01. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 00.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 01 • Fundação visual, cards e gráficos compartilhados

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Criar a base reutilizável da identidade V2, mantendo compatibilidade e sem migrar indiscriminadamente todos os módulos.

## Leitura dirigida

Leia os consumidores atuais de `src/components/ui/KpiCard.tsx`, `card.tsx`, `button.tsx`, `PageHeader`, `FilterBar`, `SegmentedControl`, `ChartCard`, `ChartTooltip`, `ChartLegend`, `ui/chart.tsx`, `src/lib/chartTheme.ts`, `src/index.css` e `tailwind.config.ts`. Verifique o componente específico de cards do CMV Financeiro antes de decidir abstrações.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `00-card-azul-aprovado.png`, `07-sidebar-e-componentes.png`, `01-dashboard-financeiro.png`.

## Implementação / entregáveis

1. Formalize tokens de superfície, borda, texto, marca, destaque, semântica, sombra, raio e tipografia nos dois temas. Não criar um segundo arquivo global de tema desconectado do existente.
2. Adicione a aparência azul de destaque como opção explícita compatível com a API do KPI, sem reinterpretar a variante `primary` de todos os consumidores. Separe tom do indicador, tom do delta e aparência.
3. Implemente decorações leves com CSS/SVG local, ícone translúcido, valor e textos brancos com contraste. Não usar um PNG do card como interface.
4. Harmonize o card branco e os estados semânticos, preservando `sub`, `delta`, acessibilidade e onClick. Permita valores longos, sinal negativo, várias linhas de apoio e conteúdo especializado sem forçar perda de informações.
5. Evolua a moldura dos gráficos, título/subtítulo, área de ações, legenda, skeleton, empty/error e tooltip. Preserve cores categóricas distinguíveis e tokens de projeção tracejada.
6. Padronize em componentes existentes botões, campos, badges, filtros e cabeçalhos. Faça mudanças globais somente após mapear impacto; preferir variante opt-in para alterações ainda não testadas.
7. Crie uma página de demonstração apenas no ambiente de desenvolvimento/teste ou aproveite o catálogo já existente. Ela serve para testar as primitivas, não vira um módulo público.
8. Registre contratos, exemplos de uso e critérios para escolher destaque versus card padrão em `DECISOES.md`. Migre somente exemplos e superfícies necessárias à validação desta fundação.

## Invariantes específicos

Não introduzir dados reais em demos, SDK novo, fonte proprietária, biblioteca de ícones concorrente nem gráfico novo sem necessidade. Componentes especializados podem continuar especializados. Não retirar contraste de alertas em nome do azul. Não transformar todo card em botão nem aninhar controles interativos.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar APIs antigas e novas, teclado, foco, valor negativo, zero, nulo conforme contrato, R$ 123.456.789,12 como fixture, rótulo longo e 320 px. Testar temas claro/escuro, preferência de movimento reduzido, tooltip/legenda com muitas séries e consumidor legado não migrado. Medir contraste na região mais clara do gradiente. O catálogo isolado não substitui smoke tests dos consumidores reais.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/01-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 02. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 01.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 02 • Sidebar, cabeçalho, seletor de loja e navegação

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Aplicar a sidebar aprovada e tornar a troca de loja visualmente clara, mantendo exatamente os contratos de acesso e navegação existentes.

## Leitura dirigida

Leia `AppLayout.tsx`, `CompanySelector.tsx`, `AuthContext`, `CompanyScopeContext`, seleção de empresas, `useTheme`, `ModuleBadgesContext`, `pages/Index.tsx`, `ModuleNav`, `SubmoduleSwitcher` e persistência das abas/largura. Identifique se já há proteção de formulário sujo na troca de escopo.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `00-sidebar-aprovada.png`, `07-sidebar-e-componentes.png`, `01-dashboard-financeiro.png`.

## Implementação / entregáveis

1. Reproduza a sidebar clara: marca existente, cartão de loja abaixo da marca, seções com espaçamento, ícones alinhados, item ativo azul arredondado e perfil no rodapé.
2. Preserve todo o mapa de navegação. Mantenha a ordem inicial, labels e destinos, incluindo os acessos de Salmão que possam compartilhar TabId. Não redesenhar a informação removendo funcionalidades.
3. Dê aparência de cartão ao seletor com nome real, ícone e chevron. A linha secundária deve refletir dado existente ou estado neutro, sem inventar uma relação empresa/filial.
4. Para múltiplas lojas, permita busca somente sobre as já autorizadas, marca de selecionada, navegação por teclado e área rolável. Para uma loja, mostrar estado informativo, sem ação de troca inexistente.
5. Reutilize o fluxo assíncrono de seleção. Exiba loading/erro de modo consistente, não duplique requests nem subscriptions. Valide nomes/dados sincronizados e prevenção de clique repetido.
6. Preserve collapse, resize, largura persistida, badges e tooltips. Na sidebar recolhida, garantir identificação do módulo e da unidade. No celular, drawer com overlay, scroll e foco correto.
7. Harmonize cabeçalho, navegação contextual e seletores de submódulos com o visual aprovado, sem alterar a lógica de autorização e resolução de aba.
8. Preserve notificações, tema, offline, ações de conta e demais elementos já existentes. Não acrescentar busca global fictícia somente porque aparece numa colagem.

## Invariantes específicos

Permissões devem estar prontas antes de mostrar itens protegidos. Nunca listar empresas não autorizadas. Não trocar `setActiveCompany` por um estado local apenas visual. Não manipular diretamente company_id no componente. Erro de isolamento encontrado bloqueia entrega segura e exige correção separada aprovada, não desativação do teste.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar uma/muitas/nenhuma empresa autorizada conforme estados suportados, nomes longos, pesquisa sem resultado, troca A → B → A, troca rápida, falha, perfil com menos permissões e formulário sujo. Verificar rede/escopo, badges e ausência de flash de dados da empresa anterior. Testar sidebar em 160–480 px se esse intervalo ainda for suportado, largura salva, collapse, teclado, dark e mobile. Comparar o recorte aprovado e o resultado real lado a lado.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/02-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 03. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 02.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 03 • Dashboard Financeiro completo

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Implementar a tela financeira aprovada, preservando os oito indicadores, os cálculos, as ações e os três conjuntos de análises existentes.

## Leitura dirigida

Leia `DashboardFinanceiroSection.tsx`, `DashboardCharts.tsx`, `FinanceiroView.tsx`, `KpiCard`, formatadores, função de variação, callbacks de navegação e testes atuais. Consulte o contrato das RPCs apenas para compreender a semântica; não o altere.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `01-dashboard-financeiro.png`, `01b-dashboard-detalhamento.png`, `01c-dashboard-mobile.png`, `00-card-azul-aprovado.png`.

## Implementação / entregáveis

1. Reorganize o cabeçalho: título, descrição, filtros Dia/Mês/Período, seleção de data, Atualizar e exportações PDF/Excel. Todos continuam ligados aos handlers e permissões existentes.
2. Agrupe Posição Financeira: Saldo em Caixa; Contas a Receber; Contas a Pagar; Contas Vencidas. Agrupe Desempenho do Período: Receita do Período; Despesa Realizada; Despesas Provisionadas; Resultado.
3. Use duas linhas de quatro no desktop, responsivas à largura real do conteúdo. Preserve ordem e todos os indicadores no mobile, em duas colunas quando couberem e uma quando necessário. Não usar carrossel.
4. Aplique o card azul ao saldo e cards claros com semântica aos demais. Números, sinal, centavos, quantidade de vencidos, descrições e comparativos devem permanecer completos. Não fazer vencido zero parecer ocorrência crítica ativa.
5. Preserve clique e destino de cada indicador: saldo/fluxo; receber/status; pagar; vencidas/status; receita/despesa com tipo e período; provisionadas; resultado/DRE, conforme mapeamento confirmado no código. Não prometer filtro que o destino não recebe.
6. Renove Receitas vs Despesas e Resultado Mensal com eixos, legenda, espaço e tooltip consistentes. A janela histórica mantém sua semântica separada do período do resumo. Identifique cada intervalo claramente.
7. Apresente Despesas por Categoria preferencialmente como ranking horizontal com valor completo e nome acessível, usando a mesma fonte e recorte. Se o percentual for calculado sobre o Top 8 recebido, rotule “participação no Top 8”. Não exibir esse subtotal como a despesa realizada total.
8. Acrescente a explicação visual de despesas provisionadas usando somente os dados já carregados e a fórmula confirmada. Não tratar esse total como terceira despesa somável a realizada e a pagar.
9. Atalhos para submódulos existentes podem ser adicionados desde que usem o fluxo real, respeitem permissões e não façam consulta nova. Não criar módulos, últimas transações ou metas fictícias para preencher o layout.
10. Preserve loading, atualização por eventos, erro, sem acesso, exportando e estados vazios. Período em andamento pode ganhar aviso informativo derivado do recorte real; não mudar comparativos por conta própria.
11. Capture versões desktop, detalhamento e mobile. Compare com as imagens específicas do dashboard, não com os valores diferentes da colagem inspiracional.

## Invariantes específicos

Nenhum dos oito cards pode ser removido, renomeado para mudar significado, ocultado no mobile ou substituído por “resumo”. Não hardcodar os valores R$ 87.519,20 etc. Não sincronizar silenciosamente filtros com semânticas distintas. Não alterar fórmulas, regime, RPC ou exportação para adequar o desenho. Não atribuir resultado do dashboard e resultado de DRE como idênticos sem verificar seus contratos.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Com mesma fixture/empresa/filtro, verificar igualdade dos oito valores antes/depois, inclusive resultado negativo e provisionadas. Testar Dia, Mês, intervalo customizado, datas inválidas, Atualizar e todos os cliques. Comparar conteúdo e permissões de PDF/Excel. Validar card com valor grande, nomes longos, zero, ausência de comparação, erro e loading; gráfico com ponto único e série negativa; categorias cujo Top 8 não corresponde ao total. Testar seis larguras, zoom, temas e sidebar redimensionada. Falha de navegação preexistente deve ser evidenciada separadamente, não escondida.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/03-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 04. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 03.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 04 • Contas bancárias, lançamentos, conciliação e fluxo

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Levar o padrão aprovado aos saldos de contas e às telas de movimentação financeira, com clareza entre posição de saldo, extrato e conciliação.

## Leitura dirigida

Leia `financeiro/ContasBancariasSection.tsx`, `LivroRazaoSection.tsx`, `ConciliacaoBancariaSection.tsx`, `FluxoCaixaSection.tsx`, integração com FinanceiroView, consulta de saldo e `loadSaldoExtrato` ou equivalentes atuais. Inspecione formulários, máscaras, permissões e controles de edição.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `02-contas-bancarias.png`, `00-card-azul-aprovado.png`, `07-sidebar-e-componentes.png`.

## Implementação / entregáveis

1. Redesenhe os cards de contas com a família azul aprovada onde pertinente: nome, tipo, saldo, informações existentes, status e ações. A grade pode ter múltiplos cards azuis de mesmo papel, sem esconder saldo negativo.
2. Distinga saldo atual do sistema, saldo inicial, saldo do extrato e saldo na data de referência quando esses dados existirem. Rótulo e data devem estar próximos do valor.
3. Preserve a leitura do extrato por conta, pesquisa, filtro por tipo, criação/edição e exportação. Ações administrativas não podem competir visualmente com o saldo.
4. Organize o Livro Razão e lançamentos com filtros claros, valores alinhados, identificação de receita/despesa, detalhes acessíveis e ações existentes.
5. Harmonize conciliação e importação: estados, tabelas de correspondência/divergência, etapas e prévias. Não executar confirmação ou conciliação real para testar.
6. Refaça molduras, filtros e tabelas do fluxo de caixa mantendo saldo inicial/final, períodos, ordenação e navegação.
7. Preserve unidades e datas de referência. Se houver resumo agregado no mockup sem fonte confiável, não somar apenas as contas visíveis/paginadas como total geral.
8. Revise desktop/mobile, dark e modais de cadastro; conserve guard de alterações não salvas e concorrência.

## Invariantes específicos

Comparar banco e sistema na mesma data, conforme regra já existente. Não trocar saldo calculado por saldo inicial nem chamar de “disponível” um valor com semântica diferente. Não modificar importadores, matching, transações, atualização de saldo, permissões ou payloads. Sem pagamentos/transferências reais.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Fixture com conta positiva, negativa, zerada, nome longo, caixa físico e saldo de referência histórica. Validar abrir extrato com conta correta, busca/filtros, modais, erros de importação e actions existentes em ambiente isolado. Comparar saldos e filtros antes/depois; testar acesso restrito à conciliação, teclado e mobile.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/04-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 05. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 04.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 05 • Contas a pagar/receber, códigos, caixa e cadastros

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Padronizar as operações e cadastros restantes do Financeiro sem perder campos, filtros, rateios, comprovantes e ações.

## Leitura dirigida

Leia ContasPagarSection, ContasReceberSection, CodigosPagamentoSection, FechamentoCaixaSection, AlertasSection, RecorrenciasSection, CategorizacaoSection, CadastroBaseTree, PlanoContasFinSection, CentrosCustoFinSection e todos os diálogos/subcomponentes realmente ligados a essas telas. Divida a fase em subfases quando necessário.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Família visual de `01-dashboard-financeiro.png`, `07-sidebar-e-componentes.png`; `90-colagem-inspiracao.png` apenas para acabamento, nunca para regra ou dados.

## Implementação / entregáveis

1. Revise contas a pagar/receber: resumo, busca, status, períodos, fornecedor/cliente, categoria, vencimento e ações existentes. Diferencie valor previsto, quitado e em aberto somente segundo as fontes atuais.
2. Organize formulário de boleto por seções legíveis, mantendo campos obrigatórios, competência, vencimento, categorias/rateio e vínculo com CMV. Não eliminar seleção por linha de rateio para simplificar o visual.
3. Em códigos de pagamento, exiba resumo e ação de copiar clara, feedback e estados inválidos/vazios. O conteúdo copiado deve ser exatamente o código/PIX original, mesmo se a apresentação visual agrupar caracteres.
4. Refaça fechamento de caixa com números, unidades, período, meios de pagamento e estados bem apresentados. Atualize gráficos sem mudar cálculo nem origem do faturamento.
5. Melhore alertas e recorrências com prioridade, calendário/lista e estado de próxima ocorrência somente quando já existirem. Não alterar geração, agenda, notificações ou automatizações.
6. Reorganize categorização, árvore de categorias, plano de contas e centros de custo preservando hierarquia, vínculos, edição e permissões.
7. Preserve anexos, máscaras, ações em lote, paginação, filtros, exportações, mensagens e guard de formulário sujo. No celular, permitir consultar detalhes e operar controles sem rolagem da página inteira na horizontal.
8. Registre cada tela/diálogo na matriz; não marcar o módulo inteiro apenas por alterar a tabela principal.

## Invariantes específicos

Nenhuma mudança de regra de pagamento, baixa, duplicidade, parcelas, conciliação, competência ou geração recorrente. Nenhum dado ilustrativo vira opção no cadastro. Não fazer chamadas de escrita reais. Não converter códigos longos em número, pois zeros à esquerda e fidelidade do conteúdo são essenciais.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar título vencido/aberto/pago/cancelado conforme estados reais, boleto multicategoria com parte fora do CMV, linha sem categoria, código com zeros, PIX, anexos e erros. Copiar e comparar byte a byte o texto esperado em fixture. Validar filtros, calendário, permissões de leitura/edição/exportação, modal longo, teclado e formulário sujo. Confirmar que fechar a tela não executa pagamento nem salva mudanças implicitamente.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/05-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 06. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 05.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

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

---

# PROMPT — FASE 07 • CMV Financeiro

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Aplicar a nova família visual ao CMV Financeiro mantendo integralmente a experiência e os contratos específicos já implementados.

## Leitura dirigida

Leia `financeiro/cmv/CmvFinanceiroSection.tsx`, `CmvCards.tsx`, CmvVisaoGeral, CmvAnaliseCategoria, CmvComparativo, CmvRegrasVinculo, CmvBoletosDialog, CmvExportSheet, `useCmvFinanceiro` e domínio financeiro/cmv. Inspecione a exceção deliberada ao KpiCard antes de refatorar.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `04-cmv-financeiro.png`, `07-sidebar-e-componentes.png`, recorte do card azul como acabamento. O contrato de cinco indicadores prevalece sobre qualquer simplificação do desenho.

## Implementação / entregáveis

1. Harmonize PageHeader, filtros Semanal/Quinzenal/Mensal/Período, navegação temporal, abas e exportação com a V2.
2. Preserve os cinco indicadores específicos: Faturamento, CMV Financeiro, % CMV, Variação do CMV em R$ e Boletos vinculados ao CMV, incluindo valores anteriores, contexto, observações e base inexistente.
3. Use destaque azul somente quando adequado; não force os cinco indicadores no card genérico se isso apagar linhas informativas. É permitido evoluir o componente especializado usando tokens comuns.
4. Reorganize gráficos de faturamento/custo/percentual com unidades e eixos explícitos, legenda e tooltip completos. Ranking e composição por categoria devem respeitar hierarquia, subtotal e valor direto.
5. Padronize tabela de categorias, comparativo, regras de vínculo, avisos de classificação e diálogos de origem. Acesso ao boleto deve preservar filtro, período, categoria e situação.
6. Diferencie incluído, fora, pendente de classificação, sem competência e sem fechamento de caixa. Estado indisponível não é CMV zero.
7. Garanta que tabelas e gráficos caibam em dispositivos menores, com legenda externa e números completos.
8. Preserve export sheet, seleção de conteúdo e limitações de acesso. Não transformar o visual em nova regra de classificação.

## Invariantes específicos

Este é o CMV calculado por lançamentos elegíveis de Contas a Pagar, com data de competência, e faturamento do Fechamento de Caixa conforme domínio atual. Não usar data de pagamento/vencimento como substituto. Não fundir com Centro de CMV. Não incluir automaticamente todas as categorias de um boleto. Não inventar meta universal. Aumento de custo absoluto não é automaticamente vermelho; respeitar tom do domínio. Sem faturamento/sem fechamento/zero seguem regras existentes, nunca divisão artificial por 1.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Fixtures com rateio misto, categoria pai/filho/direto, boletos sem competência, cancelados conforme domínio, faturamento ausente e zero, comparação sem base e variação em p.p. Comparar custo/receita/% antes/depois. Testar abrir origem, categoria, situação e recorte correto, exportação, permissão financeira distinta da permissão do CMV, e todos os filtros/temas/viewports.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/07-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 08. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 07.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 08 • Controle de Estoque e análises de estoque

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Renovar todas as abas de Controle de Estoque, com atenção aos cards de situação, custo, categorias, perdas, consumo e previsões.

## Leitura dirigida

Leia EstoqueGeralView, `estoque/StockDashboardSection`, StockLossesSection, StockPredictiveSection, StockTopConsumedSection, StockInactivityAlert, saldos, detalhes e demais componentes referenciados. Verifique fonte, unidade e navegações por status.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `03-controle-de-estoque.png`, `08-estoque-mobile.png`, biblioteca de componentes e card azul.

## Implementação / entregáveis

1. Destaque Valor em Estoque com a família azul. Preserve Produtos, Estoque Baixo, Críticos e Sem Estoque, seus valores, cores de situação e cliques filtrados.
2. Renove distribuição por categoria com barras horizontais e nomes legíveis. Apresente status do estoque com legenda, contagens e controle acessível para o filtro correspondente.
3. Revise perdas, principais consumos, previsões, inatividade e demais abas encontradas. Quantidade, valor, período e método atual devem continuar identificáveis.
4. Dê consistência às tabelas de saldo, lote, validade, unidade e movimentações, mantendo colunas e detalhes essenciais. Não ocultar ação operacional para simplificar a tela.
5. Destaque situação crítica sem fazer todo valor de estoque elevado parecer bom. Para projeções, explicite previsão e dados insuficientes conforme retorno atual.
6. Preserve a integração com requisições, leitura, cadastro, detalhes e ações existentes. Use layout responsivo com filtros recolhíveis apenas se todos continuarem disponíveis e identificados.
7. Não substituir estoque consolidado por soma das linhas visíveis. Use fontes canônicas existentes.
8. Atualize a matriz para cada aba e estado; o dashboard é só uma parte desta fase.

## Invariantes específicos

Saldos físicos, custos, critérios de estoque baixo/crítico, lotes, unidades, arredondamento e regras de movimento não mudam. Não criar a opção “OK” como novo cálculo se ela já vier do domínio; reaproveitar. Preservar cliques das fatias/legenda e cards para a mesma situação filtrada.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar produto com zero/sem custo/crítico/atenção, nomes extensos, unidade kg/unidade, centenas de categorias, lista paginada e escopo de empresa. Verificar igualdade de totais, badges, filtros por card/status, legenda acessível, gráficos de consumo/perdas/previsão e tabela em 320–1920 px. No mobile, não retirar detalhes importantes nem usar contagens fictícias.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/08-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 09. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 08.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 09 • Movimentação Operacional e Inventário Geral

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Organizar as telas de operação e contagem para rapidez e clareza, preservando leitor físico, câmera, etapas e efeitos no estoque.

## Leitura dirigida

Leia a implementação real de Movimentação Operacional e InventarioView, suas seções, listas, modais, serviços de leitura, permissões e regras. Inclua solicitações, requisições e telas de detalhes efetivamente ligadas a esses módulos.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Família de estoque, mobile e componentes; essas referências não especificam novos fluxos de inventário.

## Implementação / entregáveis

1. Padronize cabeçalho, contexto de unidade/setor, filtros, tabelas, status e ação principal de cada tela.
2. Organize formulários de movimentação em blocos com origem/destino, itens, quantidades e confirmação apenas quando esses campos já fizerem parte do fluxo.
3. Em inventário, preserve criação, listagem, detalhes, progresso, divergências e conclusão. A apresentação deve deixar claro o estado atual e quais ações estão disponíveis.
4. Dê destaque consistente à escolha Lista/Via Código e à interação de leitura. Mensagens de produto encontrado, não encontrado e duplicidade devem ser reconhecíveis e acessíveis.
5. Revise a interface da câmera sem alterar decoder, formato de código, integração com leitor ou evento de confirmação. Garanta área visível, botão de fechar, erro de permissão e alternativa já existente.
6. No celular, campos e ações devem permanecer utilizáveis com teclado virtual e câmera. Não cobrir confirmação/contador com footer fixo.
7. Reorganize o resumo de divergências, sem transformar valor absoluto ou quantidade em outro conceito. Preserve dados salvos e retomada conforme comportamento atual.
8. Documente e valide fluxos com o hardware disponível; mantenha limitações explícitas quando só houver emulação.

## Invariantes específicos

Não iniciar/finalizar inventário real, não criar ajustes de estoque para teste e não remover confirmações. Não alterar significado de contagem, deduplicação, reconciliação, código, lote ou persistência. Não afirmar que leitor/câmera físicos foram testados se foram apenas simulados.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Em ambiente isolado: criar/abrir/editar/retomar/encerrar conforme permissões, contagem por lista e leitura, códigos repetidos, produto ausente, câmera negada, modal fechado e orientação móvel. Verificar foco do leitor físico e atualização visual sem perda de entradas. Sem hardware, registrar teste simulado e pendência física separadamente. Comparar payloads/eventos e saldos esperados antes/depois.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/09-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 10. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 09.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 10 • Dashboard e Controle de Salmão

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Padronizar Dashboard Salmão, Entradas, Manipulação, Estoque, Metas e Planejamento específico, mantendo a rastreabilidade e as métricas próprias.

## Leitura dirigida

Leia SalmonControlView, DashboardView, EntriesView, ManipulationView, StockView, GoalsView, componentes de planejamento usados por Salmão e handlers de navegação, store e testes pertinentes.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Card azul, biblioteca de componentes, referências de estoque/planejamento aplicadas à identidade, não aos cálculos de Salmão.

## Implementação / entregáveis

1. Atualize navegação e cabeçalhos sem modificar UI_TO_REGISTRY, seleção de abas persistidas ou os dois acessos existentes pela sidebar.
2. Renove cards do dashboard mantendo todos os indicadores atuais, unidades, metas e informações auxiliares. Escolha destaque por relevância, sem confundir valor comprado com saldo ou margem.
3. Harmonize gráficos de entradas, custos, consumo, rendimento e comparativos realmente existentes. Identifique R$, kg, percentual e período com precisão.
4. Reorganize a lista e formulário de entradas, mantendo lote/fornecedor/datas/valores e validações existentes.
5. Na manipulação, melhore hierarquia entre item de origem, pesagens, rendimentos, perdas e conclusão. Preserve a pré-seleção ao iniciar a partir do estoque.
6. Renove estoque e metas com status, tabelas e controles consistentes. Reutilize os componentes de planejamento sem duplicá-los.
7. Preserve históricos, detalhes, anexos e exportações presentes. Não inserir métricas novas sem fonte nem trocar dados operacionais por ilustrações.
8. Registre a cobertura de cada aba e seus diálogos no desktop/mobile.

## Invariantes específicos

Pesagens, rendimentos, perdas, custos, lote, saldo e arredondamentos não mudam. Não substituir quilogramas por unidades nem custo total por custo/kg. Preserve onStartManipulation, preSelectedEntryId e qualquer contrato equivalente atual. Não apagar acesso duplicado sem avaliação explícita.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Fixtures com lotes, rendimento baixo/alto, falta de custo, valores longos e zero. Testar entrada → estoque → manipulação pré-selecionada → retorno, metas e planejamento por categoria, perfis sem uma das abas, filtros e exportações. Confirmar números e payloads intactos; validar gráficos/tabelas em ambos os temas e dispositivos.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/10-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 11. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 10.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 11 • Compras, cotações e fornecedores

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Aplicar a V2 ao fluxo completo de compras e seus cadastros, mantendo comparações, aprovação e navegação por registros.

## Leitura dirigida

Leia ComprasView, PedidosComprasMercadoView, ShoppingChecklistView, AlertasFaltaEstoqueView, CalendarioLembretesView, RankingFornecedoresView, SuppliersView, CotacaoView e componentes internos. Confira badges, requestNavigation, seletores e permissões de cada ação.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Biblioteca de componentes, estilo de listas/tabelas das referências de estoque e financeiro; colagem apenas como inspiração secundária.

## Implementação / entregáveis

1. Harmonize Pedidos & Compras Mercado, Checklist Compra, Itens em Falta, Cotação, Calendário, Ranking e Fornecedores.
2. Revise cards/resumos somente com fontes confiáveis; status e contagens devem manter a mesma definição do backend/store.
3. Organize pedidos com identificação, fornecedor, status, datas, itens, totais e ações existentes; detalhes devem ser acessíveis sem cortar informação importante.
4. Na cotação, torne comparações de fornecedores legíveis, com unidades e critérios atuais. Matrizes largas podem ter scroll interno e identificação de colunas; não esconder concorrentes necessários à comparação.
5. Renove checklist, prioridades e vínculo para pedido sem alterar criação/aprovação. Preservar abertura de pedido específico por notificação ou atalho.
6. Padronize calendário/lembretes, cadastro de fornecedor e ranking; não inventar score, prazo ou economia garantida.
7. Preserve filtros, paginação, ações em lote, importação/anexos, exportação e máscaras presentes. A paleta deve ajudar a distinguir pendência e conclusão, não reclassificá-las.
8. Garanta uso móvel para conferência de itens e interação com formulários.

## Invariantes específicos

Não alterar cálculo de preço, impostos, unidade, aprovação, status, envio de cotação, integração ou geração de pedido. Sem disparos reais a fornecedores. Não mascarar as permissões por exibir ações sempre desabilitadas quando a regra atual exige ocultação.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar cotação com vários fornecedores, itens em unidades diferentes, pedidos longos, valor zero/ausente conforme contrato, filtro vazio, perfil leitor/aprovador, badges e abrir registro por deep link/notification. Confirmar que botões permanecem associados às ações originais, sem duplo submit. Validar a matriz larga no mobile sem scroll global.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/11-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 12. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 11.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 12 • Centro de CMV e Ficha Técnica

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Revisar os módulos operacionais de custos e fichas, sem misturá-los com o relatório de CMV Financeiro.

## Leitura dirigida

Leia CmvView, `cmv/CmvTabs`, filtros, rankings, metas, tabelas e FichaTecnicaView com diálogos/subcomponentes. Consulte o domínio de CMV operacional e composição da ficha.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Referência de CMV Financeiro somente para acabamento; os conteúdos e regras vêm dos módulos Centro de CMV/Ficha Técnica. Biblioteca de componentes e estoque.

## Implementação / entregáveis

1. Renove cabeçalhos, filtros, cards e tabs de Categoria, Setor, Top Itens e Semanal ou seus equivalentes atuais.
2. Mantenha todos os indicadores de custo/consumo/margem existentes; destaque visualmente um indicador principal sem substituir os demais.
3. Melhore composição por categoria e setor com legendas legíveis ou barras adequadas. Em gráficos de participação, deixe explícito se o percentual representa participação no custo ou custo sobre faturamento. Não tratar `percentCmv` automaticamente como fatia de um donut.
4. Nos rankings, preserve paginação, carga adicional, total de registros, unidade e critérios. Não transformar Top Itens em soma do estoque completo.
5. Nas fichas, organize cabeçalho, ingredientes, quantidades/unidades, custo, rendimento e demais campos reais em blocos claros, mantendo comparação e edição existentes.
6. Use tabela legível para ingredientes e totais com hierarquia. A versão mobile não pode ocultar quantidade, unidade ou ações de edição necessárias.
7. Preserve modelos de meta, vínculos, exportação e validações. Informação indisponível deve ter estado claro, não um cálculo inventado.
8. Documente no layout a distinção conceitual dos CMVs somente com textos compatíveis com o domínio atual.

## Invariantes específicos

Não reescrever fórmula de custo consumido, CMV, margem, rendimento, perdas ou ficha. Não alterar denominador de percentual. Não reutilizar a fonte financeira por conveniência. Não somar custos de hierarquias duas vezes e não criar função automática de precificação que não exista.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar mesmo recorte antes/depois, pai/filho, categoria sem dado, CMV com base zero, setores extensos, ranking paginado e ficha com muitas linhas/unidades diferentes. Validar saves somente isolados, importação/exportação existentes, permissões e navegação. Comparar totais e percentuais com a fonte, não com a aparência do gráfico.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/12-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 13. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 12.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 13 • Planejamento e Relatórios Gerais

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Organizar metas, projeções e relatórios inteligentes em uma leitura gerencial consistente, sem converter simulação em fato.

## Leitura dirigida

Leia PlanningView, MetaCompraCard, PlanningProjecaoCard, WeeklyBreakdown, BudgetPressure, PurchaseRadar, SimuladorCompra, RelatoriosView, AnaliseItemView, GastosPorSetorChart e respectivos hooks. Identifique filtros de fonte e categoria e permissões das abas.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `05-planejamento.png`, biblioteca de componentes, identidade do dashboard e de estoque.

## Implementação / entregáveis

1. Mantenha metas, projeção mensal, ritmo semanal, pressão orçamentária, radar de compras e simulador; reorganize-os conforme a referência, sem remover seções.
2. Escolha destaque azul para o resumo principal adequado. Indicadores de limite excedido mantêm alerta e percentual real, inclusive acima de 100%; uma barra pode saturar visualmente, mas o valor não pode ser reduzido a 100.
3. Diferencie realizado, ideal, orçado e projetado com legenda/traço e contexto. Preserve janelas W1–W5 e critérios atuais; não invente distribuição linear como histórico.
4. Harmonize MonthNavigator, fonte Tudo/Salmão/Geral e categoria, evitando filtros pequenos demais. Preserve comportamento no desktop e abertura das seções no mobile.
5. Em Relatórios Gerais, revise CMV, Estoque, Compras, Tendência, Score e Itens e qualquer aba adicional real. Cada uma recebe cards/gráficos/tabelas no mesmo padrão.
6. Apresente score e confiança com texto acessível e significado atual. Não apenas pontos coloridos minúsculos. Mantenha simuladores com rótulo inequívoco de hipótese.
7. Renove análise de item e gráficos por setor com nomes extensos, valores e unidades completos. Não confundir faturamento de uma fonte com receita de outra.
8. Preserve relatórios, downloads, navegação por item e ações de cenário, sem consultas duplicadas por estética.

## Invariantes específicos

Metas, gastos consolidados, previsões, cenários, score e confiança não mudam. Não chamar compra simulada de compra salva. Não transformar ausência de meta em desempenho positivo. Não modificar sincronização de gasto no servidor nem a separação Salmão/Geral.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Fixture com meta ausente, meta zero conforme domínio, gasto acima do limite, projeção, cinco semanas, cenário hipotético e categorias longas. Verificar que filtro altera os mesmos conjuntos de antes, simular não salva compra e abas respeitam permissões. Comparar valor real/orçado/projetado, testar mobile com seções expandidas e todos os gráficos, score e análise por item.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/13-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 14. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 13.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 14 • RH / Pessoas

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Aplicar o padrão de cards, gráficos, tabelas e formulários a todas as áreas de RH identificadas, com sigilo e clareza de valores/períodos.

## Leitura dirigida

Leia RhView, `rh/DashboardRhSection.tsx`, cadastros e todas as abas/diálogos reais de colaboradores, ponto, banco de horas, folha, benefícios, férias/afastamentos e demais recursos encontrados. Não assumir cobertura pelo dashboard apenas.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `06-rh-pessoas.png`, biblioteca de componentes e card azul. Todos os indicadores atuais prevalecem sobre simplificações do mockup.

## Implementação / entregáveis

1. Preserve os oito indicadores atuais do dashboard: Headcount, Custo Total/mês, Custo Médio/colab, Benefícios/mês, Horas Extras, Absenteísmo, Atrasos (min) e Férias Pendentes, ou os equivalentes atuais confirmados.
2. Reorganize em grupos de equipe/custos e jornada/atenção. Use destaque coerente e mantenha alerta por regra existente, sem tratar todo custo de equipe como ocorrência crítica nova.
3. Renove distribuição por setor, custo da folha e horas extras com unidades R$/horas/minutos/% explícitas. Não depender apenas de nomes abreviados se isso gera ambiguidade.
4. Padronize seletores de período, lista de pessoas, ações, formulários e estados. Preserve permissões específicas para dados salariais e administrativos.
5. Revise todas as abas de ponto, jornada, folha, benefícios e férias encontradas, mantendo campos, validações e confirmações.
6. Não criar total consolidado por soma das primeiras páginas. Se a fonte atual for parcial, registrar a limitação funcional; não alterar consultas no escopo visual nem apresentar um total inventado.
7. Use somente pessoas e salários sintéticos nas evidências. Screenshots de dados reais precisam ser saneados.
8. Adapte desktop/mobile e tema escuro sem tornar tabelas de folha ilegíveis.

## Invariantes específicos

Não alterar fórmula de absenteísmo, folha, encargos, jornada, horas extras, benefícios ou férias. Não tratar revisão visual como revisão trabalhista. Não remover campos por serem sensíveis; respeitar a autorização de exibição vigente. Nenhuma aprovação/cálculo/pagamento real de RH para teste.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar perfil de acesso limitado, setores e nomes longos, headcount zero, grande equipe/paginação, custo e horas negativos quando suportados, período sem folha, férias pendentes e avisos. Conferir valores/units antes/depois, acesso às abas e exportações, formulários e foco no mobile. Identificar explicitamente falta de validação de módulos bloqueados por credenciais.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/14-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 15. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 14.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 15 • Central de IA

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Melhorar a apresentação e a operação da Central de IA existente, sem criar agentes, ferramentas ou contratos de integração novos.

## Leitura dirigida

Leia CentralIAView, hooks/componentes de chat, renderizadores, ações e configurações realmente referenciados, permissões e mecanismos existentes de confirmação. Verifique se há assistente flutuante neste produto antes de incluí-lo no escopo.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Sidebar, cards brancos, botões e estados da biblioteca. Não usar telas do aplicativo pessoal como fonte funcional.

## Implementação / entregáveis

1. Reorganize navegação, histórico e conversas, cabeçalho contextual, seletor de opções existentes e área de mensagens.
2. Harmonize balões/painéis, markdown, listas, tabelas e blocos de código, com quebra de linha e scroll localizado. Não permitir que uma resposta longa alargue a página inteira.
3. Mantenha composer acessível com anexos/ações já existentes, estado de envio, progresso, streaming, erro e retry. Não apresentar confirmação de ação antes do retorno real.
4. Se já houver cartões de resultado, sugestões ou ações, use a família visual comum sem inventar conteúdo ou métricas de IA.
5. Preserve aprovação, contexto da empresa, limites de permissão e resultados das ferramentas. Não converter uma ação de confirmação explícita em execução automática.
6. Revise responsividade com teclado virtual e conversa longa; nada deve cobrir o campo de envio. Mantenha scroll estável sem puxar o usuário para baixo continuamente.
7. Se houver widget flutuante no Margin Food, harmonize-o e valide abrir/fechar, posição e sobreposição; se não houver, não criar o widget do sistema pessoal.
8. Mantenha sanitização de conteúdo, links e proteções atuais, mesmo quando o visual sugerir HTML rico.

## Invariantes específicos

Sem mudança de provedor/modelo/prompts de negócio, backend de IA, tracking, tokens, custos, ferramentas ou integrações. Sem enviar dados reais a provedor durante QA sem autorização. Não remover autorização/confirmar ferramenta automaticamente. Não executar HTML arbitrário de mensagens para reproduzir formato.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Fixture de conversa curta/longa, tabela larga, código, link, resposta em streaming, erro, cancelamento se existir, anexo inválido, teclado e empresa trocada. Testar segurança de renderização conforme testes atuais, preservação de confirmações e acesso. Não afirmar que uma integração real foi validada com um mock visual.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/15-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 16. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 15.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 16 • Usuários, Configurações, Administração e auxiliares

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Concluir a propagação do padrão às áreas administrativas e telas auxiliares, incluindo as superfícies que não aparecem na navegação principal.

## Leitura dirigida

Leia ConfiguracoesView, AdminUsersView, AdminPanel, PermissionMatrix, GlobalAuditView/AuditView, PerformanceMonitorView se presentes, Login, ResetPassword, NotFound, notificações, calculadora e PWA/tema, além de cada subaba encontrada na matriz. Nomes são pontos de partida a confirmar.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `00-sidebar-aprovada.png`, `07-sidebar-e-componentes.png` e identidade geral das telas aprovadas.

## Implementação / entregáveis

1. Padronize tabelas de usuários, perfis, empresas e configurações existentes, com busca, filtros, status, ações e formulários consistentes.
2. Faça a matriz de permissões legível por módulo/ação; mantenha estados e grupos reais, com scroll localizado em matrizes grandes. Não criar permissão ou agrupar ações alterando efeito.
3. Revise painéis administrativos, auditoria global e monitoramento sem expor dados privados a perfis comuns.
4. Harmonize login, recuperação de senha, acesso negado e página não encontrada, respeitando layout/contexto distintos das telas autenticadas.
5. Revise sino de notificações, popovers, calculadora flutuante se existente, indicação offline e atualização PWA. Preserve eventos e ações originais; não mudar política de cache/deploy.
6. Mantenha toggle de tema, menus de conta, validações de senha, máscaras e proteção de formulário sujo.
7. Faça nova conferência da matriz para encontrar qualquer módulo/tela ainda sem fase; atribua subfase explícita e implemente antes do fechamento.
8. Documente áreas que necessitam de ambiente/perfil específicos para validação; não habilite conta administrativa artificialmente.

## Invariantes específicos

Sem mudanças de RBAC, criação de papel, redefinição real de senha, exclusão de usuário, escopo global, configuração de integrações ou atualização do service worker por conveniência estética. Não publicar credenciais em screenshots. Não remover controles da administração para imitar uma sidebar limpa.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar usuário restrito/admin autorizado em ambiente isolado, formulário inválido, senhas sem expor valor, confirmação, envio de recuperação apenas simulado/autorizado, page not found, tema, popovers nas bordas e notificações. Conferir matriz de permissões antes/depois e ausência de ações novas. Validar fallback de offline/PWA conforme capacidades reais, com limitações documentadas.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/16-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 17. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 16.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT — FASE 17 • QA integrado, cobertura total e entrega

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Verificar a implementação em todo o sistema, corrigir regressões visuais deste trabalho e produzir o fechamento verificável, sem declarar cobertura falsa.

## Leitura dirigida

Leia matriz completa, progresso, decisões, relatórios/handoffs, pendências, diff acumulado e baseline. Confirme telas adicionadas ao repositório durante a execução. Consulte os critérios do mestre, as referências e os testes do projeto.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Todas as referências, respeitando o manifesto; fotos de antes/depois vindas dos componentes reais.

## Implementação / entregáveis

1. Cruze novamente registry, rotas, sidebar e renderização com a matriz. Nenhuma tela pode desaparecer do inventário por renomeação; registre aliases e novas superfícies.
2. Percorra todos os módulos/submódulos e estados em navegador, com conjuntos de dados controlados. Corrija cortes, overflow, contrastes, foco, grids e inconsistências provocadas pela V2.
3. Teste o caminho integrado: trocar unidade autorizada → dashboard → card → detalhe filtrado → operação → retorno; inclua Estoque/Inventário/Compras e os dois CMVs, com ações de escrita somente isoladas.
4. Compare números, contagens, percentuais, relatórios e exportações com baseline equivalente. Cheque parâmetros, unidade, regime e sinais; screenshots bonitas não substituem essa comparação.
5. Execute o plano de viewports, temas, teclado/zoom, menus, gráficos, tabelas longas, formulários e estados. Diferencie teste em browser real, emulação e hardware físico.
6. Execute typecheck, lint, testes/build e revisão do diff. Revise performance, queries, subscriptions, lazy loading, bundle e console. Não esconder falhas por silenciar logs ou remover testes.
7. Remova somente código temporário deste trabalho comprovadamente sem uso. Não limpar arquivos históricos, fixtures úteis ou backups do usuário.
8. Produza `RELATORIO-FINAL.md` com cobertura, evidências, comandos, problemas corrigidos, limitações, arquivos alterados e rollback seletivo. Atualize a memória do projeto concisamente.
9. Se houver bloqueio, gere prompt de correção/validação pendente, sem fingir encerramento. Se tudo passou, entregue um prompt de manutenção visual periódica, sem executá-lo.
10. Não realizar push, merge, deploy ou publicação. A entrega é o código local/revisável e seu relatório; a liberação depende de autorização específica.

## Invariantes específicos

“Implementado” não significa “validado”. “Sem acesso” não significa “não se aplica”. “Mantido” exige justificativa. Nenhuma screenshot de produção deve conter segredos/dados pessoais. Sem garantia absoluta de ausência de bugs; relatório deve refletir testes e limites reais.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Exigir cobertura explícita de todas as telas, confirmação dos oito cards financeiros, todos os contratos específicos de CMV, sidebar/loja isoladas, ações existentes e dados intactos. Nenhuma regressão crítica aberta. Evidências de desktop/mobile/light/dark, acesso permitido/negado e estado vazio/erro. Falhas preexistentes críticas e ambiente insuficiente devem impedir a declaração de validação completa, com próximo passo preciso.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/17-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare o prompt de manutenção visual; sem pendências ocultas. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 17.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.

---

# PROMPT DE RETOMADA

Estamos continuando o Redesign Visual V2 do Margin Food no repositório moralles-filmes/margin-food.

Leia docs/redesign-margin-food-v2/PROMPT-MESTRE.md, PROGRESSO.md, DECISOES.md, a parte relevante da MATRIZ-DE-COBERTURA.md e PROXIMO-CHAT.md. Confirme o estado real do git e os pré-requisitos. Localize o último handoff numerado; ele deve identificar a fase atual e o que foi validado.

Execute apenas a fase indicada no handoff, seguindo o prompt detalhado correspondente em prompts/. Não reinicie a auditoria do zero sem necessidade e não presuma trabalho concluído pela existência de arquivos. Se faltar handoff, reconcilie progresso, relatórios, matriz e diff antes de editar.

Preserve todos os contratos de dados, permissões, empresa, cálculos, ações e exportações. As imagens orientam aparência; dados e funcionalidades vêm do código atual. Valide em navegador e com os testes reais; bloqueios não são validação.

Ao terminar, atualize documentação, grave handoff e escreva/mostre o próximo prompt completo. Se houver falha, prepare continuação de correção da fase atual. Pare ao final desta fase; sem push, merge ou deploy.
