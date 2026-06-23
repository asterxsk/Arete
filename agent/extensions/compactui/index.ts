/**
 * CompactUI — compact tool rendering with output truncation
 *
 * Re-registers every built-in tool with compact renderCall/renderResult,
 * adds 2-space left indent, orange tool names, "(ctrl+o to expand)" hints.
 * Truncates tool output for LLM context via tool_result hook.
 *
 * Merged from:
 *   - compactui.ts (compact rendering)
 *   - ui-changes/index.ts (output truncation)
 */

import type { ExtensionAPI, EditToolDetails } from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ── Constants ──────────────────────────────────────────────────────────

const INDENT = " ";
const HINT = " (ctrl+o to expand)";
const MAX_LINES = 5;
const TRUNCATED_TOOLS = new Set(["bash", "powershell", "run_command"]);

// ── Helpers ────────────────────────────────────────────────────────────

function line(text: string): Component {
  return {
    render(width) {
      return [visibleWidth(text) <= width ? text : truncateToWidth(text, width, "...")];
    },
    invalidate() {},
  };
}

function orange(theme: any, text: string): string {
  return `\x1b[38;2;250;179;135m${text}\x1b[39m`;
}

function compactCall(toolName: string, argsStr: string, theme: any): Component {
  let display = argsStr.split("\n")[0] ?? argsStr;
  if (display.length > 50) display = display.slice(0, 47) + "...";
  else if (display.length < argsStr.length) display += "...";
  return line(INDENT + orange(theme, toolName) + " [" + display + "]" + theme.fg("dim", HINT));
}

function formatDur(s: number): string {
  if (s < 0.01) return "0.0s";
  if (s < 60) return s.toFixed(1) + "s";
  return Math.floor(s / 60) + "m " + Math.floor(s % 60) + "s";
}

