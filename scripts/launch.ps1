# Launch Verso without it landing on top of whatever you are doing.
#
# Two things have to happen, and only doing one of them is why the window kept
# appearing in the middle of the screen anyway:
#
#  1. It goes to the bottom of the window stack — but Windows keeps the
#     *foreground* window on top no matter where you put it, so the focus has
#     to go back to whatever had it before, first.
#  2. It moves to the left edge, out of the middle where the work is.
#
# PrintWindow captures a window that is behind others, so screenshots and the
# startup measurement keep working from down there.
param(
    [string]$Path,
    [string]$Exe = "src-tauri\target\release\verso.exe",
    [int]$X = 0,
    [int]$Y = 0,
    [int]$TimeoutMs = 20000
)

if (-not (Test-Path $Exe)) { throw "binary not found: $Exe (run 'npm run tauri build')" }

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Placer {
    [DllImport("user32.dll")] public static extern bool SetWindowPos(
        IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint attach, uint to, bool join);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    public static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    public const uint NOSIZE = 0x0001, NOMOVE = 0x0002, NOACTIVATE = 0x0010;
    public const int SW_SHOWNOACTIVATE = 4;

    /// Windows refuses SetForegroundWindow to a process that is not already in
    /// front, which is exactly our position: the launcher is in the background
    /// and the window it just started is not. Attaching to the input queue of
    /// the thread that owns the window we want back lifts that refusal for as
    /// long as we are attached. Without this the focus was handed back only
    /// when Windows felt like it, and in between, keystrokes meant for the
    /// terminal landed in the document that had just opened.
    public static void GiveFocusBack(IntPtr window) {
        if (window == IntPtr.Zero) return;
        uint owner = GetWindowThreadProcessId(window, IntPtr.Zero);
        uint mine = GetCurrentThreadId();
        if (owner == 0 || owner == mine) { SetForegroundWindow(window); return; }
        AttachThreadInput(mine, owner, true);
        SetForegroundWindow(window);
        AttachThreadInput(mine, owner, false);
    }
}
"@

# Whoever is in front right now keeps the screen after we are done.
$previous = [Placer]::GetForegroundWindow()

$launchArgs = @()
if ($Path) { $launchArgs += (Resolve-Path $Path).Path }

$proc = if ($launchArgs.Count -gt 0) {
    Start-Process -FilePath $Exe -ArgumentList $launchArgs -PassThru
} else {
    Start-Process -FilePath $Exe -PassThru
}

function Set-OutOfTheWay([IntPtr]$handle, [IntPtr]$previous, [int]$x, [int]$y) {
    # Give the foreground back first — a focused window cannot be pushed down.
    if ($previous -ne [IntPtr]::Zero -and $previous -ne $handle) {
        [Placer]::GiveFocusBack($previous)
    }
    [Placer]::SetWindowPos($handle, [Placer]::HWND_BOTTOM, $x, $y, 0, 0,
        [Placer]::NOSIZE -bor [Placer]::NOACTIVATE) | Out-Null
}

# The webview settles over several hundred milliseconds and can raise itself
# again on the way, so keep putting it back.
. (Join-Path $PSScriptRoot 'lib\window.ps1')

$watch = [System.Diagnostics.Stopwatch]::StartNew()
$pushes = 0
while ($watch.ElapsedMilliseconds -lt $TimeoutMs -and $pushes -lt 15) {
    # Not MainWindowHandle: a Tauri process owns a couple of 16x16 helpers as
    # well, and moving one of those leaves the document window where it was.
    $handle = [VersoWindows]::MainWindow($proc.Id)
    if ($handle -ne [IntPtr]::Zero) {
        Set-OutOfTheWay $handle $previous $X $Y
        $pushes++
    }
    Start-Sleep -Milliseconds 100
}

Write-Output ("launched pid {0} at {1},{2}; pushed back {3}x over {4} ms" -f
    $proc.Id, $X, $Y, $pushes, $watch.ElapsedMilliseconds)
