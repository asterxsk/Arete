/**
 * spinner-phrases — animated star spinner with fun phrases.
 *
 * Replaces the pi core's native "Working..." indicator with a rotating star,
 * fun phrases, and elapsed time.
 *
 * Lifecycle:
 *   session_start       → capture UI context (NO spinner yet)
 *   before_agent_start  → start spinner (fires each LLM thinking phase)
 *   agent_end           → stop spinner (fires when agent fully finishes)
 *   session_shutdown    → cleanup
 *
 * The interval runs continuously between the first before_agent_start and
 * agent_end, naturally covering tool calls without fragile debounce timers.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ── Orange colour ────────────────────────────────────────────────

const ORANGE = "\x1b[38;2;255;180;60m";
const RESET = "\x1b[0m";

// ── Star spinner frames ───────────────────────────────────────────

const STAR_FRAMES = ["·", "+", "×", "✦", "✧", "★", "✧", "✦", "☆", "✻", "×", "+"];

// Custom animation curve — how many ticks each frame stays visible (130ms per tick)
const FRAME_DWELL: Record<string, number> = {
	"·": 1,
	"+": 1,
	"×": 1,
	"✦": 1,
	"✧": 1,
	"★": 1,
	"☆": 1,
	"✻": 5, // emphasize this frame — stays 5× longer
};

// ── Fun phrases ────────────────────────────────────────────────────

const PHRASES: string[] = [
	"Manifesting", "Thinking", "Analyzing", "Researching", "Computing",
	"Pondering", "Ruminating", "Synthesizing", "Orchestrating", "Architecting",
	"Crafting", "Brewing", "Cooking", "Forging", "Weaving", "Churning",
	"Coalescing", "Crystallizing", "Incubating", "Fermenting", "Simmering",
	"Marinating", "Perambulating", "Gallivanting", "Frolicking", "Vibing",
	"Quantumizing", "Reticulating", "Spelunking", "Wrangling", "Bootstrapping",
	"Generating", "Contemplating", "Philosophizing", "Prestidigitating",
	"Transmuting", "Levitating", "Moonwalking", "Beboppin'", "Jitterbugging",
	"Flibbertigibbeting", "Shenaniganing", "Whatchamacalliting", "Discombobulating",
	"Recombobulating", "Actualizing", "Envisioning", "Imagining", "Cerebrating",
	"Ideating", "Hatching", "Pollinating", "Germinating", "Sprouting", "Noodling",
	"Doodling", "Tinkering", "Crunching", "Hashing", "Unfurling", "Swirling",
	"Whirring", "Pulsing", "Beaming", "Gusting", "Flowing", "Ebbing", "Meandering",
	"Moseying", "Scurrying", "Scampering", "Zigzagging", "Wandering", "Nesting",
	"Burrowing", "Roosting", "Harmonizing", "Channeling", "Resonating", "Osmosing",
	"Symbioting", "Metamorphosing", "Transfiguring", "Sublimating", "Precipitating",
	"Nucleating", "Ionizing", "Photosynthesizing", "Stewing", "Proofing", "Leavening",
	"Kneading", "Whisking", "Drizzling", "Garnishing", "Seasoning", "Caramelizing",
	"Flambéing", "Blanching", "Julienning", "Sautéing", "Zesting", "Baking", "Roasting",
	"Tempering", "Infusing", "Concocting", "Elucidating", "Deciphering", "Puzzling",
	"Perusing", "Musing", "Mulling", "Deliberating", "Cogitating", "Speculating",
	"Hypothesizing", "Theorizing", "Postulating", "Determining", "Inferring",
	"Deducing", "Extrapolating", "Interpolating", "Calibrating", "Tuning",
	"Optimizing", "Refactoring", "Polishing", "Shining", "Gleaming", "Glowing",
];

// ── State ──────────────────────────────────────────────────────────

let intervalId: ReturnType<typeof setInterval> | null = null;
let startTime = 0;
let phraseIndex = 0;
let frameIndex = 0;
let frameHoldCounter = 0;
let tickCount = 0;
let currentCtx: any = null;
let outputTokens = 0;
let lastBranchLength = 0;
let turnStartBranchLength = 0; // Branch length at start of current turn

// Thinking state (DISABLED for now)
// let isThinking = false;
// let thinkingStartedAt = 0;
// let thinkingDisplayed = "";
// const THINKING_DELAY_MS = 2000; // Only show "thinking" after 2 seconds
let isThinking = false;
let thinkingStartedAt = 0;
let thinkingDisplayed = "";

// Glow effect constants
const GLOW_SPEED_CPS = 4; // Characters per second
const GLOW_END_DELAY_MS = 300; // Pause at each end before reversing
const TICK_MS = 80; // Animation tick interval
const GLOW_STEP = GLOW_SPEED_CPS * (TICK_MS / 1000); // chars per tick
const GLOW_RADIUS = 1; // 3 characters total (center + 1 on each side)

// Glow effect state
let glowPosition = 0;
let glowDirection = 1; // 1 = right, -1 = left
let glowPauseTicks = 0; // remaining pause ticks when at an end

// ── Helpers ────────────────────────────────────────────────────────

function formatElapsed(totalSeconds: number): string {
	if (totalSeconds >= 3600) {
		const h = Math.floor(totalSeconds / 3600);
		const m = Math.floor((totalSeconds % 3600) / 60);
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
	if (totalSeconds >= 60) {
		const m = Math.floor(totalSeconds / 60);
		const s = totalSeconds % 60;
		return s > 0 ? `${m}m ${s}s` : `${m}m`;
	}
	return `${totalSeconds}s`;
}

function pushToUI(text: string): void {
	if (currentCtx?.hasUI) {
		currentCtx.ui.setWorkingMessage(text);
	}
}

function getCurrentFrame(): string {
	return STAR_FRAMES[frameIndex % STAR_FRAMES.length]!;
}

function advanceFrame(): void {
	const current = getCurrentFrame();
	frameHoldCounter++;
	if (frameHoldCounter >= (FRAME_DWELL[current] ?? 1)) {
		frameIndex++;
		frameHoldCounter = 0;
	}
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

// Thinking animation (DISABLED for now)
function startThinkingAnimation(): void {
	// DISABLED: Reset any previous state
	// isThinking = true;
	// thinkingStartedAt = Date.now();
	// thinkingDisplayed = "";
	isThinking = false; // Keep disabled
}

function stopThinkingAnimation(): void {
	// DISABLED
	// isThinking = false;
	// thinkingStartedAt = 0;
	// thinkingDisplayed = ""; // Clear immediately
	isThinking = false; // Keep disabled
}

function updateThinkingDisplay(): void {
	// DISABLED: thinking display for now
	// if (!isThinking || thinkingStartedAt === 0) {
	// 	thinkingDisplayed = "";
	// 	return;
	// }
	// const elapsed = Date.now() - thinkingStartedAt;
	// if (elapsed >= THINKING_DELAY_MS) {
	// 	thinkingDisplayed = "thinking";
	// } else {
	// 	thinkingDisplayed = "";
	// }
	thinkingDisplayed = ""; // Always empty when disabled
}

function getStatusText(): string {
	return thinkingDisplayed;
}

// Apply white glow effect to text
function applyGlow(text: string): string {
	if (text.length === 0) return text;

	updateGlow(text.length);

	const WHITE = "\x1b[97m"; // Bright white
	const RESET = "\x1b[39m";
	
	let result = "";
	for (let i = 0; i < text.length; i++) {
		const distance = Math.abs(i - glowPosition);
		if (distance <= GLOW_RADIUS) {
			// Calculate brightness based on distance (closer = brighter)
			const brightness = 1 - (distance / GLOW_RADIUS);
			// Use bright white for glow effect
			if (brightness > 0.5) {
				result += WHITE + text[i] + RESET;
			} else {
				result += text[i];
			}
		} else {
			result += text[i];
		}
	}
	return result;
}

// Update glow position: sweep left-to-right, pause, sweep right-to-left, pause.
function updateGlow(textLength: number): void {
	if (textLength <= 1) {
		glowPosition = 0;
		return;
	}

	const maxPos = textLength - 1;

	if (glowPauseTicks > 0) {
		glowPauseTicks--;
		if (glowPauseTicks === 0) {
			glowDirection *= -1;
		}
		return;
	}

	glowPosition += glowDirection * GLOW_STEP;

	if (glowPosition >= maxPos) {
		glowPosition = maxPos;
		glowPauseTicks = Math.round(GLOW_END_DELAY_MS / TICK_MS);
	} else if (glowPosition <= 0) {
		glowPosition = 0;
		glowPauseTicks = Math.round(GLOW_END_DELAY_MS / TICK_MS);
	}
}

function updateOutputTokens(): void {
	try {
		if (!currentCtx) return;
		const branch = currentCtx.sessionManager?.getBranch?.();
		if (!branch) return;
		// Skip if branch hasn't changed
		if (branch.length === lastBranchLength) return;
		lastBranchLength = branch.length;
		// Only count tokens from messages added since turn started
		let total = 0;
		const entries = branch.slice(turnStartBranchLength);
		for (const entry of entries) {
			if (entry.type === "message" && entry.message?.role === "assistant") {
				const usage = entry.message.usage;
				if (usage) total += usage.output || 0;
			}
		}
		outputTokens = total;
	} catch { /* ignore */ }
}

