import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export default function (pi: ExtensionAPI) {
	// Self-register in global feature registry
	(globalThis as any).__pi_extension_features?.push({
		name: "agentzero",
		description: "Adds /init to create AGENTS.md, and injects ~/.pi/AGENTS.md into the system prompt",
		commands: ["/init"],
		tools: [],
		shortcuts: [],
	});

	pi.registerCommand("init", {
		description: "Initialize the directory with an AGENTS.md file",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const cwd = ctx.cwd || process.cwd();
			const agentsPath = path.join(cwd, "AGENTS.md");
			
			if (fs.existsSync(agentsPath)) {
				if (ctx.hasUI) {
					ctx.ui.notify("AGENTS.md already exists in the current directory", "error");
				} else {
					console.log("AGENTS.md already exists in the current directory");
				}
				return;
			}
			
			const content = `# Project Agents Info\n\nThis directory has been initialized with \`/init\`.\nAdd project-specific agent rules and instructions here.\n`;
			try {
				fs.writeFileSync(agentsPath, content, "utf-8");
				if (ctx.hasUI) {
					ctx.ui.notify("Created AGENTS.md in the current directory", "success");
				} else {
					console.log("Created AGENTS.md in the current directory");
				}
			} catch (e: any) {
				if (ctx.hasUI) {
					ctx.ui.notify(`Failed to create AGENTS.md: ${e.message}`, "error");
				} else {
					console.error(`Failed to create AGENTS.md: ${e.message}`);
				}
			}
		},
	});

	// We use setImmediate or a similar approach to ensure it runs late in the chain if order isn't guaranteed,
	// but hooking into before_agent_start is standard. If the prompt extension also modifies systemPrompt,
	// they will be concatenated in the order they execute.
	pi.on("before_agent_start", async (_event) => {
		const globalAgentsPath = path.join(os.homedir(), ".pi", "AGENTS.md");
		let additionalPrompt = "";

		if (fs.existsSync(globalAgentsPath)) {
			try {
				const content = fs.readFileSync(globalAgentsPath, "utf-8").trim();
				if (content) {
					additionalPrompt = `\n\n## Global Agents Configuration\n\n${content}`;
				}
			} catch (e) {
				// Ignore read errors
			}
		}

		return {
			systemPrompt: _event.systemPrompt + additionalPrompt
		};
	});
}
