# Capture the MDViewer window to a PNG for QA evidence.
#
# Two strategies: PrintWindow asks the window to render itself into a bitmap
# (works when the desktop is not composited to a real display), falling back
# to a screen grab.
param(
    [string]$Out = "shot.png",
    [string]$ProcessName = "mdviewer",
    [int]$DelayMs = 0,
    # Grab the screen instead of asking the window to draw itself. Native
    # popups — the menu bar's dropdowns, a file dialog — are separate windows,
    # so PrintWindow of the main window never contains them.
    [switch]$Screen
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Cap {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }

$proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { throw "process '$ProcessName' has no visible window" }

$handle = $proc.MainWindowHandle

# PrintWindow renders a window that is behind others, so the default path never
# disturbs what is in front. Only the screen grab needs the window raised, and
# it says so by asking for -Screen.
if ($Screen) {
    [Win32Cap]::ShowWindow($handle, 9) | Out-Null    # SW_RESTORE
    [Win32Cap]::SetForegroundWindow($handle) | Out-Null
}
Start-Sleep -Milliseconds 900

$rect = New-Object Win32Cap+RECT
[Win32Cap]::GetWindowRect($handle, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) { throw "invalid window size ${w}x${h}" }

$bitmap = New-Object System.Drawing.Bitmap $w, $h
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

$captured = $false
if (-not $Screen) {
  try {
    $hdc = $graphics.GetHdc()
    # flag 2 = PW_RENDERFULLCONTENT, required for hardware-composited webviews
    $captured = [Win32Cap]::PrintWindow($handle, $hdc, 2)
    $graphics.ReleaseHdc($hdc)
  } catch {
    Write-Output "PrintWindow failed: $_"
  }
}

if (-not $captured) {
    try {
        $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
        $captured = $true
    } catch {
        Write-Output "CopyFromScreen failed: $_"
    }
}

if ($captured) {
    $bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "saved $Out (${w}x${h})"
} else {
    Write-Output "capture failed"
}

$graphics.Dispose()
$bitmap.Dispose()
if (-not $captured) { exit 1 }
