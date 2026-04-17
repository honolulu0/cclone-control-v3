param(
    [Parameter(Mandatory = $true)]
    [string[]]$ScanRoots,

    [switch]$Apply,

    [string]$LogPath = $(Join-Path $env:USERPROFILE ("Desktop\axios-remediation-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss")))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$DirectSafeVersion1x = "1.15.0"
$DirectSafeVersion0x = "0.31.0"
$MaliciousAxiosVersions = @("1.14.1", "0.30.4")
$FlaggedPatterns = @(
    'plain-crypto-js',
    'axios@1\.14\.1',
    'axios@0\.30\.4',
    'axios-1\.14\.1\.tgz',
    'axios-0\.30\.4\.tgz',
    '"axios"\s*:\s*"\^?1\.14\.1"',
    '"axios"\s*:\s*"\^?0\.30\.4"',
    "'axios'\s*:\s*'\^?1\.14\.1'",
    "'axios'\s*:\s*'\^?0\.30\.4'"
)
$ManifestNames = @("package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock")
$NpmCommand = "npm.cmd"
$YarnCommand = "yarn.cmd"
$PnpmCommand = "pnpm.cmd"

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host ("==== {0} ====" -f $Title)
}

function Get-PackageManager {
    param([string]$ProjectRoot)

    if (Test-Path (Join-Path $ProjectRoot "pnpm-lock.yaml")) { return "pnpm" }
    if (Test-Path (Join-Path $ProjectRoot "yarn.lock")) { return "yarn" }
    if (Test-Path (Join-Path $ProjectRoot "package-lock.json")) { return "npm" }
    if (Test-Path (Join-Path $ProjectRoot "npm-shrinkwrap.json")) { return "npm" }
    return "npm"
}

function Get-ProjectRoots {
    param([string[]]$Roots)

    $packageJsonFiles = foreach ($root in $Roots) {
        if (-not (Test-Path $root)) {
            Write-Warning ("Skip missing root: {0}" -f $root)
            continue
        }

        Get-ChildItem -Path $root -Recurse -File -Filter "package.json" -ErrorAction SilentlyContinue |
            Where-Object {
                $_.FullName -notmatch "\\node_modules\\" -and
                $_.FullName -notmatch "\\.git\\" -and
                $_.FullName -notmatch "\\.venv\\" -and
                $_.FullName -notmatch "\\site-packages\\" -and
                $_.FullName -notmatch "\\.vite\\" -and
                $_.FullName -notmatch "\\dist\\" -and
                $_.FullName -notmatch "\\build\\"
            }
    }

    $packageJsonFiles |
        Select-Object -ExpandProperty DirectoryName -Unique |
        Sort-Object
}

function Read-JsonFile {
    param([string]$Path)

    Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -Depth 100
}

function Get-DirectAxiosSpec {
    param([string]$ProjectRoot)

    $packageJsonPath = Join-Path $ProjectRoot "package.json"
    if (-not (Test-Path $packageJsonPath)) {
        return $null
    }

    $pkg = Read-JsonFile -Path $packageJsonPath
    $sections = @("dependencies", "devDependencies", "optionalDependencies", "peerDependencies")

    foreach ($section in $sections) {
        $property = $pkg.PSObject.Properties[$section]
        if ($null -eq $property) {
            continue
        }

        $table = $property.Value
        $axiosProperty = $table.PSObject.Properties["axios"]
        if ($null -ne $axiosProperty) {
            return [pscustomobject]@{
                Section = $section
                Spec    = [string]$axiosProperty.Value
            }
        }
    }

    return $null
}

function Get-TargetAxiosVersion {
    param([string]$Spec)

    if ([string]::IsNullOrWhiteSpace($Spec)) {
        return $null
    }

    if ($Spec -match "(^|[^0-9])0\.") {
        return $DirectSafeVersion0x
    }

    return $DirectSafeVersion1x
}

function Get-FlaggedFileHits {
    param([string]$ProjectRoot)

    $files = Get-ChildItem -Path $ProjectRoot -File -ErrorAction SilentlyContinue |
        Where-Object { $ManifestNames -contains $_.Name }

    if (-not $files) {
        return @()
    }

    $matches = Select-String -Path $files.FullName -Pattern $FlaggedPatterns -ErrorAction SilentlyContinue
    if ($null -eq $matches) {
        return @()
    }

    return @($matches)
}

