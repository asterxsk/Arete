import { Container, Markdown, Spacer, Text, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function colorThinkingText(text: string): string {
    return `\x1b[38;2;112;112;128m${text}\x1b[39m`;
}

function italicText(text: string): string {
    return `\x1b[3m${text}\x1b[23m`;
}

interface ThinkingBlockOptions {
    color?: (text: string) => string;
    italic?: boolean;
}

class ThinkingBlock extends Container {
    private text: string;
    private paddingX: number;
    private paddingY: number;
    private markdownTheme: any;
    private options: ThinkingBlockOptions;

    constructor(text: string, paddingX = 0, paddingY = 0, markdownTheme: any = undefined, options: ThinkingBlockOptions = {}) {
        super();
        this.text = text;
        this.paddingX = paddingX;
        this.paddingY = paddingY;
        this.markdownTheme = markdownTheme;
        this.options = options;
    }

    render(width: number): string[] {
        if (!this.text || this.text.trim() === "") {
            return [];
        }
        
        const contentWidth = Math.max(1, width - this.paddingX * 2 - 2);
        const leftPad = " ".repeat(this.paddingX);
        const textLines = this.text.split("\n");
        
        const visualLines: { text: string; isEmpty: boolean }[] = [];
        for (const line of textLines) {
            if (line.trim() === "") {
                visualLines.push({ text: "", isEmpty: true });
                continue;
            }
            const wrappedLines = wrapTextWithAnsi(line, contentWidth);
            for (const wrappedLine of wrappedLines) {
                visualLines.push({ text: wrappedLine, isEmpty: false });
            }
        }
        if (visualLines.length === 0) return [];
        
        const result: string[] = [];
        const lastNonEmptyIdx = visualLines.reduce((acc, line, i) => line.isEmpty ? acc : i, 0);
        const isSingleLine = visualLines.filter(l => !l.isEmpty).length <= 1;

        for (let i = 0; i < visualLines.length; i++) {
            const vl = visualLines[i];
            if (vl.isEmpty) {
                result.push(leftPad + colorThinkingText("│"));
                continue;
            }
            let prefix: string;
            if (isSingleLine) {
                prefix = "└ ";
            }
            else if (i === 0) {
                prefix = "│ ";
            }
            else if (i === lastNonEmptyIdx) {
                prefix = "└ ";
            }
            else {
                prefix = "│ ";
            }
            result.push(leftPad + colorThinkingText(prefix) + this.applyStyle(vl.text));
        }
        return result;
    }

    private applyStyle(text: string): string {
        if (!this.options) return text;
        let styled = text;
        if (this.options.color) {
            styled = this.options.color(styled);
        }
        if (this.options.italic) {
            styled = italicText(styled);
        }
        return styled;
    }
}

let patched = false;

export default function(pi: ExtensionAPI) {
    if (patched) return;
    
    try {
        AssistantMessageComponent.prototype.updateContent = function(message: any) {
            this.lastMessage = message;
            this.contentContainer.clear();
            const hasVisibleContent = message.content.some((c: any) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));
            
            for (let i = 0; i < message.content.length; i++) {
                const content = message.content[i];
                if (content.type === "text" && content.text.trim()) {
                    this.contentContainer.addChild(new Markdown(content.text.trim(), 1, 0, this.markdownTheme));
                }
                else if (content.type === "thinking" && content.thinking.trim()) {
                    const hasVisibleContentAfter = message.content
                        .slice(i + 1)
                        .some((c: any) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));
                    
                    if (this.hideThinkingBlock) {
                        this.contentContainer.addChild(new Text(italicText(colorThinkingText(this.hiddenThinkingLabel)), 1, 0));
                        if (hasVisibleContentAfter) {
                            this.contentContainer.addChild(new Spacer(1));
                        }
                    }
                    else {
                        this.contentContainer.addChild(new ThinkingBlock(content.thinking.trim(), 1, 0, this.markdownTheme, {
                            color: colorThinkingText,
                            italic: true,
                        }));
                        if (hasVisibleContentAfter) {
                            this.contentContainer.addChild(new Spacer(1));
                        }
                    }
                }
            }
            
            const hasToolCalls = message.content.some((c: any) => c.type === "toolCall");
            this.hasToolCalls = hasToolCalls;
            if (!hasToolCalls) {
                if (message.stopReason === "aborted") {
                    const abortMessage = message.errorMessage && message.errorMessage !== "Request was aborted"
                        ? message.errorMessage
                        : "Operation aborted";
                    if (hasVisibleContent) {
                        this.contentContainer.addChild(new Spacer(1));
                    }
                    else {
                        this.contentContainer.addChild(new Spacer(1));
                    }
                    this.contentContainer.addChild(new Text(`\x1b[38;2;255;85;85m${abortMessage}\x1b[39m`, 1, 0));
                }
                else if (message.stopReason === "error") {
                    const errorMsg = message.errorMessage || "Unknown error";
                    this.contentContainer.addChild(new Spacer(1));
                    this.contentContainer.addChild(new Text(`\x1b[38;2;255;85;85mError: ${errorMsg}\x1b[39m`, 1, 0));
                }
            }
        };
        patched = true;
    } catch (e) {
        console.error("Failed to patch AssistantMessageComponent for thinking-ui extension:", e);
    }
}
