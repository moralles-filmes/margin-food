# Módulo: IA Central

> Levantado do código em 2026-10-07 (Padrão SaaS, Fase 9); o `AGENTS.md` não tinha regras próprias deste módulo (a reserva de `ai_logs` está em INTEGRATIONS). Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (todas com `company_id`).

- Chave do módulo: `ia`
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz: Central de IA — chat com oito agentes (Consultor Geral, Salmão Intelligence, Estoque Geral, Analista de CMV, Consultor de Compras, Ficha Técnica, Consultor Financeiro, Consultor de RH) respondido pelo Gemini com um contexto que a Edge monta a partir dos dados da empresa ativa; registro de cada pergunta e resposta em `ai_logs`.
- Não faz:
  - IA da Cotação (Edge `cotacao-ia`, chave por empresa em `cotacao_ia_config`) → [compras.md](compras.md). A credencial é editada em Configurações → Integrações ([admin.md](admin.md)).
  - Cálculo de indicador: a IA só lê e resume; CMV, DRE, saldo e folha continuam nos módulos donos. Não grava nada fora de `ai_logs`.
- Código: `src/components/CentralIAView.tsx`, `src/domain/ia/chatIdempotencia.ts`, Edge `ai-chat`.

## Submódulos e permissões

| Submódulo | Ações (`ia:<submodulo>:<acao>`) | Escopo |
|---|---|---|
| `consultor-geral`, `salmon-intelligence`, `estoque-geral`, `analista-cmv`, `consultor-compras`, `ficha-tecnica`, `consultor-financeiro`, `consultor-rh` | view, create | empresa |
| `logs` | view | empresa |

- Agente da tela → submódulo, mesmo mapa na tela e na Edge: `geral` → `consultor-geral`, `salmao` → `salmon-intelligence`, `estoque` → `estoque-geral`, `cmv` → `analista-cmv`, `compras` → `consultor-compras`, `ficha-tecnica` → `ficha-tecnica`, `financeiro` → `consultor-financeiro`, `rh` → `consultor-rh`.
- `:view` só mostra o agente; `:create` libera o envio. Com `:view` sem `:create`, o agente aparece só para leitura.
- `logs:view` não tem tela: abre o SELECT de todas as linhas de `ai_logs` da empresa pelo PostgREST (policy `ai_logs_select_admin`), inclusive `contexto_enviado`.
- Chaves legadas no `LEGACY_PERMISSION_MAP` (só o frontend expande): `ai:use`, `ia:read`, `ia:write`. A Edge não as aceita.

Papéis de sistema que recebem: `admin`, `diretor` e `gerente_geral` recebem o catálogo inteiro por `role_permissions` (ACCESS_CONTROL, "Particularidades").

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `ai_logs` | empresa | uma linha por pergunta (`entrada_usuario`, `contexto_enviado` redigido, `resposta_ia`, `metadata.status` `PENDING`/`DONE`/`ERROR`); índice único `idx_ai_logs_idempotency (company_id, user_id, idempotency_key)`; o comentário da tabela declara retenção de 90 dias, mas nenhum job apaga |
| leitura: tabelas de Financeiro, CMV, Estoque, Inventário, Compras, Ficha Técnica e RH | empresa | lidas pela Edge com service role, filtrando `company_id` (ver "Contexto montado pela Edge" e Dependências) |

## Invariantes

- Chamada paga reservada em `ai_logs` antes do modelo e reenvio com a resposta gravada: INTEGRATIONS, "Particularidades". Estados da reserva (`PENDING` abandonada após 2 minutos, `ERROR` libera a chave, sem chave a Edge gera UUID): [gemini.md](../integrations/providers/gemini.md), "Particularidades operacionais".
- **Envio só com `ia:<agente>:create`, conferida pela Edge no banco** (`has_permission`, empresa do header `x-company-id`); `:view` e as chaves legadas não liberam. Agente fora dos oito ou `action` diferente de `send_message` → 400.
- **A empresa do contexto vem de `assert_tenant()` com o JWT do usuário** — o placeholder `00000000-0000-0000-0000-000000000001` é recusado (`FORBIDDEN_TENANT`), e toda consulta de contexto filtra `company_id` explicitamente, porque roda com service role.
- **A chave de idempotência da tela identifica a conversa** — `chaveMensagemIa(semente, { agente, mensagens })`; a semente troca depois de cada resposta concluída, então o duplo envio da mesma conversa cai na mesma reserva.
- **Pergunta sem dado suficiente não chama o modelo** — `validateDataSufficiency` responde por agente com a contagem de registros e o que cadastrar (HTTP 200, `no_data: true`); a falha ao gravar essa linha em `ai_logs` não impede a resposta.
- **O log é redigido, o prompt não** — `contexto_enviado` passa por `redactSensitiveContext` (contas bancárias sem saldo, contas a pagar/receber sem fornecedor/cliente, produtos e fichas só como contagem). O prompt recebe o contexto inteiro, só com `sanitizeDbString` (marcadores de injeção em inglês trocados por `[BLOCKED]`, cada texto cortado em 500 caracteres) e a instrução de tratar os dados como texto, não como ordem.

