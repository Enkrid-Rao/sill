# Sill data collector.
# Runs as a long-lived process; prints one compact JSON line every ~2s.
# CPU and memory are sampled in Node (os module), so this script only covers
# what Node cannot see: network throughput, GPU, processes and SMTC media.

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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
$prevRx = $null
$prevTx = $null
$prevAt = Get-Date

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
    procs    = $procs
    media    = $media
  } | ConvertTo-Json -Compress -Depth 4

  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 2000
}
