# FASE 11 — DECISÕES, PLANO DE AÇÃO E GOVERNANÇA EXECUTIVA DA APRESENTAÇÃO SÓCIOS

> Prompt preparado ao final da Fase 10. Não executar esta fase como parte da Fase 10.

Continue o desenvolvimento da Apresentação Sócios do Moralles Food a partir das Fases 7, 8, 9 e 10 já presentes no worktree.

IMPORTANTE:

- Leia `AGENTS.md` integralmente antes de alterar qualquer arquivo.
- Preserve todo o trabalho não commitado existente.
- Não faça commit, push, deploy ou aplicação de migrations em ambiente remoto.
- Não transforme cenário, decisão ou plano de ação em orçamento, lançamento financeiro, meta de CMV ou previsão automática.
- Não crie uma segunda fonte da verdade para realizado, orçamento, CMV, categorias, usuários ou permissões.
- Antes de criar tabela, RPC, hook ou componente, audite implementações equivalentes em Financeiro, Planejamento, Admin, notificações e Apresentação Sócios.
- Não invente responsáveis, prazos, prioridades, percentuais de progresso ou estados de aprovação.
- Toda decisão e todo compromisso devem resultar de ação explícita do usuário e manter trilha auditável.

## 1. Objetivo

Criar uma camada de decisão e acompanhamento executivo sobre a Apresentação Sócios, permitindo registrar uma decisão a partir de uma base ou simulação válida, decompor a decisão em ações, acompanhar responsáveis e prazos e preservar o contexto financeiro usado no momento da aprovação.

A entrega deve responder:

- Qual decisão foi tomada?
- Qual base, cenário, período, fontes e fórmulas sustentaram a decisão?
- Quem registrou e quem aprovou a decisão?
- Quais ações foram assumidas, por quem e para quando?
- Quais ações estão pendentes, em andamento, concluídas ou canceladas?
- O que mudou desde a versão aprovada?
- Qual era o impacto financeiro esperado no instante da decisão?
- O realizado posterior confirma ou diverge da referência aprovada, sem reescrever o snapshot histórico?
- Quais dados estão indisponíveis ou desatualizados?

## 2. Auditoria obrigatória

Antes de implementar:

1. Audite Apresentação Sócios, cenários da Fase 10, Planejamento, `fin_orcamentos`, `metas_cmv`, auditoria financeira, profiles, permissões e notificações.
2. Procure tabelas e fluxos canônicos de tarefas, aprovações, responsáveis, comentários, histórico e optimistic locking.
3. Reuse `get_fin_presentation_plan` para o contexto financeiro atual.
4. Reuse o contrato validado `PresentationScenarioResult` para snapshots de simulação.
5. Reuse `profiles` ou uma RPC tenant-scoped já existente para selecionar responsáveis; não exponha perfis de outro tenant.
6. Reuse `fin_audit_logs` se ela suportar corretamente a entidade; só crie histórico específico se a auditoria genérica não preservar as revisões necessárias.
7. Reuse o registry RBAC e somente actions de `ALLOWED_ACTIONS`.
8. Documente no código as estruturas reutilizadas e por que qualquer persistência nova foi necessária.
9. Audite a versão atual do Supabase e mudanças incompatíveis antes de escrever migrations ou código de integração.

## 3. Registro explícito de decisão

O usuário deve acionar explicitamente “Registrar decisão”. Nunca salvar automaticamente cada alteração do rascunho da Fase 10.

Uma decisão deve conter, no mínimo:

- Título.
- Contexto/justificativa textual.
- Período e granularidade.
- Tipo de referência: base canônica ou cenário.
- Snapshot imutável da referência usada.
- `sources`, `rules`, `formulaVersion` e data de corte.
- Resultado, margem, receita, despesa e CMV disponíveis no snapshot.
- Premissas explícitas quando a origem for cenário.
- Autor, timestamps e versão para optimistic locking.
- Estado de governança.

Regras:

