# Cadastros vazios para perfis limitados — 16/09/2026

## Resultado em produção

Aplicada exclusivamente a migration `20260916153928_fix_stock_reference_access.sql` no projeto `wuzxpbixprrgssoeeaez`.
O perfil de estoque da unidade validada já tinha permissões granulares corretas; elas não foram alteradas.

| Consulta com ROLE authenticated e contexto do usuário/unidade | Antes | Depois |
|---|---:|---:|
| Setores ativos | 0 | 12 |
| Categorias ativas | 0 | 23 |
| Locais ativos | 0 | 7 |
| Setores de outra empresa | 0 | 0 |
| Permissão de editar/excluir Cadastros | Não | Não |

A UI de Nova Saída consulta `stock_sectors` diretamente. Sua RLS exigia `estoque:setores:view`, inexistente na matriz, ou `stock:read`, negada no perfil limitado. O mesmo problema afetava categorias e locais. A policy especial de requisições só aceitava criar/gerenciar requisições, não movimentações nem quem apenas consulta/atende requisições.

## Correções incluídas

| Recurso | Operações corrigidas |
|---|---|
| Setores | Consulta para movimentações, requisições e filtros de CMV |
| Categorias | Consulta para catálogo, filtros de estoque, inventário rápido e pedidos de compra |
| Locais | Consulta para catálogo e transferências |
| Cadastros de estoque | SELECT/INSERT/UPDATE/DELETE alinhados a `estoque:cadastros:*`, com ações separadas e manage; SELECT suporta RETURNING |
| Cargos | Leitura alinhada a `configuracoes:usuarios:*`; a criação continua pela Edge admin-users |
| Turnos | Leitura de opções ativas para Inventário, inclusive JOINs sujeitos à RLS; a listagem atual da Edge já usa service role e não reproduz o bloqueio |

Leitura operacional concede somente registros ativos da empresa selecionada. Não concede edição/exclusão de cadastros, não remove DENYs, não altera memberships, não adiciona permissões ao usuário e não modifica saldos/movimentações.
As policies restritivas de unidade, RLS e FORCE RLS foram preservadas.
Não houve alteração de frontend, portanto esta correção independe de deploy Vercel.

## Validação

- Reprodução inicial no banco vivo com `SET LOCAL ROLE authenticated`, identidade do usuário e header `x-company-id`: três listas vazias apesar de registros existentes.
- PostgreSQL local real, clone vazio de `moralles_phase7_test_base`, usando funções de autorização reais. O teste falhou antes da migration e passou depois: **526 assertivas**.
- Casos com uma permissão granular por vez, DENY explícito nas legadas/globais, nenhuma permissão, registros ativos/inativos, DML por ação, INSERT RETURNING, acesso/escrita cruzados e header de empresa não autorizada.
- 49 chaves distintas usadas na migration conferidas contra registry/LEGACY_PERMISSION_MAP; nenhuma inválida.
- Pós-validação viva: 12 setores, 23 categorias, 7 locais; zero setores de outra empresa; movimentar permitido, editar/excluir Cadastros negado.
- Advisors de segurança antes/depois sem alteração nas contagens: 8 RLS sem policy, 7 search_path mutável, 3 extensões em public, 5 materializadas na API, 183 funções definer para anon, 274 para authenticated e 1 configuração de proteção de senhas. São achados preexistentes, não corrigidos por este hotfix.
- Histórico MCP reconciliado imediatamente pelo CLI: versão local/remota `20260916153928`; timestamp automático `20260916154447` removido apenas do histórico.
- Não houve login/browser como o usuário nem criação de movimentação real para testar.

Executar novamente o teste apenas em banco local descartável com schema do projeto:

```powershell
psql -X -w -h 127.0.0.1 -p 15440 -U postgres -d moralles_lookup_test_20260916 -v ON_ERROR_STOP=1 -f supabase/tests/database/stock_reference_access.sql
```

O teste é transacional e termina em ROLLBACK. [Snapshot anterior das policies](stock-reference-access-20260916-before.json) preserva a evidência para revisão/recuo pontual.

## Mapeamento além dos seletores corrigidos

Foi feita comparação de todas as chaves referenciadas nas policies de public com registry e aliases legados. A tabela abaixo registra o resultado inicial; uma chave ausente não implica automaticamente que todo o fluxo falhe: há alternativas válidas, RPCs e Edges com guards próprios.

