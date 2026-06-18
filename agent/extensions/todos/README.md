# Todos Extension

Task tracking system that renders file changes, the spinner, timer countdowns, and a todo counter in a single widget above the prompt.

```
Δ agent/extensions/spinner-phrases/index.ts (+38/-3)
Δ agent/extensions/statusline/index.ts (+1/-1)
✦ Seasoning... (33s)                       -checked 3/5
```

## What it does

- **File changes**: Shows individual file diffs (from `filechanges` extension) at the top of the widget
- **Spinner**: Renders the animated spinner text (from `spinner-phrases` extension) on the next line
- **Timer countdowns**: Shows active timer info (from `timers` extension) alongside the spinner
- **Todo counter**: Right-aligned task count (e.g. `-checked 3/5`) on the spinner line
- **Auto-hide**: Widget unregisters entirely when there's nothing to show

## How it works

- Renders via `ctx.ui.setWidget` (order 90) on `session_start`
- Reads `globalThis.__pi_spinner_text` for spinner content
- Reads `globalThis.__pi_filechanges_lines` for file change details
- Reads `globalThis.__pi_timers_summary` for timer countdowns
- Re-renders on `message_update`, `message_end`, and `session_compact` events

## Removing

Delete the `agent/extensions/todos/` folder.