- Não registrar cenário sem alavanca explícita como se fosse uma decisão de impacto.
- Não aceitar cenário com parser inválido, `NaN`, `Infinity`, source incompatível ou fórmula desconhecida.
- Não recalcular retroativamente o snapshot aprovado quando orçamento, meta, categoria ou realizado mudar.
- Uma atualização da referência deve criar nova revisão explícita; nunca substituir silenciosamente o snapshot aprovado.
- O snapshot é evidência da decisão, não nova fonte da verdade financeira.
- Valores atuais podem ser comparados ao snapshot, mas devem vir novamente das fontes canônicas.
- Nenhum campo ausente pode cair para zero.

## 4. Estados e transições

Audite estados equivalentes já existentes. Se não houver fluxo canônico reutilizável, use um fluxo mínimo e explícito:

- `DRAFT`: editável por quem possui permissão de gestão.
- `APPROVED`: snapshot e premissas congelados; alterações substantivas exigem nova revisão.
- `IN_PROGRESS`: decisão aprovada com ao menos uma ação em execução.
- `COMPLETED`: encerramento explícito após revisão das ações.
- `CANCELLED`: cancelamento explícito com justificativa.

Regras:

- Não derivar automaticamente `COMPLETED` apenas porque todas as ações estão concluídas; pedir confirmação de encerramento.
- Não permitir voltar de `COMPLETED` ou `CANCELLED` sem operação explícita de reabertura e auditoria.
- Aprovação, cancelamento, encerramento e reabertura exigem justificativa.
- Não inventar segregação de função ou proibir autoaprovação sem requisito canônico; se não existir regra, documentar o risco em vez de criar política oculta.
- Toda transição deve validar o estado esperado e `updated_at` esperado.

## 5. Plano de ação

Cada decisão pode possuir ações explícitas com:

- Descrição objetiva.
- Responsável tenant-scoped.
- Prazo opcional informado pelo usuário.
- Prioridade somente se o usuário a informar.
- Estado: `PENDING`, `IN_PROGRESS`, `COMPLETED` ou `CANCELLED`.
- Observação de conclusão/cancelamento.
- Autor e timestamps.
- Optimistic locking.

Regras:

- Nenhuma ação nasce com responsável, prazo, prioridade ou progresso inventado.
- Responsável deve pertencer à empresa atual no momento da atribuição.
- Usuário removido preserva histórico por FK apropriada, sem apagar decisão ou ação.
- Datas devem usar semântica local brasileira e ser persistidas como `date` quando horário não fizer parte da regra.
- Progresso é informado por estado explícito, não por percentual calculado ou inferido.
- Exclusão física só é permitida para rascunho sem relevância auditável; decisões aprovadas e ações históricas devem usar cancelamento/soft delete conforme o padrão encontrado.
- Alterar ação concluída deve exigir reabertura e justificativa.

## 6. Persistência, RLS e RPCs

Persistência é necessária para compartilhamento e governança entre usuários, mas só deve ser criada após a auditoria confirmar que não existe estrutura canônica equivalente.

Se forem necessárias novas tabelas:

- `company_id UUID NOT NULL` em todas elas.
- `FORCE ROW LEVEL SECURITY` sem exceção.
- GRANTs explícitos para `authenticated` e `service_role` conforme a convenção do projeto.
- Índices por `company_id`, estado, período, responsável e prazo de acordo com os filtros realmente usados.
- Colunas pesquisáveis com `*_unaccent` e índice GIN trigram na mesma migration.
- FKs e regras de deleção que preservem histórico.
- `created_at`, `updated_at`, `created_by` e `updated_by` quando aplicável.
- Snapshot versionado em JSONB com limite de tamanho e parser contratual, ou estrutura relacional se a auditoria demonstrar necessidade de consulta; justificar a escolha.

Toda RPC mutável deve:

- Usar `SECURITY DEFINER` somente quando necessário.
- Usar `SET search_path = ''`.
- Resolver o tenant com `assert_tenant()`; nunca receber ou confiar em `company_id` do cliente.
- Validar permissões com `has_permission()`/`has_any_permission()` embrulhadas em `(select ...)` nas policies.
- Validar UUIDs de categorias, responsáveis e relações dentro do tenant.
- Validar estado esperado e optimistic lock via `updated_at`.
- Limitar tamanho de título, texto, snapshot, quantidade de ações e payload total.
- Registrar auditoria antes/depois e motivo da transição.
- Revogar `EXECUTE` de `PUBLIC` e `anon`.
- Conceder apenas a `authenticated` e `service_role`.
- Retornar erros estáveis e mapeáveis no cliente.

