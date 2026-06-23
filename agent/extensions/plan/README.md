# Plan Mode Extension

A toggle for read-only exploration mode. Run `/plan` to disable edit/write tools and block destructive shell commands.

## Usage

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode on/off |

## What Plan Mode Does

**When enabled:**
- Disables `edit` and `write` tools
- Blocks destructive commands in both Bash and PowerShell:
  - File operations (`rm`, `mv`, `cp`, `mkdir`, `Remove-Item`, `Move-Item`, etc.)
  - System (`sudo`, `kill`, `reboot`, `shutdown`)
  - Package managers (`npm install`, `pip install`, `apt install`, etc.)
  - Git writes (`git add`, `git commit`, `git push`, `git merge`, etc.)
  - File redirects (`>`, `>>`)
  - Editors (`vim`, `nano`, `code`)
  - Destructive tools (`dd`, `shred`, `truncate`)
  - Services (`systemctl`, `service`)
- Shows `⏸ plan` indicator in the footer

**When disabled:** Full access restored, indicator removed.

## Removal

Delete the directory and restart the agent:
```bash
rm -rf ~/.pi/agent/extensions/plan
```