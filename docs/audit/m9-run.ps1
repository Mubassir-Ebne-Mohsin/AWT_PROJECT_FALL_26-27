param([Parameter(Mandatory=$true)][ValidateSet('fresh','retention','api','api-instrumented','migrate','seed','unit','e2e','web-build','web-start','web-dev')][string]$Action, [Parameter(ValueFromRemainingArguments=$true)][string[]]$CheckArgs)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$backend=Join-Path $projectRoot 'nest-boilerplate/nest-boilerplate'
$frontend=Join-Path $projectRoot 'web'
$nodeDir='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64'
$auditNodeCmd=Get-Command node.exe -ErrorAction SilentlyContinue
if($auditNodeCmd){$auditNodeVersion=& $auditNodeCmd.Source --version;if($auditNodeVersion -match '^v22\.'){$nodeDir=Split-Path -Parent $auditNodeCmd.Source}}
if(-not(Test-Path (Join-Path $nodeDir 'node.exe'))){throw 'Select Node 22 on PATH before running M9 audit helpers'}
$env:Path=$nodeDir+';C:\Program Files\Docker\Docker\resources\bin;'+$env:Path
# Disposable audit-only configuration. Never load or copy the normal .env.
$env:NODE_ENV='development';$env:PORT='5003';$env:DB_HOST='127.0.0.1';$env:DB_PORT='5552'
$env:DB_USER='sf_audit';$env:DB_PASSWORD='sf_m9_disposable';$env:DB_DATABASE='sf_m9_audit';$env:DB_TEST_DATABASE='sf_m9_e2e'
$env:REDIS_HOST='127.0.0.1';$env:REDIS_PORT='6399';$env:REDIS_PASSWORD=''
$env:JWT_ACCESS_SECRET='m9-audit-only-access-secret-0123456789abcdef';$env:JWT_REFRESH_SECRET='m9-audit-only-refresh-secret-0123456789abcdef'
$env:DEMO_USER_PASSWORD='M9-Demo-Local-Only!';$env:AUTH_THROTTLE_LIMIT='300';$env:THROTTLE_LIMIT='120'
$env:CORS_ORIGINS='http://localhost:3003';$env:FRONTEND_URL='http://localhost:3003';$env:TRUST_PROXY_HOPS='0'
$env:JWT_ACCESS_TTL_SECONDS='900';$env:JWT_REFRESH_TTL_SECONDS='604800'
$env:NEXT_PUBLIC_API_URL='http://localhost:5003/v1';$env:STRESSFORGE_AUDIT_BUILD='1'
$auditCwd=Join-Path ([IO.Path]::GetTempPath()) 'stressforge-m9-work/nest-boilerplate/nest-boilerplate'
New-Item -ItemType Directory -Force -Path $auditCwd | Out-Null
# Mirror only the public fixtures read by existing tests relative to cwd.
$reference=Join-Path $auditCwd 'docs/stressforge/reference'
$fixtureDir=[IO.Path]::GetFullPath((Join-Path $auditCwd '../../web/tests/fixtures'))
New-Item -ItemType Directory -Force -Path $reference,$fixtureDir | Out-Null
Copy-Item -LiteralPath (Join-Path $backend 'docs/stressforge/reference/mock-engine.js') -Destination (Join-Path $reference 'mock-engine.js')
Copy-Item -LiteralPath (Join-Path $frontend 'tests/fixtures/canvas-catalog.json') -Destination (Join-Path $fixtureDir 'canvas-catalog.json')

if(Get-ChildItem -LiteralPath $auditCwd -Force -Filter '.env*'){throw 'Audit working directory must not contain environment files'}
$entryLocation=Get-Location
try {
switch($Action){
 'fresh' {Set-Location $auditCwd; & node (Join-Path $projectRoot 'docs/audit/m9-fresh.cjs')}
 'retention' {Set-Location $auditCwd; & node (Join-Path $projectRoot 'docs/audit/m9-retention.cjs')}
 'api' {Set-Location $auditCwd; & node (Join-Path $backend 'dist/main.js')}
 'api-instrumented' {Set-Location $auditCwd; & node (Join-Path $projectRoot 'docs/audit/m9-api.cjs')}
 'migrate' {Set-Location $auditCwd; & node (Join-Path $projectRoot 'docs/audit/m9-migrate.cjs')}
 'seed' {Set-Location $auditCwd; & node (Join-Path $backend 'dist/seeder.js')}
 'unit' {$env:NODE_ENV='test';$env:TEST_REDIS_COMPOSE='1'; Set-Location $auditCwd; & node (Join-Path $projectRoot 'docs/audit/m9-jest.cjs') unit @CheckArgs}
 'e2e' {$env:NODE_ENV='test';$env:CORS_ORIGINS='http://localhost:3000'; Set-Location $auditCwd; & node (Join-Path $projectRoot 'docs/audit/m9-jest.cjs') e2e @CheckArgs}
 'web-build' {$env:NODE_ENV='production';Set-Location $frontend; & pnpm build}
 'web-start' {$env:NODE_ENV='production';Set-Location $frontend; & pnpm start --port 3003}
 'web-dev' {$env:STRESSFORGE_AUDIT_BUILD='dev';Set-Location $frontend; & pnpm dev --port 3004}
}
} finally { Set-Location $entryLocation }
exit $LASTEXITCODE
