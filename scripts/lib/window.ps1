# Finding Verso's window, reliably.
#
# `Process.MainWindowHandle` is whichever top-level window Windows happens to
# enumerate first, and a Tauri process owns several: the document window plus
# a couple of 16x16 helpers the webview keeps. Capturing "the main window"
# started returning a 16-pixel square — the screenshots were of nothing.
#
# So the window is chosen by what it is rather than by what Windows calls it:
# visible, has a title, and is the largest. Dot-source this file to use it.

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class VersoWindows {
    public delegate bool EnumProc(IntPtr h, IntPtr p);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

    /// A window smaller than this is not a document window, whatever Windows
    /// says: during start-up Verso briefly owns a titled 160x28 one, and a
    /// screenshot run that caught it photographed a grey sliver and then
    /// reported that it could not find the document.
    public const int MIN_W = 400, MIN_H = 300;

    /// The largest visible titled window of a process, or zero.
    public static IntPtr MainWindow(int processId) {
        IntPtr best = IntPtr.Zero;
        long bestArea = 0;
        EnumWindows((h, p) => {
            uint owner;
            GetWindowThreadProcessId(h, out owner);
            if (owner != (uint)processId) return true;
            if (!IsWindowVisible(h) || GetWindowTextLength(h) == 0) return true;

            RECT r;
            if (!GetWindowRect(h, out r)) return true;
            int w = r.Right - r.Left, hgt = r.Bottom - r.Top;
            if (w < MIN_W || hgt < MIN_H) return true;
            long area = (long)w * hgt;
            if (area > bestArea) { bestArea = area; best = h; }
            return true;
        }, IntPtr.Zero);
        return best;
    }
}
'@

function Get-VersoWindow {
    param([string]$ProcessName = 'verso', [int]$TimeoutMs = 20000, [int]$ProcessId = 0)

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    while ($watch.ElapsedMilliseconds -lt $TimeoutMs) {
        $procs = if ($ProcessId -gt 0) {
            Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        } else {
            Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
        }

        foreach ($proc in $procs) {
            $handle = [VersoWindows]::MainWindow($proc.Id)
            if ($handle -ne [IntPtr]::Zero) {
                return [pscustomobject]@{ Process = $proc; Handle = $handle }
            }
        }
        Start-Sleep -Milliseconds 60
    }
    return $null
}
