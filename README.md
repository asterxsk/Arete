
# arete

This repository contains a powerful, modular collection of extensions for the Pi Agent. Each extension is designed to be fully self-contained while seamlessly integrating with the agent to provide enhanced capabilities, rich UI components, and advanced background orchestrations.

## Installation

```bash
# Backup your existing agent config
cp -r ~/.pi/agent ~/.pi/agent.bak

# Clone or update the agent folder from GitHub
git clone <your-repo-url> ~/.pi/agent
```

> Make sure `~/.pi/agent` is the target — the extensions live inside `agent/extensions/`.

### External Packages
You can also enhance Pi Agent by installing external packages:
```bash
pi install npm:pi-web-access
pi install npm:pi-hermes-memory
```

### Recommended Skills
You can install these recommended skills to further expand the agent's capabilities:
```bash
npx skills add browser-use/browser-harness
npx skills add https://github.com/juliusbrussee/caveman --skill caveman
npx skills add https://github.com/mattpocock/skills --skill grill-me
npx skills add https://github.com/nutlope/hallmark --skill hallmark
npx skills add obra/superpowers
```

## Quickstart

Add the following to your `settings.json` (located at `~/.pi/settings.json`):

```json
{
  "defaultModel": "xiaomi/mimo-v2.5",
  "defaultProvider": "commandcode",
  "retry": {
    "provider": {
      "timeoutMs": 600000
    }
  },
  "lastChangelogVersion": "0.80.2",
  "packages": [
    "npm:pi-web-access",
    "npm:pi-hermes-memory"
  ],
  "hideThinkingBlock": false,
  "quietStartup": true,
  "doubleEscapeAction": "tree",
  "theme": "arete",
  "defaultThinkingLevel": "medium",
  "collapseChangelog": true,
  "followUpMode": "one-at-a-time",
  "themes": [
    "themes"
  ],
  "extensions": [
    "extensions/"
  ],
  "editorPaddingX": 1,
  "treeFilterMode": "no-tools",
  "terminal": {
    "showTerminalProgress": true
  },
  "compaction": {
    "enabled": true
  },
  "enableSkillCommands": true,
  "defaultProjectTrust": "always"
}
```

## Extensions

### UI & Presentation
* **BetterUI** (`betterui/`): Provides compact, tree-style tool renderers for commands (bash, read, write, edit, grep, find, ls) and improves custom user-message appearance.
* **Statusline** (`statusline/`): A dynamic footer that displays the active provider, model, token usage meter (color-coded for capacity), and active session events.
* **Header Bar** (`header/`): Adds a sleek banner header featuring ASCII art, a provider/model/version info panel, and a skills widget.
* **Spinner Phrases** (`spinner-phrases/`): A dynamic, tool-aware loading spinner with gerund phrases and glow effects.

### Task & Goal Orchestration
* **Goal Manager** (`goal/`): The `/goal` command launches an autonomous task orchestrator with pause/resume functionality and turn tracking.
* **Background Tasks** (`tasks/`): A background terminal task runner (`/tasks`) with output capture, wait/cancel states, and session persistence.
* **Todos** (`todos/`): A structured task list with categories, reminders, a browse overlay, and a compact nerd-font widget.
* **Timers** (`timers/`): One-shot and repeating timers featuring browser overlays and auto-delete upon firing.

### Agent & Context Management
* **Subagents** (`subagents/`): Exposes the `subagent` tool allowing the main agent to spawn and communicate with isolated Pi processes.
* **Agent Discovery** (`agents/`): The `/agents` command for discovering and organizing agent teams and chains.
* **Context Meter** (`context/`): An overlay that provides a grid breakdown of tokens and tracks Copilot usage quotas via `globalThis.__pi_copilot_usage`.
* **File Changes** (`filechanges/`): Tracks file modifications across the session, powers a `/filechanges` accept/decline overlay, and feeds counts to the statusline.

### Tooling & Search
* **PowerShell** (`powershell/`): Exposes PowerShell as an LLM-callable tool natively.
* **MD-Link** (`md-link/`): Enables collaborative `.md` file editing with commands `/link-md`, `/unlink-md`, and `/send-diff`.
* **Questions API** (`questions/`): A multi-choice Text UI tool that allows the agent to prompt the user with options and custom fallbacks.
* **Google Image Search** (`google-image-search/`): A `google_image_search` tool for querying images via Google.
* **YouTube Search** (`youtube-search/`): A `youtube_search` tool for querying YouTube videos.
* **Video Extract** (`video-extract/`): A `video_extract` tool for extracting content from videos.

### Core Providers & Auth
* **CommandCode Provider** (`commandcode-provider/`): A multi-model provider supporting Claude, GPT, Gemini, and DeepSeek with built-in auth flows.
* **Profile Switcher** (`profile-switcher/`): A tool to seamlessly hot-swap between multiple authenticated accounts.

### Reference (Disabled)
* **tmp/** (`tmp/`): Contains old design references (`*.reference.ts`). The `.reference.ts` suffix prevents Pi from loading these files. Do not import from them in production extensions.

---

## Architecture & Modular Design

The extension system is designed to be robust and plug-and-play:

1. **True Independence**: Extensions reside in independent folders. If you delete a folder, its commands, tools, and widgets disappear gracefully. Other extensions that rely on missing peers degrade without crashing the agent.
2. **Global State Bridges**: Extensions share runtime data via `globalThis` bridges (e.g., `__pi_copilot_usage`, `__pi_goal_state`, `__pi_todo_state`, `__pi_timer_state`, `__pi_task_state`, `__pi_subagents`) ensuring states are kept synchronized independently of the main thread.
3. **LLM Awareness**: Using the Feature Registration Pattern, each extension injects its capabilities (tools, commands, descriptions) into `globalThis.__pi_extension_features`. The `agents/` extension compiles this into a `## Loaded Extensions` section in the system prompt, so the LLM is always aware of what extensions are loaded.
4. **Shared UI Primitives**: Extensions independently register UI components using context APIs (`ctx.ui.setHeader`, `ctx.ui.setFooter`, `ctx.ui.setWidget`), ensuring the interface remains composable.
5. **Shared Components**: Extensions that need consistent tool-result rendering can import `CompactToolBox` and `emptyComponent` from `betterui/index.js`.

## Adding a New Extension

1. Create a new folder `extensions/<name>/`
2. Add an `index.ts` with a `default export` that receives `pi: ExtensionAPI`.
3. Add a `README.md` explaining purpose, API surface, and how to remove it.
4. **Update this README** — add your folder to the Extensions section above.
5. Inform the LLM of your extension using the Registration Pattern:
   ```ts
   export default function (pi: ExtensionAPI) {
     (globalThis as any).__pi_extension_features?.push({
       name: "my-extension",
       description: "Description shown in the system prompt",
       commands: ["/my-command"],
       tools: ["my-tool"],
       shortcuts: ["Ctrl+X"],
     });
   }
   ```
6. If your extension requires external `npm` dependencies, configure `"pi": { "extensions": ["./index.ts"] }` in a local `package.json` and run `npm install`.

## Removing an Extension

Delete the folder. The tool/command/shortcut/widget it registered disappears. Other extensions degrade gracefully when a peer is missing (e.g., the `/agents` command says "subagent extension is not loaded" if you delete `subagents/`).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
