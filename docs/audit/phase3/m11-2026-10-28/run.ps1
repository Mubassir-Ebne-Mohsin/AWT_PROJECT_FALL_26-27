param([ValidateSet('unit','e2e')][string]$Action='e2e',[Parameter(ValueFromRemainingArguments=$true)][string[]]$CheckArgs)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$backend=Join-Path $projectRoot 'nest-boilerplate/nest-boilerplate'
$nodeDir='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64'
$auditNode=Get-Command node.exe -ErrorAction SilentlyContinue
if($auditNode){$auditVersion=& $auditNode.Source --version;if($auditVersion -match '^v22\.'){$nodeDir=Split-Path -Parent $auditNode.Source}}
if(-not(Test-Path -LiteralPath (Join-Path $nodeDir 'node.exe'))){throw 'Select Node22 on PATH before running M11 verification'}
$env:Path=$nodeDir+';'+$env:Path
$env:NODE_ENV='test';$env:AI_ENABLED='false';$env:DB_HOST='127.0.0.1';$env:DB_PORT='5553';$env:DB_USER='sf_m11';$env:DB_PASSWORD='m11-disposable-only';$env:DB_DATABASE='sf_m11_e2e_'+(Get-Date -Format 'yyyyMMddHHmmss');$env:DB_TEST_DATABASE=$env:DB_DATABASE
$env:JWT_ACCESS_SECRET='m11-test-access-secret-0123456789abcdef';$env:JWT_REFRESH_SECRET='m11-test-refresh-secret-0123456789abcdef'
$env:REDIS_HOST='127.0.0.1';$env:REDIS_PORT='6400';$env:REDIS_PASSWORD='';$env:CORS_ORIGINS='http://localhost:3000';$env:AUTH_THROTTLE_LIMIT='300';$env:THROTTLE_LIMIT='10000'
$env:OLLAMA_BASE_URL='http://127.0.0.1:11434';$env:OLLAMA_MODEL='qwen2.5:1.5b';$env:AI_DEADLINE_MS='60000';$env:AI_MIN_FREE_MIB='1536';$env:AI_MIN_COMMIT_MIB='4096'
$auditCwd=Join-Path ([IO.Path]::GetTempPath()) 'stressforge-m11-work/nest-boilerplate/nest-boilerplate'
New-Item -ItemType Directory -Force -Path $auditCwd | Out-Null
$reference=Join-Path $auditCwd 'docs/stressforge/reference'
$fixtureDir=[IO.Path]::GetFullPath((Join-Path $auditCwd '../../web/tests/fixtures'))
New-Item -ItemType Directory -Force -Path $reference,$fixtureDir | Out-Null
Copy-Item -LiteralPath (Join-Path $backend 'docs/stressforge/reference/mock-engine.js') -Destination (Join-Path $reference 'mock-engine.js')
Copy-Item -LiteralPath (Join-Path $projectRoot 'web/tests/fixtures/canvas-catalog.json') -Destination (Join-Path $fixtureDir 'canvas-catalog.json')
if(Get-ChildItem -LiteralPath $auditCwd -Force -Filter '.env*'){throw 'Audit cwd must not contain .env files'}
$entryLocation=Get-Location
try {Set-Location $auditCwd; & node (Join-Path $projectRoot 'docs/audit/m9-jest.cjs') $Action @CheckArgs} finally {Set-Location $entryLocation}
exit $LASTEXITCODE
