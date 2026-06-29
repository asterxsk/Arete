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

import path from "path";
import type { ExtensionAPI, EditToolDetails } from "@earendil-works/pi-coding-agent";
import {
  AssistantMessageComponent,
  InteractiveMode,
  UserMessageComponent,
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth, visibleWidth, Container, Markdown, Spacer, Text, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ── Constants ──────────────────────────────────────────────────────────

const INDENT = " "; // Single space indent for tools
const HINT = " (ctrl+o to expand)";
const MAX_LINES = 5;
const TRUNCATED_TOOLS = new Set(["bash", "powershell", "run_command"]);
// HERMES_TOOLS removed — memory, skill_manage, session_search, memory_search
// now have their own renderCall/renderResult in pi-hermes-memory extension
// ── Helpers ────────────────────────────────────────────────────────────
function colorThinkingText(text: string): string {
    return `\x1b[38;2;112;112;128m${text}\x1b[39m`;
}

function italicText(text: string): string {
    return `\x1b[3m${text}\x1b[23m`;
}

interface ThinkingBlockOptions {
    color?: (text: string) => string;
    italic?: boolean;
}

class ThinkingBlock extends Container {
    private text: string;
    private paddingX: number;
    private paddingY: number;
    private markdownTheme: any;
    private options: ThinkingBlockOptions;

    constructor(text: string, paddingX = 0, paddingY = 0, markdownTheme: any = undefined, options: ThinkingBlockOptions = {}) {
        super();
        this.text = text;
        this.paddingX = paddingX;
        this.paddingY = paddingY;
        this.markdownTheme = markdownTheme;
        this.options = options;
    }

    render(width: number): string[] {
        if (!this.text || this.text.trim() === "") {
            return [];
        }
        
        const contentWidth = Math.max(1, width - this.paddingX * 2 - 2);
        const leftPad = " ".repeat(this.paddingX);
        const textLines = this.text.trim().split("\n");
        
        const visualLines: { text: string; isEmpty: boolean }[] = [];
        for (const line of textLines) {
            if (line.trim() === "") {
                visualLines.push({ text: "", isEmpty: true });
                continue;
            }
            const wrappedLines = wrapTextWithAnsi(line, contentWidth);
            for (const wrappedLine of wrappedLines) {
                visualLines.push({ text: wrappedLine, isEmpty: false });
            }
        }
        if (visualLines.length === 0) return [];
        
        const result: string[] = [];
        result.push("");
        
        for (let i = 0; i < visualLines.length; i++) {
            const vl = visualLines[i];
            if (vl.isEmpty) {
                result.push(leftPad + colorThinkingText("┃"));
                continue;
            }
            result.push(leftPad + colorThinkingText("┃ ") + this.applyStyle(vl.text));
        }
        return result;
    }

    private applyStyle(text: string): string {
        if (!this.options) return text;
        let styled = text;
        if (this.options.color) {
            styled = this.options.color(styled);
        }
        if (this.options.italic) {
            styled = italicText(styled);
        }
        return styled;
    }
}

let patchedAssistant = false;

function line(text: string): Component {
  return {
    render(width) {
      // Always truncate to width to prevent overflow
      return [truncateToWidth(text, width, "...")];
    },
    invalidate() {},
  };
}

// No-op component that renders nothing (avoids extra newline)
function noOp(): Component {
  return {
    render() { return []; },
    invalidate() {},
  };
}

function orange(theme: any, text: string): string {
  return `\x1b[38;2;250;179;135m${text}\x1b[39m`;
}

function compactCall(toolName: string, argsStr: string, theme: any): Component {
  let display = argsStr.split("\n")[0] ?? argsStr;
  // Truncate by visible length to avoid ANSI code interference
  const maxDisplay = 40;
  if (display.length > maxDisplay) display = display.slice(0, maxDisplay - 3) + "...";
  else if (display.length < argsStr.length) display += "...";
  return line(INDENT + orange(theme, toolName) + " [" + display + "]" + theme.fg("dim", HINT));
}

function compactSummary(theme: any, summary: string, count: number, unit: string): Component {
  const countStr = count > 0 ? ` (${count} ${unit}${count !== 1 ? "s" : ""})` : "";
  return line(INDENT + theme.fg("dim", "⎿ " + summary + countStr));
}

function compactFailed(theme: any): Component {
  return line(INDENT + theme.fg("dim", "⎿ failed tool call"));
}

function formatDur(s: number): string {
  if (s < 0.01) return "0.0s";
  if (s < 60) return s.toFixed(1) + "s";
  return Math.floor(s / 60) + "m " + Math.floor(s % 60) + "s";
}
function wrapWithPrefix(rl: string, width: number): string[] {
  const visible = rl.replace(/\x1b\[[0-9;]*m/g, "");
  const match = visible.match(/^(\s*(?:│|└|\[)?\s*(?:\s*\d+\s*(?:│|\+|\-)?\s*)?)/);
  if (!match || match[1].length === 0) return wrapTextWithAnsi(rl, width);
  
  const prefixLen = match[1].length;
  let ansiPrefix = "";
  let contentStr = "";
  let visibleCount = 0;
  let i = 0;
  while (i < rl.length) {
    if (rl[i] === '\x1b') {
      const end = rl.indexOf('m', i);
      if (end !== -1) {
        if (visibleCount < prefixLen) ansiPrefix += rl.slice(i, end + 1);
        else contentStr += rl.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    if (visibleCount < prefixLen) ansiPrefix += rl[i];
    else contentStr += rl[i];
    visibleCount++;
    i++;
  }
  
  const contentWidth = Math.max(10, width - prefixLen);
  const wrappedContent = wrapTextWithAnsi(contentStr, contentWidth);
  if (wrappedContent.length === 0) return [ansiPrefix];
  
  const result = [ansiPrefix + wrappedContent[0]];
  const subsequentPrefixStr = match[1].replace(/[^\s│]/g, " ");
  for (let j = 1; j < wrappedContent.length; j++) {
    result.push(subsequentPrefixStr + wrappedContent[j]);
  }
  return result;
}


function expandedBox(theme: any, headerName: string, argsLine: string, lines: string[], durationS: number, limit: number): Component {
  const show = lines.slice(0, limit);
  const hasMore = lines.length > limit;
  const raw: string[] = [];

  // Output lines with │ prefix aligned under [
  const padding = " ".repeat(headerName.length + 1);
  const CONTENT_INDENT = padding + "│ ";
  for (const line of show) {
    raw.push(INDENT + CONTENT_INDENT + theme.fg("text", line));
  }

  if (hasMore) {
    raw.push(INDENT + CONTENT_INDENT + theme.fg("dim", "... " + (lines.length - limit) + " more"));
  }

  // Footer with duration
  if (durationS >= 0) {
    raw.push(INDENT + padding + "└ " + theme.fg("dim", "Took " + formatDur(durationS) + " [ctrl+o to hide]"));
  } else {
    raw.push(INDENT + padding + "└ " + theme.fg("dim", "[ctrl+o to hide]"));
  }
  
  // Store plain text version for copy/paste
  const plainTextLines = [headerName + " [" + argsLine + "]"];
  for (const line of show) {
    plainTextLines.push(line);
  }
  if (hasMore) {
    plainTextLines.push("... " + (lines.length - limit) + " more");
  }
  if (durationS >= 0) {
    plainTextLines.push("Took " + formatDur(durationS) + " [ctrl+o to hide]");
  } else {
    plainTextLines.push("[ctrl+o to hide]");
  }
  
  (raw as any)._plainText = plainTextLines.join("\n");

  class GenericComponent {
    constructor(private renderFn: (width: number) => string[]) {}
    render(width: number): string[] {
      try { return this.renderFn(width); } catch (e: any) { return [`\x1b[31mError rendering: ${e.message}\x1b[39m`]; }
    }
    invalidate() {}
    handleInput() {}
  }

  return new GenericComponent((width: number) => {
      const result: string[] = [];
      const headerPrefix = INDENT + orange(theme, headerName) + " [";
      const headerPrefixWidth = INDENT.length + headerName.length + 2;
      const argsWidth = Math.max(10, width - headerPrefixWidth - 1);
      
      const cleanArgsLine = argsLine.replace(/\r/g, "").replace(/^\n+/, "");
      const wrappedArgs = wrapTextWithAnsi(cleanArgsLine, argsWidth);
      if (wrappedArgs.length === 0) {
        result.push(headerPrefix + "]");
      } else {
        for (let i = 0; i < wrappedArgs.length; i++) {
          if (i === 0) {
            const suffix = wrappedArgs.length === 1 ? "]" : "";
            result.push(headerPrefix + wrappedArgs[i] + suffix);
          } else {
            const prefix = " ".repeat(headerPrefixWidth);
            const suffix = i === wrappedArgs.length - 1 ? "]" : "";
            result.push(prefix + wrappedArgs[i] + suffix);
          }
        }
      }

      for (const rl of raw) {
        if (!rl) result.push("");
        else if (visibleWidth(rl) <= width) result.push(rl);
        else result.push(...wrapWithPrefix(rl, width));
      }
      return result;
  });
}

function colorizeDiffLine(theme: any, line: string): string {
  const match = line.match(/^([\+\- ]?)\s*(\d+)(.*)$/);
  if (match) {
    const sign = match[1] || " ";
    const num = match[2].padStart(4, " ");
    const rest = match[3];
    
    if (sign === '+') {
      const greenText = "\x1b[38;2;120;220;120m";
      return `\x1b[97m${num} ${greenText}+${rest}\x1b[39m`;
    }
    if (sign === '-') {
      const redText = "\x1b[38;2;220;120;120m";
      return `\x1b[97m${num} ${redText}-${rest}\x1b[39m`;
    }
    return `\x1b[97m${num}   \x1b[39m${rest}`;
  }
  
  return theme.fg("text", line);
}

function diffExpandedBox(theme: any, headerName: string, argsLine: string, lines: string[], durationS: number, limit: number): Component {
  const show = lines.slice(0, limit);
  const hasMore = lines.length > limit;
  const raw: string[] = [];

  // Diff lines with │ prefix, colored by +/-
  const padding = " ".repeat(headerName.length + 1);
  const CONTENT_INDENT = padding + "│ ";
  for (const dl of show) {
    raw.push(INDENT + CONTENT_INDENT + colorizeDiffLine(theme, dl));
  }

  if (hasMore) {
    raw.push(INDENT + CONTENT_INDENT + theme.fg("dim", "... " + (lines.length - limit) + " more"));
  }

  // Footer with duration
  if (durationS >= 0) {
    raw.push(INDENT + padding + "└ " + theme.fg("dim", "Took " + formatDur(durationS) + " [ctrl+o to hide]"));
  } else {
    raw.push(INDENT + padding + "└ " + theme.fg("dim", "[ctrl+o to hide]"));
  }
  
  // Store plain text version for copy/paste
  const plainTextLines = [headerName + " [" + argsLine + "]"];
  for (const line of show) {
    plainTextLines.push(line);
  }
  if (hasMore) {
    plainTextLines.push("... " + (lines.length - limit) + " more");
  }
  if (durationS >= 0) {
    plainTextLines.push("Took " + formatDur(durationS) + " [ctrl+o to hide]");
  } else {
    plainTextLines.push("[ctrl+o to hide]");
  }
  
  (raw as any)._plainText = plainTextLines.join("\n");

  class GenericComponent {
    constructor(private renderFn: (width: number) => string[]) {}
    render(width: number): string[] {
      try { return this.renderFn(width); } catch (e: any) { return [`\x1b[31mError rendering: ${e.message}\x1b[39m`]; }
    }
    invalidate() {}
    handleInput() {}
  }

  return new GenericComponent((width: number) => {
      const result: string[] = [];
      const headerPrefix = INDENT + orange(theme, headerName) + " [";
      const headerPrefixWidth = INDENT.length + headerName.length + 2;
      const argsWidth = Math.max(10, width - headerPrefixWidth - 1);
      
      const cleanArgsLine = argsLine.replace(/\r/g, "").replace(/^\n+/, "");
      const wrappedArgs = wrapTextWithAnsi(cleanArgsLine, argsWidth);
      if (wrappedArgs.length === 0) {
        result.push(headerPrefix + "]");
      } else {
        for (let i = 0; i < wrappedArgs.length; i++) {
          if (i === 0) {
            const suffix = wrappedArgs.length === 1 ? "]" : "";
            result.push(headerPrefix + wrappedArgs[i] + suffix);
          } else {
            const prefix = " ".repeat(headerPrefixWidth);
            const suffix = i === wrappedArgs.length - 1 ? "]" : "";
            result.push(prefix + wrappedArgs[i] + suffix);
          }
        }
      }
      for (const rl of raw) {
        if (!rl) result.push("");
        else if (visibleWidth(rl) <= width) result.push(rl);
        else result.push(...wrapWithPrefix(rl, width));
      }
      return result;
  });
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

// ── Main Extension ───────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Flag so other extensions (like tasks) know we are active
  (globalThis as any).__pi_betterui_enabled = true;

  // Intercept and patch all tools to apply compact rendering format
  const patchTool = (tool: any) => {
    const EXCLUDED_TOOLS = new Set(["subagent", "read", "write", "edit", "bash", "ls", "grep", "find", "memory", "memory_search", "session_search"]);
    if (EXCLUDED_TOOLS.has(tool.name)) return;

    class CustomBlock {
      width: number;
      height: number;
      lines: string[];
      constructor(lines: string[]) {
        this.lines = lines;
        this.width = 0; // Not strictly needed
        this.height = lines.length;
      }
      invalidate() {}
      handleInput() {}
      render(width: number) {
        return this.lines.map((l: string) => truncateToWidth(l, width));
      }
    }

    // ── Todo ───────────────────────────────────────────────────────────────
    if (tool.name === "todo" || tool.name === "manage_todo") {
      if (tool.__compactui_patched) return;
      tool.__compactui_patched = true;
      tool.renderShell = "self";
      tool.renderCall = (args: any, theme: any, context: any) => {
        return noOp();
      };
      tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
        return noOp();
      };
      return;
    }

    // ── Ask Question ───────────────────────────────────────────────────────
    if (tool.name === "ask_question" || tool.name === "ask_questions" || tool.name === "questions" || tool.name === "question") {
      if (tool.__compactui_patched) return;
      tool.__compactui_patched = true;
      tool.renderShell = "self";
      tool.renderCall = (args: any, theme: any, context: any) => {
        if (context.expanded) return noOp();
        let count = 1;
        if (args && Array.isArray(args.questions)) count = args.questions.length;
        return line(INDENT + orange(theme, tool.name) + " [" + `asking ${count} question${count === 1 ? '' : 's'}` + "]" + theme.fg("dim", " (ctrl+o to expand)"));
      };
      tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
        if (result.isError) return compactFailed(theme);
        let count = 1;
        if (context?.args && Array.isArray(context.args.questions)) {
          count = context.args.questions.length;
        }
        
        if (!opts.expanded) {
          return line(INDENT + theme.fg("dim", `⎿ answered ${count} question${count === 1 ? '' : 's'}`));
        } else {
          const res = [];
          res.push(INDENT + orange(theme, tool.name) + " [questions]");
          const text = result.content?.[0]?.text || "";
          for (const l of text.split('\n')) {
            if (l.trim()) res.push(INDENT + "  " + theme.fg("dim", "│ ") + l);
          }
          res.push(INDENT + "  " + theme.fg("dim", "└ ") + theme.fg("dim", "Took 0.2s [ctrl+o to hide]"));
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
        
        // Create a plain text version for copy/paste with extra space before │
        const plainTextLines = ["powershell [" + (context.args.command ?? "?") + "]"];
        for (const line of lines) {
          plainTextLines.push(line.startsWith("│") ? " " + line : line);
        }
        if (durationS >= 0) {
          plainTextLines.push("Took " + formatDur(durationS) + " [ctrl+o to hide]");
        } else {
          plainTextLines.push("[ctrl+o to hide]");
        }
        (result as any)._plainText = plainTextLines.join("\n");
        
        // Create a custom component specifically for powershell that adds space before │
        // First, process the lines to add space before │
        const processedLines = lines.map(line => line.startsWith("│") ? " "+ line : line);
        
        return expandedBox(theme, "powershell", context.args.command ?? "", processedLines, durationS, 50);
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
        return expandedBox(theme, "run_command", context.args.CommandLine ?? "", lines, durationS, 50);
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
        return expandedBox(theme, "web_search", context.args.query ?? "", lines, durationS, 50);
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
        return expandedBox(theme, tool.name, context.args.url ?? "", lines, durationS, 50);
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
          // Parse task count from output
          const taskCount = full.includes("TaskId") || full.includes("task") ? 1 : 0;
          return compactSummary(theme, "checked tasks", taskCount, "task");
        }
        const lines = full.split("\n");
        const durationS = (details?._durationS as number) ?? -1;
        return expandedBox(theme, "manage_task", `${context.args.Action} ${context.args.TaskId || ""}`.trim(), lines, durationS, 50);
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
        return expandedBox(theme, "schedule", argsLine, lines, durationS, 50);
      };
      return;
    }

    if (tool.__compactui_patched) return;
    tool.__compactui_patched = true;
    tool.renderShell = "self";

    tool.renderCall = (args: any, theme: any, context: any) => {
      if (context.expanded) return noOp();
      const argsLine = Object.values(args || {}).map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(" ");
      return compactCall(tool.name, argsLine, theme);
    };
    
    tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
      // Compact styled error for unknown tools (even when collapsed)
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
      
      return expandedBox(theme, tool.name, argsLine, lines, durationS, 50);
    };
  };

  const registeredTools = (pi as any).tools ? ((pi as any).tools instanceof Map ? Array.from((pi as any).tools.values()) : Object.values((pi as any).tools)) : ((pi as any).getTools ? (pi as any).getTools() : []);
  for (const tool of registeredTools) {
    if (tool && typeof tool === 'object') patchTool(tool);
  }

  // Patch the instance's registerTool
  const origRegister = pi.registerTool.bind(pi);
  pi.registerTool = (tool: any) => {
    patchTool(tool);
    origRegister(tool);
  };

  // Patch the prototype's registerTool to catch other extensions (since each extension might get a bound copy of pi)
  const proto = Object.getPrototypeOf(pi);
  if (proto && typeof proto.registerTool === "function" && !(proto as any).__compactui_patched_register) {
    (proto as any).__compactui_patched_register = true;
    const origProtoRegister = proto.registerTool;
    proto.registerTool = function(tool: any) {
      patchTool(tool);
      return origProtoRegister.call(this, tool);
    };
  }

  // Also expose patchTool globally as a fallback for extensions that get a completely fresh pi object
  (globalThis as any).__pi_patchTool = patchTool;

  if (!patchedAssistant) {
    try {
        const originalUserRender = UserMessageComponent.prototype.render;
          UserMessageComponent.prototype.render = function(width: number) {
              const lines = originalUserRender.call(this, width);
              return lines;
          };
        
        // Track last message type for context-aware spacing
        let lastMessageRole: string | null = null;

        if (InteractiveMode && InteractiveMode.prototype.addMessageToChat && !(InteractiveMode.prototype.addMessageToChat as any).__compactui_patched) {
            const originalAdd = InteractiveMode.prototype.addMessageToChat;
            InteractiveMode.prototype.addMessageToChat = function(message: any, options?: any) {
                // Add spacing before user message
                if (message.role === "user") {
                    this.chatContainer.addChild(line(""));
                }
                
                // Track message role
                lastMessageRole = message.role;
                
                const originalAddChild = this.chatContainer.addChild;
                this.chatContainer.addChild = function(child: any) {
                    // Block native Spacers to prevent double-spacing
                    if (child && child.constructor && child.constructor.name === "Spacer") return;
                    return originalAddChild.apply(this, arguments);
                };
                let result;
                try {
                    result = originalAdd.call(this, message, options);
                } finally {
                    this.chatContainer.addChild = originalAddChild;
                }
                return result;
            };
            (InteractiveMode.prototype.addMessageToChat as any).__compactui_patched = true;
        }

        AssistantMessageComponent.prototype.updateContent = function(message: any) {
            this.lastMessage = message;
            this.contentContainer.clear();


            let hasThinking = false;
            for (let i = 0; i < message.content.length; i++) {
                const content = message.content[i];
                if (content.type === "text" && content.text.trim()) {
                    if (hasThinking) {
                        this.contentContainer.addChild(line(""));
                    }
                    if (content.text) {
                        this.contentContainer.addChild(new Markdown(content.text.trim(), 1, 0, this.markdownTheme));
                    }
                }
                else if (content.type === "thinking" && content.thinking && content.thinking.trim()) {
                    hasThinking = true;
                    
                    if (!content._clientStartTime) {
                        content._clientStartTime = Date.now();
                    }

                    const hasVisibleContentAfter = message.content
                        .slice(i + 1)
                        .some((c: any) => (c.type === "text" && c.text && c.text.trim()) || (c.type === "thinking" && c.thinking && c.thinking.trim()) || c.type === "toolCall");
                    
                    const isThinkingDone = hasVisibleContentAfter || message.stopReason;
                    
                    if (isThinkingDone && !content._clientEndTime) {
                        content._clientEndTime = Date.now();
                    }

                    if (isThinkingDone) {
                        let durationS = 0;
                        if (typeof content.durationMs === "number") {
                            durationS = Math.round(content.durationMs / 1000);
                        } else if (content._clientEndTime && content._clientStartTime && (content._clientEndTime - content._clientStartTime) > 100) {
                            content.durationMs = content._clientEndTime - content._clientStartTime;
                            durationS = Math.round(content.durationMs / 1000);
                        } else if (content._clientStartTime) {
                            const fallbackDuration = Date.now() - content._clientStartTime;
                            if (fallbackDuration > 100) {
                                content.durationMs = fallbackDuration;
                                durationS = Math.round(fallbackDuration / 1000);
                            }
                        }
                        
                        durationS = Math.max(0, durationS);
                        if (durationS > 0) {
                            this.hiddenThinkingLabel = `✻ Thought for ${durationS}s`;
                        } else {
                            this.hiddenThinkingLabel = `✻ Thought`;
                        }
                    } else {
                        this.hiddenThinkingLabel = "✻  Thinking...";
                    }
                    
                    if (this.hideThinkingBlock) {
                        this.contentContainer.addChild(new Text(italicText(colorThinkingText(this.hiddenThinkingLabel)), 1, 0));
                    }
                    else {
                        this.contentContainer.addChild(new ThinkingBlock(content.thinking.trim(), 1, 0, this.markdownTheme, {
                            color: colorThinkingText,
                            italic: true,
                        }));
                    }
                }
            }
            
            const hasToolCalls = message.content.some((c: any) => c.type === "toolCall");
            this.hasToolCalls = hasToolCalls;
            if (!hasToolCalls) {
                if (message.stopReason === "aborted") {
                    const abortMessage = message.errorMessage && message.errorMessage !== "Request was aborted"
                        ? message.errorMessage
                        : "Operation aborted";
                    this.contentContainer.addChild(new Text(`\x1b[38;2;255;85;85m${abortMessage}\x1b[39m`, 1, 0));
                }
                else if (message.stopReason === "error") {
                    const errorMsg = message.errorMessage || "Unknown error";
                    this.contentContainer.addChild(new Text(`\x1b[38;2;255;85;85mError: ${errorMsg}\x1b[39m`, 1, 0));
                }
            }
        };
        
        if (InteractiveMode && InteractiveMode.prototype.syncMessages && !InteractiveMode.prototype.syncMessages.__compactui_patched) {
            
            // ── NEW: Monkey Patch ToolExecutionComponent to lazily patch tools ──
            if (ToolExecutionComponent && ToolExecutionComponent.prototype.render && !ToolExecutionComponent.prototype.render.__compactui_patched) {
                const originalRender = ToolExecutionComponent.prototype.render;
                ToolExecutionComponent.prototype.render = function() {
                    let needsUpdate = false;
                    if (this.toolDefinition && typeof (globalThis as any).__pi_patchTool === "function") {
                        if (!this.toolDefinition.__compactui_patched) {
                            (globalThis as any).__pi_patchTool(this.toolDefinition);
                            needsUpdate = true;
                        }
                    }
                    if (this.builtInToolDefinition && typeof (globalThis as any).__pi_patchTool === "function") {
                        if (!this.builtInToolDefinition.__compactui_patched) {
                            (globalThis as any).__pi_patchTool(this.builtInToolDefinition);
                            needsUpdate = true;
                        }
                    }
                    
                    // Remove native Spacers at the top of tool components
                    if (this.children && this.children.length > 0) {
                        while (this.children.length > 0 && this.children[0].constructor.name === "Spacer") {
                            this.children.shift();
                        }
                    }

                    if (needsUpdate && typeof this.updateDisplay === "function") {
                        // Force it to use the new renderers now that the definition is patched
                        this.updateDisplay();
                    }
                    const lines = originalRender.apply(this, arguments);
                    // Strip leading empty lines to move tools left
                    while (lines.length > 0 && lines[0].trim() === "") {
                        lines.shift();
                    }
                    return lines;
                };
                ToolExecutionComponent.prototype.render.__compactui_patched = true;
            }

            const originalSyncMessages = InteractiveMode.prototype.syncMessages;
            InteractiveMode.prototype.syncMessages = function() {
                const originalAddChild = this.chatContainer.addChild;
                this.chatContainer.addChild = function(child: any) {
                    // Block native Spacers to prevent double-spacing
                    if (child && child.constructor && child.constructor.name === "Spacer") return;
                    return originalAddChild.apply(this, arguments);
                };
                
                let result;
                try {
                    result = originalSyncMessages.apply(this, arguments);
                } finally {
                    this.chatContainer.addChild = originalAddChild;
                }
                return result;
            };
            InteractiveMode.prototype.syncMessages.__compactui_patched = true;

            const originalToggleExpand = InteractiveMode.prototype.toggleToolOutputExpansion;
            if (originalToggleExpand && !InteractiveMode.prototype.toggleToolOutputExpansion.__compactui_patched) {
                InteractiveMode.prototype.toggleToolOutputExpansion = function() {
                    const scroll = this.chatContainer && typeof this.chatContainer.getScroll === 'function' ? this.chatContainer.getScroll() : undefined;
                    
                    originalToggleExpand.apply(this, arguments);

                    this.hideThinkingBlock = !this.hideThinkingBlock;
                    if (this.settingsManager && typeof this.settingsManager.setHideThinkingBlock === "function") {
                        this.settingsManager.setHideThinkingBlock(this.hideThinkingBlock);
                    }
                    if (this.chatContainer) {
                        this.chatContainer.clear();
                    }
                    if (typeof this.rebuildChatFromMessages === "function") {
                        this.rebuildChatFromMessages();
                    }
                    if (this.streamingComponent && this.streamingMessage && this.chatContainer) {
                        if (typeof this.streamingComponent.setHideThinkingBlock === "function") {
                            this.streamingComponent.setHideThinkingBlock(this.hideThinkingBlock);
                        }
                        if (typeof this.streamingComponent.updateContent === "function") {
                            this.streamingComponent.updateContent(this.streamingMessage);
                        }
                        this.chatContainer.addChild(this.streamingComponent);
                    }
                    if (typeof this.showStatus === "function") {
                        this.showStatus(`Tools & Thinking toggled`);
                    }

                    if (scroll !== undefined && this.chatContainer && typeof this.chatContainer.setScroll === 'function') {
                        setTimeout(() => {
                            if (this.chatContainer && typeof this.chatContainer.setScroll === 'function') {
                                this.chatContainer.setScroll(scroll);
                            }
                            if (this.ui && typeof this.ui.requestRender === 'function') {
                                this.ui.requestRender();
                            }
                        }, 10);
                    }
                };
                InteractiveMode.prototype.toggleToolOutputExpansion.__compactui_patched = true;
            }

            const originalToggleThinking = InteractiveMode.prototype.toggleThinkingBlockVisibility;
            if (originalToggleThinking && !InteractiveMode.prototype.toggleThinkingBlockVisibility.__compactui_patched) {
                InteractiveMode.prototype.toggleThinkingBlockVisibility = function() {
                    const scroll = this.chatContainer && typeof this.chatContainer.getScroll === 'function' ? this.chatContainer.getScroll() : undefined;
                    
                    if (typeof this.cycleThinkingLevel === "function") {
                        // In the base code, cycleThinkingLevel modifies state. Since we are overriding it below, 
                        // we must ensure we call the cycle logic. Actually, we can just call the original logic here
                        // if we want, or just call this.cycleThinkingLevel().
                        this.cycleThinkingLevel();
                    }

                    if (scroll !== undefined && this.chatContainer && typeof this.chatContainer.setScroll === 'function') {
                        setTimeout(() => {
                            if (this.chatContainer && typeof this.chatContainer.setScroll === 'function') {
                                this.chatContainer.setScroll(scroll);
                            }
                            if (this.ui && typeof this.ui.requestRender === 'function') {
                                this.ui.requestRender();
                            }
                        }, 10);
                    }
                };
                InteractiveMode.prototype.toggleThinkingBlockVisibility.__compactui_patched = true;
            }

            const originalCycleThinking = InteractiveMode.prototype.cycleThinkingLevel;
            if (originalCycleThinking && !InteractiveMode.prototype.cycleThinkingLevel.__compactui_patched) {
                InteractiveMode.prototype.cycleThinkingLevel = function() {
                    const scroll = this.chatContainer && typeof this.chatContainer.getScroll === 'function' ? this.chatContainer.getScroll() : undefined;
                    
                    originalCycleThinking.apply(this, arguments);

                    if (scroll !== undefined && this.chatContainer && typeof this.chatContainer.setScroll === 'function') {
                        setTimeout(() => {
                            if (this.chatContainer && typeof this.chatContainer.setScroll === 'function') {
                                this.chatContainer.setScroll(scroll);
                            }
                            if (this.ui && typeof this.ui.requestRender === 'function') {
                                this.ui.requestRender();
                            }
                        }, 10);
                    }
                };
                InteractiveMode.prototype.cycleThinkingLevel.__compactui_patched = true;
            }
        }
        
		patchedAssistant = true;
    } catch (e) {
        console.error("Failed to patch UI components in compactui extension:", e);
    }
  }

  const cwd = process.cwd();
  const unknownTools = new Set<string>();

  // ── Detect unknown tool names ───────────────────────────────────────
  const KNOWN_TOOLS = new Set(["read", "write", "edit", "bash", "grep", "find", "ls", "web_search", "web_fetch", "fetch_content", "get_search_content", "run_command", "manage_task", "schedule", "subagent", "todo", "powershell", "questions", "video_extract", "skill_manage", "plan", "memory", "memory_search", "session_search"]);
  pi.on("tool_call", async (event) => {
    if (!KNOWN_TOOLS.has(event.toolName) && !unknownTools.has(event.toolName)) {
      unknownTools.add(event.toolName);
    }
  });

  // ── Strip emojis + truncate hermes-memory tools ──────────────────────
  function stripEmojis(text: string): string {
    return text
      .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "")
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
      .replace(/[\u{1FA00}-\u{1FAFF}]/gu, "")
      .replace(/[\u{2600}-\u{26FF}]/gu, "")
      .replace(/[\u{2700}-\u{27BF}]/gu, "")
      .replace(/[\u{2190}-\u{21FF}]/gu, "")
      .replace(/[\u{2300}-\u{23FF}]/gu, "")
      .replace(/[\u{2500}-\u{257F}]/gu, "")
      .replace(/[\u{2580}-\u{259F}]/gu, "")
      .replace(/[\u{25A0}-\u{25FF}]/gu, "")
      .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
      .replace(/[\u{200D}]/gu, "")
      .replace(/[\u{20E3}]/gu, "")
      .replace(/[\u{E0020}-\u{E007F}]/gu, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

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

    // Hermes-memory tools now have their own renderCall/renderResult
    // in the pi-hermes-memory extension — skip them here

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
      if (context.expanded) return noOp();
      return compactCall("read", args.path ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");
      const lineCount = lines.length;

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read tool output", lineCount, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      const filePath = context.args.path ?? "?";
      const offset = (context.args.offset as number) || 1;
      const endLine = offset + lineCount - 1;
      const label = lineCount > 0 ? `${offset}-${endLine}, ${filePath}` : filePath;
      
      const numberedLines = lines.map((line, i) => {
        const num = String(offset + i).padStart(4, " ");
        return `${num}  ${line}`;
      });
      
      return expandedBox(theme, "read", label, numberedLines, durationS, 40);
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
      if (context.expanded) return noOp();
      return compactCall("write", args.path ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");
      const lineCount = lines.length;

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "file written", lineCount, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      const filePath = context.args.path ?? "?";
      
      const numberedLines = lines.map((line, i) => {
        const num = String(i + 1).padStart(4, " ");
        return `${num}  ${line}`;
      });
      
      return expandedBox(theme, "write", filePath, numberedLines, durationS, 40);
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
      if (context.expanded) return noOp();
      return compactCall("edit", args.path ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as EditToolDetails | undefined;
      if (!details?.diff) return noOp();
      const diffLines = details.diff.split("\n");

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "file edited", diffLines.length, "line");
      }

      const durationS = (result.details as Record<string, unknown>)?._durationS as number ?? -1;
      
      // Create a plain text version for copy/paste
      const plainTextLines = ["edit [" + (context.args.path ?? "?") + "]"];
      for (const line of diffLines) {
        plainTextLines.push(line);
      }
      if (durationS >= 0) {
        plainTextLines.push("Took " + formatDur(durationS) + " [ctrl+o to hide]");
      } else {
        plainTextLines.push("[ctrl+o to hide]");
      }
      (result as any)._plainText = plainTextLines.join("\n");
      
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
      if (context.expanded) return noOp();
      return compactCall("bash", args.command ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

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
      if (context.expanded) return noOp();
      return compactCall("ls", args.path || ".", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n").filter((l: string) => l.trim());

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

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
      if (context.expanded) return noOp();
      return compactCall("grep", args.pattern ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n").filter((l: string) => l.trim());

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

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
      if (context.expanded) return noOp();
      return compactCall("find", (args.pattern ?? "?") + (args.path ? " " + args.path : ""), theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n").filter((l: string) => l.trim());

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "find", (context.args.pattern ?? "?") + (context.args.path ? " " + context.args.path : ""), lines, durationS, 50);
    },
  });


}
