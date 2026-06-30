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
import {
  noOp, compactCall, compactSummary, compactFailed,
  expandedBox, diffExpandedBox, captureResult, formatDur
} from "./rendering.js";

export function registerTools(pi: ExtensionAPI, cwd: string) {
  //  Tool: Read 
  const originalRead = createReadTool(cwd);
  pi.registerTool({
    name: "read",
    label: "read",
    description: originalRead.description,
    parameters: originalRead.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalRead.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall("read", args.path ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
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
      const label =
        lineCount > 0 ? `${offset}-${endLine}, ${filePath}` : filePath;

      const numberedLines = lines.map((line: string, i: number) => {
        const num = String(offset + i).padStart(4, " ");
        return `${num}  ${line}`;
      });

      return expandedBox(theme, "read", label, numberedLines, durationS, 40);
    },
  });

  // ── Tool: Write ─────────────────────────────────────────────────────
  const originalWrite = createWriteTool(cwd);
  pi.registerTool({
    name: "write",
    label: "write",
    description: originalWrite.description,
    parameters: originalWrite.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalWrite.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall("write", args.path ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");
      const lineCount = lines.length;

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "file written", lineCount, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      const filePath = context.args.path ?? "?";

      const numberedLines = lines.map((line: string, i: number) => {
        const num = String(i + 1).padStart(4, " ");
        return `${num}  ${line}`;
      });

      return expandedBox(theme, "write", filePath, numberedLines, durationS, 40);
    },
  });

  // ── Tool: Edit ──────────────────────────────────────────────────────
  const originalEdit = createEditTool(cwd);
  pi.registerTool({
    name: "edit",
    label: "edit",
    description: originalEdit.description,
    parameters: originalEdit.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      const result = await originalEdit.execute(
        toolCallId,
        params,
        signal,
        onUpdate
      );
      const durationMs = Date.now() - t0;
      const diff = (result.details as Record<string, unknown>)?.diff as
        | string
        | undefined;
      const fullText = diff || result.content?.[0]?.text || "";
      return {
        ...result,
        details: {
          ...result.details,
          _fullOutput: fullText,
          _durationS: durationMs / 1000,
        },
      };
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

      const durationS =
        ((result.details as Record<string, unknown>)?._durationS as number) ??
        -1;

      const plainTextLines = [
        "edit [" + (context.args.path ?? "?") + "]",
      ];
      for (const line of diffLines) {
        plainTextLines.push(line);
      }
      if (durationS >= 0) {
        plainTextLines.push(
          "Took " + formatDur(durationS) + " [ctrl+o to hide]"
        );
      } else {
        plainTextLines.push("[ctrl+o to hide]");
      }
      (result as any)._plainText = plainTextLines.join("\n");

      return diffExpandedBox(
        theme,
        "edit",
        context.args.path ?? "",
        diffLines,
        durationS,
        50
      );
    },
  });

  // ── Tool: Bash ──────────────────────────────────────────────────────
  const originalBash = createBashTool(cwd);
  pi.registerTool({
    name: "bash",
    label: "bash",
    description: originalBash.description,
    parameters: originalBash.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalBash.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall("bash", args.command ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      const cmd =
        context.args.command || (details?.command as string) || "";
      return expandedBox(theme, "bash", cmd, lines, durationS, 50);
    },
  });

  // ── Tool: Ls ────────────────────────────────────────────────────────
  const originalLs = createLsTool(cwd);
  pi.registerTool({
    name: "ls",
    label: "ls",
    description: originalLs.description,
    parameters: originalLs.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalLs.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall("ls", args.path || ".", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n").filter((l: string) => l.trim());

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "ls", context.args.path || ".", lines, durationS, 50);
    },
  });

  // ── Tool: Grep ──────────────────────────────────────────────────────
  const originalGrep = createGrepTool(cwd);
  pi.registerTool({
    name: "grep",
    label: "grep",
    description: originalGrep.description,
    parameters: originalGrep.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalGrep.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall("grep", args.pattern ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n").filter((l: string) => l.trim());

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "grep", context.args.pattern ?? "?", lines, durationS, 50);
    },
  });

  // ── Tool: Find ──────────────────────────────────────────────────────
  const originalFind = createFindTool(cwd);
  pi.registerTool({
    name: "find",
    label: "find",
    description: originalFind.description,
    parameters: originalFind.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalFind.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall(
        "find",
        (args.pattern ?? "?") + (args.path ? " " + args.path : ""),
        theme
      );
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n").filter((l: string) => l.trim());

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(
        theme,
        "find",
        (context.args.pattern ?? "?") +
          (context.args.path ? " " + context.args.path : ""),
        lines,
        durationS,
        50
      );
    },
  });
}
