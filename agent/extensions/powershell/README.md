# powershell

`powershell` tool — runs `powershell.exe -EncodedCommand` for Windows system
admin. Available to the LLM as a callable tool.

## What the tool does

- Spawns `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand …`
- Returns stdout/stderr/exit code
- Supports abort via the AbortSignal

## When the LLM uses it

For: Windows system administration, file operations, registry, WMI/CIM
queries, process management, service control, .NET interop.

The tool's `promptGuidelines` steer the LLM away from `cd/chdir` (use
`Set-Location` or pass full paths) and toward `| Out-String` to capture text.

## Removal

Delete the `powershell/` folder. The `powershell` tool disappears.