## Commands, queries e eventos

- Commands: Edge `ai-chat`, ação única `send_message`. Corpo `{ messages, agente, idempotency_key, periodo? }`. Resposta normal: stream SSE do Gemini repassado. JSON para `no_data`, reenvio (`idempotent: true` + `resposta_ia`), `IN_PROGRESS` (409) e erros (`FORBIDDEN_RBAC`, `FORBIDDEN_TENANT`, `RATE_LIMITED`, `INVALID_API_KEY`, `GATEWAY_ERROR`, `LOG_RESERVE_FAILED`), interpretado na tela por `interpretarRespostaJsonIa`.
- Queries: nenhuma; não há tela de histórico.
- Eventos publicados: nenhum.

### Contexto montado pela Edge (como o código está em 2026-10-07)

- Todos os agentes: Fechamento de Caixa do mês, `metas_cmv` do mês e a contagem de produtos ativos (até 100).
- `estoque`, `geral`, `cmv`: movimentações `ATIVO` do mês (até 300), somadas em entradas e saídas. `estoque` e `geral` também recebem a lista de produtos com custos e os 5 inventários mais recentes.
- `compras`, `geral`: as 15 solicitações de compra (`solic_compra_mercado`) mais recentes.
- `ficha-tecnica`, `geral`: as 30 fichas ativas de maior custo.
- `salmao`, `geral`: `config_precificacao` (preço de referência do salmão). O agente de salmão não lê `salmon_entries` nem `salmon_manipulations`.
- `financeiro`, `geral`: `fin_lancamentos` do mês por `data_competencia` (até 300, sem cancelados), somados por tipo e status; 20 contas a pagar e 20 a receber; 20 contas bancárias ativas com `saldo_inicial`; orçamento do mês.
- `rh`, `geral`: colaboradores ativos (até 200) resumidos em total, folha bruta (soma de `salario`) e contagem por setor e cargo; banco de horas; férias e afastamentos; treinamentos.
- Mês de referência: o corrente em `America/Sao_Paulo`. `periodo` é aceito no corpo e gravado em `ai_logs.periodo`, mas não muda as consultas (a tela não o envia).
- Permissão: a Edge confere só `ia:<agente>:create`. Não confere a permissão de leitura dos módulos de onde o contexto vem (Financeiro, RH, Estoque, Compras…) — pendência aberta da auditoria (fase 2 do plano Padrão SaaS).
- Erro de consulta é ignorado e o bloco vem vazio. Hoje: `rh_treinamentos` não existe; `rh_banco_horas` não tem `saldo_minutos`, `tipo` nem `data`; contas a pagar e a receber filtram `status` `PENDENTE`/`VENCIDO`, que não são os status de título em aberto (CP `AGUARDANDO_APROVACAO`/`APROVADO`, CR `A_RECEBER`); férias filtram `PENDENTE`, e o pedido nasce `SOLICITADO`.
- Sem timeout na chamada ao Gemini, sem cota por empresa ou usuário e sem `max_tokens`; só a última mensagem é limitada (8.000 caracteres): [gemini.md](../integrations/providers/gemini.md), "Particularidades operacionais".

## Integrações

- Gemini (`ai-chat`, segredo `GEMINI_API_KEY` da plataforma, modelo `gemini-2.0-flash` fixo no código e desligado pelo Google em 2026-06-01: troca pendente na fase 2 do plano) → [gemini.md](../integrations/providers/gemini.md).

## Dependências

- Leitura direta, com service role e sem RPC ou view de contrato: Financeiro (`financeiro_fechamento_caixa`, `fin_lancamentos`, `fin_contas_pagar`, `fin_contas_receber`, `fin_contas`, `fin_orcamentos`), CMV (`metas_cmv`), Estoque (`produtos`, `movimentacoes_estoque`), Inventário (`inventarios`), Compras (`solic_compra_mercado`), Ficha Técnica (`ficha_componentes`, `config_precificacao`), RH (`rh_colaboradores`, `rh_banco_horas`, `rh_ferias_afastamentos`). Renomear coluna ou status nesses módulos esvazia o bloco sem erro visível.
- Acesso: `has_permission` (ACCESS_CONTROL) e `assert_tenant` (MULTI_TENANCY).

## Decisões

- Contrato RBAC da Edge (ações, mapa agente → chave, checklist para ação nova): `docs/rbac/ai-chat.md`.
