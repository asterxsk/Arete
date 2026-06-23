# Timers Extension

A scheduling and timer utility for the pi-coding-agent, enabling one-shot delays, repeating intervals, and time-based notifications.

## Purpose

Manages background timers that can notify the LLM when they fire, useful for delays, periodic checks, and time-based workflows.

## Features

- **One-shot timers** – fire once after a specified duration
- **Repeating timers** – fire on an interval, with optional max repeat count
- **Progress bars** – visual countdown display in timer listings
- **Notifications** – fired timers inject a user message to wake the LLM
- **Interactive browser** – browse and manage timers via a TUI overlay
- **Widget integration** – displays countdown in the status area

## Commands

`/schedule` (aliased as `/timer` in docs):

| Subcommand | Description |
|---|---|
| `set <seconds> [label]` | Create a one-shot timer |
| `repeat <seconds> [label] [repeats=N]` | Create a repeating timer (0 = infinite) |
| `list` | List all active timers |
| `check` | Check timer status |
| `clear <id>` | Cancel a specific timer |
| `clear-all` | Cancel all active timers |
| `stats` | Show timer statistics |
| *(no args)* | Open interactive browser overlay |

## LLM Tool

The `schedule` tool is available for the LLM to programmatically set timers:

```
schedule DurationSeconds=300 Prompt="check download status"
```

Parameters:
- `DurationSeconds` (required) – duration in seconds
- `Prompt` (required) – message to include when the timer fires
- `MaxIterations` (optional) – max repeats (not currently used for intervals)

## Removing

Delete the extension directory:

```bash
rm -rf ~/.pi/agent/extensions/timers
```
