param(
 [string]$TemplateDatabase='moralles_phase4_test_committed',
 [int]$Port=15440,
 [string]$Database=('moralles_phase5_test_'+(Get-Date -Format 'yyyyMMddHHmmss'))
)
$ErrorActionPreference='Stop'
if($Database -notmatch '^moralles_phase5_test_[a-zA-Z0-9_]+$' -or $TemplateDatabase -notmatch '^moralles_phase4_test_[a-zA-Z0-9_]+$') { throw 'Exige bancos locais descartáveis.' }
$root=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path $root ".phase5.local/$Database"
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
function RunSql([string]$File) {
 & psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $File
 if($LASTEXITCODE -ne 0) { throw "SQL failed: $File" }
}
# Template: schema atual SEM dados, Fases 2/3/4 somente no ensaio descartável.
# Não reaplica migrations históricas nem conecta a host remoto.
$empty=& psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $TemplateDatabase -Atc 'SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.companies)+(SELECT count(*) FROM public.suppliers)+(SELECT count(*) FROM public.supplier_item_prices)+(SELECT count(*) FROM public.audit_logs);'
if($LASTEXITCODE -ne 0 -or $empty.Trim() -ne '0') { throw 'Template deve estar vazio de fixtures/dados.' }
& createdb -w -h 127.0.0.1 -p $Port -U postgres -T $TemplateDatabase $Database
if($LASTEXITCODE -ne 0) { throw 'Banco existente ou indisponível; não alterado.' }
$preflight=Get-Content -Raw (Join-Path $root 'docs/multi-unidades/fase5-20260915/preflight.sql')
RunSql (Join-Path $root 'docs/multi-unidades/fase5-20260915/preflight.sql')
$cases=@{
 body="ALTER FUNCTION public.upsert_supplier(text) SET search_path='pg_temp';";
 acl='GRANT EXECUTE ON FUNCTION public.upsert_supplier(text) TO supabase_admin;';
 overload="CREATE FUNCTION public.upsert_supplier(uuid) RETURNS uuid LANGUAGE sql AS 'SELECT `$1';";
 trigger='ALTER TABLE public.supplier_item_prices DISABLE TRIGGER trg_validate_sip;';
 column='ALTER TABLE public.suppliers ALTER COLUMN company_id DROP DEFAULT;';
 policy='CREATE POLICY phase5_open ON public.suppliers FOR SELECT TO authenticated USING(true);';
 index='DROP INDEX public.idx_supplier_item_company_unique;';
 table_acl='GRANT SELECT ON public.suppliers TO anon;';
 column_acl='GRANT UPDATE(name) ON public.suppliers TO anon;'
 caller="CREATE FUNCTION public.phase5_caller() RETURNS bigint LANGUAGE sql AS 'SELECT count(*) FROM public.suppliers';"
}
foreach($case in $cases.GetEnumerator()) {
 $file=Join-Path $scratch 'drift.sql'; $log=Join-Path $scratch 'drift.log'
 ("BEGIN;`n$($case.Value)`n"+$preflight.Replace('BEGIN TRANSACTION READ ONLY;','')) | Set-Content -Encoding utf8 $file
 & psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $file > $log 2>&1
 if($LASTEXITCODE -eq 0 -or !(Select-String -LiteralPath $log -Pattern 'PHASE5_.*DRIFT' -Quiet)) { throw "Drift não recusado: $($case.Key)" }
 Write-Output "PASS drift $($case.Key)"
}
RunSql (Join-Path $root 'supabase/migrations/20260915225538_isolate_supplier_prices.sql')
RunSql (Join-Path $root 'supabase/tests/database/phase5_suppliers.sql')
foreach($phase in 3,4) {
 $name=if($phase -eq 3){'phase3_logs.sql'}else{'phase4_salmon.sql'}
 $sql=(Get-Content -Raw (Join-Path $root "supabase/tests/database/$name")).Replace("LIKE 'moralles_phase${phase}_test_%'","LIKE 'moralles_phase5_test_%'")
 $file=Join-Path $scratch $name; $sql | Set-Content -Encoding utf8 $file
 RunSql $file
}
RunSql (Join-Path $root 'docs/multi-unidades/fase5-20260915/pos-validacao.sql')
Write-Output "PASS $Database; concorrência/recuo: node scripts/test-phase5-concurrency.mjs $Database"
