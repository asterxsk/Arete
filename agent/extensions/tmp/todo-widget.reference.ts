import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { Theme, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export interface TodoItem {
	id: number;
	text: string;
	done: boolean;
}

interface TodoFile {
	todos: TodoItem[];
	nextId: number;
	version: number;
}

// ──────────────────────────────────────────────────────────
// Session State Management
// ──────────────────────────────────────────────────────────

let _state: TodoFile = { todos: [], nextId: 1, version: 2 };
let lastPi: ExtensionAPI | undefined;


export function setPi(pi: ExtensionAPI): void {
	lastPi = pi;
}

export function syncFromSession(ctx: ExtensionContext): void {
	const entries = ctx.sessionManager.getBranch();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type === "custom" && entry.customType === "todo-state") {
			const data = entry.data as TodoFile;
			if (data && Array.isArray(data.todos)) {
				_state = JSON.parse(JSON.stringify(data));
				return;
			}
		}
	}
	// Reset to empty if no state found in session
	_state = { todos: [], nextId: 1, version: 2 };
}

export function pushState(pi?: ExtensionAPI): void {
	const api = pi || lastPi;
	if (api) {
		api.appendEntry("todo-state", JSON.parse(JSON.stringify(_state)));
	}
}

export function reload(): void {
	// No-op in session mode, handled by syncFromSession
}

export function getTodos(): TodoItem[] {
	return _state.todos;
}

// ──────────────────────────────────────────────────────────
// CRUD (No FS calls)
// ──────────────────────────────────────────────────────────

export function addTodo(text: string): TodoItem {
	const item: TodoItem = { id: _state.nextId++, text: text.trim(), done: false };
	_state.todos.push(item);
	return item;
}

export function removeTodo(id: number): boolean {
	const before = _state.todos.length;
	_state.todos = _state.todos.filter((t) => t.id !== id);
	return _state.todos.length !== before;
}

export function completeTodo(id: number): boolean {
	const todo = _state.todos.find((t) => t.id === id);
	if (!todo) return false;
	todo.done = !todo.done;
	return true;
}

export function editTodo(id: number, newText: string): boolean {
	const todo = _state.todos.find((t) => t.id === id);
	if (!todo) return false;
	todo.text = newText.trim();
	return true;
}

export function clearDone(): number {
	const before = _state.todos.length;
	_state.todos = _state.todos.filter((t) => !t.done);
	return before - _state.todos.length;
}

export function clearAll(): void {
	_state.todos = [];
	_state.nextId = 1;
}

// ──────────────────────────────────────────────────────────
// Widget line renderer
// ──────────────────────────────────────────────────────────

export function renderTodoWidget(width: number, theme: Theme): string[] {
	const todos = _state.todos;
	const lines: string[] = [];

	// Header
	const done = todos.filter((t) => t.done).length;
	const total = todos.length;
	const progress = total === 0 ? "" : ` ${done}/${total}`;
	const header =
		theme.fg("accent", "  ◆ Todos") +
		theme.fg("muted", progress) +
		theme.fg("dim", "  [ctrl+t to hide]");
	lines.push(truncateToWidth(header, width));

	if (todos.length === 0) {
		lines.push(truncateToWidth(theme.fg("muted", "  (empty — ask the agent to add todos)"), width));
	} else {
		const maxVisible = 5;
		const visibleTodos = todos.slice(0, maxVisible);
		for (const todo of visibleTodos) {
			const check = todo.done
				? theme.fg("success", "✓")
				: theme.fg("muted", "○");
			const textPart = todo.done
				? theme.fg("dim", todo.text)
				: theme.fg("text", todo.text);
			lines.push(truncateToWidth(`  ${check} ${textPart}`, width));
		}
		if (todos.length > maxVisible) {
			lines.push(truncateToWidth(theme.fg("dim", `  ... and ${todos.length - maxVisible} more`), width));
		}
	}

	return lines;
}

// ──────────────────────────────────────────────────────────
// Interactive TUI component
// ──────────────────────────────────────────────────────────

type Action =
	| { kind: "add"; text: string }
	| { kind: "toggle"; id: number }
	| { kind: "remove"; id: number }
	| { kind: "edit"; id: number; newText: string }
	| { kind: "clearDone" }
	| { kind: "clearAll" };

export class TodoListComponent {
	private theme: Theme;
	private pi: ExtensionAPI;
	private onClose: () => void;
	private onMutate: () => void;
	private selectedIndex = 0;
	private editingId: number | null = null;
	private editBuffer = "";
	private addMode = false;
	private addBuffer = "";
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(options: {
		theme: Theme;
		pi: ExtensionAPI;
		onClose: () => void;
		onMutate: () => void;
	}) {
		this.theme = options.theme;
		this.pi = options.pi;
		this.onClose = options.onClose;
		this.onMutate = options.onMutate;
	}

	private applyAction(action: Action): void {
		switch (action.kind) {
			case "add":
				addTodo(action.text);
				break;
			case "toggle":
				completeTodo(action.id);
				break;
			case "remove":
				removeTodo(action.id);
				break;
			case "edit":
				editTodo(action.id, action.newText);
				break;
			case "clearDone":
				clearDone();
				break;
			case "clearAll":
				clearAll();
				break;
		}
		pushState();
		this.invalidate();
		this.onMutate();
	}

