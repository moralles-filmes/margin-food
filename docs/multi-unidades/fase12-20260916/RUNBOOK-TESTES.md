# Runbook reproduzível — candidato F12

## Pré-condições

Checkout desta branch, Node 24/Bun, dependências instaladas, PostgreSQL 17.10 em `127.0.0.1:15440`, comandos `psql/createdb`, e template vazio `moralles_phase9_test_live` produzido pelo runbook F9. O runner recusa host não-loopback e nomes fora de `moralles_*_test_*`/`moralles_stabilization_*`.

Não usar dump ou linhas de produção. O arquivo `rehearsal/live-external-substrate.sql` reconstrói apenas DDL/policies Storage e membership Realtime omitidos pelo template público e contém guard local próprio.

## Gerar e testar o release

```powershell
node scripts/build-multiunit-stabilization-release.mjs
if ($LASTEXITCODE -ne 0) { throw 'builder falhou' }

node scripts/test-multiunit-stabilization-release.mjs
if ($LASTEXITCODE -ne 0) { throw 'release integrado falhou' }
```

O primeiro comando recria 15 arquivos e seus hashes. O segundo:

1. confere hashes e origem descartável;
2. cria clone novo equivalente ao vivo;
3. aplica a ordem exata;
4. cria clones de estágio e executa F2–F7;
5. valida F8 Storage/Realtime;
6. executa as 35 assertions residuais;
7. força duas sessões concorrentes na primeira conversão de uma RFQ;
8. grava [release-rehearsal.json](release-rehearsal.json).

Não reexecutar sobre o mesmo banco. O runner sempre cria nomes com timestamp e não apaga os anteriores.

## Aplicativo

```powershell
bun run test -- --maxWorkers=4
bun x tsc -p tsconfig.app.json --noEmit
bun x tsc -p tsconfig.node.json --noEmit
bun run build
bun run lint
bun run rbac:lint
bun run security:check
git diff --check
```

Nesta sessão, Vitest precisou rodar fora do sandbox de filesystem porque o esbuild não conseguia resolver `vitest.config.ts`; o conteúdo executado foi o mesmo comando. `security:check` sem URL/chave informa explicitamente `SQL SKIPPED`; não converter esse exit 0 em aceite do banco.

Se Deno estiver disponível, repetir para os três handlers alterados e o wrapper CORS:

```powershell
deno check --no-lock supabase/functions/purchase-requisitions/index.ts
deno check --no-lock supabase/functions/requisicao-estoque/index.ts
deno check --no-lock supabase/functions/rh/index.ts
deno test --no-lock --allow-env --allow-net supabase/tests/edge/request_cors_test.ts
```

## Staging obrigatório antes de produção

Em projeto hospedado autorizado, vazio e privado, aplicar o mesmo diretório por hash. Implantar bundles coerentes e repetir:

- JWT ausente/inválido/expirado, CORS/preflight, header `x-company-id` válido/forjado/placeholder;
- 0/1/N empresas, A→B→A, membership/empresa inativos, revogação com mesmo JWT, admin local/global;
- criação de empresa/reserva pré-Auth/vínculo de identidade existente sem alterar identidade compartilhada;
- falhas intermediárias e replay idempotente de requisição, checklist, recebimento, RFQ, inventário e cancelamento;
- Storage com bytes reais: upload, falha após metadata, falha após objeto, delete e retry;
- Realtime INSERT/UPDATE + refetch; nenhum requisito de DELETE/TRUNCATE;
- browser desktop/mobile, troca atrasada, loading/erro/retry, detalhes volumosos e todos os exports.

O gateway hospedado e a restauração de backup não podem ser substituídos por Deno direto, fixture, clone de schema ou catálogo.

## Segurança de commit

Antes de cada stage/commit:

```powershell
git status --short
git diff --cached --name-only
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
```

Recusar `.env*`, `.claude/settings.local.json`, `supabase/.temp/` e os seis arquivos alheios listados no pedido. Nenhum push.
