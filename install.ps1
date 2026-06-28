Write-Host "Installing Arete..." -ForegroundColor Cyan

# 1. Backup your existing agent config (excluding node_modules)
if (Test-Path "$HOME\.pi\agent") {
    Write-Host "Backing up existing agent to agent.bak..." -ForegroundColor Yellow
    robocopy $HOME\.pi\agent $HOME\.pi\agent.bak /E /XD node_modules | Out-Null
}

# 2. Download Arete to a temporary folder and apply it
Write-Host "Downloading latest Arete..." -ForegroundColor Yellow
if (Test-Path "$HOME\.pi\arete_temp") {
    Remove-Item -Path "$HOME\.pi\arete_temp" -Recurse -Force
}
git clone https://github.com/asterxsk/arete.git "$HOME\.pi\arete_temp" --quiet
robocopy $HOME\.pi\arete_temp $HOME\.pi /E | Out-Null
Remove-Item -Path "$HOME\.pi\arete_temp" -Recurse -Force

Write-Host "Arete installed successfully! Please restart Pi to apply changes." -ForegroundColor Green
