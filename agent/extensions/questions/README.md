# questions

`questions` tool — multi-choice TUI prompts with tabs, free-text fallback,
optional ASCII sketch, custom answer editor, review/submit tab.

## When the LLM uses it

When the LLM needs a specific decision or preference from the user and would
otherwise emit open-ended text. The LLM is steered (via the tool's
`promptGuidelines`) to:

- Ask 1-10 questions in one call
- Give each a unique `id` and a short 1-2 word `label` (tab header)
- Provide 2-10 explicit preset options per question
- The UI always appends "Type your own answer" — no need to add a free-text option
- Use the optional `sketch` field for ASCII diagrams, **not** to restate answer
  options in square brackets

## Removal

Delete the `questions/` folder. The `questions` tool disappears.
