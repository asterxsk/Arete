import { GateVerdict, Step, Phase, Ferment } from "./types.js";

export function requireVerdicts(
  expected: string[],
  actual?: GateVerdict[]
): { ok: boolean; missing: string[] } {
  const missing = expected.filter(
    (id) => !actual?.some((v) => v.id === id)
  );
  return { ok: missing.length === 0, missing };
}

export function anyFlagged(actual?: GateVerdict[]): boolean {
  return !!actual?.some((v) => v.verdict === "flag");
}

export function validateStepGates(step: Step): { ok: boolean; reason?: string } {
  const { ok, missing } = requireVerdicts(["S1", "S2", "S3"], step.gateVerdicts);
  if (!ok) return { ok: false, reason: `Missing gates: ${missing.join(", ")}` };
  if (anyFlagged(step.gateVerdicts)) return { ok: false, reason: "A step gate was flagged" };
  return { ok: true };
}

export function validatePhaseGates(phase: Phase): { ok: boolean; reason?: string } {
  const { ok, missing } = requireVerdicts(["F1", "F2", "F3"], phase.gateVerdicts);
  if (!ok) return { ok: false, reason: `Missing gates: ${missing.join(", ")}` };
  if (anyFlagged(phase.gateVerdicts)) return { ok: false, reason: "A phase gate was flagged" };
  return { ok: true };
}

export function validateCompletionGates(ferment: Ferment): { ok: boolean; reason?: string } {
  const { ok, missing } = requireVerdicts(["C1", "C2", "C3"], ferment.gateVerdicts);
  if (!ok) return { ok: false, reason: `Missing gates: ${missing.join(", ")}` };
  if (anyFlagged(ferment.gateVerdicts)) return { ok: false, reason: "A completion gate was flagged" };
  return { ok: true };
}
