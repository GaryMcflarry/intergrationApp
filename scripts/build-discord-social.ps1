param([string]$SdkPath = (Join-Path $PSScriptRoot '../dist/discord-sdk'))
$ErrorActionPreference = 'Stop'
$sdk = (Resolve-Path -LiteralPath $SdkPath).Path
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$header = Join-Path $sdk 'include/discordpp.h'
$library = Join-Path $sdk 'lib/release/discord_partner_sdk.lib'
$runtime = Join-Path $sdk 'bin/release/discord_partner_sdk.dll'
foreach($file in @($header,$library,$runtime)){if(-not (Test-Path -LiteralPath $file)){throw "Missing SDK file: $file"}}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(-not $vs){throw 'Visual Studio C++ x64 build tools are required'}
$vcvars = Join-Path $vs 'VC/Auxiliary/Build/vcvars64.bat'
$out = Join-Path $root 'dist/discord-social'
New-Item -ItemType Directory -Path $out -Force | Out-Null
$source = Join-Path $root 'native/discord-social/main.cpp'
$include = Join-Path $sdk 'include'
# All paths are resolved locally; reject command-shell metacharacters before writing the build command.
foreach($value in @($vcvars,$source,$include,$library,$out)){if($value -match '["%&|<>^!\r\n]'){throw 'Unsupported character in build path'}}
$buildFile = Join-Path $out 'build.cmd'
@"
@echo off
call "$vcvars" >nul
if errorlevel 1 exit /b %errorlevel%
cl /nologo /std:c++20 /EHsc /O2 /MD /utf-8 /I"$include" "$source" "$library" /Fo"$out\social.obj" /Fe"$out\astrum-discord-social.exe" /link /INCREMENTAL:NO
"@ | Set-Content -LiteralPath $buildFile -Encoding ascii
& cmd.exe /d /c $buildFile
if($LASTEXITCODE -ne 0){throw "Discord helper build failed ($LASTEXITCODE)"}
Copy-Item -LiteralPath $runtime -Destination (Join-Path $out 'discord_partner_sdk.dll') -Force
Write-Output "Built $out/astrum-discord-social.exe"
