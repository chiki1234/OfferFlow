$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$runtimeRoot = Join-Path $projectRoot ".runtime"
$envFile = Join-Path $projectRoot ".env.local"
if (-not (Test-Path $envFile)) {
  throw ".env.local is missing. Copy .env.example and set local secrets first."
}

& (Join-Path $PSScriptRoot "install-local-services.ps1")
Get-Content $envFile | ForEach-Object {
  if ($_ -and -not $_.StartsWith("#") -and $_.Contains("=")) {
    $name, $value = $_ -split "=", 2
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

$databaseUri = [Uri]$env:DATABASE_URL
if ($databaseUri.Scheme -notin "postgres", "postgresql" -or $databaseUri.Host -notin "127.0.0.1", "localhost") {
  throw "services:setup only initializes a PostgreSQL database on localhost."
}
$databaseName = $databaseUri.AbsolutePath.TrimStart("/")
if ($databaseName -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
  throw "DATABASE_URL contains an unsupported database name."
}
$userInfo = [Uri]::UnescapeDataString($databaseUri.UserInfo) -split ":", 2
if ($userInfo.Count -ne 2) {
  throw "DATABASE_URL must include a username and password."
}
$databaseUser, $databasePassword = $userInfo
$databasePort = if ($databaseUri.Port -gt 0) { $databaseUri.Port } else { 5432 }
$postgresBin = Join-Path $runtimeRoot "postgresql\pgsql\bin"
$postgresData = Join-Path $runtimeRoot "data\postgres"

if (-not (Test-Path (Join-Path $postgresData "PG_VERSION"))) {
  New-Item -ItemType Directory -Force -Path $postgresData | Out-Null
  $passwordFile = Join-Path $runtimeRoot "postgres-initial-password.txt"
  try {
    [IO.File]::WriteAllText($passwordFile, $databasePassword)
    & (Join-Path $postgresBin "initdb.exe") --pgdata=$postgresData --username=$databaseUser --pwfile=$passwordFile --auth-local=scram-sha-256 --auth-host=scram-sha-256 --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL initialization failed." }
  } finally {
    if (Test-Path $passwordFile) { Remove-Item -LiteralPath $passwordFile }
  }
}

& (Join-Path $PSScriptRoot "start-local-services.ps1")
$env:PGPASSWORD = $databasePassword
$exists = & (Join-Path $postgresBin "psql.exe") -h $databaseUri.Host -p $databasePort -U $databaseUser -d postgres -tAc "select 1 from pg_database where datname='$databaseName'"
if ($exists -ne "1") {
  & (Join-Path $postgresBin "createdb.exe") -h $databaseUri.Host -p $databasePort -U $databaseUser $databaseName
  if ($LASTEXITCODE -ne 0) { throw "Database creation failed." }
}

Write-Host "Local PostgreSQL database and MinIO service are ready."
