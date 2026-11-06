$ErrorActionPreference='Stop'
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;'+$env:Path
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$web=Join-Path $root 'web'
function Check([string]$label,[scriptblock]$action){$global:LASTEXITCODE=0;& $action *> (Join-Path $PSScriptRoot ($label+'.txt'));if($global:LASTEXITCODE -ne 0){throw ('Gate failed: '+$label)}}
Check 'web-unit' {pnpm --dir $web test}
Check 'web-lint' {pnpm --dir $web lint}
Check 'web-typecheck-final' {pnpm --dir $web typecheck}
Check 'web-routes' {pnpm --dir $web check:routes}
Check 'web-build-final' {& (Join-Path $PSScriptRoot 'build-web.ps1')}
'Web final gates passed'|Set-Content (Join-Path $PSScriptRoot 'web-gates.txt')
