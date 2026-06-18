# filechanges (pi extension)

Tracks files changed (modified/created) by **pi** via the built-in `edit` and `write` tools.

## Features

- Persistent log (stored in session as custom entries)
- Exposes file change counts via `globalThis.__pi_filechanges_counts` (rendered by the `statusline` extension)
- Exposes file change lines via `globalThis.__pi_filechanges_lines` (rendered by the `todos` widget)
- `/filechanges` to toggle the filechanges widget visibility (`hide` / `show`)
- `/filechanges-accept` to clear the log (keep files)
- `/filechanges-decline` to revert logged changes (restore original contents / delete created files)

## Usage

1. Reload pi: `/reload`
2. Make changes through pi (using `edit`/`write`)
3. Run:
   - `/filechanges` to toggle the widget
   - `/filechanges hide` to hide the widget
   - `/filechanges show` to show the widget
   - `/filechanges-accept` to accept
   - `/filechanges-decline` to decline

### Non-interactive usage

If `ctx.hasUI` is false (print/json mode), accept/decline require explicit confirmation:

- `/filechanges-accept force`
- `/filechanges-decline force`

## Notes

- Only tracks changes performed through `edit` and `write` tools.
- To support "decline", the extension stores the original file contents (before the first pi change) in the session file as a custom entry.
- The diff itself is not rendered as an overlay; the widget shows file paths and `+x/-y` counts.
