# Statusline Extension

## Purpose
Renders a two-line status footer in the TUI showing provider info, model name, context usage bar with color gradient, and file changes count. Also provides an Alt+C shortcut to compact context when usage exceeds 90%.

## Ownership
- `index.ts` — status line footer rendering and compact shortcut
- Visual status footer display area
- Context usage color gradient interpolation logic

## Local Contracts
- Registers footer via `ctx.ui.setFooter()` during `session_start`
- Registers Alt+C shortcut via `pi.registerShortcut("alt+c", ...)`
- Listens to events: `session_start`, `model_select`, `message_update`, `message_end`, `session_compact`
- Exports: `default` function only
- Depends on `@earendil-works/pi-tui` for `truncateToWidth`, `visibleWidth`

## Work Guidance
- Color stops are defined in `COLOR_STOPS` array — adjust thresholds for context warning levels
- `smoothContextColor()` and `buildGradientBar()` are pure helper functions safe to test
- Footer render returns two aligned lines — keep right-side elements width-aware
- Throttle timer at 120ms prevents excessive re-renders during streaming

## Verification
- Run `demo()` function (uncomment at bottom) to test helper functions
- Visual check: footer shows in TUI with provider/model info
- Test Alt+C: context must be above 90% to trigger compact

## Child DOX Index
None
