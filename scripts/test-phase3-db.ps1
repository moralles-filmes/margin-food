param(
  [Parameter(Mandatory=$true)][string]$SchemaFile,
  [int]$Port=15440,
  [string]$Database=('moralles_phase3_test_'+(Get-Date -Format 'yyyyMMddHHmmss'))
)
$ErrorActionPreference='Stop'
if($Database -notmatch '^moralles_phase3_test_[a-zA-Z0-9_]+$') { throw 'Exige um banco NOVO moralles_phase3_test_*' }
$schemaPath=(Resolve-Path -LiteralPath $SchemaFile).Path
$projectRoot=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path $projectRoot ".phase3.local/$Database"
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
function Invoke-TestSql([string]$Path) {
 & psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $Path
 if($LASTEXITCODE -ne 0) { throw "Falha SQL: $Path" }
}
# Nunca aceita URL/host remoto, nunca remove banco existente. Sem dados de produção.
& createdb -w -h 127.0.0.1 -p $Port -U postgres $Database
if($LASTEXITCODE -ne 0) { throw 'Banco já existe ou cluster indisponível; não alterado.' }
Invoke-TestSql (Join-Path $projectRoot 'supabase/tests/fixtures/multiunit_postgres_prerequisites.sql')
Invoke-TestSql $schemaPath
Invoke-TestSql (Join-Path $projectRoot 'docs/multi-unidades/fase3-20260915/preflight.sql')
# Fase 2 SOMENTE no ensaio descartável: não é autorização de publicação anterior.
Invoke-TestSql (Join-Path $projectRoot 'supabase/migrations/20260915140812_contain_global_maintenance_and_companies.sql')
$preflight=Get-Content -Raw (Join-Path $projectRoot 'docs/multi-unidades/fase3-20260915/preflight.sql')
$cases=@{
 body="ALTER FUNCTION public.log_audit(text,text,text,uuid,text,jsonb,jsonb,jsonb) SET search_path='pg_temp';";
 acl='GRANT SELECT ON public.audit_log TO anon;';
 column_acl='GRANT SELECT(user_id) ON public.audit_log TO anon;';
 policy='CREATE POLICY synthetic_open ON public.audit_logs FOR SELECT TO authenticated USING(true);';
 trigger='ALTER TABLE public.fin_contas DISABLE TRIGGER audit_fin_contas;';
 overload="CREATE FUNCTION public.log_audit(text) RETURNS void LANGUAGE plpgsql AS 'BEGIN RETURN; END';";
 column='ALTER TABLE public.audit_logs ALTER COLUMN company_id SET DEFAULT gen_random_uuid();';
 constraint='ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_company_id_fkey;'
}
foreach($case in $cases.GetEnumerator()) {
 $casePath=Join-Path $scratch 'drift.sql'
 $logPath=Join-Path $scratch 'drift.log'
 ("BEGIN;`n$($case.Value)`n"+$preflight.Replace('BEGIN TRANSACTION READ ONLY;','')) | Set-Content -Encoding utf8 $casePath
 & psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $casePath > $logPath 2>&1
 if($LASTEXITCODE -eq 0 -or !(Select-String -Path $logPath -Pattern 'PHASE3_.*DRIFT' -Quiet)) { throw "Drift não detectado: $($case.Key)" }
 Write-Output "PASS drift $($case.Key)"
}
Invoke-TestSql (Join-Path $projectRoot 'docs/multi-unidades/fase3-20260915/preflight.sql')
Invoke-TestSql (Join-Path $projectRoot 'supabase/migrations/20260915144030_trusted_log_writers_and_readers.sql')
$backfill=Get-Content -Raw (Join-Path $projectRoot 'supabase/migrations/20260915144031_classify_legacy_logs_safely.sql')
$casePath=Join-Path $scratch 'backfill-drift.sql'
$logPath=Join-Path $scratch 'backfill-drift.log'
$backfill.Replace('BEGIN;',"BEGIN;`nALTER FUNCTION log_private.stamp_log() SET search_path='pg_temp';") | Set-Content -Encoding utf8 $casePath
& psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $casePath > $logPath 2>&1
if($LASTEXITCODE -eq 0 -or !(Select-String -Path $logPath -Pattern 'PHASE3_BACKFILL_DEFINITION_DRIFT' -Quiet)) { throw 'Drift do writer não bloqueou backfill' }
Write-Output 'PASS drift entre writers e backfill'
Invoke-TestSql (Join-Path $projectRoot 'supabase/migrations/20260915144031_classify_legacy_logs_safely.sql')
Invoke-TestSql (Join-Path $projectRoot 'supabase/tests/database/phase3_logs.sql')
Invoke-TestSql (Join-Path $projectRoot 'docs/multi-unidades/fase3-20260915/pos-validacao.sql')
Write-Output "PASS: $Database; fixtures revertidas. Concorrência/recuo executados pelo runner complementar."
