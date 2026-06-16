/**
 * toolkit/statusline — status line footer with provider, model, context usage, and file changes.
 *
 * Renders a compact one-line footer:
 *   Left:   provider    model
 *   Right:  [████░░░░] 12.5k/128k    Δ 5  + 2
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

// ── Theme colour helpers ──────────────────────────────────────────────

function toHex(rgb: [number, number, number]): string {
	return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
}

const RESET = "\x1b[0m";	const C = {
		blue:   toHex([142, 202, 230]),  // #8ecae6
		purple: toHex([187, 136, 221]),  // #bb88dd
		orange: toHex([240, 160,  80]),  // #f0a050
		gold:   toHex([248, 204, 133]),  // #f8cc85
		green:  toHex([120, 224, 160]),  // #78e0a0
		red:    toHex([224, 120, 128]),  // #e07880
	};

function paint(clr: string, text: string): string {
	return text ? `${clr}${text}${RESET}` : "";
}

// ── Token formatter ────────────────────────────────────────────────

function formatTokens(n: number): string {
	if (!Number.isFinite(n) || n < 0) return "0";
	if (n >= 1_000_000) {
		return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
	}
	if (n >= 1_000) {
		return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
	}
	return String(n);
}

interface ContextInfo {
	percent: number;
	tokens: number;
	window: number;
}

function getContextSafe(ctx: any): ContextInfo {
	const fallback: ContextInfo = { percent: 0, tokens: 0, window: 0 };
	try {
		const usage =
			typeof ctx?.getContextUsage === "function"
				? ctx.getContextUsage()
				: typeof ctx?.sessionManager?.getContextUsage === "function"
					? ctx.sessionManager.getContextUsage()
					: undefined;
		if (usage == null) return fallback;
		if (typeof usage === "number") return { percent: Number.isFinite(usage) ? usage : 0, tokens: 0, window: 0 };
		return {
			percent: typeof usage.percent === "number" && Number.isFinite(usage.percent) ? usage.percent : 0,
			tokens: typeof usage.tokens === "number" && Number.isFinite(usage.tokens) ? Math.round(usage.tokens) : 0,
			window: typeof usage.contextWindow === "number" && Number.isFinite(usage.contextWindow) ? Math.round(usage.contextWindow) : 0,
		};
	} catch { /* ignore */ }
	return fallback;
}

// ── Smooth context colour interpolation ────────────────────────────

const COLOR_STOPS: { at: number; rgb: [number, number, number] }[] = [
	{ at: 0,   rgb: [120, 224, 160] },  // green (safe)
	{ at: 50,  rgb: [240, 160,  80] },  // orange
	{ at: 75,  rgb: [248, 204, 133] },  // gold
	{ at: 100, rgb: [224, 120, 128] },  // red
];

function lerpRgb(a: [number, number, number], b: [number, number, number], t: number): string {
	const r = Math.round(a[0] + (b[0] - a[0]) * t);
	const g = Math.round(a[1] + (b[1] - a[1]) * t);
	const b2 = Math.round(a[2] + (b[2] - a[2]) * t);
	return toHex([r, g, b2]);
}

function easeIn(t: number): number {
	return t * t;
}

function smoothContextColor(pct: number): string {
	const clamped = Math.max(0, Math.min(100, pct));
	for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
		const lo = COLOR_STOPS[i]!;
		const hi = COLOR_STOPS[i + 1]!;
		if (clamped >= lo.at && clamped <= hi.at) {
			const raw = lo.at === hi.at ? 0 : (clamped - lo.at) / (hi.at - lo.at);
			return lerpRgb(lo.rgb, hi.rgb, easeIn(raw));
		}
	}
	return lerpRgb(COLOR_STOPS[0]!.rgb, COLOR_STOPS[0]!.rgb, 0);
}

// ── Gradient context visual bar ───────────────────────────────────────

function buildGradientBar(percent: number, segments = 8): string {
	const clamped = Math.max(0, Math.min(100, Math.round(percent)));
	const filled = Math.round((clamped / 100) * segments);
	let result = "";
	for (let i = 0; i < segments; i++) {
		if (i < filled) {
			// Each filled block gets its own colour based on its midpoint in the gradient
			const midPct = ((i + 0.5) / segments) * 100;
			result += smoothContextColor(midPct) + "█" + RESET;
		} else {
			result += "░";
		}
	}
	return result;
}

// ── Model name shortener ──────────────────────────────────────────────

