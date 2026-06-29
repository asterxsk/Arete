/**
 * thinking-block.ts — Thinking block component and hide/dim logic
 *
 * Renders thinking content with a dimmed, italic style and a \u2502 prefix.
 * Handles the hide/unhide toggle for tagged <think> blocks.
 */

import { Container, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── Helpers ────────────────────────────────────────────────────────────

export function colorThinkingText(text: string): string {
    return `\x1b[38;2;112;112;128m${text}\x1b[39m`;
}

export function italicText(text: string): string {
    return `\x1b[3m${text}\x1b[23m`;
}

// ── ThinkingBlock Component ────────────────────────────────────────────

interface ThinkingBlockOptions {
    color?: (text: string) => string;
    italic?: boolean;
}

export class ThinkingBlock extends Container {
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

        for (let i = 0; i < visualLines.length; i++) {
            const vl = visualLines[i];
            
            let textPart = vl.isEmpty ? "" : vl.text;
            if (this.options && this.options.color && !vl.isEmpty) {
                textPart = this.options.color(textPart);
            }
            if (this.options && this.options.italic && !vl.isEmpty) {
                textPart = italicText(textPart);
            }
            
            let lineStr = colorThinkingText("┃" + (vl.isEmpty ? "" : " ")) + textPart;
            result.push(leftPad + lineStr);
        }
        return result;
    }
}

// ── Hide / Dim Tagged Thinking ─────────────────────────────────────────

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const THINK_TAG_RE = /  ...[\s\S]*?<\/think>/g;

function dim(text: string): string {
  return text
    .split("\n")
    .map((line) => (line ? `${DIM}${line}${RESET}` : line))
    .join("\n");
}

function lastNLines(text: string, n: number): string {
  const lines = text.split("\n");
  return lines.length <= n
    ? text.trimEnd()
    : lines.slice(-n).join("\n").trimEnd();
}

export function initHideThinking(pi: ExtensionAPI): void {
  let blockOriginals = new Map<number, string>();

  pi.on("message_start", (event) => {
    if ((event.message as any).role === "assistant") {
      blockOriginals = new Map();
    }
  });

  pi.on("message_update", (event) => {
    if ((event.message as any).role !== "assistant") return;
    const msg = event.message as any;

    for (let i = 0; i < msg.content.length; i++) {
      const block = msg.content[i];
      if (block.type !== "text") continue;

      const previousOriginal = blockOriginals.get(i) ?? "";
      const appended = block.text.slice(previousOriginal.length);
      if (!appended) continue;

      const fullOriginal = previousOriginal + appended;
      blockOriginals.set(i, fullOriginal);

      if (!fullOriginal.includes("  ...")) continue;

      const display = fullOriginal.replace(THINK_TAG_RE, (match: string) => {
        const inner = match.slice(8, -9);
        return "\n\n" + dim(inner);
      });

      block.text = display;
    }
  });

  pi.on("message_end", (event) => {
    if ((event.message as any).role !== "assistant") return;
    const msg = event.message as any;

    for (let i = 0; i < msg.content.length; i++) {
      const block = msg.content[i];
      if (block.type !== "text") continue;

      const original = blockOriginals.get(i);
      if (!original || !original.includes("  ...")) continue;

      block.text = original.replace(THINK_TAG_RE, (match: string) => {
        const inner = match.slice(8, -9);
        return "\n\n" + dim(lastNLines(inner, 5));
      });
    }
  });
}
