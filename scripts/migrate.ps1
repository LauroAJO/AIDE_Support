# Runs every migration in migrations/ in filename order against the D1 database.
#
# CREATE TABLE/INDEX statements use IF NOT EXISTS, so re-runs are safe. ALTER
# TABLE ADD COLUMN statements are NOT idempotent (SQLite/D1 has no ADD COLUMN IF
# NOT EXISTS) and will report "duplicate column name" on a second run. That is
# expected and non-fatal, so we log it and continue to the next file instead of
# aborting the whole sequence.
#
# Usage:
#   npm run db:migrate          -> local  (scripts/migrate.ps1)
#   npm run db:migrate:remote   -> remote (scripts/migrate.ps1 -Remote)
#
# ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less .ps1 files as ANSI,
# so accented characters would corrupt the parser.

param([switch]$Remote)

$ErrorActionPreference = 'Continue'
$scope = if ($Remote) { '--remote' } else { '--local' }
$migrationsDir = Join-Path $PSScriptRoot '..\migrations'
$files = Get-ChildItem -Path (Join-Path $migrationsDir '*.sql') | Sort-Object Name

if (-not $files) {
  Write-Host "No .sql files found in $migrationsDir"
  exit 0
}

Write-Host "Applying $($files.Count) migration(s) [$scope] in name order..."

$ok = 0
$failed = 0
foreach ($file in $files) {
  Write-Host ""
  Write-Host "==> $($file.Name)"
  npx wrangler d1 execute aide-db $scope --file="$($file.FullName)" -y
  if ($LASTEXITCODE -eq 0) {
    $ok++
  } else {
    $failed++
    Write-Host "    (error/skipped - likely ALTER on an existing column)"
  }
}

Write-Host ""
Write-Host "Done: $ok applied, $failed error/skipped of $($files.Count)."
