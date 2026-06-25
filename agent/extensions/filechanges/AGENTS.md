# filechanges

## Purpose
Tracks file modifications (edits and writes) per session with diff viewing, accept/decline controls, and a status widget showing change counts.

## Ownership
- File change tracking (baselines, diffs, accept/decline)
- `/filechanges`, `/filechanges-accept`, `/filechanges-decline` commands
- Status widget and UI updates for change counts
- Session-aware state reconstruction on branch navigation

## Local Contracts
- Registers commands: `/filechanges [hide|show|diff]`, `/filechanges-accept [force]`, `/filechanges-decline [force]`
- Hooks: `tool_call` (capture before snapshots), `tool_result` (commit changes), `session_start/switch/tree/fork` (rebuild state)
- Custom session entries: `filechanges:baseline`, `filechanges:clear`, `filechanges:untrack`
- Exposes `__pi_filechanges_counts` and `__pi_filechanges_lines` for other extensions

## Work Guidance
- Baselines stored per-file with original content (null if file was created)
- Diffs computed using `diff` library's `createTwoFilesPatch`
- Accept clears log without modifying files; Decline reverts files to original
- Widget auto-hides; use `/filechanges show` to re-enable
- State persisted via custom session entries, survives branch navigation

## Verification
- Edit a file via pi — verify change appears in status
- Run `/filechanges` — verify diff view shows changes
- Run `/filechanges-accept` — verify log cleared
- Run `/filechanges-decline` — verify file reverted

## Child DOX Index
None
