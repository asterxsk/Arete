/**
 * spinner-phrases — animated star spinner with orange glow effect and fun phrases.
 *
 * Replaces the default "working..." indicator with a rotating star that has
 * an orange glow, cycles through Claude Code–style gerund phrases, and shows
 * elapsed time: "✦ Manifesting (1m 2s)"
 *
 * Sets `globalThis.__pi_spinner_text` which the `todos/` extension widget reads
 * to render the spinner above the input area.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ── Theme colours ──────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

// Orange glow palette
const GLOW_BRIGHT  = "\x1b[38;2;255;200;80m";   // bright orange-gold (center glow)
const GLOW_ORANGE  = "\x1b[38;2;255;165;0m";    // main orange
const GLOW_DIM     = "\x1b[38;2;200;120;30m";   // dimmed orange (time)
const GLOW_GOLD    = "\x1b[38;2;255;220;120m";   // bold bright gold (star peak)

// ── Star spinner frames ───────────────────────────────────────────

const STAR_FRAMES = ["✦", "✧", "★", "✧", "✦", "☆", "⋆", "☆"];

// Each frame gets a colour treatment (some frames brighter for "glow" pulse)
const STAR_COLORS: string[] = [
	GLOW_GOLD,     // ✦ — bright gold
	GLOW_BRIGHT,   // ✧ — bright orange
	GLOW_ORANGE,   // ★ — main orange
	GLOW_BRIGHT,   // ✧ — bright orange
	GLOW_GOLD,     // ✦ — bright gold
	GLOW_DIM,      // ☆ — dimmed
	GLOW_BRIGHT,   // ⋆ — bright
	GLOW_DIM,      // ☆ — dimmed
];

// ── Fun phrases (Claude Code–inspired gerunds) ─────────────────────

const PHRASES: string[] = [
	"Manifesting",
	"Thinking",
	"Analyzing",
	"Researching",
	"Computing",
	"Pondering",
	"Ruminating",
	"Synthesizing",
	"Orchestrating",
	"Architecting",
	"Crafting",
	"Brewing",
	"Cooking",
	"Forging",
	"Weaving",
	"Churning",
	"Coalescing",
	"Crystallizing",
	"Incubating",
	"Fermenting",
	"Simmering",
	"Marinating",
	"Perambulating",
	"Gallivanting",
	"Frolicking",
	"Vibing",
	"Quantumizing",
	"Reticulating",
	"Spelunking",
	"Wrangling",
	"Bootstrapping",
	"Generating",
	"Contemplating",
	"Philosophising",
	"Prestidigitating",
	"Transmuting",
	"Levitationing",
	"Moonwalking",
	"Beboppin'",
	"Jitterbugging",
	"Flibbertigibbeting",
	"Shenaniganing",
	"Whatchamacalliting",
	"Discombobulating",
	"Recombobulating",
	"Actualizing",
	"Envisioning",
	"Imagining",
	"Cerebrating",
	"Ideating",
	"Hatching",
	"Pollinating",
	"Germinating",
	"Sprouting",
	"Noodling",
	"Doodling",
	"Tinkering",
	"Crunching",
	"Hashing",
	"Unfurling",
	"Swirling",
	"Whirring",
	"Pulsing",
	"Beaming",
	"Gusting",
	"Flowing",
	"Ebbing",
	"Meandering",
	"Moseying",
	"Scurrying",
	"Scampering",
	"Zigzagging",
	"Wandering",
	"Nesting",
	"Burrowing",
	"Roosting",
	"Harmonizing",
	"Channeling",
	"Resonating",
	"Osmosing",
	"Symbioting",
	"Metamorphosing",
	"Transfiguring",
	"Sublimating",
	"Precipitating",
	"Nucleating",
	"Ionizing",
	"Photosynthesizing",
	"Stewing",
	"Proofing",
	"Leavening",
	"Kneading",
	"Whisking",
	"Drizzling",
	"Garnishing",
	"Seasoning",
	"Caramelizing",
	"Flambéing",
	"Blanching",
	"Julienning",
	"Sautéing",
	"Zesting",
	"Baking",
	"Roasting",
	"Tempering",
	"Infusing",
	"Brewing",
	"Concocting",
	"Elucidating",
	"Deciphering",
	"Puzzling",
	"Perusing",
	"Musing",
	"Mulling",
	"Deliberating",
	"Cogitating",
	"Pondering",
	"Ruminating",
	"Speculating",
	"Hypothesizing",
	"Theorizing",
	"Postulating",
	"Determining",
	"Inferring",
	"Deducing",
	"Extrapolating",
	"Interpolating",
	"Calibrating",
	"Tuning",
	"Optimizing",
	"Refactoring",
	"Polishing",
	"Shining",
	"Gleaming",
	"Glowing",
];

// ── State ──────────────────────────────────────────────────────────

let intervalId: ReturnType<typeof setInterval> | null = null;
let startTime = 0;
let phraseIndex = 0;
let frameIndex = 0;
let tickCount = 0;

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

// ── Spinner update ─────────────────────────────────────────────────

function updateSpinner(): void {
	const elapsed = Math.floor((Date.now() - startTime) / 1000);
	const timeStr = formatElapsed(elapsed);
	const star = paintStar(frameIndex);

	// Pick the phrase — change every 4 ticks for a nice cadence
	if (tickCount > 0 && tickCount % 4 === 0) {
		phraseIndex = (phraseIndex + 1) % PHRASES.length;
	}
	const phrase = PHRASES[phraseIndex % PHRASES.length]!;

	// Build the glow-effect string
	//   ★ Manifesting (1m 2s)
	// Star gets bright glow, phrase is orange, time is dimmed
	const text = `${star} ${GLOW_ORANGE}${phrase}${RESET} ${GLOW_DIM}(${timeStr})${RESET}`;

	(globalThis as any).__pi_spinner_text = text;

	frameIndex++;
	tickCount++;
}

function startSpinner(): void {
	// Clear any previous interval to prevent duplicates
	stopSpinner();
	startTime = Date.now();
	phraseIndex = Math.floor(Math.random() * PHRASES.length);
	frameIndex = 0;
	tickCount = 0;
	updateSpinner();
	intervalId = setInterval(updateSpinner, 250);
}

function stopSpinner(): void {
	if (intervalId !== null) {
		clearInterval(intervalId);
		intervalId = null;
	}
	(globalThis as any).__pi_spinner_text = "";
}

// ── Extension entry ────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	(globalThis as any).__pi_extension_features?.push({
		name: "spinner-phrases",
		description: "Animated star spinner with orange glow effect and fun Claude Code–style phrases",
	});

	// Start spinner when the agent begins processing
	pi.on("before_agent_start", async () => {
		startSpinner();
	});

	// Stop spinner when the message is complete
	pi.on("message_end", () => {
		stopSpinner();
	});

	// Safety: stop on session end if anything is still running
	pi.on("session_shutdown", () => {
		stopSpinner();
	});
}
