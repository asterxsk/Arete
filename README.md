<div align="center">
  <h1>Arete</h1>
  <p><strong>A powerful, modular collection of extensions for the Pi Agent</strong></p>
  
  <img src="https://img.shields.io/badge/version-v3.4.2-orange.svg" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/platform-Pi_Agent-success.svg" alt="Platform" />
</div>

---

## <img src="https://api.iconify.design/octicon/book-24.svg?color=white" width="20" height="20" alt="Overview Icon" /> Overview

**Arete** supercharges your Pi Agent with a suite of advanced capabilities, rich UI components, and background orchestrations. Designed with strict modularity in mind, every extension is fully self-contained yet seamlessly integrates to build a cohesive, powerful coding assistant environment.

## <img src="https://api.iconify.design/octicon/star-24.svg?color=white" width="20" height="20" alt="Features Icon" /> Key Features

*   <img src="https://api.iconify.design/octicon/package-dependencies-16.svg?color=white" width="16" height="16" /> **Strict Modularity**: Extensions live in independent folders. Add or delete them at will—if an extension is missing, peer extensions gracefully degrade without crashing the agent.
*   <img src="https://api.iconify.design/octicon/cpu-16.svg?color=white" width="16" height="16" /> **LLM Awareness**: Arete dynamically injects its loaded capabilities into `globalThis.__pi_extension_features`, ensuring the LLM always knows exactly what tools and features are available.
*   <img src="https://api.iconify.design/octicon/globe-16.svg?color=white" width="16" height="16" /> **Global State Bridges**: Extensions share runtime data safely across boundaries, keeping states synchronized completely independently of the main thread.
*   <img src="https://api.iconify.design/octicon/paintbrush-16.svg?color=white" width="16" height="16" /> **Shared UI Primitives**: Extensions independently register UI components (headers, footers, widgets) to create a beautiful, unified Terminal User Interface (TUI).
*   <img src="https://api.iconify.design/octicon/sync-16.svg?color=white" width="16" height="16" /> **Built-in Auto Updater**: Arete tracks its own version. When a new update is pushed to GitHub, your header will notify you, and a simple `/update` command will seamlessly pull the latest features.

## <img src="https://api.iconify.design/octicon/package-24.svg?color=white" width="20" height="20" alt="Extensions Icon" /> Included Extensions

Arete comes packed with a robust toolkit. Some highlights include:

*   **`header`**: A gorgeous ASCII-art banner that dynamically tracks your LLM provider, current model, working directory, and Arete version updates.
*   **`perms`**: A built-in permissions manager. Type `/extensions` to visually toggle extensions on or off, or use `/plan` to enter a read-only architecture mode.
*   **`goal`**: Set long-running objectives for Pi to relentlessly pursue.
*   **`pi-hermes-memory`**: Advanced contextual memory injection.
*   **`video-extract`**, **`tasks`**, **`timers`**, **`todo`**, **`compactui`**, and many more!

## <img src="https://api.iconify.design/octicon/download-24.svg?color=white" width="20" height="20" alt="Download Icon" /> Installation & Quickstart

To install Arete into your local Pi Agent environment, simply clone it into your Pi directory.

### 1. Windows

Open PowerShell and run the following commands:

```powershell
# 1. Backup your existing agent config (excluding node_modules)
robocopy $HOME\.pi\agent $HOME\.pi\agent.bak /E /XD node_modules | Out-Null

# 2. Delete the old agent folder so git can clone cleanly
Remove-Item -Path $HOME\.pi\agent -Recurse -Force

# 3. Clone Arete directly into your Pi directory
git clone https://github.com/asterxsk/arete.git $HOME\.pi\agent
```

### 2. Linux and Mac

Open your terminal and run the following commands:

```bash
# 1. Backup your existing agent config (excluding node_modules)
rsync -a --exclude 'node_modules' ~/.pi/agent/ ~/.pi/agent.bak/

# 2. Delete the old agent folder so git can clone cleanly
rm -rf ~/.pi/agent

# 3. Clone Arete directly into your Pi directory
git clone https://github.com/asterxsk/arete.git ~/.pi/agent
```

### Configuration

Add the following to your Pi `settings.json` (located at `~/.pi/settings.json`):

```json
{
  "retry": {
    "provider": { "timeoutMs": 600000 }
  },
  "packages": [
    "npm:pi-web-access",
  ],
  "hideThinkingBlock": false,
  "quietStartup": true,
  "doubleEscapeAction": "tree",
  "theme": "arete",
  "defaultThinkingLevel": "medium",
  "collapseChangelog": true,
  "followUpMode": "one-at-a-time",
  "themes": [ "themes" ],
  "extensions": [ "extensions/" ],
  "editorPaddingX": 1,
  "treeFilterMode": "no-tools",
  "terminal": { "showTerminalProgress": true },
  "compaction": { "enabled": true },
  "enableSkillCommands": true,
  "defaultProjectTrust": "always"
}
```

### External Packages & Skills

To get the absolute most out of Arete, we recommend installing the following external packages and skills:

**Packages:**
```bash
pi install npm:pi-web-access
```

**Skills:**
```bash
npx skills add browser-use/browser-harness
npx skills add https://github.com/juliusbrussee/caveman --skill caveman
npx skills add https://github.com/mattpocock/skills --skill grill-me
npx skills add https://github.com/nutlope/hallmark --skill hallmark
npx skills add obra/superpowers
```

## <img src="https://api.iconify.design/octicon/terminal-24.svg?color=white" width="20" height="20" alt="Terminal Icon" /> Usage

Arete extensions register custom slash commands directly into Pi's chat interface. 

*   Type `/extensions` to open the visual Extension Manager.
*   Type `/plan` to toggle Plan Mode (prevents the agent from executing write commands).
*   Type `/update` to pull the latest Arete features when an update is available.
*   Type `/help` to see all available commands provided by Arete extensions.

---
<div align="center">
  <i>Empowering Pi Agent with modular excellence.</i>
</div>
