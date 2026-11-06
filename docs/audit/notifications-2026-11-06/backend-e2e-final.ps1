$ErrorActionPreference='Stop'
$env:Path='C:\Program Files\Docker\Docker\resources\bin;'+$env:Path
$global:LASTEXITCODE=0
try {
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'ALTER SYSTEM SET fsync=off' | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Disposable fsync setup failed'}
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'SELECT pg_reload_conf()' | Out-Null
 & (Join-Path $PSScriptRoot 'run.ps1') e2e --json --outputFile (Join-Path $PSScriptRoot 'backend-e2e-final.json') *> (Join-Path $PSScriptRoot 'backend-e2e-final.txt')
 $result=$LASTEXITCODE
} finally {
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'ALTER SYSTEM RESET fsync' | Out-Null
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'SELECT pg_reload_conf()' | Out-Null
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -Atc 'SHOW fsync' | Set-Content (Join-Path $PSScriptRoot 'pg-durability-restored.txt')
}
if($result -ne 0){throw 'Final full backend integration run failed'}
$r=Get-Content (Join-Path $PSScriptRoot 'backend-e2e-final.json') -Raw|ConvertFrom-Json
if(-not $r.success -or $r.numFailedTests -ne 0 -or $r.numPendingTests -ne 0){throw 'Integration result incomplete'}
@{success=$r.success;passed=$r.numPassedTests;total=$r.numTotalTests;suites=$r.numPassedTestSuites}|ConvertTo-Json|Set-Content (Join-Path $PSScriptRoot 'backend-e2e-result.json')
