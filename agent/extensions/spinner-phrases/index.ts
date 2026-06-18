/**
 * spinner-phrases — animated star spinner with orange glow effect and fun phrases.
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
 * The interval runs continuously between before_agent_start and agent_end,
 * naturally covering tool calls without fragile debounce timers.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ── Theme colours (orange glow palette) ────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const GLOW_GOLD   = "\x1b[38;2;255;220;120m";
const GLOW_BRIGHT = "\x1b[38;2;255;200;80m";
const GLOW_MAIN   = "\x1b[38;2;255;165;0m";
const GLOW_DIM    = "\x1b[38;2;200;120;30m";

// ── Text colours (white on default terminal bg) ────────────────────

const TEXT_WHITE = "\x1b[38;2;230;230;230m";
const TEXT_MUTED = "\x1b[38;2;140;140;140m";

// ── Star spinner frames ───────────────────────────────────────────

const STAR_FRAMES = ["✦", "✧", "★", "✧", "✦", "☆", "☆"];

const STAR_COLORS: string[] = [
	GLOW_GOLD,
	GLOW_BRIGHT,
	GLOW_MAIN,
	GLOW_BRIGHT,
	GLOW_GOLD,
	GLOW_DIM,
	GLOW_DIM,
];

// ── Fun phrases ────────────────────────────────────────────────────

const PHRASES: string[] = [
	"Manifesting", "Thinking", "Analyzing", "Researching", "Computing",
	"Pondering", "Ruminating", "Synthesizing", "Orchestrating", "Architecting",
	"Crafting", "Brewing", "Cooking", "Forging", "Weaving", "Churning",
	"Coalescing", "Crystallizing", "Incubating", "Fermenting", "Simmering",
	"Marinating", "Perambulating", "Gallivanting", "Frolicking", "Vibing",
	"Quantumizing", "Reticulating", "Spelunking", "Wrangling", "Bootstrapping",
	"Generating", "Contemplating", "Philosophising", "Prestidigitating",
	"Transmuting", "Levitationing", "Moonwalking", "Beboppin'", "Jitterbugging",
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
let tickCount = 0;
let currentCtx: any = null;

// Typewriter transition state
const TYPING_SPEED_MS = 40;
let transitionState: "idle" | "erasing" | "typing" = "idle";
let displayedPhrase = "";
let targetPhrase = "";
let transitionIdx = 0;
let transitionIntervalId: ReturnType<typeof setInterval> | null = null;

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

function paintStar(frameIdx: number): string {
	const star = STAR_FRAMES[frameIdx % STAR_FRAMES.length]!;
	const color = STAR_COLORS[frameIdx % STAR_COLORS.length]!;
	return `${color}${BOLD}${star}${RESET}`;
}

function pushToUI(text: string): void {
	if (currentCtx?.hasUI) {
		currentCtx.ui.setWorkingMessage(text);
	}
	(globalThis as any).__pi_spinner_text = text;
}

function buildFullText(phrase: string): string {
	const elapsed = Math.floor((Date.now() - startTime) / 1000);
	const timeStr = formatElapsed(elapsed);
	const star = paintStar(frameIndex);
	return `${star} ${TEXT_WHITE}${phrase}${RESET} ${TEXT_MUTED}(${timeStr})${RESET}`;
}

/** Erase current phrase char by char, then type the next phrase. */
function startTransition(fromPhrase: string, toPhrase: string): void {
	transitionState = "erasing";
	displayedPhrase = fromPhrase;
	targetPhrase = toPhrase;
	transitionIdx = fromPhrase.length;
	if (transitionIntervalId) clearInterval(transitionIntervalId);
	transitionIntervalId = setInterval(transitionTick, TYPING_SPEED_MS);
	transitionTick(); // fire immediately for instant feedback
}

function transitionTick(): void {
	if (transitionState === "erasing") {
		transitionIdx--;
		displayedPhrase = transitionIdx > 0 ? displayedPhrase.slice(0, transitionIdx) : "";
		pushToUI(buildFullText(displayedPhrase));
		if (transitionIdx <= 0) {
			transitionState = "typing";
			transitionIdx = 0;
		}
	} else if (transitionState === "typing") {
		transitionIdx++;
		displayedPhrase = targetPhrase.slice(0, transitionIdx);
		pushToUI(buildFullText(displayedPhrase));
		if (transitionIdx >= targetPhrase.length) {
			// Transition complete
			clearTransition();
		}
	}
}

function clearTransition(): void {
	if (transitionIntervalId) {
		clearInterval(transitionIntervalId);
		transitionIntervalId = null;
	}
	transitionState = "idle";
	displayedPhrase = "";
	targetPhrase = "";
	// Advance phrase index now that transition is fully done
	phraseIndex = (phraseIndex + 1) % PHRASES.length;
}

function getPhraseText(): string {
	if (transitionState !== "idle") return displayedPhrase;
	return PHRASES[phraseIndex % PHRASES.length]!;
}

// ── Animation tick ─────────────────────────────────────────────────

function tick(): void {
	const star = paintStar(frameIndex);

	// Start typewriter transition every 80 ticks (250ms × 80 = 20s), but only when idle
	if (tickCount > 0 && tickCount % 80 === 0 && transitionState === "idle") {
		const nextPhraseId = (phraseIndex + 1) % PHRASES.length;
		startTransition(PHRASES[phraseIndex]!, PHRASES[nextPhraseId]!);
	}

	const phrase = getPhraseText();
	pushToUI(buildFullText(phrase));

	frameIndex++;
	tickCount++;
}

// ── Interval management ────────────────────────────────────────────

/** Start (or restart) the spinner animation. Called on each before_agent_start. */
function start(ctx: any): void {
	// Clean up any lingering transition from previous run
	clearTransition();

	currentCtx = ctx;
	startTime = Date.now();
	phraseIndex = Math.floor(Math.random() * PHRASES.length);
	frameIndex = 0;
	tickCount = 0;

	// Hide the default braille spinner (⠸ etc.) — we use our own star animation
	ctx.ui.setWorkingIndicator({ frames: [] });

	if (intervalId !== null) {
		tick();
		return;
	}

	tick();
	intervalId = setInterval(tick, 250);
}

/** Stop the spinner animation. Called on agent_end and session_shutdown. */
function stop(): void {
	// Kill both intervals
	clearTransition();
	if (intervalId !== null) {
		clearInterval(intervalId);
		intervalId = null;
	}
	if (currentCtx?.hasUI) {
		currentCtx.ui.setWorkingIndicator(undefined);
		currentCtx.ui.setWorkingMessage(undefined);
	}
	(globalThis as any).__pi_spinner_text = "";
}

// ── Extension entry ────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	(globalThis as any).__pi_extension_features?.push({
		name: "spinner-phrases",
		description: "Animated star spinner with orange glow effect and fun Claude Code–style phrases",
	});

	// Capture UI context — NO spinner yet, wait for actual LLM activity
	pi.on("session_start", async (_event: any, ctx: any) => {
		if (ctx.hasUI) {
			currentCtx = ctx;
		}
	});

	// Start spinner when the LLM begins a thinking phase.
	// This fires for each phase: initial response AND after tool call results.
	pi.on("before_agent_start", async () => {
		if (currentCtx) {
			start(currentCtx);
		}
	});

	// Stop spinner when the agent fully finishes (after all tool calls done).
	pi.on("agent_end", async () => {
		stop();
	});

	// Full cleanup on session shutdown
	pi.on("session_shutdown", () => {
		stop();
		currentCtx = null;
	});
}
