param(
 [Parameter(Mandatory=$true)][string]$TemplateDatabase,
 [int]$Port=15440,
 [string]$Database=('moralles_phase4_test_'+(Get-Date -Format 'yyyyMMddHHmmss'))
)
$ErrorActionPreference='Stop'
if($Database -notmatch '^moralles_phase4_test_[a-zA-Z0-9_]+$' -or $TemplateDatabase -notmatch '^moralles_phase[34]_test_[a-zA-Z0-9_]+$') { throw 'Exige nomes de bancos locais descartáveis.' }
$root=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path $root ".phase4.local/$Database"
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
function RunSql([string]$File) {
 & psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $File
 if($LASTEXITCODE -ne 0) { throw "SQL failed: $File" }
}
# O template deve ser schema atual vazio, com Fases 2/3 apenas no ensaio.
# Clone local novo: não conecta remoto, não apaga/reutiliza banco nem reaplica implantação.
$empty=& psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $TemplateDatabase -Atc 'SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.companies)+(SELECT count(*) FROM public.produtos)+(SELECT count(*) FROM public.audit_logs);'
if($LASTEXITCODE -ne 0 -or $empty.Trim() -ne '0') { throw 'Template deve estar vazio de fixtures/dados.' }
& createdb -w -h 127.0.0.1 -p $Port -U postgres -T $TemplateDatabase $Database
if($LASTEXITCODE -ne 0) { throw 'Banco existente ou indisponível; não alterado.' }
$preflight=Get-Content -Raw (Join-Path $root 'docs/multi-unidades/fase4-20260915/preflight.sql')
RunSql (Join-Path $root 'docs/multi-unidades/fase4-20260915/preflight.sql')
$cases=@{
 body="ALTER FUNCTION public.ensure_salmon_raw_product() SET search_path='pg_temp';";
 acl='GRANT EXECUTE ON FUNCTION public.ensure_salmon_raw_product() TO supabase_admin;';
 overload="CREATE FUNCTION public.ensure_salmon_raw_product(uuid) RETURNS uuid LANGUAGE sql AS 'SELECT `$1';";
 trigger='ALTER TABLE public.salmon_entries DISABLE TRIGGER trg_validate_salmon_entry;';
 column='ALTER TABLE public.salmon_entries ALTER COLUMN expiration_date SET DEFAULT CURRENT_DATE;';
 policy='CREATE POLICY phase4_open ON public.salmon_entries FOR SELECT TO authenticated USING(true);';
 index='DROP INDEX public.idx_mov_reference_unique;';
 caller="CREATE FUNCTION public.phase4_caller() RETURNS uuid LANGUAGE sql AS 'SELECT public.ensure_salmon_raw_product()';"
}
foreach($case in $cases.GetEnumerator()) {
 $file=Join-Path $scratch 'drift.sql'; $log=Join-Path $scratch 'drift.log'
 ("BEGIN;`n$($case.Value)`n"+$preflight.Replace('BEGIN TRANSACTION READ ONLY;','')) | Set-Content -Encoding utf8 $file
 & psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $file > $log 2>&1
 if($LASTEXITCODE -eq 0 -or !(Select-String -LiteralPath $log -Pattern 'PHASE4_.*DRIFT' -Quiet)) { throw "Drift não recusado: $($case.Key)" }
 Write-Output "PASS drift $($case.Key)"
}
RunSql (Join-Path $root 'supabase/tests/database/phase4_before.sql')
RunSql (Join-Path $root 'supabase/migrations/20260915200818_harden_salmon_internal_functions.sql')
RunSql (Join-Path $root 'supabase/tests/database/phase4_salmon.sql')
RunSql (Join-Path $root 'docs/multi-unidades/fase4-20260915/pos-validacao.sql')
# Só adapta o guard de nome do banco no harness; nenhum corpo/assertion é alterado.
$logs=(Get-Content -Raw (Join-Path $root 'supabase/tests/database/phase3_logs.sql')).Replace("LIKE 'moralles_phase3_test_%'","LIKE 'moralles_phase4_test_%'")
$logTests=Join-Path $scratch 'phase3-logs.sql'; $logs | Set-Content -Encoding utf8 $logTests
RunSql $logTests
Write-Output "PASS $Database; executar test-phase4-concurrency.mjs para concorrência/recuo."
