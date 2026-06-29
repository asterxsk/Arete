#!/bin/bash
set -e

echo -e "\033[1;38;5;208mInstalling Arete...\033[0m"

# 1. Backup your existing agent config (excluding node_modules)
if [ -d "$HOME/.pi/agent" ]; then
    echo -e "\033[1;37mBacking up existing agent to agent.bak...\033[0m"
    rsync -a --exclude 'node_modules' "$HOME/.pi/agent/" "$HOME/.pi/agent.bak/"
fi

# 2. Download Arete to a temporary folder and apply it
echo -e "\033[1;37mDownloading latest Arete...\033[0m"
rm -rf "$HOME/.pi/arete_temp"
git clone https://github.com/asterxsk/arete.git "$HOME/.pi/arete_temp" --quiet
rsync -a "$HOME/.pi/arete_temp/" "$HOME/.pi/"
rm -rf "$HOME/.pi/arete_temp"

echo -e "\033[1;38;5;208mArete installed successfully! Please restart Pi to apply changes.\033[0m"
