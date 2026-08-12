$ErrorActionPreference = "Stop"
Write-Host "Creating UAT build..."

$Root = "f:\MY Works\SPH Software"
$DeployDir = "$Root\UAT_Build"

if (Test-Path $DeployDir) {
    Remove-Item -Recurse -Force $DeployDir
}
New-Item -ItemType Directory -Path $DeployDir | Out-Null
New-Item -ItemType Directory -Path "$DeployDir\frontend" | Out-Null
New-Item -ItemType Directory -Path "$DeployDir\backend" | Out-Null

Write-Host "Copying Frontend Build..."
Copy-Item -Path "$Root\frontend-react\dist\*" -Destination "$DeployDir\frontend\" -Recurse -Force

Write-Host "Copying Backend..."
# Exclude node_modules but include everything else
Copy-Item -Path "$Root\backend\*" -Destination "$DeployDir\backend\" -Exclude "node_modules" -Recurse -Force

Write-Host "Creating startup script..."
$startScript = @"
@echo off
echo Starting SPH Billing Server...
cd backend
echo Installing production dependencies...
call npm install --production
echo Starting server...
node server.js
pause
"@
Set-Content -Path "$DeployDir\start-uat.bat" -Value $startScript

Write-Host "Compressing to UAT_Build.zip..."
if (Test-Path "$Root\UAT_Build.zip") {
    Remove-Item -Force "$Root\UAT_Build.zip"
}
Compress-Archive -Path "$DeployDir\*" -DestinationPath "$Root\UAT_Build.zip" -Force

Write-Host "UAT build created successfully at UAT_Build.zip"
