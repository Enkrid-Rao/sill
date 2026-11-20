# GPU process utilization, one-shot.
# Kept out of collector.ps1 because Get-Counter can block for seconds; the Node
# side runs this on its own schedule and merges the result without stalling the
# 1s/2s data loop.
$ErrorActionPreference = 'SilentlyContinue'

$samples = @((Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples)
$byPid = @{}
foreach ($sample in $samples) {
  if ($sample.CookedValue -le 0) { continue }
  if ($sample.InstanceName -match '^pid_(\d+)_') {
    $procId = [int]$Matches[1]
    $byPid[$procId] = [double]$byPid[$procId] + [double]$sample.CookedValue
  }
}

$resolved = @()
foreach ($key in $byPid.Keys) {
  $process = Get-Process -Id $key -ErrorAction SilentlyContinue
  if ($null -ne $process) {
    $resolved += [pscustomobject]@{ name = $process.ProcessName; pct = [double]$byPid[$key] }
  }
}

$list = @()
foreach ($group in @($resolved | Group-Object name)) {
  $sum = [double]($group.Group | Measure-Object pct -Sum).Sum
  $list += [pscustomobject]@{
    name = $group.Name
    pct  = [int][math]::Min(100, [math]::Round($sum))
  }
}

$list = @($list | Sort-Object pct -Descending | Select-Object -First 3)
if ($list.Count -eq 0) {
  '[]'
} else {
  ConvertTo-Json -InputObject @($list) -Compress -Depth 3
}
