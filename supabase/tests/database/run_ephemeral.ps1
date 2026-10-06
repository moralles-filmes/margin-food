# Roda um teste de banco DESCARTAVEL (PostgreSQL 16 local) e apaga o cluster no fim.
# Uso: powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/<arquivo>.sql
# Sai com codigo 0 so se o psql terminar sem erro; qualquer falha (initdb, pg_ctl,
# createdb ou psql) devolve codigo diferente de zero com a mensagem do passo que falhou.
# As mensagens deste script sao ASCII de proposito: o console do Windows PowerShell 5.1
# nao decodifica UTF-8 de forma confiavel.
param([Parameter(Mandatory = $true)][string]$Arquivo)

# Comandos nativos escrevem NOTICE/avisos em stderr; isso nao pode abortar o script.
# O resultado de cada comando e conferido por $LASTEXITCODE, nao por excecao.
$ErrorActionPreference = 'Continue'
$env:PGCLIENTENCODING = 'UTF8'

$pg = Join-Path $env:TEMP ('pg-ephemeral-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$log = "$pg.log"
$saidaCtl = "$pg.pg_ctl.out"
$erroCtl = "$pg.pg_ctl.err"
$porta = 54329
$falhou = $false

try {
  if (-not (Test-Path -LiteralPath $Arquivo)) { throw "arquivo de teste nao encontrado: $Arquivo" }

  initdb -D $pg -U postgres -A trust -E UTF8 --locale=C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "initdb falhou (codigo $LASTEXITCODE)" }

  # O postmaster herda os handles de saida do pg_ctl. Se a saida do pg_ctl passar por um
  # pipe do PowerShell (`| Out-Null`), o pipe so fecha quando o servidor morre e o script
  # trava aqui. Start-Process liga a saida a arquivos, sem pipe.
  $ctl = Start-Process -FilePath 'pg_ctl' -PassThru -NoNewWindow `
    -RedirectStandardOutput $saidaCtl -RedirectStandardError $erroCtl `
    -ArgumentList "-D `"$pg`" -o `"-p $porta`" -l `"$log`" -w start"
  $null = $ctl.Handle  # sem isto o Windows PowerShell 5.1 devolve ExitCode vazio
  $ctl.WaitForExit()
  if ($ctl.ExitCode -ne 0) {
    foreach ($f in @($saidaCtl, $erroCtl, $log)) {
      if (Test-Path -LiteralPath $f) { Get-Content -LiteralPath $f | Write-Host }
    }
    throw "pg_ctl start falhou (codigo $($ctl.ExitCode))"
  }

  createdb -h localhost -p $porta -U postgres teste
  if ($LASTEXITCODE -ne 0) { throw "createdb falhou (codigo $LASTEXITCODE)" }

  psql -h localhost -p $porta -U postgres -d teste -v ON_ERROR_STOP=1 -q -f $Arquivo
  if ($LASTEXITCODE -ne 0) { throw "psql falhou (codigo $LASTEXITCODE)" }
} catch {
  Write-Host "FALHOU: $($_.Exception.Message)"
  $falhou = $true
} finally {
  if (Test-Path -LiteralPath $pg) {
    # Para o cluster mesmo que o start tenha falhado a meio; o stop sem servidor so avisa.
    $parar = Start-Process -FilePath 'pg_ctl' -PassThru -NoNewWindow `
      -RedirectStandardOutput "$pg.stop.out" -RedirectStandardError "$pg.stop.err" `
      -ArgumentList "-D `"$pg`" -m fast stop"
    $null = $parar.Handle
    $parar.WaitForExit()
    Remove-Item -Recurse -Force -LiteralPath $pg -ErrorAction SilentlyContinue
  }
  foreach ($f in @($log, $saidaCtl, $erroCtl, "$pg.stop.out", "$pg.stop.err")) {
    Remove-Item -Force -LiteralPath $f -ErrorAction SilentlyContinue
  }
}

if ($falhou) { exit 1 }
exit 0
