# Reprodução F10 — somente isolado

Pré-requisitos: Node 24, Bun, dependências do checkout, PostgreSQL17/psql/pg_dump no PATH, Docker Desktop e Supabase CLI. Template local **vazio** `moralles_phase7_test_acceptance`, em 127.0.0.1:15440, preparado conforme fases anteriores. O runner checa as 149 tabelas públicas/reporting + Auth antes de usar o template; não remove bancos nem aceita host produtivo. Credencial `postgres` é somente a do cluster sintético.

## Duas stacks independentes

Copiar `config-http.toml` para `.phase10.local/integration/supabase/config.toml`. Para browser, copiar para `.phase10-browser.local/integration/supabase/config.toml`, substituir project_id `margin-food-phase10` por `margin-food-phase10-browser` e portas `5662` por `5663`. Esses diretórios terminam em `.local` e são ignorados pelo Git. O workdir não contém migrations do repositório. Não executar reset/db push na raiz.

```powershell
supabase start --workdir .phase10.local/integration --exclude studio,postgres-meta,logflare,vector,mailpit,imgproxy,edge-runtime --output json *> .phase10.local/start.log
if ($LASTEXITCODE -ne 0) { throw 'Parar: stack indisponível' }
supabase status --workdir .phase10.local/integration --output json > .phase10.local/runtime.json
node scripts/prepare-phase10-stack.mjs
if ($LASTEXITCODE -ne 0) { throw 'Parar: restore falhou' }
node scripts/phase10-fixtures.mjs
if ($LASTEXITCODE -ne 0) { throw 'Parar: fixture falhou' }

$env:PHASE10_SCENARIO='browser'
supabase start --workdir .phase10-browser.local/integration --exclude studio,postgres-meta,logflare,vector,mailpit,imgproxy,edge-runtime --output json *> .phase10-browser.local/start.log
if ($LASTEXITCODE -ne 0) { throw 'Parar: stack browser indisponível' }
supabase status --workdir .phase10-browser.local/integration --output json > .phase10-browser.local/runtime.json
node scripts/prepare-phase10-stack.mjs
if ($LASTEXITCODE -ne 0) { throw 'Parar: restore browser falhou' }
node scripts/phase10-fixtures.mjs
Remove-Item Env:PHASE10_SCENARIO
```

Não imprimir `runtime.json`, `users.json`, `start.log` ou dump privado: contêm chaves/credenciais sintéticas locais. Não commitá-los. `prepare` recusa destino público não vazio; `fixtures` recusa Auth/companies existentes. Para repetir desde zero, criar outro descartável com configuração/guards explícitos; não apagar nem sobrescrever automaticamente uma fixture existente.

Baseline: schema-only do candidato F7, ACLs exportadas pelo script F8, 22 statements do hotfix F9 e somente a tabela privada de reserva Auth ausente no template público. Trigger Auth vivo instalado depois dos cinco usuários de bootstrap. Nenhuma migration multiunidade reaplicada. O candidato não é release integrado aprovado. Sem `Storage`/`Realtime` candidatos F8 aplicados aqui.

Fixtures: três empresas próprias, cinco identidades `@example.test`, passwords aleatórias, grants sintéticos (admin/viewer e ALLOW granular/DENY legado), contas R$100/R$200, categorias e, no browser, fechamentos R$111/R$222 na data local. Role admin ganha apenas o template sintético mínimo de administração de usuários. Não são permissões copiadas de produção.

## HTTP e browser

```powershell
# Caminho para Deno 2.9.6 instalado localmente; não executa Edge cloud.
$env:PHASE10_DENO='<caminho absoluto para deno.exe>'
node scripts/test-phase10-http.mjs
if ($LASTEXITCODE -ne 0) { throw 'Jornada HTTP falhou' }
```

Runner usa apenas API56621, executa admin-companies/admin-users em Deno direto localhost:8000, sempre encerra o handler e salva 21 checkpoints sem tokens. Inclui criação/reserva/login real, link da identidade sem alteração, revogação/reintrodução, contexto forjado e empresa/membership inativos. Logs detalhados dos handlers ficam privados no `.local`. Não envia convites.

Em terminal separado, iniciar Vite exclusivamente na stack browser:

```powershell
$f10Runtime=Get-Content .phase10-browser.local/runtime.json -Raw | ConvertFrom-Json
$env:VITE_SUPABASE_URL=$f10Runtime.API_URL
$env:VITE_SUPABASE_PUBLISHABLE_KEY=$f10Runtime.ANON_KEY
bun run dev --host 127.0.0.1 --port 8086
```

`node scripts/test-phase10-browser.mjs` usa Chromium real e Playwright (paths opcionais PHASE10_PLAYWRIGHT/PHASE10_CHROMIUM; defaults documentam este host). Faz login pelos inputs, navega pelos controles existentes e bloqueia requests fora do loopback. Salva apenas screenshots sintéticos e lista de checks; nunca storageState/JWT/HAR. Atraso é imposto no request real de contexto B, sem substituir payload ou mockar o banco. Revogação modifica apenas membership do usuário sintético multi na empresa B. Se o teste parar antes de restaurar esse membership, inspecionar a fixture; não corrigir permissões no vivo.

Nesta execução agent-browser0.38.0 foi tentado e retornou timeout10060; Playwright/Chromium1228 foi o fallback. Screenshots foram revisados visualmente. `browser/failure.png` era diagnóstico intermediário e não compõe a entrega final.

## Verificações do aplicativo

```powershell
bun run test --maxWorkers=4
bun x tsc --noEmit -p tsconfig.app.json
bun x tsc --noEmit -p tsconfig.node.json
bun run lint --ignore-pattern '**/*.local/**'
bun run rbac:lint
bun run security:check
bun run build
node scripts/audit-phase10-frontend.mjs
```

Excluir scratch ignorado do lint evita contar dumps/runners temporários F8–10 como aplicativo. Não oculta src/scripts versionados. Testes de componente simulam transporte/exportadores e são classificados separadamente dos HTTP. Não há mock de banco nos ensaios de integração. Unitários F10: 789/101; após últimos guards de navegação, reexecutados 22 testes focais e TypeScript/build. O aviso de sourcemap ausente em typescript.js e warnings de bundle/Browserslist não são falhas de teste. `security:check` pula SQL sem env de banco: não usar exit0 como evidência SQL.

## Metadados e encerramento

Comparar `revalidacao-viva.json` com F9; hashes finais de versões, funções (assinatura/corpo/owner/ACL) e policies usam agregação ordenada `COLLATE "C"`, sem rows privadas. Reconsultar bundles Edge e deployment por alias; nunca extrapolar snapshot para momento posterior.

Encerrar apenas serviços criados para F10, mantendo volumes:

```powershell
supabase stop --workdir .phase10.local/integration
supabase stop --workdir .phase10-browser.local/integration
```

Encerrar Vite8085/8086 do ensaio, nunca todos os processos Node/Docker. Não usar `--all`, `--no-backup`, reset, repair ou comandos produtivos. Registrar resultado de encerramento em `ensaios.json`.
