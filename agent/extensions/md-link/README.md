# md-link

Markdown collaborative editor: link a `.md` file to the session for
collaborative editing. Agent responses are appended to the file (viewable
rendered in Obsidian). User edits the file directly, then sends changes back
via `/send-diff`.

## Features

- **Session persistence** — linked file is restored on session restart via a
  custom session entry.
- **Auto-create** — `/link-md` creates the file and parent directories if they
  don't exist.
- **Status bar** — shows the linked filename in the status bar.
- **Smart diffing** — detects simple appends (sent as raw text) vs. inline
  edits (sent as `Removed: … Replaced with: …` with line context).

## Commands

- `/link-md <filepath>` — link a markdown file to this session
- `/unlink-md` — unlink the current file
- `/send-diff` — send your edits as a message to the agent
- `/sd` — alias for `/send-diff`

## How it works

1. Link a file with `/link-md`.
2. Agent responses (excluding intermediate tool-call messages) are appended to
   the linked file, separated by horizontal-rule dividers.
3. Edit the file directly in your editor (e.g. Obsidian).
4. Run `/send-diff` to send your changes back to the agent.

## Removal

Delete the `md-link/` folder. All four commands disappear.
