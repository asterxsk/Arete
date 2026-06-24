/**
 * Shared rendering helpers for compact tool display.
 * Used by memory, session_search, and memory_search tools.
 */

import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const INDENT = " ";
const HINT = " (ctrl+o to expand)";

function line(text: string): Component {
  return {
    render(width) {
      return [truncateToWidth(text, width, "...")];
    },
    invalidate() {},
  };
}

function orange(theme: any, text: string): string {
  return `\x1b[38;2;250;179;135m${text}\x1b[39m`;
}

function formatDur(s: number): string {
  if (s < 0.01) return "0.0s";
  if (s < 60) return s.toFixed(1) + "s";
  return Math.floor(s / 60) + "m " + Math.floor(s % 60) + "s";
}

/**
 * Create a compact call component showing tool name and args.
 */
export function compactToolCall(toolName: string, argsStr: string, theme: any): Component {
  let display = argsStr.split("\n")[0] ?? argsStr;
  const maxDisplay = 40;
  if (display.length > maxDisplay) display = display.slice(0, maxDisplay - 3) + "...";
  else if (display.length < argsStr.length) display += "...";
  return line(INDENT + orange(theme, toolName) + " [" + display + "]" + theme.fg("dim", HINT));
}

/**
 * Create an expanded result component with header, content lines, and footer.
 */
export function expandedToolResult(
  theme: any,
  headerName: string,
  argsLine: string,
  lines: string[],
  durationS: number,
  limit = 50,
): Component {
  const show = lines.slice(0, limit);
  const hasMore = lines.length > limit;
  const raw: string[] = [];

  // Header line
  raw.push(INDENT + orange(theme, headerName) + "[" + argsLine + "]");

  // Output lines with | prefix aligned under [
  const CONTENT_INDENT = "    | ";
  for (const l of show) {
    raw.push(INDENT + CONTENT_INDENT + theme.fg("text", l));
  }

  if (hasMore) {
    raw.push(INDENT + CONTENT_INDENT + theme.fg("dim", "... " + (lines.length - limit) + " more"));
  }

  // Footer with duration
  if (durationS >= 0) {
    raw.push(INDENT + "    \u2514 " + theme.fg("dim", "Took " + formatDur(durationS) + " [ctrl+o to hide]"));
  }

  return {
    render(width) {
      const result: string[] = [];
      for (const rl of raw) {
        if (!rl) result.push("");
        else if (visibleWidth(rl) <= width) result.push(rl);
        else result.push(truncateToWidth(rl, width, "..."));
      }
      return result;
    },
    invalidate() {},
  };
}

/**
 * Extract compact args string from tool arguments.
 */
export function formatMemoryArgs(args: Record<string, any> | undefined): string {
  if (!args) return "?";
  const action = args.action ?? "?";
  const target = args.target ?? "?";
  if (action === "replace" && args.old_text) {
    return `replace ${target} [${String(args.old_text).slice(0, 30)}...]`;
  }
  if (action === "remove" && args.old_text) {
    return `remove ${target} [${String(args.old_text).slice(0, 30)}...]`;
  }
  if (action === "add" && args.content) {
    return `add ${target} [${String(args.content).slice(0, 40)}...]`;
  }
  return `${action} ${target}`;
}

export function formatSessionSearchArgs(args: Record<string, any> | undefined): string {
  if (!args) return "?";
  const query = args.query ?? args.markdown ?? "?";
  return `query: ${String(query).slice(0, 50)}`;
}

export function formatMemorySearchArgs(args: Record<string, any> | undefined): string {
  if (!args) return "?";
  const query = args.query ?? "?";
  const target = args.target ? ` [${args.target}]` : "";
  return `query: ${String(query).slice(0, 50)}${target}`;
}

/**
 * Extract result lines from tool output for expanded view.
 */
export function extractResultLines(result: any): string[] {
  const fullText = result?.content?.[0]?.text || "";
  return fullText.split("\n").filter((l: string) => l.trim());
}

/**
 * Get duration from result details.
 */
export function getDuration(result: any): number {
  return (result?.details?._durationS as number) ?? -1;
}

/**
 * Wrap an execute function to capture execution duration.
 * Adds _durationS to result.details for the expanded view footer.
 */
export function withDurationCapture(
  executeFn: (...args: any[]) => Promise<any>,
): (...args: any[]) => Promise<any> {
  return async (...args: any[]) => {
    const t0 = Date.now();
    const result = await executeFn(...args);
    const durationMs = Date.now() - t0;
    return {
      ...result,
      details: {
        ...result?.details,
        _durationS: durationMs / 1000,
      },
    };
  };
}
