# Provedor: Anthropic (Claude API — Messages API)

> Complementa `docs/standards/INTEGRATIONS.md` e não pode enfraquecê-lo.
> Registre só o que foi verificado na documentação oficial, com link. Nunca registre tokens, secrets ou ids sensíveis.

- Status: ativo no código, opcional por empresa. Só entra em uso quando a empresa grava provedor `anthropic` e chave em `cotacao_ia_config`. Uso real em produção: não verificado por este documento (a auditoria registrou 0 linhas configuradas no banco vivo — AUD-010, `.saas-audit/FINDINGS.md:33`).
- Tipo: oficial (API pública da Anthropic) — riscos conhecidos: modelo padrão do código já aposentado; chave da empresa legível via PostgREST; dados da cotação enviados ao provedor. Detalhes em "Particularidades operacionais".
- Capacidade(s): geração de texto por LLM, sem efeito externo. O envio por WhatsApp é outra função (`send-whatsapp-zapi`).
- Porta implementada: o projeto não tem camada de portas. Adapter de fato: função `callLLM()` em `supabase/functions/cotacao-ia/index.ts:71-98`; ramo Anthropic em `:72-81`. A mesma função atende OpenAI e Gemini (`:82-97`).
- Uso no projeto: só a Edge Function `cotacao-ia` (tarefas `gerar_mensagem` e `analise_precos`, `index.ts:22`), chamada por `runIA` em `src/hooks/useCotacoesStore.ts:292-302`. `ai-chat` não usa Anthropic: chama Gemini com a chave da plataforma (`supabase/functions/ai-chat/index.ts:101`, `:310`, `:317`). Nenhuma outra função referencia Anthropic.
- Documentação oficial: https://platform.claude.com/docs/en/api/overview
- Versão da API em uso: `anthropic-version: 2023-06-01`, a mais recente listada em https://platform.claude.com/docs/en/api/versioning — literal em `supabase/functions/cotacao-ia/index.ts:75` (não há arquivo de config do adapter). Modelo: `cotacao_ia_config.model` da empresa ou, se vazio, `claude-3-5-haiku-20241022` (`:28`, `:157`).
- Última verificação: 2026-10-07

## Capacidades verificadas

Responda com "sim", "não" ou "não documentado". Não presuma.

| Pergunta | Resposta | Fonte |
|---|---|---|
| Aceita chave de idempotência remota? | não documentado. A referência de `POST /v1/messages` lista só os headers `anthropic-workspace-id` e `anthropic-user-profile-id`; nenhum header ou campo de idempotência. | https://platform.claude.com/docs/en/api/messages/create |
| Tem consulta de status por id? | não, na Messages API: a chamada é síncrona e a API expõe só `POST /v1/messages`. Sim, no Message Batches: `GET /v1/messages/batches/{id}`, `processing_status` `in_progress` → `canceling` → `ended`, resultados por 29 dias. O projeto não usa Batches. | https://platform.claude.com/docs/en/api/overview ; https://platform.claude.com/docs/en/build-with-claude/batch-processing |
| Assina webhooks? Algoritmo e header? | não se aplica à Messages API (não tem webhooks). Os webhooks da Anthropic são de Managed Agents (beta): headers `webhook-id`, `webhook-timestamp`, `webhook-signature`, segredo com prefixo `whsec_`; o algoritmo não é nomeado na página. O projeto não usa. | https://platform.claude.com/docs/en/managed-agents/webhooks |
| Garante ordem dos eventos? | não se aplica à Messages API. Webhooks de Managed Agents: não ("Ordering is not guaranteed"). | https://platform.claude.com/docs/en/managed-agents/webhooks |
| Política de reentrega de webhooks | não se aplica à Messages API. Managed Agents: até 3 tentativas, backoff exponencial com jitter de 5 a 120 s; depois o evento é descartado sem aviso. | https://platform.claude.com/docs/en/managed-agents/webhooks |
| Limites de taxa | sim. Por organização e por modelo: RPM, ITPM e OTPM por tier, algoritmo token bucket. Excesso → 429 com `retry-after`. Teto mensal do tier → 429 sem `retry-after` (`error.details.error_code = enforced_spend_limit_reached`). Limite de gasto definido pelo cliente → 400. Workspaces aceitam limites menores. | https://platform.claude.com/docs/en/api/rate-limits |
| Sandbox disponível? | não documentado. A documentação indica workspaces para separar ambientes e controlar gasto; o uso é cobrado normalmente. | https://platform.claude.com/docs/en/api/overview |
| Permite revogar tokens? | sim. Console → Settings → API keys: **Disable** (reversível) ou **Delete** (permanente). Expiração opcional definida na criação; chave expirada responde 401. A Admin API expõe `status` e `expires_at`. | https://platform.claude.com/docs/en/manage-claude/authentication |
| Versão vigente do header `anthropic-version` | `2023-06-01`. Header obrigatório; versões anteriores são tratadas como depreciadas. | https://platform.claude.com/docs/en/api/versioning |

