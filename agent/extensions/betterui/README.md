# Compact Tool Renderer

Replaces pi's default boxed tool rendering with a compact tree-style layout for **all** built-in tools.

## Visual Design

```
bash ls -lt "C:/Users/..." | head -5
│ ls: cannot access '...': No such file or directory
└ Took 0.1s

read src/index.ts
│ import { foo } from "bar"
│ function main() {
│ ...
└ 45 lines

edit src/app.ts  +5 -3
│ @@ -10,6 +10,8 @@
│ +  console.log("hi")
└ 3 lines truncated, ctrl+O to expand

grep "function" src/
│ src/index.ts:10: function main()
│ src/app.ts:5: function hello()
│ src/utils.ts:1: function helper()
└ 12 matches

find "*.ts" src/
│ src/index.ts
│ src/app.ts
│ ...
└ 3 files

ls src/
│ index.ts
│ app.ts
│ utils.ts
└ 3 entries
```

## Color Scheme

Only the **tool name** gets a background color. Content and footer use default terminal color.

| State | Tool Name BG | Tool Name Text |
|-------|------------|----------------|
| **Pending** | `#282832` (dark gray-blue) | White |
| **Done** | `#283228` (dark green-gray) | Default |
| **Error** | `#3c2828` (dark red) | White |

The tree connectors (`│` `└`) are dimmed. Everything else is default terminal color — no ANSI brightness/dim on the actual content.

## Tree Connectors

| Position | Character |
|----------|-----------|
| Content lines (middle) | `│` (dimmed) |
| Content lines (last, no footer) | `└` (dimmed) |
| Footer line | `└` (dimmed) |

## Tools Covered

| Tool | Name shown | Header shows | Footer shows |
|------|-----------|-------------|-------------|
| `bash` | `bash` | Command | `Took X.Xs` |
| `read` | `read` | File path | Line count |
| `write` | `write` | File path + line count | `Written` |
| `edit` | `edit` | Path + diff stats | Truncation info |
| `grep` | `grep` | Pattern + match count | Truncation info |
| `find` | `find` | Pattern + file count | Truncation info |
| `ls` | `ls` | Entry count + first entry | Truncation info |

## How It Works

Each built-in tool is re-registered with `renderShell: "self"`, delegating execution to the original via `createReadTool()`, `createBashTool()`, etc. Custom `renderCall()` and `renderResult()` methods return a `CompactToolBox` component.

- **`renderCall`** shows the header line (colored tool name + args)
- **`renderResult`** shows content lines + footer (with `noHeader: true` to avoid duplication)

Timing for bash is measured by wrapping `execute()` with a `start/end` timer stored in `details._bashDurationMs`.

## Installation

Auto-loads from `~/.pi/agent/extensions/betterui/` after pi restart or `/reload`.

```bash
pi -e ~/.pi/agent/extensions/betterui/index.ts
```
