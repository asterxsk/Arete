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



// ── Wrap with Prefix (for expanded box lines) ──────────────────────────

export function wrapWithPrefix(rl: string, width: number): string[] {
  const visible = rl.replace(/\x1b\[[0-9;]*m/g, "");
  // Match prefix: leading spaces + ⎿ (U+23BF) or │ or └ + trailing spaces
  // This handles formats like " ⎿ " or " │ " or "└ " or just "│ "
  const match = visible.match(/^(\s*[\u23BF\u2502\u2514]\s*)/);
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
  // Subsequent lines use spaces instead of ⎿/│/└ prefix
  // Replace the box-drawing character with spaces to match expandedBox format
  const subsequentPrefix = match[1].replace(/[\u23BF\u2502\u2514]/g, " ");
  for (let j = 1; j < wrappedContent.length; j++) {
    result.push(subsequentPrefix + wrappedContent[j]);
  }
  return result;
}

// ── Expanded Box ───────────────────────────────────────────────────────

export function expandedBox(theme: any, headerName: string, argsLine: string, lines: string[], limit: number): Component {
  const show = lines.slice(0, limit);
  const hasMore = lines.length > limit;
  const raw: string[] = [];

  // Output lines: ⎿ on first line, spaces on following lines
  // No padding - header is also at position 0
  for (let i = 0; i < show.length; i++) {
    // ⎿ is 1 char, space + ⎿ + 2 spaces = 4 chars total, same as 3 spaces on subsequent lines
    const prefix = i === 0 ? " \u23bf  " : "   "; // space + ⎿ + 2 spaces, subsequent lines 3 spaces
    raw.push(prefix + theme.fg("text", show[i]));
  }

  if (hasMore) {
    raw.push("  " + DIM_GREY + "... " + (lines.length - limit) + " more\x1b[39m");
  }

  // Store plain text version for copy/paste
  const plainTextLines = [headerName + " [" + argsLine + "]"];
  for (const line of show) {
    plainTextLines.push(line);
  }
  if (hasMore) {
    plainTextLines.push("... " + (lines.length - limit) + " more");
  }

  class GenericComponent {
    _plainText: string;
    constructor(private renderFn: (width: number) => string[], plainText: string) {
      this._plainText = plainText;
    }
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
      if (cleanArgsLine.length === 0) {
        // No args - just show header without brackets or INDENT
        result.push(truncateToWidth(orange(theme, headerName), width));
      } else if (wrappedArgs.length === 0) {
        result.push(truncateToWidth(headerPrefix + "]", width));
      } else {
        for (let i = 0; i < wrappedArgs.length; i++) {
          if (i === 0) {
            const suffix = wrappedArgs.length === 1 ? "]" : "";
            result.push(truncateToWidth(headerPrefix + wrappedArgs[i] + suffix, width));
          } else {
            const prefix = " ".repeat(headerPrefixWidth);
            const suffix = i === wrappedArgs.length - 1 ? "]" : "";
            result.push(truncateToWidth(prefix + wrappedArgs[i] + suffix, width));
          }
        }
      }

      for (const rl of raw) {
        if (!rl) result.push("");
        else if (visibleWidth(rl) <= width) result.push(rl);
        else result.push(...wrapWithPrefix(rl, width));
      }
      return result;
  }, plainTextLines.join("\n"));
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
      return `${DIM_GREY}${num}\x1b[39m ${greenText}+${rest}\x1b[39m`;
    }
    if (sign === '-') {
      const redText = "\x1b[38;2;220;120;120m";
      return `${DIM_GREY}${num}\x1b[39m ${redText}-${rest}\x1b[39m`;
    }
    return `${DIM_GREY}${num}\x1b[39m   ${rest}`;
  }

  return theme.fg("text", line);
}

export function diffExpandedBox(theme: any, headerName: string, argsLine: string, lines: string[], limit: number): Component {
  const show = lines.slice(0, limit);
  const hasMore = lines.length > limit;
  const raw: string[] = [];

  // Diff lines: ⎿ on first line, spaces on following lines, colored by +/-
  // No padding - header is also at position 0
  for (let i = 0; i < show.length; i++) {
    // ⎿ is 1 char, space + ⎿ + 2 spaces = 4 chars total, same as 3 spaces on subsequent lines
    const prefix = i === 0 ? " \u23bf  " : "   "; // space + ⎿ + 2 spaces, subsequent lines 3 spaces
    raw.push(prefix + colorizeDiffLine(theme, show[i]));
  }

  if (hasMore) {
    raw.push("  " + DIM_GREY + "... " + (lines.length - limit) + " more\x1b[39m");
  }

  // Store plain text version for copy/paste
  const plainTextLines = [headerName + " [" + argsLine + "]"];
  for (const line of show) {
    plainTextLines.push(line);
  }
  if (hasMore) {
    plainTextLines.push("... " + (lines.length - limit) + " more");
  }

  class GenericComponent {
    _plainText: string;
    constructor(private renderFn: (width: number) => string[], plainText: string) {
      this._plainText = plainText;
    }
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
      if (cleanArgsLine.length === 0) {
        // No args - just show header without brackets or INDENT
        result.push(truncateToWidth(orange(theme, headerName), width));
      } else if (wrappedArgs.length === 0) {
        result.push(truncateToWidth(headerPrefix + "]", width));
      } else {
        for (let i = 0; i < wrappedArgs.length; i++) {
          if (i === 0) {
            const suffix = wrappedArgs.length === 1 ? "]" : "";
            result.push(truncateToWidth(headerPrefix + wrappedArgs[i] + suffix, width));
          } else {
            const prefix = " ".repeat(headerPrefixWidth);
            const suffix = i === wrappedArgs.length - 1 ? "]" : "";
            result.push(truncateToWidth(prefix + wrappedArgs[i] + suffix, width));
          }
        }
      }
      for (const rl of raw) {
        if (!rl) result.push("");
        else if (visibleWidth(rl) <= width) result.push(rl);
        else result.push(...wrapWithPrefix(rl, width));
      }
      return result;
  }, plainTextLines.join("\n"));
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
