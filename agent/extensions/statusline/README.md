# Status Line Extension

A two-line footer status bar showing provider, model, context usage, and file changes.

```
anthropic [████░░░░] 12.3k/200k
└ claude-3.5-sonnet                   3  1
```

## Features

- **Provider**: Active provider name with icon (orange)
- **Model**: Shortened model name (e.g. `deepseek-reasoner` → `ds-reasoner`)
- **Context usage bar**: 8-segment gradient bar with smooth color interpolation:
  - Green → Orange → Gold → Red as usage increases
  - Token count shown as `used/window` (e.g. `12.3k/200k`)
  - Triggers a red "compact!" warning above 90%
- **File changes**: Shows edited and created file counts when present
- **Alt+C shortcut**: Runs `/compact` when context is above 90%

## Commands/Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+C`  | Compact context (when usage > 90%) |

## How it works

- Renders via `ctx.ui.setFooter` on `session_start`
- Updates context info on every `message_update` (throttled to 120ms) and `message_end`
- Refreshes provider/model on `model_select`
- Responds to `session_compact` events to re-render immediately

## Removing

Delete the `agent/extensions/statusline/` folder.
