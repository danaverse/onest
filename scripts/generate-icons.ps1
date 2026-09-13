# Regenerates the Onest paw raster assets from the canonical vector geometry:
#   - public/images/paw-192.png, paw-512.png  (PWA / touch icons, dark badge)
#   - public/images/og.png (+ vi/zh copies)    (1200x630 share banner)
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
#
# The paw uses the same 24x24 viewBox as BrandMark.tsx / paw-icon.svg, shifted
# +0.25 on Y so the glyph is optically centered (toes were tight to the top,
# pad floated above the bottom).

Add-Type -AssemblyName System.Drawing

$OutDir = Join-Path $PSScriptRoot "..\apps\web\public\images"
# The glyph bounds are x 2.5..22.5 / y 2.5..21 in the 24x24 viewBox, so it is
# 0.5 right and 0.25 high of center; shifting brings it to optical center.
$ShiftX = -0.5
$ShiftY = 0.25
$PawColor = [System.Drawing.Color]::FromArgb(255, 245, 158, 11)
$BadgeColor = [System.Drawing.Color]::FromArgb(255, 18, 18, 20)
$OgBg = [System.Drawing.Color]::FromArgb(255, 31, 25, 21)

function New-PawPath {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pts = @(
        @(12, 10.5), @(8.5, 10.5), @(5.5, 12.7), @(5.5, 16),
        @(5.5, 18.8), @(8, 21), @(12, 21),
        @(16, 21), @(18.5, 18.8), @(18.5, 16),
        @(18.5, 12.7), @(15.5, 10.5), @(12, 10.5)
    )
    $p.AddBezier($pts[0][0] + $ShiftX, $pts[0][1] + $ShiftY, $pts[1][0] + $ShiftX, $pts[1][1] + $ShiftY, $pts[2][0] + $ShiftX, $pts[2][1] + $ShiftY, $pts[3][0] + $ShiftX, $pts[3][1] + $ShiftY)
    $p.AddBezier($pts[3][0] + $ShiftX, $pts[3][1] + $ShiftY, $pts[4][0] + $ShiftX, $pts[4][1] + $ShiftY, $pts[5][0] + $ShiftX, $pts[5][1] + $ShiftY, $pts[6][0] + $ShiftX, $pts[6][1] + $ShiftY)
    $p.AddBezier($pts[6][0] + $ShiftX, $pts[6][1] + $ShiftY, $pts[7][0] + $ShiftX, $pts[7][1] + $ShiftY, $pts[8][0] + $ShiftX, $pts[8][1] + $ShiftY, $pts[9][0] + $ShiftX, $pts[9][1] + $ShiftY)
    $p.AddBezier($pts[9][0] + $ShiftX, $pts[9][1] + $ShiftY, $pts[10][0] + $ShiftX, $pts[10][1] + $ShiftY, $pts[11][0] + $ShiftX, $pts[11][1] + $ShiftY, $pts[12][0] + $ShiftX, $pts[12][1] + $ShiftY)
    $p.CloseFigure()
    foreach ($c in @(@(5, 8), @(10, 5), @(15, 5), @(20, 8))) {
        $p.AddEllipse(($c[0] - 2.5 + $ShiftX), ($c[1] - 2.5 + $ShiftY), 5, 5)
    }
    return $p
}

function Draw-Paw {
    param($g, [double]$centerX, [double]$centerY, [double]$scale)
    $state = $g.Save()
    $g.TranslateTransform($centerX, $centerY)
    $g.ScaleTransform($scale, $scale)
    $g.TranslateTransform(-12, -12)
    $path = New-PawPath
    $brush = New-Object System.Drawing.SolidBrush($PawColor)
    $g.FillPath($brush, $path)
    $brush.Dispose()
    $path.Dispose()
    $g.Restore($state)
}

function Save-Png($bitmap, $name) {
    $path = Join-Path $OutDir $name
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "wrote $name"
}

function New-Icon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $margin = [Math]::Round($size * 0.026)
    $r = ($size / 2.0) - $margin
    $badge = New-Object System.Drawing.SolidBrush($BadgeColor)
    $g.FillEllipse($badge, ($size / 2.0 - $r), ($size / 2.0 - $r), ($r * 2), ($r * 2))
    $badge.Dispose()

    # Paw width is 20 viewBox units; use ~66% of the canvas so the paw sits
    # small and cute inside the badge with a soft dark gap (was 0.830, which
    # filled the badge edge to edge). Keep in sync with generate-icons.py.
    Draw-Paw $g ($size / 2.0) ($size / 2.0) ($size * 0.660 / 20.0)
    $g.Dispose()
    return $bmp
}

function New-Og {
    $w = 1200; $h = 630
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $bg = New-Object System.Drawing.SolidBrush($OgBg)
    $g.FillRectangle($bg, 0, 0, $w, $h)
    $bg.Dispose()

    # Warm halo behind the paw: a single smooth radial gradient (not stacked
    # circles, which accumulate alpha into a bright blob).
    $cx = $w / 2.0; $cy = $h / 2.0
    $maxR = 300.0
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(($cx - $maxR), ($cy - $maxR), ($maxR * 2), ($maxR * 2))
    $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glow.CenterColor = [System.Drawing.Color]::FromArgb(30, 245, 158, 11)
    $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 245, 158, 11))
    $glow.CenterPoint = New-Object System.Drawing.PointF($cx, $cy)
    $g.FillPath($glow, $glowPath)
    $glow.Dispose()
    $glowPath.Dispose()

    Draw-Paw $g $cx $cy (170.0 / 20.0)
    $g.Dispose()
    return $bmp
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$icon192 = New-Icon 192
Save-Png $icon192 "paw-192.png"
$icon192.Dispose()

$icon512 = New-Icon 512
Save-Png $icon512 "paw-512.png"
$icon512.Dispose()

$og = New-Og
Save-Png $og "og.png"
Save-Png $og "og-vi.png"
Save-Png $og "og-zh.png"
$og.Dispose()

Write-Host "done"
