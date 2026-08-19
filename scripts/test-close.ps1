# Verify the app closes when the user clicks the window's close button.
#
# The app cancels the OS close request so it can flush drafts and the session
# first, then closes itself. That path is easy to break silently, so it is
# exercised here with a real WM_CLOSE instead of killing the process.
param(
    [string]$Exe = "src-tauri\target\release\mdviewer.exe",
    [string]$File = "tests\fixtures\sample.md",
    [int]$TimeoutMs = 10000
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Close {
    [DllImport("user32.dll")] public static extern IntPtr PostMessage(IntPtr h, uint msg, IntPtr wp, IntPtr lp);
}
"@

Get-Process mdviewer -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 1200

$proc = Start-Process -FilePath $Exe -ArgumentList (Resolve-Path $File) -PassThru
$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
    $proc.Refresh()
    if ($proc.MainWindowHandle -ne 0) { break }
    Start-Sleep -Milliseconds 25
}
if ($proc.MainWindowHandle -eq 0) { throw "window never appeared" }

# Let the frontend finish booting and register its close handler.
Start-Sleep -Seconds 3
$proc.Refresh()
$handle = $proc.MainWindowHandle

$WM_CLOSE = 0x0010
[Win32Close]::PostMessage($handle, $WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
Write-Output "WM_CLOSE sent to window $handle"

$watch = [System.Diagnostics.Stopwatch]::StartNew()
while ($watch.ElapsedMilliseconds -lt $TimeoutMs) {
    if ($proc.HasExited) {
        Write-Output ("PASS: process exited {0} ms after close request (exit code {1})" -f
            $watch.ElapsedMilliseconds, $proc.ExitCode)
        exit 0
    }
    Start-Sleep -Milliseconds 50
}

Write-Output "FAIL: window ignored the close request for ${TimeoutMs} ms"
Get-Process mdviewer -ErrorAction SilentlyContinue | Stop-Process -Force
exit 1
