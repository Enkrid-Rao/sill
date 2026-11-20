# Sill data collector.
# Runs as a long-lived process; prints one compact JSON line every IntervalMs.
# CPU and memory are sampled in Node (os module), so this script only covers
# what Node cannot see: network throughput, GPU, processes and SMTC media.

param([int]$IntervalMs = 2000)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$IntervalMs = [math]::Min(10000, [math]::Max(500, $IntervalMs))

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and
  $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

$manager = $null
try {
  $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch { }

$hasNvidia = $null -ne (Get-Command nvidia-smi -ErrorAction SilentlyContinue)
$gpuProcs = @()
$gpuProcAt = [datetime]::MinValue
$lastGpu = $null
$lastGpuMem = $null
$lastGpuTotal = $null
$swapUsedMb = $null
$swapTotalMb = $null
$swapAt = [datetime]::MinValue
$loop = 0
$prevRx = $null
$prevTx = $null
$prevAt = Get-Date

# Prime the NIC counters so the first emitted line has a real rate instead of 0 B/s.
$prevRx = 0
$prevTx = 0
foreach ($adapter in @(Get-NetAdapterStatistics)) {
  $prevRx += $adapter.ReceivedBytes
  $prevTx += $adapter.SentBytes
}
$prevAt = Get-Date
Start-Sleep -Milliseconds 250

while ($true) {
  $now = Get-Date
  $dt = ($now - $prevAt).TotalSeconds

  $rx = 0
  $tx = 0
  foreach ($adapter in @(Get-NetAdapterStatistics)) {
    $rx += $adapter.ReceivedBytes
    $tx += $adapter.SentBytes
  }
  $down = 0
  $up = 0
  if ($null -ne $prevRx -and $dt -gt 0.2) {
    $down = [math]::Max(0, [math]::Round(($rx - $prevRx) / $dt))
    $up = [math]::Max(0, [math]::Round(($tx - $prevTx) / $dt))
  }
  $prevRx = $rx
  $prevTx = $tx
  $prevAt = $now

  $systemProcs = @('Memory Compression', 'System', 'Registry', 'Secure System', 'Idle', 'vmmem', 'vmmemWSL')
  $procs = @(Get-Process |
    Where-Object { $systemProcs -notcontains $_.ProcessName } |
    Group-Object ProcessName |
    ForEach-Object {
      [pscustomobject]@{
        name = $_.Name
        mb   = [math]::Round((($_.Group | Measure-Object WorkingSet64 -Sum).Sum) / 1MB, 1)
      }
    } |
    Sort-Object mb -Descending |
    Select-Object -First 3)

  $gpu = $null
  $gpuMem = $null
  $gpuTotal = $null
  if ($hasNvidia) {
    $line = @(& nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
    if ($line.Count -gt 0 -and $line[0]) {
      $parts = "$($line[0])".Split(',')
      if ($parts.Count -ge 3) {
        $gpu = [int]($parts[0].Trim())
        $gpuMem = [int]($parts[1].Trim())
        $gpuTotal = [int]($parts[2].Trim())
      }
    }
  }
  if ($null -ne $gpu) {
    $lastGpu = $gpu
    $lastGpuMem = $gpuMem
    $lastGpuTotal = $gpuTotal
  } elseif ($null -ne $lastGpu) {
    $gpu = $lastGpu
    $gpuMem = $lastGpuMem
    $gpuTotal = $lastGpuTotal
  }

  $loop += 1
  # Virtual memory / commit charge (physical + page file); cache for 10s.
  if ($loop -le 3 -or (($now - $swapAt).TotalSeconds -ge 10)) {
    $swapAt = $now
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    if ($null -ne $os) {
      $virtualKb = [double]$os.TotalVirtualMemorySize
      $freeKb = [double]$os.FreeVirtualMemory
      if ($virtualKb -gt 0) {
        $swapTotalMb = [int]($virtualKb / 1024)
        $swapUsedMb = [int](($virtualKb - $freeKb) / 1024)
      }
    }
  }
  $media = $null
  if ($null -ne $manager) {
    try {
      $session = $manager.GetCurrentSession()
      if ($null -ne $session) {
        $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $timeline = $session.GetTimelineProperties()
        $playback = $session.GetPlaybackInfo()
        $media = [pscustomobject]@{
          title    = $props.Title
          artist   = $props.Artist
          album    = $props.AlbumTitle
          status   = $playback.PlaybackStatus.ToString()
          position = [math]::Round($timeline.Position.TotalSeconds, 1)
          duration = [math]::Round($timeline.EndTime.TotalSeconds, 1)
          app      = $session.SourceAppUserModelId
        }
      }
    } catch { }
  }

  [pscustomobject]@{
    down     = [math]::Round($down)
    up       = [math]::Round($up)
    gpu      = $gpu
    gpuMem   = $gpuMem
    gpuTotal = $gpuTotal
    gpuProcs = $gpuProcs
    swapUsedMb = $swapUsedMb
    swapTotalMb = $swapTotalMb
    procs    = $procs
    media    = $media
  } | ConvertTo-Json -Compress -Depth 4

  [Console]::Out.Flush()
  # GPU process counters are expensive (~2-3s); sample every 15s and cache.
  if (($now - $gpuProcAt).TotalSeconds -ge 15) {
    $gpuProcAt = $now
    $byPid = @{}
    $samples = @((Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples)
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
      $list += [pscustomobject]@{ name = $group.Name; pct = [int][math]::Min(100, [math]::Round($sum)) }
    }
    $gpuProcs = @($list | Sort-Object pct -Descending | Select-Object -First 3)
  }

  Start-Sleep -Milliseconds $IntervalMs
}





