# prompt

Injects custom system instructions into the system prompt before every agent turn.

## Purpose

Appends a `## Custom Instructions` block to enforce consistent behavior and workflow conventions across all agent interactions.

## Features

- **Shell Preference**: PowerShell is the default shell; Bash is used only when absolutely necessary or explicitly requested.
- **Task Tracking**: Uses the `todo` system to map out and track progress for multi-step processes.
- **Task Clearing**: Clears the existing todo list when a new task begins or when making improvements to a completed task.
- **Asynchronous Workflows**: Proactively utilizes background tasks and scheduling tools for long-running operations.
- **Questions**: Uses the `questions` tool for user clarification/input rather than plain text questions.
- **Caveman Mode**: Uses caveman mode at high intensity by default to minimize token usage.
- **Visual Styling**: Includes no emojis; only Nerd Font icons are used.

## Removal

Delete the `prompt/` folder to remove these custom instructions from your environment.
