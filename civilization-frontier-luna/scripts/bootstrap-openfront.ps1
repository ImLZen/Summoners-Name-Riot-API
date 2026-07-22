param(
  [string]$Tag = "v0.31.12-beta"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Vendor = Join-Path $Root "vendor"
$Repo = Join-Path $Vendor "OpenFrontIO"
$LogDir = Join-Path $Root "planning\openfront-baseline"
New-Item -ItemType Directory -Force -Path $Vendor, $LogDir | Out-Null

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. Install it and rerun this script."
  }
}

Require-Command git
Require-Command node
Require-Command npm

if (-not (Test-Path $Repo)) {
  Write-Host "Cloning official OpenFront repository..."
  git clone https://github.com/openfrontio/OpenFrontIO.git $Repo 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "01-clone.log")
} else {
  Write-Host "Repository already exists. Fetching tags..."
  git -C $Repo fetch --tags --prune 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "01-fetch.log")
}

Write-Host "Checking out pinned tag $Tag..."
git -C $Repo checkout --detach $Tag 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "02-checkout.log")
$commit = git -C $Repo rev-parse HEAD
$commit | Set-Content -Encoding ASCII (Join-Path $LogDir "PINNED_COMMIT.txt")

Push-Location $Repo
try {
  node --version | Tee-Object -FilePath (Join-Path $LogDir "node-version.txt")
  npm --version | Tee-Object -FilePath (Join-Path $LogDir "npm-version.txt")

  Write-Host "Installing exact locked dependencies using upstream command..."
  npm run inst 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "03-install.log")

  Write-Host "Running upstream tests..."
  npm test 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "04-tests.log")

  Write-Host "Running upstream lint..."
  npm run lint 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "05-lint.log")

  Write-Host "Running upstream performance suite..."
  npm run perf 2>&1 | Tee-Object -FilePath (Join-Path $LogDir "06-performance.log")
}
finally {
  Pop-Location
}

Write-Host "Baseline complete. Pinned commit: $commit"
Write-Host "Logs: $LogDir"
Write-Host "To run locally: cd '$Repo'; npm run dev"
