[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = Split-Path -Parent $PSScriptRoot

function Invoke-DockerCheck {
    param([string[]]$DockerArguments)
    & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker check failed: docker $($DockerArguments -join ' ')"
    }
}

Push-Location $projectRoot
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker CLI is unavailable. Install/start Docker Desktop, then open a fresh PowerShell window.'
    }
    Invoke-DockerCheck -DockerArguments @('info', '--format', '{{.OSType}}')
    Invoke-DockerCheck -DockerArguments @('compose', 'config', '--quiet')
    Invoke-DockerCheck -DockerArguments @('compose', 'build')
    Invoke-DockerCheck -DockerArguments @('compose', 'up', '-d', '--wait', '--wait-timeout', '180')
    Invoke-DockerCheck -DockerArguments @('compose', 'exec', '-T', 'clarifymed', 'node', 'deploy/healthcheck.mjs')
    # This suite starts its own HTTP server and temporary DB; it does not alter demo accounts/history.
    Invoke-DockerCheck -DockerArguments @('compose', 'exec', '-T', 'clarifymed', 'node', '--test', 'server/account-history.test.js')
    Invoke-DockerCheck -DockerArguments @('compose', 'exec', '-T', 'clarifymed', 'python3', '-m', 'unittest', 'discover', '-s', 'ml_service/tests', '-v')
    Write-Host 'Container health, isolated account/history API checks, and ML service tests passed.'
    Write-Host 'Demo: http://localhost:7860. Browser checks, real model inference, and persistence across restart still require verification.'
    Write-Host 'Containers remain running; named history/cache volumes are preserved.'
} finally {
    Pop-Location
}
