import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const instructions = readFileSync(join(__dirname, "prompt.md"), "utf-8").trim();

export default function (pi: ExtensionAPI) {
  (globalThis as any).__pi_extension_features?.push({
    name: "instruct",
    description: "Custom system instructions loaded from prompt.md",
    commands: ["/instructions"],
    tools: [],
    shortcuts: [],
  });

  pi.on("before_agent_start", async (_event) => {
    return {
      systemPrompt:
        _event.systemPrompt +
        `\n\n## Custom Instructions\n${instructions}`
    };
  });

  pi.registerCommand("instructions", {
    description: "Open prompt.md in your default editor",
    handler: (_args, ctx) => {
      const promptPath = join(__dirname, "prompt.md");
      exec(`start "" "${promptPath}"`);
      ctx.ui.notify(`Opened ${promptPath}`);
    },
  });
}
