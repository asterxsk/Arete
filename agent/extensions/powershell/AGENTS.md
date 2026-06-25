# powershell

## Purpose
Registers a `powershell` tool that executes PowerShell commands on the local Windows system, with compact/expanded UI rendering and full stdout/stderr capture.

## Ownership
- `powershell` tool registration and execution logic
- Command encoding (UTF-16LE base64 for `-EncodedCommand`)
- Compact and expanded result rendering components
- Duration formatting and output display

## Local Contracts
- **Tool**: `powershell` — accepts `{ command: string }`, returns stdout/stderr/exitCode
- **Parameters**: `Type.Object({ command: Type.String() })`
- **Prompt snippet**: Documents PowerShell use cases and guidelines
- **Render**: `renderCall` (compact), `renderResult` (expanded with output lines and duration)
- **Execution**: Spawns `powershell.exe` with `-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand`
- **Signal**: Supports abort via `signal.addEventListener("abort", ...)`

## Work Guidance
- Uses `ctx.cwd || process.cwd()` as working directory
- Exit code 0 = success; non-zero with stderr = error
- Compact mode shows first line of args with "(ctrl+o to expand)" hint
- Expanded mode shows up to 50 lines with footer duration
- `renderShell: "self"` — tool manages its own shell rendering

## Verification
- Run a simple command: `powershell("Write-Output 'hello'")`
- Verify exit code 0 and stdout captured
- Run a failing command and verify error state with stderr
- Check compact vs expanded rendering modes in the UI

## Child DOX Index
None
