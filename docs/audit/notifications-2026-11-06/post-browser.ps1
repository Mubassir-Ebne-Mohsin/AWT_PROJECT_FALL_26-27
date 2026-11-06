$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$web=Join-Path $root 'web';$backend=Join-Path $root 'nest-boilerplate/nest-boilerplate'
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;C:\Program Files\Docker\Docker\resources\bin;'+$env:Path
function Check([string]$label,[scriptblock]$action){$global:LASTEXITCODE=0;& $action *> (Join-Path $PSScriptRoot ($label+'.txt'));if($global:LASTEXITCODE -ne 0){throw ('Gate failed: '+$label)}}
if(-not (Test-Path (Join-Path $PSScriptRoot 'positive-final-result.txt'))){throw 'Earlier positive/browser job has not finished'}
$env:SF_WEB_URL='http://localhost:3003';$env:SF_API_URL='http://localhost:5003/v1';$env:SF_BROWSER_CHANNEL='chrome';$env:SF_PG_CONTAINER='stressforge-m9-postgres';$env:SF_PG_USER='sf_audit';$env:SF_PG_DB=(Get-Content (Join-Path $PSScriptRoot 'runtime.json') -Raw|ConvertFrom-Json).database;$env:SF_NOTIFICATIONS_REDUCED='1';$env:NODE_OPTIONS='--max-old-space-size=768'
Check 'browser-reduced-motion' {Push-Location $web;try{pnpm exec playwright test tests/browser/notifications.spec.ts --grep 'a real Support reply' --workers=1}finally{Pop-Location}}
Remove-Item Env:SF_NOTIFICATIONS_REDUCED
$owned=Get-Content (Join-Path $PSScriptRoot 'owned-processes.json') -Raw|ConvertFrom-Json
foreach($entry in $owned){$l=Get-NetTCPConnection -LocalPort $entry.port -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1;if($l){if($l.OwningProcess -ne $entry.pid){throw 'Listener identity changed'};Stop-Process -Id $entry.pid -Force}}
Check 'backend-e2e-final-runner' {& (Join-Path $PSScriptRoot 'backend-e2e-final.ps1')}
Check 'backend-lint-final' {pnpm --dir $backend lint:check}
Check 'backend-typecheck-last' {pnpm --dir $backend typecheck}
Check 'web-lint-last' {pnpm --dir $web lint}
Check 'web-typecheck-last' {pnpm --dir $web typecheck}
Check 'preserve-final' {node (Join-Path $PSScriptRoot 'preserve.cjs')}
'Final full integration and static checks passed'|Set-Content (Join-Path $PSScriptRoot 'all-final-result.txt')