As escritas de RH com apenas chaves inexistentes merecem correção específica junto aos guards de frontend. Exemplos: Benefícios/Escalas/SST/Treinamento têm ações create/edit/delete registradas, mas policies usam manage inexistente; Onboarding tem manage registrado e policies usam create/edit inexistentes. Custos RH tem somente view/export, portanto não se deve liberar escrita a view por conveniência. Mural tem create, mas edição/arquivamento não possuem ação própria; definir esse contrato antes de abrir UPDATE. Estes pontos foram mapeados, **não publicados como permissões novas**.

| Tabela | Chaves ausentes identificadas antes do hotfix | Situação |
|---|---|---|
| `audit_log` | `system:read` | Revisar aliases e gates efetivos; presença da chave isolada não prova bloqueio |
| `audit_logs` | `system:read` | Revisar aliases e gates efetivos; presença da chave isolada não prova bloqueio |
| `integration_logs` | `system:read` | Revisar aliases e gates efetivos; presença da chave isolada não prova bloqueio |
| `job_roles` | `usuarios:cargos:create`, `usuarios:cargos:delete`, `usuarios:cargos:edit`, `usuarios:cargos:view` | Leitura corrigida; escrita de cargos passa pela Edge administrativa |
| `movimentacoes_estoque` | `cmv:simulador:view`, `estoque:movimentacoes:delete`, `estoque:movimentacoes:manage` | Revisar aliases e gates efetivos; presença da chave isolada não prova bloqueio |
| `produtos` | `cmv:precos:edit`, `cmv:precos:view`, `cmv:simulador:view`, `estoque:consumo:view`, `estoque:geral:view` | Revisar aliases e gates efetivos; presença da chave isolada não prova bloqueio |
| `rh_beneficios` | `rh:beneficios:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_comunicados` | `rh:comunicacao:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_custos_mensais` | `rh:custos:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_disponibilidade` | `rh:escalas:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_epis` | `rh:sst:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_escala_slots` | `rh:escalas:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_escalas` | `rh:escalas:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_exames` | `rh:sst:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_ferias_afastamentos` | `rh:ferias:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_ferias_saldo` | `rh:ferias:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_incidentes` | `rh:sst:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_onboarding` | `rh:onboarding:create`, `rh:onboarding:edit` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_progresso_treinamento` | `rh:treinamento:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `rh_trilhas_treinamento` | `rh:treinamento:manage` | Revisar contrato de escrita por ação; não é dependência da saída de estoque |
| `salmon_config` | `salmon:dashboard:edit` | Revisar escrita de configuração e tratamento de erro no store |
| `salmon_daily_records` | `salmon:metas:create` | Revisar aliases e gates efetivos; presença da chave isolada não prova bloqueio |
| `salmon_entries` | `salmon:edit` | Revisar aliases e gates efetivos; presença da chave isolada não prova bloqueio |
| `salmon_manipulations` | `salmon:manipulacao:edit` | Revisar aliases e gates efetivos; presença da chave isolada não prova bloqueio |
| `salmon_purchase_targets` | `salmon:metas:create`, `salmon:metas:delete` | Revisar aliases e gates efetivos; presença da chave isolada não prova bloqueio |
| `stock_categories` | `estoque:categorias:create`, `estoque:categorias:delete`, `estoque:categorias:edit`, `estoque:categorias:view` | Corrigido neste hotfix |
| `stock_locations` | `estoque:locais:create`, `estoque:locais:delete`, `estoque:locais:edit`, `estoque:locais:view` | Corrigido neste hotfix |
| `stock_sectors` | `estoque:setores:create`, `estoque:setores:delete`, `estoque:setores:edit`, `estoque:setores:view` | Corrigido neste hotfix |
| `stock_sku_counter` | `estoque:sku:manage` | Criação já aceita catalogo:create; demais aliases residuais |
| `turnos` | `configuracoes:turnos:create`, `configuracoes:turnos:delete`, `configuracoes:turnos:edit`, `configuracoes:turnos:view` | Consulta operacional adicionada; CRUD de configuração não tem tela própria |

## Integração com a publicação da Fase 12

Havia sobreposição com a candidata antiga da Fase 7 (`20260916133618_phase7_align_reference_catalogs.sql`). A publicação integrada da Fase 12 reconciliou esse avanço nos forwards `20260916220600`–`20260916221100`: `20260916220700_phase7_preserve_reference_hotfix.sql` validou, sem recriar, o digest das 17 policies do hotfix.
As 14 candidatas históricas das Fases 2–8 continuam intencionalmente ausentes de produção e não devem ser aplicadas nem marcadas como executadas. As versões forward `20260916220000`–`20260916221500`, os hashes e as evidências da publicação estão no [manifesto da Fase 12](../multi-unidades/fase12-20260916/MANIFESTO-RELEASE.md).
