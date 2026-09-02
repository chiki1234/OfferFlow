$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$runtimeRoot = Join-Path $projectRoot ".runtime"
$postgresBin = Join-Path $runtimeRoot "postgresql\pgsql\bin"
$postgresData = Join-Path $runtimeRoot "data\postgres"
$minioBinary = Join-Path $runtimeRoot "bin\minio.exe"
$minioData = Join-Path $runtimeRoot "data\minio"
$logs = Join-Path $runtimeRoot "logs"

if (-not (Test-Path (Join-Path $postgresBin "pg_ctl.exe")) -or -not (Test-Path $minioBinary)) {
  throw "Portable services are missing. Run pnpm services:install first."
}
if (-not (Test-Path (Join-Path $postgresData "PG_VERSION"))) {
  throw "PostgreSQL data directory is not initialized. Follow README local setup first."
}

Get-Content (Join-Path $projectRoot ".env.local") | ForEach-Object {
  if ($_ -and -not $_.StartsWith("#") -and $_.Contains("=")) {
    $name, $value = $_ -split "=", 2
    if (-not [Environment]::GetEnvironmentVariable($name)) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

New-Item -ItemType Directory -Force -Path $minioData, $logs | Out-Null
$pgReady = & (Join-Path $postgresBin "pg_isready.exe") -h 127.0.0.1 -p 5432 2>$null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $postgresBin "pg_ctl.exe") -D $postgresData -l (Join-Path $logs "postgres.log") -o "-p 5432" start
} else {
  Write-Host $pgReady
}

try {
  $minioReady = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:9000/minio/health/live" -TimeoutSec 2).StatusCode -eq 200
} catch {
  $minioReady = $false
}
if (-not $minioReady) {
  $env:MINIO_ROOT_USER = $env:S3_ACCESS_KEY
  $env:MINIO_ROOT_PASSWORD = $env:S3_SECRET_KEY
  $process = Start-Process -FilePath $minioBinary -ArgumentList @(
    "server", $minioData, "--address", "127.0.0.1:9000", "--console-address", "127.0.0.1:9001"
  ) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "minio.out.log") -RedirectStandardError (Join-Path $logs "minio.err.log") -PassThru
  Set-Content -LiteralPath (Join-Path $runtimeRoot "minio.pid") -Value $process.Id
}

Write-Host "Local PostgreSQL and MinIO are running."
