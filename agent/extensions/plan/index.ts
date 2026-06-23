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

const POWERSHELL_DESTRUCTIVE_PATTERNS = [
  /remove-item\b/i,
  /\bri\b/i,
  /\brm\b/i,
  /\bdel\b/i,
  /\brmdir\b/i,
  /copy-item\b/i,
  /\bci\b/i,
  /\bcp\b/i,
  /move-item\b/i,
  /\bmi\b/i,
  /\bmv\b/i,
  /new-item\b/i,
  /\bni\b/i,
  /\bmkdir\b/i,
  /\bmd\b/i,
  /set-content\b/i,
  /\bsc\b/i,
  /add-content\b/i,
  /\bac\b/i,
  /set-item\b/i,
  /\bsi\b/i,
  /rename-item\b/i,
  /\brni\b/i,
  /\bren\b/i,
  /out-file\b/i,
  /clear-content\b/i,
  /clear-item\b/i,
  /export-csv\b/i,
  /remove-itemproperty\b/i,
  /\brp\b/i,
  /write-alltext\b/i,
  /write-allbytes\b/i,
  /write-alllines\b/i,
  /move-adobject\b/i,
  /copy-adobject\b/i,
  /remove-adobject\b/i,
  /\bmove-itemproperty\b/i,
  /\brii\b/i,
];

function isDestructiveCommand(command: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
}

function isPowerShellDestructive(command: string): boolean {
  return POWERSHELL_DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
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
    if (!planMode) return;

    if (event.toolName === "bash") {
      const command = event.input.command as string;
      if (isDestructiveCommand(command)) {
        return {
          block: true,
          reason: `Plan mode: destructive command blocked.\nCommand: ${command}`,
        };
      }
    }

    if (event.toolName === "powershell") {
      const command = event.input.command as string;
      if (isPowerShellDestructive(command)) {
        return {
          block: true,
          reason: `Plan mode: destructive command blocked (PowerShell).\nCommand: ${command}`,
        };
      }
    }
  });

  // Restore state on session start
  pi.on("session_start", async (_event, ctx) => {
    updateStatus(ctx);
  });
}