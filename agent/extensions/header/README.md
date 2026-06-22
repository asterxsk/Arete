# header

The pi header: an orange ascii-art banner on the left, an
info panel on the right showing version, provider, model, and working
directory, and a `● N skills` widget above the input area.

## What it renders

```
                                                                              ● 77 skills
▝██████████▘                          Arete v2.6.1
  ██    ██                                provider
  ██    ██                                model
 ▄██    ██▄                               /path/to/working/dir
```

The banner uses a **solid orange** (#ffa500) color for all non-space
characters. Whitespace cells stay uncolored so the silhouette reads
against the terminal background.

The info panel on the right shows:
- **Version** (orange)
- **Provider** (grey)
- **Model** (grey)
- **Working directory** (grey)

The skills widget above the input area reads both `~/.pi/agent/skills`
and `~/.agents/skills`, counting each subfolder that has a `SKILL.md`.

## Removal

Delete the `header/` folder. The header falls back to pi's default
blank header. The skills count widget disappears.
