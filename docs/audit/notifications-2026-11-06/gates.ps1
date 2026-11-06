param([switch]$Resume)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;C:\Program Files\Docker\Docker\resources\bin;'+$env:Path
$backend=Join-Path $root 'nest-boilerplate/nest-boilerplate';$web=Join-Path $root 'web'
function Check([string]$label,[scriptblock]$action){$global:LASTEXITCODE=0;& $action *> (Join-Path $PSScriptRoot ($label+'.txt'));if($global:LASTEXITCODE -ne 0){throw ('Gate failed: '+$label)}}
# Capture live types before stopping only our recorded listeners.
if(-not $Resume){
Check 'live-types' {Push-Location $web;try{pnpm exec openapi-typescript http://localhost:5003/docs-json -o src/lib/api/schema.d.ts}finally{Pop-Location}}
$owned=Get-Content (Join-Path $PSScriptRoot 'owned-processes.json') -Raw|ConvertFrom-Json
foreach($entry in $owned){$l=Get-NetTCPConnection -LocalPort $entry.port -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1;if($l){if($l.OwningProcess -ne $entry.pid){throw 'Listener identity changed'};Stop-Process -Id $entry.pid -Force}}
}
Check 'backend-build-final' {pnpm --dir $backend build}
Check 'backend-typecheck-final' {pnpm --dir $backend typecheck}
Check 'backend-lint' {pnpm --dir $backend lint:check}
Check 'contract-phase3' {pnpm --dir $backend contract:phase3:check}
Check 'contract-phase2' {pnpm --dir $backend contract:phase2:check}
Check 'backend-unit' {& (Join-Path $PSScriptRoot 'run.ps1') unit}
# The documented slow DROP DATABASE teardown requires this on the disposable container only.
try {
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'ALTER SYSTEM SET fsync=off' | Out-Null
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'SELECT pg_reload_conf()' | Out-Null
 Check 'backend-e2e' {& (Join-Path $PSScriptRoot 'run.ps1') e2e}
}finally{
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'ALTER SYSTEM RESET fsync' | Out-Null
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'SELECT pg_reload_conf()' | Out-Null
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -Atc 'SHOW fsync' | Set-Content (Join-Path $PSScriptRoot 'pg-durability-restored.txt')
}
Check 'web-unit' {pnpm --dir $web test}
Check 'web-lint' {pnpm --dir $web lint}
Check 'web-typecheck-final' {pnpm --dir $web typecheck}
Check 'web-routes' {pnpm --dir $web check:routes}
Check 'web-build-final' {& (Join-Path $PSScriptRoot 'build-web.ps1')}
'All full gates passed' | Set-Content (Join-Path $PSScriptRoot 'full-gates.txt')
