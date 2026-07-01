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

// Typewriter transition state, driven by the same 250ms tick as the spinner.
const TRANSITION_EVERY_TICKS = 48; // 48 × 250ms = 12s
let transitionState: "idle" | "erasing" | "typing" = "idle";
let displayedPhrase = "";
let targetPhrase = "";
let transitionIdx = 0;
let pendingPhraseIndex = 0;

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

function buildFullText(phrase: string): string {
	const elapsed = Math.floor((Date.now() - startTime) / 1000);
	const timeStr = formatElapsed(elapsed);
	// Read goal text from the goal extension's bridge
	const goalBridge = (globalThis as any)["__pi_goal_state"];
	const goalText = goalBridge?.getDisplayText?.() || "";
	const goalPart = goalText ? ` - 𖤍 ${goalText}` : "";
	const plain = `${getCurrentFrame()} ${phrase} (${timeStr})${goalPart}`;
	return `${ORANGE}${plain}${RESET}`;
}

function clearTransition(): void {
	transitionState = "idle";
	displayedPhrase = "";
	targetPhrase = "";
	transitionIdx = 0;
}

function finishTransition(): void {
	phraseIndex = pendingPhraseIndex;
	clearTransition();
}

function startTransition(): void {
	pendingPhraseIndex = (phraseIndex + 1) % PHRASES.length;
	targetPhrase = PHRASES[pendingPhraseIndex]! + "...";
	displayedPhrase = PHRASES[phraseIndex]! + "...";
	transitionState = "erasing";
	transitionIdx = displayedPhrase.length;
}

function transitionStep(): void {
	if (transitionState === "erasing") {
		transitionIdx--;
		displayedPhrase = displayedPhrase.slice(0, Math.max(0, transitionIdx));
		if (transitionIdx <= 0) {
			transitionState = "typing";
			transitionIdx = 0;
		}
	} else if (transitionState === "typing") {
		transitionIdx++;
		displayedPhrase = targetPhrase.slice(0, transitionIdx);
		if (transitionIdx >= targetPhrase.length) {
			finishTransition();
		}
	}
}

function getPhraseText(): string {
	if (transitionState !== "idle") return displayedPhrase;
	return PHRASES[phraseIndex % PHRASES.length]! + "...";
}

// ── Animation tick ─────────────────────────────────────────────────

function tick(): void {
	if (transitionState !== "idle") {
		transitionStep();
	} else if (tickCount > 0 && tickCount % TRANSITION_EVERY_TICKS === 0) {
		startTransition();
	}

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

	clearTransition();
	startTime = Date.now();
	phraseIndex = Math.floor(Math.random() * PHRASES.length);
	frameIndex = 0;
	frameHoldCounter = 0;
	tickCount = 0;

	ctx.ui.setWorkingIndicator({ frames: [] });

	tick();
	intervalId = setInterval(tick, 130);
}

function stop(): void {
	clearTransition();
	if (intervalId !== null) {
		clearInterval(intervalId);
		intervalId = null;
	}
	if (currentCtx?.hasUI) {
		currentCtx.ui.setWorkingIndicator(undefined);
		currentCtx.ui.setWorkingMessage(undefined);
	}
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
