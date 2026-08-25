# Generate icon.icns from icon-source.png (Windows PowerShell)
# ICNS format: "icns" magic + file size, then chunks of (type + size + PNG data)
# Type "ic09" = 512x512 PNG (macOS 10.7+)

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$src = "$PSScriptRoot\icon-source.png"
$dst = "$PSScriptRoot\icon.icns"

if (-not (Test-Path -LiteralPath $src)) {
    throw "Source PNG not found: $src. Run generate-icons.ps1 first."
}

# --- Generate 512x512 PNG ---
$src1024 = [System.Drawing.Image]::FromFile($src)
$bmp512 = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($bmp512)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src1024, 0, 0, 512, 512)
$g.Dispose()
$src1024.Dispose()

$ms = New-Object System.IO.MemoryStream
$bmp512.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()
$ms.Dispose()
$bmp512.Dispose()

# --- Build ICNS file ---
# Layout:
#   [0-3]   "icns" (4 bytes ASCII)
#   [4-7]   total file size, big-endian uint32
#   [8-11]  chunk type "ic09" (512x512 PNG)
#   [12-15] chunk size (8 header + PNG length), big-endian uint32
#   [16+]   PNG data
$chunkSize = 8 + $pngBytes.Length
$fileSize = 8 + $chunkSize

$fs = [System.IO.File]::Create($dst)
$bw = New-Object System.IO.BinaryWriter $fs

# Header
$bw.Write([byte[]] [char[]]'icns')     # magic
$bw.Write([uint32]$fileSize)            # file size BE
$bw.Write([byte[]] [char[]]'ic09')     # chunk type
$bw.Write([uint32]$chunkSize)           # chunk size BE
$bw.Write($pngBytes)                    # PNG data

$bw.Close()
$fs.Close()

$dstInfo = Get-Item -LiteralPath $dst
Write-Output "Created icon.icns ($([math]::Round($dstInfo.Length/1KB, 1)) KB)"
Write-Output "Note: macOS will read this as 512x512 icon. For multi-resolution, generate on macOS with 'sips' or img2icns."
