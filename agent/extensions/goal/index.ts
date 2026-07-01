/**
 * /goal extension — enhanced autonomous task orchestrator.
 *
 * Inspired by Claude Code's /goal and OpenAI Codex CLI's /goal.
 *
 * Commands:
 *   /goal <describe the goal>    — Set a new goal
 *   /goal                        — Show current goal status
 *   /goal status                 — Show current goal status (alias)
 *   /goal clear|stop|cancel      — Clear the current goal
 *   /goal pause                  — Pause a paused goal (agent keeps working, but
 *                                   no more auto-continuations are sent)
 *   /goal resume                 — Resume a paused goal
 *   /goal history                — Show goal history
 *   /goal config [key] [value]   — View or update config
 *
 * The agent receives the goal and works toward it autonomously. After each
 * response, this extension checks if the response contains the accomplished marker.
 * If not, it sends a follow-up continuation message with progress context.
 * If yes, the goal is marked complete and the loop ends.
 *
 * Features:
 *   - Turn tracking with lock to prevent double-continuations
 *   - Pause / resume support
 *   - Goal history (completed / cleared goals tracked in-memory)
 *   - Configurable max turns (default 200) and max duration (default 30min)
 *   - Session-aware (state survives session compact via globalThis bridge)
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// ── Constants ────────────────────────────────────────────────────────────

const BRIDGE_KEY = "__pi_goal_state";
const ACCOMPLISHED_MARKER = "✻ Accomplished!";
const DEFAULT_MAX_DURATION_MS = 1_800_000; // 30 minutes
const MAX_GOAL_TEXT_LENGTH = 1000;
const LOCK_TIMEOUT_MS = 300_000; // 5 minutes

// ── Types ────────────────────────────────────────────────────────────────

interface GoalEntry {
	text: string;
	completedAt: number;
	outcome: "accomplished" | "cleared" | "max-turns" | "cancelled" | "max-duration";
	turnsUsed: number;
}

interface GoalState {
	text: string;
	turns: number;
	startedAt: number;
	paused: boolean;
	locked: boolean;
	lastContinuationAt: number;
	sessionId?: string;
}

interface GoalBridge {
	getCurrent(): GoalState | null;
	getHistory(): GoalEntry[];
	setCurrent(state: GoalState | null): void;
	addHistory(entry: GoalEntry): void;
	getDisplayText(): string | null;
}

// ── State ─────────────────────────────────────────────────────────────────

let goal: GoalState | null = null;
let goalHistory: GoalEntry[] = [];
let maxTurns = 200;
let maxDurationMs = DEFAULT_MAX_DURATION_MS;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	if (totalSec < 60) return `${totalSec}s`;
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	if (min < 60) return `${min}m ${sec}s`;
	const hr = Math.floor(min / 60);
	const remainMin = min % 60;
	return `${hr}h ${remainMin}m`;
}

function truncate(s: string, maxLen: number): string {
	if (s.length <= maxLen) return s;
	return s.slice(0, maxLen - 1) + "…";
}

function sanitizeGoalText(text: string): string {
	// Remove potential ANSI escape sequences
	let sanitized = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
	// Cap length
	if (sanitized.length > MAX_GOAL_TEXT_LENGTH) {
		sanitized = sanitized.slice(0, MAX_GOAL_TEXT_LENGTH);
	}
	return sanitized;
}

function buildProgressBar(turns: number, max: number, segments = 10): string {
	const fraction = max > 0 ? turns / max : 0;
	const filled = Math.round(fraction * segments);
	const empty = segments - filled;
	return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

function getHistoryIcon(outcome: GoalEntry["outcome"]): string {
	const icons: Record<GoalEntry["outcome"], string> = {
		accomplished: "✓",
		cleared: "✕",
		"max-turns": "⏳",
		"max-duration": "⏱",
		cancelled: "⏹",
	};
	return icons[outcome] ?? "•";
}

function getStatusText(): string {
	if (!goal) return "No active goal.";

	const now = Date.now();
	const elapsed = formatDuration(now - goal.startedAt);
	const bar = buildProgressBar(goal.turns, maxTurns);
	const pauseTag = goal.paused ? " [PAUSED]" : "";
	const lines: string[] = [
		` Goal: ${goal.text}`,
		`   Turns: ${goal.turns}/${maxTurns} ${bar}`,
		`   Elapsed: ${elapsed}${pauseTag}`,
	];
	return lines.join("\n");
}

function formatHistory(): string {
	if (goalHistory.length === 0) return "No completed goals yet.";

	return goalHistory
		.slice()
		.reverse()
		.slice(0, 10)
		.map((entry) => {
			const date = new Date(entry.completedAt);
			const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
			const icon = getHistoryIcon(entry.outcome);
			return `${icon} [${time}] ${truncate(entry.text, 60)} (${entry.turnsUsed} turns)`;
		})
		.join("\n");
}

/**
 * Check if the last assistant response signals goal completion.
 *
 * Primary signal: the exact marker in the last line of the response
 * Secondary signal (fallback): an assertive statement at/near the end of the
 * response like "The goal is accomplished" — NOT preceded by negation
 * and NOT followed by a question mark.
 */
