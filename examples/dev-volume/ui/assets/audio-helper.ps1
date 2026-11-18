param(
  [string]$Command = 'list',
  [int]$ProcessId = 0,
  [double]$Value = 0,
  [bool]$Muted = $false
)

$code = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace SillAudio
{
    public enum EDataFlow { eRender = 0, eCapture = 1, eAll = 2 }
    public enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }
    public enum AudioSessionState { Inactive = 0, Active = 1, Expired = 2 }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumerator { }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceCollection { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(EDataFlow dataFlow, int stateMask, out IMMDeviceCollection devices);
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        int RegisterEndpointNotificationCallback(IntPtr client);
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice
    {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out int pdwState);
    }

    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionControl
    {
        int GetState(out AudioSessionState state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid eventContext);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid eventContext);
        int GetGroupingParam(out Guid groupingParam);
        int SetGroupingParam(ref Guid groupingParam, ref Guid eventContext);
        int RegisterAudioSessionNotification(IntPtr client);
        int UnregisterAudioSessionNotification(IntPtr client);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionControl2 : IAudioSessionControl
    {
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string retVal);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string retVal);
        int GetProcessId(out uint retVal);
        int IsSystemSoundsSession();
        int SetDuckingPreference(bool optOut);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionEnumerator
    {
        int GetCount(out int sessionCount);
        int GetSession(int sessionIndex, out IAudioSessionControl session);
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface ISimpleAudioVolume
    {
        int SetMasterVolume(float level, ref Guid eventContext);
        int GetMasterVolume(out float level);
        int SetMute(bool mute, ref Guid eventContext);
        int GetMute(out bool mute);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionManager2
    {
        int GetAudioSessionControl(ref Guid audioSessionGuid, int streamFlags, out IAudioSessionControl sessionControl);
        int GetSimpleAudioVolume(ref Guid audioSessionGuid, int streamFlags, out ISimpleAudioVolume audioVolume);
        int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnum);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume
    {
        int RegisterControlChangeNotify(IntPtr notify);
        int UnregisterControlChangeNotify(IntPtr notify);
        int GetChannelCount(out uint channelCount);
        int SetMasterVolumeLevel(float level, ref Guid eventContext);
        int SetMasterVolumeLevelScalar(float level, ref Guid eventContext);
        int GetMasterVolumeLevel(out float level);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(uint channel, float level, ref Guid eventContext);
        int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid eventContext);
        int GetChannelVolumeLevel(uint channel, out float level);
        int GetChannelVolumeLevelScalar(uint channel, out float level);
        int SetMute(bool mute, ref Guid eventContext);
        int GetMute(out bool mute);
    }

    public class AppSession
    {
        public int pid;
        public string name;
        public float volume;
        public bool muted;
        public int count;
    }

    public class AudioState
    {
        public float volume;
        public bool muted;
        public List<AppSession> sessions = new List<AppSession>();
    }

    public static class AudioApi
    {
        private static IMMDevice DefaultDevice()
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            IMMDevice device;
            var hr = enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device);
            Marshal.ThrowExceptionForHR(hr);
            return device;
        }

        private static IAudioSessionManager2 SessionManager(IMMDevice device)
        {
            var iid = typeof(IAudioSessionManager2).GUID;
            object obj;
            var hr = device.Activate(ref iid, 0, IntPtr.Zero, out obj);
            Marshal.ThrowExceptionForHR(hr);
            return (IAudioSessionManager2)obj;
        }

        private static IAudioEndpointVolume EndpointVolume(IMMDevice device)
        {
            var iid = typeof(IAudioEndpointVolume).GUID;
            object obj;
            var hr = device.Activate(ref iid, 0, IntPtr.Zero, out obj);
            Marshal.ThrowExceptionForHR(hr);
            return (IAudioEndpointVolume)obj;
        }

        public static AudioState GetState()
        {
            var state = new AudioState();
            var device = DefaultDevice();
            var endpoint = EndpointVolume(device);
            float master;
            bool mute;
            endpoint.GetMasterVolumeLevelScalar(out master);
            endpoint.GetMute(out mute);
            state.volume = master;
            state.muted = mute;

            var manager = SessionManager(device);
            IAudioSessionEnumerator sessions;
            manager.GetSessionEnumerator(out sessions);
            int count;
            sessions.GetCount(out count);
            var grouped = new Dictionary<int, AppSession>();
            for (var index = 0; index < count; index++)
            {
                IAudioSessionControl control;
                sessions.GetSession(index, out control);
                AudioSessionState audioState;
                control.GetState(out audioState);
                if (audioState != AudioSessionState.Active) continue;

                var control2 = (IAudioSessionControl2)control;
                uint processId;
                control2.GetProcessId(out processId);
                var isSystem = control2.IsSystemSoundsSession() == 0;
                var simple = (ISimpleAudioVolume)control;
                float volume;
                bool muted;
                simple.GetMasterVolume(out volume);
                simple.GetMute(out muted);

                var pid = isSystem ? 0 : (int)processId;
                var name = pid == 0 ? "System Sounds" : "PID " + pid;
                if (pid != 0)
                {
                    try { name = Process.GetProcessById(pid).ProcessName; }
                    catch { name = "PID " + pid; }
                }

                AppSession app;
                if (grouped.TryGetValue(pid, out app))
                {
                    app.volume = (app.volume * app.count + volume) / (app.count + 1);
                    app.muted = app.muted && muted;
                    app.count++;
                }
                else
                {
                    grouped[pid] = new AppSession { pid = pid, name = name, volume = volume, muted = muted, count = 1 };
                }
            }
            state.sessions.AddRange(grouped.Values);
            state.sessions.Sort((a, b) => string.Compare(a.name, b.name, StringComparison.OrdinalIgnoreCase));
            return state;
        }

        public static void SetVolume(int pid, float value)
        {
            ForEachSession(pid, (simple, control) =>
            {
                var context = Guid.Empty;
                simple.SetMasterVolume(value, ref context);
            });
        }

        public static void SetMute(int pid, bool muted)
        {
            ForEachSession(pid, (simple, control) =>
            {
                var context = Guid.Empty;
                simple.SetMute(muted, ref context);
            });
        }

        public static void SetMasterVolume(float value)
        {
            var endpoint = EndpointVolume(DefaultDevice());
            var context = Guid.Empty;
            endpoint.SetMasterVolumeLevelScalar(value, ref context);
        }

        public static void SetMasterMute(bool muted)
        {
            var endpoint = EndpointVolume(DefaultDevice());
            var context = Guid.Empty;
            endpoint.SetMute(muted, ref context);
        }

        private static void ForEachSession(int pid, Action<ISimpleAudioVolume, IAudioSessionControl2> action)
        {
            var manager = SessionManager(DefaultDevice());
            IAudioSessionEnumerator sessions;
            manager.GetSessionEnumerator(out sessions);
            int count;
            sessions.GetCount(out count);
            for (var index = 0; index < count; index++)
            {
                IAudioSessionControl control;
                sessions.GetSession(index, out control);
                if (control == null) continue;
                var control2 = (IAudioSessionControl2)control;
                uint processId;
                control2.GetProcessId(out processId);
                var isSystem = control2.IsSystemSoundsSession() == 0;
                var target = isSystem ? 0 : (int)processId;
                if (target != pid) continue;
                action((ISimpleAudioVolume)control, control2);
            }
        }
    }
}
'@

