param([ValidateRange(1,4)][int]$Start=1)
$ErrorActionPreference='Stop'
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;C:\Program Files\Docker\Docker\resources\bin;'+$env:Path
try{
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'ALTER SYSTEM SET fsync=off'|Out-Null;if($LASTEXITCODE -ne 0){throw 'Disposable setup failed'}
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'SELECT pg_reload_conf()'|Out-Null
 for($i=$Start;$i -le 4;$i++){
  docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c CHECKPOINT|Out-Null;if($LASTEXITCODE -ne 0){throw "Disposable checkpoint failed"}
  & (Join-Path $PSScriptRoot 'run.ps1') e2e --shard "$i/4" --json --outputFile (Join-Path $PSScriptRoot ("backend-e2e-shard-$i.json")) *> (Join-Path $PSScriptRoot ("backend-e2e-shard-$i.txt"))
  if($LASTEXITCODE -ne 0){throw "Failed e2e shard $i"}
 }
 node (Join-Path $PSScriptRoot 'combine-e2e.cjs');if($LASTEXITCODE -ne 0){throw 'E2E aggregation failed'}
}finally{
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'ALTER SYSTEM RESET fsync'|Out-Null
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -v ON_ERROR_STOP=1 -c 'SELECT pg_reload_conf()'|Out-Null
 docker exec stressforge-m9-postgres psql -U sf_audit -d postgres -Atc 'SHOW fsync'|Set-Content (Join-Path $PSScriptRoot 'pg-durability-restored.txt')
}
