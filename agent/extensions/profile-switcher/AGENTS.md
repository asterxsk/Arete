# profile-switcher

## Purpose
Manages auth provider profiles — switch, create, rename, or delete credentials via the `/profile` command. Reads and writes `~/.pi/agent/auth.json`.

## Ownership
- `/profile` command registration and handler loop
- Profile CRUD operations (switch, rename, delete, create)
- Auth file read/write (`~/.pi/agent/auth.json`)
- Interactive TUI dialog (`ProfileSwitcherComponent`)
- OAuth login flow for supported providers
- Runtime auth refresh after profile changes

## Local Contracts
- **Command**: `/profile` — opens interactive profile management dialog
- **Auth file schema**: `AuthFile` with `profiles` (per-provider groups) and top-level provider credentials
- **Profile operations**: `switchProfile()`, `renameProfile()`, `deleteProfile()`, `addCreatedProfile()`
- **OAuth integration**: `runOAuthLogin()` via `ctx.modelRegistry.authStorage.login()`
- **Runtime refresh**: `updateRuntimeAuth()` calls `authStorage.reload()` + `modelRegistry.refresh()`
- **TUI component**: `ProfileSwitcherComponent` — keyboard-driven list with ↑↓, Enter, ^N, ^R, ^D, Esc

## Work Guidance
- Auth file normalization runs on every load — handles legacy formats and ensures consistent state
- `syncTopLevelFromGroup()` keeps top-level credential in sync with active profile
- OAuth providers are detected via `authStorage.getOAuthProviders()`
- API key profiles are created via `ctx.ui.input()` prompt
- The handler runs in a while(true) loop — exits only on cancel or successful switch
- Delete requires double-press of ^D (armed state) for safety

## Verification
- Run `/profile`, verify profile list renders correctly
- Switch between profiles, confirm auth is refreshed
- Create a new API key profile, verify it appears in auth.json
- Rename and delete profiles, verify persistence
- Test OAuth login flow for supported providers

## Child DOX Index
None