function buildFullText(phrase: string): string {
	updateOutputTokens();
	const elapsed = Math.floor((Date.now() - startTime) / 1000);
	const timeStr = formatElapsed(elapsed);
	const status = getStatusText();
	// Check if goal is active (just presence, not the text)
	const goalBridge = (globalThis as any)["__pi_goal_state"];
	const hasGoal = goalBridge?.getGoal?.() != null;
	const goalPart = hasGoal ? ` - 𖤍 Goal active` : "";
	const tokenPart = outputTokens > 0 ? ` · \u2193${formatTokens(outputTokens)}` : "";
	// Only show status if thinking has been going on for more than 2 seconds
	const statusPart = status ? ` · ${status}` : "";
	// Apply glow effect to the phrase
	const glowingPhrase = applyGlow(phrase);
	const plain = `${getCurrentFrame()} ${glowingPhrase} (${timeStr}${tokenPart}${statusPart})${goalPart}`;
	return `${ORANGE}${plain}${RESET}`;
}

// Phrase changes only on agent turn, no typewriter needed for phrase
function getPhraseText(): string {
	return PHRASES[phraseIndex % PHRASES.length]! + "...";
}

// ── Animation tick ─────────────────────────────────────────────────

function tick(): void {
	// Update thinking display
	updateThinkingDisplay();

	pushToUI(buildFullText(getPhraseText()));

	advanceFrame();
	tickCount++;
}

