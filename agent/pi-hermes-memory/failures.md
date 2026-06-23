[tool-quirk] PowerShell on Windows emits CLIXML progress records (e.g., "Preparing modules for first use.") as XML objects into stdout when piped. These `<Objs><Obj S="progress">...</Obj></Objs>` fragments pollute command output and must be filtered out. The CLIXML output also masks real errors. Use `-ErrorAction SilentlyContinue` and consider `--%` or `pwsh -NoProfile -Command` to reduce noise. <!-- created=2026-06-22, last=2026-06-22 -->
§
[failure] Trying to read C:\Users\prithish\.pi\settings.json failed — the file does not exist. Did not crash anything, but wasted commands. Should verify path existence before reading. <!-- created=2026-06-22, last=2026-06-22 -->
§
[tool-quirk] Current model (non-vision) cannot process images — the `read` tool sends PNG/JPG as attachments but the model responds "Current model does not support images." This is not a bug, it's a model capability limit. Workarounds: (1) Switch to a vision-capable model, (2) Use PowerShell pixel analysis (Get-Item for dimensions, custom byte parsing for row colors), (3) Describe the image contents verbally. <!-- created=2026-06-22, last=2026-06-22 -->
§
[tool-quirk] WSL paths (/mnt/c/...) are unreliable on this Windows-native PowerShell environment. Some bash commands (cp, find) work with them, but cd fails with "No such file or directory". Always use native Windows paths (C:\Users\...) for file operations to avoid inconsistency. <!-- created=2026-06-23, last=2026-06-23 -->
§
[failure] Plan extension only blocked bash tool calls with regex patterns. PowerShell cmdlets like Copy-Item bypassed plan mode because there was no powershell tool_call handler registered. Root cause: Pi extension tool_call interceptors are per-tool-name — a bash handler doesn't cover powershell. <!-- created=2026-06-23, last=2026-06-23 -->
§
[correction] User corrected: plan extension must block PowerShell write/edit/copy/paste/delete commands too, not just bash. Plan mode should be comprehensively read-only across all available shells. <!-- created=2026-06-23, last=2026-06-23 -->
§
[insight] Pi extension tool_call interceptors apply per tool name. To block destructive commands in plan mode, you must register handlers for both 'bash' AND 'powershell' (and any other shell tools). A single bash handler is insufficient on Windows where PowerShell is available. <!-- created=2026-06-23, last=2026-06-23 -->
§
[tool-quirk] Edit tool's oldText matching requires exact whitespace and newlines. Complex nested code blocks with inconsistent indentation cause edit failures — need to read the file fresh to get exact text before editing. <!-- created=2026-06-23, last=2026-06-23 -->
§
[correction] Plan mode extension only blocked destructive bash commands via regex on the `bash` tool_call handler. PowerShell's `Copy-Item` (and other cmdlets) bypassed it completely because there was no `powershell` tool_call handler. Fixed by adding `POWERSHELL_DESTRUCTIVE_PATTERNS` covering cmdlets and aliases (Remove-Item/rm/ri/del, Copy-Item/cp/ci, Move-Item/mv/mi, New-Item/mkdir/ni/md, Set-Content, Add-Content, etc.). — Failed: PowerShell destructive cmdlets were not blocked in plan mode because only bash patterns were checked. <!-- created=2026-06-23, last=2026-06-23 -->
§
[insight] Creating a ui-changes extension that truncates tool output to 5 lines via `tool_result` hook is risky — it prevents the agent from seeing full file listings, PowerShell CLIXML output, and other multi-line responses needed for decision-making. Truncation should be applied carefully and only to verbose/expected-long output, not to all execution tool output. — Failed: Aggressive truncation of all bash/powershell output to 5 lines broke the agent's ability to read directory listings and other essential multi-line output. <!-- created=2026-06-23, last=2026-06-23 -->
§
[insight] When a tool_result interceptor truncates output (e.g., ui-changes truncating to 5 lines), it also truncates the verification commands used to confirm the extension works — creating a circular visibility problem. Verify truncation extensions by reading the extension source directly with the read tool, not by running commands whose output will be truncated. <!-- created=2026-06-23, last=2026-06-23 -->
§
[insight] The edit tool's oldText matching is strict about exact whitespace including indentation and newlines. When editing files with many similar patterns (like arrays of regex strings), the matching can fail if whitespace differs even by one space. Use the read tool to get exact file content before crafting oldText for list-heavy edits. <!-- created=2026-06-23, last=2026-06-23 -->
§
[failure] Plan extension initially only blocked destructive commands via bash (rm, mv, cp, mkdir, etc.) but had no handler for the powershell tool. PowerShell's Copy-Item went right through in plan mode, allowing destructive operations via the other shell. — Failed: The plan extension only checked bash tool commands against destructive regex patterns, but had no tool_call handler for powershell at all. Any PowerShell cmdlet was unblocked. <!-- created=2026-06-23, last=2026-06-23 -->
§
[failure] Todo extension cloned from npm (@juicesharp/rpiv-todo) failed to load because config.ts imported from @juicesharp/rpiv-config which wasn't installed locally. Error: "Cannot find module '@juicesharp/rpiv-config'". Fix: inline the 4 small utilities directly into config.ts using only node:fs, node:os, node:path built-ins, and remove the dependency from package.json. — Failed: When cloning an npm pi extension to local for editing, mono-repo sibling dependencies aren't available. They must be inlined or the dependency must be installed separately. <!-- created=2026-06-23, last=2026-06-23 -->
§
[correction] User corrected: Plan mode must also block PowerShell destructive commands (Remove-Item, Copy-Item, Move-Item, New-Item, Set-Content, etc.) not just bash commands. Both shells need coverage because the agent can use either to modify the filesystem. <!-- created=2026-06-23, last=2026-06-23 -->
§
[tool-quirk] The edit tool's oldText must match exactly including all whitespace and newlines. If it doesn't match (e.g., due to invisible whitespace, trailing spaces, or reading the file via different methods), the edit silently fails with "Could not find the exact text". Use a reliable read method to get the exact content before editing. <!-- created=2026-06-23, last=2026-06-23 -->
§
[correction] the ⠶  is before agent tools here:
⠶ bash(grep -rl "⠶" C:/Users/prithish/ --include="*.ts" --include="*.js" 2>/dev/null | head -10) (ctrl+o to expand)
i am asking you to move it to the agent response like text not tools — Failed: User corrected the agent — Project: .pi <!-- created=2026-06-23, last=2026-06-23 -->