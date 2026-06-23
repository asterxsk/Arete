# Subagents

A pi extension that provides a `subagent` tool for running isolated child pi processes with predefined agents loaded from `.md` files.

## Features

- **Single and parallel execution** — run one agent or multiple agents concurrently
- **Dynamic agent loading** — agents defined in `.md` files with YAML frontmatter
- **`/sub` command** — set the model used by all subagents (with interactive picker)
- **Real-time progress** — live updates showing tool usage and token counts; duration is hidden while running and shown only on completion
- **Concurrency control** — configurable limit (default: 4 concurrent subagents)

## Commands

| Command | Description |
|---------|-------------|
| `/sub <model>` | Set the model for all subagents (e.g., `/sub anthropic/claude-sonnet-4-6`) |
| `/sub` | Open interactive model picker with autocomplete |

## Tool: `subagent`

**Single mode:**
```json
{ "agent": "scout", "task": "Find all auth-related files in src/" }
```

**Parallel mode:**
```json
{ "tasks": [
  { "agent": "scout", "task": "Map the database layer" },
  { "agent": "researcher", "task": "Best practices for connection pooling" }
]}
```

**Parameters:**
- `agent` (single mode) — name of the agent to invoke
- `task` (single mode) — task description
- `tasks` (parallel mode) — array of `{agent, task, cwd?}` objects
- `cwd` — optional working directory for the agent process

## How Model Selection Works

The model for subagents is resolved in this priority order:

1. **User-set model** via `/sub <model>` command
2. **Parent session's model** — inherited from the current conversation
3. **Fallback** — `"auto"` (provider default)

**Important:** Agents cannot specify their own model. The `/sub` command controls which model all subagents use.

## Agent Files

Agents are defined as `.md` files in the `agents/` directory with YAML frontmatter:

```markdown
---
name: scout
description: Fast codebase recon
tools: read, grep, find, ls
---

You are a codebase exploration agent. Your job is to quickly find
and report on relevant files and code patterns...
```

**Frontmatter fields:**
- **name** (required) — unique agent name, used in `{ agent: "name" }` calls
- **description** — short description shown in system prompt
- **tools** — comma-separated list of tools (builtin or extension)

The markdown body becomes the agent's system prompt.

## Registering Agents from Other Extensions

Other extensions can dynamically register agents at runtime via the global bridge:

```typescript
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

interface AgentConfig {
  name: string;
  description: string;
  tools: string[];
  systemPrompt: string;
  filePath: string;
}

const AGENTS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "agents");

function registerMyAgents(): void {
  const subagents = (globalThis as any).__pi_subagents as
    | { registerAgent: (config: AgentConfig) => void; unregisterAgent: (name: string) => void }
    | undefined;
  if (!subagents) return;

  for (const entry of fs.readdirSync(AGENTS_DIR)) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(AGENTS_DIR, entry);
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
    if (!frontmatter.name) continue;

    const tools = (frontmatter.tools || "").split(",").map(t => t.trim()).filter(Boolean);
    try {
      subagents.registerAgent({
        name: frontmatter.name,
        description: frontmatter.description || "",
        tools,
        systemPrompt: body,
        filePath,
      });
    } catch {
      // Already registered — skip
    }
  }
}
```

## Custom Tool Support

Built-in tools (`read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`) work automatically. For other tools, they must be mapped in `CUSTOM_TOOL_EXTENSIONS`:

| Tool | Extension Path |
|------|----------------|
| `web_search` | `web-search/index.ts` |
| `web_fetch` | `web-fetch/index.ts` |
| `safe_bash` | `tools/safe-bash.ts` |
| `video_extract` | `video-extract/index.ts` |
| `youtube_search` | `youtube-search/index.ts` |
| `google_image_search` | `google-image-search/index.ts` |
| `powershell` | `powershell/index.ts` |

## Config

Optional `config.json` next to `index.ts`:

```json
{ "maxConcurrency": 4 }
```

## Structure

```
subagents/
├── index.ts           # Extension entry point
├── agents/            # Agent configs (frontmatter + system prompt)
└── tools/             # Extensions loaded into subagent processes
    └── safe-bash.ts   # bash with dangerous command blocking
```

## Removing This Extension

Delete the `subagents/` directory:

```bash
rm -rf ~/.pi/agent/extensions/subagents/
```
