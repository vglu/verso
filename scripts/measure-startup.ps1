# Measure cold start honestly: from launching the app with a document to the
# moment the document is actually painted on screen.
#
# "Window exists" is not the number that matters: a window can be up while
# the webview is still blank. So after the window appears we capture it and
# wait until enough pixels differ from the background.
#
# This one needs the screen. The window is kept out of the way — left edge,
# bottom of the stack, focus handed straight back — but a window that is
# covered from its very first frame never composites, and then there is
# nothing to detect: the run reports no paint time at all. Take the number
# when the desktop is free; use scripts/screenshot.ps1 the rest of the time,
# which reads a window that is behind everything perfectly well.
param(
    [string]$Exe = "src-tauri\target\release\mdviewer.exe",
    [string]$File = "tests\fixtures\sample.md",
    [int]$Runs = 5,
    # Leave the window visible at the left edge instead of hiding it behind
    # everything. It still never takes the focus. This is the mode that
    # actually produces a number while someone else is using the screen.
    [switch]$KeepVisible
)

if (-not (Test-Path $Exe)) { throw "binary not found: $Exe (run 'npm run tauri build')" }

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Startup {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(
        IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    public static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    public const uint NOSIZE = 0x0001, NOMOVE = 0x0002, NOACTIVATE = 0x0010;
}
"@

# The run takes five launches. Each window is moved to the left edge and sent
# to the back of the stack, so the measurement happens beside someone else's
# work instead of over the top of it; PrintWindow captures it there just the
# same. Handing the focus back first is not optional — Windows keeps the
# foreground window on top wherever you try to put it.
$script:Previous = [IntPtr]::Zero

function Send-ToBack([IntPtr]$handle) {
    if ($script:Previous -ne [IntPtr]::Zero -and $script:Previous -ne $handle) {
        [Win32Startup]::SetForegroundWindow($script:Previous) | Out-Null
    }
    # Moving to the left edge always; going behind everything only when the
    # caller can spare the screen, because a window covered from its first
    # frame never paints and there is then nothing to measure.
    $after = if ($KeepVisible) { [IntPtr]::Zero } else { [Win32Startup]::HWND_BOTTOM }
    [Win32Startup]::SetWindowPos($handle, $after, 0, 0, 0, 0,
        [Win32Startup]::NOSIZE -bor [Win32Startup]::NOACTIVATE) | Out-Null
}

# Fraction of sampled pixels that must differ from the window's own background
# before we call the document "painted".
$InkThreshold = 0.012

function Get-InkFraction([IntPtr]$handle) {
    $rect = New-Object Win32Startup+RECT
    if (-not [Win32Startup]::GetWindowRect($handle, [ref]$rect)) { return 0 }
    $w = $rect.Right - $rect.Left
    $h = $rect.Bottom - $rect.Top
    if ($w -le 0 -or $h -le 0) { return 0 }

    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $ok = $false
    try {
        $hdc = $gfx.GetHdc()
        $ok = [Win32Startup]::PrintWindow($handle, $hdc, 2)
        $gfx.ReleaseHdc($hdc)
    } catch { $ok = $false }

    $ink = 0.0
    if ($ok) {
        # Sample the document area, skipping chrome at the edges.
        $x0 = [int]($w * 0.35); $x1 = [int]($w * 0.95)
        $y0 = [int]($h * 0.12); $y1 = [int]($h * 0.75)
        $bg = $bmp.GetPixel([int]($w * 0.93), [int]($h * 0.70))
        $hits = 0; $total = 0
        # Sampled coarsely on purpose. GetPixel from PowerShell costs about
        # 3µs, so a fine grid made one poll cost 120ms — and the answer can
        # only ever be as precise as one poll. A sparse grid still tells ink
        # from background, and brings the resolution down to ~40ms.
        for ($y = $y0; $y -lt $y1; $y += 12) {
            for ($x = $x0; $x -lt $x1; $x += 12) {
                $p = $bmp.GetPixel($x, $y)
                $total++
                if ([math]::Abs($p.R - $bg.R) + [math]::Abs($p.G - $bg.G) + [math]::Abs($p.B - $bg.B) -gt 40) {
                    $hits++
                }
            }
        }
        if ($total -gt 0) { $ink = $hits / $total }
    }

    $gfx.Dispose(); $bmp.Dispose()
    return $ink
}

$painted = @()

for ($i = 1; $i -le $Runs; $i++) {
    Get-Process mdviewer -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 1500

    # Whoever is in front keeps the screen for the whole run.
    $script:Previous = [Win32Startup]::GetForegroundWindow()
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $proc = Start-Process -FilePath $Exe -ArgumentList (Resolve-Path $File) -PassThru

    $windowMs = $null
    while ($watch.ElapsedMilliseconds -lt 20000) {
        $proc.Refresh()
        if ($proc.MainWindowHandle -ne 0) {
            $windowMs = $watch.ElapsedMilliseconds
            Send-ToBack $proc.MainWindowHandle
            break
        }
        Start-Sleep -Milliseconds 10
    }
    if (-not $windowMs) { Write-Output "run ${i}: no window"; continue }

    $paintedMs = $null
    while ($watch.ElapsedMilliseconds -lt 20000) {
        if ((Get-InkFraction $proc.MainWindowHandle) -ge $InkThreshold) {
            $paintedMs = $watch.ElapsedMilliseconds
            break
        }
        # The webview can raise itself as it settles; keep it down.
        Send-ToBack $proc.MainWindowHandle
    }

    $watch.Stop()
    if ($paintedMs) { $painted += $paintedMs }
    Write-Output ("run {0}: window {1} ms, document painted {2} ms" -f $i, $windowMs, $paintedMs)
}

Get-Process mdviewer -ErrorAction SilentlyContinue | Stop-Process -Force

if ($painted.Count -gt 0) {
    $sorted = $painted | Sort-Object
    Write-Output ""
    Write-Output ("document painted - min {0} ms | median {1} ms | max {2} ms  (n={3})" -f
        $sorted[0], $sorted[[int]($sorted.Count / 2)], $sorted[-1], $sorted.Count)
    Write-Output "note: includes one screen capture per poll, so this is an upper bound."
}
