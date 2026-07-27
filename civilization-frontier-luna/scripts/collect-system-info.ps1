$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$OutDir = Join-Path $Root "planning"
$OutFile = Join-Path $OutDir "local-system-report.txt"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$cpu = Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed
$ramBytes = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
$os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, OSArchitecture
$gpu = Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion
$net = Get-NetAdapter | Where-Object Status -eq "Up" | Select-Object Name, InterfaceDescription, LinkSpeed

@"
Civilization Frontier local system report
Generated: $(Get-Date -Format o)

OPERATING SYSTEM
$($os | Format-List | Out-String)
CPU
$($cpu | Format-List | Out-String)
MEMORY
Total bytes: $ramBytes
Total GiB: $([math]::Round($ramBytes / 1GB, 2))

GPU
$($gpu | Format-List | Out-String)
ACTIVE NETWORK ADAPTERS
$($net | Format-Table -AutoSize | Out-String)

NOTES
- This report does not measure internet throughput.
- It intentionally does not collect passwords, browser data, IP address, or personal files.
- Capacity must be established with the project benchmark, not specifications alone.
"@ | Set-Content -Encoding UTF8 $OutFile

Write-Host "System report written to: $OutFile"
