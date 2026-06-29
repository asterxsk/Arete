$esc = [char]0x1b

Write-Host "${esc}[1;38;5;208mInstalling Arete...${esc}[0m"

# 1. Backup your existing agent config (excluding node_modules)
if (Test-Path "$HOME\.pi\agent") {
    Write-Host "${esc}[1;37mBacking up existing agent to agent.bak...${esc}[0m"
    robocopy $HOME\.pi\agent $HOME\.pi\agent.bak /E /XD node_modules | Out-Null
}

# 2. Download Arete to a temporary folder and apply it
Write-Host "${esc}[1;37mDownloading latest Arete...${esc}[0m"
if (Test-Path "$HOME\.pi\arete_temp") {
    Remove-Item -Path "$HOME\.pi\arete_temp" -Recurse -Force
}
git clone https://github.com/asterxsk/arete.git "$HOME\.pi\arete_temp" --quiet
robocopy $HOME\.pi\arete_temp $HOME\.pi /E | Out-Null
Remove-Item -Path "$HOME\.pi\arete_temp" -Recurse -Force

Write-Host "${esc}[1;38;5;208mArete installed successfully! Please restart Pi to apply changes.${esc}[0m"
