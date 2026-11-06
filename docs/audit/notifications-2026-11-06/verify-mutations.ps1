$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$spec=Join-Path $projectRoot 'nest-boilerplate/nest-boilerplate/test/notifications.e2e-spec.ts'
$results=@()
try {
 foreach($kind in @('recipient','self','access','privacy')){
  $env:SF_NOTIFICATIONS_MUTATION=$kind;$log=Join-Path $PSScriptRoot ('mutation-'+$kind+'.txt')
  & (Join-Path $PSScriptRoot 'run.ps1') e2e --runTestsByPath $spec *> $log
  $code=$LASTEXITCODE;$text=Get-Content $log -Raw
  $applied=$text -match 'MUTATION_APPLIED [a-z]+ [1-9][0-9]*';$meaningful=$text -match 'expect\(received\)|expected 200.*got'
  $results+=@{mutation=$kind;exit=$code;applied=$applied;meaningfulFailure=$meaningful}
  if($code -eq 0 -or -not $applied -or -not $meaningful){throw ('Mutation did not produce a meaningful failure: '+$kind)}
 }
 $env:SF_NOTIFICATIONS_MUTATION='stale';$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;'+$env:Path
 $log=Join-Path $PSScriptRoot 'mutation-stale.txt'
 Push-Location (Join-Path $projectRoot 'web')
 try {node --require (Join-Path $PSScriptRoot 'mutate.cjs') --require ./tests/register.cjs --test tests/notifications.test.cjs *> $log;$code=$LASTEXITCODE}finally{Pop-Location}
 $text=Get-Content $log -Raw;$applied=$text -match 'MUTATION_APPLIED stale [1-9][0-9]*';$meaningful=$text -match 'ERR_ASSERTION'
 $results+=@{mutation='stale';exit=$code;applied=$applied;meaningfulFailure=$meaningful}
 if($code -eq 0 -or -not $applied -or -not $meaningful){throw 'Stale-response mutation did not fail meaningfully'}
}finally{Remove-Item Env:SF_NOTIFICATIONS_MUTATION -ErrorAction SilentlyContinue;$results|ConvertTo-Json|Set-Content (Join-Path $PSScriptRoot 'mutations.json')}
