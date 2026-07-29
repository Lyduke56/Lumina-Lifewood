$files = @("IDENTITY.md","SOUL.md","AGENTS.md","SKILL.md")
$basePath = "c:\Users\X1 Carbon Gen9\Desktop\Lifewood\Lumina-Lifewood\lumina\openclaw"

wsl -e bash -c "mkdir -p ~/.openclaw/workspace/"

foreach ($file in $files) {
    $path = Join-Path $basePath $file
    if (Test-Path $path) {
        Write-Host "Syncing $file..."
        Get-Content -Raw -Encoding UTF8 $path | wsl -e bash -c "tee ~/.openclaw/workspace/$file > /dev/null"
        Write-Host "✅ Synced $file"
    } else {
        Write-Host "⚠️ File not found: $path"
    }
}

Write-Host "Restarting OpenClaw gateway..."
wsl -e bash -c "systemctl --user restart openclaw-gateway"
Write-Host "✅ Done!"
