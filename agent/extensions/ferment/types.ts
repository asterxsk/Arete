export interface GateVerdict {
  id: string;                       // e.g. "P1", "S2", "F3", "C1"
  verdict: "pass" | "flag" | "omitted";
  rationale: string;                // one sentence
  evidence: string;                 // file:line, command output, or "n/a"
}

export interface Step {
  id: string;                       // e.g. "step-1"
  description: string;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  parallelGroup?: number;           // same number = concurrent within phase
  verifyCommand?: string;           // bash command that exits 0 on success
  gateVerdicts?: GateVerdict[];     // S1, S2, S3 on completion
  workerAgentId?: string;           // if delegated
  summary?: string;
}

export interface Phase {
  id: string;                       // e.g. "phase-1"
  name: string;                     // human label
  goal: string;
  description?: string;
  status: "pending" | "active" | "completed" | "skipped" | "failed";
  parallelGroup?: number;           // phases with same number run concurrently
  steps: Step[];
  gateVerdicts?: GateVerdict[];     // F1, F2, F3 on completion
}

export interface Decision {
  title: string;
  description: string;
  phaseId?: string;
  stepId?: string;
  createdAt: string;
}

export interface Memory {
  category: string;                 // e.g. "context", "constraint", "finding"
  content: string;
  phaseId?: string;
  stepId?: string;
  createdAt: string;
}

export interface Ferment {
  id: string;                       // uuid
  title: string;                    // 3-5 words
  goal: string;
  successCriteria: string[];        // observable, verifiable criteria
  assumptions: string[];
  constraints: string[];
  status: "draft" | "planned" | "active" | "completed" | "failed";
  phases: Phase[];
  decisions: Decision[];
  memories: Memory[];
  gateVerdicts?: GateVerdict[];     // C1, C2, C3 on completion
  finalSummary?: string;
  createdAt: string;
  completedAt?: string;
}
