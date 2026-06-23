// header extension — banner header with ascii art on the left and an
// info panel on the right showing version, model, and working directory.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const RESET = "\x1b[0m";
const ORANGE = "\x1b[38;2;255;165;0m";
const ARETE = "\x1b[38;2;255;165;0m";
const GREY = "\x1b[38;2;180;180;180m";

function paint(color: string, text: string): string {
  return `${color}${text}${RESET}`;
}

/**
 * Color the banner orange (#ffa500). Spaces stay untouched.
 * ponytail: name is vestigial — was for a blackhole gradient.
 */
function colorizeBanner(lines: string[]): string[] {
  return lines.map((line) => {
    let out = "";
    for (let col = 0; col < line.length; col++) {
      const ch = line[col] ?? "";
      if (ch === " " || ch === undefined) {
        out += ch;
      } else {
        out += `${ORANGE}${ch}${RESET}`;
      }
    }
    return out;
  });
}

export function buildBannerArtLines(): string[] {
  return ["", " ▝██████████▘", "   ██    ██", "   ██    ██", "  ▄██    ██▄"];
}

function composeSideBySide(
  leftLines: string[],
  rightLines: string[],
  gap = 2,
): string[] {
  const leftWidth = leftLines.reduce(
    (max, line) => Math.max(max, visibleWidth(line)),
    0,
  );
  const rowCount = Math.max(leftLines.length, rightLines.length);
  return Array.from({ length: rowCount }, (_, i) => {
    const left = leftLines[i] || "";
    const right = rightLines[i] || "";
    if (!right) return left;
    const padding = " ".repeat(
      Math.max(0, leftWidth - visibleWidth(left) + gap),
    );
    return `${left}${padding}${right}`;
  });
}

// ── Info panel state ─────────────────────────────────────────────────

let infoProvider = "";
let infoModel = "";
let requestHeaderRender: (() => void) | undefined;

function refreshModel(ctx: any): void {
  if (!ctx?.model) return;
  infoProvider = ctx.model.provider || "";
  const raw = ctx.model.display_name || ctx.model.id || "";
  // Strip provider prefix: "deepseek/deepseek-v4-flash" → "deepseek-v4-flash"
  infoModel = raw.replace(/^[^/]+\//, "");
}

function buildInfoPanel(height: number): string[] {
  const version = "Arete v2.6.1";
  const provider = infoProvider || "—";
  const model = infoModel || "—";
  const cwd = process.cwd();

  const lines: string[] = [""];

  lines.push(paint(ARETE, version));
  lines.push(paint(GREY, provider));
  lines.push(paint(GREY, model));
  lines.push(paint(GREY, cwd));

  return lines;
}

// ── Extension entry ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Self-register in global feature registry
  (globalThis as any).__pi_extension_features?.push({
    name: "header",
    description:
      "ASCII-art banner header with version, provider, model, and info widget",
  });

  pi.on("session_start", async (_event, ctx) => {
    refreshModel(ctx);

    if (!ctx.hasUI) return;
    const renderHeader = (tui: any, _theme: any) => {
      const refresh = () => tui.requestRender();
      requestHeaderRender = refresh;
      return {
        render(width: number): string[] {
          const rawLines = buildBannerArtLines();
          const bannerLines = colorizeBanner(rawLines);
          const infoLines = buildInfoPanel(bannerLines.length);
          return composeSideBySide(bannerLines, infoLines).map((line) =>
            truncateToWidth(line, width),
          );
        },
        invalidate() {},
      };
    };
    ctx.ui.setHeader(renderHeader);
  });

  pi.on("model_select", (_event, ctx) => {
    refreshModel(ctx);
    requestHeaderRender?.();
  });
}
