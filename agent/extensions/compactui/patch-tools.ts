/**
 * patch-tools.ts — Tool patching logic for compact rendering
 *
 * Intercepts tool renderCall/renderResult to apply compact two-line
 * display with orange name, args truncation, and expandable output.
 * Includes special-case handlers for todo, questions, powershell,
 * run_command, web_search, web_fetch, manage_task, and schedule.
 */

import { truncateToWidth } from "@earendil-works/pi-tui";
import {
  line, noOp, orange, compactCall, compactSummary, compactFailed,
  formatDur, expandedBox, INDENT, HINT, DIM_GREY,
} from "./rendering.js";

// ── Constants ──────────────────────────────────────────────────────────

export const MAX_LINES = 5;
export const TRUNCATED_TOOLS = new Set(["bash", "powershell", "run_command"]);
export const KNOWN_TOOLS = new Set([
  "read", "write", "edit", "bash", "grep", "find", "ls",
  "web_search", "web_fetch", "fetch_content", "get_search_content",
  "run_command", "manage_task", "schedule", "subagent", "todo",
  "powershell", "questions", "video_extract", "skill_manage", "plan",
  "memory", "memory_search", "session_search",
]);

// ── CustomBlock (fallback component) ───────────────────────────────────

class CustomBlock {
  width: number;
  height: number;
  lines: string[];
  constructor(lines: string[]) {
    this.lines = lines;
    this.width = 0;
    this.height = lines.length;
  }
  invalidate() {}
  handleInput() {}
  render(width: number) {
    return this.lines.map((l: string) => truncateToWidth(l, width));
  }
}

// ── patchTool ──────────────────────────────────────────────────────────