function Invoke-Upgrade {
    param(
        [string]$ProjectRoot,
        [string]$PackageManager,
        [string]$TargetVersion
    )

    Push-Location $ProjectRoot
    try {
        switch ($PackageManager) {
            "pnpm" {
                & $PnpmCommand add ("axios@{0}" -f $TargetVersion) --save-exact
                if ($LASTEXITCODE -ne 0) { throw "pnpm add failed" }
            }
            "yarn" {
                & $YarnCommand add ("axios@{0}" -f $TargetVersion) --exact
                if ($LASTEXITCODE -ne 0) { throw "yarn add failed" }
            }
            default {
                & $NpmCommand install ("axios@{0}" -f $TargetVersion) --save-exact
                if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
            }
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-Verification {
    param(
        [string]$ProjectRoot,
        [string]$PackageManager
    )

    Push-Location $ProjectRoot
    try {
        switch ($PackageManager) {
            "pnpm" {
                & $PnpmCommand why axios
            }
            "yarn" {
                & $YarnCommand why axios
            }
            default {
                & $NpmCommand ls axios
            }
        }
    }
    finally {
        Pop-Location
    }
}

if (-not $ScanRoots -or $ScanRoots.Count -eq 0) {
    throw "Provide at least one scan root."
}

$resolvedRoots = foreach ($root in $ScanRoots) {
    if (Test-Path $root) {
        (Resolve-Path $root).Path
    }
    else {
        Write-Warning ("Scan root does not exist: {0}" -f $root)
    }
}

if (-not $resolvedRoots) {
    throw "No valid scan roots were provided."
}

Start-Transcript -Path $LogPath | Out-Null

try {
    Write-Section "Scope"
    $resolvedRoots | ForEach-Object { Write-Host $_ }

    $projectRoots = Get-ProjectRoots -Roots $resolvedRoots

    Write-Section "Discovered Projects"
    if (-not $projectRoots) {
        Write-Host "No package.json files found within the provided roots."
        return
    }

    $projectRoots | ForEach-Object { Write-Host $_ }

    $results = foreach ($projectRoot in $projectRoots) {
        $directAxios = Get-DirectAxiosSpec -ProjectRoot $projectRoot
        $flaggedHits = Get-FlaggedFileHits -ProjectRoot $projectRoot
        $packageManager = Get-PackageManager -ProjectRoot $projectRoot

        $hasFlaggedVersion = $false
        foreach ($hit in $flaggedHits) {
            if ($hit.Line -match "plain-crypto-js|axios@1\.14\.1|axios@0\.30\.4|axios-1\.14\.1\.tgz|axios-0\.30\.4\.tgz|['""]axios['""]\s*:\s*['""]\^?(1\.14\.1|0\.30\.4)['""]") {
                $hasFlaggedVersion = $true
                break
            }
        }

        [pscustomobject]@{
            ProjectRoot        = $projectRoot
            PackageManager     = $packageManager
            DirectAxiosSpec    = if ($directAxios) { $directAxios.Spec } else { $null }
            DirectAxiosSection = if ($directAxios) { $directAxios.Section } else { $null }
            HasFlaggedHit      = $hasFlaggedVersion
            FlaggedHitCount    = @($flaggedHits).Count
            TargetVersion      = if ($directAxios) { Get-TargetAxiosVersion -Spec $directAxios.Spec } else { $null }
            NeedsManualReview  = ($hasFlaggedVersion -and -not $directAxios)
        }
    }

    Write-Section "Findings"
    $results | Sort-Object ProjectRoot | Format-Table -AutoSize

    Write-Section "Detailed Hits"
    foreach ($projectRoot in $projectRoots) {
        $flaggedHits = Get-FlaggedFileHits -ProjectRoot $projectRoot
        if (@($flaggedHits).Count -eq 0) {
            continue
        }

        Write-Host ("Project: {0}" -f $projectRoot)
        $flaggedHits |
            Select-Object Path, LineNumber, Line |
            Format-Table -Wrap -AutoSize
    }

    $manualReview = @($results | Where-Object { $_.NeedsManualReview })
    if ($manualReview.Count -gt 0) {
        Write-Section "Manual Review Required"
        Write-Host "These projects only show lockfile or transitive hits. Upgrade the owning dependency or add an override/resolution after review."
        $manualReview | Select-Object ProjectRoot, PackageManager, HasFlaggedHit, FlaggedHitCount | Format-Table -AutoSize
    }

    if ($Apply) {
        Write-Section "Applying Direct Dependency Upgrades"
        $toUpgrade = @($results | Where-Object { $_.DirectAxiosSpec -and $_.TargetVersion })

        if ($toUpgrade.Count -eq 0) {
            Write-Host "No direct axios dependencies found to upgrade."
        }

        foreach ($entry in $toUpgrade) {
            Write-Host ("Upgrading {0} via {1} to axios@{2}" -f $entry.ProjectRoot, $entry.PackageManager, $entry.TargetVersion)
            Invoke-Upgrade -ProjectRoot $entry.ProjectRoot -PackageManager $entry.PackageManager -TargetVersion $entry.TargetVersion
        }

        Write-Section "Verification"
        foreach ($entry in $toUpgrade) {
            Write-Host ("Verifying {0}" -f $entry.ProjectRoot)
            Invoke-Verification -ProjectRoot $entry.ProjectRoot -PackageManager $entry.PackageManager
        }

        Write-Section "Post-Apply Recheck"
        $postApplyHits = foreach ($projectRoot in $projectRoots) {
            Get-FlaggedFileHits -ProjectRoot $projectRoot
        }

        if (@($postApplyHits).Count -eq 0) {
            Write-Host "No flagged axios versions or plain-crypto-js references remain in the scanned manifest and lock files."
        }
        else {
            $postApplyHits | Select-Object Path, LineNumber, Line | Format-Table -Wrap -AutoSize
        }
    }
    else {
        Write-Section "Next Step"
        Write-Host "Re-run with -Apply to upgrade direct axios dependencies after reviewing the findings."
    }

    Write-Section "Global Packages"
    & $NpmCommand ls -g axios --all
    & $NpmCommand ls -g plain-crypto-js --all
}
finally {
    Stop-Transcript | Out-Null
    Write-Host ""
    Write-Host ("Transcript saved to {0}" -f $LogPath)
}
