# compactui

## Purpose
Re-registers built-in tools with compact visual rendering (single-line calls, expandable results) and truncates large tool outputs for LLM context efficiency.

## Ownership
- Tool rendering: `renderCall` and `renderResult` for all built-in tools
- Output truncation for bash/powershell/run_command (5-line limit)
- Thinking block styling and assistant message layout
- `ThinkingBlock` component for collapsed thinking display

## Local Contracts
- Patches tools: `read`, `write`, `edit`, `bash`, `ls`, `grep`, `find` (via explicit re-registration)
- Excludes from generic patching: `subagent`, `todo` (rendered as no-op)
- Note: HERMES_TOOLS (`memory`, `skill_manage`, `session_search`, `memory_search`) have been removed from betterui as they now provide their own `renderCall`/`renderResult` in the `pi-hermes-memory` extension.
- Sets `__pi_betterui_enabled` global flag for other extensions
- Exposes `__pi_patchTool` globally as fallback for fresh pi objects
- Hooks: `tool_call` (unknown tool detection), `tool_result` (output truncation)

## Work Guidance
- Compact call shows tool name + first 40 chars of args + "(ctrl+o to expand)"
- Expanded result shows up to 50 lines with duration footer
- Edit tool renders diff with +/- color coding
- Truncation applies to tools in `TRUNCATED_TOOLS` set when output > 5 lines
- Patches both instance and prototype `registerTool` to catch all extensions

## Verification
- Run any tool (bash, read, etc.) — verify compact single-line display
- Press ctrl+o — verify expanded view with output
- Run bash with >5 lines output — verify truncation message
- Verify thinking blocks render with proper styling

## Child DOX Index
None
