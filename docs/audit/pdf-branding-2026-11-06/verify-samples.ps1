$ErrorActionPreference='Stop'
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;'+$env:Path;$env:NODE_OPTIONS='--max-old-space-size=768'
if(-not(Test-Path (Join-Path $PSScriptRoot 'gates-result.txt'))){throw 'Static gates incomplete'}
node (Join-Path $PSScriptRoot 'samples.cjs') *> (Join-Path $PSScriptRoot 'samples.txt');if($LASTEXITCODE -ne 0){throw 'Sample generation failed'}
& 'C:/Users/mubas/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' (Join-Path $PSScriptRoot 'verify-output.py') *> (Join-Path $PSScriptRoot 'inspection.txt');if($LASTEXITCODE -ne 0){throw 'PDF inspection failed'}
$poppler=(Get-Command pdftoppm).Source
foreach($sample in @(@('report',1),@('landscape',2),@('admin',1),@('print-shared',2))){& $poppler -f $sample[1] -singlefile -scale-to 1200 -png (Join-Path $PSScriptRoot ($sample[0]+'.pdf')) (Join-Path $PSScriptRoot ($sample[0]+'-preview')) 2>> (Join-Path $PSScriptRoot 'render-notes.txt');if($LASTEXITCODE -ne 0){throw 'Page rendering failed'}}
'PDF output inspected and rendered'|Set-Content (Join-Path $PSScriptRoot 'outputs-result.txt')
