import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Component, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { spawn } from "child_process";

// ── Compact UI helpers (matches compactui style) ─────────────────────
const INDENT = " ";
const HINT = " (ctrl+o to expand)";

function compactLine(text: string): Component {
	return {
		render(width) {
			return [visibleWidth(text) <= width ? text : truncateToWidth(text, width, "...")];
		},
		invalidate() {},
	};
}

function orange(theme: any, text: string): string {
	return `\x1b[38;2;250;179;135m${text}\x1b[39m`;
}

function compactCall(toolName: string, argsStr: string, theme: any): Component {
	let display = argsStr.split("\n")[0] ?? argsStr;
	if (display.length > 50) display = display.slice(0, 47) + "...";
	else if (display.length < argsStr.length) display += "...";
	return compactLine(INDENT + orange(theme, toolName) + " [" + display + "]" + theme.fg("dim", HINT));
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
	raw.push(INDENT + orange(theme, headerName) + "[" + argsLine + "]");

	// Output lines with │ prefix aligned under [
	const CONTENT_INDENT = "    │ ";
	for (const line of show) {
		raw.push(INDENT + CONTENT_INDENT + theme.fg("text", line));
	}

	if (hasMore) {
		raw.push(INDENT + CONTENT_INDENT + theme.fg("dim", "... " + (lines.length - limit) + " more"));
	}

	// Footer with duration
	if (durationS >= 0) {
		raw.push(INDENT + "    └ " + theme.fg("dim", "Took " + formatDur(durationS) + " [ctrl+o to hide]"));
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


export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "powershell",
		label: "PowerShell",
		renderShell: "self",
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
					const output = text || "(no output)";
					const baseDetails = { exitCode: code, stderr, stdout, _durationS: elapsed, command };
					if (code !== 0 && stderr.trim()) {
						return resolve({
							content: [{ type: "text", text: output }],
							details: { ...baseDetails, _fullOutput: output },
							isError: true,
						});
					}
					return resolve({
						content: [{ type: "text", text: output }],
						details: { ...baseDetails, _fullOutput: output },
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

		renderCall(args, theme, context) {
			if (context.expanded) return compactLine("");
			return compactCall("pwsh", args.command ?? "?", theme);
		},

		renderResult(result, { expanded, isPartial }, theme, _context) {
			if (isPartial) return compactLine(INDENT + theme.fg("warning", "Running..."));

			const details = result.details as Record<string, unknown> | undefined;
			const full = (details?._fullOutput as string) || result.content?.[0]?.text || "";
			if (!expanded) return compactLine("");
			const lines = full.split("\n");
			const durationS = (details?._durationS as number) ?? -1;
			return expandedBox(theme, "pwsh", _context.args.command || "", lines, durationS, 50);
		},
	});
}