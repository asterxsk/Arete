import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/** Standard DOX sections in recommended order */
const DOX_SECTIONS = [
  "Purpose",
  "Ownership",
  "Local Contracts",
  "Work Guidance",
  "Verification",
  "Child DOX Index",
];

/** Detect project type from config files */
function detectProjectType(cwd: string): string[] {
  const types: string[] = [];
  if (fs.existsSync(path.join(cwd, "package.json"))) types.push("Node.js");
  if (fs.existsSync(path.join(cwd, "tsconfig.json"))) types.push("TypeScript");
  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) types.push("Rust");
  if (fs.existsSync(path.join(cwd, "go.mod"))) types.push("Go");
  if (fs.existsSync(path.join(cwd, "pyproject.toml")) || fs.existsSync(path.join(cwd, "setup.py"))) types.push("Python");
  if (fs.existsSync(path.join(cwd, "CMakeLists.txt"))) types.push("C++");
  return types;
}

/** Find subdirectories that contain their own AGENTS.md */
function findChildAgentsDocs(cwd: string, maxDepth = 3): string[] {
  const children: string[] = [];
  function scan(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
      const sub = path.join(dir, e.name);
      const rel = path.relative(cwd, sub);
      if (fs.existsSync(path.join(sub, "AGENTS.md"))) {
        children.push(rel);
      }
      scan(sub, depth + 1);
    }
  }
  scan(cwd, 0);
  return children;
}

/** Parse which DOX sections are present in the content */
function parseSections(content: string): Map<string, { line: number; text: string }> {
  const sections = new Map<string, { line: number; text: string }>();
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^##\s+(.+)/);
    if (match) {
      const name = match[1].trim();
      sections.set(name, { line: i, text: lines[i] });
    }
  }
  return sections;
}

/** Check if a section has meaningful content (not just a placeholder) */
function sectionHasContent(content: string, sectionName: string): boolean {
  const lines = content.split("\n");
  let inSection = false;
  let contentLines = 0;
  for (const line of lines) {
    const match = line.match(/^##\s+(.+)/);
    if (match) {
      if (inSection) break; // hit next section
      if (match[1].trim() === sectionName) inSection = true;
      continue;
    }
    if (inSection && line.trim() && !line.startsWith("## ")) {
      contentLines++;
    }
  }
  return contentLines > 0;
}

/** Check for common project artifacts */
function findProjectArtifacts(cwd: string): { name: string; exists: boolean }[] {
  const artifacts = [
    "src", "lib", "test", "tests", "spec", "__tests__",
    "dist", "build", "out",
    "README.md", "LICENSE", "CHANGELOG.md",
    ".gitignore", ".env.example",
    "Makefile", "Dockerfile", "docker-compose.yml",
    ".github", ".vscode",
  ];
  return artifacts.map(name => ({
    name,
    exists: fs.existsSync(path.join(cwd, name)),
  }));
}

interface AnalysisResult {
  missingSections: string[];
  emptySections: string[];
  missingArtifacts: string[];
  childDocs: string[];
  projectTypes: string[];
  suggestions: string[];
}

/** Analyze the existing AGENTS.md against project state */
function analyzeAgentsMd(cwd: string): AnalysisResult {
  const agentsPath = path.join(cwd, "AGENTS.md");
  const content = fs.readFileSync(agentsPath, "utf-8");
  const sections = parseSections(content);
  const projectTypes = detectProjectType(cwd);
  const artifacts = findProjectArtifacts(cwd);
  const childDocs = findChildAgentsDocs(cwd);

  const missingSections: string[] = [];
  const emptySections: string[] = [];
  const missingArtifacts: string[] = [];
  const suggestions: string[] = [];

  // Check for missing DOX sections
  for (const section of DOX_SECTIONS) {
    if (!sections.has(section)) {
      missingSections.push(section);
    } else if (!sectionHasContent(content, section)) {
      emptySections.push(section);
    }
  }

  // Check if documented artifacts exist
  for (const a of artifacts) {
    if (a.exists && !content.includes(a.name)) {
      missingArtifacts.push(a.name);
    }
  }

  // Generate suggestions
  if (missingSections.length > 0) {
    suggestions.push(
      `Missing standard DOX sections: ${missingSections.join(", ")}`
    );
  }
  if (emptySections.length > 0) {
    suggestions.push(
      `Sections with no content: ${emptySections.join(", ")} — add meaningful details or remove placeholders`
    );
  }
  if (missingArtifacts.length > 0) {
    suggestions.push(
      `Project has directories/files not mentioned: ${missingArtifacts.join(", ")}`
    );
  }
  if (childDocs.length > 0) {
    const indexSection = sections.get("Child DOX Index");
    const indexText = indexSection ? content.substring(
      content.indexOf(indexSection.text),
      content.indexOf("## ", content.indexOf(indexSection.text) + 1) !== -1
        ? content.indexOf("## ", content.indexOf(indexSection.text) + 1)
        : content.length
    ) : "";

    for (const child of childDocs) {
      if (!indexText.includes(child)) {
        suggestions.push(`Subdirectory '${child}' has AGENTS.md but is not listed in Child DOX Index`);
      }
    }
  }
  if (projectTypes.length > 0) {
    const hasProjectType = projectTypes.some(t => content.includes(t));
    if (!hasProjectType && !content.toLowerCase().includes("project type")) {
      suggestions.push(`Project type detected (${projectTypes.join(", ")}) but not documented`);
    }
  }

  // Check for stale references
  const fileRefs = content.match(/`[^`]+\.[a-z]{1,5}`/g) || [];
  for (const ref of fileRefs) {
    const clean = ref.replace(/`/g, "");
    if (!clean.includes("/") && !clean.includes("\\")) {
      // Simple filename reference — check if it exists
      if (!fs.existsSync(path.join(cwd, clean)) && !clean.includes("AGENTS.md")) {
        // Don't flag this too aggressively
      }
    }
  }

  return {
    missingSections,
    emptySections,
    missingArtifacts,
    childDocs,
    projectTypes,
    suggestions,
  };
}