Se uma função PL/pgSQL for criada ou alterada, a migration deve forçar sua primeira execução em PostgreSQL real efêmero para resolver colunas durante a validação.

## 7. RBAC

Use permissões deliberadas no submódulo existente `financeiro:relatorio-socios`:

- `view`: visualizar decisões e ações permitidas.
- `manage`: criar/editar rascunhos e gerir ações.
- `approve`: aprovar, encerrar, cancelar e reabrir decisões.
- `export`: incluir decisões nas exportações.
- `simulate`: continua exclusiva da criação de cenários da Fase 10.

Todas são actions válidas em `ALLOWED_ACTIONS`. Não use permissão de orçamento, conciliação ou lançamento para autorizar decisões executivas.

Regras:

- Registrar as novas combinações no registry e sincronizá-las pelo fluxo canônico.
- UI oculta ou desabilita ações sem permissão, mas o banco continua sendo a barreira definitiva.
- Leitura de perfis/responsáveis deve usar RPC tenant-scoped e permissão adequada; nunca JOIN manual em `SECURITY DEFINER` sensível.

## 8. Comparação com o realizado atual

Para decisão aprovada, exibir uma comparação informativa entre o snapshot e a base canônica atual do mesmo período quando disponível.

Regras:

- Consultar novamente `get_fin_presentation_plan`; não atualizar o snapshot histórico.
- Exibir claramente “Snapshot aprovado” e “Base atual”.
- Mostrar data/hora de cada referência.
- Comparar somente métricas semanticamente equivalentes.
- Se período, fórmula ou source forem incompatíveis, marcar comparação indisponível.
- Receita zero mantém margem e variação percentual indisponíveis.
- Não chamar divergência de sucesso ou falha automaticamente; apresentar fatos, valores e favorabilidade somente quando a regra for determinística.
- Não inferir causalidade entre ações e resultado financeiro.

## 9. Interface executiva

Adicionar à Apresentação Sócios:

- Botão explícito “Registrar decisão” a partir de base/cenário válido.
- Lista de decisões do período com estado, responsável executivo, data e referência.
- Painel de detalhe com snapshot, premissas, fontes, fórmulas e histórico.
- Editor de ações com responsável e prazo.
- Timeline auditável de transições e revisões.
- Cards de ações pendentes, vencidas, em andamento e concluídas.
- Comparação “Snapshot aprovado × Base atual” quando compatível.
- Filtros por estado, responsável, prazo e período, preservados na URL.
- Confirmações antes de aprovar, cancelar, encerrar, reabrir ou descartar alterações.
- Estados loading, empty, unavailable, error, stale, conflito otimista e falta de permissão.
- Acessibilidade por teclado, foco visível, labels, mensagens associadas aos campos e descrição textual de qualquer gráfico.
- Layout responsivo no design preto/branco/dourado.

Não usar somente cor para comunicar estado, atraso, favorabilidade ou conflito.

## 10. URL, cache e concorrência

- Preservar período, granularidade, ranking, modo comparativo, detalhe, decisão selecionada e filtros na URL.
- Validar todos os parâmetros antes de consultar o banco.
- UUID inválido ou entidade de outro tenant deve resultar em estado seguro, nunca em fallback para outro registro.
- Usar React Query com chaves que incluam tenant implícito pela sessão, período e filtros relevantes.
- Invalidar queries após mutações e eventos financeiros que afetem a comparação atual.
- Conflito otimista deve preservar a edição local, mostrar os dados mais recentes e oferecer recarregar/reaplicar conscientemente; nunca sobrescrever silenciosamente.
- Não colocar snapshot financeiro sensível em `localStorage` ou URL.
- Rascunho de formulário pode usar `sessionStorage` isolado por usuário/empresa/decisão, com limite e expiração da sessão.

## 11. Contratos TypeScript

