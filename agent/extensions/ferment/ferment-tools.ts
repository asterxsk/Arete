import { randomUUID } from "node:crypto";
import { store } from "./ferment-store.js";
import { runVerifyCommand } from "./verify.js";
import {
  validateStepGates,
  validatePhaseGates,
  validateCompletionGates,
} from "./gates.js";
import {
  Ferment,
  Phase,
  Step,
  GateVerdict,
} from "./types.js";

function newId(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

export function proposeFermentScoping(args: {
  title: string;
  goal: string;
  successCriteria: string[];
  assumptions?: string[];
  constraints?: string[];
  phases: { name: string; goal: string; description?: string; parallelGroup?: number }[];
  gates: GateVerdict[];
  questions?: { id: string; question: string; type: string }[];
}): Ferment {
  for (const [i, p] of args.phases.entries()) {
    if (!p.goal) {
      throw new Error(`P1 failed: phase ${i + 1} has no goal/success signal`);
    }
  }

  if (!args.successCriteria?.length) {
    throw new Error("P3 failed: no success criteria declared");
  }

  const ferment: Ferment = {
    id: randomUUID(),
    title: args.title,
    goal: args.goal,
    successCriteria: args.successCriteria,
    assumptions: args.assumptions ?? [],
    constraints: args.constraints ?? [],
    status: "draft",
    phases: args.phases.map((p, i) => ({
      id: newId("phase", i + 1),
      name: p.name,
      goal: p.goal,
      description: p.description,
      parallelGroup: p.parallelGroup,
      status: "pending",
      steps: [],
    })),
    decisions: [],
    memories: [],
    createdAt: new Date().toISOString(),
  };

  store.set(ferment);
  return ferment;
}

export function scopeFerment(
  fermentId: string,
  updates: Partial<Ferment>
): Ferment {
  const f = store.get(fermentId);
  if (!f) throw new Error("Ferment not found");
  const { id, createdAt, ...safeUpdates } = updates;
  Object.assign(f, safeUpdates, { status: "planned" });
  store.set(f);
  return f;
}

export function activatePhase(fermentId: string, phaseId: string): Phase[] {
  const f = store.get(fermentId);
  if (!f) throw new Error("Ferment not found");
  const phase = f.phases.find((p) => p.id === phaseId);
  if (!phase) throw new Error("Phase not found");
  
  phase.status = "active";
  
  // If this phase has a parallelGroup, auto-activate all pending siblings in the same group
  if (phase.parallelGroup !== undefined) {
    for (const p of f.phases) {
      if (p.id !== phaseId && p.parallelGroup === phase.parallelGroup && p.status === "pending") {
        p.status = "active";
      }
    }
  }
  
  store.set(f);
  return f.phases.filter((p) => p.status === "active");
}

export function refinePhase(
  fermentId: string,
  phaseId: string,
  stepDefs: { description: string; verify?: string; parallelGroup?: number }[]
): Phase {
  const f = store.get(fermentId);
  if (!f) throw new Error("Ferment not found");
  const phase = f.phases.find((p) => p.id === phaseId)!;

  phase.steps = stepDefs.map((s, i) => ({
    id: newId("step", i + 1),
    description: s.description,
    status: "pending",
    parallelGroup: s.parallelGroup,
    verifyCommand: s.verify,
  }));

  store.set(f);
  return phase;
}

export function startStep(
  fermentId: string,
  phaseId: string,
  stepId: string
): Step[] {
  const f = store.get(fermentId);
  const phase = f!.phases.find((p) => p.id === phaseId)!;
  const step = phase.steps.find((s) => s.id === stepId)!;
  step.status = "running";
  
  // If this step has a parallelGroup, auto-start all pending siblings in the same group
  if (step.parallelGroup !== undefined) {
    for (const s of phase.steps) {
      if (s.id !== stepId && s.parallelGroup === step.parallelGroup && s.status === "pending") {
        s.status = "running";
      }
    }
  }
  
  store.set(f!);
  return phase.steps.filter((s) => s.status === "running");
}

export function completeStep(
  fermentId: string,
  phaseId: string,
  stepId: string,
  summary: string,
  gates: GateVerdict[]
): Step {
  const f = store.get(fermentId)!;
  const phase = f.phases.find((p) => p.id === phaseId)!;
  const step = phase.steps.find((s) => s.id === stepId)!;

  step.summary = summary;
  step.gateVerdicts = gates;

  const validation = validateStepGates(step);
  if (!validation.ok) {
    step.status = "failed";
    store.set(f);
    throw new Error(`Step gate validation failed: ${validation.reason}`);
  }

  step.status = "completed";
  store.set(f);
  return step;
}

export function verifyStep(
  fermentId: string,
  phaseId: string,
  stepId: string,
  command?: string
): { exitCode: number; stdout: string; stderr: string } {
  const f = store.get(fermentId)!;
  const phase = f.phases.find((p) => p.id === phaseId)!;
  const step = phase.steps.find((s) => s.id === stepId)!;
  const cmd = command ?? step.verifyCommand;
  if (!cmd) throw new Error("No verify command provided");
  return runVerifyCommand(cmd);
}

export function completePhase(
  fermentId: string,
  phaseId: string,
  summary: string,
  gates: GateVerdict[]
): Phase {
  const f = store.get(fermentId)!;
  const phase = f.phases.find((p) => p.id === phaseId)!;

  phase.status = "completed";
  phase.gateVerdicts = gates;

  const validation = validatePhaseGates(phase);
  if (!validation.ok) {
    phase.status = "failed";
    store.set(f);
    throw new Error(`Phase gate validation failed: ${validation.reason}`);
  }

  store.set(f);
  return phase;
}

export function skipPhase(
  fermentId: string,
  phaseId: string,
  reason: string
): Phase {
  const f = store.get(fermentId)!;
  if (!f) throw new Error("Ferment not found");
  const phase = f.phases.find((p) => p.id === phaseId)!;
  phase.status = "skipped";
  phase.gateVerdicts = [
    {
      id: "F3",
      verdict: "pass",
      rationale: `Phase skipped: ${reason}`,
      evidence: "n/a",
    },
  ];
  store.set(f);
  return phase;
}

export function failPhase(
  fermentId: string,
  phaseId: string,
  reason: string
): Phase {
  const f = store.get(fermentId)!;
  if (!f) throw new Error("Ferment not found");
  const phase = f.phases.find((p) => p.id === phaseId)!;
  phase.status = "failed";
  store.set(f);
  throw new Error(`Phase ${phaseId} failed: ${reason}`);
}

export function skipStep(
  fermentId: string,
  phaseId: string,
  stepId: string,
  reason: string
): Step {
  const f = store.get(fermentId)!;
  const phase = f!.phases.find((p) => p.id === phaseId)!;
  const step = phase.steps.find((s) => s.id === stepId)!;
  step.status = "skipped";
  step.summary = `Skipped: ${reason}`;
  store.set(f!);
  return step;
}

export function failStep(
  fermentId: string,
  phaseId: string,
  stepId: string,
  reason: string
): never {
  const f = store.get(fermentId)!;
  const phase = f!.phases.find((p) => p.id === phaseId)!;
  const step = phase.steps.find((s) => s.id === stepId)!;
  step.status = "failed";
  store.set(f!);
  throw new Error(`Step ${stepId} failed: ${reason}`);
}

export function completeFerment(
  fermentId: string,
  finalSummary: string,
  gates: GateVerdict[]
): Ferment {
  const f = store.get(fermentId)!;

  const c1 = gates.find((g) => g.id === "C1");
  if (!c1 || c1.verdict !== "pass") {
    throw new Error("C1 not passed: success criteria not satisfied");
  }

  const unresolved = f.phases.filter(
    (p) => p.gateVerdicts?.find((g) => g.id === "F3")?.verdict === "flag"
  );
  if (unresolved.length) {
    throw new Error(
      `C2 failed: unresolved F3 deferrals in ${unresolved.map((p) => p.id).join(", ")}`
    );
  }

  const verificationText = (g: GateVerdict) =>
    `${g.rationale} ${g.evidence}`.toLowerCase();
  const hasRealVerification = f.phases.some((p) =>
    p.steps.some((s) =>
      s.gateVerdicts?.some(
        (g) =>
          g.id === "S2" &&
          (verificationText(g).includes("smoke") ||
           verificationText(g).includes("test"))
      )
    )
  );
  if (!hasRealVerification) {
    throw new Error("C3 failed: no real verification (smoke/test) recorded");
  }

  f.status = "completed";
  f.completedAt = new Date().toISOString();
  f.gateVerdicts = gates;
  f.finalSummary = finalSummary;
  store.set(f);
  return f;
}
