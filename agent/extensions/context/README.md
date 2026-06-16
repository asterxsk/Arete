# context

`/context` command — overlay showing context-window usage as a colored
ANSI-256 grid: system prompt, user messages, assistant text, thinking,
per-tool tokens (read, bash, edit, write, grep, find, ls, subagent,
web_search, web_fetch, ask_user, video, img_search, yt_search, custom),
compaction, custom messages, images, free space.

## What it does

- Renders a centered overlay with a grid of 2-char colored cells, one
  cell per ~1/N tokens
- Shows a legend (category + token count + percentage) below the grid
- Shows session stats: turns, messages, cache read, cache write, cost
- Warns at 80% / 95% / biggest-tool-consumer-20%+
- Shows a **Copilot usage line** at the top of the stats section (read
  from the `globalThis.__pi_copilot_usage` bridge; falls back to
  "loading…" / "not logged in" / "bridge not installed" placeholders)

## Copilot usage support file

`context/copilot-usage.ts` is loaded as a sibling file inside the
`context/` extension folder. On `session_start` it:

- Fetches the GitHub Copilot quota via the OAuth + quota API
- Exposes the latest `CopilotUsageSummary` (or `"loading"` /
  `"not-logged-in"`) via `globalThis.__pi_copilot_usage`
- Refreshes every 10 minutes

Other extensions (statusline, the future `/agent` dashboard) read the
bridge to render the copilot meter without re-fetching.

## Removal

Delete the `context/` folder. The `/context` command disappears, and
the Copilot usage bridge stops being installed. Other extensions that
read the bridge will see "bridge not installed".
