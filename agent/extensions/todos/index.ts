/**
 * toolkit/todos — enhanced todo list with command, tool, widget, and overlay.
 *
 * Inspired by Claude Code's Task tools (TaskCreate, TaskUpdate, TaskList)
 * with structured task lifecycle (pending → in_progress → completed).
 * Use todos to track and monitor progress, do one todo at a time and check them off.
 *
 * User commands:
 *   /todo                           — Show status & progress
 *   /todo add <text> [@category]    — Add one or more (pipe-separated) todos
 *   /todo list [@category]          — List todos (optionally filtered)
 *   /todo ls [@category]            — Alias for list
 *   /todo done <id> [id...]         — Mark todo(s) as completed (e.g. '1 2 3', '1-5', '1,3,5')
 *   /todo todo <id> [id...]         — Mark todo(s) as pending again (undo)
 *   /todo start <id> [id...]        — Mark todo(s) as in_progress
 *   /todo remove <id> [id...]       — Remove todo(s)
 *   /todo clear                     — Clear all completed todos
 *   /todo clear-all                 — Clear all todos
 *   /todo stats                     — Show statistics
 *   /todo remind <id> <minutes>     — Set a reminder on one or more todos
 *   /todo browse                    — Open interactive browser overlay
 *
 * LLM tools:
 *   todos action=add target="..." [category="..."]
 *   todos action=list [category="..."]
 *   todos action=complete target=<id> [id...]   (batch: '1 2 3', '1-5', '1,3,5')
 *   todos action=start target=<id> [id...]
 *   todos action=pending target=<id> [id...]
 *   todos action=remove target=<id> [id...]
 *   todos action=clear_done
 *   todos action=clear_all
 *   todos action=stats
 *   todos action=remind target=<id> <minutes>
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
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

class CompactResult implements Component {
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

// ── Types ──────────────────────────────────────────────────────────────

type TaskStatus = "pending" | "in_progress" | "completed";

interface TodoItem {
	id: number;
	text: string;
	status: TaskStatus;
	category: string;
	createdAt: number;    updatedAt: number;
	reminderAt?: number; // epoch ms when reminder fires
}

interface ReminderEntry {
	todoId: number;
	text: string;
	firesAt: number;
	timer: ReturnType<typeof setTimeout>;
}

interface TodoStats {
	total: number;
	pending: number;
	inProgress: number;
	completed: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const STATUS_ICONS: Record<TaskStatus, string> = {
	pending: `${DIM}●${RESET}`,
	in_progress: `${GREEN}●${RESET}`,
	completed: "●",
};

const BRIDGE_KEY = "__pi_todos_state";

// ── State ──────────────────────────────────────────────────────────────

let todos: TodoItem[] = [];
let nextId = 1;
let reminders: ReminderEntry[] = [];

// ── Persistence ────────────────────────────────────────────────────────

function persistState(): void {
	(globalThis as any)[BRIDGE_KEY] = { todos, nextId };
}

function restoreState(): void {
	try {
		const saved = (globalThis as any)[BRIDGE_KEY] as { todos: TodoItem[]; nextId: number } | undefined;
		if (saved?.todos && Array.isArray(saved.todos)) {
			todos = saved.todos;
			nextId = saved.nextId ?? todos.length + 1;
		}
	} catch {
		todos = [];
		nextId = 1;
	}
}

// ── Helpers ────────────────────────────────────────────────────────────

function parseIds(input: string): number[] {
	// Parse space-separated, comma-separated, and range (1-5) ID lists
	// e.g. "1 2 3", "1,2,3", "1-5", "1-5,7,9"
	const ids = new Set<number>();
	const tokens = input.split(/[,\s]+/).filter(Boolean);
	for (const token of tokens) {
		const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
		if (rangeMatch) {
			const start = parseInt(rangeMatch[1]!, 10);
			const end = parseInt(rangeMatch[2]!, 10);
			for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
				ids.add(i);
			}
		} else {
			const n = parseInt(token, 10);
			if (!isNaN(n)) ids.add(n);
		}
	}
	return [...ids].sort((a, b) => a - b);
}

function truncate(s: string, maxLen: number): string {
	if (s.length <= maxLen) return s;
	return s.slice(0, maxLen - 1) + "…";
}

function formatDuration(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	if (totalSec < 60) return `${totalSec}s`;
	const min = Math.floor(totalSec / 60);
	if (min < 60) return `${min}m ${totalSec % 60}s`;
	const hr = Math.floor(min / 60);
	const remainMin = min % 60;
	return remainMin > 0 ? `${hr}h ${remainMin}m` : `${hr}h`;
}

function formatDurationShort(totalSec: number): string {
	if (totalSec >= 3600) {
		const h = Math.floor(totalSec / 3600);
		const m = Math.floor((totalSec % 3600) / 60);
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
	if (totalSec >= 60) {
		const m = Math.floor(totalSec / 60);
		const s = totalSec % 60;
		return s > 0 ? `${m}m ${s}s` : `${m}m`;
	}
	return `${totalSec}s`;
}

function getCategories(): string[] {
	const cats = new Set(todos.map((t) => t.category).filter(Boolean));
	return [...cats].sort();
}

function getStats(): TodoStats {
	return {
		total: todos.length,
		pending: todos.filter((t) => t.status === "pending").length,
		inProgress: todos.filter((t) => t.status === "in_progress").length,
		completed: todos.filter((t) => t.status === "completed").length,
	};
}

function getSortedTodos(): TodoItem[] {
	return [...todos].sort((a, b) => {
		// Sort: in_progress first, then by created
		const statusOrder: Record<TaskStatus, number> = { in_progress: 0, pending: 1, completed: 2 };
		const sa = statusOrder[a.status];
		const sb = statusOrder[b.status];
		if (sa !== sb) return sa - sb;
		return a.createdAt - b.createdAt;
	});
}

function formatTodoItem(t: TodoItem): string {
	const icon = STATUS_ICONS[t.status];
	const catTag = t.category ? ` [${t.category}]` : "";
	const age = formatDuration(Date.now() - t.createdAt);
	return `  ${icon} #${t.id} ${t.text}${catTag} (${age})`;
}

function buildProgressBar(filled: number, total: number, segments = 10): string {
	if (total === 0) return "[" + "░".repeat(segments) + "]";
	const fraction = Math.min(1, filled / total);
	const f = Math.round(fraction * segments);
	return "[" + "█".repeat(f) + "░".repeat(segments - f) + "]";
}

// ── Widget ─────────────────────────────────────────────────────────────

function refreshWidget(ctx: any): void {
	if (!ctx?.hasUI) return;

	// Always keep the widget registered so its render function picks up
	// changes to __pi_filechanges_lines, __pi_timers_summary
	// dynamically on each TUI render cycle. Never unregister.
	// Spinner is shown by the TUI working message, not this widget.
	ctx.ui.setWidget("toolkit-todos", (_tui: any) => ({
		dispose() {},
		invalidate() {},
		render(width: number): string[] {
			// Read all globals at render time
			const timersSummary: string = (globalThis as any).__pi_timers_summary ?? "";
			const fcLines: string[] = (globalThis as any).__pi_filechanges_lines ?? [];
			const timersText = timersSummary ? `  \uf017 ${timersSummary}` : "";

			let todosText = "";
			if (todos.length > 0) {
				const stats = getStats();
				todosText = `\uf00b ${stats.completed}/${stats.total}`;
			}

			const hasSp = false; // spinner text is rendered by TUI's working message, not here
			const hasTimers = !!timersSummary;
			const hasTodos = !!todosText;
			const hasFc = fcLines.length > 0;

			// Nothing to show — return empty so TUI skips this widget
			if (!hasSp && !hasTimers && !hasTodos && !hasFc) return [];

			const lines: string[] = [];

			// File changes at the top
			for (const line of fcLines) {
				lines.push(truncateToWidth(line, width));
			}

			// Timers + todos on next line (spinner is shown by TUI's working message)
			if (timersText && todosText) {
				const combined = timersText + todosText;
				const visLen = visibleWidth(combined);
				const pad = " ".repeat(Math.max(1, width - visLen));
				lines.push(timersText + pad + todosText);
			} else if (timersText) {
				lines.push(timersText);
			} else if (todosText) {
				const visLen = visibleWidth(todosText);
				const pad = " ".repeat(Math.max(1, width - visLen));
				lines.push(pad + todosText);
			}

			return lines;
		},
	}), { order: 90 });
}

// ── Formatting ─────────────────────────────────────────────────────────

function formatTodoList(filterCategory?: string): string {
	const sorted = getSortedTodos();
	const filtered = filterCategory
		? sorted.filter((t) => t.category === filterCategory)
		: sorted;

	if (filtered.length === 0) {
		return filterCategory ? `No todos in @${filterCategory}.` : "No todos.";
	}

	const lines: string[] = [];
	let currentStatus: TaskStatus | null = null;

	for (const t of filtered) {
		const statusLabel: Record<TaskStatus, string> = {
			pending: "Pending:",
			in_progress: "In Progress:",
			completed: "Completed:",
		};
		if (t.status !== currentStatus) {
			currentStatus = t.status;
			lines.push("");
			lines.push(`  ${statusLabel[t.status]}`);
		}
		lines.push(formatTodoItem(t));
	}

	return lines.join("\n");
}

function formatStats(): string {
	const stats = getStats();
	const categories = getCategories();
	const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
	const bar = buildProgressBar(stats.completed, stats.total);

	const lines: string[] = [
		`Progress: ${bar} ${pct}%`,
		`${DIM}●${RESET} ${stats.pending} pending | ${GREEN}●${RESET} ${stats.inProgress} in progress | ● ${stats.completed} done`,
	];

	if (categories.length > 0) {
		lines.push("");
		lines.push("Categories:");
		for (const cat of categories) {
			const catCount = todos.filter((t) => t.category === cat).length;
			const catDone = todos.filter((t) => t.category === cat && t.status === "completed").length;
			lines.push(`  @${cat}: ${catDone}/${catCount}`);
		}
	}

	// Active reminders
	const activeReminders = reminders.filter((r) => r.firesAt > Date.now());
	if (activeReminders.length > 0) {
		lines.push("");				lines.push(" Reminders:");
		for (const r of activeReminders) {
			const remaining = Math.round((r.firesAt - Date.now()) / 1000);
			lines.push(`  #${r.todoId}: ${truncate(r.text, 50)} (in ${formatDurationShort(remaining)})`);
		}
	}

	return lines.join("\n");
}

// ── Todo Browser Overlay ───────────────────────────────────────────────

class TodoBrowserComponent {
	private tui: any;
	private onClose: () => void;
	private selectedIndex = 0;
	private scrollOffset = 0;

	constructor(opts: {
		tui: any;
		onClose: () => void;
	}) {
		this.tui = opts.tui;
		this.onClose = opts.onClose;

		this.tui.onKey((key: string) => this.handleKey(key));
	}

	private getVisibleRecords(): Array<{ id: number; line: string }> {
		const visible = getSortedTodos().filter((t) => t.status !== "completed");
		return visible.map((t) => ({
			id: t.id,
			line: formatTodoItem(t),
		}));
	}

	private handleKey(key: string): void {
		const records = this.getVisibleRecords();
		if (records.length === 0) {
			this.close();
			return;
		}

		switch (key) {
			case "up":
			case "k":
				this.selectedIndex = Math.max(0, this.selectedIndex - 1);
				break;
			case "down":
			case "j":
				this.selectedIndex = Math.min(records.length - 1, this.selectedIndex + 1);
				break;
			case "enter":
			case " ":
				// Toggle completion of selected item
				const selected = records[this.selectedIndex];
				if (selected) {
					const todo = todos.find((t) => t.id === selected.id);
					if (todo) {
						todo.status = todo.status === "completed" ? "pending" : "completed";
						todo.updatedAt = Date.now();
						persistState();
						this.tui.requestRender();
					}
				}
				break;
			case "d":
			case "delete":
				{
					const selected = records[this.selectedIndex];
					if (selected) {
						todos = todos.filter((t) => t.id !== selected.id);
						persistState();
						this.selectedIndex = Math.min(this.selectedIndex, records.length - 2);
						this.tui.requestRender();
					}
				}
				break;
			case "escape":
			case "q":
				this.close();
				break;
		}
	}

	private close(): void {
		this.tui.restore();
		this.onClose();
	}

	render(width: number, height: number): string[] {
		const records = this.getVisibleRecords();
		const bodyRows = height - 4; // header + footer + instructions

		const header = "── Todo Browser ─────────────────────────────────";
		const instructions = "↑↓ navigate | space toggle done | d delete | q close";

		// Compute scroll
		if (this.selectedIndex < this.scrollOffset) {
			this.scrollOffset = this.selectedIndex;
		}
		if (this.selectedIndex >= this.scrollOffset + bodyRows) {
			this.scrollOffset = this.selectedIndex - bodyRows + 1;
		}

		const visible = records.slice(this.scrollOffset, this.scrollOffset + bodyRows);
		const lines: string[] = [truncate(header, width)];

		for (let i = 0; i < bodyRows; i++) {
			const record = visible[i];
			if (!record) {
				lines.push(" ".repeat(width));
				continue;
			}
			const idx = this.scrollOffset + i;
			const prefix = idx === this.selectedIndex ? "▸ " : "  ";
			const line = truncate(prefix + record.line, width);
			lines.push(line);
		}

		lines.push(truncate(instructions, width));
		return lines;
	}
}

// ── Extension entry ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// Self-register in global feature registry
	(globalThis as any).__pi_extension_features?.push({
		name: "todos",
		description: "Track and monitor progress with todos — add, complete, start, remove items with categories and reminders. ALWAYS use todos to track any multi-step work with 2 or more tasks — create the list first, then work through it.",
		commands: ["/todo"],
		tools: ["todos"],
		shortcuts: ["Ctrl+T"],
	});

	pi.on("session_start", async (_event, ctx) => {
		restoreState();
		// Clear stale reminders that would have fired during the gap
		const now = Date.now();
		for (const t of todos) {
			if (t.reminderAt && t.reminderAt <= now) {
				t.reminderAt = undefined;
			}
		}
		if (ctx.hasUI) {
			refreshWidget(ctx);
		}
	});

	pi.on("session_shutdown", () => {
		persistState();
	});

	// ── /todo command (user-facing) ────────────────────────────────────

	pi.registerCommand("todo", {
		description:
			"Manage todos. Subcommands: add, list, done, todo, start, remove, clear, clear-all, remind, stats, browse",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const trimmed = args.trim();

			if (!trimmed) {
				// Show status
				if (todos.length === 0) {
					ctx.ui.notify("No todos. Use /todo add <text> to create one.", "info");
					return;
				}
				return { result: formatStats() };
			}

			// Parse command
			const firstSpace = trimmed.search(/\s/);
			const subcmd = firstSpace === -1 ? trimmed.toLowerCase() : trimmed.slice(0, firstSpace).toLowerCase();
			const rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

			switch (subcmd) {
				case "add": {
					if (!rest) {
						ctx.ui.notify("Usage: /todo add <text> [@category]  — pipe | separates multiple todos", "warning");
						return;
					}
					// Extract optional @category from the end
					let raw = rest;
					let category = "";
					const catMatch = raw.match(/\s+@(\S+)$/);
					if (catMatch) {
						category = catMatch[1]!;
						const stripped = raw.slice(0, raw.lastIndexOf(catMatch[0])).trim();
						if (stripped) raw = stripped;
					}
					// Split by pipe | for batch add
					const texts = raw.split(/\s*\|\s*/).filter(Boolean);
					const added: number[] = [];
					for (const text of texts) {
						const item: TodoItem = {
							id: nextId++,
							text,
							status: "pending",
							category,
							createdAt: Date.now(),
							updatedAt: Date.now(),
						};
						todos.push(item);
						added.push(item.id);
					}
					persistState();
					refreshWidget(ctx);
					const catInfo = category ? ` in @${category}` : "";
					ctx.ui.notify(` Added ${added.length} todo(s) (#${added.join(", ")})${catInfo}`, "info");
					return;
				}

				case "list":
				case "ls": {
					const category = rest.startsWith("@") ? rest.slice(1) : undefined;
					return { result: formatTodoList(category) };
				}

				case "done": {
					if (!rest) {
						ctx.ui.notify("Usage: /todo done <id> [id...]  (e.g. '1 2 3', '1-5', '1,3,5')", "warning");
						return;
					}
					const ids = parseIds(rest);
					if (ids.length === 0) {
						ctx.ui.notify("No valid IDs provided.", "warning");
						return;
					}
					let completed = 0;
					let notFound = 0;
					for (const id of ids) {
						const todo = todos.find((t) => t.id === id);
						if (!todo) {
							notFound++;
							continue;
						}
						todo.status = "completed";
						todo.updatedAt = Date.now();
						completed++;
					}
					persistState();
					refreshWidget(ctx);
					const msg = notFound > 0
						? ` Completed ${completed} todo(s). ${notFound} ID(s) not found.`
						: ` Completed ${completed} todo(s).`;
					ctx.ui.notify(msg, "info");
					return;
				}

				case "todo": {
					if (!rest) {
						ctx.ui.notify("Usage: /todo todo <id> [id...]  (e.g. '1 2 3', '1-5', '1,3,5')", "warning");
						return;
					}
					const ids = parseIds(rest);
					if (ids.length === 0) {
						ctx.ui.notify("No valid IDs provided.", "warning");
						return;
					}
					let marked = 0;
					let notFound = 0;
					for (const id of ids) {
						const todo = todos.find((t) => t.id === id);
						if (!todo) {
							notFound++;
							continue;
						}
						todo.status = "pending";
						todo.updatedAt = Date.now();
						marked++;
					}
					persistState();
					refreshWidget(ctx);
					const msg = notFound > 0
						? `${DIM}●${RESET} Marked ${marked} todo(s) pending. ${notFound} ID(s) not found.`
						: `${DIM}●${RESET} Marked ${marked} todo(s) pending.`;
					ctx.ui.notify(msg, "info");
					return;
				}

				case "start": {
					if (!rest) {
						ctx.ui.notify("Usage: /todo start <id> [id...]  (e.g. '1 2 3', '1-5', '1,3,5')", "warning");
						return;
					}
					const ids = parseIds(rest);
					if (ids.length === 0) {
						ctx.ui.notify("No valid IDs provided.", "warning");
						return;
					}
					let started = 0;
					let notFound = 0;
					for (const id of ids) {
						const todo = todos.find((t) => t.id === id);
						if (!todo) {
							notFound++;
							continue;
						}
						todo.status = "in_progress";
						todo.updatedAt = Date.now();
						started++;
					}
					persistState();
					refreshWidget(ctx);
					const msg = notFound > 0
						? `${GREEN}●${RESET} Started ${started} todo(s). ${notFound} ID(s) not found.`
						: `${GREEN}●${RESET} Started ${started} todo(s).`;
					ctx.ui.notify(msg, "info");
					return;
				}

				case "remove":
				case "rm": {
					if (!rest) {
						ctx.ui.notify("Usage: /todo remove <id> [id...]  (e.g. '1 2 3', '1-5', '1,3,5')", "warning");
						return;
					}
					const ids = parseIds(rest);
					if (ids.length === 0) {
						ctx.ui.notify("No valid IDs provided.", "warning");
						return;
					}
					let removed = 0;
					let notFound = 0;
					for (const id of ids) {
						const idx = todos.findIndex((t) => t.id === id);
						if (idx === -1) {
							notFound++;
							continue;
						}
						todos.splice(idx, 1);
						removed++;
					}
					persistState();
					refreshWidget(ctx);
					const msg = notFound > 0
						? ` Removed ${removed} todo(s). ${notFound} ID(s) not found.`
						: ` Removed ${removed} todo(s).`;
					ctx.ui.notify(msg, "info");
					return;
				}

				case "clear": {
					const before = todos.length;
					todos = todos.filter((t) => t.status !== "completed");
					const cleared = before - todos.length;
					persistState();
					refreshWidget(ctx);
					ctx.ui.notify(`Cleared ${cleared} completed todo(s).`, "info");
					return;
				}

				case "clear-all":
				case "clear_all": {
					todos = [];
					nextId = 1;
					persistState();
					refreshWidget(ctx);
					ctx.ui.notify("Cleared all todos.", "info");
					return;
				}

				case "stats": {
					return { result: formatStats() };
				}

				case "remind": {
					const parts = rest.split(/\s+/);
					const minutes = parseFloat(parts[0] ?? "");
					const ids = parseIds(parts.slice(1).join(" ") || "");
					if (!isFinite(minutes) || minutes <= 0 || ids.length === 0) {
						ctx.ui.notify("Usage: /todo remind <minutes> <id> [id...]  (e.g. '5 1 2 3', '10 1-5')", "warning");
						return;
					}
					let reminded = 0;
					let notFound = 0;
					for (const remindId of ids) {
						const remindTodo = todos.find((t) => t.id === remindId);
						if (!remindTodo) { notFound++; continue; }
						const ms = Math.round(minutes * 60 * 1000);
						remindTodo.reminderAt = Date.now() + ms;
						const timer = setTimeout(() => {
							ctx.ui.notify(` Reminder: #${remindId} ${truncate(remindTodo.text, 80)}`, "info");
							remindTodo.reminderAt = undefined;
							reminders = reminders.filter((r) => r.todoId !== remindId);
						}, ms);
						reminders.push({ todoId: remindId, text: remindTodo.text, firesAt: Date.now() + ms, timer });
						reminded++;
					}
					persistState();
					const timeStr = formatDurationShort(Math.round(minutes * 60));
					const msg = notFound > 0
						? ` Reminder set for ${reminded} todo(s) in ${timeStr}. ${notFound} ID(s) not found.`
						: ` Reminder set for ${reminded} todo(s) in ${timeStr}.`;
					ctx.ui.notify(msg, "info");
					return;
				}

				case "browse": {
					if (!ctx.hasUI) {
						ctx.ui.notify("browse requires interactive mode", "info");
						return;
					}
				await ctx.ui.custom<void>(
					(tui, _theme, _keybindings, done) =>
						new TodoBrowserComponent({
							tui,
							onClose: done,
						}),
					{
						overlay: true,
						overlayOptions: { anchor: "center", width: "60%", height: "50%" },
					},
				);
					refreshWidget(ctx);
					return;
				}

				default: {
					ctx.ui.notify(
						`Unknown subcommand: ${subcmd}. Try: add, list, done, todo, start, remove, clear, clear-all, remind, stats, browse`,
						"warning",
					);
					return;
				}
			}
		},
	});

	// ── todos tool (LLM-callable) ───────────────────────────────────────

	pi.registerTool({
		name: "todos",
		label: "Todo",
		description:
			"Track and monitor progress with todos. Actions: add, list, complete, start, pending, remove, clear_done, clear_all, stats, remind. " +
			"For batch operations, use space-separated IDs (e.g. target='1 2 3'), ranges (target='1-5'), or comma-separated (target='1,3,5') on complete/start/pending/remove. " +
			"For batch add, separate multiple todo texts with newlines in the target parameter.",
		promptSnippet: "Track and monitor progress with todos — add, complete, start, remove items",
		promptGuidelines: [
			"Use todos to track and monitor progress, do one todo at a time and check them off.",
			"Use 'target' for text of new tasks or ID(s) of tasks to complete/remove/start/pending",
			"Batch operations: target can be space-separated IDs ('1 2 3'), ranges ('1-5'), or comma-separated ('1,3,5')",
			"For batch add, use newlines in target (e.g. 'task1\\ntask2\\ntask3')",
			"Categories can be assigned with category parameter (e.g., 'backend', 'docs')",
			"Tasks progress through states: pending → in_progress → completed",
			"Use action=remind target=<id> minutes=<N> to set a timer that fires a notification",
		],
		parameters: Type.Object({
			action: Type.String({
				description:
					"Action: add, list, complete, start, pending, remove, clear_done, clear_all, stats, remind",
				pattern: "^(add|list|complete|start|pending|remove|clear_done|clear_all|stats|remind)$",
			}),
			target: Type.Optional(
				Type.String({
					description:
						"Task text(s) for 'add' (multiple tasks separated by newlines), or task ID(s) for 'complete'/'start'/'pending'/'remove'/'remind'. " +
						"For batch ops, use space-separated IDs ('1 2 3'), ranges ('1-5'), or comma-separated ('1,3,5').",
				}),
			),
			minutes: Type.Optional(
				Type.Number({
					description: "Minutes until reminder (required for 'remind' action)",
				}),
			),
			category: Type.Optional(
				Type.String({
					description: "Category/tag for 'add' (e.g., 'backend', 'docs', 'bug')",
				}),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const _execute = async () => {
				const { action, target, category, minutes } = params as {
					action: string;
					target?: string;
					category?: string;
					minutes?: number;
				};
				const refresh = () => refreshWidget(ctx);

			switch (action) {
				case "add": {
					if (!target) {
						return { content: [{ type: "text", text: "Error: target (text) is required for add. For multiple, use newlines to separate." }], details: {}, isError: true };
					}
					// Support batch: split by newlines
					const texts = target.split("\n").map((t) => t.trim()).filter(Boolean);
					if (texts.length === 0) {
						return { content: [{ type: "text", text: "Error: no valid todo text found in target" }], details: {}, isError: true };
					}
					const added: Array<{ id: number; text: string }> = [];
					for (const text of texts) {
						const item: TodoItem = {
							id: nextId++,
							text,
							status: "pending",
							category: category || "",
							createdAt: Date.now(),
							updatedAt: Date.now(),
						};
						todos.push(item);
						added.push({ id: item.id, text: item.text });
					}
					persistState();
					refresh();
					const catInfo = category ? ` in @${category}` : "";
					const summary = added.length === 1
						? `Added #${added[0].id}: ${added[0].text}${catInfo}`
						: `Added ${added.length} todos (#${added.map((a) => a.id).join(", ")})${catInfo}`;
					return {
						content: [{ type: "text", text: summary }],
						details: { count: added.length, ids: added.map((a) => a.id) },
					};
				}

				case "list": {
					const body = formatTodoList(category || undefined);
					return { content: [{ type: "text", text: body }], details: { count: todos.length } };
				}

				case "complete": {
					if (!target) {
						return { content: [{ type: "text", text: "Error: target (ID or IDs) is required for complete. Examples: '1', '1 2 3', '1-5', '1,3,5'" }], details: {}, isError: true };
					}
					const ids = parseIds(target);
					if (ids.length === 0) {
						return { content: [{ type: "text", text: "Error: no valid IDs found in target" }], details: {}, isError: true };
					}
					let completed = 0;
					let notFound = 0;
					for (const id of ids) {
						const todo = todos.find((t) => t.id === id);
						if (!todo) { notFound++; continue; }
						todo.status = "completed";
						todo.updatedAt = Date.now();
						completed++;
					}
					persistState();
					refresh();
					const msg = notFound > 0
						? `Completed ${completed} todo(s). ${notFound} ID(s) not found.`
						: `Completed ${completed} todo(s).`;
					return { content: [{ type: "text", text: msg }], details: { completed, notFound } };
				}

				case "start": {
					if (!target) {
						return { content: [{ type: "text", text: "Error: target (ID or IDs) is required for start. Examples: '1', '1 2 3', '1-5', '1,3,5'" }], details: {}, isError: true };
					}
					const ids = parseIds(target);
					if (ids.length === 0) {
						return { content: [{ type: "text", text: "Error: no valid IDs found in target" }], details: {}, isError: true };
					}
					let started = 0;
					let notFound = 0;
					for (const id of ids) {
						const todo = todos.find((t) => t.id === id);
						if (!todo) { notFound++; continue; }
						todo.status = "in_progress";
						todo.updatedAt = Date.now();
						started++;
					}
					persistState();
					refresh();
					const msg = notFound > 0
						? `Started ${started} todo(s). ${notFound} ID(s) not found.`
						: `Started ${started} todo(s).`;
					return { content: [{ type: "text", text: msg }], details: { started, notFound } };
				}

				case "pending": {
					if (!target) {
						return { content: [{ type: "text", text: "Error: target (ID or IDs) is required for pending. Examples: '1', '1 2 3', '1-5', '1,3,5'" }], details: {}, isError: true };
					}
					const ids = parseIds(target);
					if (ids.length === 0) {
						return { content: [{ type: "text", text: "Error: no valid IDs found in target" }], details: {}, isError: true };
					}
					let marked = 0;
					let notFound = 0;
					for (const id of ids) {
						const todo = todos.find((t) => t.id === id);
						if (!todo) { notFound++; continue; }
						todo.status = "pending";
						todo.updatedAt = Date.now();
						marked++;
					}
					persistState();
					refresh();
					const msg = notFound > 0
						? `Marked ${marked} todo(s) as pending. ${notFound} ID(s) not found.`
						: `Marked ${marked} todo(s) as pending.`;
					return { content: [{ type: "text", text: msg }], details: { marked, notFound } };
				}

				case "remove": {
					if (!target) {
						return { content: [{ type: "text", text: "Error: target (ID or IDs) is required for remove. Examples: '1', '1 2 3', '1-5', '1,3,5'" }], details: {}, isError: true };
					}
					const ids = parseIds(target);
					if (ids.length === 0) {
						return { content: [{ type: "text", text: "Error: no valid IDs found in target" }], details: {}, isError: true };
					}
					let removed = 0;
					let notFound = 0;
					for (const id of ids) {
						const idx = todos.findIndex((t) => t.id === id);
						if (idx === -1) { notFound++; continue; }
						todos.splice(idx, 1);
						removed++;
					}
					persistState();
					refresh();
					const msg = notFound > 0
						? `Removed ${removed} todo(s). ${notFound} ID(s) not found.`
						: `Removed ${removed} todo(s).`;
					return { content: [{ type: "text", text: msg }], details: { removed, notFound } };
				}

				case "clear_done": {
					const before = todos.length;
					todos = todos.filter((t) => t.status !== "completed");
					persistState();
					refresh();
					return { content: [{ type: "text", text: `Cleared ${before - todos.length} completed todo(s)` }], details: {} };
				}

				case "clear_all": {
					todos = [];
					nextId = 1;
					persistState();
					refresh();
					return { content: [{ type: "text", text: "Cleared all todos" }], details: {} };
				}

				case "stats": {
					return { content: [{ type: "text", text: formatStats() }], details: getStats() };
				}

				case "remind": {
					if (!target) {
						return { content: [{ type: "text", text: "Error: target (ID or IDs) is required for remind. Examples: '1', '1 2 3', '1-5'" }], details: {}, isError: true };
					}
					const ids = parseIds(target);
					if (ids.length === 0) {
						return { content: [{ type: "text", text: "Error: no valid IDs found in target" }], details: {}, isError: true };
					}
					const mins = (params as any).minutes;
					if (!mins || mins <= 0) {
						return {
							content: [{ type: "text", text: "Error: minutes is required for remind (e.g., minutes=5)" }],
							details: {},
							isError: true,
						};
					}
					let reminded = 0;
					let notFound = 0;
					for (const remindId of ids) {
						const remindTodo = todos.find((t) => t.id === remindId);
						if (!remindTodo) { notFound++; continue; }
						const ms = Math.round(mins * 60 * 1000);
						remindTodo.reminderAt = Date.now() + ms;
						const timer = setTimeout(() => {
							ctx.ui.notify(` Reminder: #${remindId} ${truncate(remindTodo.text, 80)}`, "info");
							remindTodo.reminderAt = undefined;
							reminders = reminders.filter((r) => r.todoId !== remindId);
						}, ms);
						reminders.push({ todoId: remindId, text: remindTodo.text, firesAt: Date.now() + ms, timer });
						reminded++;
					}
					persistState();
					const timeStr = formatDurationShort(Math.round(mins * 60));
					const msg = notFound > 0
						? ` Reminder set for ${reminded} todo(s) (${timeStr}). ${notFound} ID(s) not found.`
						: ` Reminder set for ${reminded} todo(s) (${timeStr}).`;
					return { content: [{ type: "text", text: msg }], details: { reminded, notFound } };
				}

					return { content: [{ type: "text", text: `Unknown action: ${action}` }], details: {}, isError: true };
				}
			};
			const res = await _execute();
			res.details = { ...(res.details || {}), _callArgs: params };
			return res;
		},

		renderShell: "self",

		renderCall() { return emptyComponent; },

		renderResult(result, { isPartial, expanded }) {
			if (!(globalThis as any).__pi_betterui_enabled) return emptyComponent;
			if (isPartial) return new CompactResult({ toolName: "todo", argsLine: "...", state: "pending" });
			const content = result.content[0];
			const text = content?.type === "text" ? content.text : "";
			if (result.isError || text.startsWith("Error")) {
				const firstLine = text.split("\n")[0] || "error";
				return new CompactResult({ toolName: "todo", argsLine: firstLine, state: "error" });
			}
			const allLines = text.split("\n").filter((l) => l.trim());
			
			const callArgs = (result.details as Record<string, unknown>)?._callArgs as Record<string, unknown> | undefined;
			let argsLine = "done";
			if (callArgs) {
				const parts: string[] = [`${callArgs.action}`];
				if (callArgs.target) parts.push(`"${callArgs.target}"`);
				if (callArgs.category) parts.push(`[${callArgs.category}]`);
				if (callArgs.minutes !== undefined) parts.push(`${callArgs.minutes}m`);
				argsLine = parts.join(" ");
			}

			let previewLines: string[] | undefined;
			if (expanded) {
				previewLines = allLines.map((l) => l.length > 120 ? l.slice(0, 117) + "..." : l);
			}
			const restCount = allLines.length;
			return new CompactResult({
				toolName: "todo",
				argsLine,
				state: "done",
				previewLines,
				footer: restCount > 0 ? `${restCount} line${restCount === 1 ? "" : "s"}` : undefined,
				expanded,
			});
		},
	});
}
