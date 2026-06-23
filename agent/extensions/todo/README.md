# rpiv-todo

A Pi Agent extension that gives the model a persistent todo list across long sessions. Tasks survive `/reload` and conversation compaction by replaying from the conversation branch.

## What It Does

- Registers the **`todo`** tool for the model to create, update, list, get, delete, and clear tasks
- Registers the **`/todos`** slash command to print the current todo list
- Displays a **live overlay widget** above the editor showing the model's plan
- Persists task state through **branch replay** (not disk) — survives session compact and `/reload`

## Features

- **4-state task machine**: `pending` ⇄ `in_progress` → `completed`, any → `deleted` (tombstone)
- **Dependency tracking** with `blockedBy` and cycle detection
- **Auto-hiding overlay** when no tasks exist
- **Completed tasks fade out** after the next agent response starts
- **12-line collapse threshold** — completed tasks drop first on overflow

## Lifecycle Handling

| Event | Behavior |
|-------|----------|
| `session_start` | Replays state from branch, initializes overlay |
| `session_compact` | Replays state (handles stale context gracefully) |
| `session_tree` | Replays state from current branch |
| `session_shutdown` | Disposes overlay |
| `tool_execution_end` | Updates overlay after `todo` tool runs |
| `agent_start` | Hides completed tasks from previous turn |

## Optional: Localization

The extension works standalone with English UI. Install `@juicesharp/rpiv-i18n` alongside it to enable locale support (overlay headings, section headers, status words).

## How to Remove

```bash
pi uninstall rpiv-todo
```

Then restart your Pi session.
