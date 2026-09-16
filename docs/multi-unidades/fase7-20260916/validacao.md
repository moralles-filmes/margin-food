# Evidência compacta de execução — 16/09/2026

Ambiente: PostgreSQL 17.10 em 127.0.0.1:15440; Windows/PowerShell; Bun; fixtures sintéticas. Nenhuma execução de DDL/DML em produção.

`scripts/test-phase7-db.ps1 -Database moralles_phase7_test_acceptance` terminou com exit 0:

```text
PASS drift body / acl / overload / caller
PASS drift trigger / column / policy / index
PASS drift table_acl / column_acl / inherited_role / default_acl
PASS drift view / prerequisite
Fase 7: 248 assertions
Fase 3: 175 assertions
Fase 4: 146 assertions
Fase 5: 67 assertions
Fase 6: 80 assertions
PASS moralles_phase7_test_acceptance
```

`pos-validacao.sql` executado nesse candidato antes de qualquer recuo: exit 0. As 15 constraints novas estão validadas (8 FKs, 4 uniques para referências e 3 uniques de upsert); três constraints globais removidas. As migrations não reescrevem registros de aplicação.

`node scripts/test-phase7-concurrency.mjs moralles_phase7_test_final4` terminou com exit 0:

```text
PASS same-tenant upsert serializes
PASS same key one row final value
PASS A/B same month coexist concurrently
PASS A/B independent values
PASS legacy simultaneous first request rejects unique conflict safely
PASS one order after race
PASS retry after committed race returns same order
PASS containment preserves all fixture resources links stock costs logs
PASS containment closes changed entry points
PASS containment never reopens vulnerable grants
PASS containment preserves eight tenant FKs
PASS reading and service table access retained
PASS 12 concurrency/containment checks
```

Checks de código: Vitest 99 arquivos/779 testes PASS; TypeScript app e node exit 0; build exit 0; ESLint 0 erros/1355 warnings; RBAC zero blockers/dois important; security:check exit 0 **com SQL lint pulado por configuração de serviço ausente**. A primeira chamada de TypeScript agrupada teve erro de redirecionamento PowerShell após os comandos; a repetição com logs separados terminou exit 0. A primeira chamada Vitest falhou por sandbox/esbuild, a chamada autorizada fora do sandbox passou.

Agregados vivos suplementares READ ONLY: `rh_escalas` tem zero duplicatas de `(company_id,semana_inicio,setor)`; `ficha_componente_itens` tem zero linhas, zero filhos órfãos e zero filhos de outra empresa. Agregados completos em integridade.json. Nenhum dado de usuário foi usado como fixture.

Preflight Fase 7 no vivo, enviado como transação READ ONLY:

```text
ERROR P0001: PHASE7_PREREQUISITES_REQUIRED
PL/pgSQL function inline_code_block line 4 at RAISE
```

Esse erro é resultado esperado: não demonstra que o resto do preflight passaria em produção após publicar dependências. Repetir todos os guards no release integrado. Não há certificado de JWT/gateway/PostgREST/browser nem execução real de integrações externas.
