# Drive the running app from the keyboard, for end-to-end QA evidence.
param(
    [string]$Keys,
    [string]$ProcessName = "mdviewer",
    [int]$PauseMs = 400
)

Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Keys {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@

$proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { throw "process '$ProcessName' has no visible window" }

[Win32Keys]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
[Win32Keys]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds $PauseMs

[System.Windows.Forms.SendKeys]::SendWait($Keys)
Start-Sleep -Milliseconds $PauseMs
Write-Output "sent: $Keys"
