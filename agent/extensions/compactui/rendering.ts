/**
 * rendering.ts — Shared rendering primitives for compactui
 *
 * Compact tool rendering helpers: line components, orange tool names,
 * compact call/result, expanded box, diff display, duration formatting.
 */

import { type Component, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

// ── Constants ──────────────────────────────────────────────────────────

export const INDENT = " "; // Single space indent for tools
export const HINT = " (ctrl+o to expand)";
export const DIM_GREY = "\x1b[38;2;140;140;140m"; // Consistent dim color for all tool summaries

// ── Component Factories ────────────────────────────────────────────────

export function line(text: string): Component {
  return {
    render(width) {
      return [truncateToWidth(text, width, "...")];
    },
    invalidate() {},
  };
}

/** Blank spacer line used for uniform element spacing. */
export function spacer(): Component {
  return {
    __compactui_spacer: true,
    render() {
      return [""];
    },
    invalidate() {},
  };
}

/** No-op component that renders nothing (avoids extra newline). */
export function noOp(): Component {
  return {
    render() { return []; },
    invalidate() {},
  };
}

export function orange(theme: any, text: string): string {
  return `\x1b[38;2;250;179;135m${text}\x1b[39m`;
}

export function compactCall(toolName: string, argsStr: string, theme: any): Component {
  let display = argsStr.split("\n")[0] ?? argsStr;
  const maxDisplay = 40;
  if (display.length > maxDisplay) display = display.slice(0, maxDisplay - 3) + "...";
  else if (display.length < argsStr.length) display += "...";
  return line(INDENT + orange(theme, toolName) + " [" + display + "]" + DIM_GREY + HINT + "\x1b[39m");
}

export function compactSummary(theme: any, summary: string, count: number, unit: string): Component {
  const countStr = count > 0 ? ` (${count} ${unit}${count !== 1 ? "s" : ""})` : "";
  return line(INDENT + DIM_GREY + "\u23bf " + summary + countStr + "\x1b[39m");
}

export function compactFailed(theme: any): Component {
  return line(INDENT + DIM_GREY + "\u23bf failed tool call" + "\x1b[39m");
}

export function formatDur(s: number): string {
  if (s < 0.01) return "0.0s";
  if (s < 60) return s.toFixed(1) + "s";
  return Math.floor(s / 60) + "m " + Math.floor(s % 60) + "s";
}

// ── Wrap with Prefix (for expanded box lines) ──────────────────────────

export function wrapWithPrefix(rl: string, width: number): string[] {
  const visible = rl.replace(/\x1b\[[0-9;]*m/g, "");
  // Match prefix: optional leading spaces, then │ or └, then trailing space(s)
  const match = visible.match(/^(\s*(?:\u2502|\u2514)\s*)/);
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

  // 2-char right margin
  const contentWidth = Math.max(10, width - prefixLen - 2);
  const wrappedContent = wrapTextWithAnsi(contentStr, contentWidth);
  if (wrappedContent.length === 0) return [ansiPrefix];

  const result = [ansiPrefix + wrappedContent[0]];
  // Subsequent lines get the same prefix (spaces + │)
  const subsequentPrefixStr = match[1].replace(/[^\s]/g, " ");
  for (let j = 1; j < wrappedContent.length; j++) {
    result.push(subsequentPrefixStr + wrappedContent[j]);
  }
  return result;
}

// ── Expanded Box ───────────────────────────────────────────────────────

export function expandedBox(theme: any, headerName: string, argsLine: string, lines: string[], durationS: number, limit: number): Component {
  const show = lines.slice(0, limit);
  const hasMore = lines.length > limit;
  const raw: string[] = [];

  // Output lines with \u2502 prefix aligned under [
  const padding = " ".repeat(headerName.length + 1);
  const CONTENT_INDENT = padding + "\u2502 ";
  for (const line of show) {
    raw.push(INDENT + CONTENT_INDENT + theme.fg("text", line));
  }

  if (hasMore) {
    raw.push(INDENT + CONTENT_INDENT + DIM_GREY + "... " + (lines.length - limit) + " more\x1b[39m");
  }

  // Footer with duration
  if (durationS >= 0) {
    raw.push(INDENT + padding + "\u2514 " + DIM_GREY + "Took " + formatDur(durationS) + " [ctrl+o to hide]\x1b[39m");
  } else {
    raw.push(INDENT + padding + "\u2514 " + DIM_GREY + "[ctrl+o to hide]\x1b[39m");
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

// ── Diff Coloring ──────────────────────────────────────────────────────

export function colorizeDiffLine(theme: any, line: string): string {
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

export function diffExpandedBox(theme: any, headerName: string, argsLine: string, lines: string[], durationS: number, limit: number): Component {
  const show = lines.slice(0, limit);
  const hasMore = lines.length > limit;
  const raw: string[] = [];

  // Diff lines with \u2502 prefix, colored by +/-
  const padding = " ".repeat(headerName.length + 1);
  const CONTENT_INDENT = padding + "\u2502 ";
  for (const dl of show) {
    raw.push(INDENT + CONTENT_INDENT + colorizeDiffLine(theme, dl));
  }

  if (hasMore) {
    raw.push(INDENT + CONTENT_INDENT + DIM_GREY + "... " + (lines.length - limit) + " more\x1b[39m");
  }

  // Footer with duration
  if (durationS >= 0) {
    raw.push(INDENT + padding + "\u2514 " + DIM_GREY + "Took " + formatDur(durationS) + " [ctrl+o to hide]\x1b[39m");
  } else {
    raw.push(INDENT + padding + "\u2514 " + DIM_GREY + "[ctrl+o to hide]\x1b[39m");
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

// ── Capture Result ─────────────────────────────────────────────────────

export function captureResult(result: any, durationMs?: number): any {
  const fullText = result.content?.[0]?.text || "";
  const details: Record<string, unknown> = { ...result.details, _fullOutput: fullText };
  if (durationMs !== undefined) {
    details._durationS = durationMs / 1000;
  }
  return { ...result, details };
}
