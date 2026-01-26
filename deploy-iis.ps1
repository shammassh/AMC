# IIS Deployment Script for Area Manager Checklist App
# Run this script as Administrator

param(
    [string]$SiteName = "AreaManagerChecklist",
    [string]$AppPath = "F:\Area Manager App\amc-app",
    [int]$Port = 6060,
    [string]$AppPoolName = "AMCAppPool"
)

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  IIS Deployment for Area Manager Checklist" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Please run this script as Administrator!" -ForegroundColor Red
    exit 1
}

# Step 1: Check if IIS is installed
Write-Host "`n[1/7] Checking IIS installation..." -ForegroundColor Yellow
$iisFeature = Get-WindowsOptionalFeature -Online -FeatureName IIS-WebServer -ErrorAction SilentlyContinue
if ($iisFeature.State -ne "Enabled") {
    Write-Host "Installing IIS..." -ForegroundColor Yellow
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer -All -NoRestart
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerManagementTools -All -NoRestart
}
Write-Host "  IIS is installed" -ForegroundColor Green

# Step 2: Check if URL Rewrite module is installed
Write-Host "`n[2/7] Checking URL Rewrite module..." -ForegroundColor Yellow
$urlRewritePath = "$env:SystemRoot\System32\inetsrv\rewrite.dll"
if (-not (Test-Path $urlRewritePath)) {
    Write-Host "  URL Rewrite module not found!" -ForegroundColor Red
    Write-Host "  Please download and install from:" -ForegroundColor Yellow
    Write-Host "  https://www.iis.net/downloads/microsoft/url-rewrite" -ForegroundColor Cyan
    Write-Host "`n  After installing, run this script again." -ForegroundColor Yellow
    exit 1
}
Write-Host "  URL Rewrite module is installed" -ForegroundColor Green

# Step 3: Check if iisnode is installed
Write-Host "`n[3/7] Checking iisnode installation..." -ForegroundColor Yellow
$iisnodePath = "$env:ProgramFiles\iisnode\iisnode.dll"
if (-not (Test-Path $iisnodePath)) {
    Write-Host "  iisnode not found!" -ForegroundColor Red
    Write-Host "  Please download and install from:" -ForegroundColor Yellow
    Write-Host "  https://github.com/azure/iisnode/releases" -ForegroundColor Cyan
    Write-Host "`n  Download: iisnode-full-v0.2.21-x64.msi (for 64-bit)" -ForegroundColor Yellow
    Write-Host "  After installing, run this script again." -ForegroundColor Yellow
    exit 1
}
Write-Host "  iisnode is installed" -ForegroundColor Green

# Step 4: Import WebAdministration module
Write-Host "`n[4/7] Loading IIS management module..." -ForegroundColor Yellow
Import-Module WebAdministration -ErrorAction SilentlyContinue
if (-not (Get-Module WebAdministration)) {
    Write-Host "  WebAdministration module not available. Installing IIS Management tools..." -ForegroundColor Yellow
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-ManagementConsole -All -NoRestart
    Import-Module WebAdministration
}
Write-Host "  IIS management module loaded" -ForegroundColor Green

# Step 5: Create Application Pool
Write-Host "`n[5/7] Creating Application Pool: $AppPoolName..." -ForegroundColor Yellow
if (Test-Path "IIS:\AppPools\$AppPoolName") {
    Write-Host "  Application Pool already exists, updating..." -ForegroundColor Yellow
    Remove-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue
}

New-WebAppPool -Name $AppPoolName
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name processModel.identityType -Value 2  # NetworkService
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name managedRuntimeVersion -Value ""      # No Managed Code
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name enable32BitAppOnWin64 -Value $false
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name startMode -Value 1                    # AlwaysRunning
Write-Host "  Application Pool created" -ForegroundColor Green

# Step 6: Create Website
Write-Host "`n[6/7] Creating Website: $SiteName on port $Port..." -ForegroundColor Yellow

# Remove existing site if present
if (Test-Path "IIS:\Sites\$SiteName") {
    Write-Host "  Removing existing site..." -ForegroundColor Yellow
    Remove-Website -Name $SiteName -ErrorAction SilentlyContinue
}

# Create the website
New-Website -Name $SiteName -Port $Port -PhysicalPath $AppPath -ApplicationPool $AppPoolName
Write-Host "  Website created" -ForegroundColor Green

# Step 7: Set folder permissions
Write-Host "`n[7/7] Setting folder permissions..." -ForegroundColor Yellow
$acl = Get-Acl $AppPath
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule("IIS_IUSRS", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.AddAccessRule($rule)
$rule2 = New-Object System.Security.AccessControl.FileSystemAccessRule("NETWORK SERVICE", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.AddAccessRule($rule2)
Set-Acl $AppPath $acl
Write-Host "  Permissions set" -ForegroundColor Green

# Create iisnode log directory
$logDir = Join-Path $AppPath "iisnode"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# Start the website
Write-Host "`n[Starting Website]..." -ForegroundColor Yellow
Start-Website -Name $SiteName
Start-WebAppPool -Name $AppPoolName
Write-Host "  Website started" -ForegroundColor Green

# Summary
Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Site Name:     $SiteName" -ForegroundColor White
Write-Host "  App Pool:      $AppPoolName" -ForegroundColor White
Write-Host "  Physical Path: $AppPath" -ForegroundColor White
Write-Host "  URL:           http://localhost:$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To view logs:  $logDir" -ForegroundColor Yellow
Write-Host ""
Write-Host "  IIS Manager Commands:" -ForegroundColor Yellow
Write-Host "    iisreset                    - Restart IIS"
Write-Host "    Start-Website $SiteName     - Start site"
Write-Host "    Stop-Website $SiteName      - Stop site"
Write-Host ""
