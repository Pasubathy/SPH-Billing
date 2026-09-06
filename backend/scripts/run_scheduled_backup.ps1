# ==============================================================================
# SPH Billing - Automated Scheduled Backup Runner Wrapper
# ==============================================================================
# Strict Operational Safeguards:
# 1. Zero secrets in script or command line arguments.
# 2. Concurrency lock (.backup.lock) prevents overlapping runs.
# 3. Disk space gate (minimum 2 GB free on drive F:).
# 4. Appends execution logs to backend/backups/backup_runner.log.
# 5. Propagates backup_database.js exit code.
# ==============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BackendDir = Resolve-Path (Join-Path $ScriptDir "..")
$BackupsDir = Join-Path $BackendDir "backups"
$LogFile = Join-Path $BackupsDir "backup_runner.log"
$LockFile = Join-Path $BackupsDir ".backup.lock"
$MinFreeSpaceGB = 2

# Ensure backups directory exists
if (-not (Test-Path $BackupsDir)) {
    New-Item -ItemType Directory -Path $BackupsDir -Force | Out-Null
}

function Write-RunnerLog {
    param([string]$Message)
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $logLine = "[$timestamp] $Message"
    Add-Content -Path $LogFile -Value $logLine
    Write-Host $logLine
}

Write-RunnerLog "=== SPH Billing Automated Backup Runner Started ==="

# 1. Concurrency Check via Lockfile
if (Test-Path $LockFile) {
    $lockPid = Get-Content -Path $LockFile -ErrorAction SilentlyContinue
    if ($lockPid -and (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)) {
        Write-RunnerLog "ABORT: Another backup process (PID $lockPid) is currently running. Skipping to prevent overlap."
        exit 2
    } else {
        Write-RunnerLog "WARNING: Stale lockfile detected. Overwriting lock."
    }
}

# Write current PID to lockfile
$PID | Out-File -FilePath $LockFile -Encoding ascii -Force

try {
    # 2. Disk Space Pre-flight Check
    $driveF = Get-PSDrive -Name "F" -ErrorAction SilentlyContinue
    if ($driveF) {
        $freeGB = [math]::Round($driveF.Free / 1GB, 2)
        Write-RunnerLog "Disk Space Check: Drive F: has $freeGB GB free (Minimum required: $MinFreeSpaceGB GB)."
        if ($freeGB -lt $MinFreeSpaceGB) {
            Write-RunnerLog "ABORT: Insufficient disk space on drive F: ($freeGB GB < $MinFreeSpaceGB GB)."
            exit 3
        }
    }

    # 3. Locate Node.js executable
    $nodeCmd = "node"
    try {
        $nodeVersion = & $nodeCmd -v
        Write-RunnerLog "Node.js runtime verified: $nodeVersion"
    } catch {
        Write-RunnerLog "FATAL: Node.js executable not found in PATH."
        exit 4
    }

    # 4. Target Backup Script
    $BackupScript = Join-Path $ScriptDir "backup_database.js"
    if (-not (Test-Path $BackupScript)) {
        Write-RunnerLog "FATAL: Backup script not found at $BackupScript."
        exit 5
    }

    Write-RunnerLog "Executing backup engine: $BackupScript..."
    $startTime = Get-Date

    # Execute Node.js backup script
    $backupOutput = & $nodeCmd $BackupScript 2>&1
    $exitCode = $LASTEXITCODE
    $duration = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 2)

    # Log script output
    foreach ($line in $backupOutput) {
        Write-RunnerLog "  [ENGINE] $line"
    }

    if ($exitCode -eq 0) {
        Write-RunnerLog "SUCCESS: Backup completed successfully in $duration seconds."
    } else {
        Write-RunnerLog "FAILURE: Backup script exited with code $exitCode after $duration seconds."
    }

    exit $exitCode
} finally {
    # Remove lockfile
    if (Test-Path $LockFile) {
        Remove-Item -Path $LockFile -Force -ErrorAction SilentlyContinue
    }
    Write-RunnerLog "=== SPH Billing Automated Backup Runner Finished ===`n"
}
