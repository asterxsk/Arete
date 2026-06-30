# perms

## Purpose
Manages tool permissions and extensions for the Pi agent, providing an extensions checklist and plan mode functionality.

## Ownership
- `/extensions` command — interactive checklist of extension-loaded tools
- `/plan` command — enters plan mode
- `plan` tool — toggles plan mode via `active` boolean parameter (true to enter, false to exit)

## Local Contracts
- Registers commands: `/extensions`, `/plan`
- Registers tool: `plan` with `active` boolean parameter
- Plan mode disables write/edit/bash tools to enforce read-only exploration

## Work Guidance
- `/extensions` opens a TUI checklist where users can toggle which extension tools are loaded into the system prompt
- `plan` tool with `active: true` is invoked voluntarily by the agent when facing complex multi-phase tasks
- `plan` tool with `active: false` asks the user to confirm exit, optionally asking about parallel vs sequential subagent execution
- Plan mode restricts the agent to exploration only — no code modifications allowed

## Verification
- Run `/extensions` — verify checklist renders with all loaded extension tools
- Run `/plan` — verify plan mode activates and agent cannot use write/edit/bash tools
- Test `plan` tool with `active: true` to enter and `active: false` to exit plan mode

## Child DOX Index
None
