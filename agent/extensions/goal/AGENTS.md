# goal

## Purpose
Autonomous goal mode — sets a goal and the agent works toward it with automatic continuations until accomplished, paused, or cleared. Displays progress via a status widget.

## Ownership
- `/goal` command and all subcommands (set, status, clear, pause, resume, config, history)
- Aliases for clear: `stop`, `cancel`, `off`
- Goal state management and persistence across session compacts
- Continuation loop with turn tracking and time limits
- Status widget with progress bar

## Local Contracts
- Registers command: `/goal [text|status|clear|stop|cancel|off|pause|resume|config|history]`
- Hooks: `agent_end` (check completion, send continuation), `session_start` (restore state), `session_shutdown` (persist state)
- Goal completion marker: `✻ Accomplished!` (must be in last line of response)
- Global bridge: `__pi_goal_state` for cross-compact persistence
- Self-registers in `__pi_extension_features` global registry

## Work Guidance
- Default max turns: 200, default max duration: 30 minutes
- Configurable via `/goal config max_turns <n>` and `/goal config max_duration <ms>`
- Continuation lock prevents double-sends during overlapping agent_end events
- Goal history capped at 50 entries
- Completion detection checks for exact marker OR assertive goal-completion statement

## Verification
- Run `/goal do something simple` — verify goal widget appears
- Agent should auto-continue after each response
- Mark complete with `✻ Accomplished!` — verify goal clears
- Run `/goal pause` then `/goal resume` — verify pause/resume works
- Run `/goal history` — verify completed goals are listed

## Child DOX Index
None
