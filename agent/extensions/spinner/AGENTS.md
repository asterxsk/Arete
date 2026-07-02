# spinner

## Purpose
Replaces the default "Working..." indicator with an animated star spinner, rotating fun phrases, and elapsed time display.

## Ownership
- Animated star spinner (`STAR_FRAMES` with custom dwell timing)
- Fun phrases array (100+ entries) with typewriter transition effect
- Elapsed time formatting
- Spinner lifecycle (start on `before_agent_start`, stop on `agent_end`)
- UI context management across session events
- Theme-aware accent color for phrase and glow effect

## Local Contracts
- **ExtensionAPI hooks**: `session_start` (capture context), `before_agent_start` (start spinner), `agent_end` (stop), `session_shutdown` (cleanup)
- **UI API**: `ctx.ui.setWorkingIndicator()`, `ctx.ui.setWorkingMessage()`, `ctx.ui.theme`
- **Animation**: 80ms tick interval
- **Global feature registry**: Self-registers `{ name: "spinner", description: ... }`

## Work Guidance
- `FRAME_DWELL` controls per-frame display time — `✻` holds 5x longer for emphasis
- Timer persists across tool calls — `start()` returns early if already running
- `stop()` clears interval, resets UI indicator and message
- Theme-aware accent color: uses `ctx.ui.theme.fg("accent", ...)` with fallback to hardcoded `#f0a050`
- Glow effect: 3-char bright-white highlight sweeps left-to-right across the phrase only (not stats) at 12 char/s
- Non-glow phrase chars rendered in accent color
- Stats (elapsed time, token count) rendered in static grey/dim
- `GLOW_SPEED_CPS`, `GLOW_WIDTH` control glow behavior
- Glow resets at session start; `applyGlow()` returns character data for flexible rendering

## Verification
- Start a session, confirm animated spinner appears during agent thinking
- Verify phrases rotate with typewriter effect
- Confirm elapsed time increments correctly
- Stop agent, verify spinner clears and no residual UI state
- Check narrow terminal widths render without overflow

## Child DOX Index
None
