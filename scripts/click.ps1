# Clicks at a screen coordinate inside the MDViewer window.
#
# Keyboard injection into the WebView2 child is unreliable (SendKeys delivers
# plain characters but drops modifier combinations), so UI checks that need a
# menu or a button driven from the outside go through the mouse instead.
param(
  [Parameter(Mandatory = $true)][int]$X,
  [Parameter(Mandatory = $true)][int]$Y,
  [int]$DelayMs = 400
)

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Clicker {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public const uint DOWN = 0x0002, UP = 0x0004;
}
'@

# Found the same way the screenshot script finds it: by process, not by title
# — the title follows the open document.
$proc = Get-Process -Name mdviewer -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Error 'MDViewer has no visible window'; exit 1 }
$hwnd = $proc.MainWindowHandle

function Foreground-Pid {
  $fg = [Clicker]::GetForegroundWindow()
  $id = 0
  [Clicker]::GetWindowThreadProcessId($fg, [ref]$id) | Out-Null
  return $id
}

# Only reach for focus if we do not already have it. An open menu is a window
# of its own, and forcing the main window forward closes it — which made a
# two-click sequence (open the menu, click the item) impossible, and looked
# like the item doing nothing.
if ((Foreground-Pid) -ne $proc.Id) {
  [Clicker]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 400
}

# Windows can refuse to bring a window forward, and it refuses silently. A
# click sent anyway lands in whatever application is actually in front — some
# other program of the user's, at coordinates that mean nothing there. Refuse
# rather than guess.
if ((Foreground-Pid) -ne $proc.Id) {
  Write-Error 'MDViewer is not the foreground window; refusing to click'
  exit 2
}

$rect = New-Object Clicker+RECT
[Clicker]::GetWindowRect($hwnd, [ref]$rect) | Out-Null

# Coordinates are given relative to the window, the way a screenshot reads.
$sx = $rect.Left + $X
$sy = $rect.Top + $Y

[Clicker]::SetCursorPos($sx, $sy) | Out-Null
Start-Sleep -Milliseconds 120
[Clicker]::mouse_event([Clicker]::DOWN, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 60
[Clicker]::mouse_event([Clicker]::UP, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds $DelayMs

Write-Output "clicked $sx,$sy"
