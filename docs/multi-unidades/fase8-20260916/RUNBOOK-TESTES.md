# Reprodução dos ensaios da Fase 8

Somente ambiente descartável local. Os runners recusam API diferente de http://127.0.0.1:56521 e usam psql em 127.0.0.1:56522. Nunca substituir esses guards por URL de produção. Credenciais sintéticas ficam em .phase8.local (ignorada); não imprimir runtime.json/users.json, não anexar dumps/logs com credenciais, não usar .env real.

## Ambiente usado e pré-condições

- Supabase CLI2.111.0, Docker Desktop, PostgreSQL client17, Node24, Deno2.9.6 e dependências instaladas do projeto.
- Stack dedicada project_id=margin-food-phase8; portas API56521, DB56522, shadow56520, Studio56523, mail56524, pool56529. Não executar stop/remove em outros projetos.
- Template local vazio moralles_phase7_test_acceptance em127.0.0.1:15440, preparado pelos runners F2–7 e sem recuo final. Ele representa o candidato anterior à F8. Não reaplicar as seis migrations multiunidade sobre esse template.
- O template **não está versionado como dump** e não contém dados reais. Na ausência dele, seguir os runbooks F2–7 em novo descartável e atingir as mesmas definições/ACLs; não baixar dados de produção para substituir fixtures.
- O projeto Auth real inicializa suas próprias tabelas. Não se copiou auth.handle_new_user do app; criação/vínculo/convite administrativos completos não são aprovados por este ensaio.

A stack final desta sessão foi contida pelo runner de rollback. Reiniciar containers não reabre grants/publicação. Para um ensaio do zero, criar outra stack vazia deliberadamente; não rodar fixtures de novo sobre stack já populada.

## Preparação de uma stack vazia

Executar na raiz do repositório. Comandos abaixo ilustram a reconstrução corrigida, reunindo o restore que nesta sessão precisou de duas etapas. É obrigatório parar em qualquer exit code não zero.

```powershell
New-Item -ItemType Directory -Force .phase8.local/integration | Out-Null
supabase init --workdir .phase8.local/integration
```

Editar **apenas** .phase8.local/integration/supabase/config.toml: project_id e portas acima; major_version=17. Pasta de migrations dessa stack fica vazia: schema será restaurado do template, não pelo histórico automático do app.

```powershell
supabase start --workdir .phase8.local/integration --exclude studio,postgres-meta,logflare,vector,mailpit,imgproxy --output json *> .phase8.local/start.log
if ($LASTEXITCODE -ne 0) { throw 'start falhou; não exibir credenciais do log' }
supabase status --workdir .phase8.local/integration --output json > .phase8.local/runtime.json
if ($LASTEXITCODE -ne 0) { throw 'status falhou' }
```

Se start.log contiver JSON de credenciais, remover esse bloco do log e manter apenas runtime.json ignorado, antes de mostrar qualquer diagnóstico.

Schema-only e ACL exatas do template; a senha abaixo é exclusivamente a do PostgreSQL descartável:

```powershell
$env:PGPASSWORD='postgres'
$phase8Source=@('-h','127.0.0.1','-p','15440','-U','postgres','-d','moralles_phase7_test_acceptance')
$phase8Target=@('-h','127.0.0.1','-p','56522','-U','postgres','-d','postgres')
$phase8Rows=psql -X -w @phase8Source -At -c 'SELECT count(*) FROM public.companies'
if ($LASTEXITCODE -ne 0 -or $phase8Rows -ne '0') { throw 'template não vazio' }
pg_dump @phase8Source --schema-only --schema=public --schema=reporting --schema=log_private --schema=multiunit_private --file=.phase8.local/schema.sql
if ($LASTEXITCODE -ne 0) { throw 'dump falhou' }
$phase8Schema=[IO.File]::ReadAllText((Join-Path $PWD '.phase8.local/schema.sql'))
$phase8Schema=$phase8Schema.Replace('CREATE SCHEMA public;','')
$phase8Schema="CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;`nCREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;`n"+$phase8Schema
[IO.File]::WriteAllText((Join-Path $PWD '.phase8.local/schema-restore.sql'),$phase8Schema)
psql -X -w @phase8Target -v ON_ERROR_STOP=1 -f .phase8.local/schema-restore.sql > .phase8.local/restore.log
if ($LASTEXITCODE -ne 0) { throw 'restore falhou; parar' }
psql -X -w @phase8Source -At -v ON_ERROR_STOP=1 -f docs/multi-unidades/fase8-20260916/exportar-acls-fixture.sql > .phase8.local/table-acls.sql
if ($LASTEXITCODE -ne 0) { throw 'export ACL falhou' }
psql -X -w @phase8Target -v ON_ERROR_STOP=1 -f .phase8.local/table-acls.sql > .phase8.local/table-acls.log
if ($LASTEXITCODE -ne 0) { throw 'restore ACL falhou' }
psql -X -w @phase8Target -v ON_ERROR_STOP=1 -f docs/multi-unidades/fase8-20260916/fixture-storage-realtime.sql
if ($LASTEXITCODE -ne 0) { throw 'fixture Storage falhou' }
node scripts/test-phase8-fixtures.mjs
```

