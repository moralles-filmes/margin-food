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
