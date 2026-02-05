$frontendDir = Join-Path $PSScriptRoot "frontend"
$files = Get-ChildItem -Path $frontendDir -Filter "*.html" -Recurse
$count = 0

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw
    if ($content -match 'mobile-header\.js\?v=3') {
        $newContent = $content -replace 'mobile-header\.js\?v=3', 'mobile-header.js?v=4'
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        $count++
    }
}

Write-Host "$count files were modified."
