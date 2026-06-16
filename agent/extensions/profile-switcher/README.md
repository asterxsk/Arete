# profile-switcher

Switch between saved auth profiles per provider (e.g. two GitHub accounts,
one Copilot and one enterprise Copilot).

## What it does

- Reads `~/.pi/agent/auth.json` and groups credentials by provider
- Surfaces a profile picker in the TUI
- Activates the chosen profile without a restart

## When to use

When you have multiple accounts on the same provider (work + personal, two
GitHub orgs with different Copilot plans) and want to switch which one pi
authenticates as.

## Removal

Delete the `profile-switcher/` folder. The profile-switching UI disappears;
pi uses the first credential in `auth.json` for each provider.
