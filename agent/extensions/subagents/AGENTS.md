# Subagents Extension

## Purpose
Registers a `subagent` tool that spawns isolated child pi processes with predefined agents loaded from `.md` files. Supports single and parallel execution modes with configurable concurrency.

## Ownership
- `index.ts` — subagent tool, agent discovery, process spawning, `/sub` command
- `agents/` — agent definition `.md` files with frontmatter (name, description, tools)
- `tools/` — custom tool extensions for subagents (e.g., safe-bash)
- `config.json` — optional configuration (maxConcurrency)

## Local Contracts
- Registers tool: `subagent` (single and parallel modes)
- Registers command: `/sub` (set/list subagent model)
- Exports: `registerAgent()`, `unregisterAgent()` for other extensions
- Agents defined via frontmatter: `name`, `description`, `tools` (comma-separated)
- Uses `BUILTIN_TOOLS` set for tools pi provides natively
- `CUSTOM_TOOL_EXTENSIONS` maps tool names to extension paths
- Depends on `@earendil-works/pi-coding-agent` for `parseFrontmatter`, `truncateHead`, etc.

## Work Guidance
- Agent `.md` files go in `agents/` directory with frontmatter format
- Custom tools go in `tools/` directory or reference external extensions
- Subagent model set via `/sub` command, stored globally in `__pi_subagent_model_v1`
- Concurrency limited by `maxConcurrency` config (default: 4)
- Temp directories created in OS temp folder, cleaned up after execution

## Verification
- Test agent loading: ensure `.md` files in `agents/` are discovered
- Test single mode: `subagent` tool with `agent` + `task` params
- Test parallel mode: `subagent` tool with `tasks[]` array
- Test `/sub` command for model selection

## Child DOX Index
None
