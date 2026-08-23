# Photograph the application in every state that matters, without touching it.
#
# Twelve shots: two themes, one pane and two, at three window widths. The
# window stays at the bottom of the stack the whole time — PrintWindow renders
# a window that is behind others, so this never takes the screen or the
# keyboard from whoever is using the computer.
#
# The panels are hidden on purpose. With the sidebar and the outline out of the
# way the document is the window, which is what makes the measurements in
# check-visual.mjs simple enough to trust.
#
# Usage: npm run qa:capture   (then npm run qa:check)
param(
    [string]$Exe = "src-tauri\target\release\verso.exe",
    [string]$Doc = "docs\qa\fixture.md",
    [string]$Second = "docs\qa\fixture-b.md",
    [string]$Out = "docs\qa"
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Exe)) { throw "binary not found: $Exe (run 'npm run tauri build')" }

Add-Type -AssemblyName System.Windows.Forms
. (Join-Path $PSScriptRoot 'lib\window.ps1')

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class QaWindow {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public static readonly IntPtr BOTTOM = new IntPtr(1);
  public const uint NOACTIVATE = 0x0010;
}
'@

$config = Join-Path $env:APPDATA 'com.verso.app'
$settingsFile = Join-Path $config 'settings.json'
$sessionFile = Join-Path $config 'session.json'
$backup = Join-Path $env:TEMP ("verso-qa-" + [System.Diagnostics.Process]::GetCurrentProcess().Id)
New-Item -ItemType Directory $backup -Force | Out-Null
foreach ($file in @($settingsFile, $sessionFile)) {
    if (Test-Path $file) { Copy-Item $file (Join-Path $backup (Split-Path $file -Leaf)) }
}

$docFull = (Resolve-Path $Doc).Path
$secondFull = (Resolve-Path $Second).Path
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
New-Item -ItemType Directory $Out -Force | Out-Null
# Only the photographs, not the picture the fixture points at: deleting that
# one made the document reference a file that was not there, and the run then
# measured a broken-image box while blaming the renderer.
Get-ChildItem $Out -Filter *.png -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne 'picture.png' } | Remove-Item -Force

# Wider than the screen is not a state anyone can be in, so the matrix is
# clamped to it rather than pretending.
$widths = @(1100, 1600, [Math]::Min(3440, $screen.Width)) | Sort-Object -Unique
$shots = @()

function Set-State([string]$theme, [bool]$split) {
    $settings = Get-Content $settingsFile -Raw | ConvertFrom-Json
    $settings.theme = $theme
    $settings.themeFile = $null
    # The measurements are about the document, so everything that is not the
    # document goes: the panels, the toolbar and the status strip. What is left
    # above the page is the tab strip, and below it nothing at all - which is
    # what lets check-visual.mjs find the page without guessing at chrome.
    $settings.showToolbar = $false
    $settings.showStatusStrip = $false
    $settings | ConvertTo-Json -Depth 8 | Out-File $settingsFile -Encoding utf8

    # Two different files on purpose: a tab already open is not opened twice,
    # so the same path in both panes leaves the second one empty and the split
    # state quietly photographs as a single pane.
    $tabs = @(@{ path = $docFull; cursor = 0; scrollPos = 0; scrollOffset = 0; pane = 0 })
    if ($split) { $tabs += @{ path = $secondFull; cursor = 0; scrollPos = 0; scrollOffset = 0; pane = 1 } }

    @{
        tabs        = $tabs
        activeIndex = 0
        split       = $split
        splitRatio  = 0.5
        sidebar     = @{ visible = $false; panel = 'files'; width = 260; outlineVisible = $false; outlineWidth = 240 }
        treeRoot    = $null
    } | ConvertTo-Json -Depth 8 | Out-File $sessionFile -Encoding utf8
}

try {
    foreach ($theme in @('light', 'dark')) {
        foreach ($layout in @('single', 'split')) {
            foreach ($width in $widths) {
                Get-Process verso -ErrorAction SilentlyContinue | Stop-Process -Force
                Start-Sleep -Milliseconds 700
                Remove-Item (Join-Path $config 'drafts\*.json') -Force -ErrorAction SilentlyContinue

                Set-State -theme $theme -split:($layout -eq 'split')

                & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'launch.ps1') | Out-Null
                Start-Sleep -Milliseconds 2200

                $found = Get-VersoWindow -TimeoutMs 8000
                if (-not $found) { throw "no window for $theme/$layout/$width" }

                [QaWindow]::SetWindowPos($found.Handle, [QaWindow]::BOTTOM, 0, 0, $width, $screen.Height, [QaWindow]::NOACTIVATE) | Out-Null
                # The webview relays out and repaints after a resize, and a
                # diagram is drawn after that again.
                Start-Sleep -Milliseconds 3000

                $name = "$theme-$layout-$width.png"
                & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'screenshot.ps1') -Out (Join-Path $Out $name) | Out-Null

                # The window takes the focus for a moment as it opens, and a
                # keystroke meant for something else lands in the document. A
                # draft on disk is the proof of it: clear it and take the
                # picture again rather than measuring someone's stray letter.
                if (Get-ChildItem (Join-Path $config 'drafts') -Filter *.json -ErrorAction SilentlyContinue) {
                    Write-Host "  (a keystroke landed in the document - retaking $name)"
                    Get-Process verso -ErrorAction SilentlyContinue | Stop-Process -Force
                    Remove-Item (Join-Path $config 'drafts\*.json') -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Milliseconds 700
                    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'launch.ps1') | Out-Null
                    Start-Sleep -Milliseconds 2200
                    $again = Get-VersoWindow -TimeoutMs 8000
                    [QaWindow]::SetWindowPos($again.Handle, [QaWindow]::BOTTOM, 0, 0, $width, $screen.Height, [QaWindow]::NOACTIVATE) | Out-Null
                    Start-Sleep -Milliseconds 3000
                    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'screenshot.ps1') -Out (Join-Path $Out $name) | Out-Null
                }
                $shots += [ordered]@{ file = $name; theme = $theme; layout = $layout; width = $width }
                Write-Host ("  captured {0}" -f $name)
            }
        }
    }

    $shots | ConvertTo-Json -Depth 5 | Out-File (Join-Path $Out 'manifest.json') -Encoding utf8
    Write-Host ("`n{0} states photographed into {1}" -f $shots.Count, $Out)
}
finally {
    Get-Process verso -ErrorAction SilentlyContinue | Stop-Process -Force
    foreach ($file in @($settingsFile, $sessionFile)) {
        $saved = Join-Path $backup (Split-Path $file -Leaf)
        if (Test-Path $saved) { Copy-Item $saved $file -Force }
    }
    Remove-Item $backup -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $config 'drafts\*.json') -Force -ErrorAction SilentlyContinue
    Write-Host "settings and session put back"
}
