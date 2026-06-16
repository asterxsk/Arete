# Extensions

Each subfolder is a self-contained pi extension. Pi auto-loads any
`extensions/<name>/index.ts` (or `extensions/<name>/package.json` with a
`pi.extensions` field).

## Layout

```
extensions/
├── agents/                 <- /agents command + agent/team/chain discovery
├── betterui/               <- Compact tree-style tool renderers for bash,
│                              read, write, edit, grep, find, ls, and
│                              custom user-message appearance
├── commandcode-provider/   <- Command Code provider: Claude, GPT, Gemini,
│                              DeepSeek models, with auth flow
├── context/                <- /context overlay: token grid breakdown
│   └── copilot-usage.ts    <- fetches + caches the Copilot usage meter;
│                              exposes it via globalThis.__pi_copilot_usage
├── filechanges/            <- /filechanges overlay + accept/decline;
│                              tracks file modifications per session
│                              and exposes counts for the statusline
├── goal/                   <- /goal command — autonomous task orchestrator
│                              with pause/resume, turn tracking, history
├── google-image-search/    <- google_image_search tool
├── header/                 <- banner header: blackhole ASCII art on the
│                              left, provider/model/version info panel on
│                              the right, and ● N skills widget above input
├── md-link/                <- /link-md, /unlink-md, /send-diff — link a
│                              .md file for collaborative editing
├── powershell/             <- powershell tool (LLM-callable)
├── profile-switcher/       <- multi-account auth switching
├── questions/              <- questions tool (multi-choice TUI with
│                              custom-answer fallback and ASCII sketches)
├── spinner-phrases/        <- Claude Code–style gerund spinner with
│                              tool-aware activity tracking and glow
├── statusline/             <- Footer status line (left→right):
│                               provider    model
│                               [████░░░░] 12.5k/128k
│                              (orange/Gold/Red at 50/75%)
│                               compact! cue above 90% (Alt+C)
│                               Δ5  +13 (dynamic non-zero)
│                              Auto-refreshes on session events
├── subagents/              <- the `subagent` tool: spawn isolated pi
│                              processes
├── tasks/                  <- /tasks command — background terminal task
│                              runner with output capture, wait, cancel;
│                              persists across sessions
├── timers/                 <- /timer command — one-shot and repeating
│                              timers with notifications, auto-delete
│                              on fire, and overlay browser
├── todos/                  <- /todo command — structured todo list with
│                              categories, reminders, browse overlay,
│                              and compact nerd-font widget
├── video-extract/          <- video_extract tool
├── youtube-search/         <- youtube_search tool
│
└── tmp/                   <- REFERENCE ONLY (`.reference.ts` suffix
                              prevents pi from loading)
    ├── subagent.reference.ts        <- old subagent dashboard (rough)
    └── todo-widget.reference.ts     <- old todo widget (rough)
```

## Modular design

Each extension folder is **independent** — no extension imports from a
sibling. Cross-extension integration is through:

1. **`globalThis` bridges** for runtime data that extensions produce and
   consume:
   - `globalThis.__pi_copilot_usage` — set by `context/copilot-usage.ts`,
     read by any extension that wants the current Copilot quota
   - `globalThis.__pi_goal_state` / `__pi_todo_state` / `__pi_timer_state` /
     `__pi_task_state` / `__pi_subagents` — each toolkit extension persists
     state across session compacts independently
   - Bridge keys are prefixed with `__pi_` and unique per extension

2. **System prompt injection** via `globalThis.__pi_extension_features`.
   Every extension registers its name, description, commands, tools, and
   shortcuts at load time. The `agents/` extension collects these and
   injects them as a `## Loaded Extensions` section into the system prompt
   at the start of every agent turn, so the LLM always knows what's
   available.

3. **UI primitives on `ctx.ui`**: `setHeader`, `setFooter`, `setWidget`,
   `notify`, `custom`, `select`, `input`. Extensions don't talk to each
   other directly — they each register commands, tools, and widgets
   independently.

4. **Graceful degradation**: When an extension's peer is missing, it
   degrades gracefully (e.g. `/agents chain` says "subagent extension is
   not loaded" if you delete `subagents/`). Widgets and commands from
   other extensions continue working.

5. **Shared UI components via direct import**: Extensions that need
   consistent tool-result rendering import `CompactToolBox` and
   `emptyComponent` from `betterui/index.js`. Currently `powershell/`
   uses this — removing `betterui/` will break tool rendering in any
   extension that depends on it.

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

The `agents/` extension reads `globalThis.__pi_extension_features` and
injects it as a `## Loaded Extensions` section at the bottom of the system
prompt before every agent turn.

## Reference files in `tmp/`

`extensions/tmp/*.reference.ts` are **disabled** (the `.reference.ts` suffix
prevents pi from loading them). They exist as design references. Do not
import from them in production extensions.

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
(e.g. the `/agents` command says "subagent extension is not loaded" if
you delete `subagents/`).
