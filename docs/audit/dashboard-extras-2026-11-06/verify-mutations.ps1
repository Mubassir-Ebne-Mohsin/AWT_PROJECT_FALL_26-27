$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$spec=Join-Path $projectRoot 'nest-boilerplate/nest-boilerplate/src/modules/roles/admin-extras.spec.ts'
$integration=Join-Path $projectRoot 'nest-boilerplate/nest-boilerplate/test/admin-metrics.e2e-spec.ts'
$results=@()
try {
 foreach($kind in @('bucket','latest','expiry','privacy','weekday','upper','permission')){
  $env:SF_METRICS_MUTATION=$kind
  $log=Join-Path $PSScriptRoot ('mutation-'+$kind+'.txt')
  if($kind -in @('weekday','upper','permission')) {
   $name=if($kind -eq 'permission'){'exports require current Admin'}else{'UTC lower boundary'}
   & (Join-Path $PSScriptRoot 'run.ps1') e2e --runTestsByPath $integration -t $name *> $log
  }else{& (Join-Path $PSScriptRoot 'run.ps1') unit --runTestsByPath $spec *> $log}
  $code=$LASTEXITCODE;$text=Get-Content -LiteralPath $log -Raw
  $applied=$text -match 'MUTATION_APPLIED [a-z]+ [1-9][0-9]*'
  $meaningful=$text -match 'expect\(received\)|Invalid UTC activity bucket|expected 403.*got 200'
  $results+=@{mutation=$kind;exit=$code;applied=$applied;meaningfulFailure=$meaningful}
  if($code -eq 0 -or -not $applied -or -not $meaningful){throw ('Mutation check was not meaningful: '+$kind)}
 }
 $env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;'+$env:Path
 Push-Location (Join-Path $projectRoot 'web')
 try {
  foreach($kind in @('pdfprivacy','wrongview')){
   $env:SF_METRICS_MUTATION=$kind;$log=Join-Path $PSScriptRoot ('mutation-'+$kind+'.txt')
   $spec=if($kind -eq 'pdfprivacy'){'tests/admin-extras.test.cjs'}else{'tests/metrics-exports.test.cjs'}
   node --require (Join-Path $PSScriptRoot 'mutate.cjs') --require ./tests/register.cjs --test $spec *> $log
   $code=$LASTEXITCODE;$text=Get-Content -LiteralPath $log -Raw
   $applied=$text -match 'MUTATION_APPLIED [a-z]+ [1-9][0-9]*'
   $meaningful=$text -match 'ERR_ASSERTION|AssertionError'
   $results+=@{mutation=$kind;exit=$code;applied=$applied;meaningfulFailure=$meaningful}
   if($code -eq 0 -or -not $applied -or -not $meaningful){throw ('Mutation check was not meaningful: '+$kind)}
  }
 }finally{Pop-Location}
}finally{
 Remove-Item Env:SF_METRICS_MUTATION -ErrorAction SilentlyContinue
 $results | ConvertTo-Json | Set-Content (Join-Path $PSScriptRoot 'mutations.json')
}
