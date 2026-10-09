# Provedor: Have I Been Pwned — Pwned Passwords (range API)

> Complementa `docs/standards/INTEGRATIONS.md` e não pode enfraquecê-lo.
> Registre só o que foi verificado na documentação oficial, com link. Nunca registre tokens, secrets ou ids sensíveis.

- Status: ativo
- Tipo: oficial — API pública do próprio Have I Been Pwned. Riscos conhecidos: serviço gratuito sem SLA documentado; fica atrás da Cloudflare, que pode responder 503 ([doc, Response codes](https://haveibeenpwned.com/API/v3#ResponseCodes)).
- Capacidade(s): verificação de senha vazada (segurança de credenciais). Consulta só de leitura, sem efeito externo.
- Porta implementada: o projeto não tem camada de portas. O adapter de fato é a função `checkPwnedPassword` em `supabase/functions/check-password/index.ts:44-73`, chamada em `:126`. O único consumidor é `checkServer` em `src/hooks/usePasswordValidation.ts:69-91`, usado em `src/pages/ResetPassword.tsx:43` e `src/components/AdminUsersView.tsx:257` e `:333`.
- Documentação oficial: https://haveibeenpwned.com/API/v3#PwnedPasswords
- Versão da API em uso: range API do Pwned Passwords, documentada na página da API v3 ("presently the current version"). A rota de range não leva versão no path: `GET https://api.pwnedpasswords.com/range/{5 primeiros caracteres do SHA-1}` ([doc](https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange)). Não há arquivo de config do adapter: a URL é literal em `supabase/functions/check-password/index.ts:55`.
- Última verificação: 2026-10-07

## Capacidades verificadas

Responda com "sim", "não", "não documentado" ou "não se aplica (consulta só de leitura)". Não presuma.

| Pergunta | Resposta | Fonte |
|---|---|---|
| Aceita chave de idempotência remota? | Não se aplica (consulta só de leitura). É um `GET` sem efeito; repetir não muda nada no provedor. | [doc, range](https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange) |
| Tem consulta de status por id? | Não se aplica (consulta só de leitura). A resposta é síncrona e não gera id. | [doc, range](https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange) |
| Assina webhooks? Algoritmo e header? | Não se aplica. O range API não envia webhook, e o projeto não recebe nenhum. | [doc](https://haveibeenpwned.com/API/v3#PwnedPasswords); `docs/standards/INTEGRATIONS.md:467` |
| Garante ordem dos eventos? | Não se aplica. Não há eventos. | — |
| Política de reentrega de webhooks | Não se aplica. Não há webhooks. | — |
| Limites de taxa | Sem limite: "There is no rate limit on the Pwned Passwords API." O 429 com `retry-after` vale para as APIs de breaches, pastes e stealer logs. Abuso nessas APIs pode gerar bloqueio ou desafio da Cloudflare com 503. | [doc, Rate limiting](https://haveibeenpwned.com/API/v3#RateLimiting) |
| Sandbox disponível? | Não documentado para o Pwned Passwords. Os endereços de teste da doc são da busca por e-mail. Desnecessário aqui: consulta só de leitura, sem efeito. | [doc, Test accounts](https://haveibeenpwned.com/API/v3#TestAccounts) |
| Permite revogar tokens? | Não se aplica. O range API não usa chave: "freely accessible without the need for a subscription and API key". | [doc, Pwned Passwords](https://haveibeenpwned.com/API/v3#PwnedPasswords); [doc, Authorisation](https://haveibeenpwned.com/API/v3#Authorisation) |

Outros pontos verificados na documentação:

- Hash: SHA-1 (padrão) ou NTLM (`?mode=ntlm`). O prefixo de 5 caracteres não diferencia maiúsculas de minúsculas. A senha é codificada em UTF-8 antes do hash ([doc](https://haveibeenpwned.com/API/v3#PwnedPasswords), [NTLM](https://haveibeenpwned.com/API/v3#PwnedPasswordsNTLM)).
- Resposta: HTTP 200 com uma linha `SUFIXO:CONTAGEM` por hash que começa com o prefixo, cerca de 800 linhas. Todo prefixo de `00000` a `FFFFF` devolve 200; "there is no circumstance in which the API should return HTTP 404" ([doc](https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange)).
- `Add-Padding: true`: a resposta passa a ter entre 800 e 1.000 linhas, para o tamanho não revelar o prefixo. Linhas de padding têm contagem 0 e podem ser descartadas ([doc](https://haveibeenpwned.com/API/v3#PwnedPasswordsPadding)).
- User-Agent: "Each request to the API must be accompanied by a user agent request header." Sem ele, a resposta é 403. A regra está na visão geral da API e não traz exceção para o Pwned Passwords ([doc](https://haveibeenpwned.com/API/v3#UserAgent)).
- HTTPS obrigatório; só TLS 1.2 e 1.3. HTTP recebe 301 para HTTPS ([doc](https://haveibeenpwned.com/API/v3#HTTPS)).
- Consulta a cada tecla é desaconselhada: quem vê o tráfego na Cloudflare poderia deduzir a senha. A doc recomenda consultar só com a senha completa ([doc](https://haveibeenpwned.com/API/v3#PwnedPasswordsIncrementalSearching)).
- Sem exigência de licença ou atribuição para o Pwned Passwords ([doc](https://haveibeenpwned.com/API/v3#License)).

## Autenticação e endpoints

- Como autentica: nenhuma autenticação no HIBP. O range API não exige chave ([doc](https://haveibeenpwned.com/API/v3#Authorisation)). O código envia só o header `Add-Padding: true` (`supabase/functions/check-password/index.ts:56`).
- O que sai para o HIBP: só os 5 primeiros caracteres do SHA-1, no path da URL (`index.ts:47-51`, `:55`). A senha e o hash inteiro nunca saem. O sufixo (`index.ts:52`) só é comparado localmente (`:65`).
- O que precisa de redaction: não há credencial do provedor. Dados sensíveis estão do nosso lado: a senha em texto puro no body da chamada à função (`src/hooks/usePasswordValidation.ts:76-78`; `index.ts:118`), o hash SHA-1 completo e o sufixo (derivados da senha) e o header `Authorization` do usuário. Nenhum deles pode ir para log. Hoje a função não loga nada (nenhum `console.*` em `index.ts`).
- Autenticação da nossa função (`check-password`):
  - Publicada com `verify_jwt = true`: o gateway do Supabase confere o JWT antes da função. Ela fica fora do `supabase/config.toml`. Conferido em 2026-10-07 na lista de Edge Functions do projeto (versão 8, `verify_jwt: true`).
  - Dentro da função: exige `Authorization: Bearer` (`index.ts:88-93`) e valida o token com `auth.getUser(token)` num cliente com a anon key (`index.ts:95-110`). Sem usuário válido, 401.
  - Não usa service role e não lê nem grava dados de tenant. Não chama `assert_tenant`; o `x-company-id` é repassado (`index.ts:103`), mas não é usado.
  - Só aceita `POST` (`index.ts:81-85`). CORS por `_shared/cors.ts` e `_shared/request-cors.ts` (`index.ts:1`, `:3`, `:75-79`).
- Hosts permitidos (allowlist): `api.pwnedpasswords.com`, só HTTPS, URL fixa no código (`index.ts:55`). Redirect não é bloqueado: o `fetch` não define `redirect` e segue o padrão `follow`.

## Webhooks

Não há webhook. O range API do Pwned Passwords é consulta síncrona e não envia eventos. O projeto não recebe webhooks de nenhum provedor (`docs/standards/INTEGRATIONS.md:467`).

- Como verificar a autenticidade: não se aplica (sem webhook).
- Campo que identifica a conta externa (→ `integration_connection.external_account_id`): não se aplica. Não há conta, chave nem conexão por tenant; a consulta é anônima e da plataforma.
- Id de deduplicação do evento: não se aplica (sem eventos).
- Máquina de estados e transições válidas: não se aplica. Cada consulta tem um de dois resultados: vazada (`breached: true`) ou não vazada (`breached: false`). Hoje "não verificada" também vira `breached: false` (ver "Particularidades operacionais").

## Mapeamento de erros

O projeto não tem erro normalizado para este provedor. A tabela descreve o comportamento real do código. Nenhum caso é repetido automaticamente.

| Erro do provedor | Erro normalizado | Retry? |
|---|---|---|
| 200, sufixo encontrado com contagem > 0 | `breached: true`; erro "Essa senha aparece em N vazamentos" (`index.ts:63-67`, `:129-131`) | Não se aplica |
| 200, sufixo ausente ou com contagem 0 (padding) | `breached: false` (`index.ts:66`, `:69`) | Não se aplica |
| 403 (sem User-Agent, segundo a doc) | Nenhum: vira `breached: false`, sem log (`index.ts:58-61`) | Não |
| 429 (a doc diz que o Pwned Passwords não tem limite) | Nenhum: vira `breached: false`, sem log (`index.ts:58-61`) | Não |
| 503 (Cloudflare, serviço indisponível) | Nenhum: vira `breached: false`, sem log (`index.ts:58-61`) | Não |
| 404 ou outro não-2xx (a doc diz que o range nunca devolve 404) | Nenhum: vira `breached: false`, sem log (`index.ts:58-61`) | Não |
| Falha de rede, DNS ou TLS (exceção no `fetch`) | Nenhum: vira `breached: false`, sem log (`index.ts:70-72`) | Não |
| Sem resposta | Sem timeout no código: espera até o limite do runtime. Se a função cair, o cliente recebe erro e aprova a senha (`usePasswordValidation.ts:79-82`) | Não |

## Particularidades operacionais

- **Fail-open no servidor — CONFIRMADO no código.** Qualquer resposta não-2xx do HIBP e qualquer exceção viram `{ breached: false, count: 0 }` (`supabase/functions/check-password/index.ts:58-61`, `:70-72`). A resposta da função não distingue "não vazada" de "não verificada" (`index.ts:133-138`). Com o HIBP fora, toda senha passa como não vazada.
- **Fail-open no cliente — CONFIRMADO no código.** `checkServer` aprova (`return true`) em qualquer erro da chamada: 401, 405, 429 e 500 da própria função, ou queda de rede (`src/hooks/usePasswordValidation.ts:79-82`, `:85-87`). Efeito: depois de 10 tentativas no minuto, o 429 do rate limit da função (`index.ts:112-116`) faz a senha passar sem consulta.
- **A verificação é só consultiva — CONFIRMADO no código.** Quem grava a senha não repete a consulta:
  - redefinição pelo próprio usuário: `supabase.auth.updateUser` direto do navegador (`src/pages/ResetPassword.tsx:50`);
  - reset por admin: `admin-users`, ação `reset-password`, só exige 12 caracteres (`supabase/functions/admin-users/index.ts:135-136`);
  - criação de usuário: só exige 12 caracteres (`supabase/functions/_shared/company-users.ts:39`).

  Chamar esses caminhos sem passar por `check-password` grava senha vazada. A proteção nativa de senha vazada do Supabase Auth está desligada (`docs/standards/SECURITY.md:182`), então não há segunda barreira.
- **Sem timeout no `fetch` — CONFIRMADO no código** (`index.ts:55-57`). Viola INTEGRATIONS §7 ("Nada de chamada sem timeout"). Uma resposta lenta segura a função até o limite do runtime; se ela cair, o cliente aprova a senha (item acima).
- **Sem User-Agent explícito — CONFIRMADO no código** (`index.ts:55-57`). A doc exige o header e responde 403 sem ele. A função depende do User-Agent padrão do runtime. Se o runtime não mandar um, toda consulta cai no fail-open em silêncio.
- **Resposta sem validação de formato — CONFIRMADO no código** (`index.ts:62-69`). Viola INTEGRATIONS §7 (validar a resposta do provedor). Se o formato mudar (outro separador, sufixo em minúsculas), nenhuma linha casa e o resultado vira `breached: false` em silêncio. A comparação diferencia maiúsculas: o hash é convertido para maiúsculas (`index.ts:49`), igual à amostra da doc.
- **Rate limit só em memória — CONFIRMADO no código** (`index.ts:9-11`, `:13-23`, `:112`).
  - Um `Map` por instância, com chave `user.id`, janela fixa de 60 s e 10 tentativas.
  - Não é compartilhado entre instâncias e zera a cada cold start.
  - Não há limpeza das entradas vencidas.
  - Só usuário autenticado chega ao limitador; antes disso a resposta é 401.
- **Falha invisível — CONFIRMADO no código.** Os `catch` descartam o erro sem log (`index.ts:70`, `:141`). Bom para o sigilo da senha, mas uma indisponibilidade do HIBP ou um 403 constante não aparece em lugar nenhum.
- **Redirect seguido — CONFIRMADO no código** (`index.ts:55-57`, sem `redirect: 'manual'`). INTEGRATIONS §6 pede redirects desabilitados. O host é fixo e HTTPS.
- **CSP libera o HIBP sem uso — CONFIRMADO no código.** `vercel.json:12` inclui `https://api.pwnedpasswords.com` no `connect-src`, mas nenhum código em `src/` chama o HIBP direto. A consulta sai só da Edge Function.
- **Publicado diverge do repositório — CONFIRMADO na versão publicada** (versão 8, conferida em 2026-10-07). A versão publicada não usa `withRequestCors` e guarda `corsHeaders` numa variável de módulo reatribuída a cada requisição. O repositório usa o wrapper (`index.ts:1`, `:75-76`). A lógica do HIBP (`checkPwnedPassword`) é idêntica nas duas.
- **Conforme a doc — CONFIRMADO no código.**
  - Usa k-anonymity: só o prefixo de 5 caracteres sai (`index.ts:51`, `:55`).
  - Pede padding (`index.ts:56`).
  - Descarta linhas de padding pela contagem 0 (`index.ts:66`).
  - Consulta só no envio do formulário, não a cada tecla (`src/pages/ResetPassword.tsx:43`; `src/components/AdminUsersView.tsx:257`, `:333`).
