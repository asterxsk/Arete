/**
 * Better Compaction — applies betterui tree-style rendering to compaction messages.
 *
 * Patches CompactionSummaryMessageComponent to use CompactToolBox style
 * instead of the default Box layout.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CompactionSummaryMessageComponent } from "@earendil-works/pi-coding-agent";
import { CompactToolBox } from "../betterui/index.js";

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