	handleInput(data: string): void {
		const todos = _state.todos;

		if (this.editingId !== null) {
			if (matchesKey(data, "enter") || matchesKey(data, "return")) {
				if (this.editBuffer.trim()) {
					this.applyAction({ kind: "edit", id: this.editingId, newText: this.editBuffer });
				}
				this.editingId = null;
				this.editBuffer = "";
			} else if (matchesKey(data, "escape")) {
				this.editingId = null;
				this.editBuffer = "";
				this.invalidate();
			} else if (matchesKey(data, "backspace")) {
				this.editBuffer = this.editBuffer.slice(0, -1);
				this.invalidate();
			} else if (data.length === 1 && data >= " " && data !== "\x7f") {
				this.editBuffer += data;
				this.invalidate();
			}
			return;
		}

		if (this.addMode) {
			if (matchesKey(data, "enter") || matchesKey(data, "return")) {
				if (this.addBuffer.trim()) {
					this.applyAction({ kind: "add", text: this.addBuffer });
					this.selectedIndex = _state.todos.length - 1;
				}
				this.addMode = false;
				this.addBuffer = "";
			} else if (matchesKey(data, "escape")) {
				this.addMode = false;
				this.addBuffer = "";
				this.invalidate();
			} else if (matchesKey(data, "backspace")) {
				this.addBuffer = this.addBuffer.slice(0, -1);
				this.invalidate();
			} else if (data.length === 1 && data >= " " && data !== "\x7f") {
				this.addBuffer += data;
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, "up") || matchesKey(data, "k")) {
			if (todos.length > 0)
				this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.invalidate();
		} else if (matchesKey(data, "down") || matchesKey(data, "j")) {
			if (todos.length > 0)
				this.selectedIndex = Math.min(todos.length - 1, this.selectedIndex + 1);
			this.invalidate();
		} else if (matchesKey(data, "enter") || matchesKey(data, "space")) {
			const todo = todos[this.selectedIndex];
			if (todo) this.applyAction({ kind: "toggle", id: todo.id });
		} else if (data === "a" || data === "A") {
			this.addMode = true;
			this.addBuffer = "";
			this.invalidate();
		} else if (data === "e" || data === "E") {
			const todo = todos[this.selectedIndex];
			if (todo) {
				this.editingId = todo.id;
				this.editBuffer = todo.text;
				this.invalidate();
			}
		} else if (data === "d" || data === "D") {
			const todo = todos[this.selectedIndex];
			if (todo) {
				this.applyAction({ kind: "remove", id: todo.id });
				this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, _state.todos.length - 1));
			}
		} else if (data === "x" || data === "X") {
			this.applyAction({ kind: "clearDone" });
			this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, _state.todos.length - 1));
		} else if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const th = this.theme;
		const todos = _state.todos;
		const lines: string[] = [];

		const done = todos.filter((t) => t.done).length;
		const total = todos.length;
		lines.push("");
		const headerText =
			th.fg("accent", " ◆ Todos ") +
			th.fg("muted", `${done}/${total} done`) +
			th.fg("dim", "  a=add  e=edit  d=del  x=clear-done  ↑↓=nav  Enter=toggle  Esc=close");
		lines.push(truncateToWidth(headerText, width));
		lines.push(truncateToWidth(th.fg("borderMuted", "─".repeat(width)), width));

		if (todos.length === 0 && !this.addMode) {
			lines.push(truncateToWidth(th.fg("dim", "  No todos. Press 'a' to add one."), width));
		} else {
			for (let i = 0; i < todos.length; i++) {
				const todo = todos[i];
				const isSelected = i === this.selectedIndex;
				const isEditing = this.editingId === todo.id;

				const check = todo.done
					? th.fg("success", "✓")
					: th.fg("dim", "○");

				let textStr: string;
				if (isEditing) {
					textStr = th.fg("accent", `[editing: ${this.editBuffer}▌]`);
				} else if (todo.done) {
					textStr = th.fg("dim", todo.text);
				} else {
					textStr = th.fg("text", todo.text);
				}

				const cursor = isSelected ? th.fg("accent", "▶ ") : "  ";
				const row = `${cursor}${check} ${textStr}`;
				lines.push(truncateToWidth(row, width));
			}
		}

		if (this.addMode) {
			lines.push("");
			lines.push(truncateToWidth(th.fg("accent", `  ➕ New todo: ${this.addBuffer}▌`), width));
		}

		lines.push("");
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

export default function(pi: ExtensionAPI) {
	setPi(pi);

	pi.on("session_start", (_event, ctx) => {
		syncFromSession(ctx);
	});

	pi.registerCommand("todo", {
		description: "Open the interactive todo list",
		handler: async (_args, ctx) => {
			await ctx.ui.custom((tui, theme, keybindings, done) => {
				return new TodoListComponent({
					theme,
					pi,
					onClose: () => done(null),
					onMutate: () => {}
				});
			});
		}
	});
}