## Autenticação e endpoints

- Como autentica: chave de API em header. A documentação atual indica `Authorization: Bearer <chave>` e mantém `x-api-key` como "legacy fallback, still supported". O código usa `x-api-key` (`cotacao-ia/index.ts:75`). Fontes: https://platform.claude.com/docs/en/api/overview e https://platform.claude.com/docs/en/manage-claude/authentication
- Headers obrigatórios: `anthropic-version` e `content-type: application/json`, ambos enviados (`:75`). `anthropic-workspace-id` é obrigatório para chave que não está presa a um workspace; o código não envia (ver "Particularidades operacionais").
- Origem da chave: uma por empresa, em `cotacao_ia_config.api_key` (texto puro). A função resolve o tenant pelo JWT do usuário via `assert_tenant` (`index.ts:48-60`), exige `compras:cotacao:manage` ou `system:global:manage` (`:134`) e lê `provider, api_key, model, ativo` com service role filtrando `company_id` (`:148-152`). Sem chave ou com `ativo = false`, devolve `IA_NOT_CONFIGURED` (`:153-155`). Não há chave global da Anthropic no ambiente.
- Gravação da chave: só pela RPC `save_cotacao_ia_config`, que preserva a chave quando o campo vem vazio; a leitura pela tela usa `get_cotacao_ia_config`, que devolve só os 4 últimos caracteres (`supabase/migrations/20260624105000_cotacoes_integracoes_config.sql:148-229`; `src/hooks/useIntegracoesConfig.ts:60`, `:92`). O acesso direto à tabela contorna essa máscara (ver "Particularidades operacionais").
- O que precisa de redaction: o header `x-api-key` (ou `Authorization`), a coluna `cotacao_ia_config.api_key` e o objeto `cfg` inteiro. A chave não vai na URL. O log de erro (`:246`) leva o status e até 300 caracteres do corpo da resposta (`:78`). O corpo de erro documentado traz `type`, `message` e `request_id` (https://platform.claude.com/docs/en/api/errors). Não verificado se alguma mensagem de erro ecoa parte da chave.
- Hosts permitidos (allowlist): `api.anthropic.com`, em URL literal (`:73`). Não há allowlist configurável, e o `fetch` não usa `redirect: "error"` (`:73-77`).
- Endpoint usado: só `POST /v1/messages`, sem streaming, `max_tokens: 1024`, `system` + uma mensagem `user` (`:76`). O ramo Anthropic não envia `temperature`; o ramo OpenAI/Gemini envia 0.6 (`:91`).
- Limite de tamanho: 32 MB por requisição na Messages API (https://platform.claude.com/docs/en/api/errors). Os prompts do projeto ficam muito abaixo disso (cada campo do banco é cortado em 400 caracteres, `:45`).

## Webhooks

O projeto não recebe webhooks da Anthropic. A integração é uma chamada síncrona: a resposta HTTP é o resultado.

- Como verificar a autenticidade: não se aplica.
- Campo que identifica a conta externa (→ `integration_connection.external_account_id`): não se aplica. Não existe `integration_connection`; a conexão é a linha de `cotacao_ia_config` da empresa (`company_id` único).
- Id de deduplicação do evento: não se aplica.
- Máquina de estados e transições válidas: não se aplica. Cada chamada termina em texto ou em erro, e nada é persistido.
- Se um dia o projeto adotar Managed Agents, os webhooks deles seguem as linhas de webhook da tabela acima e as regras de INTEGRATIONS (corpo bruto, dedup por `event.id`, sem ordem garantida).

## Mapeamento de erros

Hoje o código não distingue erros. Qualquer resposta não-2xx vira exceção (`cotacao-ia/index.ts:78`), e o `catch` (`:243-248`) devolve ao cliente HTTP 200 com `success: false, error: "LLM_ERROR"` e a mesma mensagem ("Verifique a chave/modelo"). Não há retry. A coluna "Retry?" registra o que a documentação permite; nada disso está implementado.

| Erro do provedor | Erro normalizado | Retry? |
|---|---|---|
| 400 `invalid_request_error` — formato ou conteúdo inválido; limite de gasto definido pelo cliente atingido; falta de `anthropic-workspace-id` | `LLM_ERROR` | Não |
| 401 `authentication_error` — chave malformada, revogada ou expirada | `LLM_ERROR` | Não |
| 402 `billing_error` | `LLM_ERROR` | Não |
| 403 `permission_error` | `LLM_ERROR` | Não |
| 404 `not_found_error` — recurso ou modelo não encontrado | `LLM_ERROR` | Não |
| Modelo aposentado — "Requests to retired models will fail"; o código HTTP exato não está na página de depreciação | `LLM_ERROR` | Não |
| 409 `conflict_error` | `LLM_ERROR` | Só depois de resolver o conflito (documentação) |
| 413 `request_too_large` — acima de 32 MB | `LLM_ERROR` | Não |
| 429 `rate_limit_error` com `retry-after` | `LLM_ERROR` | Sim, depois do `retry-after` ("Earlier retries will fail") |
| 429 `rate_limit_error` sem `retry-after`, `enforced_spend_limit_reached` | `LLM_ERROR` | Não — falha até 00:00 UTC do dia 1º do mês seguinte ou até subir de tier |
| 500 `api_error` | `LLM_ERROR` | Sim, com backoff exponencial |
| 504 `timeout_error` | `LLM_ERROR` | Sim (5xx transitório); a documentação recomenda streaming para requisições longas |
| 529 `overloaded_error` | `LLM_ERROR` | Sim, com backoff exponencial |
| Falha de rede, sem resposta | `LLM_ERROR` (a exceção do `fetch` cai no mesmo `catch`) | Sim — geração sem efeito externo; se a tentativa perdida é cobrada não está documentado |
| HTTP 200 com `stop_reason: "refusal"` (classificador de segurança; não é erro HTTP) | `EMPTY` (`:249`) quando o 1º bloco não traz texto; senão, sucesso | Não |
| HTTP 200 com `stop_reason: "max_tokens"` | sucesso com texto cortado — o código não lê `stop_reason` | Não; aumentar `max_tokens` |

Fontes: https://platform.claude.com/docs/en/api/errors (códigos; "The official SDK automatically retries transient failures (such as connection errors, rate limits, and 5xx server errors) with exponential backoff"), https://platform.claude.com/docs/en/api/rate-limits (429, `retry-after`, teto de gasto), https://platform.claude.com/docs/en/about-claude/model-deprecations (modelo aposentado), https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons (`refusal` e `max_tokens`).

## Particularidades operacionais

Riscos confirmados no código em 2026-10-07. Este documento não corrige nenhum deles.

- **Modelo padrão aposentado — CONFIRMADO no código.** `MODEL_DEFAULTS.anthropic = "claude-3-5-haiku-20241022"` (`cotacao-ia/index.ts:28`) vale sempre que a empresa deixa o modelo em branco (`:157`). A Anthropic aposentou esse modelo em 2026-02-19, e requisições a modelo aposentado falham. Substituto indicado pela Anthropic: `claude-haiku-4-5-20251001` (retirada "not sooner than October 15, 2026"). A tela sugere `claude-3-5-haiku` como exemplo de modelo (`src/components/configuracoes/IntegracoesView.tsx:183`). Fonte: https://platform.claude.com/docs/en/about-claude/model-deprecations
- **Chave da empresa legível e gravável pelo cliente — CONFIRMADO no código (migrations).** `api_key` é `text` em texto puro (`supabase/migrations/20260624105000_cotacoes_integracoes_config.sql:21`). A policy `cotacao_ia_config_all` é `FOR ALL TO authenticated` para quem tem `compras:cotacao:manage`, `configuracoes:integracoes:manage` ou `system:global:manage` na empresa atual (`:31-35`; reescrita em `20260806173000_fix_rls_auth_initplan_bulk.sql:133-135`). `authenticated` recebeu `GRANT ALL` (`20260624200000_cotacoes_grant_authenticated.sql:18`), e a fase 7 só revogou `TRUNCATE, REFERENCES, TRIGGER, MAINTAIN` (`20260916133617_phase7_contain_non_rls_privileges.sql:33`, `:49`). Assim, `select api_key` via PostgREST devolve a chave inteira e contorna a máscara de `get_cotacao_ia_config`; `UPDATE` e `DELETE` diretos também passam. Já registrado como AUD-010 (`.saas-audit/FINDINGS.md:33`), que confirmou o `SELECT` da coluna no banco vivo.
- **Sem timeout — CONFIRMADO no código.** O `fetch` (`index.ts:73-77`) não tem `AbortSignal`. Uma resposta lenta segura a Edge Function até o limite da própria plataforma (limite não verificado aqui). Ver AUD-016.
- **Sem retry e sem classificação de erro — CONFIRMADO no código.** Todo não-2xx vira `LLM_ERROR`, com HTTP 200 e a mesma mensagem (`:78`, `:243-248`). 429 com `retry-after`, 5xx e 529 não são repetidos. Chave revogada e sobrecarga aparecem iguais para o usuário. O header `request-id` da resposta não é capturado.
- **Sem registro antes da chamada e sem controle de custo — CONFIRMADO no código.** A função não grava nada no banco. O `requestId` (`:116`) é aleatório por requisição, não vai ao provedor e não é persistido. Cada clique gera uma nova chamada cobrada na conta da empresa, sem cota por empresa nem trilha de uso. Diverge da regra de INTEGRATIONS para chamada paga de IA (reserva antes da chamada, como o `ai_logs` do `ai-chat`). Ver AUD-016.
- **Resposta lida só pelo 1º bloco, sem `stop_reason` — CONFIRMADO no código.** O texto vem de `j?.content?.[0]?.text` (`:80`), com `max_tokens: 1024` (`:76`). Texto cortado por `max_tokens` volta como sucesso. Em modelos com thinking ligado por padrão (Opus 5.5 e Sonnet 5.5, entre outros), o thinking chega em blocos `thinking` antes do texto e conta dentro de `max_tokens`; o código devolveria `EMPTY` mesmo com resposta pronta. A empresa pode escolher esses modelos em `cfg.model`. `claude-haiku-4-5` roda sem thinking quando o parâmetro é omitido. Fontes: https://platform.claude.com/docs/en/build-with-claude/thinking e https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
- **Header de workspace ausente — CONFIRMADO no código.** A chamada envia só `Content-Type`, `x-api-key` e `anthropic-version` (`:75`). Chave pessoal ou de service account sem workspace fixo exige `anthropic-workspace-id`; sem ele, toda chamada recebe 400. Fonte: https://platform.claude.com/docs/en/manage-claude/authentication (seção "Select a workspace").
- **`x-api-key` é o formato legado — CONFIRMADO no código.** `:75`. Ainda é aceito; a documentação atual prefere `Authorization: Bearer`. Risco baixo.
- **Modelo em texto livre — CONFIRMADO no código.** `save_cotacao_ia_config` valida só o provedor (`20260624105000_cotacoes_integracoes_config.sql:206-208`) e grava `model` como veio (`:218`). Um erro de digitação só aparece como `LLM_ERROR` genérico.
- **Versão e host fixos no código — CONFIRMADO no código.** URL e `2023-06-01` são literais (`index.ts:73`, `:75`), sem config central. A versão é a vigente hoje.
- **Dados de negócio enviados ao provedor — CONFIRMADO no código.** O prompt leva código e título da cotação, itens, quantidades e o nome do fornecedor destinatário; na análise, os preços por fornecedor, com nomes reais se `allow_competitor_context` for verdadeiro (`:189-239`, em especial `:224-226`). Cada campo é cortado em 400 caracteres e perde marcadores de papel (`:44-46`). Retenção e uso desses dados pela Anthropic: não verificado neste documento.
- **Sem fake adapter nem teste — CONFIRMADO no código.** Nenhum teste referencia `cotacao-ia`, e previews e dev usam o banco de produção (AUD-015). Qualquer teste manual dispara uma chamada real e cobrada na chave da empresa.

Comportamentos esperados (não são riscos):

- Os limites de taxa e de gasto são os da organização Anthropic dona de cada chave. Cada empresa responde pelos próprios limites e custos (https://platform.claude.com/docs/en/api/rate-limits).
- Não existe fallback entre provedores: cada empresa usa um provedor por vez (`index.ts:156`), em linha com INTEGRATIONS.
