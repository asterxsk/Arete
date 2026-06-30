# instruct

## Purpose
Injects custom system prompt instructions into the agent's context — sets PowerShell as default shell, enforces todo tracking, async workflows, questions tool usage, Nerd Font icons, and guidelines for plan mode tools (enter_plan and exit_plan).

## Ownership
- System prompt augmentation via `before_agent_start` event
- Custom instruction text (shell preference, task tracking, task clearing, async workflows, questions tool, visual styling, plan mode)

## Local Contracts
- **ExtensionAPI hooks**: `before_agent_start` — returns `{ systemPrompt: augmented }`
- **Commands**: `/instructions` — opens `prompt.md` in the user's default editor
- **Prompt injection**: Appends `## Custom Instructions` block to existing system prompt

## Work Guidance
- Instruction text lives in `prompt.md` (loaded once at startup via `readFileSync`)
- Append-only: never replaces the base system prompt, only adds to it
- Changes to instructions require editing `prompt.md`, not `index.ts`
- Keep instructions concise — they consume context tokens on every request

## Verification
- Start a session and verify PowerShell is used by default for shell commands
- Confirm todo system is used for multi-step tasks
- Verify questions tool is used instead of plain text questions
- Check that Nerd Font icons are used (no emojis)

## Child DOX Index
None
