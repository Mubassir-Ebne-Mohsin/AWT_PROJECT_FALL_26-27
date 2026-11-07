param([ValidateSet('smoke','feature','affected')][string]$Mode='feature')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;C:\Program Files\Docker\Docker\resources\bin;'+$env:Path
foreach($port in @(3003,5003)){for($i=0;$i -lt 20;$i++){if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){break};Start-Sleep -Milliseconds 250}}
$owned=@();foreach($port in @(3003,5003)){$l=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop|Select-Object -First 1;$owned+=@{port=$port;pid=$l.OwningProcess}};$owned|ConvertTo-Json|Set-Content (Join-Path $PSScriptRoot 'owned-processes.json')
$env:SF_WEB_URL='http://localhost:3003';$env:SF_API_URL='http://localhost:5003/v1';$env:SF_BROWSER_CHANNEL='chrome';$env:SF_PG_CONTAINER='stressforge-m9-postgres';$env:SF_PG_USER='sf_audit';$env:SF_PG_DB=(Get-Content (Join-Path $PSScriptRoot 'runtime.json') -Raw|ConvertFrom-Json).database;$env:NODE_OPTIONS='--max-old-space-size=768'
if($env:SF_PG_DB -notmatch '^sf_notifications_support_e_[a-z0-9_]+$'){throw 'Isolated browser database required'}
$argsList=@('test','tests/browser/support-extras.spec.ts','--workers=1')
if($Mode -eq 'smoke'){$argsList+=@('--project=1024-light','--max-failures=1')}
if($Mode -eq 'affected'){$argsList+=@('tests/browser/support.spec.ts','tests/browser/notifications.spec.ts')}
Push-Location (Join-Path $root 'web')
try{pnpm exec playwright @argsList;$code=$LASTEXITCODE}finally{Pop-Location}
exit $code
