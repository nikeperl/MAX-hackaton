param(
    [Parameter(Mandatory = $true)]
    [string]$PublicIp,

    [switch]$Renew
)

$ErrorActionPreference = 'Stop'
$parsedIp = $null
if (-not [System.Net.IPAddress]::TryParse($PublicIp, [ref]$parsedIp) -or
    $parsedIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
    $parsedIp.ToString() -ne $PublicIp) {
    throw 'Укажите IPv4-адрес без https:// и порта.'
}
$octets = $parsedIp.GetAddressBytes()
if ($octets[0] -eq 10 -or $octets[0] -eq 127 -or
    ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or
    ($octets[0] -eq 192 -and $octets[1] -eq 168) -or
    ($octets[0] -eq 100 -and $octets[1] -ge 64 -and $octets[1] -le 127)) {
    throw 'Нужен публичный IPv4-адрес. Указан локальный адрес или адрес CGNAT.'
}

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$acmeDir = Join-Path $PSScriptRoot 'acme'
$certDir = Join-Path $PSScriptRoot 'certs'
New-Item -ItemType Directory -Force -Path $acmeDir, $certDir | Out-Null

$composeFiles = @('-f', (Join-Path $projectDir 'compose.yaml'), '-f', (Join-Path $projectDir 'compose.ip.yaml'))
$acmeImage = 'ghcr.io/acmesh-official/acme.sh'

function Assert-DockerSuccess {
    if ($LASTEXITCODE -ne 0) {
        throw "Команда Docker завершилась с кодом $LASTEXITCODE. Проверьте вывод выше."
    }
}

Push-Location $projectDir
try {
    & docker compose @composeFiles stop caddy
    Assert-DockerSuccess

    try {
        if ($Renew) {
            & docker run --rm --publish '443:443' --volume "${acmeDir}:/acme.sh" `
                --volume "${certDir}:/certs" $acmeImage --renew -d $PublicIp --ecc
            # acme.sh returns 2 when the certificate is not due for renewal.
            if ($LASTEXITCODE -ne 2) {
                Assert-DockerSuccess
            }
        } else {
            & docker run --rm --publish '443:443' --volume "${acmeDir}:/acme.sh" `
                $acmeImage --issue --alpn --server letsencrypt `
                --cert-profile shortlived --days 3 --keylength ec-256 -d $PublicIp
            Assert-DockerSuccess

            & docker run --rm --volume "${acmeDir}:/acme.sh" `
                --volume "${certDir}:/certs" $acmeImage --install-cert -d $PublicIp --ecc `
                --key-file /certs/privkey.pem --fullchain-file /certs/fullchain.pem
            Assert-DockerSuccess
        }
    } finally {
        if ((Test-Path (Join-Path $certDir 'fullchain.pem')) -and
            (Test-Path (Join-Path $certDir 'privkey.pem'))) {
            & docker compose @composeFiles up -d caddy
            Assert-DockerSuccess
        }
    }
} finally {
    Pop-Location
}
