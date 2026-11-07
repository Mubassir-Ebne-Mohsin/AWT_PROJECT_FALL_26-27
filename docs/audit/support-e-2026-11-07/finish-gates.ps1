$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$backend=Join-Path $root 'nest-boilerplate/nest-boilerplate';$web=Join-Path $root 'web'
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;C:\Program Files\Docker\Docker\resources\bin;'+$env:Path
function Check([string]$name,[scriptblock]$action){$global:LASTEXITCODE=0;&$action *> (Join-Path $PSScriptRoot ($name+'.txt'));if($global:LASTEXITCODE -ne 0){throw ('Failed '+$name)}}
& (Join-Path $PSScriptRoot 'database-gates.ps1') -Start 3
$env:NODE_OPTIONS='--max-old-space-size=768'
Check 'web-unit' {Push-Location $web;try{node --require ./tests/register.cjs --test --test-concurrency=1 tests/*.test.cjs}finally{Pop-Location}}
Check 'web-lint-final' {pnpm --dir $web lint}
Check 'web-typecheck-final' {pnpm --dir $web typecheck}
Check 'web-routes' {pnpm --dir $web check:routes}
'All E full gates passed'|Set-Content (Join-Path $PSScriptRoot 'full-gates.txt')
