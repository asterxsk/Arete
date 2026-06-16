# header

The pi header: a blackhole-themed ascii-art banner on the left, a
loaded-extensions box on the right, and a `● N skills` widget above
the input area.

## What it renders

```
                                                                              ● 77 skills
                                       +- extensions (16) ---------+
[blackhole art — surreal ripple]       | agents                    │
[black core → orange mid → yellow rim] | context                   │
[the colour bands undulate like        | ...                       │
 a cosmic interference pattern]        |                           │
                                       +---------------------------+
```

The blackhole has a **surreal three-tone gradient**:

- **Core**      → **black**  — the singularity
- **Mid band**  → **orange** — inner accretion disk
- **Outer edge** → **yellow** — corona / strange glow

A sine-wave interference pattern ripples the colour boundaries
horizontally so the bands never lie flat — dreamlike, cosmic,
slightly unsettling.

Whitespace cells stay uncolored so the silhouette reads against the
terminal background. The character itself is preserved; only the
surrounding ANSI color changes.

The extensions box uses **90-degree corners** (ASCII `+`, `-`, `|`)
with an **orange** border and title, and **white** folder names.

The extensions box uses **orange** for the border and the title, and
**white** for the folder names.

The skills widget above the input area reads both `~/.pi/agent/skills`
and `~/.agents/skills`, counting each subfolder that has a `SKILL.md`.

## Removal

Delete the `header/` folder. The header falls back to pi's default
blank header. The skills count widget disappears.
