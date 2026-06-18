/**
 * Compact Tool Renderer Extension
 *
 * All tools: ● toolname (args)
 * Compact mode (bash, read, grep, find, ls): just header + footer, expand via ctrl+O
 * Edit & write: full content always
 */

import type {
	BashToolDetails,
	EditToolDetails,
	ExtensionAPI,
	ReadToolDetails,
} from "@earendil-works/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";

interface CTBOptions {
	toolName: string;
	argsLine: string;
	footer?: string;
	state: "pending" | "done" | "error";
	previewLines?: string[];
	expanded?: boolean;
	footerAlways?: boolean;
}

export class CompactToolBox implements Component {
	private opts: CTBOptions;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(opts: CTBOptions) {
		this.opts = opts;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const { toolName, argsLine, suffix, footer, state, previewLines, expanded, footerAlways } = this.opts;
		const lines: string[] = [];

		const dot =
			state === "pending" ? "\x1b[2m●\x1b[0m"
			: state === "error" ? "\x1b[31m●\x1b[0m"
			: "\x1b[32m●\x1b[0m";

		const nameStyled = `\x1b[38;2;255;165;0m${toolName}\x1b[0m`;
let header = `${dot} ${nameStyled}`;
		if (suffix) header += ` ${suffix}`;
		lines.push(truncateToWidth(header, width));

		if (expanded) {
			// argsLine when expanded
			if (argsLine) {
				lines.push(truncateToWidth(`  │ ${argsLine}`, width));
			}
			// Preview lines when expanded
			if (previewLines && previewLines.length > 0) {
				for (const pl of previewLines) {
					lines.push(truncateToWidth(`  │ ${pl}`, width));
				}
			}
			// Footer when expanded
			if (footer) {
				lines.push(truncateToWidth(`  └ ${footer}`, width));
			}
		} else {
			// Compact mode: args line indented below
			const detailParts: string[] = [];
			if (argsLine) detailParts.push(`(${truncateToWidth(argsLine, Math.max(10, width - 26))})`);
			if (footerAlways && footer) detailParts.push(footer);
			detailParts.push("(ctrl+o to expand)");
			lines.push(truncateToWidth(`  └ ${detailParts.join("  ")}`, width));
		}

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

function stripExitCode(output: string): string {
	return output.replace(/\n*Command exited with exit code \d+.*$/, "").replace(/\n*exit code: \d+$/, "");
}

function stripErrorPrefix(text: string): string {
	return text.replace(/^Error:?\s*/, "");
}

function formatDuration(ms: number): string {
	return (Math.max(ms, 100) / 1000).toFixed(1) + "s";
}

function truncateCmd(cmd: string, max = 80): string {
	const nl = cmd.indexOf("\n");
	if (nl >= 0) return cmd.slice(0, Math.min(nl, max - 10)) + " ..." + (cmd.split("\n").length - 1) + " more";
	return cmd.length > max ? cmd.slice(0, max - 3) + "..." : cmd;
}

export const emptyComponent = { render: () => [] as string[], invalidate() {}, handleInput() {} };

// ── Exports for other extensions ───────────────────────────────────────


const RESET = "\x1b[0m";
const BG = "\x1b[48;2;55;55;55m"; // #373737 Dark grey background
const BOLD_DARK = "\x1b[38;5;240m\x1b[1m"; // Dark grey bold prompt marker
const TEXT_COLOR = "\x1b[38;5;250m"; // Light grey text

async function patchUserMessageComponent(): Promise<void> {
	try {
		const mainUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
		const targetUrl = new URL("./modes/interactive/components/user-message.js", mainUrl).href;
		const mod = await import(targetUrl);
		const UMC = mod.UserMessageComponent;
		if (!UMC?.prototype) return;

		UMC.prototype.render = function patchedRender(width: number): string[] {
			const contentBox = this.contentBox;
			if (!contentBox || contentBox.children.length === 0) return [];

			const childLines: string[] = [];
			for (const child of contentBox.children) {
				const lines = child.render(Math.max(10, width - 4));
				for (const line of lines) {
					const ansiRegex = new RegExp("\x1b\\[38;2;\\d+;\\d+;\\d+m", "g");
					const resetRegex = new RegExp("\x1b\\[39m", "g");
					const cleaned = line.replace(ansiRegex, "").replace(resetRegex, "");
					childLines.push(cleaned);
				}
			}
			if (childLines.length === 0) return [];

			// Strip original prompt (e.g. 'prithish>', '> ', '❯ ')
			if (childLines.length > 0) {
				childLines[0] = childLines[0].replace(/^.*?>\s*/, "").replace(/^.*?❯\s*/, "");
			}

			// Find max line length for box width
			let maxLen = 0;
			for (const line of childLines) {
				const len = visibleWidth(line);
				if (len > maxLen) maxLen = len;
			}

			const result: string[] = [];
			for (let i = 0; i < childLines.length; i++) {
				const raw = childLines[i];
				const visLen = visibleWidth(raw);
				// Only pad to max length of the message, not the terminal width
				const padded = raw + " ".repeat(Math.max(0, maxLen - visLen));
				
				if (i === 0) {
					const contentWithBg = `${BG}${BOLD_DARK}❯ ${TEXT_COLOR}${padded} ${RESET}`;
					result.push(contentWithBg);
				} else {
					const contentWithBg = `${BG}  ${TEXT_COLOR}${padded} ${RESET}`;
					result.push(contentWithBg);
				}
			}

			if (result.length > 0) {
				const OSC133_ZONE_START = "\x1b]133;A\x07";
				const OSC133_ZONE_END = "\x1b]133;B\x07";
				const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
				result[0] = OSC133_ZONE_START + result[0];
				result[result.length - 1] = result[result.length - 1] + OSC133_ZONE_END + OSC133_ZONE_FINAL;
			}
			return result;
		};
	} catch {
		// skip
	}
}

export default function (pi: ExtensionAPI) {
	(globalThis as any).__pi_extension_features?.push({
		name: "betterui",
		description: "Compact tree-style tool renderers for bash, read, write, edit, grep, find, and ls",
	});

	// Patch user message appearance on session_start (core modules guaranteed loaded)
	pi.on("session_start", async () => {
		patchUserMessageComponent();
	});
	// Also run immediately for hot-reloads
	patchUserMessageComponent();

	const cwd = process.cwd();

	// ─── BASH TOOL ─────────────────────────────────────────────────────────

	try {
		const originalBash = createBashTool(cwd);
		pi.registerTool({
			name: "bash",
			label: "bash",
			description: originalBash.description,
			parameters: originalBash.parameters,
			renderShell: "self",

			execute(toolCallId, params, signal, onUpdate) {
				const start = Date.now();
				return originalBash.execute(toolCallId, params, signal, onUpdate).then((result) => ({
					...result,
					details: { ...(result.details ?? {}), _bashDurationMs: Date.now() - start, _command: params.command },
				}));
			},

			renderCall() { return emptyComponent; },

			renderResult(result, { isPartial, expanded }) {
				const details = result.details as BashToolDetails & { _bashDurationMs?: number; _command?: string };
				const content = result.content[0];
				const output = content?.type === "text" ? content.text : "";
				if (isPartial) return new CompactToolBox({ toolName: "bash", argsLine: "running...", state: "pending" });

				const exitMatch = output.match(/\n?exit code: (\d+)/);
				const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : null;
				const finalOutput = stripExitCode(exitMatch ? output.slice(0, exitMatch.index) : output).trim();
				const isError = result.isError || (exitCode !== null && exitCode !== 0);
				const allLines = finalOutput.split("\n").filter(l => l.trim());
				const lineCount = allLines.length;
				const fullCmd = details?._command ?? "";
				const cmd = truncateCmd(fullCmd);
				const durationMs = details?._bashDurationMs;
				const timing = durationMs !== undefined ? "in " + formatDuration(durationMs) : "";

				let footer = "";
				let previewLines: string[] | undefined;
				let argsLine = cmd;

				if (isError) {
					if (expanded) {
						previewLines = output.replace(/^\n+/, "").split("\n").filter(l => l.trim());
						argsLine = fullCmd;
					}
					footer = "failed" + (timing ? " " + timing : "");
				} else {
					if (expanded) {
						previewLines = allLines.map(l => l.length > 120 ? l.slice(0, 117) + "..." : l);
						argsLine = fullCmd;
					}
					footer = lineCount + " lines " + timing;
				}

				return new CompactToolBox({ toolName: "bash", argsLine, previewLines, footer, state: isError ? "error" : "done", expanded });
			},
		});
	} catch {}

	// ─── READ TOOL ─────────────────────────────────────────────────────────

	try {
		const originalRead = createReadTool(cwd);
		const readPaths = new Map<string, string>();
		pi.registerTool({
			name: "read",
			label: "read",
			description: originalRead.description,
			parameters: originalRead.parameters,
			renderShell: "self",
			execute(toolCallId, params, signal, onUpdate) {
				const start = Date.now();
				readPaths.set(toolCallId, params.path);
				return originalRead.execute(toolCallId, params, signal, onUpdate).then((r) => ({
					...r, details: { ...(r.details ?? {}), _durationMs: Date.now() - start, _path: params.path },
				}));
			},
			renderCall() { return emptyComponent; },

			renderResult(result, { isPartial, expanded }) {
				if (isPartial) return new CompactToolBox({ toolName: "read", argsLine: "reading...", state: "pending" });
				const details = result.details as ReadToolDetails | undefined;
				const content = result.content[0];
				if (content?.type === "image") return new CompactToolBox({ toolName: "read", argsLine: "(image)", state: "done" });
				if (content?.type !== "text") return new CompactToolBox({ toolName: "read", argsLine: "(no content)", state: "error" });
				const text = content.text.replace(/\n?\[\d+ more lines in file\. Use offset=\d+ to continue\.\]/, "");
				const lines = text.split("\n");
				const lineCount = lines.length;
				const path = (result.details as Record<string, unknown>)?._path as string || readPaths.get(result.toolCallId || "") || "";
				const durationMs = (result.details as Record<string, unknown>)?._durationMs as number | undefined;
				const timing = durationMs !== undefined ? "in " + formatDuration(durationMs) : "";
				let footer = lineCount + " lines";
				if (timing) footer += "  " + timing;

				let previewLines: string[] | undefined;
				let argsLine = path;

				if (expanded) {
					previewLines = lines.map(l => l.length > 120 ? l.slice(0, 117) + "..." : l);
					argsLine = path;
				}

				if (details?.truncation?.truncated && !expanded) {
					footer += "  (truncated, ctrl+O to expand)";
				}

				return new CompactToolBox({ toolName: "read", argsLine, previewLines, footer, state: "done", expanded });
			},
		});
	} catch {}

	// ─── WRITE TOOL ────────────────────────────────────────────────────────

	try {
		const originalWrite = createWriteTool(cwd);
		pi.registerTool({
			name: "write",
			label: "write",
			description: originalWrite.description,
			parameters: originalWrite.parameters,
			renderShell: "self",
			execute(toolCallId, params, signal, onUpdate) {
				const start = Date.now();
				return originalWrite.execute(toolCallId, params, signal, onUpdate).then((r) => ({
					...r, details: { ...(r.details ?? {}), _durationMs: Date.now() - start, _path: params.path, _writeContent: params.content },
				}));
			},
			renderCall() { return emptyComponent; },

			renderResult(result, { isPartial, expanded }) {
				if (isPartial) return new CompactToolBox({ toolName: "write", argsLine: "writing...", state: "pending" });
				const content = result.content[0];
				if (content?.type === "text" && content.text.startsWith("Error")) {
					return new CompactToolBox({ toolName: "write", argsLine: stripErrorPrefix(content.text), state: "error" });
				}
				const path = (result.details as Record<string, unknown>)?._path as string || "";
				const writeContent = (result.details as Record<string, unknown>)?._writeContent as string || "";
				const durationMs = (result.details as Record<string, unknown>)?._durationMs as number | undefined;
				const timing = durationMs !== undefined ? "in " + formatDuration(durationMs) : "";
				const footer = timing ? "Written " + timing : "Written";
				const previewLines = writeContent
					? writeContent.split("\n").map(l => l.length > 120 ? l.slice(0, 117) + "..." : l)
					: undefined;
				return new CompactToolBox({ toolName: "write", argsLine: path, previewLines, footer, state: "done", expanded });
			},
		});
	} catch {}

	// ─── EDIT TOOL ─────────────────────────────────────────────────────────

	try {
		const originalEdit = createEditTool(cwd);
		pi.registerTool({
			name: "edit",
			label: "edit",
			description: originalEdit.description,
			parameters: originalEdit.parameters,
			renderShell: "self",

			execute(toolCallId, params, signal, onUpdate) {
				const start = Date.now();
				return originalEdit.execute(toolCallId, params, signal, onUpdate).then((r) => ({
					...r, details: { ...(r.details ?? {}), _durationMs: Date.now() - start },
				}));
			},
			renderCall() { return emptyComponent; },

			renderResult(result, { isPartial, expanded }) {
				if (isPartial) return new CompactToolBox({ toolName: "edit", argsLine: "applying...", state: "pending" });
				const content = result.content[0];
				const isError = result.isError;
				const text = content?.type === "text" ? content.text : "";
				if (isError || text.startsWith("Error") || text.startsWith("Could not")) {
					return new CompactToolBox({ toolName: "edit", argsLine: text.split("\n")[0], state: "error" });
				}
				const details = result.details as EditToolDetails | undefined;
				const diff = details?.diff;
				if (!diff) return new CompactToolBox({ toolName: "edit", argsLine: details?.path ?? "", state: isError ? "error" : "done" });

				const diffLines = diff.split("\n");
				let additions = 0, removals = 0;
				for (const line of diffLines) {
					if (line.startsWith("+") && !line.startsWith("+++")) additions++;
					if (line.startsWith("-") && !line.startsWith("---")) removals++;
				}

				let editPath = "";
				const pathMatch = content?.type === "text" ? content.text.match(/in (.+)\.$/m) : null;
				if (pathMatch) editPath = pathMatch[1].trim();
				const durationMs = (result.details as Record<string, unknown>)?._durationMs as number | undefined;
				const inStr = durationMs !== undefined ? "in " + formatDuration(durationMs) : "";
				const diffStr = "\x1b[32m+" + additions + "\x1b[0m/\x1b[31m-" + removals + "\x1b[0m";

				const previewLines: string[] = [];
				if (expanded) {
					for (const dl of diffLines) {
						if (dl.startsWith("@@") || dl.startsWith("---") || dl.startsWith("+++")) continue;
						if (!dl.startsWith("+") && !dl.startsWith("-")) continue;
						const trimmed = dl.length > 120 ? dl.slice(0, 117) + "..." : dl;
						if (dl.startsWith("+")) previewLines.push("\x1b[32m" + trimmed + "\x1b[0m");
						else previewLines.push("\x1b[31m" + trimmed + "\x1b[0m");
					}
				}

				return new CompactToolBox({
					toolName: "edit",
					argsLine: editPath,
					suffix: diffStr,
					previewLines: previewLines.length > 0 ? previewLines : undefined,
					footer: (editPath ? "edited " + editPath.replace(/^.*[/\\]/, "") + " " : "") + inStr,
					state: isError ? "error" : "done",
					expanded,
				});
			},
		});
	} catch {}

	// ─── GREP TOOL ─────────────────────────────────────────────────────────

	try {
		const originalGrep = createGrepTool(cwd);
		pi.registerTool({
			name: "grep",
			label: "grep",
			description: originalGrep.description,
			parameters: originalGrep.parameters,
			renderShell: "self",
			execute(toolCallId, params, signal, onUpdate) {
				return originalGrep.execute(toolCallId, params, signal, onUpdate).then((r) => ({
					...r, details: { ...(r.details ?? {}), _callArgs: params },
				}));
			},
			renderCall() { return emptyComponent; },

			renderResult(result, { isPartial, expanded }) {
				if (isPartial) return new CompactToolBox({ toolName: "grep", argsLine: "searching...", state: "pending" });
				const content = result.content[0];
				const text = content?.type === "text" ? content.text : "";
				if (!text || text.startsWith("No matches found")) return new CompactToolBox({ toolName: "grep", argsLine: "no matches", state: "done" });
				if (result.isError || text.startsWith("Error")) return new CompactToolBox({ toolName: "grep", argsLine: stripErrorPrefix(text), state: "error" });

				const allLines = text.split("\n").filter(l => l.trim());
				const lineCount = allLines.length;
				const callArgs = (result.details as Record<string, unknown>)?._callArgs as Record<string, unknown> | undefined;
				let grepLine = "";
				if (callArgs) {
					let g = (callArgs.pattern as string) ?? "";
					if (callArgs.path) g += " " + callArgs.path;
					if (callArgs.glob) g += " (glob:" + callArgs.glob + ")";
					grepLine = g.length > 80 ? g.slice(0, 77) + "..." : g;
				}

				let previewLines: string[] | undefined;
				let argsLine = grepLine;
				if (expanded) {
					previewLines = allLines.map(l => l.length > 120 ? l.slice(0, 117) + "..." : l);
					if (callArgs) {
						let g = (callArgs.pattern as string) ?? "";
						if (callArgs.path) g += " " + callArgs.path;
						if (callArgs.glob) g += " (glob:" + callArgs.glob + ")";
						argsLine = g;
					}
				}

				return new CompactToolBox({ toolName: "grep", argsLine, previewLines, footer: lineCount + " matches", state: "done", expanded });
			},
		});
	} catch {}

	// ─── FIND TOOL ─────────────────────────────────────────────────────────

	try {
		const originalFind = createFindTool(cwd);
		pi.registerTool({
			name: "find",
			label: "find",
			description: originalFind.description,
			parameters: originalFind.parameters,
			renderShell: "self",
			execute(toolCallId, params, signal, onUpdate) {
				return originalFind.execute(toolCallId, params, signal, onUpdate).then((r) => ({
					...r, details: { ...(r.details ?? {}), _callArgs: params },
				}));
			},
			renderCall() { return emptyComponent; },

			renderResult(result, { isPartial, expanded }) {
				if (isPartial) return new CompactToolBox({ toolName: "find", argsLine: "searching...", state: "pending" });
				const content = result.content[0];
				const text = content?.type === "text" ? content.text : "";
				if (result.isError || text.startsWith("Error")) return new CompactToolBox({ toolName: "find", argsLine: text ? stripErrorPrefix(text) : "error", state: "error" });
				if (!text) return new CompactToolBox({ toolName: "find", argsLine: "no results", state: "done" });

				const files = text.split("\n").filter((l) => l.trim());
				const callArgs = (result.details as Record<string, unknown>)?._callArgs as Record<string, unknown> | undefined;
				let findLine = "";
				if (callArgs) {
					let f = (callArgs.pattern as string) ?? "";
					if (callArgs.path) f += "  " + callArgs.path;
					findLine = f.length > 80 ? f.slice(0, 77) + "..." : f;
				}

				let previewLines: string[] | undefined;
				let argsLine = findLine;
				if (expanded) {
					previewLines = files.map(l => l.length > 120 ? l.slice(0, 117) + "..." : l);
					if (callArgs) {
						let f = (callArgs.pattern as string) ?? "";
						if (callArgs.path) f += "  " + callArgs.path;
						argsLine = f;
					}
				}

				return new CompactToolBox({ toolName: "find", argsLine, previewLines, footer: files.length + " files", state: "done", expanded });
			},
		});
	} catch {}

	// ─── LS TOOL ───────────────────────────────────────────────────────────

	try {
		const originalLs = createLsTool(cwd);
		pi.registerTool({
			name: "ls",
			label: "ls",
			description: originalLs.description,
			parameters: originalLs.parameters,
			renderShell: "self",
			execute(toolCallId, params, signal, onUpdate) {
				return originalLs.execute(toolCallId, params, signal, onUpdate).then((r) => ({
					...r, details: { ...(r.details ?? {}), _callArgs: params },
				}));
			},
			renderCall() { return emptyComponent; },

			renderResult(result, { isPartial, expanded }) {
				if (isPartial) return new CompactToolBox({ toolName: "ls", argsLine: "listing...", state: "pending" });
				const content = result.content[0];
				const text = content?.type === "text" ? content.text : "";
				if (result.isError || text.startsWith("Error")) return new CompactToolBox({ toolName: "ls", argsLine: text ? stripErrorPrefix(text) : "error", state: "error" });
				if (!text) return new CompactToolBox({ toolName: "ls", argsLine: "empty", state: "done" });

				const allLines = text.split("\n").filter(l => l.trim());
				const lineCount = allLines.length;
				const callArgs = (result.details as Record<string, unknown>)?._callArgs as Record<string, unknown> | undefined;
				const lsPath = callArgs?.path ? (callArgs.path as string) : "~./";

				let previewLines: string[] | undefined;
				let argsLine = lsPath;
				if (expanded) {
					previewLines = allLines.map(l => l.length > 120 ? l.slice(0, 117) + "..." : l);
					if (callArgs?.path) argsLine = callArgs.path as string;
				}

				return new CompactToolBox({ toolName: "ls", argsLine, previewLines, footer: lineCount + " entries", state: "done", expanded });
			},
		});
	} catch {}
}
