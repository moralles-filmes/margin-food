# Provedor: Z-API (WhatsApp não oficial)

> Complementa `docs/standards/INTEGRATIONS.md` e não pode enfraquecê-lo.
> Registra só o que foi verificado no código (arquivo:linha) ou na documentação oficial (link). Nunca registre tokens, ids de instância nem telefones.
> `index.ts:N` = `supabase/functions/send-whatsapp-zapi/index.ts`, linha N. Migrations ficam em `supabase/migrations/`.

- Status: ativo no código (Edge `send-whatsapp-zapi` publicada). Quantas empresas têm configuração em produção: não verificado neste documento.
- Tipo: **não oficial**. Funciona sobre o protocolo do WhatsApp Web ([Z-API vs API Oficial](https://developer.z-api.io/tips/Z-APIvsAPI-OFICIAL)). Riscos conhecidos: depende de uma sessão do WhatsApp em um aparelho; o número pode ser bloqueado ou sofrer shadowban ([Bloqueios e Banimentos (2026)](https://developer.z-api.io/tips/blockednumbernew)); termos de uso do WhatsApp.
- Capacidade: messaging (só envio de texto).
- Uso no projeto: WhatsApp da Cotação de Compras para fornecedores. Tipos aceitos: `SOLICITACAO_COTACAO`, `COBRANCA_RESPOSTA`, `NEGOCIACAO`, `FECHAMENTO_PEDIDO`, `CONFIRMACAO_PRAZO` (`index.ts:28-34`). Tela: `src/components/compras/cotacao/CotacaoWhatsappPanel.tsx`.
- Porta implementada: não implementado. Não há porta `MessagingProvider` nem adapter separado; a chamada HTTP fica em `enviarZapi` (`index.ts:131-168`).
- Documentação oficial: https://developer.z-api.io (índice: https://developer.z-api.io/llms.txt).
- Versão da API em uso: a Z-API não versiona a URL. Base documentada: `https://api.z-api.io/instances/{instanceId}/token/{token}` ([Introdução da API](https://developer.z-api.io/api-reference/introduction)). No projeto, a URL é montada em `index.ts:281-282`.
- Última verificação: 2026-10-07 (código e documentação oficial).

## Capacidades verificadas

| Pergunta | Resposta | Fonte |
|---|---|---|
| Aceita chave de idempotência remota? | Não documentado. O `send-text` só aceita `phone`, `message`, `delayMessage`, `delayTyping` e `editMessageId`. Trate como "não". | [Enviar texto simples](https://developer.z-api.io/message/send-text) |
| Tem consulta de status por id? | Não documentado. O índice da API não tem endpoint de status por `messageId`. Existe a listagem da fila, que só mostra mensagens ainda não processadas. | [Índice](https://developer.z-api.io/llms.txt), [Fila](https://developer.z-api.io/queue/post-queue) |
| Assina webhooks? Algoritmo e header? | Não documentado. As páginas de webhook não citam assinatura, HMAC nem header de autenticação. Exigem POST e HTTPS. | [Webhooks](https://developer.z-api.io/webhooks/introduction), [Ao enviar](https://developer.z-api.io/webhooks/on-message-send) |
| Garante ordem dos eventos? | Não documentado para webhooks. A fila de envio "organiza e ordena" as mensagens até o WhatsApp. Não presuma ordem de eventos. | [Fila — introdução](https://developer.z-api.io/queue/introduction) |
| Política de reentrega de webhooks | Não documentado. | [Webhooks](https://developer.z-api.io/webhooks/introduction) |
| Limites de taxa | Nenhum limite numérico documentado na API. A fila espaça as mensagens com intervalo aleatório de 1 a 3 s (`delayMessage` aceita 1 a 15 s). Com o celular desconectado, a fila aceita até 1000 mensagens e depois recusa novas. Boas práticas: intervalo inicial de 5 min entre disparos e volume diário crescente. | [Fila — introdução](https://developer.z-api.io/queue/introduction), [Boas práticas](https://developer.z-api.io/tips/best-practices) |
| Sandbox disponível? | Não documentado. | [Índice](https://developer.z-api.io/llms.txt) |
| Permite revogar tokens? | Não documentado para o token da instância. O token de segurança da conta (`Client-Token`) e a restrição por IP são ativados no painel. | [Token de segurança](https://developer.z-api.io/security/client-token), [Restrição por IP](https://developer.z-api.io/security/ip-block) |

## Autenticação e endpoints

- Como autentica:
  - id e token da instância no **path**: `/instances/{instanceId}/token/{token}/send-text` ([ID e Token](https://developer.z-api.io/security/introduction)).
  - header `Client-Token` com o token de segurança da conta. A referência da API o lista em todas as requisições. A página de segurança diz que ele nasce desativado; depois de ativado, requisição sem ele recebe `{"error": "null not allowed"}` (status HTTP não documentado) ([Token de segurança](https://developer.z-api.io/security/client-token)).
  - A Z-API orienta chamar só do servidor, nunca do frontend. O projeto cumpre: só a Edge chama a Z-API.
- No projeto:
  - URL em `index.ts:281-282`. O header `Client-Token` só vai quando a empresa o configurou (`index.ts:138`). `Content-Type: application/json` em `index.ts:137`.
  - Credenciais por empresa em `cotacao_zapi_config` (`instance_id`, `token`, `client_token`, `base_url`, `default_phone`, `ativo`), em texto puro, uma linha por empresa (`20260624100100_cotacoes_schema.sql:296-307`). A Edge lê com service role (`index.ts:266-270`).
  - Vault ou criptografia em envelope: não implementado.
  - `integration_connection`: não existe no projeto. O registro de conexão é a própria linha de `cotacao_zapi_config`.
  - Configuração pela tela Configurações → Integrações (`src/components/configuracoes/IntegracoesView.tsx`), via RPCs `get_cotacao_zapi_config` (devolve só os 4 últimos caracteres dos segredos) e `save_cotacao_zapi_config` (campo em branco preserva o segredo salvo) — `20260624105000_cotacoes_integracoes_config.sql:51-145`.
- O que precisa de redaction: a **URL inteira**, porque o token vai no path, e o header `Client-Token`. Vale para log, trace, Sentry, mensagem de erro de `fetch` e exceção serializada.
  - Hoje: erro de transporte não é registrado cru (`index.ts:148-153`). Falha ao gravar o desfecho registra só `request_id`, `log_id` e status (`index.ts:372`). O `catch` geral (`index.ts:395`) registra a exceção, mas nenhum caminho depois de montar a URL lança erro que a contenha.
  - Ao alterar: nunca registre `url`, `headers` nem o erro cru do `fetch`.
- Hosts permitidos (allowlist):
  - Documentado: `https://api.z-api.io`.
  - No projeto: **sem allowlist**. O host vem de `cotacao_zapi_config.base_url`, editável por empresa, com padrão `https://api.z-api.io` (`index.ts:281`). Ver "Particularidades operacionais".
  - Redirects bloqueados: `redirect: "error"` (`index.ts:143`).
  - Recomendação do padrão (INTEGRATIONS §6), host fixo `api.z-api.io` no servidor: não implementado.

## Envio

Fluxo da Edge `send-whatsapp-zapi`:

1. Valida o JWT e resolve a empresa; bloqueia o tenant placeholder (`index.ts:75-96`, `203-216`).
2. Exige `compras:cotacao:manage` ou `system:global:manage` (`index.ts:221-227`).
3. Confere que a cotação e o fornecedor são da empresa (`index.ts:247-263`).
4. Lê a configuração. Sem configuração ou com `ativo = false`, devolve `ZAPI_NOT_CONFIGURED` sem registrar nada (`index.ts:266-279`).
5. Registra a tentativa `PENDING` com a chave de idempotência **antes** de chamar a Z-API (`index.ts:292-305`).
6. Faz um único `POST send-text` com `{ phone, message }` (`index.ts:141-147`, `357`).
7. Grava o desfecho e, na solicitação inicial, marca o fornecedor como `ENVIADO` (`index.ts:361-381`, `170-189`).

Regras:

- **Idempotência só local.** A Z-API não deduplica. A defesa é `cotacao_whatsapp_logs`, com índice único `uq_cotacao_wa_logs_company_idempotency` em `(company_id, idempotency_key)` (`20260929183000_idempotencia_compras_cotacao_inventario.sql:66-68`).
  - A chave é derivada no cliente da semente + conteúdo (`useChavesPendentes('cotacao-whatsapp')`, `CotacaoWhatsappPanel.tsx:54`) e precisa casar com `^[A-Za-z0-9_:.|-]{16,128}$` (`index.ts:66`).
  - Mesma chave com conteúdo diferente (cotação, fornecedor, tipo, telefone ou texto) devolve `REQUEST_ID_REUTILIZADO` (`index.ts:118-124`, `321-328`).
  - Requisição sem chave (front antigo) ganha um UUID aleatório: a tentativa é registrada, mas o reenvio não é reconhecido (`index.ts:239-245`).
- **Timeout explícito:** 20 s (`index.ts:144`).
- **Classificação** (`index.ts:126-168`):
  - 2xx → `SENT`. Significa "aceita pela Z-API", não "entregue". Ver "Particularidades operacionais".
  - 4xx → `ERROR`. O projeto assume que nada saiu.
  - 5xx, timeout, queda de conexão e redirect → `UNKNOWN`. A mensagem pode ter saído.
- **Reenvio com a mesma chave** (`index.ts:309-351`):
  - `SENT` → não envia de novo; responde `idempotent: true`.
  - `PENDING` ou `UNKNOWN` → não envia de novo; responde "incerto".
  - `ERROR` → envia de novo. Um `UPDATE` condicional (`status = 'ERROR'`) garante que só um reenvio concorrente reivindica a nova tentativa.
- **Resultado ambíguo vira `UNKNOWN` e não reenvia sem confirmação.** Não há reconciliação automática: a Z-API não documenta consulta de status por id e o projeto não recebe webhooks. A tela manda conferir a conversa no WhatsApp (`CotacaoWhatsappPanel.tsx:122-125`). Reenviar exige decisão consciente do usuário, que troca a semente da chave (`CotacaoWhatsappPanel.tsx:99`, `143-149`).
- **Sem retry automático.** A Edge faz uma única chamada. Mantenha assim: sem idempotência remota, repetir pode duplicar (INTEGRATIONS §8 e §9).
- **Nunca fazer fallback automático para Meta (ou vice-versa)** quando houver chance de duplicar a mensagem. O projeto não tem integração com a Cloud API da Meta.
- Desligar sem deploy:
  - por empresa: `cotacao_zapi_config.ativo = false` (Configurações → Integrações). A Edge recusa antes de registrar (`index.ts:272`).
  - global: não implementado.
- Rate limit por instância ou por empresa: não implementado. Só existe a trava de duplo clique da tela (`CotacaoWhatsappPanel.tsx:86-87`).
- Health da instância ([Status da instância](https://developer.z-api.io/instance/status)): não implementado.
- Circuit breaker por instância (N2): não implementado.
- Validação da resposta por schema (INTEGRATIONS §7): não implementado. O corpo inteiro vai para `zapi_response` (`index.ts:155-161`, `365`); o `messageId` não é extraído para coluna própria.

## Webhooks

- O projeto **não recebe** webhooks da Z-API. Nenhuma função em `supabase/functions/` trata callback da Z-API (verificado por busca em 2026-10-07).
- O que a Z-API oferece ([Webhooks](https://developer.z-api.io/webhooks/introduction)):
  - Ao enviar (`DeliveryCallback`): avisa que a mensagem foi entregue ao WhatsApp, ou traz `error`/`errorCode` (ex.: número inexistente, `SHADOW_BAN`) ([exemplos](https://developer.z-api.io/webhooks/on-message-send-examples)).
  - Status da mensagem (`MessageStatusCallback`): `SENT`, `RECEIVED`, `READ`, `READ_BY_ME`, `PLAYED`, com `ids[]` ([Status da mensagem](https://developer.z-api.io/webhooks/on-whatsapp-message-status-changes)).
  - Ao receber, Ao conectar, Ao desconectar e Status do chat.
  - Só HTTPS e POST.
- Se um dia criar o receptor:
  - **Autenticidade:** a assinatura não é documentada. Use o fallback de INTEGRATIONS §12 ("Provedor que não assina webhooks"): segredo aleatório por conexão no path, comparação em tempo constante e rotação. Antes de agir sobre evento crítico, confirme pela API.
  - **Tenant:** vem da conexão identificada pelo segredo do path (→ linha de `cotacao_zapi_config` → `company_id`). O `instanceId` do payload só confere; nunca decide o tenant.
  - **Deduplicação:** `messageId` + `type` no Ao enviar; cada item de `ids[]` + `status` no Status da mensagem.
  - **Máquina de estados:** hoje `PENDING → SENT | ERROR | UNKNOWN`, e `ERROR → PENDING` no reenvio reivindicado. Com webhook: erro do Ao enviar é terminal; `RECEIVED` e `READ` nunca regridem. Eventos chegam duplicados e fora de ordem.

## Mapeamento de erros

| Erro do provedor | Erro normalizado | Retry? |
|---|---|---|
| HTTP 2xx (`zaapId`, `messageId`, `id`) | `SENT` | Não. Reenvio com a mesma chave devolve `idempotent: true`. |
| HTTP 4xx. Documentados: 400 (requisição inválida), 405 (método), 415 (`Content-Type`). Também `Client-Token` ausente (`null not allowed`) e IP não liberado (`[IP] not allowed`), com status HTTP não documentado. | `ERROR` | Não automático. O usuário pode reenviar com a mesma chave. |
| HTTP 5xx | `UNKNOWN` | Não. Só com confirmação do usuário e chave nova. |
| Timeout de 20 s | `UNKNOWN` (`ZAPI_TIMEOUT`) | Não. Idem. |
| Falha de transporte ou redirect | `UNKNOWN` (`ZAPI_TRANSPORT_FAILED`) | Não. Idem. |
| Corpo ilegível | classificação pelo status HTTP; corpo `ZAPI_BODY_UNREADABLE` | Conforme a classificação. |
| Erro assíncrono do webhook Ao enviar (número inexistente, `SHADOW_BAN`, rejeição do WhatsApp) | não recebido; o log fica `SENT` | — |
| Configuração ausente ou `ativo = false` (local, antes do envio) | `ZAPI_NOT_CONFIGURED` | — |

Fontes dos códigos: [Introdução da API](https://developer.z-api.io/api-reference/introduction), [Enviar texto simples](https://developer.z-api.io/message/send-text), [Token de segurança](https://developer.z-api.io/security/client-token), [Restrição por IP](https://developer.z-api.io/security/ip-block), [Bloqueios e Banimentos (2026)](https://developer.z-api.io/tips/blockednumbernew). Classificação no código: `index.ts:148-167`.

## Particularidades operacionais

Riscos que o código mostra:

- **Token legível pelo cliente — CONFIRMADO no código.** A policy `cotacao_zapi_config_all` é `FOR ALL` para quem tem `compras:cotacao:manage` (`20260624100100_cotacoes_schema.sql:313-317`; reescrita com as mesmas chaves em `20260806173000_fix_rls_auth_initplan_bulk.sql:160-163`). `authenticated` tem SELECT, INSERT, UPDATE e DELETE na tabela (`20260624200000_cotacoes_grant_authenticated.sql:17`; só TRUNCATE, REFERENCES, TRIGGER e MAINTAIN foram revogados em `20260916133617_phase7_contain_non_rls_privileges.sql:54`). Um `select` direto pelo PostgREST devolve `token` e `client_token` inteiros. O mascaramento das RPCs não protege o segredo.
- **`base_url` sem allowlist — CONFIRMADO no código.** Qualquer URL salva vira destino do POST, com o token no path e o `Client-Token` no header (`index.ts:281-282`, `138`). A tela deixa editar (`IntegracoesView.tsx:132-133`), a RPC aceita sem validar (`20260624105000_cotacoes_integracoes_config.sql:131`) e a policy aceita UPDATE direto. É SSRF a partir da Edge: o corpo da resposta volta ao cliente (`index.ts:380`, `392`) e fica em `zapi_response` (`index.ts:365`). Não há limite de tamanho da resposta (`index.ts:157`).
- **Log de tentativas gravável pelo cliente — CONFIRMADO no código.** A policy `cotacao_wa_logs_write` é `FOR ALL` para `compras:cotacao:manage` (`20260624100100_cotacoes_schema.sql:282-287`). Trocar `UNKNOWN` por `ERROR`, ou apagar a linha, libera o reenvio com a mesma chave e pode duplicar a mensagem.
- **Destino e texto livres, sem cota — CONFIRMADO no código.** Telefone e mensagem vêm do corpo da requisição, não do cadastro do fornecedor (`index.ts:232-233`); a tela deixa editar o telefone (`CotacaoWhatsappPanel.tsx:207`). Não há limite por usuário, empresa ou instância. Pela Z-API, o número de destinatários únicos é o principal fator de banimento ([Bloqueios e Banimentos (2026)](https://developer.z-api.io/tips/blockednumbernew)).
- **Telefone mal validado — CONFIRMADO no código.** A Edge só remove não dígitos e exige 10 dígitos ou mais (`index.ts:114-116`, `237`). Não exige DDI nem limita o tamanho. A Z-API pede DDI + DDD + número, só dígitos ([Enviar texto simples](https://developer.z-api.io/message/send-text)).
- **`SENT` não é entrega — CONFIRMADO no código.** Todo 2xx vira `SENT` sem conferir `messageId` no corpo (`index.ts:163`). Pela documentação, a Z-API aceita na fila mesmo com a instância desconectada (até 1000 mensagens) e envia quando o número reconecta ([Atualizar configuração da fila](https://developer.z-api.io/queue/update-queue-settings)). Falhas como número inexistente ou shadowban só chegam pelo webhook Ao enviar, que o projeto não recebe. A mensagem pode sair horas depois, ou nunca, e o histórico mostra "enviada". A opção `disableEnqueueWhenDisconnected` da instância evita o enfileiramento sem conexão; o projeto não a configura.
- **`PENDING` sem saída — CONFIRMADO no código.** Se a Edge cair entre o registro (`index.ts:295-305`) e a gravação do desfecho (`index.ts:361-369`), ou se essa gravação falhar (`index.ts:370-373`), a linha fica `PENDING` para sempre. Reenvio com a mesma chave responde "incerto" (`index.ts:333-336`). Não há job de reconciliação; só o reenvio consciente com chave nova resolve.
- **4xx tratado como "nada saiu" — CONFIRMADO no código.** Todo 4xx vira `ERROR` e libera reenvio (`index.ts:165`, `337-351`). A Z-API não documenta 408 nem 429. Se algum 4xx vier depois de a mensagem ser aceita, o reenvio duplica.
- **Sem chave, sem idempotência — CONFIRMADO no código.** Requisição sem `idempotency_key` recebe UUID aleatório (`index.ts:245`); repetir essa requisição manda de novo.

Limites e recomendações da Z-API (documentação; nada disso está implementado no projeto):

- Fila: intervalo aleatório de 1 a 3 s entre mensagens; `delayMessage` de 1 a 15 s. O projeto não envia `delayMessage` (`index.ts:146`).
- Boas práticas anti-bloqueio: intervalo inicial de 5 min entre disparos, volume diário crescente, horário comercial, identificar a empresa na mensagem, opção de descadastro e números separados para atendimento e disparo ([Boas práticas](https://developer.z-api.io/tips/best-practices)).
- Palavras como "boleto", "PIX" e "cartão" aumentam o risco de bloqueio ([Bloqueios e Banimentos (2026)](https://developer.z-api.io/tips/blockednumbernew)). Os modelos atuais (`src/lib/cotacaoTemplates.ts`) não usam essas palavras, mas o texto é editável antes do envio.
- Antes de reconectar uma instância, a Z-API recomenda verificar a fila: as mensagens pendentes saem automaticamente na reconexão ([Fila — introdução](https://developer.z-api.io/queue/introduction)).

Testes existentes: interpretação do resultado na tela (`src/domain/compras/cotacaoWhatsappEnvio.test.ts`) e cenários negativos de autenticação e permissão da Edge (`scripts/test-phase8-edges.mjs:42-50`). A classificação `SENT`/`ERROR`/`UNKNOWN` da Edge não tem teste automatizado.
