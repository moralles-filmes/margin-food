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
