# Build the real portable ZIP: a folder you can extract and run, no installer.
# Usage (from apps/desktop): powershell -ExecutionPolicy Bypass -File scripts/make-portable-zip.ps1
# Prerequisite: pnpm dist:dir has produced dist/win-unpacked.

$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
$unpacked = Join-Path $appRoot 'dist\win-unpacked'
$exe = Join-Path $unpacked 'Sill.exe'
if (-not (Test-Path $exe)) {
    throw "找不到 $exe；先运行 pnpm dist:dir"
}

$stage = Join-Path $env:TEMP "sill-portable-$version"
$appDir = Join-Path $stage 'Sill'
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

Copy-Item -Path (Join-Path $unpacked '*') -Destination $appDir -Recurse -Force
Remove-Item (Join-Path $appDir 'Sill-data') -Recurse -Force -ErrorAction SilentlyContinue

# 这是 paths.ts 识别“目录版绿色包”的标记；有它才把数据写到 Sill-data。
Set-Content -Path (Join-Path $appDir 'portable.flag') -Value 'Sill portable build' -Encoding ASCII

$readme = @(
    'Sill 绿色版（免安装）',
    '====================',
    '',
    '1. 把整个 Sill 文件夹解压到任意可写目录（不要放 Program Files）。',
    '2. 双击 Sill.exe 运行。',
    '3. 设置、待办、布局、天气缓存会保存在同目录的 Sill-data 文件夹。',
    '4. 卸载：设置 → 通用 → 数据与卸载 → 「卸载 Sill…」，程序退出后会删除整个文件夹；',
    '   也可以退出 Sill 后直接删掉整个文件夹。数据都在 Sill-data 里，会一起删除；',
    '   想留待办和设置的话，先把 Sill-data 复制出去。绿色版不写注册表卸载项。',
    '',
    '注意：程序未签名，Windows SmartScreen 首次可能提示，选择“更多信息 → 仍要运行”。'
) -join [Environment]::NewLine
Set-Content -Path (Join-Path $appDir 'README.txt') -Value $readme -Encoding UTF8

$out = Join-Path $appRoot "dist\Sill-$version-portable-win64.zip"
if (Test-Path $out) { Remove-Item -Force $out }
Compress-Archive -Path $appDir -DestinationPath $out -CompressionLevel Optimal

Write-Host "portable zip: $out"
Write-Host ("size: {0:N1} MB" -f ((Get-Item $out).Length / 1MB))