fixture-storage-realtime.sql **reproduz policies/publicação anteriores** para demonstrar a falha, não é migration nem policy produtiva nova. Deve encontrar bucket/policies/publicação sem tabelas prévias. exportar-acls-fixture.sql é READ ONLY na origem e gera REVOKE/GRANT só para o destino descartável: pg_dump com GRANT aditivo não remove privilégios bootstrap da stack. Não conceder ALL para fazer testes passarem. Regressão F7 detecta grants fora da RLS.

As sete identidades reais de teste são a, b, adminA, multi, super, none, granular; todas @example.test, com senha aleatória nunca impressa. Criadas por Auth Admin local, depois autenticadas por email/senha. SQL de fixture vincula empresas/memberships/permissões explícitas. Nenhuma chave de integração é configurada. Ao rerodar testes muito depois, JWT pode expirar: renovar fixtures em sessão controlada, sem desativar Auth.

## Antes/depois, testes e contenção final

```powershell
node scripts/test-phase8-storage.mjs --before
node scripts/test-phase8-realtime.mjs --before
# Preservar a evidência before antes de o runner regravar resultado.
Copy-Item .phase8.local/realtime-result.json .phase8.local/realtime-before.json
psql -X -w @phase8Target -v ON_ERROR_STOP=1 -f supabase/migrations/20260916143153_phase8_storage_scope.sql
if ($LASTEXITCODE -ne 0) { throw 'guard Storage recusou' }
psql -X -w @phase8Target -v ON_ERROR_STOP=1 -f supabase/migrations/20260916144830_phase8_realtime_events.sql
if ($LASTEXITCODE -ne 0) { throw 'guard Realtime recusou' }
node scripts/test-phase8-storage.mjs
node scripts/test-phase8-realtime.mjs
$env:PHASE8_DENO=(Get-Command deno).Source
node scripts/test-phase8-edges.mjs
node scripts/test-phase8-drift.mjs
psql -X -w @phase8Target -v ON_ERROR_STOP=1 -f docs/multi-unidades/fase8-20260916/pos-validacao.sql
# Por último: fecha downloads novos e remove tabelas da publicação.
node scripts/test-phase8-rollback.mjs
```

Verificar exit code **a cada runner**, não concatenar sucessos posteriores sobre falhas. Resultado aprovado: Storage37, Realtime16, Edges88, drift10, recuo6/152tabelas intactas. Logs e tokens ficam ignorados; apenas JSON sanitizado de checks é versionado. Edge runner inicia um handler de cada vez na porta8000, mata o processo em finally, e usa Auth/PostgREST reais. Não é teste do gateway cloud. Sem chaves de provedor, não há WhatsApp/LLM/email externo. Falha de auditoria de job é um trigger sintético local, removido após o caso.

Realtime espera assinatura e entrega assíncrona positiva até10s; negativas são observadas por2s. Teste de logout remove o canal e encerra a sessão; renova uma sessão sintética para o próximo runner. Não prova revogação instantânea de qualquer JWT emitido.

## SQL e checks do código

- F7: supabase/tests/database/phase7_security.sql foi executado na stack completa com a cláusula de identificação do descartável adaptada ao banco postgres e às empresas Phase8; o corpo de assertions permaneceu intacto. F7 normalmente exige database name phase7. Executar em clone vazio se não houver fixture suficiente para guard seguro.
- F3–6: scripts/runners dessas fases foram executados em clone vazio moralles_phase7_test_phase8_regression no PostgreSQL15440. Ajustou-se somente guard do nome do descartável; schema F7 + definição candidata Storage. Fixtures F8 na mesma base quebram premissas de contagem/INSERT SELECT auth.users dessas suites; não remover assertions para passar.
- F7 concorrência/recuo12 e drift14 são baseline da fase anterior; não foram repetidos neste ciclo. F8 tem seus10drifts e6checks de recuo próprios.

```powershell
bun run test --maxWorkers=4
bun x tsc --noEmit -p tsconfig.app.json
bun x tsc --noEmit -p tsconfig.node.json
bun run build
bun run lint --ignore-pattern '.phase8.local/**'
bun run rbac:lint
bun run security:check
$phase8Edges=Get-ChildItem supabase/functions -Directory | ForEach-Object { Join-Path $_.FullName 'index.ts' } | Where-Object { Test-Path -LiteralPath $_ }
deno check --no-lock $phase8Edges
deno test --no-lock --allow-env --allow-net supabase/tests/edge/request_cors_test.ts
deno run --no-lock --allow-env --allow-net supabase/tests/edge/scheduled_jobs_auth.ts
```

Não confundir security:check exit0 com execução de SQL lint: sem configuração de serviço, esse componente pula. O runner legado scheduled_jobs_auth usa Deno.exit e não deve ser importado por deno test.

Finalização sem apagar volumes/dados de outras stacks:

```powershell
supabase stop --workdir .phase8.local/integration
```

Não usar --all nem --no-backup. Dumps, logs, tokens e fixtures dessa execução permanecem ignorados; nenhum segredo entra nos commits.
