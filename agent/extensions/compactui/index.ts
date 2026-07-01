/**
 * compactui — Compact tool rendering with output truncation
 *
 * Entry point. Imports and wires together:
 *   - rendering.ts    — shared rendering primitives
 *   - patch-tools.ts  — tool patching interception
 *   - thinking-block.ts — thinking block component & hiding
 *   - assistant-footer.ts — duration footer on assistant messages
 *   - prompt-ui.ts    — user message prompt styling
 *   - tool-status-dot.ts — animated status dot for running tools
 */

import type { ExtensionAPI, EditToolDetails } from "@earendil-works/pi-coding-agent";
import {
  AssistantMessageComponent,
  BashExecutionComponent,
  CustomMessageComponent,
  InteractiveMode,
  ToolExecutionComponent,
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { Markdown, Text, Container, Spacer, truncateToWidth } from "@earendil-works/pi-tui";

import {
  line, noOp, orange, compactCall, compactSummary, compactFailed,
  formatDur, expandedBox, diffExpandedBox, captureResult, INDENT, DIM_GREY,
} from "./rendering.js";
import { patchTool, TRUNCATED_TOOLS, KNOWN_TOOLS, MAX_LINES } from "./patch-tools.js";
import { ThinkingBlock, colorThinkingText, initHideThinking } from "./thinking-block.js";
import { registerTools } from "./register-tools.js";
import { initAssistantFooter } from "./assistant-footer.js";
import { initPromptUi } from "./prompt-ui.js";
import { initToolStatusDot } from "./tool-status-dot.js";

// ── State ──────────────────────────────────────────────────────────────

let patchedAssistant = false;

// ── Native Thinking Duration Tracking ───────────────────────────────────
//
// The upstream pi-mono framework (per `docs/plans/thinking.md`) renders
// native `type: "thinking"` blocks with a duration-aware label:
//
//     ✻ Thinking for Ns    (live while streaming; sub-second rounds to 1s)
//     ✻ Thought for Ns     (locked in after message_end)
//
// The user's installed framework version does not expose the per-block
// duration to extensions, so we track start/end ourselves on the
// AssistantMessage itself via a non-enumerable Symbol-keyed property. The
// property travels with the message reference across streaming updates,
// `message_end`, `_replaceMessageInPlace`, and `buildSessionContext()`
// rebuilds — so a WeakMap keyed on the message is unnecessary, and
// immune to any reference-identity gotchas that would cause the entry
// to be missed.
//
// While the message is still streaming, we use the live elapsed time so the
// hidden label shows a live counter from the moment Ctrl+T is pressed. The
// verb flips to `Thought for Ns` when either:
//   1. `endMs` is set by the message_end event handler, or
//   2. `stopReason` is set on the message (provider-dependent).
// Checking both gives us coverage regardless of provider. For entries we
// never tracked (pre-existing entries from disk or messages that already
// had stopReason when first seen), we fall back to `✻ Thought...`.

const THINKING_TIMING_KEY = Symbol.for("compactui.nativeThinkingTiming");

interface ThinkingTiming {
  startMs: number;
  endMs?: number;
}

function getTiming(message: object): ThinkingTiming | undefined {
  return (message as any)[THINKING_TIMING_KEY] as ThinkingTiming | undefined;
}

function recordNativeThinkingStart(message: object): void {
  if (!(message as any)[THINKING_TIMING_KEY]) {
    Object.defineProperty(message, THINKING_TIMING_KEY, {
      value: { startMs: Date.now() },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

function recordNativeThinkingEnd(message: object): void {
  const timing = getTiming(message);
  if (timing) timing.endMs = Date.now();
}

function getNativeThinkingLabel(message: object, fallback: string): string {
  const timing = getTiming(message);
  if (!timing) return fallback;
  // Use the live elapsed time so the label shows a live counter from the
  // moment Ctrl+T is pressed. The verb stays "Thinking for Ns" while the
  // message is still streaming (no stopReason). Once the agent finishes
  // and sets stopReason ("stop", "toolUse", "length", "error"), the verb
  // locks to "Thought for Ns" — no dependency on the message_end event.
  // Sub-second durations round up to "1s" (per user preference) rather
  // than the upstream framework's "Thought for <1s".
  const durMs = (timing.endMs ?? Date.now()) - timing.startMs;
  const secs = Math.max(1, Math.round(durMs / 1000));
  // The verb flips to "Thought" when either:
  // - endMs was set by the message_end event handler (most reliable)
  // - stopReason is set on the message (provider-dependent; minimax may
  //   omit it). Checking both gives us coverage regardless of provider.
  const hasEnded = !!(timing.endMs ?? (message as any).stopReason);
  return hasEnded ? `Thought for ${secs}s` : `Thinking for ${secs}s`;
}

// ── Main Extension ─────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Flag so other extensions (like tasks) know we are active
  (globalThis as any).__pi_betterui_enabled = true;

  // ── Patch Already-Registered Tools ──────────────────────────────────
  const registeredTools = (pi as any).tools
    ? ((pi as any).tools instanceof Map
        ? Array.from((pi as any).tools.values())
        : Object.values((pi as any).tools))
    : ((pi as any).getTools ? (pi as any).getTools() : []);
  for (const tool of registeredTools) {
    if (tool && typeof tool === 'object') patchTool(tool);
  }

  // Patch the instance's registerTool
  const origRegister = pi.registerTool.bind(pi);
  pi.registerTool = (tool: any) => {
    patchTool(tool);
    origRegister(tool);
  };

  // Patch the prototype's registerTool to catch other extensions
  const proto = Object.getPrototypeOf(pi);
  if (proto && typeof proto.registerTool === "function" && !(proto as any).__compactui_patched_register) {
    (proto as any).__compactui_patched_register = true;
    const origProtoRegister = proto.registerTool;
    proto.registerTool = function (tool: any) {
      patchTool(tool);
      return origProtoRegister.call(this, tool);
    };
  }

  // Expose patchTool globally as fallback for fresh pi objects
  (globalThis as any).__pi_patchTool = patchTool;


  
  // ── Patch UI Components ─────────────────────────────────────────────
  if (!patchedAssistant) {
    try {
      if (InteractiveMode && InteractiveMode.prototype.addMessageToChat &&
          !(InteractiveMode.prototype.addMessageToChat as any).__compactui_patched) {
        // ── Persistent chatContainer.addChild patch with proactive spacer ──
        // Installs a one-time wrapper on this.chatContainer that gives every
        // non-blank child a uniform 1-line spacer above it. Behaviour:
        //   - Incoming single-blank-line component (native Spacer, line("")) →
        //     held back; flushed before the next non-blank child so we never
        //     double up spacers.
        //   - Incoming non-blank child → if a spacer is held, flush it; else if
        //     the container already has content, inject a fresh Spacer(1) above.
        //   - Empty container + first child → no spacer injected (nothing to
        //     separate from).
        // This covers every code path that adds to chatContainer: addMessageToChat
        // (user/assistant/tool/bash/custom), message_start (streaming
        // AssistantMessageComponent), message_update (tool components),
        // toggleThinkingBlockVisibility rebuild, showStatus, errorMessage, etc.
        const installChatContainerProactiveSpacer = (chatContainer: any) => {
          if (chatContainer.__compactui_proactiveSpacerInstalled) return;
          const originalAddChild = chatContainer.addChild;
          let lastSpacerArgs: any[] | null = null;
          // Hold skill invocation components to reorder them below user message
          let pendingSkillComponent: any = null;
          
          chatContainer.addChild = function (...args: any[]) {
            const component = args[0];
            
            // Detect SkillInvocationMessageComponent (skill block)
            // We identify it by checking for skillBlock property and the component type
            const isSkillComponent = component && 
              typeof component === "object" &&
              component.constructor?.name === "SkillInvocationMessageComponent" &&
              !component.expanded;
            
            if (isSkillComponent) {
              // Hold back skill component to render after user message
              pendingSkillComponent = component;
              return;
            }
            
            // Detect UserMessageComponent (user message)
            const isUserMessage = component && 
              typeof component === "object" &&
              component.constructor?.name === "UserMessageComponent";
            
            if (isUserMessage && pendingSkillComponent) {
              // Flush any held spacer first
              if (lastSpacerArgs) {
                originalAddChild.apply(this, lastSpacerArgs);
                lastSpacerArgs = null;
              }
              // User message coming after held skill: render user message first,
              // then add skill subtitle below it
              const result = originalAddChild.apply(this, args);
              // Now add the skill subtitle (no background, compact format)
              const skillName = pendingSkillComponent.skillBlock?.name || "skill";
              const hint = " [ctrl+o to expand]";
              const prefix = "  \u2514 ";
              const lineText = prefix + skillName + hint;
              const dimColor = "\x1b[38;2;140;140;140m";
              const resetColor = "\x1b[39m";
              const subtitleText = dimColor + lineText + resetColor;
              // Create a simple line component for the subtitle
              const subtitleComponent = {
                render(width: number) { return [subtitleText]; },
                invalidate() {}
              };
              originalAddChild.call(this, subtitleComponent);
              pendingSkillComponent = null;
              return result;
            }
            
            // Hold back any spacer component so we never render two blank
            // lines back-to-back. It will be flushed before the next
            // non-blank component, or dropped if no such component follows.
            if (args.length > 0 && args[0] && typeof args[0].render === "function") {
              const lines = args[0].render();
              if (lines.length === 1 && lines[0].trim() === "") {
                lastSpacerArgs = args;
                return;
              }
            }

            // Non-spacer incoming: consume the held spacer (if any) OR inject
            // a fresh Spacer(1) above when the container already has content.
            if (lastSpacerArgs) {
              originalAddChild.apply(this, lastSpacerArgs);
              lastSpacerArgs = null;
            } else if (this.children.length > 0) {
              originalAddChild.call(this, new Spacer(1));
            }

            return originalAddChild.apply(this, args);
          };
          chatContainer.__compactui_proactiveSpacerInstalled = true;
        };

        const originalAdd = InteractiveMode.prototype.addMessageToChat;
        InteractiveMode.prototype.addMessageToChat = function (message: any, options?: any) {
          // First call into addMessageToChat installs the persistent wrapper
          // on chatContainer so streaming/direct addChild calls also benefit.
          if (this.chatContainer) installChatContainerProactiveSpacer(this.chatContainer);
          return originalAdd.call(this, message, options);
        };
        (InteractiveMode.prototype.addMessageToChat as any).__compactui_patched = true;
      }

      // ── Patch AssistantMessageComponent.updateContent ────────────────
      if (
        AssistantMessageComponent &&
        AssistantMessageComponent.prototype.updateContent &&
        !(AssistantMessageComponent.prototype.updateContent as any).__compactui_patched
      ) {
        AssistantMessageComponent.prototype.updateContent = function (message: any) {
          this.lastMessage = message;
          this.contentContainer.clear();

          let hasThinking = false;
          for (let i = 0; i < message.content.length; i++) {
            const content = message.content[i];
            if (content.type === "text" && content.text.trim()) {
              if (hasThinking) {
                this.contentContainer.addChild(line(""));
              }
              if (content.text) {
                let text = content.text.trim();
                // Clean up garbage literal ANSI escapes and markdown-escaped ANSI from history
                text = text.replace(/\\x1b\[[0-9;]*m/g, "");
                text = text.replace(/\x1b\[[0-9;]*m/g, "");
                text = text.replace(/\\?\[\[?38;2;140;140;140m/g, "");
                text = text.replace(/\\?\[0m/g, "");
                text = text.replace(/\\?\[39m/g, "");

                const footerMarker = "✻ Worked for";
                const markerIndex = text.lastIndexOf(footerMarker);
                
                if (markerIndex !== -1 && markerIndex >= text.length - 200) {
                   const footerText = text.substring(markerIndex).trim();
                   text = text.substring(0, markerIndex).trim();
                   // Also remove any older duplicate markers from the body
                   text = text.replace(/✻ Worked for[^\n]*/g, "").trim();
                   text = text.replace(/✦ Worked for[^\n]*/g, "").trim();
                   
                   if (text) {
                     this.contentContainer.addChild(
                       new Markdown(text, 1, 0, this.markdownTheme)
                     );
                   }
                   this.contentContainer.addChild(line(""));
                   this.contentContainer.addChild(
                     new Text(`\x1b[38;2;140;140;140m${footerText}\x1b[0m`, 1, 0)
                   );
                } else {
                   // Clean up duplicates even if it's not at the end
                   text = text.replace(/✻ Worked for[^\n]*/g, "").trim();
                   text = text.replace(/✦ Worked for[^\n]*/g, "").trim();
                   if (text) {
                     this.contentContainer.addChild(
                       new Markdown(text, 1, 0, this.markdownTheme)
                     );
                   }
                }
              }
            } else if (
              content.type === "thinking" &&
              content.thinking &&
              content.thinking.trim()
            ) {
              hasThinking = true;
              let tText = content.thinking.trim();
              // Record the first sighting of a thinking block in this message.
              // MUST run outside the `hideThinkingBlock` branch so the WeakMap
              // entry is created during streaming (when thinking is visible)
              // and available when `message_end` fires. If we only called this
              // inside the hide branch, the entry would be created fresh at
              // rebuild time (Ctrl+T toggle), missing the original start time
              // and never finding an endMs.
              recordNativeThinkingStart(message);
              // Only inject a separator if thinking isn't the first child of
              // contentContainer. When thinking is first, the proactive
              // chatContainer spacer above the AssistantMessageComponent is
              // already the separator from the previous chat line — adding
              // another line("") here would yield a 2-line gap.
              if (this.contentContainer.children.length > 0) {
                this.contentContainer.addChild(line(""));
              }
              if (this.hideThinkingBlock) {
                // Respect Ctrl+T hide toggle: render the duration-aware
                // hidden label per `docs/plans/thinking.md`. For entries we
                // never observed (pre-existing sessions / no WeakMap entry),
                // fall back to `Thought...`. For current entries the label
                // shows `Thought for Ns` — live during streaming, locked in
                // after message_end. Color matches the `✻ Worked for Xs`
                // footer (`assistant-footer.ts`) so both labels look like
                // siblings: DIM_GREY (`\x1b[38;2;140;140;140m`) with reset.
                const label = getNativeThinkingLabel(message, "Thought...");
                this.contentContainer.addChild(
                  new Text(`\x1b[38;2;140;140;140m✻ ${label}\x1b[0m`, 1, 0)
                );
              } else {
                this.contentContainer.addChild(
                  new ThinkingBlock(tText, 1, 0, undefined, { color: colorThinkingText, italic: true })
                );
              }
            }
          }

          const hasToolCalls = message.content.some((c: any) => c.type === "tool_use");
          
          if (!hasToolCalls) {
            if (message.stopReason === "aborted") {
              const abortMessage =
                message.errorMessage && message.errorMessage !== "Request was aborted"
                  ? message.errorMessage
                  : "Operation aborted";
              this.contentContainer.addChild(
                new Text(`\x1b[38;2;255;85;85m${abortMessage}\x1b[39m`, 1, 0)
              );
            } else if (message.stopReason === "error") {
              const errorMsg = message.errorMessage || "Unknown error";
              this.contentContainer.addChild(
                new Text(`\x1b[38;2;255;85;85mError: ${errorMsg}\x1b[39m`, 1, 0)
              );
            }
          }
        };
        (AssistantMessageComponent.prototype.updateContent as any).__compactui_patched = true;
      }

      // ── Patch ToolExecutionComponent.render ────────────────────────
      if (
        ToolExecutionComponent &&
        ToolExecutionComponent.prototype.render &&
        !ToolExecutionComponent.prototype.render.__compactui_patched
      ) {
        const originalRender = ToolExecutionComponent.prototype.render;
        ToolExecutionComponent.prototype.render = function () {
          const knownTools = ["read", "write", "bash", "edit", "find", "grep", "ls"];
          if (this.toolName && !knownTools.includes(this.toolName)) {
            if (!this.expanded) {
              const dummyTheme = {
                fg: (color: string, text: string) => color === "dim" ? `${DIM_GREY}${text}\x1b[39m` : text
              };
              const argsStr = typeof this.args === "string" ? this.args : JSON.stringify(this.args || {});
              
              const resultLines: string[] = [];
              
              const callComp = compactCall(this.toolName, argsStr, dummyTheme);
              resultLines.push(...callComp.render(100));
              
              if (this.result) {
                if (this.result.isError) {
                  resultLines.push(...compactFailed(dummyTheme).render(100));
                } else {
                  const fullText = this.result.content?.[0]?.text || "";
                  const lineCount = fullText ? fullText.split("\n").length : 0;
                  resultLines.push(...compactSummary(dummyTheme, `${this.toolName} output`, lineCount, "line").render(100));
                }
              }
              return resultLines;
            }
          }
          const out = originalRender.apply(this, arguments) as string[];
          while (out.length > 0 && out[0].trim() === "") out.shift();
          return out;
        };
        ToolExecutionComponent.prototype.render.__compactui_patched = true;
      }

      // ── Patch BashExecutionComponent.render ──────────────────────────
      if (
        BashExecutionComponent &&
        BashExecutionComponent.prototype.render &&
        !(BashExecutionComponent.prototype.render as any).__compactui_patched
      ) {
        const originalBashRender = BashExecutionComponent.prototype.render;
        BashExecutionComponent.prototype.render = function (this: any, width: number) {
          const lines = originalBashRender.call(this, width);
          while (lines.length > 0 && lines[0].trim() === "") lines.shift();
          return lines;
        };
        (BashExecutionComponent.prototype.render as any).__compactui_patched = true;
      }

      // ── Patch CustomMessageComponent.render ──────────────────────────
      if (
        CustomMessageComponent &&
        CustomMessageComponent.prototype.render &&
        !(CustomMessageComponent.prototype.render as any).__compactui_patched
      ) {
        const originalCustomRender = CustomMessageComponent.prototype.render;
        CustomMessageComponent.prototype.render = function (this: any, width: number) {
          const lines = originalCustomRender.call(this, width);
          while (lines.length > 0 && lines[0].trim() === "") lines.shift();
          return lines;
        };
        (CustomMessageComponent.prototype.render as any).__compactui_patched = true;
      }

      // Patch toggleToolOutputExpansion
      const originalToggleExpand =
        InteractiveMode.prototype.toggleToolOutputExpansion;
      if (
        originalToggleExpand &&
        !InteractiveMode.prototype.toggleToolOutputExpansion.__compactui_patched
      ) {
        InteractiveMode.prototype.toggleToolOutputExpansion = function () {
          const scroll =
            this.chatContainer &&
            typeof this.chatContainer.getScroll === "function"
              ? this.chatContainer.getScroll()
              : undefined;

          originalToggleExpand.apply(this, arguments);

          if (
            scroll !== undefined &&
            this.chatContainer &&
            typeof this.chatContainer.setScroll === "function"
          ) {
            setTimeout(() => {
              if (
                this.chatContainer &&
                typeof this.chatContainer.setScroll === "function"
              ) {
                this.chatContainer.setScroll(scroll);
              }
              if (
                this.ui &&
                typeof this.ui.requestRender === "function"
              ) {
                this.ui.requestRender();
              }
            }, 10);
          }
        };
        InteractiveMode.prototype.toggleToolOutputExpansion.__compactui_patched = true;
      }

      // Patch toggleThinkingBlockVisibility
      const originalToggleThinking =
        InteractiveMode.prototype.toggleThinkingBlockVisibility;
      if (
        originalToggleThinking &&
        !InteractiveMode.prototype.toggleThinkingBlockVisibility.__compactui_patched
      ) {
        InteractiveMode.prototype.toggleThinkingBlockVisibility = function () {
          const scroll =
            this.chatContainer &&
            typeof this.chatContainer.getScroll === "function"
              ? this.chatContainer.getScroll()
              : undefined;

          originalToggleThinking.apply(this, arguments);

          if (
            scroll !== undefined &&
            this.chatContainer &&
            typeof this.chatContainer.setScroll === "function"
          ) {
            setTimeout(() => {
              if (
                this.chatContainer &&
                typeof this.chatContainer.setScroll === "function"
              ) {
                this.chatContainer.setScroll(scroll);
              }
              if (
                this.ui &&
                typeof this.ui.requestRender === "function"
              ) {
                this.ui.requestRender();
              }
            }, 10);
          }
        };
        InteractiveMode.prototype.toggleThinkingBlockVisibility.__compactui_patched = true;
      }

      // Patch cycleThinkingLevel
      const originalCycleThinking =
        InteractiveMode.prototype.cycleThinkingLevel;
      if (
        originalCycleThinking &&
        !InteractiveMode.prototype.cycleThinkingLevel.__compactui_patched
      ) {
        InteractiveMode.prototype.cycleThinkingLevel = function () {
          const scroll =
            this.chatContainer &&
            typeof this.chatContainer.getScroll === "function"
              ? this.chatContainer.getScroll()
              : undefined;

          originalCycleThinking.apply(this, arguments);

          if (
            scroll !== undefined &&
            this.chatContainer &&
            typeof this.chatContainer.setScroll === "function"
          ) {
            setTimeout(() => {
              if (
                this.chatContainer &&
                typeof this.chatContainer.setScroll === "function"
              ) {
                this.chatContainer.setScroll(scroll);
              }
              if (
                this.ui &&
                typeof this.ui.requestRender === "function"
              ) {
                this.ui.requestRender();
              }
            }, 10);
          }
        };
        InteractiveMode.prototype.cycleThinkingLevel.__compactui_patched = true;
      }


      patchedAssistant = true;
    } catch (e) {
      console.error("Failed to patch UI components in compactui extension:", e);
    }
  }

  // ── Event Hooks ─────────────────────────────────────────────────────
  const unknownTools = new Set<string>();

  pi.on("tool_call", async (event) => {
    if (!KNOWN_TOOLS.has(event.toolName) && !unknownTools.has(event.toolName)) {
      unknownTools.add(event.toolName);
    }
  });

  // Finalize the native thinking block duration so the next render of the
  // hidden thinking label can lock in `✻ Thought for Ns`. Until this fires
  // the label uses the live elapsed time. See getNativeThinkingLabel().
  pi.on("message_end", async (event) => {
    const message = (event as any)?.message;
    if (message && message.role === "assistant") {
      recordNativeThinkingEnd(message);
    }
  });

  // ── Truncate tool output + format unknown tool errors ───────────────
  pi.on("tool_result", async (event) => {
    const content = event.content;
    if (!content || content.length === 0) return;

    if (event.isError && unknownTools.has(event.toolName)) {
      const errorText = content
        .map((p: any) => (p.type === "text" ? p.text : ""))
        .join("\n");
      const formatted = `Tool "${event.toolName}" is not registered.\nAvailable tools: ${Array.from(KNOWN_TOOLS).join(", ")}`;
      return {
        content: [{ type: "text", text: formatted }],
        details: { _fullOutput: formatted, _isUnknownTool: true },
        isError: true,
      };
    }

    if (!TRUNCATED_TOOLS.has(event.toolName)) return;

    const newContent = content.map((part: any) => {
      if (part.type !== "text" || !part.text) return part;
      const lines = part.text.split("\n");
      if (lines.length <= MAX_LINES) return part;
      const totalLines = lines.length;
      const hidden = totalLines - MAX_LINES;
      const kept = lines.slice(0, MAX_LINES).join("\n");
      return {
        ...part,
        text: `${kept}\n... (${hidden} more lines, ${totalLines} total, ctrl+o to expand)`,
      };
    });

    for (let i = 0; i < content.length; i++) {
      if (newContent[i].text !== content[i].text) {
        return { content: newContent };
      }
    }
  });

  // ── Tool: Read ──────────────────────────────────────────────────────
  const cwd = process.cwd();
  const originalRead = createReadTool(cwd);
  pi.registerTool({
    name: "read",
    label: "read",
    description: originalRead.description,
    parameters: originalRead.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalRead.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall("read", args.path ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");
      const lineCount = lines.length;

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read tool output", lineCount, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      const filePath = context.args.path ?? "?";
      const offset = (context.args.offset as number) || 1;
      const endLine = offset + lineCount - 1;
      const label =
        lineCount > 0 ? `${offset}-${endLine}, ${filePath}` : filePath;

      const numberedLines = lines.map((line: string, i: number) => {
        const num = String(offset + i).padStart(4, " ");
        return `${num}  ${line}`;
      });

      return expandedBox(theme, "read", label, numberedLines, durationS, 40);
    },
  });

  // ── Tool: Write ─────────────────────────────────────────────────────
  const originalWrite = createWriteTool(cwd);
  pi.registerTool({
    name: "write",
    label: "write",
    description: originalWrite.description,
    parameters: originalWrite.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalWrite.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall("write", args.path ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");
      const lineCount = lines.length;

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "file written", lineCount, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      const filePath = context.args.path ?? "?";

      const numberedLines = lines.map((line: string, i: number) => {
        const num = String(i + 1).padStart(4, " ");
        return `${num}  ${line}`;
      });

      return expandedBox(theme, "write", filePath, numberedLines, durationS, 40);
    },
  });

  // ── Tool: Edit ──────────────────────────────────────────────────────
  const originalEdit = createEditTool(cwd);
  pi.registerTool({
    name: "edit",
    label: "edit",
    description: originalEdit.description,
    parameters: originalEdit.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      const result = await originalEdit.execute(
        toolCallId,
        params,
        signal,
        onUpdate
      );
      const durationMs = Date.now() - t0;
      const diff = (result.details as Record<string, unknown>)?.diff as
        | string
        | undefined;
      const fullText = diff || result.content?.[0]?.text || "";
      return {
        ...result,
        details: {
          ...result.details,
          _fullOutput: fullText,
          _durationS: durationMs / 1000,
        },
      };
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall("edit", args.path ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as EditToolDetails | undefined;
      if (!details?.diff) return noOp();
      const diffLines = details.diff.split("\n");

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "file edited", diffLines.length, "line");
      }

      const durationS =
        ((result.details as Record<string, unknown>)?._durationS as number) ??
        -1;

      const plainTextLines = [
        "edit [" + (context.args.path ?? "?") + "]",
      ];
      for (const line of diffLines) {
        plainTextLines.push(line);
      }
      if (durationS >= 0) {
        plainTextLines.push(
          "Took " + formatDur(durationS) + " [ctrl+o to hide]"
        );
      } else {
        plainTextLines.push("[ctrl+o to hide]");
      }
      (result as any)._plainText = plainTextLines.join("\n");

      return diffExpandedBox(
        theme,
        "edit",
        context.args.path ?? "",
        diffLines,
        durationS,
        50
      );
    },
  });

  // ── Tool: Bash ──────────────────────────────────────────────────────
  const originalBash = createBashTool(cwd);
  pi.registerTool({
    name: "bash",
    label: "bash",
    description: originalBash.description,
    parameters: originalBash.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalBash.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall("bash", args.command ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n");

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      const cmd =
        context.args.command || (details?.command as string) || "";
      return expandedBox(theme, "bash", cmd, lines, durationS, 40);
    },
  });

  // ── Tool: Ls ────────────────────────────────────────────────────────
  const originalLs = createLsTool(cwd);
  pi.registerTool({
    name: "ls",
    label: "ls",
    description: originalLs.description,
    parameters: originalLs.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalLs.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall("ls", args.path || ".", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n").filter((l: string) => l.trim());

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "ls", context.args.path || ".", lines, durationS, 40);
    },
  });

  // ── Tool: Grep ──────────────────────────────────────────────────────
  const originalGrep = createGrepTool(cwd);
  pi.registerTool({
    name: "grep",
    label: "grep",
    description: originalGrep.description,
    parameters: originalGrep.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalGrep.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall("grep", args.pattern ?? "?", theme);
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n").filter((l: string) => l.trim());

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(theme, "grep", context.args.pattern ?? "?", lines, durationS, 40);
    },
  });

  // ── Tool: Find ──────────────────────────────────────────────────────
  const originalFind = createFindTool(cwd);
  pi.registerTool({
    name: "find",
    label: "find",
    description: originalFind.description,
    parameters: originalFind.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      const t0 = Date.now();
      return captureResult(
        await originalFind.execute(toolCallId, params, signal, onUpdate),
        Date.now() - t0
      );
    },
    renderCall(args, theme, context) {
      if (context.expanded) return noOp();
      return compactCall(
        "find",
        (args.pattern ?? "?") + (args.path ? " " + args.path : ""),
        theme
      );
    },
    renderResult(result, { expanded }, theme, context) {
      const details = result.details as Record<string, unknown> | undefined;
      const full =
        (details?._fullOutput as string) || result.content?.[0]?.text || "";
      const lines = full.split("\n").filter((l: string) => l.trim());

      if (!expanded) {
        if (result.isError) return compactFailed(theme);
        return compactSummary(theme, "read terminal output", lines.length, "line");
      }

      const durationS = (details?._durationS as number) ?? -1;
      return expandedBox(
        theme,
        "find",
        (context.args.pattern ?? "?") +
          (context.args.path ? " " + context.args.path : ""),
        lines,
        durationS,
        40
      );
    },
  });

  // ── Patch renderWidgetContainer: remove leading spacer above widgets ──
  // InteractiveMode.renderWidgetContainer() unconditionally adds a Spacer(1)
  // before any aboveEditor widgets when leadingSpacer=true, producing a blank
  // line between the spinner and the todo overlay. We patch it to skip that
  // spacer so the todos sit flush against the spinner.
  if (
    InteractiveMode &&
    InteractiveMode.prototype.renderWidgetContainer &&
    !(InteractiveMode.prototype.renderWidgetContainer as any).__compactui_patched
  ) {
    const originalRenderWidgetContainer = InteractiveMode.prototype.renderWidgetContainer;
    InteractiveMode.prototype.renderWidgetContainer = function (
      container: any,
      widgets: any,
      spacerWhenEmpty: boolean,
      leadingSpacer: boolean,
    ) {
      // Suppress the leading spacer — it creates a blank gap between the
      // spinner/working-message and the aboveEditor widget (e.g. todos).
      return originalRenderWidgetContainer.call(this, container, widgets, spacerWhenEmpty, false);
    };
    (InteractiveMode.prototype.renderWidgetContainer as any).__compactui_patched = true;
  }

  // ── Initialize UI Features ──────────────────────────────────────────
  initAssistantFooter(pi);
  initPromptUi();
  initHideThinking(pi);
  initToolStatusDot();
}
