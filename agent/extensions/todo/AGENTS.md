# Todo Extension

## Purpose
Provides a persistent todo list with overlay widget, slash command, and LLM-callable tool. Todos are tracked across sessions and displayed in a dedicated UI overlay. Supports i18n via optional `@juicesharp/rpiv-i18n` SDK.

## Ownership
- `index.ts` — extension entry, event handlers, overlay lifecycle
- `todo.ts` — todo tool and command registration
- `todo-overlay.ts` — TUI overlay widget for todo display
- `state/` — state management, replay, i18n bridge

## Local Contracts
- Registers tool: `todo` (tool name preserved for session history compatibility)
- Registers command: `/todos`
- Widget key: `rpiv-todos` (preserved for compatibility)
- State replayed from branch on `session_start`, `session_compact`, `session_tree`
- `replaceState()` and `replayFromBranch()` from state modules
- Handles stale ctx errors during auto-compaction gracefully

## Work Guidance
- Todo state is session-branch-based and replayed on session events
- Overlay constructed lazily at first `session_start` with UI
- `hideCompletedTasksFromPreviousTurn()` called on `agent_start`
- i18n strings registered once at module init (soft optional peer dependency)
- Tool execution triggers overlay update via `tool_execution_end` event

## Verification
- Add todo: use `/todos` command or `todo` tool
- Verify overlay: check widget displays in TUI
- Test session persistence: `/new` then verify todos still shown
- Test compaction: trigger compact, verify todos replay correctly

## Child DOX Index
None