function checkGoalAccomplished(ctx: any): boolean {
	try {
		const branch = ctx.sessionManager.getBranch();

		// Find the last assistant message by walking backwards
		let lastAssistantContent: string | null = null;
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry.type !== "message") continue;
			const msg = entry.message;
			if (msg.role !== "assistant") continue;

			const content = msg.content;
			if (typeof content === "string") {
				lastAssistantContent = content;
			} else if (Array.isArray(content)) {
				const texts = content
					.filter((b: any) => b.type === "text" && typeof b.text === "string")
					.map((b: any) => b.text);
				lastAssistantContent = texts.join("\n");
			}
			break;
		}

		if (lastAssistantContent === null) return false;

		// Require marker in the last line to avoid mid-response false positives
		const lastLine = lastAssistantContent.split("\n").pop()?.trim() ?? "";
		if (lastLine.includes(ACCOMPLISHED_MARKER)) return true;

		// Secondary: assertive goal-completion statement near the end of response.
		// We look at the last 400 chars to avoid matching mid-response musings.
		const tail = lastAssistantContent.slice(-400);

		// Must not contain negation within the statement
		const hasNegation = /\b(?:not|never|haven'?t|hasn'?t|cannot|can'?t|didn'?t|won'?t|don'?t)\b/i.test(tail);
		if (hasNegation) return false;

		// Must not be a question
		if (/\?\s*$/.test(tail.trim())) return false;

		// Check for assertive goal-completion patterns near the end
		// Uses word boundaries to avoid matching "completely", "completed", etc.
		return /(?:goal|task|objective|mission)\s+(?:is\s+)?(?:accomplished|complete|achieved|done|finished)\b/i.test(tail);
	} catch (err) {
		// Log error but don't silently swallow it
		console.error("[goal] Error checking goal completion:", err);
		return false;
	}
}

function buildContinuationMessage(g: GoalState, isResume = false): string {
	const elapsed = formatDuration(Date.now() - g.startedAt);
	const bar = buildProgressBar(g.turns, maxTurns);

	const lines: string[] = [];
	if (isResume) {
		lines.push("The goal has been resumed after a pause. Continue working toward it.");
	} else {
		lines.push("Continue working toward the goal.");
	}

	lines.push("");
	lines.push(`Goal: ${g.text}`);
	lines.push(`Progress: Turn ${g.turns}/${maxTurns} ${bar} — Elapsed: ${elapsed}`);

	if (g.turns > 3) {
		lines.push("");
		lines.push("Important:");
		lines.push("- If you have made significant progress but haven't completed the goal yet, keep going.");
		lines.push("- If you're stuck, try a different approach.");
		lines.push(`- When fully accomplished, respond with exactly ${ACCOMPLISHED_MARKER}.`);
	} else {
		lines.push("");
		lines.push(`When you have fully accomplished the goal, respond with exactly ${ACCOMPLISHED_MARKER}.`);
	}

	return lines.join("\n");
}

// ── Subcommand Handlers ───────────────────────────────────────────────────

function handleStatus(ctx: ExtensionCommandContext): { result: string } | void {
	if (!goal) {
		if (ctx.hasUI) ctx.ui.notify("No active goal.", "info");
		return;
	}
	const status = getStatusText();
	if (ctx.hasUI) ctx.ui.notify(" Goal status", "info");
	return { result: status };
}

