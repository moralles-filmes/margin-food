# Apresentação Sócios — Fase 0: auditoria da nova experiência

Data da auditoria: 27/08/2026

Escopo: pedido de reorganização da Apresentação Sócios em Faturamento → Despesas → Resultados → Insights.

Estado auditado: `main` após o merge `#70` (`0282371`) e branch atual após `10bc036`, preservando as alterações não commitadas do redesign em andamento.

## 1. Conclusão executiva

A aplicação já possui uma Apresentação Sócios extensa e em produção. Ela não deve ser recriada. A implementação atual inclui dashboard analítico, modo apresentação, fullscreen, filtros, deep links, drill-down, metas, cenários, decisões, reuniões, atas, PDF e PowerPoint.

O novo pedido, porém, não é apenas uma evolução visual. Ele altera a organização da experiência e separa fontes financeiras que hoje estão consolidadas de outra forma:

- a apresentação atual calcula receita, despesa e resultado por **competência**;
- a nova seção **Faturamento** deve usar o **Fechamento de Caixa**;
- as novas seções **Despesas** e **Resultados** devem usar o mesmo **regime de caixa do DFC**;
- a entrada atual continua dentro de **Relatório Sócios** e exige clicar em **Iniciar modo apresentação**, enquanto o pedido exige um submódulo próprio que abra a experiência diretamente;
- os slides atuais não seguem a ordem obrigatória Faturamento → Despesas → Resultados → Insights.

Portanto, a estratégia segura é migrar a apresentação existente em etapas, preservando contratos, exports, detalhes e governança úteis. Não deve existir uma segunda apresentação paralela nem uma segunda regra financeira.

## 2. Mapa de navegação atual

### 2.1 Módulo Financeiro

- A entrada principal do Financeiro fica na navegação global de `src/components/AppLayout.tsx`.
- `src/pages/Index.tsx` resolve autenticação, acesso ao módulo e renderiza `FinanceiroView`.
- As rotas profundas do contexto atual estão registradas em `src/App.tsx`:
  - `/financeiro/relatorio-socios`
  - `/financeiro/relatorio-socios/:detail`
- `src/components/FinanceiroView.tsx` é a fonte da lista visual de subtabs e filtra a navegação pelas subtabs visíveis do registry RBAC.
- No worktree auditado, outro agente está migrando essa navegação para `ModuleNav`. Essa alteração deve ser preservada; a nova entrada deverá ser adicionada à arquitetura resultante, sem reverter o redesign.

### 2.2 Relatório Sócios e apresentação atual

- A subtab visível atual é `Relatório Sócios`, com id interno `relatorio_socios` e registry key `relatorio-socios`.
- `RelatorioSociosWorkspace.tsx` contém duas tabs internas:
  - `Apresentação analítica` → `ApresentacaoSociosSection`;
  - `Relatório mensal atual` → `RelatorioSociosSection`.
- O botão **Iniciar modo apresentação** está em `ApresentacaoSociosSection.tsx`.
- O clique abre `PresentationMode.tsx` em um portal que ocupa a janela.
- `PresentationMode` já oferece:
  - anterior/próximo;
  - contador de slides;
  - setas, Page Up/Down, Home/End e Escape;
  - foco contido no diálogo;
  - fullscreen nativo quando suportado;
  - PDF, PowerPoint e impressão;
  - restauração de foco e scroll ao fechar.

### 2.3 Lacuna de navegação

O comportamento atual ainda é:

`Financeiro → Relatório Sócios → Apresentação analítica → Iniciar modo apresentação`

O comportamento solicitado é:

`Financeiro → Apresentação Sócios → apresentação`

Relatório Sócios deve continuar existindo, mas sem hospedar o gatilho do modo apresentação.

## 3. Arquitetura atual da Apresentação Sócios

### 3.1 Camadas existentes que devem ser reaproveitadas

