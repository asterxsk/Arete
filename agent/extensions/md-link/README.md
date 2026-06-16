# md-link

Markdown collab editor: link a `.md` file to the session for collaborative
editing. Agent responses are appended to the file (viewable rendered in
Obsidian). User edits the file directly, then sends changes back via
`/send-diff`.

## Commands

- `/link-md <filepath>` — link a markdown file to this session
- `/unlink-md` — unlink the current file
- `/send-diff` (or `/sd`) — send your edits as a message to the agent

## How it works

- On session start, the extension restores the last linked file from a
  custom session entry.
- After each assistant message that doesn't include tool calls, the response
  text is appended to the linked file with a horizontal-rule separator.
- On `/send-diff`, the extension reads the file, computes a diff against the
  last known content, and sends either the appended text (simple case) or a
  "Removed: … Replaced with: …" message (inline edits).

## Removal

Delete the `md-link/` folder. The three commands disappear.
