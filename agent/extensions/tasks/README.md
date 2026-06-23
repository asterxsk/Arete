# Tasks Extension

Run terminal commands in the background, capture their output, and check on them later. This lets the agent kick off long-running builds or scripts, continue doing other work, and return to the results when ready.

## Features

- **Background execution** — spawn any shell command asynchronously without blocking the agent.
- **Output capture** — stdout and stderr are captured (up to 50 KB each) and available on demand.
- **Task lifecycle** — track running, completed, failed, and cancelled states with timestamps.
- **Persistence** — task state survives session restarts via global state bridge; running tasks are marked failed on shutdown.
- **Interactive UI** — open a TUI menu to browse and manage tasks with keyboard navigation.
- **LLM integration** — two tools let the agent start and manage tasks programmatically.

## User Commands

| Command | Description |
| --- | --- |
| `/manage_task` | Open interactive task manager UI |
| `/manage_task start <command>` | Run a command in the background |
| `/manage_task list` | List all tasks with status |
| `/manage_task check <id>` | Show detailed output of a task |
| `/manage_task wait <id> [seconds]` | Wait for a task to finish (default 60 s timeout) |
| `/manage_task cancel <id>` | Kill a running task |
| `/manage_task clear <id>` | Remove a completed/failed task |
| `/manage_task clear-all` | Remove all tasks |
| `/manage_task stats` | Show aggregate task statistics |

## LLM Tools

### `run_command`

Propose a command to run. The command is executed in the background; the agent receives output messages as it runs.

| Parameter | Required | Description |
| --- | --- | --- |
| `CommandLine` | Yes | The shell command to execute |
| `Cwd` | No | Working directory (defaults to session cwd) |
| `WaitMsBeforeAsync` | No | Milliseconds to wait before sending to background |

### `manage_task`

Interact with background tasks.

| Parameter | Required | Description |
| --- | --- | --- |
| `Action` | Yes | `list`, `kill`, `status`, or `send_input` |
| `TaskId` | No | Target task ID (required for `kill`, `status`, `send_input`) |
| `Input` | No | Text to send to a running task's stdin (`send_input` only) |

## Typical Workflow

1. Agent starts a long build: `run_command CommandLine="npm run build"`
2. Agent sets a timer (via the timers extension) to check back later.
3. Agent continues working on something else.
4. Timer fires → agent checks task: `manage_task Action=status TaskId="<id>"`
5. If done, agent reads output; if still running, sets another timer.

## How to Remove

Delete the `tasks/` directory from `~/.pi/agent/extensions/`:

```bash
rm -rf ~/.pi/agent/extensions/tasks
```

