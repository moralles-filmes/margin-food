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
