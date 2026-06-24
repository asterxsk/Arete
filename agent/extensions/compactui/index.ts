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
  AssistantMessageComponent,
  UserMessageComponent,
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth, visibleWidth, Container, Markdown, Spacer, Text, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ── Constants ──────────────────────────────────────────────────────────

const INDENT = " ";
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
        const textLines = this.text.split("\n");
        
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
        const lastNonEmptyIdx = visualLines.reduce((acc, line, i) => line.isEmpty ? acc : i, 0);
        const isSingleLine = visualLines.filter(l => !l.isEmpty).length <= 1;

        for (let i = 0; i < visualLines.length; i++) {
            const vl = visualLines[i];
            if (vl.isEmpty) {
                result.push(leftPad + colorThinkingText("│"));
                continue;
            }
            let prefix: string;
            if (isSingleLine) {
                prefix = "└ ";
            }
            else if (i === 0) {
                prefix = "│ ";
            }
            else if (i === lastNonEmptyIdx) {
                prefix = "└ ";
            }
            else {
                prefix = "│ ";
            }
            result.push(leftPad + colorThinkingText(prefix) + this.applyStyle(vl.text));
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
  raw.push(INDENT + orange(theme, headerName) + " [" + argsLine + "]");

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
  raw.push(INDENT + orange(theme, headerName) + " [" + argsLine + "]");

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

// ── Main Extension ───────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Flag so other extensions (like tasks) know we are active
  (globalThis as any).__pi_betterui_enabled = true;

  // Intercept all tool registrations to compactify 'run_command' and 'manage_task' which are defined in the tasks extension
  const origRegister = pi.registerTool.bind(pi);
  pi.registerTool = (tool: any) => {
    if (tool.name === "run_command" || tool.name === "manage_task") {
      tool.renderCall = (args: any, theme: any, context: any) => {
        if (context.expanded) return line("");
        let argsLine = "??";
        if (tool.name === "run_command") argsLine = args.CommandLine as string || "?";
        else if (tool.name === "manage_task") argsLine = `${args.Action} ${args.TaskId || ""}`.trim();
        return compactCall(tool.name, argsLine, theme);
      };
      
      tool.renderResult = (result: any, opts: any, theme: any, context: any) => {
        if (!opts.expanded) return noOp();
        
        let argsLine = "??";
        if (tool.name === "run_command") argsLine = context.args.CommandLine as string || "?";
        else if (tool.name === "manage_task") argsLine = `${context.args.Action} ${context.args.TaskId || ""}`.trim();
        
        const content = result.content?.[0];
        const text = content?.type === "text" ? content.text : "";
        const lines = text.split("\n").filter((l: string) => l.trim());
        const durationS = (result.details as any)?._durationS ?? 0.0;
        
        return expandedBox(theme, tool.name, argsLine, lines, durationS, 50);
      };
    }
    origRegister(tool);
  };

  if (!patchedAssistant) {
    try {
        AssistantMessageComponent.prototype.updateContent = function(message: any) {
            this.lastMessage = message;
            this.contentContainer.clear();
            const hasVisibleContent = message.content.some((c: any) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));
            
            for (let i = 0; i < message.content.length; i++) {
                const content = message.content[i];
                if (content.type === "text" && content.text.trim()) {
                    this.contentContainer.addChild(new Markdown(content.text.trim(), 1, 0, this.markdownTheme));
                }
                else if (content.type === "thinking" && content.thinking.trim()) {
                    const hasVisibleContentAfter = message.content
                        .slice(i + 1)
                        .some((c: any) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));
                    
                    if (this.hideThinkingBlock) {
                        this.contentContainer.addChild(new Text(italicText(colorThinkingText(this.hiddenThinkingLabel)), 1, 0));
                        if (hasVisibleContentAfter) {
                            this.contentContainer.addChild(new Spacer(1));
                        }
                    }
                    else {
                        this.contentContainer.addChild(new ThinkingBlock(content.thinking.trim(), 1, 0, this.markdownTheme, {
                            color: colorThinkingText,
                            italic: true,
                        }));
                        if (hasVisibleContentAfter) {
                            this.contentContainer.addChild(new Spacer(1));
                        }
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
                    this.contentContainer.addChild(new Spacer(1));
                    this.contentContainer.addChild(new Text(`\x1b[38;2;255;85;85mError: ${errorMsg}\x1b[39m`, 1, 0));
                }
            }
        };
        
		patchedAssistant = true;
    } catch (e) {
        console.error("Failed to patch UI components in compactui extension:", e);
    }
  }

  const cwd = process.cwd();
  const unknownTools = new Set<string>();

  // ── Detect unknown tool names ───────────────────────────────────────
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
      if (context.expanded) return line("");
      return compactCall("read", args.path ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      if (!expanded) return noOp();
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
    renderResult(result, { expanded }, theme, context) {
      if (!expanded) return noOp();
      const details = result.details as Record<string, unknown> | undefined;
      const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");
      const durationS = (details?._durationS as number) ?? -1;
      const filePath = context.args.path ?? "?";
      return expandedBox(theme, "write", filePath, lines, durationS, 40);
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
      if (!details?.diff) return noOp();
      const diffLines = details.diff.split("\n");
      if (!expanded) return noOp();
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
      if (!expanded) return noOp();
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
      if (!expanded) return noOp();
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
      if (!expanded) return noOp();
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
      if (!expanded) return noOp();
      const lines = full.split("\n").filter((l: string) => l.trim());
      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "find", (context.args.pattern ?? "?") + (context.args.path ? " " + context.args.path : ""), lines, durationS, 50);
    },
  });


}
