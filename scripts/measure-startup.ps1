# Measure cold start honestly: from launching the app with a document to the
# moment the document is actually painted on screen.
#
# "Window exists" is not the number that matters: a window can be up while
# the webview is still blank. So after the window appears we capture it and
# wait until enough pixels differ from the background.
param(
    [string]$Exe = "src-tauri\target\release\mdviewer.exe",
    [string]$File = "tests\fixtures\sample.md",
    [int]$Runs = 5
)

if (-not (Test-Path $Exe)) { throw "binary not found: $Exe (run 'npm run tauri build')" }

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Startup {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

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
        for ($y = $y0; $y -lt $y1; $y += 4) {
            for ($x = $x0; $x -lt $x1; $x += 4) {
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

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $proc = Start-Process -FilePath $Exe -ArgumentList (Resolve-Path $File) -PassThru

    $windowMs = $null
    while ($watch.ElapsedMilliseconds -lt 20000) {
        $proc.Refresh()
        if ($proc.MainWindowHandle -ne 0) { $windowMs = $watch.ElapsedMilliseconds; break }
        Start-Sleep -Milliseconds 10
    }
    if (-not $windowMs) { Write-Output "run ${i}: no window"; continue }

    $paintedMs = $null
    while ($watch.ElapsedMilliseconds -lt 20000) {
        if ((Get-InkFraction $proc.MainWindowHandle) -ge $InkThreshold) {
            $paintedMs = $watch.ElapsedMilliseconds
            break
        }
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
