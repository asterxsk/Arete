# Extensions

Each subfolder is a self-contained pi extension. Pi auto-loads any
`extensions/<name>/index.ts` (or `extensions/<name>/package.json` with a
`pi.extensions` field).

## Layout

```
extensions/
├── compactui/              <- Compact tool rendering: orange tool names,
│                              args truncation, pipe-framed expanded
│                              output, diff colors, duration tracking
├── commandcode-provider/   <- Command Code provider: Claude, GPT, Gemini,
│                              DeepSeek, and other models with OAuth
│                              login and per-model pricing
├── context/                <- /context overlay: token grid breakdown
│                              with per-category color-coded visualization
├── filechanges/            <- /filechanges overlay + accept/decline;
│                              tracks file modifications per session
│                              and exposes counts for the statusline
├── goal/                   <- /goal command — autonomous task orchestrator
│                              with pause/resume, turn tracking, history
├── header/                 <- Banner header: ASCII art on the left,
│                              provider/model/version info panel on
│                              the right
├── md-link/                <- /link-md, /unlink-md, /send-diff — link a
│                              .md file for collaborative editing
├── powershell/             <- powershell tool (LLM-callable) with
│                              compactui-style rendering
├── profile-switcher/       <- /profile command — multi-account auth
│                              switching with OAuth and API key profiles
├── prompt/                 <- Custom system instructions: shell preference,
│                              task tracking, caveman mode, no emojis
├── questions/              <- questions tool (multi-choice TUI with
│                              custom-answer fallback and ASCII sketches)
├── spinner-phrases/        <- Animated star spinner with orange glow
│                              effect and fun Claude Code-style phrases
├── statusline/             <- Footer status line (left to right):
│                              provider, model, context bar,
│                              file changes counts; auto-refreshes
├── subagents/              <- the `subagent` tool + /sub command: spawn
│                              isolated pi processes with predefined
│                              agent .md files; duration hidden while running
├── tasks/                  <- /manage_task command — background terminal
│                              task runner with output capture, wait,
│                              cancel; persists across sessions
├── timers/                 <- /schedule command — one-shot and repeating
│                              timers with notifications, auto-delete
│                              on fire, and overlay browser
├── todo/                   <- todo tool + /todos command — structured
│                              task list with status tracking, categories,
│                              reminders, and persistent overlay widget
└── video-extract/          <- video_extract tool: YouTube + local video
                               content extraction via Gemini API, ffmpeg,
                               and yt-dlp
```

## Modular design

Each extension folder is **independent** — no extension imports from a
sibling. Cross-extension integration is through:

1. **`globalThis` bridges** for runtime data that extensions produce and
   consume:
   - `globalThis.__pi_copilot_usage` — set by `context/copilot-usage.ts`,
     read by any extension that wants the current Copilot quota
   - `globalThis.__pi_goal_state` / `__pi_timer_state` /
     `__pi_task_state` / `__pi_subagents` — each toolkit extension persists
     state across session compacts independently
   - `globalThis.__pi_filechanges_counts` — file modification counts
     exposed by `filechanges/` for `statusline/` to display
   - Bridge keys are prefixed with `__pi_` and unique per extension

2. **System prompt injection** via `globalThis.__pi_extension_features`.
   Every extension registers its name, description, commands, tools, and
   shortcuts at load time. The core pi runtime collects these and
   injects them as a `## Loaded Extensions` section into the system prompt
   at the start of every agent turn, so the LLM always knows what's
   available.

3. **UI primitives on `ctx.ui`**: `setHeader`, `setFooter`, `setWidget`,
   `notify`, `custom`, `select`, `input`. Extensions don't talk to each
   other directly — they each register commands, tools, and widgets
   independently.

4. **Graceful degradation**: When an extension's peer is missing, it
   degrades gracefully (e.g. `subagents/` says "subagent extension is
   not loaded" if its dependencies are missing). Widgets and commands from
   other extensions continue working.

5. **Self-contained rendering**: Extensions that need tool-result rendering
   include their own `CompactToolBox` / `CompactResult` component rather
   than importing from a shared extension. This avoids tight coupling
   between extensions.

### Feature Registration Pattern

To make the LLM aware of a new extension, add a registration call at the
top of its `default export` function:

```ts
export default function (pi: ExtensionAPI) {
  (globalThis as any).__pi_extension_features?.push({
    name: "my-extension",
    description: "What it does — shown in system prompt",
    commands: ["/cmd1"],
    tools: ["tool1"],
    shortcuts: ["Ctrl+X"],
  });
  // ... rest
}
```

The core pi runtime reads `globalThis.__pi_extension_features` and
injects it as a `## Loaded Extensions` section at the bottom of the system
prompt before every agent turn.

## Adding a new extension

Every new extension **must** follow the folder + README convention:

1. Create a new folder `extensions/<name>/`
2. Add an `index.ts` with a default export that receives `pi: ExtensionAPI`
3. Add a `README.md` explaining purpose, API surface, and how to remove
4. **Update this README** — add your folder to the Layout tree above

```
extensions/my-thing/
├── index.ts        <- default export, gets `pi: ExtensionAPI`
├── package.json    <- (optional) if you have npm dependencies
└── README.md       <- one-page purpose, what it does, how to remove it
```

If you need npm deps, add `"pi": { "extensions": ["./index.ts"] }` to
`package.json` and run `npm install` inside the extension folder.

## Removing an extension

Delete the folder. The tool/command/shortcut/widget it registered
disappears. Other extensions degrade gracefully when a peer is missing
(e.g. `subagents/` says "subagent extension is not loaded" if its
dependencies are missing).
