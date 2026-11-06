$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$web=Join-Path $root 'web';$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;'+$env:Path
function Check([string]$label,[scriptblock]$action){$global:LASTEXITCODE=0;& $action *> (Join-Path $PSScriptRoot ($label+'.txt'));if($global:LASTEXITCODE -ne 0){throw ('Gate failed: '+$label)}}
Check 'backend-positive-final' {& (Join-Path $PSScriptRoot 'run.ps1') e2e --runTestsByPath (Join-Path $root 'nest-boilerplate/nest-boilerplate/test/notifications.e2e-spec.ts')}
Check 'web-unit-focused-final' {Push-Location $web;try{node --require ./tests/register.cjs --test tests/notifications.test.cjs tests/notification-preferences.test.cjs tests/p4-settings.test.cjs}finally{Pop-Location}}
Check 'web-lint-final' {pnpm --dir $web lint}
Check 'web-typecheck-final' {pnpm --dir $web typecheck}
Check 'web-build-final' {& (Join-Path $PSScriptRoot 'build-web.ps1')}
Check 'browser-final-runner' {& (Join-Path $PSScriptRoot 'browser-final.ps1')}
'Final positive controls and browser passed'|Set-Content (Join-Path $PSScriptRoot 'positive-final-result.txt')
