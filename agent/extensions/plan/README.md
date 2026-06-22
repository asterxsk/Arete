# Plan Mode Extension

A simple `/plan` slash command that toggles the agent between read-only mode and full YOLO mode.

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode on/off |

## How It Works

### Plan Mode Enabled (`/plan`)
- **Tools disabled**: `edit`, `write` (all other tools remain available)
- **Bash restricted**: Destructive commands are blocked:
  - File operations: `rm`, `mv`, `cp`, `mkdir`, `touch`, `chmod`, `chown`
  - System: `sudo`, `su`, `kill`, `reboot`, `shutdown`
  - Package managers: `npm install`, `yarn add`, `pip install`, `apt install`, `brew install`
  - Git writes: `git add`, `git commit`, `git push`, `git merge`, `git rebase`, `git reset`
  - File redirects: `>`, `>>`
  - Editors: `vim`, `nano`, `code`, `subl`
  - Dangerous: `dd`, `shred`, `tee`, `truncate`
  - Services: `systemctl start|stop|restart`, `service start|stop|restart`
- **Footer indicator**: Shows `⏸ plan` in the status bar

### Plan Mode Disabled (`/plan` again)
- All tools restored
- Bash unrestricted
- Footer indicator removed

## Implementation Details

- Uses `pi.registerCommand("plan", ...)` for the toggle handler
- Uses `pi.setActiveTools()` / `pi.getActiveTools()` to filter edit/write tools
- Uses `pi.on("tool_call")` to intercept and block destructive bash commands
- Uses `ctx.ui.setStatus("plan", ...)` for the footer indicator
- Simple boolean state `let planMode = false`

## Removal

To remove the extension, delete the directory:
```bash
rm -rf ~/.pi/agent/extensions/plan
```

Then restart the agent.