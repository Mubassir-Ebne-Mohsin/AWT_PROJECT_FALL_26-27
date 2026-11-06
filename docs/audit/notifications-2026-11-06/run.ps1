param([Parameter(Mandatory=$true)][ValidateSet('migrate','api','unit','e2e')][string]$Action, [Parameter(ValueFromRemainingArguments=$true)][string[]]$CheckArgs)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$backend=Join-Path $projectRoot 'nest-boilerplate/nest-boilerplate'
$identity=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime.json') -Raw | ConvertFrom-Json
if($identity.database -notmatch '^sf_notifications_[a-z0-9_]+$'){throw 'Invalid disposable database identity'}
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;'+$env:Path
$env:NODE_ENV='development';$env:PORT='5003';$env:DB_HOST='127.0.0.1';$env:DB_PORT='5552';$env:DB_USER='sf_audit';$env:DB_PASSWORD='sf_m9_disposable';$env:DB_DATABASE=$identity.database
$env:REDIS_HOST='127.0.0.1';$env:REDIS_PORT='6399';$env:REDIS_PASSWORD=''
# Public, disposable test credentials only; never loads/copies the owner's environment file.
$env:JWT_ACCESS_SECRET='notifications-audit-access-secret-0123456789';$env:JWT_REFRESH_SECRET='notifications-audit-refresh-secret-0123456789';$env:DEMO_USER_PASSWORD='Notifications-Audit-Only!'
$env:JWT_ACCESS_TTL_SECONDS='900';$env:JWT_REFRESH_TTL_SECONDS='604800';$env:AUTH_THROTTLE_LIMIT='1000';$env:THROTTLE_LIMIT='10000';$env:TRUST_PROXY_HOPS='0'
$env:CORS_ORIGINS='http://localhost:3003';$env:FRONTEND_URL='http://localhost:3003';$env:AI_ENABLED='false';$env:AI_EXPLANATIONS='false';$env:AI_FEATURES='';$env:GROQ_API_KEY='';$env:NODE_OPTIONS='--max-old-space-size=768'
$auditCwd=Join-Path ([IO.Path]::GetTempPath()) ($identity.database+'/nest-boilerplate/nest-boilerplate')
New-Item -ItemType Directory -Force -Path $auditCwd | Out-Null
if(Get-ChildItem -LiteralPath $auditCwd -Force -Filter '.env*'){throw 'Audit directory contains environment files'}
# Public fixture paths used by the existing unit suite.
$reference=Join-Path $auditCwd 'docs/stressforge/reference'
New-Item -ItemType Directory -Force -Path $reference | Out-Null
Copy-Item -LiteralPath (Join-Path $backend 'docs/stressforge/reference/mock-engine.js') -Destination (Join-Path $reference 'mock-engine.js')
$fixtures=[IO.Path]::GetFullPath((Join-Path $auditCwd '../../web/tests/fixtures'))
New-Item -ItemType Directory -Force -Path $fixtures | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'web/tests/fixtures/canvas-catalog.json') -Destination (Join-Path $fixtures 'canvas-catalog.json')
Push-Location $auditCwd
try {
 if($Action -eq 'migrate'){node (Join-Path $PSScriptRoot 'migrate.cjs')}
 elseif($Action -eq 'api'){node (Join-Path $backend 'dist/main.js')}
 else {$env:NODE_ENV='test';$env:DB_TEST_DATABASE=$identity.database+'_final_e2e';if($Action -eq 'e2e'){$env:CORS_ORIGINS='http://localhost:3000'};$env:TEST_REDIS_COMPOSE='1';if($env:SF_NOTIFICATIONS_MUTATION){if($env:SF_NOTIFICATIONS_MUTATION -notin @('recipient','self','access','privacy')){throw 'Invalid mutation identity'};$env:DB_TEST_DATABASE=$identity.database+'_'+$env:SF_NOTIFICATIONS_MUTATION+'_e2e';node --require (Join-Path $PSScriptRoot 'mutate.cjs') (Join-Path $projectRoot 'docs/audit/m9-jest.cjs') $Action --no-cache @CheckArgs}else{node (Join-Path $projectRoot 'docs/audit/m9-jest.cjs') $Action @CheckArgs}}
 $result=$LASTEXITCODE
} finally {Pop-Location}
exit $result
