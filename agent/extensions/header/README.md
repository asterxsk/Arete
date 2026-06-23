# header

Renders a side-by-side banner header for the pi TUI: an orange ASCII-art logo on the left and an info panel on the right showing version, provider, model, and working directory.

## What it renders

```
▝██████████▘                          Arete v2.6.1
  ██    ██                                provider
  ██    ██                                model
 ▄██    ██▄                               /path/to/working/dir
```

- **Banner** — solid orange (#ffa500) ASCII art for the pi logo.
- **Info panel** (grey text) — version string, current provider, model name, and `process.cwd()`.
- The header updates automatically when the active model changes (`model_select` event).

## How it works

| Event | Behaviour |
|---|---|
| `session_start` | Reads model info from context, registers the header widget via `ctx.ui.setHeader()`. |
| `model_select` | Refreshes provider/model display and re-renders the header. |

No commands or tools are registered.

## Removal

Delete the `header/` folder. pi falls back to its default blank header.
