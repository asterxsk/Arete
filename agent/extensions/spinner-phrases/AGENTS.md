# spinner-phrases

## Purpose
Replaces the default "Working..." indicator with an animated star spinner, rotating fun phrases, and elapsed time display.

## Ownership
- Animated star spinner (`STAR_FRAMES` with custom dwell timing)
- Fun phrases array (100+ entries) with typewriter transition effect
- Elapsed time formatting
- Spinner lifecycle (start on `before_agent_start`, stop on `agent_end`)
- UI context management across session events

## Local Contracts
- **ExtensionAPI hooks**: `session_start` (capture context), `before_agent_start` (start spinner), `agent_end` (stop), `session_shutdown` (cleanup)
- **UI API**: `ctx.ui.setWorkingIndicator()`, `ctx.ui.setWorkingMessage()`
- **Animation**: 130ms tick interval, typewriter erase/type transition every 48 ticks (~12s)
- **Global feature registry**: Self-registers `{ name: "spinner-phrases", description: ... }`

## Work Guidance
- `FRAME_DWELL` controls per-frame display time — `✻` holds 5x longer for emphasis
- Phrase transitions use erasing-then-typing animation, not instant swap
- Timer persists across tool calls — `start()` returns early if already running
- `stop()` clears interval, resets UI indicator and message
- Orange color is hardcoded (255,180,60) — theme-independent
- Glow effect sweeps a 3-char bright-white highlight across the phrase at 4 char/s, pausing 300ms at each end before reversing
- Glow state machine: move → pause at edge → reverse → pause at opposite edge → repeat
- `GLOW_SPEED_CPS`, `GLOW_END_DELAY_MS`, `GLOW_RADIUS` control glow behavior
- Glow resets at session start; `applyGlow()` calls `updateGlow()` internally each tick
- `demo()` function at bottom has self-tests (uncomment to run)

## Verification
- Start a session, confirm animated spinner appears during agent thinking
- Verify phrases rotate with typewriter effect
- Confirm elapsed time increments correctly
- Stop agent, verify spinner clears and no residual UI state
- Check narrow terminal widths render without overflow

## Child DOX Index
None
