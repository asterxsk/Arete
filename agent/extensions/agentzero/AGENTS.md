# agentzero

## Purpose
Adds the `/init` command to initialize a directory with an AGENTS.md file, and injects the global `~/.pi/AGENTS.md` content into the system prompt at session start.

## Ownership
- `/init` command implementation
- Global AGENTS.md prompt injection via `before_agent_start` hook
- AGENTS.md file creation in current working directory

## Local Contracts
- Registers command: `/init` — creates `AGENTS.md` in cwd if not exists
- Hooks `before_agent_start` — appends global AGENTS.md content to system prompt
- Reads from `~/.pi/AGENTS.md` at session start
- Self-registers in `__pi_extension_features` global registry

## Work Guidance
- The `/init` handler checks for existing AGENTS.md before creating
- Uses `ctx.hasUI` to branch between TUI notifications and console output
- Prompt injection appends content under `## Global Agents Configuration` heading

## Verification
- Run `/init` in an empty directory — verify AGENTS.md is created
- Run `/init` again — verify "already exists" error
- Start a session — verify global AGENTS.md content appears in system prompt

## Child DOX Index
None