export function patchTool(tool: any): void {
  const EXCLUDED_TOOLS = new Set(["read", "write", "edit", "bash", "ls", "grep", "find"]);
  if (EXCLUDED_TOOLS.has(tool.name)) return;

  // ── Ask Question ───────────────────────────────────────────────────────
  if (tool.name === "ask_question" || tool.name === "ask_questions" || tool.name === "questions" || tool.name === "question") {
    if (tool.__compactui_patched) return;
    tool.__compactui_patched = true;
    tool.renderShell = "self";
    tool.renderCall = (args: any, theme: any, context: any) => {
      if (context.expanded) return noOp();
      let count = 1;
      if (args && Array.isArray(args.questions)) count = args.questions.length;
      return line(INDENT + orange(theme, tool.name) + " [" + `asking ${count} question${count === 1 ? '' : 's'}` + "]" + DIM_GREY + " (ctrl+o to expand)\x1b[39m");
    };
    tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
      if (result.isError) return compactFailed(theme);
      let count = 1;
      if (context?.args && Array.isArray(context.args.questions)) {
        count = context.args.questions.length;
      }

      if (!opts.expanded) {
        return line(INDENT + DIM_GREY + `\u23bf answered ${count} question${count === 1 ? '' : 's'}` + "\x1b[39m");
      } else {
        const res: string[] = [];
        res.push(INDENT + orange(theme, tool.name) + " [questions]");
        const text = result.content?.[0]?.text || "";
        for (const l of text.split('\n')) {
          if (l.trim()) res.push(INDENT + "  " + DIM_GREY + "\u2502 \x1b[39m" + l);
        }
        res.push(INDENT + "  " + DIM_GREY + "\u2514 \x1b[39m" + DIM_GREY + "Took 0.2s [ctrl+o to hide]\x1b[39m");
        return new CustomBlock(res) as any;
      }
    };
    return;
  }

  // ── Pwsh / Powershell ──────────────────────────────────────────────────
  if (tool.name === "powershell" || tool.name === "pwsh") {
    if (tool.__compactui_patched) return;
    tool.__compactui_patched = true;
    tool.renderShell = "self";
    tool.renderCall = (args: any, theme: any, context: any) => {
      if (context.expanded) return noOp();
      return compactCall("powershell", args.command ?? "?", theme);
    };
    tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");
      if (!opts.expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }
      const durationS = (details?._durationS as number) ?? -1;

      const plainTextLines = ["powershell [" + (context.args.command ?? "?") + "]"];
      for (const line of lines) {
        plainTextLines.push(line.startsWith("\u2502") ? " " + line : line);
      }
      if (durationS >= 0) {
        plainTextLines.push("Took " + formatDur(durationS) + " [ctrl+o to hide]");
      } else {
        plainTextLines.push("[ctrl+o to hide]");
      }
      (result as any)._plainText = plainTextLines.join("\n");

      const processedLines = lines.map((line: string) => line.startsWith("\u2502") ? " " + line : line);
      return expandedBox(theme, "powershell", context.args.command ?? "", processedLines, durationS, 40);
    };
    return;
  }

  // ── Run Command ─────────────────────────────────────────────────────────
  if (tool.name === "run_command") {
    if (tool.__compactui_patched) return;
    tool.__compactui_patched = true;
    tool.renderShell = "self";
    tool.renderCall = (args: any, theme: any, context: any) => {
      if (context.expanded) return noOp();
      return compactCall("run_command", args.CommandLine as string || "?", theme);
    };
    tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");
      if (!opts.expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }
      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "run_command", context.args.CommandLine ?? "", lines, durationS, 40);
    };
    return;
  }

  // ── Web Search ─────────────────────────────────────────────────────────
  if (tool.name === "web_search") {
    if (tool.__compactui_patched) return;
    tool.__compactui_patched = true;
    tool.renderShell = "self";
    tool.renderCall = (args: any, theme: any, context: any) => {
      if (context.expanded) return noOp();
      return compactCall("web_search", (args.query as string) || "?", theme);
    };
    tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");
      if (!opts.expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read search results", lines.length, "line");
      }
      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "web_search", context.args.query ?? "", lines, durationS, 40);
    };
    return;
  }

  // ── Web Fetch / Fetch Content ──────────────────────────────────────────
  if (tool.name === "web_fetch" || tool.name === "fetch_content") {
    if (tool.__compactui_patched) return;
    tool.__compactui_patched = true;
    tool.renderShell = "self";
    tool.renderCall = (args: any, theme: any, context: any) => {
      if (context.expanded) return noOp();
      return compactCall(tool.name, (args.url as string) || "?", theme);
    };
    tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");
      if (!opts.expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read web page", lines.length, "line");
      }
      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, tool.name, context.args.url ?? "", lines, durationS, 40);
    };
    return;
  }

  // ── Manage Task ────────────────────────────────────────────────────────
  if (tool.name === "manage_task") {
    if (tool.__compactui_patched) return;
    tool.__compactui_patched = true;
    tool.renderShell = "self";
    tool.renderCall = (args: any, theme: any, context: any) => {
      if (context.expanded) return noOp();
      return compactCall("manage_task", `${args.Action} ${args.TaskId || ""}`.trim(), theme);
    };
    tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      if (!opts.expanded) {
        if (result.isError) return compactFailed(theme);
        const taskCount = full.includes("TaskId") || full.includes("task") ? 1 : 0;
        return compactSummary(theme, "checked tasks", taskCount, "task");
      }
      const lines = full.split("\n");
      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "manage_task", `${context.args.Action} ${context.args.TaskId || ""}`.trim(), lines, durationS, 40);
    };
    return;
  }

  // ── Schedule ───────────────────────────────────────────────────────────
  if (tool.name === "schedule") {
    if (tool.__compactui_patched) return;
    tool.__compactui_patched = true;
    tool.renderShell = "self";
    tool.renderCall = (args: any, theme: any, context: any) => {
      if (context.expanded) return noOp();
      let argsLine = "";
      if (args.DurationSeconds) argsLine = `${args.DurationSeconds}s "${args.Prompt}"`;
      else if (args.CronExpression) argsLine = `cron "${args.CronExpression}" "${args.Prompt}"`;
      return compactCall("schedule", argsLine, theme);
    };
    tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      if (!opts.expanded) {
        if (result.isError) return compactFailed(theme);
        const taskCount = full.includes("timerId") || full.includes("cronId") || full.includes("scheduled") ? 1 : 0;
        return compactSummary(theme, "scheduled tasks", taskCount, "task");
      }
      const lines = full.split("\n");
      const durationS = (details?._durationS as number) ?? -1;
      let argsLine = "";
      if (context.args.DurationSeconds) argsLine = `${context.args.DurationSeconds}s "${context.args.Prompt}"`;
      else if (context.args.CronExpression) argsLine = `cron "${context.args.CronExpression}" "${context.args.Prompt}"`;
      return expandedBox(theme, "schedule", argsLine, lines, durationS, 40);
    };
    return;
  }

  // ── Generic Fallback ───────────────────────────────────────────────────
  if (tool.__compactui_patched) return;
  tool.__compactui_patched = true;
  tool.renderShell = "self";

  tool.renderCall = (args: any, theme: any, context: any) => {
    if (context.expanded) return noOp();
    const argsLine = Object.values(args || {}).map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(" ");
    return compactCall(tool.name, argsLine, theme);
  };

  tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
    if ((result.details as any)?._isUnknownTool) {
      const toolName = tool.name || (context.args as any)?.name || "unknown";
      return line(INDENT + orange(theme, toolName) + " " + theme.fg("error", "tool not found"));
    }

    if (!opts.expanded) return noOp();

    const argsLine = Object.values(context.args || {}).map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(" ");
    const content = result.content?.[0];
    const text = content?.type === "text" ? content.text : "";
    const lines = text.split("\n").filter((l: string) => l.trim());
    const durationS = (result.details as any)?._durationS ?? 0.0;

    return expandedBox(theme, tool.name, argsLine, lines, durationS, 40);
  };
}