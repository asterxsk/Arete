# filechanges (pi extension)

Tracks files changed (modified/created) by **pi** via the built-in `edit` and `write` tools.

## Features

- **Diff tracking**: Records original file content before first pi change, computes unified diffs
- **Persistent state**: Session entries (`filechanges:baseline`, `filechanges:clear`, `filechanges:untrack`) survive session navigation
- **Widget**: Shows up to 8 most-recently-modified files with `+n/-n` line counts; "…and N more" for overflow
- **Status bar**: Displays `Δ edited + created` counts (rendered by the `statusline` extension)
- **Session-aware**: Rebuilds state on `session_start`, `session_switch`, `session_tree`, `session_fork`

## Commands

| Command | Description |
|---------|-------------|
| `/filechanges` | Toggle widget visibility |
| `/filechanges show` | Show the widget |
| `/filechanges hide` | Hide the widget |
| `/filechanges-accept` | Accept changes (keep files, clear log) |
| `/filechanges-decline` | Decline changes (revert files, clear log) |

## Non-interactive usage

If `ctx.hasUI` is false (print/json mode), accept/decline require the `force` flag:

- `/filechanges-accept force`
- `/filechanges-decline force`

## How to remove

Delete the `filechanges` folder from `~/.pi/agent/extensions/` and restart pi.

## Notes

- Only tracks changes performed through `edit` and `write` tools.
- Original file content is stored in session entries to enable decline (revert).
- Files that return to their original content are automatically untracked.
- The diff is not rendered as an overlay; the widget shows file paths and `+x/-y` line counts.
