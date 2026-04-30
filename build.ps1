<#
.SYNOPSIS
    Build crewmeld Docker image with versioned + latest tags.

.DESCRIPTION
    Wraps `docker compose build crewmeld`, sets VERSION env for image tag,
    retags as :latest, and optionally pushes both tags.

    Produces: proinsight/crewmeld:<Version>
              proinsight/crewmeld:latest

.PARAMETER Version
    Semantic version (required). Format: x.y.z

.PARAMETER Push
    If specified, push both tags to the registry after build.

.EXAMPLE
    .\build.ps1 1.0.0
    .\build.ps1 1.0.0 -Push
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $true, HelpMessage = "Semantic version, e.g. 1.0.0")]
    [string]$Version,

    [Parameter(Position = 1)]
    [switch]$Push
)

$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Error "Version must be semantic format x.y.z (got: $Version)"
    exit 1
}

$image = 'proinsight/crewmeld'

Write-Host "[build.ps1] Bundling socket server (bun build)..."
Push-Location apps/crewmeld
try {
    bun run build:socket
    if ($LASTEXITCODE -ne 0) {
        Write-Error "socket bundle failed"
        exit 1
    }
}
finally {
    Pop-Location
}

Write-Host "[build.ps1] Building ${image}:${Version}"
$env:VERSION = $Version
docker compose build crewmeld
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker compose build failed"
    exit 1
}

Write-Host "[build.ps1] Tagging ${image}:${Version} as ${image}:latest"
docker tag "${image}:${Version}" "${image}:latest"
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker tag failed"
    exit 1
}

if ($Push) {
    Write-Host "[build.ps1] Pushing ${image}:${Version}"
    docker push "${image}:${Version}"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "docker push <version> failed"
        exit 1
    }
    Write-Host "[build.ps1] Pushing ${image}:latest"
    docker push "${image}:latest"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "docker push latest failed"
        exit 1
    }
    Write-Host "[build.ps1] Done: built + tagged + pushed ${image}:${Version} / :latest"
}
else {
    Write-Host "[build.ps1] Done: built + tagged ${image}:${Version} / :latest (not pushed)"
    Write-Host "[build.ps1] To push: .\build.ps1 $Version -Push"
}

exit 0
