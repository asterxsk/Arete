import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "child_process";
import { truncateToWidth } from "@mariozechner/pi-tui";
import type { Component } from "@mariozechner/pi-tui";

// ── Self-contained CompactToolBox + emptyComponent (no dependency on betterui) ──
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

const emptyComponent = { render: () => [] as string[], invalidate() {}, handleInput() {} };

function formatDuration(ms: number): string {
	return (Math.max(ms, 100) / 1000).toFixed(1) + "s";
}

function truncateCmd(cmd: string, max = 80): string {
	const nl = cmd.indexOf("\n");
	if (nl >= 0) return cmd.slice(0, Math.min(nl, max - 10)) + " ..." + (cmd.split("\n").length - 1) + " more";
	return cmd.length > max ? cmd.slice(0, max - 3) + "..." : cmd;
}



export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "powershell",
		label: "PowerShell",
		description:
			"Execute PowerShell commands on the local Windows system. Supports any cmdlet, script, or PowerShell command. " +
			"Results include stdout, stderr, and exit code.",
		promptSnippet: "Run PowerShell commands for system administration, file operations, registry, WMI, and Windows automation",
		promptGuidelines: [
			"Use this for any Windows system administration, file operations, registry access, WMI/CIM queries, process management, service control, or .NET interop",
			"Multi-line scripts work as written — the tool handles encoding automatically via -EncodedCommand",
			"Avoid cd/chdir — use Set-Location or pass full paths instead",
			"Use `| Out-String` to ensure output is captured as text",
			"The tool runs from your current working directory",
		],
		parameters: Type.Object({
			command: Type.String({ description: "PowerShell command or script to execute" }),
		}),
		renderShell: "self",

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const start = Date.now();
			const command = (params as { command: string }).command;
			const encodedCommand = Buffer.from(command, "utf16le").toString("base64");

			return new Promise((resolve) => {
				const child = spawn(
					"powershell.exe",
					["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedCommand],
					{ windowsHide: true, cwd: ctx.cwd || process.cwd() },
				);

				let stdout = "";
				let stderr = "";

				child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
				child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

				child.on("close", (code) => {
					const elapsed = (Date.now() - start) / 1000;
					const text = stdout.trim() || stderr.trim();
					if (code !== 0 && stderr.trim()) {
						return resolve({
							content: [{ type: "text", text: text || "Exit code: " + code }],
							details: { exitCode: code, stderr, stdout, _durationS: elapsed, command },
							isError: true,
						});
					}
					return resolve({
						content: [{ type: "text", text: text || "(no output)" }],
						details: { exitCode: code, stderr, stdout, _durationS: elapsed, command },
					});
				});

				child.on("error", (err) => {
					resolve({
						content: [{ type: "text", text: "Failed to start PowerShell: " + err.message }],
						details: { _durationS: (Date.now() - start) / 1000 },
						isError: true,
					});
				});

				if (signal) {
					const abort = () => { if (!child.killed) child.kill(); };
					if (signal.aborted) abort();
					else signal.addEventListener("abort", abort, { once: true });
				}
			});
		},

		renderCall() { return emptyComponent; },

		renderResult(result, { isPartial, expanded }) {
			const details = result.details as Record<string, unknown>;
			const content = result.content[0];
			const text = content?.type === "text" ? content.text : "";

		if (!(globalThis as any).__pi_betterui_enabled) return emptyComponent;
			if (isPartial) return new CompactToolBox({ toolName: "powershell", argsLine: "running...", state: "pending" });

			const isError = result.isError || false;
			let duration = details?._durationS as number | undefined;
			if (duration !== undefined && duration < 0.1) duration = 0.1;
			const fullCmd = (details?.command as string) || "";
			const cmd = truncateCmd(fullCmd);
			const allLines = text.split("\n").filter(l => l.trim());
			const lineCount = allLines.length;

			let footer = "";
			let previewLines: string[] | undefined;
			let argsLine = cmd;

			if (isError) {
				if (expanded) {
					previewLines = text.replace(/^\n+/, "").split("\n").filter(l => l.trim());
					argsLine = fullCmd;
				}
				footer = "failed";
				if (duration) footer += " in " + duration.toFixed(1) + "s";
			} else {
				if (expanded) {
					previewLines = allLines.map(l => l.length > 120 ? l.slice(0, 117) + "..." : l);
					argsLine = fullCmd;
				}
				footer = lineCount + " lines";
				if (duration) footer += " in " + duration.toFixed(1) + "s";
			}

			return new CompactToolBox({ toolName: "powershell", argsLine, previewLines, footer, state: isError ? "error" : "done", expanded });
		},
	});
}
