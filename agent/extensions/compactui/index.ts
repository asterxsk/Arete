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
import { Markdown, Text } from "@earendil-works/pi-tui";

import {
  line, noOp, orange, compactCall, compactSummary, compactFailed,
  formatDur, expandedBox, diffExpandedBox, captureResult, INDENT,
} from "./rendering.js";
import { patchTool, TRUNCATED_TOOLS, KNOWN_TOOLS, MAX_LINES } from "./patch-tools.js";
import { ThinkingBlock, colorThinkingText, italicText, initHideThinking } from "./thinking-block.js";
import { initAssistantFooter } from "./assistant-footer.js";
import { initPromptUi } from "./prompt-ui.js";
import { initToolStatusDot } from "./tool-status-dot.js";

// ── State ──────────────────────────────────────────────────────────────

let patchedAssistant = false;

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
        const originalAdd = InteractiveMode.prototype.addMessageToChat;
        InteractiveMode.prototype.addMessageToChat = function (message: any, options?: any) {
          // Add spacing before user message
          if (message.role === "user") {
            this.chatContainer.addChild(line(""));
          }

          const originalAddChild = this.chatContainer.addChild;
          this.chatContainer.addChild = function (child: any) {
            if (child && child.constructor && child.constructor.name === "Spacer") return;
            return originalAddChild.apply(this, arguments);
          };
          let result;
          try {
            result = originalAdd.call(this, message, options);
          } finally {
            this.chatContainer.addChild = originalAddChild;
          }
          return result;
        };
        (InteractiveMode.prototype.addMessageToChat as any).__compactui_patched = true;
      }

      // ── Patch AssistantMessageComponent.updateContent ────────────────
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
              this.contentContainer.addChild(
                new Markdown(content.text.trim(), 1, 0, this.markdownTheme)
              );
            }
          } else if (
            content.type === "thinking" &&
            content.thinking &&
            content.thinking.trim()
          ) {
            hasThinking = true;

            if (!content._clientStartTime) {
              content._clientStartTime = Date.now();
            }

            const hasVisibleContentAfter = message.content
              .slice(i + 1)
              .some(
                (c: any) =>
                  (c.type === "text" && c.text && c.text.trim()) ||
                  (c.type === "thinking" && c.thinking && c.thinking.trim()) ||
                  c.type === "toolCall"
              );

            const isThinkingDone = hasVisibleContentAfter || message.stopReason;

            if (isThinkingDone && !content._clientEndTime) {
              content._clientEndTime = Date.now();
            }

            if (isThinkingDone) {
              let durationS = 0;
              if (typeof content.durationMs === "number") {
                durationS = Math.round(content.durationMs / 1000);
              } else if (
                content._clientEndTime &&
                content._clientStartTime &&
                content._clientEndTime - content._clientStartTime > 100
              ) {
                content.durationMs =
                  content._clientEndTime - content._clientStartTime;
                durationS = Math.round(content.durationMs / 1000);
              } else if (content._clientStartTime) {
                const fallbackDuration =
                  Date.now() - content._clientStartTime;
                if (fallbackDuration > 100) {
                  content.durationMs = fallbackDuration;
                  durationS = Math.round(fallbackDuration / 1000);
                }
              }

              durationS = Math.max(0, durationS);
              this.hiddenThinkingLabel =
                durationS > 0
                  ? `\u2717 Thought for ${durationS}s`
                  : `\u2717 Thought`;
            } else {
              this.hiddenThinkingLabel = "\u2717  Thinking...";
            }

            if (this.hideThinkingBlock) {
              this.contentContainer.addChild(
                new Text(
                  italicText(colorThinkingText(this.hiddenThinkingLabel)),
                  1,
                  0
                )
              );
            } else {
              this.contentContainer.addChild(
                new ThinkingBlock(content.thinking.trim(), 1, 0, this.markdownTheme, {
                  color: colorThinkingText,
                  italic: true,
                })
              );
            }
          }
        }

        const hasToolCalls = message.content.some(
          (c: any) => c.type === "toolCall"
        );
        this.hasToolCalls = hasToolCalls;
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

      // ── Patch InteractiveMode.syncMessages ───────────────────────────
      if (
        InteractiveMode &&
        InteractiveMode.prototype.syncMessages &&
        !InteractiveMode.prototype.syncMessages.__compactui_patched
      ) {
        // Patch ToolExecutionComponent.render for lazy tool patching + spacer removal
        if (
          ToolExecutionComponent &&
          ToolExecutionComponent.prototype.render &&
          !ToolExecutionComponent.prototype.render.__compactui_patched
        ) {
          const originalRender = ToolExecutionComponent.prototype.render;
          ToolExecutionComponent.prototype.render = function () {
            let needsUpdate = false;
            if (
              this.toolDefinition &&
              typeof (globalThis as any).__pi_patchTool === "function"
            ) {
              if (!this.toolDefinition.__compactui_patched) {
                (globalThis as any).__pi_patchTool(this.toolDefinition);
                needsUpdate = true;
              }
            }
            if (
              this.builtInToolDefinition &&
              typeof (globalThis as any).__pi_patchTool === "function"
            ) {
              if (!this.builtInToolDefinition.__compactui_patched) {
                (globalThis as any).__pi_patchTool(this.builtInToolDefinition);
                needsUpdate = true;
              }
            }

            // Remove native Spacers at the top of tool components
            if (this.children && this.children.length > 0) {
              while (
                this.children.length > 0 &&
                this.children[0].constructor.name === "Spacer"
              ) {
                this.children.shift();
              }
              // Also remove native Spacers at the bottom
              while (
                this.children.length > 0 &&
                this.children[this.children.length - 1].constructor.name === "Spacer"
              ) {
                this.children.pop();
              }
            }

            if (needsUpdate && typeof this.updateDisplay === "function") {
              this.updateDisplay();
            }
            const lines = originalRender.apply(this, arguments);
            // Strip leading empty lines
            while (lines.length > 0 && typeof lines[0] === "string" && lines[0].replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "").trim() === "") {
              lines.shift();
            }
            // Strip trailing empty lines
            while (lines.length > 0 && typeof lines[lines.length - 1] === "string" && lines[lines.length - 1].replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "").trim() === "") {
              lines.pop();
            }
            
            return lines;
          };
          ToolExecutionComponent.prototype.render.__compactui_patched = true;
        }

        // Patch syncMessages to block native Spacers
        const originalSyncMessages = InteractiveMode.prototype.syncMessages;
        InteractiveMode.prototype.syncMessages = function () {
          const originalAddChild = this.chatContainer.addChild;
          this.chatContainer.addChild = function (child: any) {
            if (!child) return;
            if (child.constructor && child.constructor.name === "Spacer") return;
            
            // Also block components that just render as an empty string (like line(""))
            if (typeof child.render === "function") {
              try {
                const testRender = child.render(80);
                if (
                  Array.isArray(testRender) && 
                  testRender.length === 1 && 
                  typeof testRender[0] === "string" && 
                  testRender[0].replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "").trim() === ""
                ) {
                  return;
                }
              } catch (e) {}
            }
            
            return originalAddChild.apply(this, arguments);
          };

          let result;
          try {
            result = originalSyncMessages.apply(this, arguments);
          } finally {
            this.chatContainer.addChild = originalAddChild;
          }
          return result;
        };
        InteractiveMode.prototype.syncMessages.__compactui_patched = true;

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

            this.hideThinkingBlock = !this.hideThinkingBlock;
            if (
              this.settingsManager &&
              typeof this.settingsManager.setHideThinkingBlock === "function"
            ) {
              this.settingsManager.setHideThinkingBlock(this.hideThinkingBlock);
            }
            if (this.chatContainer) {
              this.chatContainer.clear();
            }
            if (typeof this.rebuildChatFromMessages === "function") {
              this.rebuildChatFromMessages();
            }
            if (
              this.streamingComponent &&
              this.streamingMessage &&
              this.chatContainer
            ) {
              if (
                typeof this.streamingComponent.setHideThinkingBlock ===
                "function"
              ) {
                this.streamingComponent.setHideThinkingBlock(
                  this.hideThinkingBlock
                );
              }
              if (
                typeof this.streamingComponent.updateContent === "function"
              ) {
                this.streamingComponent.updateContent(this.streamingMessage);
              }
              this.chatContainer.addChild(this.streamingComponent);
            }
            if (typeof this.showStatus === "function") {
              this.showStatus("Tools & Thinking toggled");
            }

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
          !InteractiveMode.prototype.toggleThinkingBlockVisibility
            .__compactui_patched
        ) {
          InteractiveMode.prototype.toggleThinkingBlockVisibility = function () {
            const scroll =
              this.chatContainer &&
              typeof this.chatContainer.getScroll === "function"
                ? this.chatContainer.getScroll()
                : undefined;

            if (typeof this.cycleThinkingLevel === "function") {
              this.cycleThinkingLevel();
            }

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
      return expandedBox(theme, "bash", cmd, lines, durationS, 50);
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
      return expandedBox(theme, "ls", context.args.path || ".", lines, durationS, 50);
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
      return expandedBox(theme, "grep", context.args.pattern ?? "?", lines, durationS, 50);
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
        50
      );
    },
  });

  // ── Initialize UI Features ──────────────────────────────────────────
  initAssistantFooter(pi);
  initPromptUi();
  initHideThinking(pi);
  initToolStatusDot();
}
