# plan

## Purpose
Read-only mode toggle for the agent. The `/plan` command disables edit/write tools and blocks destructive bash/PowerShell commands, with a "plan" indicator in the footer.

## Ownership
- `/plan` command registration and toggle logic
- Plan mode state (on/off, saved tools list)
- Destructive command pattern matching (bash and PowerShell)
- Status bar indicator via `ctx.ui.setStatus("plan", ...)`

## Local Contracts
- **ExtensionAPI hooks**: `session_start` (restore status), `tool_call` (block if destructive)
- **Commands**: `/plan` — toggle plan mode
- **Tool filtering**: `pi.setActiveTools()` / `pi.getActiveTools()` — removes `edit` and `write`
- **Status UI**: `ctx.ui.setStatus("plan", component)` — shows/hides ⏸ plan indicator

## Work Guidance
- `DESTRUCTIVE_PATTERNS` and `POWERSHELL_DESTRUCTIVE_PATTERNS` are the canonical block lists — add new patterns to both when covering new destructive commands
- `toolsBeforePlanMode` captures pre-toggle state for clean restoration
- Plan mode blocks tool calls via `event.block = true` with reason string — do not throw
- The extension is stateless across sessions — no persistence

## Verification
- Run `/plan`, confirm edit/write tools are removed and status shows "plan"
- Attempt `rm file` and confirm it's blocked with reason message
- Attempt PowerShell `Remove-Item` and confirm it's blocked
- Run `/plan` again, confirm tools are restored and status clears

## Child DOX Index
None