function expandedBox(theme: any, headerName: string, argsLine: string, lines: string[], durationS: number, limit: number): Component {
  const show = lines.slice(0, limit);
  const hasMore = lines.length > limit;
  const raw: string[] = [];

  // Header line
  raw.push(INDENT + orange(theme, headerName) + "[" + argsLine + "]");

  // Output lines with │ prefix aligned under [
  const CONTENT_INDENT = "    │ ";
  for (const line of show) {
    raw.push(INDENT + CONTENT_INDENT + theme.fg("text", line));
  }

  if (hasMore) {
    raw.push(INDENT + CONTENT_INDENT + theme.fg("dim", "... " + (lines.length - limit) + " more"));
  }

  // Footer with duration
  if (durationS >= 0) {
    raw.push(INDENT + "    └ " + theme.fg("dim", "Took " + formatDur(durationS) + " [ctrl+o to hide]"));
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

function colorizeDiffLine(theme: any, line: string): string {
  if (line.startsWith("+")) {
    return "\x1b[48;2;30;100;30m\x1b[38;2;120;220;120m" + line + "\x1b[0m";
  }
  if (line.startsWith("-")) {
    return "\x1b[48;2;100;30;30m\x1b[38;2;220;120;120m" + line + "\x1b[0m";
  }
  return theme.fg("text", line);
}

function diffExpandedBox(theme: any, headerName: string, argsLine: string, lines: string[], durationS: number, limit: number): Component {
  const show = lines.slice(0, limit);
  const hasMore = lines.length > limit;
  const raw: string[] = [];

  // Header line
  raw.push(INDENT + orange(theme, headerName) + "[" + argsLine + "]");

  // Diff lines with │ prefix, colored by +/-
  const CONTENT_INDENT = "    │ ";
  for (const dl of show) {
    raw.push(INDENT + CONTENT_INDENT + colorizeDiffLine(theme, dl));
  }

  if (hasMore) {
    raw.push(INDENT + CONTENT_INDENT + theme.fg("dim", "... " + (lines.length - limit) + " more"));
  }

  // Footer with duration
  if (durationS >= 0) {
    raw.push(INDENT + "    └ " + theme.fg("dim", "Took " + formatDur(durationS) + " [ctrl+o to hide]"));
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

// Capture full output in details for tools that need it
function captureResult(result: any, durationMs?: number): any {
  const fullText = result.content?.[0]?.text || "";
  const details: Record<string, unknown> = { ...result.details, _fullOutput: fullText };
  if (durationMs !== undefined) {
    details._durationS = durationMs / 1000;
  }
  return { ...result, details };
}

// ── Extension entry ────────────────────────────────────────────────────

const KNOWN_TOOLS = new Set(["read", "write", "edit", "bash", "ls", "grep", "find"]);

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();
  const unknownTools = new Set<string>();

  // ── Detect unknown tool names ───────────────────────────────────────
  pi.on("tool_call", async (event) => {
    if (!KNOWN_TOOLS.has(event.toolName) && !unknownTools.has(event.toolName)) {
      unknownTools.add(event.toolName);
    }
  });

  // ── Truncate tool output + format unknown tool errors ───────────────
  pi.on("tool_result", async (event) => {
    const content = event.content;
    if (!content || content.length === 0) return;

    // Format errors from unknown tools in compact style
    if (event.isError && unknownTools.has(event.toolName)) {
      const errorText = content.map((p) => (p.type === "text" ? p.text : "")).join("\n");
      const formatted = `Tool "${event.toolName}" is not registered.\nAvailable tools: ${Array.from(KNOWN_TOOLS).join(", ")}`;
      return {
        content: [{ type: "text", text: formatted }],
        details: { _fullOutput: formatted, _isUnknownTool: true },
        isError: true,
      };
    }

    if (!TRUNCATED_TOOLS.has(event.toolName)) return;

    const newContent = content.map((part) => {
      if (part.type !== "text" || !part.text) return part;
      const lines = part.text.split("\n");
      if (lines.length <= MAX_LINES) return part;
      const totalLines = lines.length;
      const hidden = totalLines - MAX_LINES;
      const kept = lines.slice(0, MAX_LINES).join("\n");
      return {
        ...part,
        text: `${kept}\n... (${hidden} more lines, ${totalLines} total, ctrl+o to expand)`,
      };
    });

    // Check if any part was actually truncated
    for (let i = 0; i < content.length; i++) {
      if (newContent[i]!.text !== content[i]!.text) {
        return { content: newContent };
      }
    }
  });

  // ── Read ────────────────────────────────────────────────────────────
  const originalRead = createReadTool(cwd);
  pi.registerTool({
    name: "read",
    label: "read",
    description: originalRead.description,
    parameters: originalRead.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(await originalRead.execute(toolCallId, params, signal, onUpdate), Date.now() - t0);
    },
    renderCall(args, theme, context) {
      if (context.expanded) return line("");
      return compactCall("read", args.path ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      if (!expanded) return line("");
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");
      const durationS = (details?._durationS as number) ?? -1;
      const filePath = context.args.path ?? "?";
      const offset = (context.args.offset as number) || 1;
      const endLine = offset + lines.length - 1;
      const label = lines.length > 0 ? `${offset}-${endLine}, ${filePath}` : filePath;
      return expandedBox(theme, "read", label, lines, durationS, 40);
    },
  });

  // ── Write ───────────────────────────────────────────────────────────
  const originalWrite = createWriteTool(cwd);
  pi.registerTool({
    name: "write",
    label: "write",
    description: originalWrite.description,
    parameters: originalWrite.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(await originalWrite.execute(toolCallId, params, signal, onUpdate), Date.now() - t0);
    },
    renderCall(args, theme, context) {
      if (context.expanded) return line("");
      return compactCall("write", args.path ?? "?", theme);
    },
    renderResult(result, { isPartial }, theme, context) {
      if (isPartial) return line(INDENT + theme.fg("warning", "Writing..."));
      return line("");
    },
  });

  // ── Edit ────────────────────────────────────────────────────────────
  const originalEdit = createEditTool(cwd);
  pi.registerTool({
    name: "edit",
    label: "edit",
    description: originalEdit.description,
    parameters: originalEdit.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      const result = await originalEdit.execute(toolCallId, params, signal, onUpdate);
      const durationMs = Date.now() - t0;
      const diff = (result.details as Record<string, unknown>)?.diff as string | undefined;
      const fullText = diff || result.content?.[0]?.text || "";
      return { ...result, details: { ...result.details, _fullOutput: fullText, _durationS: durationMs / 1000 } };
    },
    renderCall(args, theme, context) {
      if (context.expanded) return line("");
      return compactCall("edit", args.path ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as EditToolDetails | undefined;
      if (!details?.diff) return line("");
      const diffLines = details.diff.split("\n");
      if (!expanded) return line("");
      const durationS = (result.details as Record<string, unknown>)?._durationS as number ?? -1;
      return diffExpandedBox(theme, "edit", context.args.path ?? "", diffLines, durationS, 50);
    },
  });

  // ── Bash ────────────────────────────────────────────────────────────
  const originalBash = createBashTool(cwd);
  pi.registerTool({
    name: "bash",
    label: "bash",
    description: originalBash.description,
    parameters: originalBash.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(await originalBash.execute(toolCallId, params, signal, onUpdate), Date.now() - t0);
    },
    renderCall(args, theme, context) {
      if (context.expanded) return line("");
      return compactCall("bash", args.command ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      if (!expanded) return line("");
      const lines = full.split("\n");
      const durationS = (details?._durationS as number) ?? -1;
      const cmd = context.args.command || (details?.command as string) || "";
      return expandedBox(theme, "bash", cmd, lines, durationS, 50);
    },
  });

  // ── Ls ──────────────────────────────────────────────────────────────
  const originalLs = createLsTool(cwd);
  pi.registerTool({
    name: "ls",
    label: "ls",
    description: originalLs.description,
    parameters: originalLs.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(await originalLs.execute(toolCallId, params, signal, onUpdate), Date.now() - t0);
    },
    renderCall(args, theme, context) {
      if (context.expanded) return line("");
      return compactCall("ls", args.path || ".", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      if (!expanded) return line("");
      const lines = full.split("\n").filter((l: string) => l.trim());
      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "ls", context.args.path || ".", lines, durationS, 50);
    },
  });

  // ── Grep ────────────────────────────────────────────────────────────
  const originalGrep = createGrepTool(cwd);
  pi.registerTool({
    name: "grep",
    label: "grep",
    description: originalGrep.description,
    parameters: originalGrep.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(await originalGrep.execute(toolCallId, params, signal, onUpdate), Date.now() - t0);
    },
    renderCall(args, theme, context) {
      if (context.expanded) return line("");
      return compactCall("grep", args.pattern ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      if (!expanded) return line("");
      const lines = full.split("\n").filter((l: string) => l.trim());
      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "grep", context.args.pattern ?? "?", lines, durationS, 50);
    },
  });

  // ── Find ────────────────────────────────────────────────────────────
  const originalFind = createFindTool(cwd);
  pi.registerTool({
    name: "find",
    label: "find",
    description: originalFind.description,
    parameters: originalFind.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(await originalFind.execute(toolCallId, params, signal, onUpdate), Date.now() - t0);
    },
    renderCall(args, theme, context) {
      if (context.expanded) return line("");
      return compactCall("find", (args.pattern ?? "?") + (args.path ? " " + args.path : ""), theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      if (!expanded) return line("");
      const lines = full.split("\n").filter((l: string) => l.trim());
      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "find", (context.args.pattern ?? "?") + (context.args.path ? " " + context.args.path : ""), lines, durationS, 50);
    },
  });
}
