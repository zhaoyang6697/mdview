# mdview 一键构建脚本(Windows PowerShell)
# 前提:Rust 已装(cargo 命令可用)
# 用法:在项目根目录运行 `powershell -ExecutionPolicy Bypass -File scripts\build.ps1`

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($msg) { Write-Output "`n=== $msg ===" -ForegroundColor Cyan }
function Ok($msg)   { Write-Output "  [OK] $msg" -ForegroundColor Green }
function Info($msg) { Write-Output "  [INFO] $msg" }

# 1. 环境检查
Step "1. 检查环境"
$rustOk = $true
try { $rustVer = cargo --version; Info "Rust: $rustVer" }
catch { Write-Output "  [ERROR] cargo 未找到。请先安装 Rust: https://rustup.rs/" -ForegroundColor Red; $rustOk = $false }

try { $tauriVer = cargo tauri --version; Info "Tauri CLI: $tauriVer" }
catch { Write-Output "  [WARN] Tauri CLI 未装,正在安装..." -ForegroundColor Yellow; cargo install tauri-cli --version "^2.0" }

if (-not $rustOk) { exit 1 }
Ok "环境就绪"

# 2. 验证代码完整性
Step "2. 验证项目文件"
node scripts/validate.js | Where-Object { $_ -match '\[FAIL\]' }
if ($LASTEXITCODE) { Write-Output "  [ERROR] 验证失败" -ForegroundColor Red; exit 1 }
Ok "所有文件验证通过"

# 3. 类型检查(Rust 侧)
Step "3. cargo check(类型检查,比 build 快)"
Set-Location src-tauri
cargo check 2>&1 | Tee-Object -Variable cargoOutput | Select-Object -Last 10
if ($LASTEXITCODE) { Write-Output "  [ERROR] cargo check 失败" -ForegroundColor Red; exit 1 }
Set-Location $root
Ok "Rust 代码编译通过"

# 4. 编译发布版
Step "4. cargo tauri build(编译 .exe / 安装包)"
cargo tauri build 2>&1 | Tee-Object -Variable buildOutput | Select-Object -Last 20
if ($LASTEXITCODE) { Write-Output "  [ERROR] cargo tauri build 失败" -ForegroundColor Red; exit 1 }
Ok "编译成功"

# 5. 报告产物
Step "5. 产物"
$nsisDir = "src-tauri\target\release\bundle\nsis"
$msiDir  = "src-tauri\target\release\bundle\msi"
$exe     = "src-tauri\target\release\mdview.exe"

if (Test-Path -LiteralPath $exe) {
    $size = [math]::Round((Get-Item -LiteralPath $exe).Length / 1MB, 2)
    Ok "单文件 exe: $exe ($size MB)"
}
if (Test-Path -LiteralPath $nsisDir) {
    Get-ChildItem -LiteralPath $nsisDir -Filter "*.exe" | ForEach-Object {
        $size = [math]::Round($_.Length / 1MB, 2)
        Ok "NSIS 安装包: $($_.FullName) ($size MB)"
    }
}
if (Test-Path -LiteralPath $msiDir) {
    Get-ChildItem -LiteralPath $msiDir -Filter "*.msi" | ForEach-Object {
        $size = [math]::Round($_.Length / 1MB, 2)
        Ok "MSI 安装包: $($_.FullName) ($size MB)"
    }
}

Write-Output "`n=== 完成 ===" -ForegroundColor Green
Write-Output "把上面的 .exe 文件分发给用户即可,无需安装任何运行时。"
