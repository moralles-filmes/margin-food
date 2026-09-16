# Reprodução F9

Somente PostgreSQL real isolado em `127.0.0.1:15440`. Os scripts validam nomes `moralles_phase9_test_*`; não aceitam URL de produção, não removem banco existente e não copiam dados privados. `.phase9.local` é ignorado. Não imprimir variáveis de ambiente, dumps privados ou credenciais; `postgres` nos exemplos é exclusivamente a credencial do cluster sintético local.

## Captura e inventário

Executar `inventario.sql`, `inventario-complementar.sql`, `inventario-plataforma.sql` e `historico.sql` via MCP execute_sql no projeto confirmado, ou sessão SQL já autenticada. Todos usam READ ONLY/ROLLBACK. Salvar resultados JSON sem o envelope de texto do MCP; não consultar conteúdo de Auth.users, logs, objetos ou configs de integrações. Os JSON principais foram capturados separadamente; conservar horários. `historico.sql` retorna apenas hashes. `historico-foco.json` contém somente sete migrations DDL específicas previamente inspecionadas, sem segredos; não ampliar coleta bruta para todo o histórico.

Revalidar `list_edge_functions` e comparar `ezbr_sha256` com `../fase8-20260916/edges.json`. Se um bundle mudar, baixar somente esse bundle, inspecionar imports/callers/segredos antes de salvar evidência; não reaproveitar a classificação antiga por número de versão. Vercel: consultar deployment pelo alias e listar deployments do projeto, salvando apenas ID/SHA/estado/target/hash e horários necessários.

```powershell
git fetch --all --tags
node scripts/audit-phase9.mjs
node --test scripts/test-phase9-sql.mjs
```

O inventário lê todos os refs existentes e 870 migrations deste checkout. Normalização muda apenas CRLF e bordas/delimitadores de statements, preservando conteúdo de strings, comentários internos e corpos SQL. Match é textual, não atestado de execução. Reflogs/refs apagados e consumers externos não entram. Não atualizar o snapshot aprovado silenciosamente: guardar a comparação com a coleta anterior.

## Template vivo equivalente vazio

Requer PostgreSQL 17, `psql`, `createdb`, Node 24, dependências do repositório e extensões pgcrypto/unaccent/pg_trgm. O cluster local já usado por F3–7 estava disponível. Instalação do cluster e roles de fixture não são mudanças produtivas.

```powershell
node scripts/phase9-build-fixture.mjs
$env:PGPASSWORD='postgres'
createdb -w -h 127.0.0.1 -p 15440 -U postgres moralles_phase9_test_live
if ($LASTEXITCODE -ne 0) { throw 'Banco existe/cluster indisponível; parar' }
psql -X -w -h 127.0.0.1 -p 15440 -U postgres -d moralles_phase9_test_live -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/multiunit_postgres_prerequisites.sql
if ($LASTEXITCODE -ne 0) { throw 'Prerequisitos falharam' }
psql -X -w -h 127.0.0.1 -p 15440 -U postgres -d moralles_phase9_test_live -v ON_ERROR_STOP=1 -f .phase9.local/live-schema.sql
if ($LASTEXITCODE -ne 0) { throw 'Restore falhou' }
```

O gerador cria public/reporting e schemas privados vazios necessários aos corpos, sem copiar snapshots privados. Restaura 321 funções SQL/PLpgSQL, tabelas, constraints, índices, triggers, policies, owners e ACLs; as 35 funções C vêm das extensões locais e têm owner/ACL alinhados. `check_function_bodies=off` é usado somente durante restore e reativado ao final. Não é uma migration ou um backup completo. As tabelas/serviços Auth, Storage, Realtime e catálogo de histórico reais não são reconstruídos por essa fixture; metadata desses objetos está inventariada separadamente.

Comparação usa UTC, como a coleta viva: pg_get_constraintdef renderiza constantes timestamptz no fuso da sessão. Trocar representação -03/+00 não altera a constraint e não justifica reescrevê-la.

O template `moralles_phase9_test_live` criado nesta execução foi corrigido na preparação quanto a owners/ACL de extensões; o gerador final já inclui a correção. Se ele já existir, não restaurar de novo em cima: usar o template vazio verificado ou criar outro nome e ajustar explicitamente o parâmetro de template no runner, mantendo guards de nome/host/vazio. Nunca apagar banco automaticamente.

## Clones e suites

Também requer templates locais vazios `moralles_phase7_test_base` (F2–6) e `moralles_phase7_test_acceptance` (candidato F7), preparados pelas fases anteriores. O runner verifica **todas as 149 tabelas públicas/reporting e Auth** antes de clonar. Se não estiverem disponíveis, reconstruir pelos runbooks anteriores com fixtures próprias; não fingir que o release bloqueado do vivo produziu esse candidato.

O hotfix vem dos 22 statements congelados em `historico-foco.json`, comprovados contra o arquivo local. O teste de 526 assertions está congelado em `fixtures/stock_reference_access.sql`, cópia exata SHA256 `473d141005d3c24dc0141d41d62ddeb5dc0f2cb6f52962b73cc078182b2df918` do teste alheio presente no início. Assim os runners F9 não dependem de commitar arquivos alheios ainda não versionados. Os originais permanecem intactos; o snapshot não é migration e não pode ser aplicado a produção.

```powershell
node scripts/test-phase9-db.mjs
if ($LASTEXITCODE -ne 0) { throw 'F9 DB falhou; não seguir' }
node scripts/test-phase9-guards.mjs
if ($LASTEXITCODE -ne 0) { throw 'F9 recuo falhou' }
```

O primeiro cria cinco clones novos com timestamp, além do template vazio preparado acima, e registra seus nomes em `ensaios.json`. Recusa esperada é assertiva, não falha ignorada. Reconstrói catálogo, aplica F2, verifica retry, recusa F3, testa hotfix/F7 e executa 526+526+175+146+67+80+248 assertions das suites existentes. Apenas a guarda do **nome do descartável** é adaptada em memória nas suites; host permanece loopback. Não remove assertions nem guards de migrations. O segundo usa os clones registrados, quatro drifts transacionais, fixtures novas e recuos F2/F7. Depois do recuo, não presumir que APIs/grants continuem disponíveis.

Para repetir tudo, chamar novamente o primeiro runner para gerar novos clones, depois o segundo. Não rodar apenas o segundo novamente nas mesmas fixtures. Suites fazem ROLLBACK; fixtures do teste de recuo permanecem no descartável para inspeção. Nenhum volume/cluster alheio foi desligado.

Os testes focais de histórico compilam os CREATEs de três versões administrativas em transações revertidas e comparam `pg_get_functiondef`. Não executam DML histórico nem registram versões reais como aplicadas nesses clones. ACL antes/depois também é inspecionada; isso não reconstitui a hora real de aplicação.

## Leitura dos resultados

`ensaios.json`: 22 checkpoints, incluindo regressões e dois bloqueios reais. `ensaios-guards-recuo.json`: oito checks, com hashes por tabela sem linhas pessoais. O rollback preserva 149 tabelas + Auth, mas a maioria está vazia; fixtures exercitam identidade, memberships, produto/saldo/custo. Oito testes do splitter SQL passam.

Nenhum teste F9 é jornada em browser, gateway Edge cloud, emissão JWT, envio externo ou execução de scheduler. Baseline F8 permanece 88 HTTP/37 Storage/16 Realtime/10 drift/6 recuo e 781 unitários; não foi reexecutada nem somada aos resultados F9. Os checks app/build/lint não foram repetidos para esta alteração exclusiva de ferramentas/docs.
