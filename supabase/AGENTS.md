<!-- GERADO por scripts/check-padrao.mjs --write-nested a partir de .claude/rules/. Não edite aqui: edite as rules e regenere. -->
# Regras para agentes ao trabalhar em supabase/

O Codex lê este arquivo. O Claude Code recebe as mesmas regras por `.claude/rules/`. As regras gerais estão no `AGENTS.md` da raiz.

## Banco de dados — ao tocar SQL ou migrations

Antes de criar ou alterar migration, policy, função ou índice, leia `docs/standards/DATABASE.md`, `docs/standards/MULTI_TENANCY.md` e, se a tabela pertence a um módulo, `docs/standards/ACCESS_CONTROL.md`. O modelo de tenant e de permissões deste projeto está em `.claude/tenancy-profile.yml` (híbrido A/C, não o arquétipo E dos exemplos do padrão).

Pontos que mais causam vazamento ou perda de dados:

- Migration já aplicada não é editada. Crie uma nova (forward-only). Neste repo, `supabase db push` está bloqueado desde o release F12: migration nova vai por MCP `apply_migration` + `supabase migration repair` na mesma sessão (AGENTS.md §3; procedimento em DATABASE, "Particularidades").
- Toda tabela nova em schema exposto recebe, na **mesma** migration: RLS habilitada e forçada, policies e GRANT só do DML necessário a `authenticated` (nunca `ALL`).
- Tabela da empresa filtra por `company_id = (select public.get_current_company_id())`. Não há filial.
- Policies de insert e update usam `with check`. Helpers (`get_current_company_id`, `has_permission`, `has_any_permission`) sempre dentro de `(select …)`.
- Gate de permissão no banco usa `has_any_permission(auth.uid(), [<chave granular da tela>, <legado>, 'system:global:manage'])`, com chave que exista em `src/permissions/registry.ts`.
- Relacionamento entre tabelas do mesmo tenant: FK simples não garante a mesma empresa e a checagem de FK ignora RLS. Em tabela nova, use FK composta `(company_id, <fk>)`; em RPC que recebe id de outra tabela, confira a empresa.
- Transição crítica (baixa, aprovação, estorno, cancelamento) não tem grant de update na coluna de estado: passa por RPC que confere a ação.
- Permissão nova: registry + `sync_permissions_from_registry` + concessão aos papéis admin/diretor/gerente_geral na mesma migration. Chave de permissão não é renomeada em lugar.
- Views em schema exposto usam `with (security_invoker = true)`.
- Funções `security definer`: `set search_path = ''`, nomes qualificados, `assert_tenant()` e filtro `company_id` em busca por id. Funções novas são executáveis por `PUBLIC`: revogue e conceda explicitamente.
- Invariantes que dependem do estado atual (saldo, estoque, status) são garantidas na mesma transação da mutação. Chave de idempotência exige índice único.
- Dia de negócio é `(now() at time zone 'America/Sao_Paulo')::date`, nunca `current_date`.
- Valores monetários em `numeric` ou centavos inteiros, nunca float.
- Migration remota exige autorização explícita. Depois de aplicar, rode os Advisors.

## Integrações — ao tocar código de provedor, webhook, OAuth ou MCP

Antes de alterar, leia `docs/standards/INTEGRATIONS.md` e o `docs/integrations/providers/<provider>.md` do provedor envolvido (hoje: `zapi.md`; Gemini, Anthropic, OpenAI e HaveIBeenPwned ainda sem documento). Confirme a versão vigente da API na documentação oficial; não codifique versão ou política de memória.

Pontos que mais causam incidente:

- O módulo depende de uma porta (capacidade). URL, token, SDK e formato do provedor ficam no adapter.
- **Webhook** (o projeto não recebe nenhum hoje; se criar):
  - verifique a autenticidade sobre o corpo **bruto**, antes de qualquer `JSON.parse`, com comparação em tempo constante;
  - o tenant vem da conexão vinculada à conta externa, nunca do payload;
  - persista o evento com dedup durável antes de responder 2xx e processe de forma assíncrona;
  - eventos chegam duplicados e fora de ordem: nenhum status regride.
- **Efeito externo** (WhatsApp, chamada paga de IA):
  - chave de idempotência com `company_id` e a intenção, registrada antes do envio (`cotacao_whatsapp_logs`, `ai_logs`);
  - resultado ambíguo vira `UNKNOWN` e é reconciliado antes de qualquer repetição.
- **Retry automático** só com erro transitório **e** repetição comprovadamente segura. Nunca em 4xx definitivo, validação ou autorização.
- **Fallback entre provedores** nunca é automático quando pode duplicar o efeito. Em IA, só em geração sem efeito externo.
- **Credenciais** só no servidor e nunca em logs. A Z-API põe o token no path da URL: redija a URL inteira.
- **Edge Function:** valide o JWT dentro da função (14 das 17 têm `verify_jwt = false` no `config.toml`; `check-password` e `rbac-lint-quick/-full` estão fora dele, publicadas com `verify_jwt = true`), resolva o tenant com o JWT do usuário (`assert_tenant`) antes de usar a service role, e filtre `company_id` em toda query do cliente admin. CORS só por `_shared/cors.ts`.
- **Testes, CI e previews** usam fake adapter ou sandbox. Nunca disparam efeito real.

## Segurança, acesso e multi-tenancy — ao tocar auth, permissões ou código de servidor

Antes de alterar, leia `docs/standards/SECURITY.md`, `docs/standards/MULTI_TENANCY.md` e `docs/standards/ACCESS_CONTROL.md`. O modelo do projeto está em `.claude/tenancy-profile.yml` e as regras detalhadas nas "Particularidades deste projeto" de MULTI_TENANCY, ACCESS_CONTROL e SECURITY (resumo no AGENTS.md §4).

Pontos que mais causam vazamento entre empresas ou escalada de privilégio:

- Autenticação, autorização e resolução de tenant são três verificações independentes.
- Na Edge Function, valide o usuário com o método que confere o token no Supabase Auth (`getUser()`/`getClaims()`), nunca só decodificando o JWT.
- A empresa ativa é indicada pelo header `x-company-id` (um cliente Supabase por empresa) e confirmada no banco por `get_current_company_id()`/`assert_tenant()`. O header só indica; quem concede é a membership ativa. Nunca leia a empresa de body, payload ou `profiles.company_id`.
- Permissão é `<modulo>:<submodulo>:<acao>`, por empresa, com ALLOW/DENY. O banco não expande `LEGACY_PERMISSION_MAP`: todo gate do banco inclui a chave granular que a tela usa. `useCan` no frontend é só UX.
- Dado operacional usa `useSupabase()`/`CompanyScopeProvider`, nunca o cliente global. Troca de empresa ou logout descarta o estado da empresa anterior.
- Campos de tenant, papel, permissão, preço, total e status vindos do cliente são ignorados ou revalidados. Nunca espalhe o body num insert/update.
- Tabelas de acesso não recebem escrita do cliente. Concessão só por `admin_upsert_company_membership`/`admin-users`: quem concede só concede o que tem; ninguém altera os próprios acessos; `system:global:manage` e `system:admin` só por quem já os detém.
- Service role / secret key ignora RLS: só na Edge Function, depois de resolver tenant e permissão com o JWT do usuário, filtrando `company_id` em toda query.
- Testes cobrem o bloqueio **e** o acesso legítimo: outra empresa, outro submódulo, ação sem permissão, DENY explícito, membership revogada.
