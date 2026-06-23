# Spinner Phrases Extension

Animated star spinner with typewriter phrase transitions and elapsed time.

Replaces the default "Working..." indicator with an orange-colored spinner:

```
✦ Manifesting... (1m 2s)
★ Thinking... (5s)
✧ Brewing... (30s)
```

## Features

- **Star spinner**: Rotates through `✦ ✧ ★ ✧ ✦ ☆ ✻` frames
- **100+ fun phrases**: Cycles through gerund phrases like "Manifesting", "Reticulating", "Flibbertigibbeting", "Whatchamacalliting"
- **Typewriter effect**: Phrases transition with a character-by-character erase/type animation
- **Elapsed time**: Shows time since first LLM activity in `Xs`, `Xm Ys`, or `Xh Ym` format
- **Orange color**: Displays in orange (RGB 255,180,60)

## Events

| Event | Behavior |
|-------|----------|
| `session_start` | Captures UI context (no spinner yet) |
| `before_agent_start` | Starts spinner interval (100ms ticks); resumes seamlessly between tool calls |
| `agent_end` | Stops spinner and clears message |
| `session_shutdown` | Cleanup |

Phrase transitions occur every ~4.8 seconds (48 ticks × 100ms).

## Commands/Tools

None. This extension only listens to lifecycle events.

## Removing

Delete the `agent/extensions/spinner-phrases/` folder.