function handleClear(ctx: ExtensionCommandContext): void {
	if (!goal) {
		if (ctx.hasUI) ctx.ui.notify("No active goal to clear.", "info");
		return;
	}
	const clearedText = goal.text;
	const turnsUsed = goal.turns;
	readBridge()?.addHistory({ text: clearedText, completedAt: Date.now(), outcome: "cleared", turnsUsed });
	goal = null;
	delete (globalThis as any)[BRIDGE_KEY + "_state"];
	if (ctx.hasUI) ctx.ui.notify(` Goal cleared: ${truncate(clearedText, 60)} (${turnsUsed} turns)`, "info");
}

function handlePause(ctx: ExtensionCommandContext): void {
	if (!goal) {
		if (ctx.hasUI) ctx.ui.notify("No active goal to pause.", "info");
		return;
	}
	if (goal.paused) {
		if (ctx.hasUI) ctx.ui.notify("Goal is already paused. Use /goal resume to continue.", "warning");
		return;
	}
	goal.paused = true;
	if (ctx.hasUI) ctx.ui.notify(` Goal paused: ${truncate(goal.text, 60)}`, "info");
}

async function handleResume(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	if (!goal) {
		if (ctx.hasUI) ctx.ui.notify("No active goal to resume.", "info");
		return;
	}
	if (!goal.paused) {
		if (ctx.hasUI) ctx.ui.notify("Goal is already running. Use /goal pause to pause.", "info");
		return;
	}
	goal.paused = false;
	if (ctx.hasUI) ctx.ui.notify(` Goal resumed: ${truncate(goal.text, 60)}`, "info");

	// Send a continuation to kick things off again
	await pi.sendUserMessage(
		buildContinuationMessage(goal, /* isResume */ true),
		{ deliverAs: "nextTurn" },
	);
}

