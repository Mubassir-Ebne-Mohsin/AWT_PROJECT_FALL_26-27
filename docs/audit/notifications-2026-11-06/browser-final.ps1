$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$web=Join-Path $root 'web'
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;C:\Program Files\Docker\Docker\resources\bin;'+$env:Path
foreach($port in @(3003,5003)){if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw 'Audit port already occupied'}}
$apiScript=Join-Path $PSScriptRoot 'run.ps1'
Start-Process pwsh -WindowStyle Hidden -ArgumentList @('-NoProfile','-File',('"'+$apiScript+'"'),'api') -RedirectStandardOutput (Join-Path $PSScriptRoot 'api-final.stdout.txt') -RedirectStandardError (Join-Path $PSScriptRoot 'api-final.stderr.txt')|Out-Null
$env:STRESSFORGE_AUDIT_BUILD='1';$env:NEXT_PUBLIC_API_URL='http://localhost:5003/v1';$env:NODE_ENV='production';$env:NODE_OPTIONS='--max-old-space-size=768'
$node=(Get-Command node).Source;$next=Join-Path $web 'node_modules/next/dist/bin/next'
Start-Process $node -WindowStyle Hidden -WorkingDirectory $web -ArgumentList @(('"'+$next+'"'),'start','--port','3003') -RedirectStandardOutput (Join-Path $PSScriptRoot 'web-final-rebuilt.stdout.txt') -RedirectStandardError (Join-Path $PSScriptRoot 'web-final-rebuilt.stderr.txt')|Out-Null
foreach($port in @(3003,5003)){for($i=0;$i -lt 60;$i++){if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){break};Start-Sleep -Milliseconds 500}}
& (Join-Path $PSScriptRoot 'browser.ps1') feature *> (Join-Path $PSScriptRoot 'browser-final.txt');if($LASTEXITCODE -ne 0){throw 'Final feature browser failed'}
Push-Location $web
try {pnpm exec playwright test tests/browser/phase1.spec.ts --grep '46 registry routes' --workers=1 *> (Join-Path $PSScriptRoot 'browser-shell-final.txt');if($LASTEXITCODE -ne 0){throw 'Final neighboring shell browser failed'}}finally{Pop-Location}
'Final feature and shell passed'|Set-Content (Join-Path $PSScriptRoot 'browser-final-result.txt')
