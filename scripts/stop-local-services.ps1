$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$runtimeRoot = Join-Path $projectRoot ".runtime"
$postgresBin = Join-Path $runtimeRoot "postgresql\pgsql\bin"
$postgresData = Join-Path $runtimeRoot "data\postgres"
$minioBinary = [IO.Path]::GetFullPath((Join-Path $runtimeRoot "bin\minio.exe"))
$minioPidFile = Join-Path $runtimeRoot "minio.pid"

if (Test-Path (Join-Path $postgresBin "pg_ctl.exe")) {
  & (Join-Path $postgresBin "pg_ctl.exe") -D $postgresData stop -m fast
}

if (Test-Path $minioPidFile) {
  $minioPid = [int](Get-Content $minioPidFile -Raw)
  $process = Get-Process -Id $minioPid -ErrorAction SilentlyContinue
  if ($process) {
    $processPath = [IO.Path]::GetFullPath($process.Path)
    if ($processPath -ne $minioBinary) {
      throw "Refusing to stop PID $minioPid because it is not the project MinIO process."
    }
    Stop-Process -Id $minioPid
  }
  Remove-Item -LiteralPath $minioPidFile
}

Write-Host "Local PostgreSQL and MinIO are stopped."
