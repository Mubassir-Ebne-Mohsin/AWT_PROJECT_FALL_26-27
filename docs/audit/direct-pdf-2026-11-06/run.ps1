param([Parameter(Mandatory=$true)][ValidateSet('migrate','api')][string]$Action)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$backend=Join-Path $projectRoot 'nest-boilerplate/nest-boilerplate'
$identity=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime.json') -Raw | ConvertFrom-Json
if($identity.database -notmatch '^sf_direct_pdf_[a-z0-9_]+$'){throw 'Invalid disposable database identity'}
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;'+$env:Path
$env:NODE_ENV='development';$env:PORT='5003';$env:DB_HOST='127.0.0.1';$env:DB_PORT='5552';$env:DB_USER='sf_audit';$env:DB_PASSWORD='sf_m9_disposable';$env:DB_DATABASE=$identity.database
$env:REDIS_HOST='127.0.0.1';$env:REDIS_PORT='6399';$env:REDIS_PASSWORD=''
# Public, disposable test credentials only; never loads/copies the owner's environment file.
$env:JWT_ACCESS_SECRET='direct-pdf-audit-access-secret-0123456789';$env:JWT_REFRESH_SECRET='direct-pdf-audit-refresh-secret-0123456789';$env:DEMO_USER_PASSWORD='Direct-Pdf-Audit-Only!'
$env:JWT_ACCESS_TTL_SECONDS='900';$env:JWT_REFRESH_TTL_SECONDS='604800';$env:AUTH_THROTTLE_LIMIT='1000';$env:THROTTLE_LIMIT='10000';$env:TRUST_PROXY_HOPS='0'
$env:CORS_ORIGINS='http://localhost:3003';$env:FRONTEND_URL='http://localhost:3003';$env:AI_ENABLED='false';$env:AI_EXPLANATIONS='false';$env:AI_FEATURES='';$env:GROQ_API_KEY='';$env:NODE_OPTIONS='--max-old-space-size=768'
$auditCwd=Join-Path ([IO.Path]::GetTempPath()) $identity.database
New-Item -ItemType Directory -Force -Path $auditCwd | Out-Null
if(Get-ChildItem -LiteralPath $auditCwd -Force -Filter '.env*'){throw 'Audit directory contains environment files'}
Push-Location $auditCwd
try {
 if($Action -eq 'migrate'){node (Join-Path $PSScriptRoot 'migrate.cjs')}
 else {node (Join-Path $backend 'dist/main.js')}
 $result=$LASTEXITCODE
} finally {Pop-Location}
exit $result