Criar contratos versionados e parsers defensivos para decisão, revisão, ação, transição e comparação.

O parser deve rejeitar:

- `NaN` ou `Infinity`.
- UUID inválido.
- Enum desconhecido.
- Tenant/source/fórmula incompatível.
- Período inválido.
- Snapshot sem versão.
- Snapshot sem métricas obrigatórias.
- Ação com responsável externo ao conjunto tenant-scoped.
- Texto, lista ou payload excessivo.
- Transição impossível.
- Datas inválidas.
- Campos auditáveis ausentes.

Não persistir dinheiro ou percentuais como floats não controlados dentro de rascunhos. Preserve os números calculados do snapshot validado e a representação exata das premissas da Fase 10.

## 12. Apresentação, PDF e PowerPoint

Quando houver decisão aprovada e o usuário tiver `export`:

- Criar slide opcional “Decisão e compromissos”.
- Mostrar título, estado, data, referência, impacto esperado e premissas principais.
- Mostrar ações, responsáveis, prazos e estados em quantidade compatível com o layout; paginar sem truncar silenciosamente.
- Criar slide de acompanhamento somente quando houver comparação compatível com a base atual.
- Identificar snapshots oriundos de cenário como `SIMULAÇÃO`.
- Não incluir slide vazio, inválido ou sem permissão.
- Preservar textos, valores, estados e fontes entre canvas, PDF e PowerPoint.
- Adicionar notas auditáveis no PowerPoint com IDs, versão, sources, rules, formulaVersion, data de corte e timestamps, sem segredos.
- Validar PPTX como ZIP/Office real.

## 13. Testes obrigatórios

Cobrir, no mínimo:

- Registro a partir de base realizado/orçado/projeção.
- Registro a partir de cenário válido.
- Rejeição de cenário vazio ou inválido.
- Snapshot imutável após mudança nas fontes canônicas.
- Nova revisão sem sobrescrever versão aprovada.
- Transições válidas e inválidas.
- Aprovação, cancelamento, encerramento e reabertura com justificativa.
- Optimistic locking real.
- Auditoria antes/depois.
- Responsável do tenant e rejeição de outro tenant.
- Usuário removido preservando histórico.
- Isolamento entre empresas em SELECT/INSERT/UPDATE/DELETE/RPC.
- Falta das permissões `view`, `manage`, `approve` e `export`.
- Limite e parsing de snapshot/payload.
- Valores zero e negativos sem `NaN`/`Infinity`.
- Comparação incompatível marcada indisponível.
- Ausência de causalidade ou progresso inferido.
- URL, deep link e retorno ao dashboard.
- Rascunho em sessão e conflito concorrente.
- Acessibilidade dos controles e diálogos.
- Slides condicionais, PDF e PPTX.
- Ordem e paginação estáveis.
- PostgreSQL real efêmero e primeira execução de PL/pgSQL, se houver migration.

## 14. Validação final

Executar:

- `bun run test`
- `bun x tsc --noEmit`
- `bun x tsc -p tsconfig.app.json --noEmit --pretty false`
- `bun run lint`
- `bun run build`
- `bun run security:check`
- `git diff --check`

Separar claramente warnings preexistentes de erros introduzidos.

Antes de qualquer commit futuro, executar também a verificação obrigatória de segredos do `AGENTS.md`. Nesta execução, não fazer commit, push, deploy nem aplicação remota.

## 15. Documentação e entrega

Atualizar `TAREFAS.md`.

Só alterar `AGENTS.md` e `CLAUDE.md` se surgir uma nova invariante arquitetural necessária para evitar regressão futura; se alterar um, replique no outro.

No relatório final, explicar:

- Estruturas canônicas reutilizadas.
- Persistência criada e justificativa.
- Modelo de snapshot e revisão.
- Estados e transições.
- RBAC, RLS, tenant e optimistic locking.
- Auditoria e preservação histórica.
- Comparação com o realizado atual.
- URL, cache e concorrência.
- Integração com apresentação, PDF e PowerPoint.
- Testes executados.
- Warnings e riscos restantes.
- Arquivos principais.
- O que não foi aplicado remotamente.
