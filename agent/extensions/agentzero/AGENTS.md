# agentzero

## Purpose
Adds the `/init` command to create or audit AGENTS.md, and injects the global `~/.pi/AGENTS.md` content into the system prompt at session start.

## Ownership
- `/init` command implementation
- Global AGENTS.md prompt injection via `before_agent_start` hook
- AGENTS.md file creation and analysis in current working directory

## Local Contracts
- Registers command: `/init`
  - No AGENTS.md: creates one with DOX-standard sections (Purpose, Ownership, Local Contracts, Work Guidance, Verification, Child DOX Index)
  - AGENTS.md exists: analyzes it and reports improvements (missing sections, empty sections, undocumented artifacts, unlisted child docs)
- Hooks `before_agent_start` — appends global AGENTS.md content to system prompt
- Reads from `~/.pi/AGENTS.md` at session start
- Self-registers in `__pi_extension_features` global registry

## Work Guidance
- The `/init` handler auto-detects project type (Node, Python, Rust, Go, etc.) from config files
- Scans for child AGENTS.md files up to 3 levels deep
- Checks DOX section completeness and content quality
- Uses `ctx.hasUI` to branch between TUI notifications and console output
- Prompt injection appends content under `## Global Agents Configuration` heading

## Verification
- Run `/init` in an empty directory — verify AGENTS.md is created with DOX-standard template
- Run `/init` again — verify analysis report with improvement suggestions
- Run `/init` in a directory with complete AGENTS.md — verify "no changes needed" success
- Start a session — verify global AGENTS.md content appears in system prompt

## Child DOX Index
None
