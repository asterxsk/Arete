/**
 * assistant-footer.ts — Assistant message duration footer
 *
 * Listens for agent_start/message_end events and appends a
 * "✻ Worked for Xs" line to the last text block of assistant messages.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const RESET = "\x1b[0m";
const DIM_GREY = "\x1b[38;2;140;140;140m";
let turnStartMs: number | undefined;

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s % 60}s`;
}

export function initAssistantFooter(pi: ExtensionAPI): void {
  pi.on("agent_start", async () => {
    turnStartMs = Date.now();
  });

  pi.on("message_end", async (event) => {
    const message = (event as any)?.message;
    if (message?.role !== "assistant" || message.stopReason === "toolUse") return;
    if (turnStartMs === undefined) return;

    const durationMs = Date.now() - turnStartMs;
    const textBlocks = message.content?.filter(
      (b: any) => b?.type === "text" && typeof b.text === "string"
    );
    const last = textBlocks?.[textBlocks.length - 1];
    if (last) {
      last.text = `${last.text.trimEnd()}\n\n${DIM_GREY}✻ Worked for ${formatDuration(durationMs)}${RESET}`;
    }
  });

  pi.on("agent_end", async () => {
    turnStartMs = undefined;
  });
}
