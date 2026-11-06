$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$web=Join-Path $root 'web'
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;'+$env:Path;$env:NODE_OPTIONS='--max-old-space-size=768'
function Check([string]$name,[scriptblock]$action){$global:LASTEXITCODE=0;&$action *> (Join-Path $PSScriptRoot ($name+'.txt'));if($global:LASTEXITCODE -ne 0){throw ('Failed '+$name)}}
Push-Location $web
try{
 $results=@()
 foreach($kind in @('missing','placement','print')){
  $env:SF_PDF_BRAND_MUTATION=$kind
  $file=Join-Path $PSScriptRoot ('mutation-'+$kind+'.txt')
  node --require (Join-Path $PSScriptRoot 'mutate.cjs') --require ./tests/register.cjs --test tests/pdf-brand.test.cjs *> $file
  $code=$LASTEXITCODE;$text=Get-Content $file -Raw;$applied=$text -match 'MUTATION_APPLIED [a-z]+ [1-9]';$assertion=$text -match 'ERR_ASSERTION'
  $results+=@{kind=$kind;exit=$code;applied=$applied;assertion=$assertion}
  if($code -eq 0 -or -not $applied -or -not $assertion){throw 'Fault not caught meaningfully'}
 }
 $results|ConvertTo-Json|Set-Content (Join-Path $PSScriptRoot 'mutations.json')
 Remove-Item Env:SF_PDF_BRAND_MUTATION
 Check 'unit' {node --require ./tests/register.cjs --test --test-concurrency=1 tests/*.test.cjs}
 Check 'lint' {pnpm lint}
 Check 'typecheck' {pnpm typecheck}
 Check 'routes' {pnpm check:routes}
}finally{Remove-Item Env:SF_PDF_BRAND_MUTATION -ErrorAction SilentlyContinue;Pop-Location}
Check 'build' {& (Join-Path $root 'docs/audit/notifications-2026-11-06/build-web.ps1')}
'All branding gates passed'|Set-Content (Join-Path $PSScriptRoot 'gates-result.txt')
