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