| Camada | Artefatos principais | Situação |
|---|---|---|
| Entrada/workspace | `ApresentacaoSociosSection.tsx`, `RelatorioSociosWorkspace.tsx` | Precisa ser separada em duas subtabs |
| Shell de slides | `PresentationMode.tsx`, `PresentationSlideCanvas.tsx` | Reaproveitável, mas precisa de capítulos e tema |
| Filtros | `PresentationPeriodFilters.tsx`, `presentationFilters.ts` | Reaproveitáveis; hoje ficam fora do modo apresentação |
| Consulta principal | `usePresentationSocios.ts` | Reaproveitável somente para dados por competência já existentes |
| Contrato | `domain/financeiro/presentation/contracts.ts` | Sólido, mas sem os datasets de Fechamento/DFC exigidos pelo novo pedido |
| Adaptação | `financeiroPresentationAdapter.ts` | Validação defensiva útil; deverá ser estendida, não contornada |
| Slides | `presentationSlides.ts` | A sequência atual precisa ser substituída pela ordem nova |
| Detalhes | `PresentationDetailPage.tsx`, `usePresentationDetail.ts` | Reaproveitáveis onde a semântica continuar correta |
| Governança | decisões, sessões, atas e ações | Deve ser preservada; não é fonte financeira |
| Exports | PDF/PPTX/atas | Infraestrutura reaproveitável, com nova sequência de páginas |

### 3.2 Sequência atual de slides

A sequência atual contém capa, resumo executivo, plano, cenários, decisões, evolução por competência, composição, rankings, contas em aberto e não operacionais. Ela não contém capítulos de Faturamento, Despesas, Resultados e Insights e não implementa a ordem pedida.

Os recursos de metas, cenários, decisões e atas são valiosos, mas não podem interromper a ordem obrigatória da apresentação nova. Eles devem permanecer como ferramentas de preparação/governança ou entrar apenas em pontos explicitamente compatíveis com a nova narrativa.

## 4. Fontes financeiras oficiais encontradas

### 4.1 Matriz do sistema atual

| Domínio | Fonte de leitura atual | Regime/data | Regras relevantes |
|---|---|---|---|
| DRE | RPC `get_fin_dre_summary(p_mes)` | Competência, `data_competencia` | Realizado/conciliado; CP/CR em aberto; rateio prevalece; transferência fora |
| DFC | RPC `get_fin_dfc_summary(p_inicio, p_fim)` | Caixa, `COALESCE(data_pagamento, conciliado_em::date, data_competencia)` | Realizado/conciliado; rateio prevalece; conciliação pendente fora; implementação atual exclui transferência da composição por categoria |
| Fluxo de Caixa | RPC `get_fin_cashflow(p_inicio, p_fim)` | Caixa real + vencimento projetado | Realizado vem do ledger; projetado vem de CP/CR abertas |
| Fechamento de Caixa | tabela `financeiro_fechamento_caixa` | Dia local da operação | `faturamento_liquido = faturamento_bruto - taxas - descontos`; `faturamento_bruto` é o total oficial do fechamento |
| Livro Razão | `list_fin_lancamentos_cursor`, `get_fin_lancamentos_totais`, `get_fin_saldo_atual` | Competência/pagamento conforme a operação | Paginação no banco; saldo e transferências seguem regras próprias do ledger |
| Importação bancária | `ConciliacaoBancariaSection` + RPCs `reconcile_*` | Data da linha/extrato e pagamento | O destino final é o ledger; deduplicação por FITID + conteúdo + ocorrência |
| Categorias | `fin_categorias` | Hierarquia tenant-scoped | `excluir_dos_totais` separa não operacionais |
| Rateio | `fin_lancamento_rateios` | Herda a entidade financeira | Se existir rateio, o cabeçalho não participa da composição |
| Relatório Sócios legado | `relatorio_socios_resumo(p_mes)` | Competência | Resumo mensal e rankings; separado da nova apresentação |
| Apresentação atual | `get_fin_presentation_socios(...)` | Competência, `fin_lancamentos.data_competencia` | Agregados server-side, rateio prevalente, não operacionais separados, CP/CR apenas indicadores |

### 4.2 Divergência crítica já confirmada

