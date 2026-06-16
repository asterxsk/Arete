# Spinner Phrases Extension

Animated star spinner that replaces the default "working..." indicator with an orange-glowing rotating star, Claude Code–style gerund phrases, and elapsed time.

```
✦ Manifesting (1m 2s)
★ Thinking (5s)
✧ Brewing (30s)
```

## What it does

- **Star spinner**: Rotates through `✦ ✧ ★ ✧ ✦ ☆ ⋆ ☆` frames with an orange glow color gradient (bright gold → orange → dimmed)
- **Fun phrases**: Cycles through 100+ Claude Code–inspired gerund phrases like "Manifesting", "Reticulating", "Flibbertigibbeting", "Whatchamacalliting"
- **Elapsed time**: Shows how long the agent has been thinking: `(1m 2s)`, `(5s)`, `(2h 15m)`
- **Seamless integration**: Sets `globalThis.__pi_spinner_text` which the `todos/` extension widget reads to render above the input area

## How it works

The extension hooks into:
1. **`before_agent_start`** — starts the spinner interval (250ms ticks)
2. **`message_end`** — stops the spinner and clears the text
3. **`session_shutdown`** — safety cleanup

The phrase changes every 4 ticks, and the star frame rotates on every tick with
a pulsing orange glow effect using ANSI 24-bit color sequences.

## Removing

Delete the `agent/extensions/spinner-phrases/` folder.
