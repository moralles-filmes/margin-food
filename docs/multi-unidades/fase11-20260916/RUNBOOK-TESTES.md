# Reprodução F11 — somente descartáveis locais

Requer checkout F10 `483c332` + harness F11, Node 24/Bun, dependências já instaladas, PostgreSQL 17 (`psql`, `createdb`, `pg_dump`), Docker Desktop, Supabase CLI 2.111.0, Deno 2.9.6 e Chromium/Playwright. Usar as versões efetivamente registradas no host; não atualizar dependências do produto para executar esta fase.

## Baseline e segurança

`git status --short`, `git fetch origin`, `git log` e comparação AGENTS/CLAUDE primeiro. Preservar os seis arquivos alheios listados em baseline.json. Branch nova local, sem push. Nunca ler/imprimir runtime.json/users.json/start.log/dumps em chat ou Git: contêm credenciais sintéticas. Diretórios `.phase11.local` e `.phase11-browser.local` terminam em `.local` e estão ignorados. Conferir com git check-ignore antes de gravar.

Os runners PostgreSQL usam exclusivamente 127.0.0.1:15440 e nomes descartáveis; não aceitam host produtivo. Os HTTP/browser exigem API127.0.0.1:56721/56731, com DB56722/56732. Não substituir guards para acomodar outro destino. Nenhuma operação deve usar banco vivo de teste; nunca copiar linhas privadas.

## PostgreSQL, drift e recuo

Templates locais **vazios**: `moralles_phase9_test_live`, `moralles_phase7_test_base`, `moralles_phase7_test_acceptance`. Origem/reconstrução em F9 RUNBOOK e F2–7. Todas as149 tabelas public/reporting + Auth são verificadas antes de clonar. Na ausência dos templates, reconstruir schemas sem dados conforme os runbooks, comparar com catálogos revalidados; não importar dados de produção, não reaplicar as seis migrations multiunidade sobre estado migrado. Template candidato F7 não é prova de release integrado.

```powershell
node scripts/phase11-harness.mjs sql
if ($LASTEXITCODE -ne 0) { throw 'SQL falhou; parar' }
node scripts/phase11-harness.mjs guards
if ($LASTEXITCODE -ne 0) { throw 'Drift/recuo falhou; parar' }
node scripts/test-phase11-performance.mjs
if ($LASTEXITCODE -ne 0) { throw 'Performance falhou; parar' }
```

`sql` gera cinco clones novos com timestamp e `sql.json`. `guards` usa exclusivamente os clones acabados de registrar, aplica quatro drifts transacionais e contém F2/F7; não executar `guards` novamente nas mesmas fixtures. Repetir a sequência começa por `sql` para obter clones novos. Bancos existentes nunca são apagados/sobrescritos.

Performance cria outros dois clones, sem usar aqueles contidos por recuo, aplica hotfix apenas no candidato que ainda não o contém e bulk-seed próprio. Fixtures e método estão em PERFORMANCE.md. Triggers desabilitados somente durante bulk-seed local, reativados para todas as leituras. Nenhum EXPLAIN de escrita. O runner original grava o resultado; os hashes de schema adicionados à evidência entregue foram coletados posteriormente por catálogo somente leitura, sem alterar o schema.

`phase11-harness.mjs` lê runners F9/F10 existentes e grava cópias adaptadas somente no scratch. `harness-*.json` registra SHA256 das fontes, do programa gerado e cada substituição. Alterações são nomes/portas/output e casos adicionais de browser; assertions e guards de migrations permanecem. O import do splitter aponta para o arquivo original. Não executar runners F9/F10 diretamente para esta fase: seus destinos de evidência são as pastas antigas. O incidente inicial de path e a restauração das baselines estão documentados em incidentes-harness.json.

## Duas stacks Supabase novas

Usar config-http.toml da F10 como base de configuração, sem copiar runtime/volumes/dados:

- HTTP: `.phase11.local/integration/supabase/config.toml`, project_id `margin-food-phase11`, substituir prefixo de portas 5662→5672.
- Browser: `.phase11-browser.local/integration/supabase/config.toml`, project_id `margin-food-phase11-browser`, substituir 5662→5673.
- Diretórios de migrations dessas stacks vazios. Não chamar reset/db push na raiz. Não reutilizar stack F8 contida ou reabrir grants/publicações.

```powershell
supabase start --workdir .phase11.local/integration --exclude studio,postgres-meta,logflare,vector,mailpit,imgproxy,edge-runtime --output json *> .phase11.local/start.log
if ($LASTEXITCODE -ne 0) { throw 'HTTP stack indisponível' }
supabase status --workdir .phase11.local/integration --output json > .phase11.local/runtime.json
if ($LASTEXITCODE -ne 0) { throw 'status falhou' }
node scripts/phase11-harness.mjs prepare
if ($LASTEXITCODE -ne 0) { throw 'restore falhou' }
node scripts/phase11-harness.mjs fixtures
if ($LASTEXITCODE -ne 0) { throw 'fixture falhou' }

$env:PHASE11_SCENARIO='browser'
supabase start --workdir .phase11-browser.local/integration --exclude studio,postgres-meta,logflare,vector,mailpit,imgproxy,edge-runtime --output json *> .phase11-browser.local/start.log
if ($LASTEXITCODE -ne 0) { throw 'Browser stack indisponível' }
supabase status --workdir .phase11-browser.local/integration --output json > .phase11-browser.local/runtime.json
if ($LASTEXITCODE -ne 0) { throw 'status falhou' }
node scripts/phase11-harness.mjs prepare
if ($LASTEXITCODE -ne 0) { throw 'restore browser falhou' }
node scripts/phase11-harness.mjs fixtures
if ($LASTEXITCODE -ne 0) { throw 'fixture browser falhou' }
Remove-Item Env:PHASE11_SCENARIO
```