function handleConfig(args: string, ctx: ExtensionCommandContext): { result: string } | void {
	const configArgs = args.trim();

	if (!configArgs) {
		return {
			result: `=== Goal Config ===\nmax_turns: ${maxTurns}\nmax_duration: ${formatDuration(maxDurationMs)}\n\nUsage: /goal config max_turns <number> | max_duration <ms>`,
		};
	}

	// Parse config key=value or key value
	const match = configArgs.match(/^(\w+)\s+(.+)$/);
	if (!match) {
		if (ctx.hasUI) ctx.ui.notify("Usage: /goal config max_turns <number>", "warning");
		return;
	}

	const key = match[1]!.toLowerCase();
	// Strip quotes from value before parsing
	const val = match[2]!.trim().replace(/^["']|["']$/g, "");

	if (key === "max_turns" || key === "max-turns" || key === "maxturns") {
		const num = parseInt(val, 10);
		if (!Number.isFinite(num) || num < 1 || num > 99999) {
			if (ctx.hasUI) ctx.ui.notify("max_turns must be a number between 1 and 99999.", "warning");
			return;
		}
		const oldMax = maxTurns;
		maxTurns = num;
		(globalThis as any)[BRIDGE_KEY + "_config"] = { maxTurns, maxDurationMs };
		if (ctx.hasUI) ctx.ui.notify(` max_turns changed: ${oldMax} -> ${maxTurns}`, "info");
		return;
	}

	if (key === "max_duration" || key === "maxduration" || key === "max-duration") {
		const num = parseInt(val, 10);
		if (!Number.isFinite(num) || num < 60_000 || num > 86_400_000) {
			if (ctx.hasUI) ctx.ui.notify("max_duration must be between 60000ms (1min) and 86400000ms (24h).", "warning");
			return;
		}
		maxDurationMs = num;
		(globalThis as any)[BRIDGE_KEY + "_config"] = { maxTurns, maxDurationMs };
		if (ctx.hasUI) ctx.ui.notify(` max_duration changed: ${formatDuration(num)}`, "info");
		return;
	}

	if (ctx.hasUI) ctx.ui.notify(`Unknown config key: ${key}. Available: max_turns, max_duration`, "warning");
	return;
}

function handleHistory(ctx: ExtensionCommandContext): { result: string } {
	return { result: `=== Goal History ===\n${formatHistory()}` };
}

async function handleSetGoal(
	pi: ExtensionAPI,
	rawGoal: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const goalText = sanitizeGoalText(rawGoal);
	if (!goalText) {
		if (ctx.hasUI) ctx.ui.notify("Usage: /goal <describe what you want to accomplish>", "warning");
		return;
	}

	// If there's already an active goal, cancel it first
	if (goal) {
		const previousText = goal.text;
		const previousTurns = goal.turns;
		readBridge()?.addHistory({ text: previousText, completedAt: Date.now(), outcome: "cancelled", turnsUsed: previousTurns });
		if (ctx.hasUI) ctx.ui.notify(` Replacing previous goal: ${truncate(previousText, 60)}`, "info");
	}

	goal = {
		text: goalText,
		turns: 0,
		startedAt: Date.now(),
		paused: false,
		locked: false,
		lastContinuationAt: 0,
	};

	// Persist to globalThis
	(globalThis as any)[BRIDGE_KEY + "_state"] = goal;

	if (ctx.hasUI) ctx.ui.notify(` Goal set: ${truncate(goalText, 80)}`, "info");

	await pi.sendUserMessage(
		`I have set a goal for you to accomplish. Your goal is:\n\n${goalText}\n\n` +
			`Work toward this goal step by step. When you have fully accomplished it, ` +
			`respond with exactly ${ACCOMPLISHED_MARKER} at the end of your response. ` +
			`IMPORTANT: Only use this marker when there is an active goal. Do NOT use it in regular conversations.\n` +
			`Do NOT stop until the goal is complete. Take whatever actions are needed.`,
		{ deliverAs: "nextTurn" },
	);
}

// ── Global bridge (survives session compacts) ─────────────────────────────

function installBridge(): GoalBridge {
	// Restore config from last session
	const savedConfig = (globalThis as any)[BRIDGE_KEY + "_config"];
	if (typeof savedConfig === "number" && Number.isFinite(savedConfig) && savedConfig > 0) {
		maxTurns = savedConfig;
	} else if (typeof savedConfig === "object" && savedConfig !== null) {
		if (typeof savedConfig.maxTurns === "number" && savedConfig.maxTurns > 0) maxTurns = savedConfig.maxTurns;
		if (typeof savedConfig.maxDurationMs === "number" && savedConfig.maxDurationMs > 0) maxDurationMs = savedConfig.maxDurationMs;
	}

	const bridge: GoalBridge = {
		getCurrent: () => goal ? { ...goal } : null,
		getHistory: () => [...goalHistory],
		setCurrent: (state) => {
			goal = state;
		},
		addHistory: (entry) => {
			goalHistory.push(entry);
			if (goalHistory.length > 50) goalHistory.shift();
		},
		getDisplayText: () => {
			if (!goal) return null;
			if (goal.paused) return null; // Don't show goal when paused
			const text = truncate(goal.text, 80);
			return text.charAt(0).toUpperCase() + text.slice(1);
		},
	};
	(globalThis as any)[BRIDGE_KEY] = bridge;
	return bridge;
}

function readBridge(): GoalBridge | undefined {
	return (globalThis as any)[BRIDGE_KEY] as GoalBridge | undefined;
}

// ── Extension entry ───────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// Self-register in global feature registry
	(globalThis as any).__pi_extension_features?.push({
		name: "goal",
		description: "Autonomous goal mode — set a goal and the agent works toward it until accomplished, paused, or cleared",
		commands: ["/goal"],
	});

	installBridge();

	pi.on("session_start", async (_event, ctx) => {
		// Restore goal state from globalThis (survives session compacts)
		const state = (globalThis as any)[BRIDGE_KEY + "_state"] as GoalState | undefined;
		if (state) {
			goal = state;
			if (ctx.hasUI) {
				ctx.ui.notify(` Goal restored: ${truncate(goal.text, 60)}`, "info");
			}
		}
	});

	pi.on("session_shutdown", () => {
		// Persist goal state across sessions via globalThis
		if (goal) {
			(globalThis as any)[BRIDGE_KEY + "_state"] = goal;
		} else {
			delete (globalThis as any)[BRIDGE_KEY + "_state"];
		}
		(globalThis as any)[BRIDGE_KEY + "_config"] = { maxTurns, maxDurationMs };
	});

	pi.registerCommand("goal", {
		description:
			"Autonomous goal mode — set a goal and the agent works toward it until accomplished, paused, or cleared. " +
			"Subcommands: /goal <text>, /goal, /goal status, /goal clear, /goal pause, /goal resume, /goal history, /goal config",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const trimmed = args.trim().toLowerCase();

			// No args: show status
			if (!trimmed) {
				if (!goal) {
					if (ctx.hasUI) ctx.ui.notify("No active goal. Use /goal <description> to set one.", "info");
					return;
				}
				return handleStatus(ctx);
			}

			// Subcommand routing
			if (trimmed === "status") return handleStatus(ctx);
			if (trimmed === "clear" || trimmed === "stop" || trimmed === "cancel" || trimmed === "off") {
				return handleClear(ctx);
			}
			if (trimmed === "pause") {
				handlePause(ctx);
				return;
			}
			if (trimmed === "resume") {
				await handleResume(pi, ctx);
				return;
			}
			if (trimmed === "config" || trimmed.startsWith("config ")) {
				const configArgs = trimmed === "config" ? "" : trimmed.slice("config ".length);
				return handleConfig(configArgs, ctx);
			}
			if (trimmed === "history") return handleHistory(ctx);

			// Otherwise: set a new goal
			await handleSetGoal(pi, args.trim(), ctx);
		},
	});

	pi.on("agent_end", async (_event, ctx) => {
		// Snapshot goal reference to prevent race conditions
		const currentGoal = goal;
		if (!currentGoal) return;
		if (currentGoal.paused) return;
		if (currentGoal.locked) return;

		currentGoal.locked = true;

		const lockWatchdog = setTimeout(() => {
			if (currentGoal.locked) {
				currentGoal.locked = false;
			}
		}, LOCK_TIMEOUT_MS);

		try {
			// Re-check goal is still the same (user might have cleared/replaced it)
			if (goal !== currentGoal) return;

			// Wall-clock timeout check
			const elapsed = Date.now() - currentGoal.startedAt;
			if (elapsed > maxDurationMs) {
				const timedOutText = currentGoal.text;
				const turnsUsed = currentGoal.turns;
				readBridge()?.addHistory({ text: timedOutText, completedAt: Date.now(), outcome: "max-duration", turnsUsed });
				goal = null;
				delete (globalThis as any)[BRIDGE_KEY + "_state"];
				if (ctx.hasUI)
					ctx.ui.notify(
						`Goal stopped after ${formatDuration(elapsed)} (time limit): ${truncate(timedOutText, 60)}`,
						"warning",
					);
				return;
			}

			// Check if the goal was accomplished
			if (checkGoalAccomplished(ctx)) {
				const doneText = currentGoal.text;
				const turnsUsed = currentGoal.turns;
				readBridge()?.addHistory({ text: doneText, completedAt: Date.now(), outcome: "accomplished", turnsUsed });
				goal = null;
				delete (globalThis as any)[BRIDGE_KEY + "_state"];
				if (ctx.hasUI) ctx.ui.notify(` Goal accomplished: ${truncate(doneText, 60)} (${turnsUsed} turns)`, "info");
				return;
			}

			// Check max turns
			currentGoal.turns++;
			if (currentGoal.turns >= maxTurns) {
				const maxedText = currentGoal.text;
				const turnsUsed = currentGoal.turns;
				readBridge()?.addHistory({ text: maxedText, completedAt: Date.now(), outcome: "max-turns", turnsUsed });
				goal = null;
				delete (globalThis as any)[BRIDGE_KEY + "_state"];
				if (ctx.hasUI)
					ctx.ui.notify(
						` Goal stopped after ${maxTurns} turns: ${truncate(maxedText, 60)}`,
						"warning",
					);
				return;
			}

			// Send continuation
			currentGoal.lastContinuationAt = Date.now();
			await pi.sendUserMessage(
				buildContinuationMessage(currentGoal),
				{ deliverAs: "followUp" },
			);
		} finally {
			clearTimeout(lockWatchdog);
			// Only unlock if this is still the same goal object
			if (goal === currentGoal) {
				currentGoal.locked = false;
			}
		}
	});
}
