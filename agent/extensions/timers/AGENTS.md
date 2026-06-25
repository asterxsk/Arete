# Timers Extension

## Purpose
Manages one-shot and repeating timers with notifications. Fires timer alerts via user message injection and provides an interactive UI overlay. Timers persist across session resets within the same process.

## Ownership
- `index.ts` — timer management, UI component, tool registration
- Timer state persistence (nextId only, actual timers are runtime)
- Timer countdown display widget

## Local Contracts
- Registers command: `/schedule` (or `/timer`) with subcommands: set, repeat, list, clear, clear-all, stats, check
- Registers tool: `schedule` (DurationSeconds, Prompt, MaxIterations)
- `TimerEntry` interface: id, label, durationMs, status, startedAt, repeatCount, maxRepeats
- `TimerStatus` type: "active" | "repeating"
- State persisted via `__pi_timer_state` globalThis key
- Pending notifications surfaced via `__pi_pending_timer_notifications`

## Work Guidance
- One-shot timers use `setTimeout`, repeating use `setInterval`
- Timer fires inject user message via `pi.sendUserMessage()` with `deliverAs: "nextTurn"`
- UI component (`TimersUIComponent`) provides interactive timer browser
- Widget stores countdown for display alongside todos in spinner area
- Timers cleared on session shutdown

## Verification
- Set timer: `/schedule set 10 test-timer`
- List timers: `/schedule list`
- Clear timer: `/schedule clear 1`
- Test repeat: `/schedule repeat 5 heartbeat repeats=3`
- Check notification: wait for timer to fire, verify message injection

## Child DOX Index
None
