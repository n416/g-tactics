$ErrorActionPreference = "Continue"

$sourceDir = Join-Path $PSScriptRoot "..\tmp-unit-images\production\out"
$publicDir = Join-Path $PSScriptRoot "..\frontend\public\images\units"

if (!(Test-Path $sourceDir)) {
    Write-Host "Source directory does not exist: $sourceDir" -ForegroundColor Red
    exit
}
if (!(Test-Path $publicDir)) {
    Write-Host "Public directory does not exist: $publicDir" -ForegroundColor Red
    exit
}

$files = Get-ChildItem -Path $sourceDir -Filter *.png
$uploadList = @()

foreach ($f in $files) {
    $targetFile = Join-Path $publicDir $f.Name
    if (!(Test-Path $targetFile)) {
        $uploadList += $f
    } else {
        $sourceItem = Get-Item $f.FullName
        $targetItem = Get-Item $targetFile
        if ($sourceItem.LastWriteTime -gt $targetItem.LastWriteTime) {
            $uploadList += $f
        }
    }
}

if ($uploadList.Count -eq 0) {
    Write-Host "No new or updated images found." -ForegroundColor Green
    exit
}

Write-Host "Found $($uploadList.Count) new or updated images. Starting sync..." -ForegroundColor Cyan

foreach ($f in $uploadList) {
    $name = $f.Name
    Write-Host "Uploading $name to R2..."
    $cmd = "npx wrangler r2 object put `"g-tactics-assets/units/$name`" --remote --file `"$($f.FullName)`" --content-type `"image/png`""
    cmd.exe /c $cmd
    
    # R2へのアップロードが成功したらローカルのpublicフォルダにもコピーする
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Copying $name to local public folder..."
        Copy-Item -Path $f.FullName -Destination $publicDir -Force
    } else {
        Write-Host "Failed to upload $name" -ForegroundColor Red
    }
}

Write-Host "Sync completed!" -ForegroundColor Green
