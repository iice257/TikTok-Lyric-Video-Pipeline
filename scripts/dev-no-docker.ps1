param(
    [string]$Python = "python",
    [string]$NodeExe = "",
    [int]$ApiPort = 8000,
    [int]$WebPort = 3000,
    [int]$WorkerPollIntervalSeconds = 20
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
$WebRoot = Join-Path $RepoRoot "apps\web"
$RunLogDir = Join-Path $RepoRoot ".tmp\runlogs"
New-Item -ItemType Directory -Path $RunLogDir -Force | Out-Null

if (!$env:APP_BASE_URL) { $env:APP_BASE_URL = "http://localhost:$ApiPort" }
if (!$env:FRONTEND_BASE_URL) { $env:FRONTEND_BASE_URL = "http://localhost:$WebPort" }
if (!$env:NEXT_PUBLIC_API_BASE_URL) { $env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:$ApiPort" }

function Start-LoggedProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    $stdout = Join-Path $RunLogDir "$Name.log"
    $stderr = Join-Path $RunLogDir "$Name.err.log"
    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -PassThru `
        -WindowStyle Hidden

    Write-Host "$Name started: pid=$($process.Id), logs=$stdout"
    return $process
}

$processes = @()
$processes += Start-LoggedProcess `
    -Name "api" `
    -FilePath $Python `
    -Arguments @("-m", "tiktok_platform_api.app") `
    -WorkingDirectory $RepoRoot

$processes += Start-LoggedProcess `
    -Name "worker" `
    -FilePath $Python `
    -Arguments @("-m", "tiktok_platform_worker.main", "--poll-interval-seconds", "$WorkerPollIntervalSeconds") `
    -WorkingDirectory $RepoRoot

if ($NodeExe) {
    $nextBin = Join-Path $WebRoot "node_modules\next\dist\bin\next"
    $processes += Start-LoggedProcess `
        -Name "web" `
        -FilePath $NodeExe `
        -Arguments @($nextBin, "dev", "-p", "$WebPort") `
        -WorkingDirectory $WebRoot
} else {
    $nextCmd = Join-Path $WebRoot "node_modules\.bin\next.cmd"
    if (!(Test-Path $nextCmd)) {
        throw "Next.js local binary not found at $nextCmd. Run npm install in apps\web when npm is available, or pass -NodeExe with an existing Node runtime."
    }
    $processes += Start-LoggedProcess `
        -Name "web" `
        -FilePath $nextCmd `
        -Arguments @("dev", "-p", "$WebPort") `
        -WorkingDirectory $WebRoot
}

Write-Host ""
Write-Host "API:    http://localhost:$ApiPort"
Write-Host "Web:    http://localhost:$WebPort"
Write-Host "Logs:   $RunLogDir"
Write-Host ""
Write-Host "Stop with:"
Write-Host ($processes | ForEach-Object { "Stop-Process -Id $($_.Id)" } | Out-String)
