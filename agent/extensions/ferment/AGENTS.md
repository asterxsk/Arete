# ferment

## Purpose
Structured delivery framework extension. Exposes tools to scaffold, scope, phase, and verify long-running agent tasks via the Ferment methodology.

## Ownership
- Tools: `propose_ferment_scoping`, `scope_ferment`, `activate_ferment_phase`, `refine_ferment_phase`, `start_ferment_step`, `complete_ferment_step`, `verify_ferment_step`, `complete_ferment_phase`, `skip_ferment_phase`, `fail_ferment_phase`, `skip_ferment_step`, `fail_ferment_step`, `complete_ferment`.
- Step and phase lifecycle verification logic.
- Local `ferment.json` store for ferment states.

## Local Contracts
- Exposes tools to the agent context via `pi.on("session_start")`.
- Stores state in `~/.pi/ferments/`.
- Requires gates to pass before completing steps/phases.

## Work Guidance
- If you modify the step/phase schema, ensure you update the `types.ts` and ensure backward compatibility in `ferment-store.ts`.
- Phases with the same `parallelGroup` number run concurrently. Activating any phase in a group auto-activates all pending siblings in that group via `activate_ferment_phase`.
- Steps with the same `parallelGroup` number run concurrently within a phase. Starting any step in a group auto-starts all pending siblings in that group via `start_ferment_step`.
- Set `parallelGroup` during scoping (`propose_ferment_scoping`) or during refinement (`refine_ferment_phase`).

## Verification
- Run `npm test` if tests are added, or manually verify that the LLM receives all 13 ferment tools (`propose_ferment_scoping`, `scope_ferment`, `activate_ferment_phase`, `refine_ferment_phase`, `start_ferment_step`, `complete_ferment_step`, `verify_ferment_step`, `complete_ferment_phase`, `skip_ferment_phase`, `fail_ferment_phase`, `skip_ferment_step`, `fail_ferment_step`, `complete_ferment`) on session start.

## Child DOX Index
None.
