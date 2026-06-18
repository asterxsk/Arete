# Better Compaction

Applies betterui tree-style rendering to compaction messages.

## What it does

Patches the core `CompactionSummaryMessageComponent` to use the `CompactToolBox` style instead of the default Box layout. Removes the background color for a cleaner look.

```
compaction compacted from 145k tokens
│ Compacted from 145k tokens
│ Previous conversation history summarized...
└ press ctrl+O to expand
```

## How it works

- Intercepts `CompactionSummaryMessageComponent.updateDisplay()` at runtime
- Replaces the Box + Text layout with a `CompactToolBox` component
- Shows a preview of the compaction summary (first 6 lines)
- Footer indicates how to expand the full summary
- Strips background ANSI codes for transparent appearance

## Requirements

Requires the `betterui` extension to be installed.

## Removing

Delete the `agent/extensions/better-compaction/` folder.
