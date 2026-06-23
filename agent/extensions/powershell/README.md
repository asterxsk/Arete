# PowerShell Extension for Pi

A Pi coding-agent extension that exposes a `powershell` tool, allowing the agent to execute PowerShell commands and scripts on the local Windows system.

## Features

- Execute any PowerShell cmdlet, script, or command from within a Pi session
- Multi-line scripts work as-is — encoding is handled automatically via `-EncodedCommand`
- Reports stdout, stderr, and exit code for every invocation
- Supports cancellation through Pi's abort signal
- **Compact UI rendering** — matches compactui style: orange `pwsh` tool name, args truncated to 50 chars, pipe-framed expanded output with duration footer

## Registered Tool

| Name | Parameters | Description |
|------|-----------|-------------|
| `powershell` | `command` (string) | Execute a PowerShell command or script |

## Usage Guidelines

- Use for Windows system administration, file operations, registry access, WMI/CIM queries, process management, service control, or .NET interop.
- The tool runs from the agent's current working directory.
- Use `Set-Location` or full paths instead of `cd`/`chdir`.
- Append `| Out-String` to ensure output is captured as readable text.

## How to Remove

Delete the `powershell` directory from your Pi extensions folder:

```
C:\Users\prithish\.pi\agent\extensions\powershell\
```

Then restart Pi.