prepare recusa public não vazio; fixtures recusa Auth/companies existentes. Restores: schema-only candidato F7, ACLs exatas exportadas, 22 statements do hotfix e somente DDL privado da reserva Auth. Trigger Auth vivo vem após as cinco identidades de bootstrap. Não há mock de banco; não há migration produtiva. Credentials e logs ficam privados. Falha exige inspecionar o descartável e criar outro novo com guards explícitos, nunca apagar/reseed por conveniência.

## HTTP e navegador

```powershell
$env:PHASE11_DENO='<caminho absoluto para deno.exe>'
node scripts/phase11-harness.mjs http
if ($LASTEXITCODE -ne 0) { throw 'HTTP falhou' }
```

Handlers Deno diretos localhost 8000 usam somente a stack HTTP, encerrados no finally. Testes criam identidades com senha aleatória e email_confirm no Auth local; não enviam convites. Não são gateway cloud.

Em terminal separado, Vite na stack browser:

```powershell
$phase11Runtime=Get-Content .phase11-browser.local/runtime.json -Raw | ConvertFrom-Json
$env:VITE_SUPABASE_URL=$phase11Runtime.API_URL
$env:VITE_SUPABASE_PUBLISHABLE_KEY=$phase11Runtime.ANON_KEY
bun run dev --host 127.0.0.1 --port 8088 --strictPort
```

```powershell
node scripts/phase11-harness.mjs browser
if ($LASTEXITCODE -ne 0) { throw 'Browser falhou' }
```

PHASE11_PLAYWRIGHT/PHASE11_CHROMIUM permitem informar caminhos locais; defaults são os do host F10. Chromium headless real, sem storageState/HAR/JWT salvo. Requests externos são abortados (inclui fonte Google). Falha de contexto usa abort de transporte; atraso segura request real, sem substituir linhas de DB. Downloads PDF/PPTX sintéticos são verificados por bytes/XML e salvos como evidência. 17 jornadas incluem novos casos retry/obsolescência/exports/tema; não somar aos 12 da F10. Browser inicial de 14 foi diagnóstico anterior ao ensaio final 17, não outro total.

Se browser parar durante revogação/inatividade, conferir membership da fixture antes de reexecutar. Não corrigir grants no vivo. Capturas são sintéticas, inspecionadas visualmente. agent-browser foi tentado, falhou 10060; Playwright foi fallback, não certificação do CLI.

## Checks do aplicativo

```powershell
bun run test --maxWorkers=4
bun x tsc --noEmit -p tsconfig.app.json
bun x tsc --noEmit -p tsconfig.node.json
bun run build
bun run lint --ignore-pattern '**/*.local/**'
bun run rbac:lint
bun run security:check
node --test scripts/test-phase9-sql.mjs
deno check --no-lock <17 caminhos supabase/functions/*/index.ts>
deno test --no-lock --allow-env --allow-net supabase/tests/edge/request_cors_test.ts
```

Conferir exit a cada comando; não encadear falha com sucesso posterior. security:check pulou SQL por env ausente nesta execução, apesar de exit0. Logs completos ignorados têm hashes em ensaios.json. Lint final dos dois scripts F11 deve ser repetido após editar harness; não é necessário repetir todos os unitários quando apenas documentação mudou.

## Revalidação e encerramento

Metadados remotos somente leitura: versões, funções (assinatura/MD5/owner/ACL) e policies; não coletar payloads operacionais/valores de secrets. Comparar listas completas a F10, bundle hashes via list_edge_functions e deployment por alias/team. Preservar timestamp por coleta. Mudança exige novo diff/ensaio, nunca atualizar fingerprint para passar guard.

```powershell
supabase stop --workdir .phase11.local/integration
if ($LASTEXITCODE -ne 0) { throw 'Falha ao encerrar HTTP' }
supabase stop --workdir .phase11-browser.local/integration
if ($LASTEXITCODE -ne 0) { throw 'Falha ao encerrar browser' }
```

Encerrar somente Vite 8088/processos de ensaio identificados. Manter volumes/bancos de evidência; não --all, --no-backup ou remoção de bancos. Registrar resultado no ensaios.json. Antes de cada git add/commit: scan JWT/sb_secret_/password/api_key e paths .env*/settings.local.json/supabase/.temp; inspecionar binários sintéticos; staged exclusivo F11. Não incluir arquivos alheios nem push.
