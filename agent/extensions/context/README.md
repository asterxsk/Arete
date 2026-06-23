# context

`/context` command — overlay showing context-window usage as a colored
ANSI-256 grid with per-category breakdowns and session statistics.

## Purpose

Visualize how much of the context window is consumed by different parts
of the conversation: system prompt sections, user messages, assistant
text, thinking, tool results (per-tool), compaction summaries, custom
messages, images, and free space. Helps diagnose context pressure and
optimize tool usage.

## Features

- **Colored grid overlay**: 2-char wide cells, one per ~1/N tokens,
  rendered as a centered ANSI-256 grid
- **Per-category legend**: token count + percentage for each category
- **System prompt breakdown**: Base, Tools, Skills, Guidelines, Docs
- **Per-tool breakdown**: read, bash, edit, write, grep, find, ls,
  subagent, web_search, web_fetch, ask_user_question, video_extract,
  google_image_search, youtube_search (sorted by token count)
- **Session stats**: turns, messages, cache read, cache write, cost
- **Copilot usage line**: shows quota bar, percentage, and used/total
- **Warnings**: at 80% context usage, 95% context usage, and when a
  single tool consumes >20% of context
- **Dismissable**: press Escape, q, or Return to close

## Commands

| Command     | Description                                      |
|-------------|--------------------------------------------------|
| `/context`  | Show context window usage overlay                |

## Copilot usage bridge

`context/copilot-usage.ts` runs on `session_start` and:

1. Fetches GitHub Copilot quota via the OAuth + quota API
2. Exposes the latest `CopilotUsageSummary` (or `"loading"` /
   `"not-logged-in"`) via `globalThis.__pi_copilot_usage`
3. Refreshes every 10 minutes
4. Cleans up on `session_shutdown`

Other extensions (statusline, etc.) read the bridge to render the
copilot meter without re-fetching.

## Removal

Delete the `context/` folder. The `/context` command disappears, and
the Copilot usage bridge stops being installed. Other extensions that
read the bridge will see "bridge not installed".
