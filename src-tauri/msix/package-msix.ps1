# PowerShell script to package Gradus21 into an MSIX for Microsoft Store / Sideloading
param (
    [string]$Publisher = $env:MSIX_PUBLISHER,
    [string]$PackageName = $env:MSIX_PACKAGE_NAME,
    [string]$PublisherDisplayName = $env:MSIX_PUBLISHER_DISPLAY_NAME,
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

if (-not $Publisher) {
    $Publisher = "CN=9AFE237C-D8CE-415B-AEB5-ED30444929CC"
}

if (-not $PackageName) {
    $PackageName = "Gradus21.Gradus21"
}

if (-not $PublisherDisplayName) {
    $PublisherDisplayName = "Gradus21"
}

if (-not $Version) {
    $tauriConf = Get-Content -Raw "src-tauri/tauri.conf.json" | ConvertFrom-Json
    $baseVer = $tauriConf.version # e.g. "1.2.4"
    $parts = $baseVer.Split(".")
    # Microsoft Store strictly requires the 4th version component (Revision) to be 0 (Major.Minor.Build.0)
    if ($parts.Count -eq 3) {
        $Version = "$($parts[0]).$($parts[1]).$($parts[2]).0"
    } elseif ($parts.Count -ge 4) {
        $Version = "$($parts[0]).$($parts[1]).$($parts[2]).0"
    } else {
        $Version = "$baseVer.0.0"
    }
}

Write-Host "==> Packaging MSIX Version: $Version with PackageName: $PackageName, Publisher: $Publisher, PublisherDisplayName: $PublisherDisplayName"

# Locate Windows SDK tools (MakeAppx and SignTool)
$sdkPath = (Get-Item "C:\Program Files (x86)\Windows Kits\10\bin\10.*\x64" | Sort-Object FullName -Descending | Select-Object -First 1).FullName
if (-not $sdkPath) {
    throw "Windows 10/11 SDK not found on runner."
}
$makeAppx = Join-Path $sdkPath "makeappx.exe"
$signTool = Join-Path $sdkPath "signtool.exe"

Write-Host "Using MakeAppx: $makeAppx"
Write-Host "Using SignTool: $signTool"

# Setup layout directory
$layoutDir = "target/msix-layout"
$assetsDir = Join-Path $layoutDir "Assets"
if (Test-Path $layoutDir) { Remove-Item -Recurse -Force $layoutDir }
New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null

$outBundleDir = "target/release/bundle/msix"
if (-not (Test-Path $outBundleDir)) { New-Item -ItemType Directory -Path $outBundleDir -Force | Out-Null }

# Copy binary
$exeSource = "target/release/gradus21-app.exe"
if (-not (Test-Path $exeSource)) {
    throw "Executable $exeSource does not exist. Run tauri build first."
}
Copy-Item -Path $exeSource -Destination (Join-Path $layoutDir "gradus21-app.exe")

# Copy icons to Assets
$iconSrc = "src-tauri/icons"
$requiredIcons = @("StoreLogo.png", "Square150x150Logo.png", "Square44x44Logo.png", "Square310x310Logo.png", "Square71x71Logo.png")
foreach ($icon in $requiredIcons) {
    $src = Join-Path $iconSrc $icon
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $assetsDir $icon)
    } else {
        Write-Warning "Icon $src not found!"
    }
}

# Generate AppxManifest.xml
$template = Get-Content -Raw "src-tauri/msix/AppxManifest.xml.template"
$manifest = $template.Replace("__MSIX_PUBLISHER__", $Publisher)
$manifest = $manifest.Replace("__MSIX_VERSION__", $Version)
$manifest = $manifest.Replace("__MSIX_PACKAGE_NAME__", $PackageName)
$manifest = $manifest.Replace("__MSIX_PUBLISHER_DISPLAY_NAME__", $PublisherDisplayName)
Set-Content -Path (Join-Path $layoutDir "AppxManifest.xml") -Value $manifest -Encoding Utf8

# Build MSIX package
$msixPath = Join-Path $outBundleDir "gradus21.msix"
Write-Host "==> Packing MSIX to $msixPath..."
& $makeAppx pack /d $layoutDir /p $msixPath /o /v

# Sign MSIX package
Write-Host "==> Signing MSIX..."
$pfxFile = "$env:TEMP\msix_signing.pfx"
$pfxPassword = ""

if ($env:WINDOWS_CERTIFICATE_PFX) {
    Write-Host "Using certificate from WINDOWS_CERTIFICATE_PFX secret..."
    [IO.File]::WriteAllBytes($pfxFile, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE_PFX))
    $pfxPassword = $env:WINDOWS_CERTIFICATE_PASSWORD
} else {
    Write-Host "Generating Self-Signed CodeSigning Certificate for $Publisher..."
    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $Publisher `
        -CertStoreLocation "Cert:\CurrentUser\My" -KeyAlgorithm RSA -KeyLength 2048 `
        -NotAfter (Get-Date).AddYears(5)
    
    $pfxPassword = "Gradus21SelfSignedPassword2026"
    $securePass = ConvertTo-SecureString -String $pfxPassword -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $pfxFile -Password $securePass | Out-Null
    
    # Also export public .cer so users can sideload/install
    $cerOut = Join-Path $outBundleDir "gradus21.cer"
    Export-Certificate -Cert $cert -FilePath $cerOut | Out-Null
    Write-Host "Exported public certificate to $cerOut"
}

# Run signtool
& $signTool sign /fd SHA256 /a /f $pfxFile /p $pfxPassword $msixPath
Write-Host "==> Verifying MSIX signature..."
if ($env:WINDOWS_CERTIFICATE_PFX) {
    & $signTool verify /pa $msixPath
} else {
    Write-Host "Self-signed certificate used; skipping strict root chain verification..."
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & $signTool verify /v $msixPath 2>&1 | Out-Null
    } catch {
        # Untrusted root certificate error is expected for self-signed development/CI certificates
    } finally {
        $ErrorActionPreference = $prevEAP
        $global:LASTEXITCODE = 0
    }
}

# Cleanup temporary private key file
if (Test-Path $pfxFile) { Remove-Item -Force $pfxFile }

Write-Host "==> Successfully created and signed MSIX: $msixPath"
