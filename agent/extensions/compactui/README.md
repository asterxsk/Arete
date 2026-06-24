# CompactUI Extension

Compact tool rendering with output truncation for pi-coding-agent.

## Purpose

Replaces the default tool output UI with a compact, minimal rendering style. Each tool call shows a single indented line with the tool name in orange, its arguments, and an "(ctrl+o to expand)" hint. Tool output is also truncated to keep LLM context manageable.

## Features

- **Global flag** — Sets `__pi_betterui_enabled` on `globalThis` to enable compact UI in other extensions (web search, tasks, timers, questions)
- **Compact call display** — Single-line tool calls with orange tool names and dim hints
- **Args truncation** — Tool arguments are truncated to 50 characters in collapsed headers (e.g. `bash [git log --oneline --graph --decorate --all...]`)
- **Expandable results** — Press `ctrl+o` to toggle expanded/collapsed view with pipe-framed output
- **Read line range** — Expanded read header shows line range (e.g. `read[1-127, /path/to/file.ts]`)
- **Output truncation** — Long outputs from `bash`, `powershell`, and `run_command` are capped at 5 lines for the LLM (expandable in UI)
- **Diff colorization** — Edit tool diffs show additions (green bg/text) and deletions (red bg/text) with 50% translucency
- **Duration tracking** — Expanded views show how long each tool call took

## Tools Re-registered

This extension overrides rendering for all 7 built-in tools:

| Tool | Description |
|------|-------------|
| `read` | Read file contents |
| `write` | Write/create files |
| `edit` | Edit files with text replacement |
| `bash` | Execute shell commands |
| `ls` | List directory contents |
| `grep` | Search for patterns in files |
| `find` | Find files by name/pattern |

## Extensions Enabled

Setting `__pi_betterui_enabled` enables compact UI in these extensions:

| Extension | Tool |
|-----------|------|
| `pi-web-access` | `web_search` |
| `questions` | `questions` |
| `tasks` | `tasks` |
| `timers` | `timers` |

## How to Remove

Delete the extension directory:

```
rm -rf ~/.pi/agent/extensions/compactui
```

Or disable it in your pi configuration if you have an extensions config.