Add-Type -TypeDefinition $code -Language CSharp

function Convert-State($state) {
  $sessions = @()
  foreach ($item in $state.sessions) {
    $sessions += [pscustomobject]@{
      pid = $item.pid
      name = $item.name
      volume = [math]::Round($item.volume, 4)
      muted = $item.muted
      count = $item.count
    }
  }
  [pscustomobject]@{
    master = [pscustomobject]@{
      volume = [math]::Round($state.volume, 4)
      muted = $state.muted
    }
    sessions = $sessions
  } | ConvertTo-Json -Compress -Depth 4
}

switch ($Command) {
  'list' { Convert-State ([SillAudio.AudioApi]::GetState()) }
  'set-volume' { [SillAudio.AudioApi]::SetVolume($ProcessId, [float]$Value); Convert-State ([SillAudio.AudioApi]::GetState()) }
  'set-mute' { [SillAudio.AudioApi]::SetMute($ProcessId, $Muted); Convert-State ([SillAudio.AudioApi]::GetState()) }
  'set-master' { [SillAudio.AudioApi]::SetMasterVolume([float]$Value); Convert-State ([SillAudio.AudioApi]::GetState()) }
  'set-master-mute' { [SillAudio.AudioApi]::SetMasterMute($Muted); Convert-State ([SillAudio.AudioApi]::GetState()) }
  default { throw "unknown command: $Command" }
}
