param(
 [string]$TemplateDatabase='moralles_phase5_test_phase6_current',
 [int]$Port=15440,
 [string]$Database=('moralles_phase6_test_'+(Get-Date -Format 'yyyyMMddHHmmss'))
)
$ErrorActionPreference='Stop'
if($Database -notmatch '^moralles_phase6_test_[a-zA-Z0-9_]+$' -or $TemplateDatabase -notmatch '^moralles_phase5_test_[a-zA-Z0-9_]+$') { throw 'Exige bancos locais descartáveis.' }
$root=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path $root ".phase6.local/$Database"
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
function RunSql([string]$File) {
 & psql -X -w -q -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $File
 if($LASTEXITCODE -ne 0) { throw "SQL failed: $File" }
}
$empty=& psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $TemplateDatabase -Atc 'SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.companies)+(SELECT count(*) FROM public.produtos)+(SELECT count(*) FROM public.suppliers)+(SELECT count(*) FROM public.supplier_item_prices)+(SELECT count(*) FROM public.audit_logs);'
if($LASTEXITCODE -ne 0 -or $empty.Trim() -ne '0') { throw 'Template deve estar vazio.' }
& createdb -w -h 127.0.0.1 -p $Port -U postgres -T $TemplateDatabase $Database
if($LASTEXITCODE -ne 0) { throw 'Banco existente/indisponível; não alterado.' }
$preflight=Get-Content -Raw (Join-Path $root 'docs/multi-unidades/fase6-20260915/preflight.sql')
RunSql (Join-Path $root 'docs/multi-unidades/fase6-20260915/preflight.sql')
$cases=@{
 body="ALTER FUNCTION public.generate_next_sku(text) SET search_path='pg_temp';";
 acl='GRANT EXECUTE ON FUNCTION public.generate_next_sku(text) TO supabase_admin;';
 overload="CREATE FUNCTION public.generate_next_sku(uuid) RETURNS uuid LANGUAGE sql AS 'SELECT `$1';";
 new_api="CREATE FUNCTION public.deactivate_produto(text) RETURNS text LANGUAGE sql AS 'SELECT `$1';";
 trigger='ALTER TABLE public.produtos DISABLE TRIGGER trg_aa_produtos_force_company_id;';
 column='ALTER TABLE public.produtos ALTER COLUMN company_id DROP DEFAULT;';
 policy='CREATE POLICY phase6_open ON public.produtos FOR ALL TO authenticated USING(true);';
 index='DROP INDEX public.produtos_company_sku_unique;';
 table_acl='GRANT SELECT ON public.produtos TO anon;';
 column_acl='GRANT UPDATE(nome_produto) ON public.produtos TO anon;';
 inherited_role='GRANT pg_read_all_data TO authenticated;';
 caller="CREATE FUNCTION public.phase6_caller() RETURNS bigint LANGUAGE sql AS 'SELECT count(*) FROM public.produtos';";
 prerequisite='ALTER TABLE public.supplier_item_prices DROP CONSTRAINT supplier_prices_product_tenant_fk;'
}
foreach($case in $cases.GetEnumerator()) {
 $file=Join-Path $scratch 'drift.sql'; $log=Join-Path $scratch 'drift.log'
 ("BEGIN;`n$($case.Value)`n"+$preflight.Replace('BEGIN TRANSACTION READ ONLY;','')) | Set-Content -Encoding utf8 $file
 & psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $file > $log 2>&1
 if($LASTEXITCODE -eq 0 -or !(Select-String -LiteralPath $log -Pattern 'PHASE6_.*(DRIFT|REQUIRED)' -Quiet)) { throw "Drift não recusado: $($case.Key)" }
 Write-Output "PASS drift $($case.Key)"
}
RunSql (Join-Path $root 'supabase/migrations/20260915232846_align_product_catalog_permissions.sql')
RunSql (Join-Path $root 'supabase/tests/database/phase6_products.sql')
foreach($name in @('phase3_logs','phase4_salmon','phase5_suppliers')) {
 $sql=(Get-Content -Raw (Join-Path $root "supabase/tests/database/$name.sql")) -replace "LIKE 'moralles_phase[345]_test_%'", "LIKE 'moralles_phase6_test_%'"
 $file=Join-Path $scratch "$name.sql"; $sql | Set-Content -Encoding utf8 $file
 RunSql $file
}
RunSql (Join-Path $root 'docs/multi-unidades/fase6-20260915/pos-validacao.sql')
Write-Output "PASS $Database; concorrência/recuo: node scripts/test-phase6-concurrency.mjs $Database"
