# Tasks Extension

## Purpose
Manages background terminal tasks with output capture. Agents can spawn commands, check status, wait for completion, and cancel tasks. Provides both user-facing `/task` command and LLM-callable `manage_task` and `run_command` tools.

## Ownership
- `index.ts` — task management, UI component, tool registration
- Task state persistence across sessions (via globalThis bridge)
- Task output capture (stdout/stderr) with 50KB cap

## Local Contracts
- Registers command: `/manage_task` (or `/task`) with subcommands: start, list, check, wait, cancel, clear, clear-all, stats
- Registers tools: `manage_task` (list/kill/status/send_input), `run_command` (run terminal command)
- `TaskEntry` interface: id, label, command, status, stdout, stderr, pid, proc
- `TaskStatus` type: "running" | "completed" | "failed" | "cancelled"
- Task IDs formatted as `powershell(random8digits)`
- State persisted via `__pi_task_state` globalThis key

## Work Guidance
- Tasks spawn with `shell: true` for cross-platform command execution
- Cancel uses SIGTERM with 3s SIGKILL fallback
- Output capped at 50K chars to prevent memory issues
- UI component (`TasksUIComponent`) provides interactive task browser
- Notifications sent on task completion via `ctx.ui.notify`

## Verification
- Start a task: `/manage_task start echo hello`
- List tasks: `/manage_task list`
- Check output: `/manage_task check <id>`
- Cancel a task: `/manage_task cancel <id>`
- Clear completed: `/manage_task clear-all`

## Child DOX Index
None