A migration `20260825212350_get_fin_presentation_socios.sql` declara expressamente que a apresentação atual não reutiliza nem altera DRE/DFC. Seu contrato fixa:

- fonte `fin_lancamentos`;
- campo `data_competencia`;
- regime `competencia`.

Essa fonte continua correta para a experiência gerencial existente, mas não atende às novas telas que pedem os mesmos números do DFC. Renomear os cards atuais para “DFC”, “fluxo de caixa” ou “faturamento” produziria números semanticamente incorretos.

## 5. Fonte oficial proposta para cada número da nova experiência

Esta matriz deverá ser tratada como contrato nas fases de dados.

| Número novo | Fonte oficial | Observação |
|---|---|---|
| Faturamento atual | `SUM(financeiro_fechamento_caixa.faturamento_bruto)` | Mesma fonte do Fechamento; não usar Livro Razão |
| Faturamento mês anterior | mesma fonte, mês imediatamente anterior | Comparação determinística; ausência não vira zero silenciosamente |
| Faturamento por dia da semana | `faturamento_bruto` agrupado por `data` do fechamento | Segunda a domingo, total, ocorrência e média |
| Histórico anual de faturamento | `faturamento_bruto` agregado por mês | Até 3 anos; agregação no banco |
| Despesa atual/anterior | mesma semântica de caixa do `get_fin_dfc_summary` | Não reutilizar a atual apresentação por competência |
| DFC somente despesas | categorias e valores do DFC, filtrados por natureza despesa | Hierarquia real; rateio e exclusões idênticos ao DFC |
| Despesas em 3 meses e histórico anual | mesma semântica do DFC, agregada por mês | Evitar uma RPC por categoria/mês |
| Receitas × despesas semanais | ledger elegível do DFC, pela data efetiva de caixa | Semanas limitadas ao mês, segunda como início |
| Resultado mensal | receita de caixa − despesa de caixa | Não misturar Fechamento com resultado financeiro |
| Margem | resultado de caixa / receita de caixa × 100 | Denominador zero explícito |
| Indicadores móveis de 3 meses | receitas/despesas de caixa dos três meses terminando no mês selecionado | Não é trimestre civil |
| Insights de faturamento | métricas já calculadas do Fechamento | Regras determinísticas e relevância mínima |
| Insights de despesas | métricas já calculadas do DFC | IA, se usada no futuro, apenas redige métricas prontas |

### 5.1 Nomenclatura a preservar

“Faturamento” e “receita de caixa” não são sinônimos no sistema:

- **Faturamento**: Fechamento de Caixa;
- **Receita/Despesa/Resultado financeiro**: ledger no regime do DFC.

Na seção Resultados, qualquer rótulo solicitado como “faturamento líquido” só poderá ser usado se a definição ficar explicitamente ligada à receita de caixa oficial. A UI não deve sugerir que o Fechamento de Caixa e o DFC são a mesma base.

## 6. Segurança e multi-tenancy

### 6.1 Caminho de autorização atual

- O frontend obtém `profile.company_id` e permissões efetivas no `AuthContext`.
- `useModuleAccess('financeiro')` oculta subtabs sem ação autorizada.
- A apresentação usa atualmente o namespace `financeiro:relatorio-socios:*` para `view`, `export`, `manage`, `approve` e `simulate`.
- As RPCs principais da apresentação não recebem `company_id` do cliente.
- Cada RPC chama `assert_tenant()` e filtra tabelas por `v_company_id`.
- As RPCs de apresentação verificam a permissão granular antes de retornar dados.

### 6.2 Verificação no Supabase real

Foi executada uma inspeção somente leitura no projeto `wuzxpbixprrgssoeeaez`.

Confirmado:

- as oito migrations principais da apresentação entre `20260825212350` e `20260826211500` estão registradas no remoto;
- `get_fin_presentation_socios`, metadados, detalhes e plano são `SECURITY DEFINER` com `search_path = ''`;
- `anon` não possui `EXECUTE` nessas RPCs;
- `authenticated` e `service_role` possuem execução;
- tabelas centrais e tabelas de governança inspecionadas possuem RLS habilitada;
- tabelas próprias de decisões/sessões possuem `FORCE RLS`.