function shortModel(raw: string): string {
	// Strip provider prefix: "deepseek/deepseek-v4-flash" → "deepseek-v4-flash"
	const stripped = raw.replace(/^[^/]+\//, "");
	// Shorten "deepseek-v4-flash" → "ds-v4-flash" if too long
	if (stripped.length > 18) {
		return stripped.replace(/^deepseek-/, "ds-").replace(/^anthropic-/, "cl-");
	}
	return stripped;
}

// ── Extension entry ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	(globalThis as any).__pi_extension_features?.push({
		name: "statusline",
		description: "Status line with provider, model, context usage bar, and file changes count",
	});

	let provider = "";
	let model = "";
	let contextPercent = 0;
	let contextTokens = 0;
	let contextWindow = 0;
	let requestRender: (() => void) | undefined;
	let throttleTimer: ReturnType<typeof setTimeout> | undefined;
	let throttlePending = false;

	function refreshModel(ctx: any): void {
		if (!ctx?.model) return;
		provider = ctx.model.provider || "";
		const raw = ctx.model.display_name || ctx.model.id || "";
		model = shortModel(raw);
	}

	function refresh(ctx: any): void {
		refreshModel(ctx);
		const info = getContextSafe(ctx);
		contextPercent = info.percent;
		contextTokens = info.tokens;
		contextWindow = info.window;
		requestRender?.();
	}

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		refresh(ctx);

		ctx.ui.setFooter((tui: any) => {
			requestRender = () => tui.requestRender();
			return {
				dispose() { requestRender = undefined; },
				invalidate() {},
				render(width: number): string[] {
					// ── Left: provider + model ─────────────────────
					const prov = provider
						? paint(C.blue, "\uf0c2") + "  " + paint(C.blue, provider)
						: "";
					const mdl = model
						? paint(C.purple, "\uf121") + "  " + paint(C.purple, model)
						: "";
					const left = prov + (prov && mdl ? "  " : "") + mdl;

					// ── Right: context bar + file changes ──────────
					const bar = buildGradientBar(contextPercent);
					const barColor = smoothContextColor(contextPercent);
					const tokenStr = contextWindow > 0
						? `${formatTokens(contextTokens)}/${formatTokens(contextWindow)}`
						: `${formatTokens(contextTokens)}`;
					const ctxPart = paint(barColor, "\uf080")
						+ " " + paint(barColor, "[") + bar + paint(barColor, "]")
						+ " " + paint(barColor, tokenStr);

					// Compact cue when context > 90% — bold red with a warning icon
					const compactCue = contextPercent > 90
						? "  " + paint(C.red, "\uf06a") + " " + paint(C.red, "compact!")
						: "";

					const counts = (globalThis as any).__pi_filechanges_counts as
						{ edited: number; created: number } | undefined;
					let fcPart = "";
					if (counts && (counts.edited > 0 || counts.created > 0)) {
						const parts: string[] = [];
						if (counts.edited > 0) parts.push(paint(C.orange, "Δ" + counts.edited));
						if (counts.created > 0) parts.push(paint(C.green, "+" + counts.created));
						fcPart = "  " + paint(C.green, "\uf0c5") + " " + parts.join("  ");
					}

					const right = ctxPart + compactCue + fcPart;

					// ── Align left + right ─────────────────────────
					if (!left && !right) return [];
					const combined = left + right;
					const visLen = visibleWidth(combined);
					const pad = " ".repeat(Math.max(1, width - visLen));
					return [truncateToWidth(left + pad + right, width)];
				},
			};
		});
	});

	// ── Alt+C: compact cue shortcut ───────────────────────────────
	pi.registerShortcut("alt+c", {
		description: "Run /compact to reduce context usage when above 90%",
		handler: async (ctx) => {
			const pct = getContextSafe(ctx).percent;
			if (pct <= 90) {
				ctx.ui.notify?.("Context only at " + pct + "% — no need to compact yet.", "info");
				return;
			}
			ctx.ui.notify?.(" Compacting context...", "info");
			// Trigger compaction by sending /compact as a user message
			const result = pi.sendUserMessage("/compact", { deliverAs: "nextTurn" });
			if (result && typeof (result as any).then === "function") {
				(result as Promise<void>).catch(() => {});
			}
		},
	});

	pi.on("model_select", (_event, ctx) => refresh(ctx));
	pi.on("message_update", (_event, ctx) => {
		// Store latest values immediately but throttle renders
		const info = getContextSafe(ctx);
		contextPercent = info.percent;
		contextTokens = info.tokens;
		contextWindow = info.window;
		if (!throttlePending) {
			throttlePending = true;
			throttleTimer = setTimeout(() => {
				throttlePending = false;
				requestRender?.();
			}, 120);
		}
	});
	pi.on("message_end", (_event, ctx) => {
		// Flush throttle and do a final render immediately
		if (throttleTimer) {
			clearTimeout(throttleTimer);
			throttleTimer = undefined;
		}
		throttlePending = false;
		refresh(ctx);
	});
	pi.on("session_compact", () => requestRender?.());
}
