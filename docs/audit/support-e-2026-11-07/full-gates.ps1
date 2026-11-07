$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$backend=Join-Path $root 'nest-boilerplate/nest-boilerplate';$web=Join-Path $root 'web'
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;C:\Program Files\Docker\Docker\resources\bin;'+$env:Path
function Check([string]$name,[scriptblock]$action){$global:LASTEXITCODE=0;&$action *> (Join-Path $PSScriptRoot ($name+'.txt'));if($global:LASTEXITCODE -ne 0){throw ('Failed '+$name)}}
Check 'live-types' {pnpm --dir $web exec openapi-typescript http://localhost:5003/docs-json -o src/lib/api/schema.d.ts}
$owned=Get-Content (Join-Path $PSScriptRoot 'owned-processes.json') -Raw|ConvertFrom-Json
foreach($entry in $owned){$l=Get-NetTCPConnection -LocalPort $entry.port -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1;if($l){if($l.OwningProcess -ne $entry.pid){throw 'Audit listener identity changed'};Stop-Process -Id $entry.pid -Force}}
$mutations=@()
try{
 foreach($kind in @('personal','privacy','cycle')){
  $env:SF_SUPPORT_E_MUTATION=$kind;$file=Join-Path $PSScriptRoot ('mutation-'+$kind+'.txt')
  & (Join-Path $PSScriptRoot 'run.ps1') e2e --runTestsByPath (Join-Path $backend 'test/support-extras.e2e-spec.ts') *> $file
  $code=$LASTEXITCODE;$text=Get-Content $file -Raw;$applied=$text -match 'MUTATION_APPLIED [a-z]+ [1-9][0-9]*';$functional=$text -match 'expect\(received\)|expected 200.*got|expected 404.*got';$mutations+=@{kind=$kind;exit=$code;applied=$applied;functionalFailure=$functional};if($code -eq 0 -or -not $applied -or -not $functional){throw ('Mutation not caught meaningfully: '+$kind)}
 }
 $env:SF_SUPPORT_E_MUTATION='send';$file=Join-Path $PSScriptRoot 'mutation-send.txt';Push-Location $web
 try{node --require (Join-Path $PSScriptRoot 'mutate.cjs') --require ./tests/register.cjs --test tests/support-extras.test.cjs *> $file;$code=$LASTEXITCODE}finally{Pop-Location}
 $text=Get-Content $file -Raw;$applied=$text -match 'MUTATION_APPLIED send [1-9]';$functional=$text -match 'ERR_ASSERTION';$mutations+=@{kind='send';exit=$code;applied=$applied;functionalFailure=$functional};if($code -eq 0 -or -not $applied -or -not $functional){throw 'Automatic-send fault not caught'}
}finally{Remove-Item Env:SF_SUPPORT_E_MUTATION -ErrorAction SilentlyContinue;$mutations|ConvertTo-Json|Set-Content (Join-Path $PSScriptRoot 'mutations.json')}
Check 'backend-build-final' {pnpm --dir $backend build}
Check 'backend-typecheck-final' {pnpm --dir $backend typecheck}
Check 'backend-lint-final' {pnpm --dir $backend lint:check}
Check 'phase3-contract' {pnpm --dir $backend contract:phase3:check}
Check 'phase2-contract' {pnpm --dir $backend contract:phase2:check}
Check 'backend-unit' {& (Join-Path $PSScriptRoot 'run.ps1') unit}
& (Join-Path $PSScriptRoot 'database-gates.ps1')
$env:NODE_OPTIONS='--max-old-space-size=768'
Check 'web-unit' {Push-Location $web;try{node --require ./tests/register.cjs --test --test-concurrency=1 tests/*.test.cjs}finally{Pop-Location}}
Check 'web-lint-final' {pnpm --dir $web lint}
Check 'web-typecheck-final' {pnpm --dir $web typecheck}
Check 'web-routes' {pnpm --dir $web check:routes}
'All E full gates passed'|Set-Content (Join-Path $PSScriptRoot 'full-gates.txt')
