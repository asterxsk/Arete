# profile-switcher

Manage and switch between multiple authentication profiles per provider (e.g., personal vs. work GitHub accounts, different Copilot plans).

## Purpose

When you have multiple accounts for the same provider—work and personal GitHub, two Copilot subscriptions, multiple API key tiers—this extension lets you switch which credentials pi uses without editing config files or restarting.

## Features

- **Switch profiles** — activate a different credential set for any provider
- **Create profiles** — add new profiles via OAuth login or by pasting an API key
- **Rename profiles** — give profiles descriptive names
- **Delete profiles** — remove unused credentials (requires confirmation)
- **Auto-normalization** — migrates legacy `auth.json` formats to the profile structure on load
- **Live updates** — changes apply immediately; no restart required

## Command

`/profile` — opens the interactive profile switcher dialog.

### Keybindings

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate profiles |
| `Enter` | Switch to selected profile |
| `Ctrl+N` | Create new profile |
| `Ctrl+R` | Rename selected profile |
| `Ctrl+D` | Delete selected profile (press twice to confirm) |
| `Esc` | Close dialog |

## Storage

Profiles are stored in `~/.pi/agent/auth.json` under the `profiles` key, grouped by provider. The active profile is also synced to the top-level provider key for compatibility.

## Removal

Delete the `profile-switcher/` folder. The `/profile` command and dialog disappear; pi uses whatever credential is at the top level of `auth.json` for each provider.
