/**
 * Plan Mode Extension
 *
 * Simple read-only toggle for the agent.
 * - `/plan` enables read-only mode (disables edit/write tools, blocks destructive bash)
 * - `/plan` again restores full access
 * - Shows "plan" indicator in footer when active
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const DESTRUCTIVE_PATTERNS = [
  /\brm\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bnpm\s+install\b/i,
  /\byarn\s+add\b/i,
  /\bpip\s+install\b/i,
  /\bapt\s+install\b/i,
  /\bbrew\s+install\b/i,
  /\bgit\s+add\b/i,
  /\bgit\s+commit\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+merge\b/i,
  /\bgit\s+rebase\b/i,
  /\bgit\s+reset\b/i,
  />\s*[^>]/,   // file redirect >
  />>/,        // append redirect >>
  /\bvim\b/i,
  /\bnano\b/i,
  /\bcode\b/i,
  /\bsubl\b/i,
  /\bdd\b/i,
  /\bshred\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bsystemctl\s+(start|stop|restart)\b/i,
  /\bservice\s+(start|stop|restart)\b/i,
];

function isDestructiveCommand(command: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
}

export default function planExtension(pi: ExtensionAPI): void {
  let planMode = false;
  let toolsBeforePlanMode: string[] | undefined;

  function updateStatus(ctx: ExtensionContext): void {
    if (planMode) {
      ctx.ui.setStatus("plan", ctx.ui.theme.fg("warning", "⏸ plan"));
    } else {
      ctx.ui.setStatus("plan", undefined);
    }
  }

  function getPlanModeTools(activeTools: string[]): string[] {
    // Filter out edit and write tools
    return activeTools.filter((name) => name !== "edit" && name !== "write");
  }

  function restoreTools(): void {
    pi.setActiveTools(toolsBeforePlanMode ?? pi.getActiveTools());
    toolsBeforePlanMode = undefined;
  }

  function togglePlanMode(ctx: ExtensionContext): void {
    planMode = !planMode;

    if (planMode) {
      // Save current tools and disable edit/write
      toolsBeforePlanMode = pi.getActiveTools();
      pi.setActiveTools(getPlanModeTools(toolsBeforePlanMode));
      ctx.ui.notify("Plan mode enabled. Edit/write tools disabled, destructive bash blocked.");
    } else {
      // Restore full tool access
      restoreTools();
      ctx.ui.notify("Plan mode disabled. Full access restored.");
    }

    updateStatus(ctx);
  }

  // Register /plan command
  pi.registerCommand("plan", {
    description: "Toggle plan mode (read-only exploration)",
    handler: async (_args, ctx) => togglePlanMode(ctx),
  });

  // Block destructive bash commands in plan mode
  pi.on("tool_call", async (event) => {
    if (!planMode || event.toolName !== "bash") return;

    const command = event.input.command as string;
    if (isDestructiveCommand(command)) {
      return {
        block: true,
        reason: `Plan mode: destructive command blocked.\nCommand: ${command}`,
      };
    }
  });

  // Restore state on session start
  pi.on("session_start", async (_event, ctx) => {
    updateStatus(ctx);
  });
}