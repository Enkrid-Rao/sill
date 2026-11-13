# Sill media control.
# Long-lived helper: reads one command per line from stdin, writes one compact
# JSON line per command. Commands:
#
#   get                 state only
#   playpause | play | pause | next | prev | stop
#   mute                toggle system mute
#   volume <0-100>      set system master volume
#   volup | voldown     step the system volume by 2%
#
# SMTC handles the transport buttons (so it targets the app that actually owns
# the media session); the master volume comes from the default render endpoint
# through WASAPI. Both are Windows-only, which is fine: Sill is Windows-only.

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

# ---- WASAPI master volume (C# interop, compiled once per process) ----
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class SillMMDeviceEnumerator { }

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ISillDeviceEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, IntPtr devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out ISillDevice endpoint);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ISillDevice {
  [PreserveSig] int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ISillEndpointVolume {
  [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
  [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
  [PreserveSig] int GetChannelCount(out uint count);
  [PreserveSig] int SetMasterVolumeLevel(float level, ref Guid eventContext);
  [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid eventContext);
  [PreserveSig] int GetMasterVolumeLevel(out float level);
  [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
  [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, ref Guid eventContext);
  [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid eventContext);
  [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
  [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
  [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid eventContext);
  [PreserveSig] int GetMute(out bool mute);
}

public static class SillAudio {
  private static ISillEndpointVolume Endpoint() {
    var enumerator = (ISillDeviceEnumerator)(new SillMMDeviceEnumerator());
    ISillDevice device;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
    var iid = typeof(ISillEndpointVolume).GUID;
    object obj;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out obj));
    return (ISillEndpointVolume)obj;
  }

  public static int GetVolume() {
    float level;
    Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out level));
    return (int)Math.Round(level * 100);
  }

  public static bool GetMute() {
    bool mute;
    Marshal.ThrowExceptionForHR(Endpoint().GetMute(out mute));
    return mute;
  }

  public static void SetVolume(int percent) {
    var ctx = Guid.Empty;
    float level = Math.Max(0, Math.Min(100, percent)) / 100f;
    Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(level, ref ctx));
  }

  public static void SetMute(bool mute) {
    var ctx = Guid.Empty;
    Marshal.ThrowExceptionForHR(Endpoint().SetMute(mute, ref ctx));
  }
}
'@ | Out-Null

$manager = $null
try {
  $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch { }

function Get-MediaSession {
  if ($null -eq $manager) { return $null }
  return $manager.GetCurrentSession()
}

function Invoke-SessionAction([string]$kind) {
  $session = Get-MediaSession
  if ($null -eq $session) { return $false }
  try {
    switch ($kind) {
      'playpause' { return [bool](Await ($session.TryTogglePlayPauseAsync()) ([bool])) }
      'play'      { return [bool](Await ($session.TryPlayAsync()) ([bool])) }
      'pause'     { return [bool](Await ($session.TryPauseAsync()) ([bool])) }
      'next'      { return [bool](Await ($session.TrySkipNextAsync()) ([bool])) }
      'prev'      { return [bool](Await ($session.TrySkipPreviousAsync()) ([bool])) }
      'stop'      { return [bool](Await ($session.TryStopAsync()) ([bool])) }
    }
  } catch { }
  return $false
}

function Get-State([bool]$ok) {
  $session = Get-MediaSession
  $status = ''
  $title = ''
  $artist = ''
  if ($null -ne $session) {
    try {
      $playback = $session.GetPlaybackInfo()
      $status = $playback.PlaybackStatus.ToString()
      $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $title = [string]$props.Title
      $artist = [string]$props.Artist
    } catch { }
  }
  $volume = -1
  try { $volume = [SillAudio]::GetVolume() } catch { }
  $muted = $false
  try { $muted = [SillAudio]::GetMute() } catch { }

  return [pscustomobject]@{
    ok     = $ok
    volume = $volume
    muted  = $muted
    status = $status
    title  = $title
    artist = $artist
  } | ConvertTo-Json -Compress
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line.Trim().Split(' ', 2)
  $command = $parts[0].ToLowerInvariant()
  $arg = if ($parts.Count -gt 1) { $parts[1] } else { '' }
  $ok = $true

  switch ($command) {
    'get' { $ok = $true }
    'playpause' { $ok = Invoke-SessionAction 'playpause' }
    'play' { $ok = Invoke-SessionAction 'play' }
    'pause' { $ok = Invoke-SessionAction 'pause' }
    'next' { $ok = Invoke-SessionAction 'next' }
    'prev' { $ok = Invoke-SessionAction 'prev' }
    'stop' { $ok = Invoke-SessionAction 'stop' }
    'mute' {
      try {
        $next = -not [SillAudio]::GetMute()
        [SillAudio]::SetMute($next)
      } catch { $ok = $false }
    }
    'volume' {
      try { [SillAudio]::SetVolume([int]$arg) } catch { $ok = $false }
    }
    'volup' {
      try { [SillAudio]::SetVolume([SillAudio]::GetVolume() + 2) } catch { $ok = $false }
    }
    'voldown' {
      try { [SillAudio]::SetVolume([SillAudio]::GetVolume() - 2) } catch { $ok = $false }
    }
    default { $ok = $false }
  }

  [Console]::Out.WriteLine((Get-State $ok))
  [Console]::Out.Flush()
}
