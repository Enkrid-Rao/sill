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
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

function Get-Artwork($props) {
  try {
    $reference = $props.Thumbnail
    if ($null -eq $reference) { return $null }
    $stream = Await ($reference.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if ($null -eq $stream -or $stream.Size -le 0 -or $stream.Size -gt 1048576) { return $null }
    $reader = [Windows.Storage.Streams.DataReader]::new($stream)
    $loaded = Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
    if ($loaded -le 0) { return $null }
    $bytes = New-Object byte[] $loaded
    $reader.ReadBytes($bytes)
    $type = if ($stream.ContentType) { [string]$stream.ContentType } else { 'image/png' }
    return "data:$type;base64," + [Convert]::ToBase64String($bytes)
  } catch {
    return $null
  }
}

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
$lastGpu = $null
$lastGpuMem = $null
$lastGpuTotal = $null
$gpuAt = [datetime]::MinValue
$lastProcs = @()
$procsAt = [datetime]::MinValue
$lastMedia = $null
$mediaAt = [datetime]::MinValue
$lastArtworkKey = ''
$lastArtwork = $null
$artworkChanged = $false
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
  $loopStart = Get-Date
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

  # 进程列表是这一轮里最贵的采样（Get-Process + 分组），5s 一次足够；
  # 其余轮次复用上一份，避免 1s/2s 档位把循环拖长。
  $systemProcs = @('Memory Compression', 'System', 'Registry', 'Secure System', 'Idle', 'vmmem', 'vmmemWSL')
  if (($now - $procsAt).TotalSeconds -ge 5) {
    $procsAt = $now
    $sampled = @(Get-Process |
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
    if ($sampled.Count -gt 0) { $lastProcs = $sampled }
  }
  $procs = $lastProcs

  # GPU 利用率/显存 3s 一次；没有 nvidia-smi 或读不到时保留上一份。
  if ($hasNvidia -and ($now - $gpuAt).TotalSeconds -ge 3) {
    $gpuAt = $now
    $line = @(& nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
    if ($line.Count -gt 0 -and $line[0]) {
      $parts = "$($line[0])".Split(',')
      if ($parts.Count -ge 3) {
        $lastGpu = [int]($parts[0].Trim())
        $lastGpuMem = [int]($parts[1].Trim())
        $lastGpuTotal = [int]($parts[2].Trim())
      }
    }
  }
  $gpu = $lastGpu
  $gpuMem = $lastGpuMem
  $gpuTotal = $lastGpuTotal

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
  # SMTC 查询也做 2s 节流：位置由渲染进程按 snapshot.at 插值，
  # 不需要 1s 档位每轮都走一遍 WinRT。
  $media = $lastMedia
  if (($now - $mediaAt).TotalSeconds -ge 2) {
    $mediaAt = $now
    $media = $null
    if ($null -ne $manager) {
      try {
        $session = $manager.GetCurrentSession()
        if ($null -ne $session) {
          $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
          $timeline = $session.GetTimelineProperties()
          $playback = $session.GetPlaybackInfo()
          $artworkKey = "$($props.Title)|$($props.Artist)|$($props.AlbumTitle)"
          if ($artworkKey -ne $lastArtworkKey) {
            $lastArtworkKey = $artworkKey
            $lastArtwork = Get-Artwork $props
            $artworkChanged = $true
          } else {
            $artworkChanged = $false
          }
          $media = [pscustomobject]@{
            title    = $props.Title
            artist   = $props.Artist
            album    = $props.AlbumTitle
            status   = $playback.PlaybackStatus.ToString()
            position = [math]::Round($timeline.Position.TotalSeconds, 1)
            duration = [math]::Round($timeline.EndTime.TotalSeconds, 1)
            app      = $session.SourceAppUserModelId
            artwork  = if ($artworkChanged) { $lastArtwork } else { $null }
          }
        }
      } catch { }
    }
    $lastMedia = $media
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

  $elapsedMs = ((Get-Date) - $loopStart).TotalMilliseconds
  $sleepMs = [math]::Max(50, $IntervalMs - [int]$elapsedMs)
  Start-Sleep -Milliseconds $sleepMs
}





