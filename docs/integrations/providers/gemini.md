# Provedor: Google Gemini API (Generative Language API)

> Complementa `docs/standards/INTEGRATIONS.md` e não pode enfraquecê-lo.
> Registre só o que foi verificado na documentação oficial, com link. Nunca registre tokens, secrets ou ids sensíveis.

- Status: ativo — `ai-chat` e `cotacao-ia` publicadas. Atenção: o modelo fixo no código foi desligado pelo Google (ver "Particularidades operacionais", item 1).
- Tipo: oficial — riscos conhecidos: o endpoint usado é a camada de compatibilidade OpenAI, que o Google declara em beta ("Support for the OpenAI libraries is still in beta", [openai](https://ai.google.dev/gemini-api/docs/openai)); modelos são desligados em data fixa e o endpoint deixa de existir ([deprecations](https://ai.google.dev/gemini-api/docs/deprecations)); na camada gratuita o conteúdo enviado é usado pelo Google ([pricing](https://ai.google.dev/gemini-api/docs/pricing), [terms](https://ai.google.dev/gemini-api/terms)).
- Capacidade(s): geração de texto (LLM). `ai-chat`: chat com streaming SSE, chave da plataforma. `cotacao-ia`: geração sem streaming, chave por empresa (Gemini é um dos três provedores; os outros são Anthropic e OpenAI).
- Porta implementada: nenhuma — o projeto não tem camada de portas. O adapter de fato é:
  - `supabase/functions/ai-chat/index.ts:309-341` — `fetch` inline no handler (URL na linha 310, modelo na 317, tratamento de erro em 330-341) e leitura do stream em 350-385;
  - `supabase/functions/cotacao-ia/index.ts:71-98` — função `callLLM`; o ramo Gemini/OpenAI é 82-97 (URL do Gemini na linha 85).
- Documentação oficial: https://ai.google.dev/gemini-api/docs e https://ai.google.dev/gemini-api/docs/openai
- Versão da API em uso: `v1beta`, endpoint de compatibilidade OpenAI `POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`; modelo `gemini-2.0-flash` — **não centralizada**: URL e modelo fixos em `ai-chat/index.ts:310` e `:317`; em `cotacao-ia/index.ts:85` (URL) e `:25-29` (`MODEL_DEFAULTS`), com o modelo podendo ser trocado por empresa em `cotacao_ia_config.model` (`cotacao-ia/index.ts:157`).
- Última verificação: 2026-10-07

## Capacidades verificadas

Responda com "sim", "não" ou "não documentado". Não presuma.

| Pergunta | Resposta | Fonte |
|---|---|---|
| Aceita chave de idempotência remota? | Não documentado. A referência de `generateContent` e a página de compatibilidade OpenAI não descrevem campo nem header de idempotência. | [generate-content](https://ai.google.dev/api/generate-content), [openai](https://ai.google.dev/gemini-api/docs/openai) |
| Tem consulta de status por id? | Não documentado para a chamada síncrona que o projeto usa. A resposta traz `responseId`, mas nenhum método documentado consulta uma geração anterior por id. | [generate-content](https://ai.google.dev/api/generate-content) |
| Assina webhooks? Algoritmo e header? | Sim, só para operações assíncronas (Batch, Interactions, geração de vídeo): padrão Standard Webhooks, headers `webhook-id`, `webhook-timestamp`, `webhook-signature`; HMAC-SHA256 no webhook estático e JWT RS256 no dinâmico. Não se aplica ao uso do projeto (chamada síncrona). | [webhooks](https://ai.google.dev/gemini-api/docs/webhooks) |
| Garante ordem dos eventos? | Não documentado. Não se aplica ao projeto. | [webhooks](https://ai.google.dev/gemini-api/docs/webhooks) |
| Política de reentrega de webhooks | Reentrega por 24 horas com backoff exponencial; deduplicar pelo header `webhook-id`. Não se aplica ao projeto. | [webhooks](https://ai.google.dev/gemini-api/docs/webhooks) |
| Limites de taxa | Sim. RPM, TPM (entrada) e RPD, aplicados **por projeto do Google Cloud, não por chave**; variam por modelo e por tier (Free, Tier 1, 2, 3); RPD reinicia à meia-noite do horário do Pacífico; excedido → 429. Valores vigentes só no AI Studio. | [rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits) |
| Sandbox disponível? | Não documentado. Existe a camada gratuita (Free tier), que é o serviço real: o conteúdo é usado para melhorar produtos do Google e pode ser lido por revisores humanos. | [pricing](https://ai.google.dev/gemini-api/docs/pricing), [terms](https://ai.google.dev/gemini-api/terms) |
| Permite revogar tokens? | Sim. A chave é desativada ou excluída no Cloud console; chave reportada como vazada é bloqueada pelo Google ("Your API key was reported as leaked. Please use another API key."). | [api-key](https://ai.google.dev/gemini-api/docs/api-key), [troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting) |

## Autenticação e endpoints

- Como autentica: header `Authorization: Bearer <chave>` no endpoint de compatibilidade OpenAI — é o que o código faz (`ai-chat/index.ts:313`, `cotacao-ia/index.ts:88`). A API nativa usa o header `x-goog-api-key` ([api-key](https://ai.google.dev/gemini-api/docs/api-key)). O Google Cloud também aceita a chave no parâmetro `key` da query string, e alerta que isso expõe a chave na URL ([api-keys-use](https://docs.cloud.google.com/docs/authentication/api-keys-use)). O projeto **não** usa query string.
- Onde fica a chave:
  - `ai-chat`: segredo `GEMINI_API_KEY` da Edge Function (`ai-chat/index.ts:101`). Uma chave da plataforma para todas as empresas.
  - `cotacao-ia`: coluna `cotacao_ia_config.api_key`, texto puro (`supabase/migrations/20260624105000_cotacoes_integracoes_config.sql:21`), lida com service role (`cotacao-ia/index.ts:148-152`).
- Tipos de chave ([api-key](https://ai.google.dev/gemini-api/docs/api-key)): standard (ligada ao projeto) e authorization (ligada a uma service account). Desde 2026-05-28 as chaves novas do AI Studio nascem como authorization; a API rejeita chave standard sem restrição; desde 2026-05-07 chaves sem restrição e paradas há muito tempo ficam bloqueadas. A página não diz se a chave authorization funciona com `Authorization: Bearer` no endpoint de compatibilidade OpenAI — não verificado. O tipo e as restrições da chave da plataforma e das chaves das empresas não foram verificados.
- O que precisa de redaction:
  - o header `Authorization` (contém a chave);
  - o corpo da requisição (contexto financeiro, de RH e de compras da empresa);
  - a URL não contém segredo: host e path são fixos e a chave vai no header.
- Hosts permitidos (allowlist): `generativelanguage.googleapis.com` (HTTPS, porta 443), fixo no código (`ai-chat/index.ts:310`, `cotacao-ia/index.ts:85`). Não há allowlist formal nem bloqueio de redirect: o `fetch` usa o padrão (segue redirects).

## Webhooks

O projeto **não recebe webhook do Gemini**. As duas funções fazem chamada síncrona: `ai-chat` com streaming SSE (`stream: true`, `ai-chat/index.ts:322`) e `cotacao-ia` sem streaming. O Gemini só oferece webhook para operações assíncronas que o projeto não usa (ver tabela acima).

- Como verificar a autenticidade: não se aplica — nenhum webhook recebido.
- Campo que identifica a conta externa (→ `integration_connection.external_account_id`): não se aplica. Não existe `integration_connection`; a chave por empresa fica em `cotacao_ia_config`, uma linha por `company_id` (UNIQUE, migration `20260624105000:19`).
- Id de deduplicação do evento: não se aplica.
- Máquina de estados e transições válidas: não há webhook. O único estado local é o da chamada no `ai-chat`, em `ai_logs.metadata.status`: `PENDING → DONE | ERROR`; `PENDING` há mais de 2 minutos conta como abandonado e libera a chave (`ai-chat/index.ts:407`, `409-417`). O `cotacao-ia` não registra estado.

## Mapeamento de erros

A tabela com códigos HTTP da documentação é a da Interactions API ([api-errors](https://ai.google.dev/gemini-api/docs/api-errors)); a regra de retry é a do guia de troubleshooting: repetir só erros transitórios (`429`, `408`, `5xx`) com backoff exponencial, nunca `400`, `402` ou `403` ([troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)). Códigos e formato de erro específicos do endpoint de compatibilidade OpenAI: não documentados. A coluna "Erro normalizado" usa o vocabulário de INTEGRATIONS §15.

| Erro do provedor | Erro normalizado | Retry? |
|---|---|---|
| 400 — requisição malformada ou parâmetro inválido | `INTEGRATION_VALIDATION_ERROR` | Não |
| 400 — pré-condição não atendida (ex.: billing desativado) | `INTEGRATION_CONFIG_ERROR` | Não |
| 401 — chave ausente, inválida ou expirada (tabela da Interactions API) | `INTEGRATION_AUTH_ERROR` | Não |
| 402 — crédito pré-pago esgotado | `INTEGRATION_CONFIG_ERROR` | Não |
| 403 — chave sem permissão para o recurso | `INTEGRATION_PERMISSION_ERROR` | Não |
| Chave reportada como vazada (código HTTP não documentado) | `INTEGRATION_AUTH_ERROR` | Não — trocar a chave |
| 404 — recurso ou modelo não encontrado (modelo desligado: código HTTP não documentado) | `INTEGRATION_CONFIG_ERROR` | Não |
| 408 | `INTEGRATION_TRANSIENT_ERROR` | Sim, com backoff e limite de tentativas |
| 429 — limite por minuto ou cota diária excedidos | `INTEGRATION_RATE_LIMITED` | Sim, com backoff; a cota diária (RPD) só volta à meia-noite do Pacífico |
| 500 — erro interno | `INTEGRATION_TRANSIENT_ERROR` | Sim, com backoff |
| 503 — serviço sobrecarregado ou fora | `INTEGRATION_TRANSIENT_ERROR` | Sim, com backoff |
| 504 — prazo excedido | `INTEGRATION_TIMEOUT_UNKNOWN` | Sim pela documentação (5xx) |
| Timeout local, queda de conexão ou stream interrompido depois do 200 | `INTEGRATION_TIMEOUT_UNKNOWN` | Só por ação do usuário: sem idempotência remota nem consulta por id, cada nova tentativa pode ser cobrada (cobrança de tentativa falha: não documentado) |

Hoje no código:

- `ai-chat/index.ts:330-341`: `429 → RATE_LIMITED`, `403 → INVALID_API_KEY`, qualquer outro status → `GATEWAY_ERROR`. O status do Google vai ao navegador quando é menor que 500 (linha 340), e vira 500 a partir daí. 401 e 400 (chave inválida, segundo a documentação) caem em `GATEWAY_ERROR`, não em `INVALID_API_KEY`. O corpo do erro do Google vai para o log (até 500 caracteres, linha 338), não para o cliente.
- `ai-chat/index.ts:325-327` e `390-393`: falha de transporte marca o log como `ERROR` e responde 500 com a mensagem da exceção.
- `cotacao-ia/index.ts:95` lança `LLM_HTTP_<status>`; `243-247` converte qualquer falha (HTTP ou transporte) em **HTTP 200** com `success: false, error: "LLM_ERROR"` e mensagem genérica. O status do Google só aparece no log (`console.error`, linha 246, com até 300 caracteres do corpo). Resposta vazia → `EMPTY`, também HTTP 200 (linha 249).
- Nenhuma das duas faz retry automático.

## Particularidades operacionais

Riscos marcados **CONFIRMADO no código** foram lidos no repositório (arquivo:linha). Nada aqui foi testado em produção.

1. **Modelo desligado.** `gemini-2.0-flash` está fixo em `ai-chat/index.ts:317` e é o padrão do `cotacao-ia` (`cotacao-ia/index.ts:26`) para empresa com provedor Gemini e `model` vazio. Pela documentação, esse modelo foi desligado em 2026-06-01, com `gemini-3.6-flash` como substituto recomendado; "Once a model is 'shutdown', it is completely turned off, and the endpoint is no longer available" ([deprecations](https://ai.google.dev/gemini-api/docs/deprecations)). A versão publicada do `ai-chat` (v10, lida em 2026-10-07) usa o mesmo modelo. **CONFIRMADO no código.** O erro devolvido hoje em produção não foi verificado.
2. **Sem timeout.** Nenhum `fetch` ao Google tem `AbortSignal` (`ai-chat/index.ts:310-324`, `cotacao-ia/index.ts:86-94`). No `ai-chat`, a reserva `PENDING` é considerada abandonada após 2 minutos (`ai-chat/index.ts:407`, `416`): uma chamada mais lenta que isso permite que um reenvio reivindique a linha e chame o Google de novo enquanto a primeira ainda corre. **CONFIRMADO no código.**
3. **Sem cota por empresa.** O `ai-chat` usa uma chave da plataforma para todas as empresas e não limita chamadas por empresa nem por usuário. Como o Google limita por projeto, uma empresa pode esgotar a cota de todas (429) e gerar custo sem teto. O `cotacao-ia` também não limita, mas o custo cai na chave da própria empresa. **CONFIRMADO no código** (ausência de limitador); limite por projeto conforme [rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits).
4. **Sem `max_tokens`.** As chamadas ao endpoint de compatibilidade não limitam a saída (`ai-chat/index.ts:316-323`, `cotacao-ia/index.ts:89-93`). Só o ramo Anthropic do `cotacao-ia` limita (`max_tokens: 1024`, linha 76). **CONFIRMADO no código.**
5. **Histórico do cliente sem validação.** O `ai-chat` repassa ao Google todo o array `messages` vindo do navegador (`ai-chat/index.ts:320`). Só a última mensagem é limitada a 8.000 caracteres (`126-129`); quantidade de mensagens, tamanho das anteriores e `role` (inclusive `system`) não são validados. Risco de custo e de injeção de prompt. **CONFIRMADO no código.**
6. **Orçamento de contexto não aplicado.** `CONTEXT_BUDGET.MAX_TOTAL_BYTES` (60.000, `ai-chat/index.ts:26`) só é gravado na metadata (`:229`). O limite efetivo são os `limit()` de cada consulta e o corte de 500 caracteres por campo (`sanitizeDbString`, `:76`). **CONFIRMADO no código.**
7. **Resultado ambíguo vira `ERROR`, não `UNKNOWN`.** Falha de transporte (`ai-chat/index.ts:326`), stream interrompido (`:359`) e cancelamento pelo cliente (`:382`) marcam `ERROR`, e `ERROR` libera a chave (`:412`). Como o Google não tem idempotência remota nem consulta por id, o reenvio é nova chamada cobrada. Não há efeito externo além do custo. **CONFIRMADO no código.**
8. **Idempotência opcional no `ai-chat`.** Sem `idempotency_key`, o servidor gera um UUID aleatório (`ai-chat/index.ts:162`) e não há deduplicação. O front envia a chave (`src/components/CentralIAView.tsx:201`). A unicidade vem do índice `idx_ai_logs_idempotency (company_id, user_id, idempotency_key)` (`supabase/migrations/20260302194208_019efc69-16d9-4bd5-bc5a-4873ef7443d0.sql:13-14`). **CONFIRMADO no código.**
9. **`cotacao-ia` não registra a chamada paga.** Não grava em `ai_logs`, não reserva antes da chamada e não usa chave de idempotência (`cotacao-ia/index.ts:242-248`): cada clique é uma nova chamada cobrada na chave da empresa. Diverge de `.claude/rules/integracoes.md` (chamada paga de IA registrada antes do envio). **CONFIRMADO no código.**
10. **Chave da empresa legível pelo PostgREST.** `cotacao_ia_config.api_key` é texto puro (migration `20260624105000:21`). A policy `cotacao_ia_config_all` é `FOR ALL TO authenticated` (`20260624105000:31-35`, reescrita em `20260806173000_fix_rls_auth_initplan_bulk.sql:133-135`) e há `GRANT ALL` a `authenticated` (`20260624200000_cotacoes_grant_authenticated.sql:18`; `20260916133617_phase7_contain_non_rls_privileges.sql:49` só revoga `TRUNCATE`, `REFERENCES`, `TRIGGER` e `MAINTAIN`). Quem tem `compras:cotacao:manage`, `configuracoes:integracoes:manage` ou `system:global:manage` na empresa lê a chave inteira com um SELECT direto, contornando o mascaramento de `get_cotacao_ia_config`. Diverge de INTEGRATIONS §3 e §5. **CONFIRMADO nas migrations do repositório**; a ACL do banco vivo não foi verificada.
11. **Modelo e provedor livres no `cotacao-ia`.** O modelo é texto livre por empresa, sem allowlist (`cotacao-ia/index.ts:157`). Qualquer provedor diferente de `openai` e `anthropic` cai no endpoint do Google (`:83-85`); o CHECK do banco limita a `gemini`, `openai` e `anthropic` (migration `20260624105000:20`). **CONFIRMADO no código.**
12. **Status de erro perdido no `cotacao-ia`.** Toda falha do provedor vira HTTP 200 com `LLM_ERROR` (`cotacao-ia/index.ts:243-247`); a tela não distingue chave inválida, cota esgotada ou modelo inexistente. **CONFIRMADO no código.**
13. **Erros do Google repassados ao navegador no `ai-chat`.** 4xx do Google chega ao navegador com o mesmo status (`ai-chat/index.ts:340`): um 401 do Google chega como 401. Sem `GEMINI_API_KEY`, a mensagem `GEMINI_API_KEY not configured` vai ao cliente (`:150` → `:392`); revela o estado da configuração, não a chave. **CONFIRMADO no código.** O efeito no front não foi verificado.
14. **Política de endpoint incompleta.** Sem bloqueio de redirect e sem limite de tamanho de resposta; o `ai-chat` acumula o stream inteiro em memória (`ai-chat/index.ts:351`, `376`). **CONFIRMADO no código.**
15. **Resposta sem validação de schema.** O `ai-chat` extrai `choices[0].delta.content` e ignora linhas malformadas (`ai-chat/index.ts:422-436`); o `cotacao-ia` lê `choices[0].message.content` e devolve `EMPTY` se o formato mudar (`cotacao-ia/index.ts:97`, `249`). **CONFIRMADO no código.**
16. **Desligamento.** O `cotacao-ia` respeita `cotacao_ia_config.ativo` por empresa (`cotacao-ia/index.ts:153-155`). O `ai-chat` não tem kill switch além das permissões `ia:<agente>:create` (`ai-chat/index.ts:131-142`) e da remoção do segredo. **CONFIRMADO no código.**

Dados enviados ao Google (o que o código faz):

- **`ai-chat`** — só dados da empresa do usuário: o tenant vem de `assert_tenant` com o JWT do usuário (`ai-chat/index.ts:144`), e toda consulta de contexto filtra `company_id` (`gatherContext`, `:482-700`). Vai no prompt (`:305-306`, `:738`):
  - faturamento diário do mês;
  - `metas_cmv` e `config_precificacao` com `select("*")` (`:510`, `:571`);
  - até 100 produtos com custos (`:516-518`, enviados nos agentes estoque e geral, `:540`);
  - fichas técnicas, solicitações de compra e inventários;
  - totais financeiros;
  - até 20 contas a pagar com `fornecedor` e `descricao` (`:615-616`) e até 20 a receber com `cliente` e `descricao` (`:623-624`);
  - contas bancárias com `saldo_inicial` (`:631-632`);
  - no RH: total da folha e contagem por setor e cargo (`:653-665`) — nomes e salários individuais não vão ao prompt —, férias e afastamentos com `colaborador_id`, tipo e datas (`:680-684`), e treinamentos;
  - o histórico da conversa e o texto livre do usuário (`:320`).

  Dados pessoais possíveis: nome de cliente ou fornecedor pessoa física, id de colaborador com tipo e período de afastamento, e o que o usuário digitar. A redaction de `redactSensitiveContext` (`:441-477`) vale só para o log em `ai_logs`, não para o prompt. **CONFIRMADO no código.**
- **`cotacao-ia`** — tudo filtrado pela empresa (`cotacao-ia/index.ts:160-179`):
  - código e título da cotação;
  - nomes e quantidades dos itens;
  - nome do fornecedor destinatário (`gerar_mensagem`);
  - matriz de preços por fornecedor (`analise_precos`), com os nomes dos fornecedores só se o cliente enviar `allow_competitor_context: true` (`:141`, `:224`).

  **CONFIRMADO no código.**
- **Termos do Google** ([terms](https://ai.google.dev/gemini-api/terms)):
  - nos serviços gratuitos, o conteúdo é usado para melhorar produtos, revisores humanos podem lê-lo e o Google pede "Do not submit sensitive, confidential, or personal information to the Unpaid Services";
  - nos pagos, o conteúdo não é usado para melhorar produtos e fica registrado por tempo limitado, só para detectar abuso.

  Se o projeto da chave da plataforma está no tier pago: **não verificado**. No `cotacao-ia`, o tier depende da chave que cada empresa cadastra, e o sistema não tem como saber.
