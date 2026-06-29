# compactui

## Purpose
Re-registers built-in tools with compact visual rendering (single-line calls, expandable results) and truncates large tool outputs for LLM context efficiency.

## Ownership
- Tool rendering: `renderCall` and `renderResult` for all built-in tools
- Output truncation for bash/powershell/run_command (5-line limit)
- Thinking block styling and assistant message layout
- `ThinkingBlock` component for collapsed thinking display
- Message spacing: controlled spacing after assistant messages, removed native Spacers above tools

## Local Contracts
- Patches tools: `read`, `write`, `edit`, `bash`, `ls`, `grep`, `find` (via explicit re-registration in `index.ts`)
- Special cases in generic patcher (`patch-tools.ts`): `pwsh/powershell`, `run_command`, `web_search`, `web_fetch/fetch_content`, `manage_task`, `schedule`
- Excludes from patching: `subagent`, `todo` (rendered as no-op), `memory`, `memory_search`, `session_search` (handled by pi-hermes-memory)
- Sets `__pi_betterui_enabled` global flag for other extensions
- Exposes `__pi_patchTool` globally as fallback for fresh pi objects
- Hooks: `tool_call` (unknown tool detection), `tool_result` (output truncation)
- `KNOWN_TOOLS` set tracks all registered Pi tools: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`, `web_search`, `web_fetch`, `fetch_content`, `get_search_content`, `run_command`, `manage_task`, `schedule`, `subagent`, `todo`, `powershell`, `questions`, `video_extract`, `skill_manage`, `plan`, `memory`, `memory_search`, `session_search`

## Work Guidance
- Context-aware spacing: adds empty line before user messages when previous message was assistant (not before tools within same turn)
- Collapsed view shows two lines:
  1. `tool [args] (ctrl+o to expand)` — orange tool name, truncated args
  2. `⎿ summary (N lines)` — dimmed summary with line/task count (or `⎿ failed tool call` on error)
- Unknown tool errors render as `toolName tool not found` with orange tool name and error-colored text (via `_isUnknownTool` flag)
- Summary texts by tool:
  - `read`: "read tool output"
  - `write`: "file written"
  - `edit`: "file edited"
  - `bash`, `pwsh`, `run_command`, `ls`, `grep`, `find`: "read terminal output"
  - `web_search`: "read search results"
  - `web_fetch`/`fetch_content`: "read web page"
  - `manage_task`: "checked tasks"
  - `schedule`: "scheduled tasks"
- Expanded result shows up to 50 lines with duration footer
- Edit tool renders diff with +/- color coding
- Truncation applies to tools in `TRUNCATED_TOOLS` set when output > 5 lines
- Patches both instance and prototype `registerTool` to catch all extensions

## Verification
- Run any tool (bash, read, etc.) — verify compact two-line display
- Press ctrl+o — verify expanded view with output
- Run bash with >5 lines output — verify truncation message
- Verify thinking blocks render with proper styling
- Verify spacing after assistant messages and before user prompts
- Verify no extra spacing above tool calls

## File Structure
- `index.ts` — Main entry: imports modules, wires event hooks, re-registers read/write/edit/bash/ls/grep/find tools
- `rendering.ts` — Shared rendering primitives: `line`, `noOp`, `orange`, `compactCall`, `expandedBox`, `diffExpandedBox`, `wrapWithPrefix`, `formatDur`, `captureResult`
- `patch-tools.ts` — Tool patching: `patchTool` function, `KNOWN_TOOLS`, `TRUNCATED_TOOLS`, special-case handlers for todo/questions/powershell/run_command/web_search/web_fetch/manage_task/schedule
- `thinking-block.ts` — `ThinkingBlock` component class, `initHideThinking`, `colorThinkingText`, `italicText`
- `assistant-footer.ts` — `initAssistantFooter`: appends "✻ Worked for Xs" to assistant messages
- `prompt-ui.ts` — `initPromptUi`: patches UserMessageComponent with dark background and ❯ prefix
- `tool-status-dot.ts` — `initToolStatusDot`: animated blinking status dot for running tools

## Child DOX Index
None
