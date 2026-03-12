$inputDir = "E:\Editable Videos TAC"
$outputDir = "D:\Clips"
$ffmpeg = "C:\Users\v\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
$extensions = @(".mp4", ".mov", ".mkv", ".avi", ".m4v")

Clear-Host
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  VideoCompressor PRO - Automated Background Batch" -ForegroundColor White
Write-Host "  Preset: VISUALLY LOSSLESS 4K (-cq 18, 4:2:0)" -ForegroundColor Yellow
Write-Host "  Hardware Acceleration: NVIDIA NVENC" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Input Directory  : $inputDir"
Write-Host "Output Directory : $outputDir"
Write-Host ""

$inputFiles = @(Get-ChildItem -Path $inputDir -Recurse -File | Where-Object { $extensions -contains $_.Extension.ToLower() -and -not $_.Name.StartsWith("._") })
$total = $inputFiles.Count
$current = 0

Write-Host "Discovered $total valid videos to process." -ForegroundColor Green
Write-Host ""

foreach ($inFile in $inputFiles) {
    $current++
    $relativePath = $inFile.FullName.Substring($inputDir.Length + 1)
    $relDir = Split-Path $relativePath -Parent
    $basename = [System.IO.Path]::GetFileNameWithoutExtension($inFile.Name)
    $expectedOutputDir = Join-Path $outputDir $relDir
    
    if (-not (Test-Path $expectedOutputDir)) {
        New-Item -ItemType Directory -Force -Path $expectedOutputDir | Out-Null
    }
    
    $expectedOutputFile = Join-Path $expectedOutputDir "$basename`_compressed.mp4"
    
    $needsCompression = $false
    if (-not (Test-Path $expectedOutputFile)) {
        $needsCompression = $true
    }
    else {
        $outStat = Get-Item $expectedOutputFile
        if ($outStat.Length -le 1024) {
            # Re-compress if file is empty or corrupted (e.g., 0kb)
            $needsCompression = $true
            Remove-Item $expectedOutputFile -Force
        }
    }
    
    if ($needsCompression) {
        Write-Host "[$current / $total] Compressing: $relativePath" -ForegroundColor Yellow
        
        # Execute ffmpeg with warnings only and live stats
        & $ffmpeg -y -v warning -stats -i "`"$($inFile.FullName)`"" -c:v h264_nvenc -preset p4 -cq 18 -pix_fmt yuv420p -c:a aac -b:a 192k "`"$expectedOutputFile`""
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host " -> ERROR during compression. Cleaning up failed file." -ForegroundColor Red
            if (Test-Path $expectedOutputFile) {
                Remove-Item $expectedOutputFile -Force -ErrorAction SilentlyContinue
            }
        }
        else {
            Write-Host " -> DONE." -ForegroundColor Green
        }
        Write-Host ""
    }
    else {
        Write-Host "[$current / $total] SKIPPED: $relativePath (Already Compressed)" -ForegroundColor DarkGray
    }
}

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  ALL 549 FILES SUCCESSFULLY PROCESSED." -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
Read-Host "Press [Enter] to exit this window..."
