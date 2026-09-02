$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot ".runtime"))
if (-not $runtimeRoot.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Runtime path escaped project root"
}

$downloads = Join-Path $runtimeRoot "downloads"
$bin = Join-Path $runtimeRoot "bin"
$postgresTarget = Join-Path $runtimeRoot "postgresql"
New-Item -ItemType Directory -Force -Path $downloads, $bin | Out-Null

$postgresUrl = "https://get.enterprisedb.com/postgresql/postgresql-18.6-1-windows-x64-binaries.zip"
$postgresHash = "fbe23da234ee31547bf8a36d29dfd81e82b849df2d2b78d2eecb43d360252f8c"
$postgresArchive = Join-Path $downloads "postgresql-18.6-1-windows-x64-binaries.zip"
$minioUrl = "https://dl.min.io/server/minio/release/windows-amd64/minio.exe"
$minioHash = "af709e6ba68488404e85acdd22a3030d0f5e56a108d4b27d744f18ceb50861b4"
$minioBinary = Join-Path $bin "minio.exe"

function Assert-FileHash([string] $path, [string] $expected) {
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "Checksum mismatch for $path. Expected $expected, got $actual"
  }
}

if (-not (Test-Path -LiteralPath $postgresArchive)) {
  Write-Host "Downloading PostgreSQL 18.6 portable binaries..."
  Invoke-WebRequest -Uri $postgresUrl -OutFile $postgresArchive
}
Assert-FileHash $postgresArchive $postgresHash

if (-not (Test-Path -LiteralPath (Join-Path $postgresTarget "pgsql\bin\postgres.exe"))) {
  if (Test-Path -LiteralPath $postgresTarget) {
    throw "PostgreSQL target exists but is incomplete: $postgresTarget"
  }
  Expand-Archive -LiteralPath $postgresArchive -DestinationPath $postgresTarget
}

if (-not (Test-Path -LiteralPath $minioBinary)) {
  Write-Host "Downloading MinIO portable server..."
  Invoke-WebRequest -Uri $minioUrl -OutFile $minioBinary
}
Assert-FileHash $minioBinary $minioHash

Write-Host "Portable PostgreSQL and MinIO binaries are ready under $runtimeRoot"
