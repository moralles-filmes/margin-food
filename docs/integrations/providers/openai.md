# Provedor: OpenAI API

> Complementa `docs/standards/INTEGRATIONS.md` e não pode enfraquecê-lo.
> Registre só o que foi verificado na documentação oficial, com link. Nunca registre tokens, secrets ou ids sensíveis.

- Status: ativo no código, sem uso. A OpenAI é uma das três opções da IA da Cotação (`cotacao_ia_config.provider`, `supabase/migrations/20260624105000_cotacoes_integracoes_config.sql:20`). Em 2026-10-07, `cotacao_ia_config` não tinha nenhuma linha no banco de produção (conferido só por contagem, sem ler chave). Nenhuma empresa usa a OpenAI hoje.
- Tipo: oficial — API da própria OpenAI. Riscos conhecidos:
  - dados da cotação (itens, fornecedores, preços) saem para um terceiro;
  - a doc diz que logs de monitoramento de abuso ficam guardados por até 30 dias ([doc, Your data](https://developers.openai.com/api/docs/guides/your-data));
  - a chave é de cada empresa e paga por uso.
- Capacidade(s): geração de texto (LLM), sem efeito externo direto. O texto volta para a tela; quem envia ao fornecedor é o usuário, pelo WhatsApp.
- Porta implementada: o projeto não tem camada de portas. O adapter de fato é a função `callLLM` em `supabase/functions/cotacao-ia/index.ts:71-98`. O ramo OpenAI é `:83-97`, compartilhado com o Gemini (endpoint compatível do Google, `:85`). A chamada sai em `:244`. Consumidores: `runIA` em `src/hooks/useCotacoesStore.ts:292-302`, usado em `src/components/compras/cotacao/CotacaoWhatsappPanel.tsx:160` e `src/components/compras/cotacao/CotacaoSugestaoInteligente.tsx:90`.
- `ai-chat` não usa a OpenAI. Ele chama o Gemini pelo endpoint compatível com OpenAI do Google (`supabase/functions/ai-chat/index.ts:310`), modelo `gemini-2.0-flash` (`:317`), com a chave da plataforma `GEMINI_API_KEY` (`:101`, `:313`). Nenhuma função chama `api.openai.com` além de `cotacao-ia`.
- Documentação oficial: https://developers.openai.com/api/docs (o endereço antigo `platform.openai.com/docs` responde 301 para lá). Referência: https://developers.openai.com/api/reference/overview
- Versão da API em uso: `v1`, Chat Completions (`POST /v1/chat/completions`). Não há arquivo de config do adapter: a URL é literal em `supabase/functions/cotacao-ia/index.ts:84`. Modelo padrão `gpt-4o-mini` em `:27`; a empresa pode trocar por texto livre (`:157`). A doc recomenda a Responses API para projetos novos ([doc, Chat Completions](https://developers.openai.com/api/reference/resources/chat)). Em 2026-10-07, `gpt-4o-mini` não estava na lista de descontinuação ([doc, Deprecations](https://developers.openai.com/api/docs/deprecations)).
- Última verificação: 2026-10-07

## Capacidades verificadas

Responda com "sim", "não" ou "não documentado". Não presuma.

| Pergunta | Resposta | Fonte |
|---|---|---|
| Aceita chave de idempotência remota? | Não documentado. A referência de `POST /chat/completions` não lista header `Idempotency-Key`, e a visão geral da API também não. O `X-Client-Request-Id` existe, mas é só rastreio: "must be unique per request" e serve para o suporte ver se a requisição chegou. Não deduplica. | [Create chat completion](https://developers.openai.com/api/reference/python/resources/chat/subresources/completions/methods/create); [Overview, Debugging requests](https://developers.openai.com/api/reference/overview) |
| Tem consulta de status por id? | Sim, com limites. Chat Completions: `GET /chat/completions/{completion_id}` só devolve o que foi criado com `store: true`, e só pelo id que a API devolveu. Responses: `GET /v1/responses/{id}` com `background: true`, estados `queued`, `in_progress`, `completed`, `failed`, `cancelled`. O código não manda `store`, não guarda o id e não usa a Responses. | [Retrieve chat completion](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/retrieve); [Background mode](https://developers.openai.com/api/docs/guides/background) |
| Assina webhooks? Algoritmo e header? | Sim. Segue a especificação Standard Webhooks, com headers `webhook-id`, `webhook-timestamp` e `webhook-signature`. Algoritmo: não verificado nesta página (ela remete à especificação). O projeto não recebe webhooks da OpenAI. | [Webhooks](https://developers.openai.com/api/docs/guides/webhooks) |
| Garante ordem dos eventos? | Não documentado. | [Webhooks](https://developers.openai.com/api/docs/guides/webhooks) |
| Política de reentrega de webhooks | Sim. Sem 2xx ou sem resposta em poucos segundos, reenvia por até 72 horas com backoff exponencial. Redirect 3xx conta como falha. Pode entregar cópia duplicada; dedup pelo `webhook-id`. | [Webhooks](https://developers.openai.com/api/docs/guides/webhooks) |
| Limites de taxa | Sim. Por organização e por projeto, não por usuário. Medidos em RPM, RPD, TPM, TPD e IPM, com tiers de uso. Headers `x-ratelimit-*` na resposta. Requisição sem sucesso também conta no limite por minuto. | [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits); [Overview, Rate limits](https://developers.openai.com/api/reference/overview) |
| Sandbox disponível? | Não documentado. A doc não descreve ambiente de teste da API. As "sandboxes" da doc são ambientes de execução para agentes, outra coisa. | [Sandbox Agents](https://developers.openai.com/api/docs/guides/agents/sandboxes) |
| Permite revogar tokens? | Sim. Chaves são geridas em [API keys](https://platform.openai.com/settings/organization/api-keys). "Revocations of an API key take effect within a few seconds." | [Overview, Authentication](https://developers.openai.com/api/reference/overview) |

Outros pontos verificados na documentação:

- Dados enviados à API não treinam modelos, salvo opt-in ([Your data](https://developers.openai.com/api/docs/guides/your-data)).
- A Responses API guarda estado por 30 dias por padrão ou com `store: true` ([Your data](https://developers.openai.com/api/docs/guides/your-data)). A página de `POST /chat/completions` descreve o `store` mas não diz o valor padrão ([Create chat completion](https://developers.openai.com/api/reference/python/resources/chat/subresources/completions/methods/create)).
- Compatibilidade: a OpenAI evita mudanças incompatíveis dentro de uma versão principal "whenever reasonably possible" ([Overview](https://developers.openai.com/api/reference/overview)).
- Cobrança e cota também respondem 429. "Retrying billing, spend, or quota errors won't restore API access" ([Error codes](https://developers.openai.com/api/docs/guides/error-codes)).

## Autenticação e endpoints

- Como autentica: header `Authorization: Bearer <chave>` ([Overview, Authentication](https://developers.openai.com/api/reference/overview)). No código: `supabase/functions/cotacao-ia/index.ts:88`. Os headers opcionais `OpenAI-Organization` e `OpenAI-Project` não são enviados.
- De onde vem a chave: coluna `cotacao_ia_config.api_key`, texto puro, uma linha por empresa (`company_id` UNIQUE) (`supabase/migrations/20260624105000_cotacoes_integracoes_config.sql:19`, `:21`). A função lê com service role, filtrando `company_id` (`index.ts:148-152`). Não fica no Vault.
- Como a chave é gravada: RPC `save_cotacao_ia_config` (`SECURITY DEFINER`, `assert_tenant`, permissão), chamada por `src/hooks/useIntegracoesConfig.ts:92-94`. Campo em branco mantém a chave salva (`20260624105000_...sql:211`).
- Como a tela lê: RPC `get_cotacao_ia_config`, que devolve só `has_api_key` e os 4 últimos caracteres (`20260624105000_...sql:172-179`). Mas a tabela também é legível direto pelo PostgREST (ver "Particularidades operacionais").
- O que precisa de redaction:
  - o header `Authorization`;
  - a coluna `api_key` e qualquer objeto que a carregue (`cfg` em `index.ts:148-157`);
  - o corpo de erro do provedor, que hoje vai para o log (`index.ts:95`, `:246`).

  A URL não carrega segredo.
- Hosts permitidos (allowlist): `api.openai.com`, só HTTPS, URL fixa no código (`index.ts:84`). Não há allowlist explícita. Redirect não é bloqueado: o `fetch` não define `redirect` e segue o padrão `follow` (`index.ts:86-94`).
- Autenticação da nossa função (`cotacao-ia`): `verify_jwt = false` (`supabase/config.toml:18-19`). A função valida o JWT com `auth.getUser` e resolve o tenant com `assert_tenant` pelo cliente do usuário (`index.ts:48-60`, `supabase/functions/_shared/company-scope.ts`). Depois exige `compras:cotacao:manage` ou `system:global:manage` (`index.ts:134-136`).

## Webhooks

O projeto não recebe webhooks da OpenAI. A chamada é síncrona e não usa `background` (`index.ts:86-94`). Nenhuma função recebe evento de provedor (`docs/standards/INTEGRATIONS.md:467`).

- Como verificar a autenticidade: não se aplica hoje. Se um dia receber: a OpenAI assina pela especificação Standard Webhooks, com `webhook-id`, `webhook-timestamp` e `webhook-signature` ([Webhooks](https://developers.openai.com/api/docs/guides/webhooks)). Verifique sobre o corpo bruto, antes do `JSON.parse`.
- Campo que identifica a conta externa (→ `integration_connection.external_account_id`): não se aplica. A conexão é a linha de `cotacao_ia_config` da empresa. O projeto não guarda id de organização nem de projeto da OpenAI.
- Id de deduplicação do evento: não se aplica hoje. A doc indica o `webhook-id` ([Webhooks](https://developers.openai.com/api/docs/guides/webhooks)).
- Máquina de estados e transições válidas: não se aplica hoje. Para respostas em background, a doc descreve `queued` → `in_progress` → `completed` | `failed` | `cancelled` ([Background mode](https://developers.openai.com/api/docs/guides/background)).

## Mapeamento de erros

Não há normalização no código. Todo status não-2xx vira exceção `LLM_HTTP_<status>` (`index.ts:95`). A função responde HTTP 200 com `error: "LLM_ERROR"` e mensagem genérica (`index.ts:243-248`). Nada é repetido. A tabela mostra o mapeamento que INTEGRATIONS §9 e §15 exigem. A coluna "Retry?" segue a "Solution" da doc e as duas condições de §9.

| Erro do provedor | Erro normalizado | Retry? |
|---|---|---|
| 400 — requisição malformada ou parâmetro inválido ([Error codes](https://developers.openai.com/api/docs/guides/error-codes)) | `INTEGRATION_VALIDATION_ERROR` | Não |
| 401 — chave inválida, revogada, de outra organização ou IP fora da allowlist | `INTEGRATION_AUTH_ERROR` | Não. Não há token para renovar; a empresa precisa trocar a chave |
| 403 — país/região não suportado; `PermissionDeniedError` (sem acesso ao recurso) | `INTEGRATION_PERMISSION_ERROR` | Não |
| 404 — `NotFoundError`, "Requested resource does not exist". Na nossa chamada, o único recurso que varia é o modelo configurado pela empresa (`index.ts:157`) | `INTEGRATION_CONFIG_ERROR` | Não |
| 429 — "Rate limit reached for requests" ou "Slow down" | `INTEGRATION_RATE_LIMITED` | Sim, respeitando `Retry-After`, com backoff, jitter e limite de tentativas. Tentativa sem sucesso também conta no limite |
| 429 — "Credit balance exhausted", limite de gasto da organização ou do projeto, limite de uso da organização | `INTEGRATION_CONFIG_ERROR` | Não. A doc: repetir não restaura o acesso. Só o corpo do erro separa este caso do anterior |
| 500 — erro no servidor da OpenAI | `INTEGRATION_TRANSIENT_ERROR` | Sim, com backoff e limite. A doc: "Retry your request after a brief wait". Geração sem efeito externo; o custo de nova tentativa entra no limite |
| 503 — "Model temporarily overloaded" | `INTEGRATION_TRANSIENT_ERROR` | Sim, depois do `Retry-After` |
| Timeout ou queda de conexão (`APITimeoutError`, `APIConnectionError` na doc) | `INTEGRATION_TIMEOUT_UNKNOWN` | Não automático. Sem idempotência remota e sem `store`, não há como saber se a geração ocorreu e foi cobrada |
| 2xx sem `choices[0].message.content` | Hoje vira `EMPTY` com HTTP 200 (`index.ts:249`); normalizar como `INTEGRATION_PROVIDER_REJECTED` | Não |

A doc não cita 502 nem 504 ([Error codes](https://developers.openai.com/api/docs/guides/error-codes)).

## Particularidades operacionais

- **Chamada paga sem registro prévio — CONFIRMADO no código.** `cotacao-ia` chama o modelo sem gravar nada antes nem depois (`index.ts:242-251`). Não usa `ai_logs`, não tem chave derivada nem índice único. Contraria a regra do projeto: chamada paga de IA reserva a linha antes de chamar o modelo (`docs/standards/INTEGRATIONS.md:472`; o `ai-chat` faz isso). Clique duplo só é barrado na tela, por `ref` (`CotacaoWhatsappPanel.tsx:156-157`, `CotacaoSugestaoInteligente.tsx:86-87`). Duas abas ou um reenvio geram duas cobranças.
- **Sem timeout — CONFIRMADO no código** (`index.ts:86-94`, sem `signal`). Viola INTEGRATIONS §7. Uma resposta lenta segura a função até o limite do runtime.
- **Erros não normalizados e sem retry — CONFIRMADO no código** (`index.ts:95`, `:243-248`). 401, 429 de cota, 429 de taxa e 503 viram o mesmo `LLM_ERROR`, com HTTP 200. A tela mostra "Verifique a chave/modelo" até para sobrecarga do provedor. O `request_id` gerado em `:116` não volta nessa resposta.
- **Corpo de erro do provedor em log, sem redaction — CONFIRMADO no código.** Até 300 caracteres do corpo vão na mensagem da exceção (`index.ts:95`) e para o `console.error` (`:246`). Não verificado se o corpo de 401 da OpenAI contém trecho da chave.
- **Sem `max_tokens` no ramo OpenAI — CONFIRMADO no código** (`index.ts:89-93`). O ramo Anthropic limita a 1024 (`:76`). A saída, e o custo, só param no limite do modelo.
- **Sem cota por empresa nem registro de custo — CONFIRMADO no código.** A função não limita chamadas por usuário ou empresa e não lê `usage` da resposta (`index.ts:96-97`). O limite real é o da conta OpenAI da empresa.
- **Resposta sem validação de formato — CONFIRMADO no código** (`index.ts:96-97`). Viola INTEGRATIONS §7. Formato inesperado vira `EMPTY` em silêncio.
- **Redirect seguido e resposta sem limite de tamanho — CONFIRMADO no código** (`index.ts:86-97`). INTEGRATIONS §6 pede redirect desabilitado e limite de tamanho. O host é fixo e HTTPS.
- **Sem id de correlação com o provedor — CONFIRMADO no código** (`index.ts:86-97`). A função não envia `X-Client-Request-Id` nem registra o `x-request-id` da resposta. Com timeout, não há como pedir ao suporte que confirme se a requisição chegou ([Overview, Debugging requests](https://developers.openai.com/api/reference/overview)).
- **Chave legível pelo cliente via PostgREST — CONFIRMADO nas migrations e no catálogo de produção.**
  - `authenticated` tem SELECT, INSERT, UPDATE e DELETE na tabela (`supabase/migrations/20260624200000_cotacoes_grant_authenticated.sql:18`). A fase 7 só revogou TRUNCATE, REFERENCES, TRIGGER e MAINTAIN (`supabase/migrations/20260916133617_phase7_contain_non_rls_privileges.sql:49`). Não há ACL por coluna.
  - A policy permissiva `cotacao_ia_config_all` é `FOR ALL` para quem tem `compras:cotacao:manage`, `configuracoes:integracoes:manage` ou `system:global:manage` na empresa atual (`20260624105000_...sql:31-35`, reescrita em `20260806173000_fix_rls_auth_initplan_bulk.sql:133-135`).
  - Efeito: esses usuários leem `api_key` inteira com um `select` direto, contornando a RPC mascarada. Catálogo de produção conferido em 2026-10-07: `authenticated=arwd`, sem ACL de coluna, mesma policy.
  - A tela afirma o contrário: "A chave nunca aparece no app depois de salva" (`src/components/configuracoes/IntegracoesView.tsx:206`).
  - Hoje a tabela está vazia, então não há chave exposta.
- **Trocar o provedor mantém a chave antiga — CONFIRMADO no código.** A tela troca o provedor sem exigir chave nova (`IntegracoesView.tsx:170-191`). A RPC preserva a chave salva quando o campo vem em branco (`20260624105000_...sql:211`, `:221-223`). Resultado: uma chave da OpenAI passa a ser enviada ao Google (`index.ts:83-88`), e vice-versa. Viola INTEGRATIONS §5 ("Cada credencial só é enviada aos endpoints autorizados daquele provedor").
- **Chave em texto puro, fora do Vault — CONFIRMADO na migration** (`20260624105000_...sql:21`). INTEGRATIONS §5 pede Vault ou criptografia em envelope.
- **Nomes e preços de fornecedores vão para o provedor — CONFIRMADO no código.** A análise de preços sempre manda `allow_competitor_context: true` (`CotacaoSugestaoInteligente.tsx:90`), e a função inclui nome e preço de cada fornecedor (`index.ts:224-226`). As mensagens levam nome do fornecedor e itens (`:191-192`). Entradas do banco passam por `sanitize`: cortadas em 400 caracteres e sem marcadores de papel (`:44-46`).
- **Modelo livre por empresa — CONFIRMADO no código** (`index.ts:157`). A RPC só remove espaços. Modelo inexistente vira `LLM_ERROR` genérico.
- **Sem fallback automático entre provedores — CONFIRMADO no código** (`index.ts:156`). Usa só o provedor salvo, conforme INTEGRATIONS §9.
- **Publicado diverge do repositório — CONFIRMADO na versão publicada** (versão 4, conferida em 2026-10-07). A versão publicada não usa `withRequestCors`, não recusa método diferente de POST (repositório: `index.ts:115`) e não confere se `fornecedor_id` é da cotação (repositório: `:171-173`). Ela guarda `corsHeaders` numa variável de módulo reatribuída a cada requisição. O ramo OpenAI de `callLLM` é idêntico nas duas.
