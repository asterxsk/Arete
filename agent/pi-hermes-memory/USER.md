User is prithish (username from path), a technically sophisticated Pi agent user on Windows. Prefers concise communication — responds with single characters ("a", "l"). Wants to understand how things work under the hood ("check how the new hermes memory pi extension works"). Has an extensive setup with many Pi extensions, npm packages, and AI-related tools. Comfortable exploring filesystem internals and reading source code directly. <!-- created=2026-06-22, last=2026-06-22 -->
§
User clones npm-installed Pi extensions to ~/.pi/agent/extensions/ before modifying them, so changes survive pi uninstall. <!-- created=2026-06-23, last=2026-06-23 -->
§
User prefers extensions to be fully self-contained with no external npm dependencies when cloned locally, so they can freely edit them. They expect cloned extensions to be independent of the original npm package. <!-- created=2026-06-23, last=2026-06-23 -->
§
User cares about UI consistency across tools — wants PowerShell output to display in the same format as bash (command line, then output, then timing like "Took 0.2s"). Details-oriented about UX polish. <!-- created=2026-06-23, last=2026-06-23 -->
§
User wants PowerShell tool output formatted exactly like bash: one line showing the command invoked, then stdout/stderr output, then a timing line like "Took 0.2s". Consistency of tool output formatting across all shell tools matters to them. <!-- created=2026-06-23, last=2026-06-23 -->
§
Prefers pi extensions to be self-contained with no external npm dependencies so they can freely edit the code. When cloning an npm-installed extension to local (~/.pi/agent/extensions/), inline all its mono-repo sibling dependencies (like @juicesharp/rpiv-config) into the local copy. <!-- created=2026-06-23, last=2026-06-23 -->
§
Cares about consistent TUI display across tools — wants the powershell tool to display like bash (command line header, output, "Took Xs" timing). Wants tool output truncation to have a clear "N more lines, M total, ctrl+o to expand" indicator with actual expand-on-ctrl+o support. <!-- created=2026-06-23, last=2026-06-23 -->