/** Build a summary string for display */
function formatAnalysis(result: AnalysisResult): string {
  const lines: string[] = [];

  if (result.suggestions.length === 0) {
    lines.push("AGENTS.md is well-structured. No meaningful changes needed.");
    return lines.join("\n");
  }

  lines.push("AGENTS.md Analysis — found opportunities for improvement:");
  lines.push("");

  if (result.missingSections.length > 0) {
    lines.push(`  Missing sections: ${result.missingSections.join(", ")}`);
  }
  if (result.emptySections.length > 0) {
    lines.push(`  Empty sections: ${result.emptySections.join(", ")}`);
  }
  if (result.missingArtifacts.length > 0) {
    lines.push(`  Undocumented artifacts: ${result.missingArtifacts.join(", ")}`);
  }
  if (result.childDocs.length > 0) {
    const unlisted = result.suggestions
      .filter(s => s.includes("Child DOX Index"))
      .map(s => s.match(/'([^']+)'/)?.[1])
      .filter(Boolean);
    if (unlisted.length > 0) {
      lines.push(`  Unlisted child docs: ${unlisted.join(", ")}`);
    }
  }
  if (result.projectTypes.length > 0) {
    const hasType = result.projectTypes.some(t =>
      result.suggestions.some(s => !s.includes("not documented") || !s.includes(t))
    );
    if (result.suggestions.some(s => s.includes("not documented"))) {
      lines.push(`  Project type: ${result.projectTypes.join(", ")} (undocumented)`);
    }
  }

  lines.push("");
  lines.push("The agent should review and apply these improvements.");

  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	// Self-register in global feature registry
	(globalThis as any).__pi_extension_features?.push({
		name: "agentzero",
		description: "Adds /init to create or audit AGENTS.md (checks DOX sections, child docs, project artifacts), and injects ~/.pi/AGENTS.md into the system prompt",
		commands: ["/init"],
		tools: [],
		shortcuts: [],
	});

	pi.registerCommand("init", {
		description: "Initialize or audit AGENTS.md in the current directory",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const cwd = ctx.cwd || process.cwd();
			const agentsPath = path.join(cwd, "AGENTS.md");
			
			if (!fs.existsSync(agentsPath)) {
				// Create new AGENTS.md with DOX-standard structure
				const projectTypes = detectProjectType(cwd);
				const typeNote = projectTypes.length > 0
					? ` Detected project type: ${projectTypes.join(", ")}.`
					: "";
				const content = `# Project Agents Info

## Purpose

<!-- Describe what this project does and its core goals -->${typeNote}

## Ownership

<!-- Who maintains what -->

## Local Contracts

<!-- Key invariants, APIs, data formats, or rules specific to this project -->

## Work Guidance

<!-- Development workflow, coding standards, build/test commands -->

## Verification

<!-- How to verify changes work: test commands, lint, type-check -->

## Child DOX Index

<!-- List subdirectories with their own AGENTS.md, or write 'None' -->
None
`;
				try {
					fs.writeFileSync(agentsPath, content, "utf-8");
					if (ctx.hasUI) {
						ctx.ui.notify(`Created AGENTS.md in ${cwd}`, "success");
					} else {
						console.log(`Created AGENTS.md in ${cwd}`);
					}
				} catch (e: any) {
					if (ctx.hasUI) {
						ctx.ui.notify(`Failed to create AGENTS.md: ${e.message}`, "error");
					} else {
						console.error(`Failed to create AGENTS.md: ${e.message}`);
					}
				}
				return;
			}
			
			// AGENTS.md exists — analyze and report
			const result = analyzeAgentsMd(cwd);
			const report = formatAnalysis(result);
			
			if (ctx.hasUI) {
				if (result.suggestions.length === 0) {
					ctx.ui.notify("AGENTS.md is well-structured. No changes needed.", "success");
				} else {
					ctx.ui.notify(
						`Found ${result.suggestions.length} improvement(s) in AGENTS.md. Review the analysis below.`,
						"info"
					);
				}
			}
			
			// Output full analysis for the agent to act on
			console.log(report);
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
