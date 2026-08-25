# Generate mdview icons (Windows PowerShell)
# Creates icon-source.png (1024x1024), icon.png (512x512), icon.ico (256x256 PNG-embedded)

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

# --- 1. Generate 1024x1024 source PNG ---
$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Background: GitHub dark
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 36, 41, 47))
$g.FillRectangle($bg, 0, 0, $size, $size)

# Text "MD" in white, centered
$font = New-Object System.Drawing.Font ('Segoe UI', 480, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fg = [System.Drawing.Brushes]::White
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
$g.DrawString('MD', $font, $fg, $rect, $sf)

$bmp.Save("$PSScriptRoot\icon-source.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Created icon-source.png (1024x1024)"

# --- 2. Generate 512x512 icon.png ---
$bmp512 = New-Object System.Drawing.Bitmap 512, 512
$g2 = [System.Drawing.Graphics]::FromImage($bmp512)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.DrawImage($bmp, 0, 0, 512, 512)
$bmp512.Save("$PSScriptRoot\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Created icon.png (512x512)"

# --- 3. Generate 256x256 icon.ico (PNG-embedded format) ---
$bmp256 = New-Object System.Drawing.Bitmap 256, 256
$g3 = [System.Drawing.Graphics]::FromImage($bmp256)
$g3.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g3.DrawImage($bmp, 0, 0, 256, 256)

# Encode 256x256 as PNG into memory
$ms = New-Object System.IO.MemoryStream
$bmp256.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()
$ms.Dispose()

# Write ICO file (PNG-embedded, supported by Windows Vista+)
$icoPath = "$PSScriptRoot\icon.ico"
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter $fs

# ICO Header (6 bytes)
$bw.Write([uint16]0)      # Reserved
$bw.Write([uint16]1)      # Type: 1 = ICO
$bw.Write([uint16]1)      # Number of images

# Directory entry (16 bytes)
$bw.Write([byte]0)        # Width (0 = 256)
$bw.Write([byte]0)        # Height (0 = 256)
$bw.Write([byte]0)        # Color count
$bw.Write([byte]0)        # Reserved
$bw.Write([uint16]1)      # Color planes
$bw.Write([uint16]32)     # Bits per pixel
$bw.Write([uint32]$pngBytes.Length)  # Image data size
$bw.Write([uint32]22)     # Offset to image data (6 + 16)

# Image data (raw PNG bytes)
$bw.Write($pngBytes)

$bw.Close()
$fs.Close()
Write-Output "Created icon.ico (256x256 PNG-embedded)"

# --- Cleanup ---
$g.Dispose(); $g2.Dispose(); $g3.Dispose()
$bmp.Dispose(); $bmp256.Dispose(); $bmp512.Dispose()

Write-Output "`nDone. Note: icon.icns must be generated on macOS using 'sips' or img2icns."
