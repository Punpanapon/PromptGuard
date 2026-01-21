# PromptGuard Extension Build Script
Write-Host "🔧 Organizing Chrome Extension files..." -ForegroundColor Cyan

# Create extension_build folder
New-Item -ItemType Directory -Force -Path "extension_build" | Out-Null

# Chrome Extension files to move
$extensionFiles = @(
    "manifest.json",
    "content.js", 
    "styles.css",
    "popup.html",
    "popup.js"
)

# Move extension files
foreach ($file in $extensionFiles) {
    if (Test-Path $file) {
        Move-Item $file "extension_build\" -Force
        Write-Host "✅ Moved $file" -ForegroundColor Green
    }
}

# Move icons folder if it exists
if (Test-Path "icons") {
    Move-Item "icons" "extension_build\" -Force
    Write-Host "✅ Moved icons folder" -ForegroundColor Green
}

Write-Host ""
Write-Host "🎉 SUCCESS! Chrome Extension files organized." -ForegroundColor Green
Write-Host "📁 Load the 'extension_build' folder in Chrome Extensions" -ForegroundColor Yellow
Write-Host "🔗 Go to: chrome://extensions/ → Developer mode → Load unpacked" -ForegroundColor Yellow