// ── Interval management ────────────────────────────────────────────

function start(ctx: any): void {
	currentCtx = ctx;

	if (intervalId !== null) {
		// Already running between tool calls; keep the same timer and elapsed time.
		return;
	}

	startTime = Date.now();
	// Only initialize phraseIndex if not already set (before_agent_start sets it)
	if (phraseIndex === 0) {
		phraseIndex = Math.floor(Math.random() * PHRASES.length);
	}
	frameIndex = 0;
	frameHoldCounter = 0;
	tickCount = 0;
	glowPosition = 0;
	glowDirection = 1;
	glowPauseTicks = 0;
	startThinkingAnimation();

	ctx.ui.setWorkingIndicator({ frames: [] });

	tick();
	intervalId = setInterval(tick, 80); // Faster tick for smoother typewriter
}

function stop(): void {
	stopThinkingAnimation();
	// Let the erasing animation play out before clearing
	setTimeout(() => {
		if (intervalId !== null) {
			clearInterval(intervalId);
			intervalId = null;
		}
		if (currentCtx?.hasUI) {
			currentCtx.ui.setWorkingIndicator(undefined);
			currentCtx.ui.setWorkingMessage(undefined);
		}
	}, 200); // Wait for erase animation
}

// ── Extension entry ────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	(globalThis as any).__pi_extension_features?.push({
		name: "spinner-phrases",
		description: "Animated star spinner with fun Claude Code–style phrases",
	});

	pi.on("session_start", async (_event: any, ctx: any) => {
		if (ctx.hasUI) {
			currentCtx = ctx;
			
			// Intercept calls to setWorkingMessage to catch API error resets
			const origSetWorkingMessage = ctx.ui.setWorkingMessage;
			ctx.ui.setWorkingMessage = function(msg: string | undefined) {
				if (msg === "Working...") {
					// The core agent is resetting to default (likely after an API error)
					// We should restart our custom spinner
					setTimeout(() => {
						if (currentCtx) start(currentCtx);
					}, 0);
					return;
				}
				return origSetWorkingMessage.apply(this, arguments);
			};
			
			const origSetWorkingIndicator = ctx.ui.setWorkingIndicator;
			ctx.ui.setWorkingIndicator = function(indicator: any) {
				if (intervalId !== null && indicator !== undefined && indicator.frames?.length > 0) {
					// Ignore the core agent trying to set a default spinner while ours is running
					return;
				}
				return origSetWorkingIndicator.apply(this, arguments);
			};
		}
	});

	pi.on("before_agent_start", async () => {
		if (currentCtx) {
			// Change phrase on each agent turn
			phraseIndex = (phraseIndex + 1) % PHRASES.length;
			// Track branch length at start of turn for current-turn token counting
			try {
				const branch = currentCtx.sessionManager?.getBranch?.();
				if (branch) turnStartBranchLength = branch.length;
			} catch { /* ignore */ }
			// Reset token count for new turn
			outputTokens = 0;
			lastBranchLength = 0;
			// Start spinner if not already running
			start(currentCtx);
		}
	});

	pi.on("agent_end", async () => {
		stop();
	});

	pi.on("session_shutdown", () => {
		stop();
		currentCtx = null;
	});
}

// ponytail: minimal self-check for the pure helper
function demo(): void {
	console.assert(formatElapsed(5) === "5s", "5s");
	console.assert(formatElapsed(65) === "1m 5s", "1m 5s");
	console.assert(formatElapsed(3600) === "1h", "1h");
	console.assert(formatElapsed(3665) === "1h 1m", "1h 1m");
}
// demo(); // uncomment to run
