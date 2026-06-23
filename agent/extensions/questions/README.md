# questions

Interactive TUI tool for asking structured, multi-choice questions with a
free-text fallback and optional ASCII sketch.

## Features

- 1–10 questions per call, each with its own tab
- 1–10 preset options per question, plus a built-in "Type your own answer"
- Optional ASCII sketch (diagram or wireframe) to help the user decide
- Tabbed navigation with a review/submit screen for multi-question flows
- Keyboard-driven: Tab/Shift+Tab between tabs, Up/Down for options, Enter to select, Esc to cancel
- Collapsible tool result (Ctrl+O to expand) when betterUI is active

## When the LLM uses it

When the LLM needs a specific decision or preference from the user and would
otherwise emit open-ended text. The LLM is steered (via the tool's
`promptGuidelines`) to:

- Ask 1-10 questions in one call
- Give each a unique `id` and a short 1-2 word `label` (tab header)
- Provide 2-10 explicit preset options per question
- The UI automatically appends "Type your own answer" — no need to add a free-text option
- Use the optional `sketch` field for ASCII diagrams, **not** to restate answer
  options in square brackets

## Removal

Delete the `questions/` folder. The `questions` tool disappears.
