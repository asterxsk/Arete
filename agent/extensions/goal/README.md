# goal

Autonomous goal orchestrator — inspired by Claude Code's `/goal` and
OpenAI Codex CLI's `/goal`.

Set a high-level objective and the agent works toward it automatically
until accomplished, paused, or cleared. Each response is checked for
completion, and if the goal isn't done, a follow-up continuation is
sent with progress context.

## Commands

| Command | Action |
| :--- | :--- |
| `/goal <description>` | Set a new goal (replaces any active goal) |
| `/goal` or `/goal status` | Show current goal status (turns, elapsed time) |
| `/goal clear` | Clear the current goal |
| `/goal stop` | Alias for `/goal clear` |
| `/goal cancel` | Alias for `/goal clear` |
| `/goal off` | Alias for `/goal clear` |
| `/goal pause` | Pause the current goal (agent stops auto-continuing) |
| `/goal resume` | Resume a paused goal |
| `/goal history` | Show the last 10 completed/cleared goals |
| `/goal config` | Show current config (max_turns) |
| `/goal config max_turns <N>` | Set max turns per-session (1-99999, default 200) |

## How it works

1. You set a goal with `/goal <describe the goal>`.
2. The agent receives your goal and starts working toward it.
3. After each response, the extension checks if the response contains
   `[GOAL_ACCOMPLISHED]`. It also checks for natural language signals
   like "goal accomplished", "goal complete", "goal achieved".
4. If not complete, a continuation message is sent as a follow-up,
   including progress context (turn count, elapsed time, progress bar).
5. If complete, the goal is logged to history and the loop ends.
6. You can check progress at any time with `/goal` or `/goal status`.
7. You can pause, resume, or clear the goal as needed.

## Status widget

When a goal is active, a status widget shows up in the sidebar:
```
  🎯 Implement login flow with tests
  [13/200] ████░░░░░░ 2m 34s
```

## Features

- **Subcommands**: status, clear, pause, resume, history, config
- **Status widget**: Persistent sidebar widget showing goal progress
- **Turn tracking**: Progress bar showing turns used vs max (default 200)
- **Elapsed time**: Running timer shown in the widget
- **Goal history**: Last 50 goals tracked in-memory
- **Session persistence**: Goal state survives session compacts via
  `globalThis` bridge (does not survive a full process restart)
- **Smart completion detection**: Checks for the `[GOAL_ACCOMPLISHED]`
  marker, and also looks for natural-language phrases like "goal
  accomplished", "task complete", "mission achieved", etc. near the
  end of the response
- **Lock mechanism**: Prevents overlapping continuation messages when
  `agent_end` fires
- **Adaptive messages**: Continuation prompts gain extra guidance after
  3+ turns (e.g., "try a different approach")

## Config

### `max_turns`

Default: 200. Controls how many auto-continuations the agent gets before
the goal is auto-cleared.

Set it per-session:
```
/goal config max_turns 500
```

Changes persist across session compacts (same pi process). When exceeded,
the goal is auto-cleared with a notification and logged to history as
"max-turns".

View current config:
```
/goal config
```

## History

View completed/cleared goals with `/goal history`. Shows the last 10
entries with outcome icon, time, text, and turns used.

## Removal

Delete the `goal/` folder. The `/goal` command disappears.