### 6.3 Dívidas de segurança observadas, fora da Fase 0

- O remoto não possui `FORCE RLS` em algumas tabelas legadas lidas pelo Financeiro, incluindo `fin_lancamento_rateios`, `fin_contas_receber` e `financeiro_fechamento_caixa`.
- `relatorio_socios_resumo(text)` ainda aparece com execução para `anon`. A função exige tenant e permissão internamente, mas a superfície pública deve ser endurecida em migration própria, com teste de regressão do relatório legado.
- DFC, DRE e Fluxo usam `SECURITY DEFINER` com `search_path=public`, enquanto a documentação atual do Supabase recomenda `search_path=''` e nomes qualificados. Isso é dívida preexistente e não deve ser “corrigido junto” sem uma fase específica de hardening e comparação financeira.

Esses pontos não autorizam uma refatoração ampla durante a nova apresentação. Toda RPC nova deve nascer no padrão endurecido já usado pelas RPCs da apresentação.

## 7. Filtros, empresa e período

- O sistema atual é um tenant por perfil; não há seletor legítimo para alternar livremente entre empresas.
- O cabeçalho deve mostrar `profile.company_name`, mas o backend deve continuar resolvendo a empresa por `assert_tenant()`.
- O filtro atual já normaliza intervalos como início inclusivo e fim exclusivo.
- A nova experiência precisa acrescentar seleção de até três anos para os históricos sem substituir o período principal.
- O período principal deve persistir durante todos os capítulos e deep links.
- Datas mensais devem continuar usando construção local; não usar `new Date('yyyy-MM-01')`.

## 8. UX, tema, responsividade e acessibilidade

### 8.1 O que já existe

- portal de apresentação 16:9 escalável;
- teclado e foco;
- fullscreen nativo;
- loading e estados vazios tipados;
- canvas compartilhado por tela, PDF e PowerPoint;
- dashboard analítico responsivo com tokens de tema;
- tooltips e componentes Recharts.

### 8.2 Lacunas contra o novo pedido

- não há navegação por capítulos Faturamento/Despesas/Resultados/Insights;
- filtros não estão disponíveis dentro do modo apresentação;
- não existe indicação do nome da seção atual;
- a apresentação fullscreen é visualmente fixa em preto/branco/dourado, em vez de oferecer uma experiência completa light/dark;
- há cores literais e classes específicas do tema antigo no modo apresentação;
- não existem seleção de três anos, gráfico por dia da semana, DFC só de despesas ou gráfico semanal;
- os insights atuais são poucos e não cobrem as regras de relevância do pedido;
- a sequência atual mistura análises, cenários e governança antes das quatro seções obrigatórias.

O redesign azul/branco/preto está sendo alterado por outro agente no mesmo worktree. A próxima fase deve consumir a versão atual dos tokens e componentes, sem editar primitives globais, `index.css`, Tailwind ou os arquivos do redesign.

## 9. Performance

- A apresentação atual já agrega no PostgreSQL e não baixa o ledger completo.
- Os novos históricos de até três anos e os comparativos mensais não devem fazer uma consulta por mês, categoria ou card.
- Faturamento por dia da semana deve ser agregado no banco sobre Fechamento de Caixa.
- Séries DFC mensal/semanal devem reutilizar um núcleo único da regra de caixa.
- Drill-down deve permanecer paginado e tenant-scoped.
- React Query deve manter `companyId`, período e filtros na query key, ainda que `companyId` não seja enviado como argumento confiável à RPC.

## 10. Testes existentes e cobertura faltante

A implementação atual possui testes unitários, de componentes, contratos, migrations e SQL efêmero para apresentação, decisões e reuniões. Eles são uma rede de regressão e não devem ser removidos.

Ainda faltam testes específicos do novo pedido:

