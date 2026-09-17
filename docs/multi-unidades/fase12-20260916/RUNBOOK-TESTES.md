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

O primeiro comando recria 16 arquivos e seus hashes. O segundo:

1. confere hashes e origem descartável;
2. cria clone novo equivalente ao vivo;
3. aplica a ordem exata;
4. cria clones de estágio e executa F2–F7;
5. valida F8 Storage/Realtime;
6. executa as 39 assertions residuais;
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

Quando o binário nativo não estiver no PATH, usar `bun x deno`. A execução hospedada F12 validou os cinco handlers implantados e o wrapper CORS:

```powershell
bun x deno check --no-lock supabase/functions/purchase-requisitions/index.ts supabase/functions/requisicao-estoque/index.ts supabase/functions/rh/index.ts
bun x deno check --no-lock supabase/functions/scheduled-jobs/index.ts supabase/functions/ficha-tecnica/index.ts
bun x deno test --no-lock --allow-env --allow-net supabase/tests/edge/request_cors_test.ts
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

## Registro do staging F12

O01–O04 foram executados no projeto privado `jiufikblnfivgynrbfyq`; resultado sanitizado em [staging-o01-o04.json](staging-o01-o04.json).

1. restaurar snapshot lógico completo e comparar apenas contagens/hashes; manter dumps fora do Git;
2. se a origem Storage tiver objetos, copiar e verificar bytes; nesta execução origem e staging tinham 0 objetos/0 bytes, portanto o ramo foi vacuamente completo;
3. normalizar somente drift criado pelo projeto vazio antes da sequência e registrar qualquer objeto externo omitido pelo dump; nesta execução foram restauradas 4 policies de `storage.objects` e o trigger `auth.users.on_auth_user_created`;
4. aplicar somente as 16 versões forward do manifesto, em ordem, e confirmar 16/16 hashes locais + 16 linhas de histórico;
5. implantar somente os bundles afetados no staging e executar a matriz 0/1/N, CORS/JWT, A→B→A, inatividade, revogação, admin local/global, Realtime e scheduler;
6. remover identidades, empresas, reservas e secrets sintéticos e provar contagem zero;
7. inventariar scheduler/consumers em repo, Vercel, roles/grants, `pg_cron`, foreign servers, subscriptions e hooks. Ausência comprovada torna owner/cadência/timezone/retries/alertas N/A, mas qualquer integração descoberta depois reabre O02/O03.

Resultado desta execução: gateway/scheduler/Realtime **25/25**, limpeza completa, `CRON_SECRET` sintético ausente e publicação Realtime limitada a INSERT/UPDATE. O teste de JWT “expirado” usou payload expirado com assinatura adulterada; a expiração com assinatura válida não foi isolada e continua explicitamente registrada como limite.

### O08 — browser hospedado

O runner cria somente conta, identidade e governança sintéticas em duas unidades já presentes no staging, compila o bundle com as variáveis do staging e usa `vite preview`; o servidor dev Vite 8 não é usado porque seu otimizador ficou preso no Windows. Exports e screenshots não são persistidos.

```powershell
node scripts/test-f12-staging-o08.mjs
```

Resultado esperado: 12 checkpoints, incluindo desktop/mobile, atraso, erro/retry, planejamento, quatro downloads reais, 35 itens, corrida de filtro, decisão/ação, paginação 20+1 e limpeza zero. Evidência: [staging-o08.json](staging-o08.json).

### O09 — Storage hospedado

```powershell
bun run scripts/test-f12-staging-o09.ts
```

Resultado esperado: 8 checkpoints sobre Auth/RLS/Storage reais e limpeza zero. O script usa credenciais somente em memória e persiste apenas [staging-o09.json](staging-o09.json). A versão `20260916221500` deve existir antes do teste.

## Segurança de commit

Antes de cada stage/commit:

```powershell
git status --short
git diff --cached --name-only
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
```

Recusar `.env*`, `.claude/settings.local.json`, `supabase/.temp/` e os seis arquivos alheios listados no pedido. Sem autorização produtiva expressa, nenhum push.

## Registro da publicação de 17/09/2026

A proibição de push/deploy acima valeu durante a construção do candidato e foi levantada somente pela autorização expressa posterior do usuário. A janela real seguiu esta ordem:

1. backup final de banco e roles fora do Git, com hashes registrados;
2. aplicação das 16 forward migrations pelo diretório isolado, sem `--include-all` e sem repair;
3. validação final de histórico, policies, assinaturas, Storage e Realtime;
4. deploy das cinco Edge Functions com `--project-ref wuzxpbixprrgssoeeaez --use-api`;
5. CORS da origem real, origem externa e autenticação ausente, sem disparar job;
6. nova varredura Git no intervalo `origin/main..HEAD`, fast-forward para `main` e validação dos assets Vercel;
7. navegador público na tela de login, sem autenticação nem mutação de dados reais.

Evidência: [production-release.json](production-release.json). O smoke de navegador deve permitir os domínios `www.marginfood.com` e `wuzxpbixprrgssoeeaez.supabase.co`; bloquear o segundo cria falsos erros de rede. Mesmo com ambos permitidos, os stores montados antes do login emitem recusas esperadas `42501`/`COMPANY_ACCESS_DENIED`, um follow-up de ruído de console.
