$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$web=Join-Path $projectRoot 'web';$config=Join-Path $web 'next.config.ts'
$original=[IO.File]::ReadAllBytes($config)
$env:Path='C:\Users\mubas\AppData\Local\Temp\stressforge-node22\node-v22.23.4-win-x64;'+$env:Path
$env:NODE_OPTIONS='--max-old-space-size=1536';$env:STRESSFORGE_AUDIT_BUILD='1';$env:NEXT_PUBLIC_API_URL='http://localhost:5003/v1';$env:NODE_ENV='production'
try {
 $text=[Text.Encoding]::UTF8.GetString($original).Replace('const nextConfig: NextConfig = {','const nextConfig: NextConfig = { experimental: { cpus: 1 },')
 [IO.File]::WriteAllText($config,$text,[Text.UTF8Encoding]::new($false))
 Push-Location $web
 try {pnpm build;$result=$LASTEXITCODE}finally{Pop-Location}
}finally{[IO.File]::WriteAllBytes($config,$original)}
exit $result
