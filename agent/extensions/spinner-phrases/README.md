# Spinner Phrases Extension

Animated star spinner with typewriter phrase transitions and elapsed time.

```
✦ Manifesting... (1m 2s)
★ Thinking... (5s)
✧ Brewing... (30s)
```

## What it does

- **Star spinner**: Rotates through `✦ ✧ ★ ✧ ✦ ☆` frames
- **Fun phrases**: Cycles through 100+ Claude Code–inspired gerund phrases like "Manifesting", "Reticulating", "Flibbertigibbeting", "Whatchamacalliting"
- **Typewriter effect**: Phrases transition with a character-by-character erase/type animation (driven by the same tick as the star spinner)
- **Elapsed time**: Shows how long the agent has been thinking since the first LLM activity: `(1m 2s)`, `(5s)`, `(2h 15m)`
- **Seamless integration**: Pushes the rendered text to `ctx.ui.setWorkingMessage` so the TUI re-renders on every tick

## How it works

The extension hooks into:
1. **`before_agent_start`** — starts the spinner interval (250ms ticks); if already running between tool calls, it keeps the existing timer and elapsed time
2. **`agent_end`** — stops the spinner and clears the text
3. **`session_shutdown`** — safety cleanup

Phrase transitions happen every 12 seconds (48 ticks × 250ms) using the same tick as the spinner animation.

## Removing

Delete the `agent/extensions/spinner-phrases/` folder.
