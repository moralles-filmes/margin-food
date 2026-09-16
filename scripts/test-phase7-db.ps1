param(
 [string]$TemplateDatabase='moralles_phase7_test_base',
 [int]$Port=15440,
 [string]$Database=('moralles_phase7_test_'+(Get-Date -Format 'yyyyMMddHHmmss'))
)
$ErrorActionPreference='Stop'
if($Database -notmatch '^moralles_phase7_test_[a-zA-Z0-9_]+$' -or $TemplateDatabase -notmatch '^moralles_phase7_test_[a-zA-Z0-9_]+$') { throw 'Exige bancos locais descartáveis; template Fases 2–6 já aplicado.' }
$root=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path $root ".phase7.local/$Database"
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
function RunSql([string]$File) {
 & psql -X -w -q -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $File
 if($LASTEXITCODE -ne 0) { throw "SQL failed: $File" }
}
$empty=& psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $TemplateDatabase -Atc 'SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.companies)+(SELECT count(*) FROM public.produtos)+(SELECT count(*) FROM public.suppliers)+(SELECT count(*) FROM public.audit_logs);'
if($LASTEXITCODE -ne 0 -or $empty.Trim() -ne '0') { throw 'Template deve estar vazio.' }
& createdb -w -h 127.0.0.1 -p $Port -U postgres -T $TemplateDatabase $Database
if($LASTEXITCODE -ne 0) { throw 'Banco existente/indisponível; não alterado.' }
$preflight=Get-Content -Raw (Join-Path $root 'docs/multi-unidades/fase7-20260916/preflight.sql')
RunSql (Join-Path $root 'docs/multi-unidades/fase7-20260916/preflight.sql')
RunSql (Join-Path $root 'docs/multi-unidades/fase7-20260916/preflight-readers.sql')
RunSql (Join-Path $root 'docs/multi-unidades/fase7-20260916/preflight-notifications.sql')
$cases=@{
 body="ALTER FUNCTION public.get_saldo_produto(uuid) SET search_path='pg_temp';";
 acl='GRANT EXECUTE ON FUNCTION public.set_cache(text,jsonb,integer) TO supabase_admin;';
 overload="CREATE FUNCTION public.set_cache(uuid) RETURNS uuid LANGUAGE sql AS 'SELECT `$1';";
 trigger='ALTER TABLE public.produtos DISABLE TRIGGER trg_aa_produtos_force_company_id;';
 column='ALTER TABLE public.produtos ALTER COLUMN company_id DROP DEFAULT;';
 policy='CREATE POLICY phase7_open ON public.stock_categories FOR ALL TO authenticated USING(true);';
 index='DROP INDEX public.produtos_company_sku_unique;';
 table_acl='GRANT SELECT ON public.produtos TO anon;';
 column_acl='GRANT UPDATE(nome_produto) ON public.produtos TO anon;';
 inherited_role='GRANT pg_read_all_data TO authenticated;';
 default_acl='ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;';
 caller="CREATE FUNCTION public.phase7_caller() RETURNS void LANGUAGE sql AS 'SELECT public.set_cache(''x'',''{}'')';";
 view='ALTER MATERIALIZED VIEW public.mv_giro_estoque OWNER TO service_role;';
 prerequisite='ALTER TABLE public.supplier_item_prices DROP CONSTRAINT supplier_prices_product_tenant_fk;'
}
foreach($case in $cases.GetEnumerator()) {
 $file=Join-Path $scratch 'drift.sql'; $log=Join-Path $scratch 'drift.log'
 ("BEGIN;`n$($case.Value)`n"+$preflight.Replace('BEGIN TRANSACTION READ ONLY;','')) | Set-Content -Encoding utf8 $file
 & psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $file > $log 2>&1
 if($LASTEXITCODE -eq 0 -or !(Select-String -LiteralPath $log -Pattern 'PHASE7_.*(DRIFT|REQUIRED)' -Quiet)) { throw "Drift não recusado: $($case.Key)" }
 Write-Output "PASS drift $($case.Key)"
}
foreach($name in @('20260916133617_phase7_contain_non_rls_privileges','20260916133618_phase7_align_reference_catalogs','20260916133619_phase7_guard_sql_writers','20260916134848_phase7_scope_upsert_conflicts','20260916135928_phase7_guard_stock_readers','20260916141000_phase7_scope_notification_writer')) {
 RunSql (Join-Path $root "supabase/migrations/$name.sql")
}
RunSql (Join-Path $root 'supabase/tests/database/phase7_security.sql')
foreach($name in @('phase3_logs','phase4_salmon','phase5_suppliers','phase6_products')) {
 $sql=(Get-Content -Raw (Join-Path $root "supabase/tests/database/$name.sql")) -replace "LIKE 'moralles_phase[3456]_test_%'", "LIKE 'moralles_phase7_test_%'"
 $file=Join-Path $scratch "$name.sql"; $sql | Set-Content -Encoding utf8 $file
 RunSql $file
}
Write-Output "PASS $Database; concorrência/recuo: node scripts/test-phase7-concurrency.mjs $Database"
