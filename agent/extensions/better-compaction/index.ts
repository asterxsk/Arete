/**
 * Better Compaction — applies betterui tree-style rendering to compaction messages.
 *
 * Patches CompactionSummaryMessageComponent to use CompactToolBox style
 * instead of the default Box layout.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CompactionSummaryMessageComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import type { Component } from "@mariozechner/pi-tui";

// ── Self-contained CompactToolBox (no dependency on betterui) ──
interface _CBOpts {
	toolName: string;
	argsLine: string;
	footer?: string;
	state: "pending" | "done" | "error";
	previewLines?: string[];
	expanded?: boolean;
	footerAlways?: boolean;
	suffix?: string;
}

class CompactToolBox implements Component {
	private opts: _CBOpts;
	private cachedWidth?: number;
	private cachedLines?: string[];
	constructor(opts: _CBOpts) { this.opts = opts; }
	invalidate(): void { this.cachedWidth = undefined; this.cachedLines = undefined; }
	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const { toolName, argsLine, suffix, footer, state, previewLines, expanded, footerAlways } = this.opts;
		const lines: string[] = [];
		const dot = state === "pending" ? "\x1b[2m●\x1b[0m" : state === "error" ? "\x1b[31m●\x1b[0m" : "\x1b[32m●\x1b[0m";
		let header = `${dot} \x1b[38;2;255;165;0m${toolName}\x1b[0m`;
		if (suffix) header += ` ${suffix}`;
		lines.push(truncateToWidth(header, width));
		if (expanded) {
			if (argsLine) lines.push(truncateToWidth(`  │ ${argsLine}`, width));
			if (previewLines) for (const pl of previewLines) lines.push(truncateToWidth(`  │ ${pl}`, width));
			if (footer) lines.push(truncateToWidth(`  └ ${footer}`, width));
		} else {
			// Single-line compact mode
			const parts: string[] = [`(${truncateToWidth(argsLine, Math.max(10, width - 26))})`, "(ctrl+o to expand)"];
			header += ` ${parts.join(" ")}`;
			lines[0] = truncateToWidth(header, width);
		}
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

export default function (_pi: ExtensionAPI) {
	const Proto = CompactionSummaryMessageComponent.prototype as any;

	// Patch updateDisplay to use CompactToolBox
	Proto.updateDisplay = function () {
		this.clear();

		const tokenStr = this.message.tokensBefore.toLocaleString();
		const summary = this.message.summary ?? "";

		// Build preview lines from summary (first few lines)
		const summaryLines = summary.split("\n").filter((l: string) => l.trim());
		const previewLines = summaryLines.slice(0, 6);
		if (summaryLines.length > 6) {
			previewLines.push(`... ${summaryLines.length - 6} more lines`);
		}

		// Use CompactToolBox component
		const toolbox = new CompactToolBox({
			toolName: "compaction",
			argsLine: `compacted from ${tokenStr} tokens`,
			previewLines,
			footer: this.expanded ? undefined : `press ${"\x1b[1mctrl+O\x1b[22m"} to expand`,
			state: "done",
			expanded: this.expanded,
		});

		this.addChild(toolbox);
	};

	// Patch render to remove background color
	const originalRender = Proto.render;
	Proto.render = function (width: number, height: number) {
		const lines = originalRender.call(this, width, height);
		// Remove ALL background ANSI codes (40-47, 48;2;r;g;b, 100-107)
		return lines.map((line: string) => 
			line
				.replace(/\x1b\[4[0-7]m/g, "")  // Standard backgrounds
				.replace(/\x1b\[48;[0-9;]*m/g, "")  // 256-color and RGB backgrounds
				.replace(/\x1b\[10[0-7]m/g, "")  // Bright backgrounds
		);
	};
}
