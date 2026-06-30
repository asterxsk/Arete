/**
 * prompt-ui.ts — User message prompt styling
 *
 * Patches UserMessageComponent.render to add a dark background,
 * " ❯ " prefix, and proper padding for user input display.
 */

import { UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const PROMPT_PATCH = Symbol.for("pi-agent:patched-prompt");

export function initPromptUi(): void {
  const userMsgProto = UserMessageComponent.prototype as any;
  if (userMsgProto[PROMPT_PATCH]) return;

  const originalRender = userMsgProto.render;
  userMsgProto.render = function (width: number) {
    const targetWidth = Math.max(1, width - 3);
    const box = this.contentBox;
    if (box) {
      box.bgFn = null;
      box.paddingY = 0;
      box.paddingX = 0;
      box.invalidateCache?.();
    }

    const bg = "\x1b[48;2;55;55;55m";
    const resetBg = "\x1b[49m";
    const prefix = " \u276f ";
    const prefixW = visibleWidth(prefix);
    const lines = originalRender.call(this, Math.max(1, targetWidth - prefixW));
    if (!Array.isArray(lines) || lines.length === 0) return lines;

    while (lines.length > 0 && lines[0] === "") {
      lines.shift();
    }

    const indent = " ".repeat(prefixW);
    for (let i = 0; i < lines.length; i++) {
      const pfx = i === 0 ? prefix : indent;
      const lineText = lines[i];
      const visLen = prefixW + visibleWidth(lineText);
      const padding = " ".repeat(Math.max(0, targetWidth - visLen));
      lines[i] = truncateToWidth(bg + pfx + lineText + padding + resetBg, width);
    }

    // Removed explicit unshift since syncMessages already adds a spacer between messages
    return lines;
  };
  userMsgProto[PROMPT_PATCH] = true;
  (userMsgProto.render as any).__compactui_spacer_patched = true;
}