- faturamento do Fechamento de Caixa atual/anterior;
- total, ocorrência e média por dia da semana;
- seleção de no máximo três anos;
- equivalência exata entre os agregados de despesas/resultados e o DFC;
- semanas internas ao mês começando e terminando em diferentes dias;
- trimestre móvel atravessando o ano;
- semântica inversa do comparativo de despesas;
- relevância mínima e ranking dos insights;
- rota direta, compatibilidade de URLs antigas e remoção do botão antigo;
- chapter navigation, light/dark, fullscreen e responsividade.

## 11. Riscos principais

1. **Trocar competência por caixa sem explicitar a fonte**: produziria divergência silenciosa com DFC/DRE.
2. **Reimplementar DFC em uma RPC paralela**: criaria duas regras financeiras com futuras regressões.
3. **Reaproveitar `get_fin_presentation_socios` para rótulos de DFC**: os números continuariam por competência.
4. **Somar Fechamento e ledger**: duplicaria receita.
5. **Criar um novo namespace RBAC sem migração de grants**: usuários atuais perderiam acesso.
6. **Quebrar deep links existentes**: decisões, detalhes e exports usam o path atual.
7. **Remover a governança junto com os slides antigos**: apagaria funcionalidade já entregue.
8. **Editar o redesign paralelo**: aumentaria conflitos e violaria a preservação do trabalho de outros agentes.

## 12. Estratégia de migração aprovada pela auditoria

### Fase 0 — Auditoria (esta entrega)

Mapa de arquitetura, fontes, segurança, lacunas, riscos e fases.

### Fase 1 — Fundação e separação segura

- criar a entrada visual própria **Apresentação Sócios**;
- separar `RelatorioSociosSection` e `ApresentacaoSociosSection` sem apagar funcionalidades;
- manter o namespace RBAC existente durante a migração, evitando regressão de acesso;
- introduzir URLs canônicas `/financeiro/apresentacao-socios` e `/:detail`;
- preservar URLs antigas de detalhe por redirecionamento compatível e manutenção de query params;
- remover o botão antigo e abrir o shell diretamente pela nova entrada;
- evoluir o shell com capítulos, contador, seção, filtros persistentes, teclado e fullscreen;
- manter temporariamente os datasets atuais explicitamente rotulados como competência, sem renomeá-los como DFC/Fechamento;
- não criar migration financeira nem alterar DRE/DFC/Fechamento/Livro/Conciliação.

### Fase 2 — Faturamento

- backend agregado sobre `financeiro_fechamento_caixa.faturamento_bruto`;
- atual/anterior, dias da semana e histórico anual de até três anos;
- testes de datas, médias, zeros e ausência de dados.

### Fase 3 — Despesas

- extrair/reutilizar o núcleo canônico de caixa do DFC;
- despesa atual/anterior, árvore somente despesas, drill-down, três meses e histórico anual;
- prova de equivalência com `get_fin_dfc_summary` antes/depois.

### Fase 4 — Resultados

- receitas × despesas por semanas contidas no mês;
- KPIs mensais e móveis de três meses;
- resultado e margem pela mesma base de caixa do DFC.

### Fase 5 — Insights

- motor determinístico por domínio;
- limiares absolutos/percentuais e dados mínimos;
- ranking de 3 a 5 insights de faturamento e despesas;
- sem IA calculando números.

### Fase 6 — UX, exports e auditoria final

- light/dark, responsividade, apresentação em TV/notebook, acessibilidade;
- alinhar canvas, PDF e PowerPoint à nova sequência;
- build, lint, testes, SQL real controlado, segurança, advisors e comparação manual com DFC/Fechamento.

## 13. Critério de saída da Fase 0

Atendido quando:

- a implementação existente foi identificada e não será duplicada;
- as fontes de competência, caixa e fechamento foram separadas;
- o isolamento tenant/RBAC foi verificado no código e no Supabase remoto;
- os riscos e dívidas preexistentes foram registrados sem alteração funcional;
- a próxima fase está limitada à fundação, sem mudar números financeiros.
