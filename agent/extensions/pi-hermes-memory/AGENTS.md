# pi-hermes-memory

## Purpose
Persistent memory system for Pi — stores facts, user profile, and procedural skills across sessions via MEMORY.md/USER.md and SQLite. Includes background learning, auto-consolidation, correction detection, session search, and multiple slash commands.

## Ownership
- Memory persistence (MEMORY.md, USER.md, projects-memory/)
- SQLite database (session indexing, memory search, skill storage)
- Session lifecycle (load on start, flush on shutdown, index on message_end)
- Skill discovery and migration (global + project skills)
- All `/memory-*` commands and `memory`/`skill`/`session_search`/`memory_search` tools

## Local Contracts
- **Entry point**: `src/index.ts` — orchestrates all subsystems
- **Config**: `config.ts` (`loadConfig()`)
- **Stores**: `MemoryStore`, `SkillStore`, `DatabaseManager` (from `store/`)
- **Handlers**: `handlers/` — background-review, session-flush, correction-detector, auto-consolidate, insights, skills, interview, switch-project, index-sessions, learn-memory, sync-markdown-memories, preview-context, session-backfill, session-live-index
- **Tools**: `tools/` — memory-tool, skill-tool, session-search-tool, memory-search-tool
- **ExtensionAPI hooks**: `session_start`, `before_agent_start`, `message_end`, `session_shutdown`, `resources_discover`
- **Paths**: `paths.ts` exports `AGENT_ROOT`
- **Commands**:
  - `/memory-insights` — view stored memories
  - `/memory-skills` — list procedural skills
  - `/memory-consolidate` — trigger manual consolidation
  - `/memory-interview` — interactive memory interview
  - `/memory-switch-project` — switch active project context
  - `/memory-learn` — learn from current context
  - `/memory-sync-markdown` — sync markdown memories to SQLite
  - `/memory-preview-context` — preview what will be injected into system prompt
  - `/memory-index-sessions` — manually trigger session indexing

## Work Guidance
- DB shutdown ordering is critical — `dbManager.close()` must be the last DB-writing handler registered for `session_shutdown`
- Session backfill and live indexing run asynchronously; shutdown waits with timeout
- Legacy migration (`migrateLegacyProjectMemoryDirs`, `migrateExtensionRoot`) is best-effort, never blocks
- Markdown-to-SQLite sync is best-effort on startup — failures should not crash extension
- Project detection uses `detectProject()` from `project.js`
- Skill discovery is project-aware — `resources_discover` event triggers re-evaluation

## Verification
- Start a session, ask questions, verify memory is saved to `~/.pi/agent/pi-hermes-memory/`
- Run `/memory-insights` to verify stored memories
- Run `/memory-skills` to verify skill listing
- Run `/memory-consolidate` to trigger manual consolidation
- Check SQLite DB exists and sessions are indexed after shutdown

## Child DOX Index
- `src/store/` — Data layer: MemoryStore, SkillStore, DatabaseManager, session indexer/parser
- `src/handlers/` — Event handlers and background processes
- `src/tools/` — Tool registrations (memory, skill, session-search, memory-search)
