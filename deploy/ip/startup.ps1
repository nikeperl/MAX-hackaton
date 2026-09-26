$ErrorActionPreference = 'Stop'
$projectDir = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$composeFiles = @('-f', (Join-Path $projectDir 'compose.yaml'), '-f', (Join-Path $projectDir 'compose.ip.yaml'))

Push-Location $projectDir
try {
    & docker desktop start --timeout 300
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop failed to start.' }

    & docker compose @composeFiles up -d app
    if ($LASTEXITCODE -ne 0) { throw 'The application failed to start.' }

    $ipLine = Get-Content '.env' -Encoding UTF8 |
        Where-Object { $_ -match '^\s*PUBLIC_IP\s*=' } |
        Select-Object -Last 1
    if (-not $ipLine) { throw 'PUBLIC_IP is missing from .env.' }
    $publicIp = ($ipLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
    if (-not $publicIp) { throw 'PUBLIC_IP is empty.' }

    $certDir = Join-Path $PSScriptRoot 'certs'
    $certArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
        (Join-Path $PSScriptRoot 'certificate.ps1'), '-PublicIp', $publicIp)
    if ((Test-Path (Join-Path $certDir 'fullchain.pem')) -and
        (Test-Path (Join-Path $certDir 'privkey.pem'))) {
        $certArgs += '-Renew'
    }
    & powershell.exe @certArgs
    if ($LASTEXITCODE -ne 0) { throw 'Certificate setup or renewal failed.' }
} finally {
    Pop-Location
}
