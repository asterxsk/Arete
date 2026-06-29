import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  proposeFermentScoping,
  scopeFerment,
  activatePhase,
  refinePhase,
  startStep,
  completeStep,
  verifyStep,
  completePhase,
  skipPhase,
  failPhase,
  skipStep,
  failStep,
  completeFerment,
} from "./ferment-tools.js";

export const fermentTools = [
  {
    name: "propose_ferment_scoping",
    description: "Emit the full scoping draft: title, goal, success criteria, constraints, assumptions, phases, questions, and gates.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        goal: { type: "string" },
        successCriteria: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" } },
        constraints: { type: "array", items: { type: "string" } },
        phases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              goal: { type: "string" },
              description: { type: "string" },
              parallelGroup: { type: "number", description: "Phases with the same parallelGroup number run concurrently. Activate any phase in the group and siblings auto-activate." },
            },
            required: ["name", "goal"],
          },
        },
        gates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              verdict: { type: "string", enum: ["pass", "flag", "omitted"] },
              rationale: { type: "string" },
              evidence: { type: "string" },
            },
            required: ["id", "verdict", "rationale", "evidence"],
          },
        },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              type: { type: "string" },
            },
            required: ["id", "question", "type"],
          },
        },
      },
      required: ["title", "goal", "successCriteria", "phases", "gates"],
    },
    execute: async (_toolCallId: any, args: any) => proposeFermentScoping(args),
  },

  {
    name: "scope_ferment",
    description: "Save scoping answers and transition ferment from draft to planned.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        title: { type: "string" },
        goal: { type: "string" },
        successCriteria: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" } },
        constraints: { type: "array", items: { type: "string" } },
        phases: { type: "array" },
        gates: { type: "array" },
      },
      required: ["ferment_id", "title", "goal", "successCriteria", "gates"],
    },
    execute: async (_toolCallId: any, args: any) => scopeFerment(args.ferment_id, args),
  },

  {
    name: "activate_ferment_phase",
    description: "Start a planned phase. If the phase has a parallelGroup, all pending sibling phases in the same group are auto-activated. Returns all active phases.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        phase_id: { type: "string" },
      },
      required: ["ferment_id", "phase_id"],
    },
    execute: async (_toolCallId: any, args: any) => activatePhase(args.ferment_id, args.phase_id),
  },

  {
    name: "refine_ferment_phase",
    description: "Add or overwrite steps for an active phase.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        phase_id: { type: "string" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              verify: { type: "string" },
              parallelGroup: { type: "number", description: "Steps with the same parallelGroup number run concurrently. Start any step in the group and siblings auto-start." },
            },
            required: ["description"],
          },
        },
      },
      required: ["ferment_id", "phase_id", "steps"],
    },
    execute: async (_toolCallId: any, args: any) => refinePhase(args.ferment_id, args.phase_id, args.steps),
  },

  {
    name: "start_ferment_step",
    description: "Mark a step as running. If the step has a parallelGroup, all pending sibling steps in the same group are auto-started. Returns all running steps.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        phase_id: { type: "string" },
        step_id: { type: "string" },
      },
      required: ["ferment_id", "phase_id", "step_id"],
    },
    execute: async (_toolCallId: any, args: any) => startStep(args.ferment_id, args.phase_id, args.step_id),
  },

  {
    name: "complete_ferment_step",
    description: "Mark a step as done and record its gate verdicts.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        phase_id: { type: "string" },
        step_id: { type: "string" },
        summary: { type: "string" },
        gates: { type: "array" },
      },
      required: ["ferment_id", "phase_id", "step_id", "summary", "gates"],
    },
    execute: async (_toolCallId: any, args: any) => completeStep(args.ferment_id, args.phase_id, args.step_id, args.summary, args.gates),
  },

  {
    name: "verify_ferment_step",
    description: "Run a verification command for a step.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        phase_id: { type: "string" },
        step_id: { type: "string" },
        command: { type: "string" },
      },
      required: ["ferment_id", "phase_id", "step_id"],
    },
    execute: async (_toolCallId: any, args: any) => verifyStep(args.ferment_id, args.phase_id, args.step_id, args.command),
  },

  {
    name: "complete_ferment_phase",
    description: "Mark a phase as completed.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        phase_id: { type: "string" },
        summary: { type: "string" },
        gates: { type: "array" },
      },
      required: ["ferment_id", "phase_id", "summary", "gates"],
    },
    execute: async (_toolCallId: any, args: any) => completePhase(args.ferment_id, args.phase_id, args.summary, args.gates),
  },

  {
    name: "skip_ferment_phase",
    description: "Mark a phase as skipped.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        phase_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["ferment_id", "phase_id", "reason"],
    },
    execute: async (_toolCallId: any, args: any) => skipPhase(args.ferment_id, args.phase_id, args.reason),
  },

  {
    name: "fail_ferment_phase",
    description: "Mark a phase as failed.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        phase_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["ferment_id", "phase_id", "reason"],
    },
    execute: async (_toolCallId: any, args: any) => failPhase(args.ferment_id, args.phase_id, args.reason),
  },

  {
    name: "skip_ferment_step",
    description: "Mark a step as skipped.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        phase_id: { type: "string" },
        step_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["ferment_id", "phase_id", "step_id", "reason"],
    },
    execute: async (_toolCallId: any, args: any) => skipStep(args.ferment_id, args.phase_id, args.step_id, args.reason),
  },

  {
    name: "fail_ferment_step",
    description: "Mark a step as failed.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        phase_id: { type: "string" },
        step_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["ferment_id", "phase_id", "step_id", "reason"],
    },
    execute: async (_toolCallId: any, args: any) => failStep(args.ferment_id, args.phase_id, args.step_id, args.reason),
  },

  {
    name: "complete_ferment",
    description: "Mark the ferment as complete.",
    parameters: {
      type: "object",
      properties: {
        ferment_id: { type: "string" },
        final_summary: { type: "string" },
        gates: { type: "array" },
      },
      required: ["ferment_id", "final_summary", "gates"],
    },
    execute: async (_toolCallId: any, args: any) => completeFerment(args.ferment_id, args.final_summary, args.gates),
  }
];

export default function (pi: ExtensionAPI) {
  (globalThis as any).__pi_extension_features?.push({
    name: "ferment",
    description: "Structured delivery framework. Scopes, phases, and verifies work.",
    tools: fermentTools.map(t => t.name),
    commands: ["/ferment"]
  });

  pi.on("session_start", async (_event: any, ctx: any) => {
    for (const t of fermentTools) {
      pi.registerTool({
        name: t.name,
        description: t.description,
        parameters: t.parameters as any,
        execute: t.execute
      });
    }
  });

  pi.registerCommand("ferment", {
    description: "Start the ferment framework to scope, phase, and verify work.",
    handler: async (args: string, ctx: any) => {
      const prompt = args.trim()
        ? `Start fermenting the following goal:\n\n${args}\n\nPlease use propose_ferment_scoping to begin.`
        : "Start a new ferment. Please ask me what my goal is, or if you already know, use propose_ferment_scoping to begin.";
      await pi.sendUserMessage(prompt);
    }
  });
}
