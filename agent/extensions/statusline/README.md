# Status Line Extension

A two-line footer status bar showing provider, model, and a color-coded context usage meter.

```
 nf [████░░░░] 12.3k/200k
└ claude-3.5-sonnet
```

## What it does

- **Provider + model**: Displays the active provider icon and shortened model name (e.g. `cl-3.5-sonnet`)
- **Context usage bar**: 8-segment gradient bar with smooth color interpolation:
  - Green → Orange → Gold → Red as usage climbs
  - Token count shown as `used/window` (e.g. `12.3k/200k`)
  - Triggers a red "compact!" cue above 90%
- **Alt+C shortcut**: Runs `/compact` when context is above 90%

## How it works

- Renders via `ctx.ui.setFooter` on `session_start`
- Updates context info on every `message_update` (throttled to 120ms) and `message_end`
- Refreshes provider/model on `model_select`
- Responds to `session_compact` events to re-render immediately

## Removing

Delete the `agent/extensions/statusline/` folder.
