param(
  [Parameter(Mandatory=$true)][string]$SchemaFile,
  [int]$Port = 15439,
  [string]$Database = ('moralles_phase2_test_' + (Get-Date -Format 'yyyyMMddHHmmss'))
)
$ErrorActionPreference = 'Stop'
if ($Database -notmatch '^moralles_phase2_test_[a-zA-Z0-9_]+$') { throw 'Use um banco novo moralles_phase2_test_*' }
$schemaPath = (Resolve-Path -LiteralPath $SchemaFile).Path
$projectRoot = Split-Path -Parent $PSScriptRoot
# Requer cluster descartável já iniciado. Nunca aceita host remoto, dump de dados ou URL de produção.
# SchemaFile: schema público/reporting atual, sem dados e anterior SOMENTE à migration da Fase 2.
function Invoke-TestSql([string]$Path) {
  & psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $Path
  if ($LASTEXITCODE -ne 0) { throw "Falha SQL: $Path" }
}
& createdb -w -h 127.0.0.1 -p $Port -U postgres $Database
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar banco novo; nenhum banco existente será alterado.' }
Invoke-TestSql (Join-Path $projectRoot 'supabase/tests/fixtures/multiunit_postgres_prerequisites.sql')
Invoke-TestSql $schemaPath
Invoke-TestSql (Join-Path $projectRoot 'docs/multi-unidades/fase2-20260915/preflight.sql')
$scratch=Join-Path $projectRoot ".phase2.local/$Database"
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
$preflight=Get-Content -Raw (Join-Path $projectRoot 'docs/multi-unidades/fase2-20260915/preflight.sql')
$cases=@{
  body="ALTER FUNCTION public.cleanup_old_audit_logs(integer) SET search_path='public,pg_temp';";
  acl='REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs(integer) FROM PUBLIC;';
  signature='CREATE FUNCTION public.cleanup_old_audit_logs(text) RETURNS integer LANGUAGE sql AS ''SELECT 0'';';
  policy='CREATE POLICY unexpected ON public.companies FOR SELECT TO authenticated USING(true);';
  table_grants='GRANT SELECT ON public.companies TO anon;'
}
foreach($case in $cases.GetEnumerator()) {
  $casePath=Join-Path $scratch 'drift.sql'
  $logPath=Join-Path $scratch 'drift.log'
  # Conexão encerra no erro esperado e reverte a alteração sintética.
  ("BEGIN;`n$($case.Value)`n"+$preflight.Replace('BEGIN TRANSACTION READ ONLY;','')) | Set-Content -Encoding utf8 $casePath
  & psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $casePath > $logPath 2>&1
  if($LASTEXITCODE -eq 0 -or !(Select-String -Path $logPath -Pattern 'PHASE2_.*DRIFT' -Quiet)) { throw "Drift não detectado: $($case.Key)" }
  Write-Output "PASS drift $($case.Key)"
}
Invoke-TestSql (Join-Path $projectRoot 'docs/multi-unidades/fase2-20260915/preflight.sql')
Invoke-TestSql (Join-Path $projectRoot 'supabase/migrations/20260915140812_contain_global_maintenance_and_companies.sql')
Invoke-TestSql (Join-Path $projectRoot 'supabase/tests/database/phase2_global_containment.sql')
Invoke-TestSql (Join-Path $projectRoot 'docs/multi-unidades/fase2-20260915/pos-validacao.sql')
Invoke-TestSql (Join-Path $projectRoot 'supabase/rollback/phase2_fail_closed.sql')
$rollbackChecks=@'
DO $$ BEGIN
 IF has_function_privilege('service_role','public.cleanup_old_audit_logs(integer)','EXECUTE')
 OR has_function_privilege('service_role','public.refresh_materialized_views()','EXECUTE')
 OR has_function_privilege('authenticated','public.rpc_create_company(text,text)','EXECUTE')
 OR has_function_privilege('anon','public.rpc_create_company(text,text)','EXECUTE')
 OR has_table_privilege('authenticated','public.companies','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
 OR NOT has_table_privilege('authenticated','public.companies','SELECT')
 OR (SELECT count(*) FROM pg_policies WHERE tablename='companies' AND policyname='companies_read')<>1 THEN
  RAISE EXCEPTION 'PHASE2_SAFE_ROLLBACK_FAILED';
 END IF;
END $$;
'@
$rollbackPath=Join-Path $scratch 'rollback-check.sql'
$rollbackChecks | Set-Content -Encoding utf8 $rollbackPath
Invoke-TestSql $rollbackPath
Write-Output 'PASS rollback de contenção; não reabre grants vulneráveis.'
Write-Output "PASS: $Database em 127.0.0.1:$Port; fixtures revertidas por ROLLBACK."
