import { spawn } from "node:child_process";
import { StringEnum } from "@mariozechner/pi-ai";
import {
  type AgentToolResult,
  type ExtensionAPI,
  getAgentDir,
  getMarkdownTheme,
  parseFrontmatter,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text, type Component, type TUI } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { matchesKey, Key } from "@mariozechner/pi-tui";


import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Message } from "@mariozechner/pi-ai";

/**
 * Subagent Extension for Pi
 *
 * Delegates tasks to specialized sub-agents by spawning child `pi` processes.
 *
 * Execution modes:
 *   - Single:   { agent, task }
 *   - Parallel: { tasks: [{ agent, task }, ...] }
 *   - Chain:    { chain: [{ agent, task }, ...] }  — supports {previous} placeholder
 *
 * Context modes:
 *   - spawn (default): child gets only "Task: ..." — fresh isolated context
 *   - fork: child gets a snapshot of the current session messages + task
 *
 * Agent definitions: Markdown files with YAML frontmatter
 *   ~/.pi/agent/agents/*.md   (user/global)
 *   .pi/agents/*.md           (project-local, walks up from cwd)
 *
 * Safety guards (via env vars propagated to child processes):
 *   PI_SUBAGENT_DEPTH        — current nesting depth (starts at 0)
 *   PI_SUBAGENT_MAX_DEPTH    — max allowed depth (default: 3)
 *   PI_SUBAGENT_STACK        — JSON array of ancestor agent names (cycle detection)
 */

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MAX_PARALLEL_TASKS = 10;
const MAX_CONCURRENCY = 10;
const COLLAPSED_ITEM_COUNT = 5;
const DEFAULT_MAX_DEPTH = 3;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface AgentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  thinking?: string;
  systemPrompt: string;
  source: "user" | "project";
  filePath: string;
}

type AgentScope = "user" | "project" | "both";
type ContextMode = "spawn" | "fork";
type ExecMode = "single" | "parallel" | "chain";

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

interface SingleResult {
  agent: string;
  agentSource: "user" | "project" | "unknown";
  task: string;
  contextMode: ContextMode;
  exitCode: number; // -1 = still running
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  step?: number;
}

interface SubagentDetails {
  execMode: ExecMode;
  agentScope: AgentScope;
  projectAgentsDir: string | null;
  results: SingleResult[];
}

interface AgentDiscoveryResult {
  agents: AgentConfig[];
  projectAgentsDir: string | null;
}

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, unknown> }
  | { type: "thinking"; text: string };

// ─────────────────────────────────────────────
// Agent Discovery
// ─────────────────────────────────────────────

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
  if (!fs.existsSync(dir)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const agents: AgentConfig[] = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
    if (!frontmatter.name || !frontmatter.description) continue;

    const tools = frontmatter.tools
      ?.split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      model: frontmatter.model,
      thinking: frontmatter.thinking,
      systemPrompt: body,
      source,
      filePath,
    });
  }
  return agents;
}

function findNearestProjectAgentsDir(cwd: string): string | null {
  let current = cwd;
  while (true) {
    const candidate = path.join(current, ".pi", "agents");
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch { /* not found */ }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
  const userDir = path.join(getAgentDir(), "agents");
  const projectAgentsDir = findNearestProjectAgentsDir(cwd);

  const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
  const projectAgents =
    scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

  const agentMap = new Map<string, AgentConfig>();
  if (scope !== "project") for (const a of userAgents) agentMap.set(a.name, a);
  if (scope !== "user") for (const a of projectAgents) agentMap.set(a.name, a); // project wins

  return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") return part.text;
      }
    }
  }
  return "";
}

function getDisplayItems(messages: Message[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant") {
      for (const part of msg.content as any[]) {
        if (part.type === "thinking") items.push({ type: "thinking", text: part.thinking || part.text || "" });
        else if (part.type === "text") items.push({ type: "text", text: part.text });
        else if (part.type === "toolCall")
          items.push({ type: "toolCall", name: part.name, args: part.arguments || part.args || {} });
      }
    }
  }
  return items;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatUsageStats(u: UsageStats, model?: string): string {
  const parts: string[] = [];
  if (u.turns) parts.push(`${u.turns} turn${u.turns > 1 ? "s" : ""}`);
  if (u.input) parts.push(`↑${formatTokens(u.input)}`);
  if (u.output) parts.push(`↓${formatTokens(u.output)}`);
  if (u.contextTokens) {
    const maxCtx = 128000; // Common max for many models, just for visual bar
    const ratio = Math.min(1, u.contextTokens / maxCtx);
    const bars = 10;
    const filled = Math.round(ratio * bars);
    const barStr = `[${"█".repeat(filled)}${"░".repeat(bars - filled)}]`;
    parts.push(`context:${barStr}${formatTokens(u.contextTokens)}`);
  }
  if (model) {
    const [p, id] = model.split("/");
    parts.push(id ? `${id} (${p})` : model);
  }
  return parts.join(" ").toLowerCase();
}

function aggregateUsage(results: SingleResult[]): UsageStats {
  return results.reduce(
    (acc, r) => ({
      input: acc.input + r.usage.input,
      output: acc.output + r.usage.output,
      cacheRead: acc.cacheRead + r.usage.cacheRead,
      cacheWrite: acc.cacheWrite + r.usage.cacheWrite,
      cost: acc.cost + r.usage.cost,
      contextTokens: acc.contextTokens + r.usage.contextTokens,
      turns: acc.turns + r.usage.turns,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
  );
}

function formatToolCall(
  toolName: string,
  args: Record<string, unknown>,
  fg: (color: string, text: string) => string,
): string {
  const shortenPath = (p: string) => {
    const home = os.homedir();
    return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
  };
  switch (toolName) {
    case "bash": {
      const cmd = (args.command as string) || "...";
      const preview = cmd.length > 60 ? `${cmd.slice(0, 60)}...` : cmd;
      return fg("muted", "bash (") + fg("toolOutput", preview) + fg("muted", ")");
    }
    case "read": {
      const p = shortenPath((args.file_path || args.path || "...") as string);
      return fg("muted", "read (") + fg("accent", p) + fg("muted", ")");
    }
    case "write":
      return (
        fg("muted", "write (") +
        fg("accent", shortenPath((args.file_path || args.path || "...") as string)) +
        fg("muted", ")")
      );
    case "edit":
      return (
        fg("muted", "edit (") +
        fg("accent", shortenPath((args.file_path || args.path || "...") as string)) +
        fg("muted", ")")
      );
    default: {
      const s = JSON.stringify(args);
      return fg("accent", toolName) + fg("dim", ` (${s.length > 50 ? `${s.slice(0, 50)}...` : s})`);
    }
  }
}

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(
    new Array(limit).fill(null).map(async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

// ─────────────────────────────────────────────
// Child Process Runner
// ─────────────────────────────────────────────

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const script = process.argv[1];
  const isBunVirtual = script?.startsWith("/$bunfs/root/");
  if (script && !isBunVirtual && fs.existsSync(script)) {
    return { command: process.execPath, args: [script, ...args] };
  }
  const execName = path.basename(process.execPath).toLowerCase();
  if (/^(node|bun)(\.exe)?$/.test(execName)) return { command: "pi", args };
  return { command: process.execPath, args };
}

async function writeToTempFile(name: string, content: string): Promise<{ dir: string; filePath: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
  const safeName = name.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `${safeName}.md`);
  await withFileMutationQueue(filePath, () =>
    fs.promises.writeFile(filePath, content, { encoding: "utf-8", mode: 0o600 }),
  );
  return { dir: tmpDir, filePath };
}

function cleanupTemp(filePath: string | null, dir: string | null) {
  if (filePath) try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  if (dir) try { fs.rmdirSync(dir); } catch { /* ignore */ }
}

const activeSubagents: SingleResult[] = [];

async function runSingleAgent(
  defaultCwd: string,
  agents: AgentConfig[],
  agentName: string,
  task: string,
  contextMode: ContextMode,
  parentMessages: Message[],
  parentModel: string | undefined,
  cwd: string | undefined,
  step: number | undefined,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => SubagentDetails,
): Promise<SingleResult> {
  // ── Depth guard ──────────────────────────────
  const currentDepth = parseInt(process.env.PI_SUBAGENT_DEPTH ?? "0", 10);
  const maxDepth = parseInt(process.env.PI_SUBAGENT_MAX_DEPTH ?? String(DEFAULT_MAX_DEPTH), 10);
  const stack: string[] = JSON.parse(process.env.PI_SUBAGENT_STACK ?? "[]");

  if (currentDepth >= maxDepth) {
    return makeErrorResult(agentName, "unknown", task, contextMode, step,
      `Max subagent depth (${maxDepth}) reached. Cannot delegate further.`);
  }
  if (stack.includes(agentName)) {
    return makeErrorResult(agentName, "unknown", task, contextMode, step,
      `Cycle detected: ${[...stack, agentName].join(" → ")}`);
  }

  const agent = agents.find((a) => a.name === agentName);
  if (!agent) {
    const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
    return makeErrorResult(agentName, "unknown", task, contextMode, step,
      `Unknown agent "${agentName}". Available: ${available}`);
  }

  // ── Resolve model: frontmatter wins, otherwise inherit parent's model ───
  // agent.model may be a bare id ("claude-haiku-4-5") or provider-prefixed
  // ("anthropic/claude-haiku-4-5"). parentModel is always provider/id.
  const resolvedModel: string | undefined = agent.model ?? parentModel;

  // ── Build pi args ────────────────────────────
  const piArgs: string[] = ["--mode", "json", "-p", "--no-session"];
  if (resolvedModel) {
    const modelStr = agent.thinking ? `${resolvedModel}:${agent.thinking}` : resolvedModel;
    piArgs.push("--model", modelStr);
  } else if (agent.thinking) {
    piArgs.push("--thinking", agent.thinking);
  }
  if (agent.tools && agent.tools.length > 0) piArgs.push("--tools", agent.tools.join(","));

  // ── Temp files ───────────────────────────────
  let promptTmp: { dir: string; filePath: string } | null = null;
  let forkSessionTmp: { dir: string; filePath: string } | null = null;

  const result: SingleResult = {
    agent: agentName,
    agentSource: agent.source,
    task,
    contextMode,
    exitCode: -1,
    messages: [],
    stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
    model: resolvedModel,
    step,
  };

  activeSubagents.push(result);
  if (activeSubagents.length > 20) activeSubagents.shift();

  const store = getGlobalSubagentStore();
  const record = store.start({ agentName, task, cwd: cwd ?? defaultCwd });

  const emitUpdate = () => {
    onUpdate?.({
      content: [{ type: "text", text: getFinalOutput(result.messages) || "(running...)" }],
      details: makeDetails([result]),
    });
  };

  try {
    // Append agent system prompt
    if (agent.systemPrompt.trim()) {
      promptTmp = await writeToTempFile(`prompt-${agentName}`, agent.systemPrompt);
      piArgs.push("--append-system-prompt", promptTmp.filePath);
    }

    // Fork mode: write parent messages to a temp session file and pass --session
    if (contextMode === "fork" && parentMessages.length > 0) {
      const header = JSON.stringify({ type: "header", version: 1, cwd: defaultCwd }) + "\n";
      const entries = parentMessages
        .map((msg) => JSON.stringify({ type: "message", id: crypto.randomUUID(), parentId: null, message: msg }))
        .join("\n");
      forkSessionTmp = await writeToTempFile(`fork-session-${agentName}`, header + entries);
      piArgs.push("--session", forkSessionTmp.filePath);
    }

    piArgs.push(`Task: ${task}`);

    // ── Spawn child ──────────────────────────────
    const childEnv = {
      ...process.env,
      PI_SUBAGENT_DEPTH: String(currentDepth + 1),
      PI_SUBAGENT_MAX_DEPTH: String(maxDepth),
      PI_SUBAGENT_STACK: JSON.stringify([...stack, agentName]),
    };

    let wasAborted = false;
    const exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(piArgs);
      const proc = spawn(invocation.command, invocation.args, {
        cwd: cwd ?? defaultCwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: childEnv,
      });

      let buffer = "";
      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: Record<string, unknown>;
        try { event = JSON.parse(line); } catch { return; }

        if (event.type === "message_end" && event.message) {
          const msg = event.message as Message;
          result.messages.push(msg);
          if (msg.role === "assistant") {
            const text = getFinalOutput([msg]);
            if (text) {
              store.appendTranscript(record.id, { role: "assistant", text });
            }

            result.usage.turns++;
            const u = msg.usage as Record<string, number> | undefined;
            if (u) {
              result.usage.input += u.input ?? 0;
              result.usage.output += u.output ?? 0;
              result.usage.cacheRead += u.cacheRead ?? 0;
              result.usage.cacheWrite += u.cacheWrite ?? 0;
              result.usage.cost += (u as Record<string, Record<string, number>>).cost?.total ?? 0;
              result.usage.contextTokens = u.totalTokens ?? 0;
            }
            if (!result.model && msg.model) result.model = msg.model as string;
            if (msg.stopReason) result.stopReason = msg.stopReason as string;
            if (msg.errorMessage) result.errorMessage = msg.errorMessage as string;
          }
          emitUpdate();
        }

        if (event.type === "tool_result_end" && event.message) {
          const msg = event.message as Message;
          result.messages.push(msg);
          const toolResult = msg.content.find(c => c.type === "toolResult") as any;
          if (toolResult) {
            store.appendTranscript(record.id, { role: "tool", text: `result: ${toolResult.toolName}` });
          }
          emitUpdate();
        }
      };

      proc.stdout.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data: Buffer) => { result.stderr += data.toString(); });

      proc.on("close", (code: number | null) => {
        if (buffer.trim()) processLine(buffer);
        resolve(code ?? 0);
      });

      proc.on("error", () => resolve(1));

      if (signal) {
        const kill = () => {
          wasAborted = true;
          proc.kill("SIGTERM");
          setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 5000);
        };
        if (signal.aborted) kill();
        else signal.addEventListener("abort", kill, { once: true });
      }
    });

    result.exitCode = exitCode;
    store.markFinished(record.id, {
      status: wasAborted ? "terminated" : result.errorMessage ? "failed" : exitCode === 0 ? "done" : "failed",
      exitCode,
      output: getFinalOutput(result.messages),
    });

    if (wasAborted) throw new Error("Subagent aborted");
    return result;
  } finally {
    cleanupTemp(promptTmp?.filePath ?? null, promptTmp?.dir ?? null);
    cleanupTemp(forkSessionTmp?.filePath ?? null, forkSessionTmp?.dir ?? null);
  }
}

function makeErrorResult(
  agent: string,
  agentSource: "user" | "project" | "unknown",
  task: string,
  contextMode: ContextMode,
  step: number | undefined,
  errorMsg: string,
): SingleResult {
  return {
    agent,
    agentSource,
    task,
    contextMode,
    exitCode: 1,
    messages: [],
    stderr: errorMsg,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
    step,
  };
}

// ─────────────────────────────────────────────
// TUI Rendering
// ─────────────────────────────────────────────

function renderDisplayItems(
  items: DisplayItem[],
  theme: { fg: (color: string, text: string) => string },
  limit?: number,
): string {
  const toShow = limit ? items.slice(-limit) : items;
  const skipped = limit && items.length > limit ? items.length - limit : 0;
  let text = skipped > 0 ? theme.fg("muted", `... ${skipped} earlier items\n`) : "";
  for (const item of toShow) {
    if (item.type === "thinking") {
      const s = item.text;
      const preview = s.length > 50 ? s.slice(0, 50).replace(/\n/g, " ") + "..." : s.replace(/\n/g, " ");
      text += `${theme.fg("muted", "thinking: ")}${theme.fg("dim", preview)}\n`;
    } else if (item.type === "text") {
      const preview = item.text.split("\n").slice(0, 3).join("\n");
      text += `${theme.fg("toolOutput", preview)}\n`;
    } else {
      text += `${theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme))}\n`;
    }
  }
  return text.trimEnd();
}

function buildSingleResultView(
  r: SingleResult,
  expanded: boolean,
  theme: { fg: (c: string, t: string) => string; bold: (t: string) => string },
): Text | Container {
  const isRunning = r.exitCode === -1;
  const isError = !isRunning && (r.exitCode !== 0 || r.stopReason === "error" || r.stopReason === "aborted");
  const dot = isRunning ? theme.fg("success", "●") : theme.fg("muted", "●");
  const displayItems = getDisplayItems(r.messages);
  const finalOutput = getFinalOutput(r.messages);
  const usageStr = formatUsageStats(r.usage, r.model);

  text += `\n     ${dot} ${theme.fg("toolTitle", theme.bold(r.agent))}` +
    `${theme.fg("muted", ` (${r.agentSource})`)}` +
    (r.contextMode === "fork" ? theme.fg("warning", " [fork]") : "");

  if (expanded) {
    const c = new Container();
    c.addChild(new Text(headerLine, 0, 0));
    if (isError && r.errorMessage)
      c.addChild(new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0));
    c.addChild(new Spacer(1));
    c.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
    c.addChild(new Text(theme.fg("dim", r.task), 0, 0));
    c.addChild(new Spacer(1));
    c.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
    if (!displayItems.length && !finalOutput) {
      c.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
    } else {
      for (const item of displayItems) {
        if (item.type === "thinking") {
          const s = item.text;
          const preview = s.length > 50 ? s.slice(0, 50).replace(/\n/g, " ") + "..." : s.replace(/\n/g, " ");
          c.addChild(new Text(`${theme.fg("muted", "thinking: ")}${theme.fg("dim", preview)}`, 0, 0));
        } else if (item.type === "toolCall") {
          c.addChild(new Text(theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0));
        }
      }
      if (finalOutput) {
        c.addChild(new Spacer(1));
        c.addChild(new Markdown(finalOutput.trim(), 0, 0, getMarkdownTheme()));
      }
    }
    if (usageStr) { c.addChild(new Spacer(1)); c.addChild(new Text(theme.fg("dim", usageStr), 0, 0)); }
    return c;
  }

  let summary = isRunning ? "Thinking..." : "Done";
  if (displayItems.length > 0) {
    const last = displayItems[displayItems.length - 1];
    if (last.type === "toolCall") {
      summary = formatToolCall(last.name, last.args, (c, t) => t).trim();
    } else if (last.type === "text") {
      summary = last.text.split("\n")[0].slice(0, 60);
    }
  }

  let text = `${theme.fg("toolTitle", theme.bold("symmachos"))}`;
  text += `\n     ${dot} ${theme.fg("accent", r.agent)} - ${theme.fg("dim", summary.toLowerCase())}`;

  if (isError && r.errorMessage) text += `\n     ✗ error: ${r.errorMessage.toLowerCase()}`;
  if (usageStr) text += `\n     ${theme.fg("muted", usageStr)}`;

  return new Text(text, 0, 0);
}

// ─────────────────────────────────────────────
// Tool Schema
// ─────────────────────────────────────────────

const TaskItem = Type.Object({
  agent: Type.String({ description: "Agent name" }),
  task: Type.String({ description: "Task to delegate" }),
  cwd: Type.Optional(Type.String({ description: "Working directory override" })),
});

const ChainItem = Type.Object({
  agent: Type.String({ description: "Agent name" }),
  task: Type.String({ description: "Task — use {previous} to reference prior output" }),
  cwd: Type.Optional(Type.String({ description: "Working directory override" })),
});

const SubagentParams = Type.Object({
  tasks: Type.Array(TaskItem, { description: "Tasks for sequential or parallel execution" }),
  parallel: Type.Optional(Type.Boolean({ description: "Run tasks in parallel if true (default: false)", default: false })),
  mode: Type.Optional(
    StringEnum(["spawn", "fork"] as const, {
      description: 'Context mode. "spawn" = fresh context (default), "fork" = inherit parent session',
      default: "spawn",
    }),
  ),
  agentScope: Type.Optional(
    StringEnum(["user", "project", "both"] as const, {
      description: 'Agent directory scope. Default: "user"',
      default: "user",
    }),
  ),
});

// ─────────────────────────────────────────────
// Extension Entry
// ─────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── Tool: subagent ─────────────────────────
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: [
      "Delegate tasks to specialized subagents with isolated context windows.",
      "Pass an array of tasks. Use {parallel: true} for parallel execution, otherwise they run sequentially (chain).",
      'In sequential mode, use {previous} in a task to reference the prior agent\'s output.',
      'context mode "spawn" (default) gives a fresh context; "fork" passes the current session history.',
      "Agents are defined as Markdown files in ~/.pi/agent/agents/ or .pi/agents/.",
    ].join(" "),
    parameters: SubagentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const agentScope: AgentScope = params.agentScope ?? "user";
      const contextMode: ContextMode = params.mode ?? "spawn";
      const { agents, projectAgentsDir } = discoverAgents(ctx.cwd, agentScope);

      const tasks = params.tasks;
      const isParallel = params.parallel ?? false;
      const execMode: ExecMode = isParallel ? "parallel" : "chain";

      const makeDetails =
        (em: ExecMode) =>
        (results: SingleResult[]): SubagentDetails => ({
          execMode: em,
          agentScope,
          projectAgentsDir,
          results,
        });

      if (!tasks || tasks.length === 0) {
        return {
          content: [{ type: "text", text: "Provide at least one task." }],
          details: makeDetails(execMode)([]),
        };
      }

      // Confirm project-scoped agents
      if ((agentScope === "project" || agentScope === "both") && ctx.hasUI) {
        const projectAgents = tasks
          .map((t) => agents.find((a) => a.name === t.agent))
          .filter((a): a is AgentConfig => a?.source === "project");

        if (projectAgents.length > 0) {
          const names = projectAgents.map((a) => a.name).join(", ");
          const dir = projectAgentsDir ?? "(unknown)";
          const ok = await ctx.ui.confirm(
            "Run project-local agents?",
            `Agents: ${names}\nSource: ${dir}\n\nProject agents are repo-controlled. Only continue for trusted repos.`,
          );
          if (!ok)
            return {
              content: [{ type: "text", text: "Cancelled: project-local agents not approved." }],
              details: makeDetails(execMode)([]),
            };
        }
      }

      // Get parent messages for fork mode
      const parentMessages: Message[] =
        contextMode === "fork"
          ? (ctx.sessionManager.getBranch().map((e) => (e as Record<string, unknown>).message).filter(Boolean) as Message[])
          : [];

      // Capture parent's current model as "provider/id" string so subagents
      // can inherit it when no model is specified in their frontmatter.
      const parentModel: string | undefined = ctx.model
        ? `${(ctx.model as any).provider}/${ctx.model.id}`
        : undefined;

      const runAgent = (
        agentName: string,
        task: string,
        agentCwd: string | undefined,
        step: number | undefined,
        updateCb: OnUpdateCallback | undefined,
        detailsFn: (results: SingleResult[]) => SubagentDetails,
      ) =>
        runSingleAgent(
          ctx.cwd,
          agents,
          agentName,
          task,
          contextMode,
          parentMessages,
          parentModel,
          agentCwd,
          step,
          signal,
          updateCb,
          detailsFn,
        );

      // ── Sequential (Chain) Mode ────────────────
      if (!isParallel) {
        const results: SingleResult[] = [];
        let previousOutput = "";

        for (let i = 0; i < tasks.length; i++) {
          const t = tasks[i];
          const taskWithCtx = t.task.replace(/\{previous\}/g, previousOutput);

          const result = await runAgent(
            t.agent,
            taskWithCtx,
            t.cwd,
            i + 1,
            onUpdate
              ? (partial) => {
                  const cur = partial.details?.results[0];
                  if (cur) onUpdate({ content: partial.content, details: makeDetails("chain")([...results, cur]) });
                }
              : undefined,
            makeDetails("chain"),
          );
          results.push(result);

          const isError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
          if (isError) {
            const msg = result.errorMessage || result.stderr || getFinalOutput(result.messages) || "(no output)";
            return {
              content: [{ type: "text", text: `Subagent ${t.agent} failed: ${msg}` }],
              details: makeDetails("chain")(results),
              isError: true,
            };
          }
          previousOutput = getFinalOutput(result.messages);
        }

        return {
          content: [{ type: "text", text: previousOutput || "(no output)" }],
          details: makeDetails("chain")(results),
        };
      }

      // ── Parallel mode ────────────────────────
      if (tasks.length > MAX_PARALLEL_TASKS)
        return {
          content: [{ type: "text", text: `Too many parallel tasks (${tasks.length}). Max is ${MAX_PARALLEL_TASKS}.` }],
          details: makeDetails("parallel")([]),
        };

      const allResults: SingleResult[] = tasks.map((t) => ({
        agent: t.agent,
        agentSource: "unknown" as const,
        task: t.task,
        contextMode,
        exitCode: -1,
        messages: [],
        stderr: "",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
      }));

      const emitParallelUpdate = () => {
        const running = allResults.filter((r) => r.exitCode === -1).length;
        const done = allResults.length - running;
        onUpdate?.({
          content: [{ type: "text", text: `Parallel: ${done}/${tasks.length} done, ${running} running...` }],
          details: makeDetails("parallel")([...allResults]),
        });
      };

      const results = await mapWithConcurrencyLimit(tasks, MAX_CONCURRENCY, async (t, idx) => {
        const result = await runAgent(
          t.agent,
          t.task,
          t.cwd,
          undefined,
          (partial) => {
            if (partial.details?.results[0]) { allResults[idx] = partial.details.results[0]; emitParallelUpdate(); }
          },
          makeDetails("parallel"),
        );
        allResults[idx] = result;
        emitParallelUpdate();
        return result;
      });

      const ok = results.filter((r) => r.exitCode === 0).length;
      return {
        content: [{ type: "text", text: `Parallel subagents finished: ${ok}/${results.length} succeeded.` }],
        details: makeDetails("parallel")(results),
      };
    },

    // ── renderCall ──────────────────────────────
    renderCall(args, theme) {
      const scope: AgentScope = args.agentScope ?? "user";
      const modeTag = args.mode === "fork" ? theme.fg("warning", " [fork]") : "";
      const tasks = (args.tasks as any[]) || [];
      const parallel = args.parallel ? "parallel" : "sequential";
      const isChain = !args.parallel && tasks.length > 1;
      const toolName = isChain ? "syndesmos" : "symmachos";

      let text =
        theme.fg("toolTitle", theme.bold(`${toolName} `)) +
        theme.fg("accent", `${parallel} (${tasks.length} tasks)`) +
        theme.fg("muted", ` [${scope}]`) +
        modeTag;

      for (const t of tasks.slice(0, 3)) {
        const preview = t.task.replace(/\{previous\}/g, "").trim();
        text += `\n  ${theme.fg("muted", "→")} ${theme.fg("accent", t.agent)}${theme.fg("dim", ` ${preview.slice(0, 40)}${preview.length > 40 ? "..." : ""}`)}`;
      }
      if (tasks.length > 3) text += `\n  ${theme.fg("muted", `... +${tasks.length - 3} more`)}`;
      return new Text(text, 0, 0);
    },

    // ── renderResult ────────────────────────────
    renderResult(result, { expanded }, theme) {
      const details = result.details as SubagentDetails | undefined;
      if (!details || details.results.length === 0) {
        const t = result.content[0];
        return new Text(t?.type === "text" ? t.text : "(no output)", 0, 0);
      }

      // Single
      if (details.execMode === "single" && details.results.length === 1) {
        return buildSingleResultView(details.results[0], expanded, theme);
      }

      // Chain
      if (details.execMode === "chain") {
        const ok = details.results.filter((r) => r.exitCode === 0).length;
        const allOk = ok === details.results.length;
        const running = details.results.some((r) => r.exitCode === -1);
        const icon = running ? theme.fg("success", "●") : (allOk ? theme.fg("muted", "●") : theme.fg("error", "●"));
        const toolName = details.results.length > 1 ? "syndesmos" : "symmachos";

        if (expanded) {
          const c = new Container();
          c.addChild(new Text(`${theme.fg("toolTitle", theme.bold(`${toolName} `))}${theme.fg("accent", `${ok}/${details.results.length} steps`)}`, 0, 0));
          for (const r of details.results) {
            const isRunning = r.exitCode === -1;
            const rIcon = isRunning ? theme.fg("success", "●") : (r.exitCode === 0 ? theme.fg("muted", "●") : theme.fg("error", "●"));
            const displayItems = getDisplayItems(r.messages);
            const finalOutput = getFinalOutput(r.messages);
            c.addChild(new Spacer(1));
            c.addChild(new Text(`${theme.fg("muted", `─── Step ${r.step}: `)}${theme.fg("accent", r.agent)} ${rIcon}`, 0, 0));
            c.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));
            for (const item of displayItems) {
              if (item.type === "thinking") {
                const s = item.text;
                const preview = s.length > 50 ? s.slice(0, 50).replace(/\n/g, " ") + "..." : s.replace(/\n/g, " ");
                c.addChild(new Text(`${theme.fg("muted", "thinking: ")}${theme.fg("dim", preview)}`, 0, 0));
              } else if (item.type === "toolCall") {
                c.addChild(new Text(theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0));
              }
            }
            if (finalOutput) { c.addChild(new Spacer(1)); c.addChild(new Markdown(finalOutput.trim(), 0, 0, getMarkdownTheme())); }
            const us = formatUsageStats(r.usage, r.model);
            if (us) c.addChild(new Text(theme.fg("dim", us), 0, 0));
          }
          const totalUs = formatUsageStats(aggregateUsage(details.results));
          if (totalUs) { c.addChild(new Spacer(1)); c.addChild(new Text(theme.fg("dim", `Total: ${totalUs}`), 0, 0)); }
          return c;
        }

        let text = `${theme.fg("toolTitle", theme.bold(toolName))}`;
        for (const r of details.results) {
          const isRunning = r.exitCode === -1;
          const rIcon = isRunning ? theme.fg("success", "●") : (r.exitCode === 0 ? theme.fg("muted", "●") : theme.fg("error", "●"));

          let summary = isRunning ? "thinking..." : "done";
          const displayItems = getDisplayItems(r.messages);
          if (displayItems.length > 0) {
            const last = displayItems[displayItems.length - 1];
            if (last.type === "toolCall") {
              summary = formatToolCall(last.name, last.args, (c, t) => t).trim();
            } else if (last.type === "text") {
              summary = last.text.trim().split("\n")[0].slice(0, 60);
            } else if (last.type === "thinking") {
              summary = last.text.trim().split("\n")[0].slice(0, 60);
            }
          }
          if (!summary) summary = isRunning ? "thinking..." : "done";

          text += `\n  ${rIcon} ${theme.fg("accent", r.agent)} - ${theme.fg("dim", summary)}`;
        }
        const totalUs = formatUsageStats(aggregateUsage(details.results));
        if (totalUs) text += `\n\n${theme.fg("dim", `Total: ${totalUs}`)}`;
        text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
        return new Text(text, 0, 0);
      }

      // Parallel
      if (details.execMode === "parallel") {
        const runningCount = details.results.filter((r) => r.exitCode === -1).length;
        const ok = details.results.filter((r) => r.exitCode === 0).length;
        const failed = details.results.filter((r) => r.exitCode > 0).length;
        const isRunning = runningCount > 0;
        const icon = isRunning ? theme.fg("success", "●") : theme.fg("muted", "●");
        const status = isRunning
          ? `${ok + failed}/${details.results.length} done, ${runningCount} running`
          : `${ok}/${details.results.length} tasks`;

        if (expanded && !isRunning) {
          const c = new Container();
          c.addChild(new Text(`${theme.fg("toolTitle", theme.bold("symmachos "))}${theme.fg("accent", status)}`, 0, 0));
          for (const r of details.results) {
            const isRunning = r.exitCode === -1;
            const rIcon = isRunning ? theme.fg("success", "●") : (r.exitCode === 0 ? theme.fg("muted", "●") : theme.fg("error", "●"));
            const displayItems = getDisplayItems(r.messages);
            const finalOutput = getFinalOutput(r.messages);
            c.addChild(new Spacer(1));
            c.addChild(new Text(`${theme.fg("muted", "─── ")}${theme.fg("accent", r.agent)} ${rIcon}`, 0, 0));
            c.addChild(new Text(theme.fg("muted", "Task: ") + theme.fg("dim", r.task), 0, 0));
            for (const item of displayItems) {
              if (item.type === "thinking") {
                const s = item.text;
                const preview = s.length > 50 ? s.slice(0, 50).replace(/\n/g, " ") + "..." : s.replace(/\n/g, " ");
                c.addChild(new Text(`${theme.fg("muted", "thinking: ")}${theme.fg("dim", preview)}`, 0, 0));
              } else if (item.type === "toolCall") {
                c.addChild(new Text(theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0));
              }
            }
            if (finalOutput) { c.addChild(new Spacer(1)); c.addChild(new Markdown(finalOutput.trim(), 0, 0, getMarkdownTheme())); }
            const us = formatUsageStats(r.usage, r.model);
            if (us) c.addChild(new Text(theme.fg("dim", us), 0, 0));
          }
          const totalUs = formatUsageStats(aggregateUsage(details.results));
          if (totalUs) { c.addChild(new Spacer(1)); c.addChild(new Text(theme.fg("dim", `Total: ${totalUs}`), 0, 0)); }
          return c;
        }

        let text = `${theme.fg("toolTitle", theme.bold("symmachos"))}`;
        for (const r of details.results) {
          const isRunning = r.exitCode === -1;
          const rIcon = isRunning ? theme.fg("success", "●") : (r.exitCode === 0 ? theme.fg("muted", "●") : theme.fg("error", "●"));

          let summary = isRunning ? "thinking..." : "done";
          const displayItems = getDisplayItems(r.messages);
          if (displayItems.length > 0) {
            const last = displayItems[displayItems.length - 1];
            if (last.type === "toolCall") {
              summary = formatToolCall(last.name, last.args, (c, t) => t).trim();
            } else if (last.type === "text") {
              summary = last.text.trim().split("\n")[0].slice(0, 60);
            } else if (last.type === "thinking") {
              summary = last.text.trim().split("\n")[0].slice(0, 60);
            }
          }
          if (!summary) summary = isRunning ? "thinking..." : "done";

          text += `\n  ${rIcon} ${theme.fg("accent", r.agent)} - ${theme.fg("dim", summary)}`;
        }
        if (!isRunning) {
          const totalUs = formatUsageStats(aggregateUsage(details.results));
          if (totalUs) text += `\n\n${theme.fg("dim", `Total: ${totalUs}`)}`;
        }
        if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
        return new Text(text, 0, 0);
      }

      const t = result.content[0];
      return new Text(t?.type === "text" ? t.text : "(no output)", 0, 0);
    },
  });


  // ── Inject agent list into system prompt ───
  pi.on("before_agent_start", async (_event, ctx) => {
    const { agents } = discoverAgents(ctx.cwd, "both");
    if (agents.length === 0) return;
    const currentModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "default";
    const list = agents
      .map((a) => {
        const modelNote = a.model ? a.model : `${currentModel} (inherited)`;
        return `- ${a.name} [model:${modelNote}]: ${a.description}`;
      })
      .join("\n");
    return {
      systemPrompt:
        _event.systemPrompt +
        `\n\n## Available Subagents\nUse the \`subagent\` tool to delegate tasks to these specialized agents:\n${list}\n\nAgents without a model specified will run with your current model (${currentModel}).`,
    };
  });
}

// --- INLINED SUPPORT FILES ---

// --- subagent-store.ts ---


export type SubagentStatus = "running" | "done" | "failed" | "terminated";

export interface SubagentTranscriptEntry {
	role: "task" | "assistant" | "tool" | "stderr";
	text: string;
}

export interface SubagentRecord {
	id: string;
	agentName: string;
	task: string;
	cwd: string;
	status: SubagentStatus;
	visible: boolean;
	icon: string;
	startedAt: number;
	finishedAt?: number;
	exitCode?: number;
	output: string;
	terminateRequested: boolean;
	transcript: SubagentTranscriptEntry[];
}

export interface CreateSubagentStoreOptions {
	onChange?: () => void;
}

const STORE_FILE = "C:/Users/prithish/.pi/subagent-store.json";

function loadRecords(): SubagentRecord[] {
	try {
		if (fs.existsSync(STORE_FILE)) {
			return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
		}
	} catch {}
	return [];
}

function saveRecords(records: SubagentRecord[]) {
	try {
		fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2));
	} catch {}
}

export function createSubagentStore() {
	let records: SubagentRecord[] = loadRecords();
	let nextId = records.length > 0 ? Math.max(...records.map(r => parseInt(r.id))) + 1 : 1;
	const listeners = new Set<() => void>();

	const notify = () => {
		saveRecords(records);
		for (const listener of listeners) {
			listener();
		}
	};
	const get = (id: string) => records.find((record) => record.id === id);

	const store = {
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		start(input: { agentName: string; task: string; cwd: string }): SubagentRecord {
			const record: SubagentRecord = {
				id: String(nextId++),
				agentName: input.agentName,
				task: input.task,
				cwd: input.cwd,
				status: "running",
				visible: true,
				icon: "⠋",
				startedAt: Date.now(),
				output: "",
				terminateRequested: false,
				transcript: [{ role: "task", text: `Task: ${input.task}` }],
			};
			records.push(record);
			notify();
			return record;
		},
		appendTranscript(id: string, entry: SubagentTranscriptEntry) {
			const record = get(id);
			if (!record) return;
			record.transcript.push(entry);
			notify();
		},
		markFinished(id: string, input: { status: Exclude<SubagentStatus, "running">; exitCode: number; output: string }) {
			const record = get(id);
			if (!record) return;
			record.status = input.status;
			record.icon = input.status === "done" ? "✓" : input.status === "failed" ? "✗" : "⏹";
			record.exitCode = input.exitCode;
			record.output = input.output;
			record.finishedAt = Date.now();
			if (input.output && record.transcript.at(-1)?.text !== input.output) {
				record.transcript.push({ role: "assistant", text: input.output });
			}
			notify();
		},
		dismiss(id: string) {
			const record = get(id);
			if (!record) return;
			record.visible = false;
			notify();
		},
		terminate(id: string) {
			const record = get(id);
			if (!record) return;
			record.terminateRequested = true;
			record.status = "terminated";
			record.icon = "⏹";
			record.visible = false;
			notify();
		},
		get,
		visibleRecords() {
			records = loadRecords(); // Refresh from file
			return records.filter((record) => record.visible);
		},
		hasVisibleRunning() {
			records = loadRecords();
			return records.some((record) => record.visible && record.status === "running");
		},
		allRecords() {
			records = loadRecords();
			return records.slice();
		},
		clear() {
			records.length = 0;
			nextId = 1;
			notify();
		}
	};

	return store;
}

const createStoreInstance = () => {
	const globalKey = "__piSubagentStore_v1";
	if (!(globalThis as any)[globalKey]) {
		(globalThis as any)[globalKey] = createSubagentStore();
	}
	return (globalThis as any)[globalKey];
};

export const getGlobalSubagentStore = () => createStoreInstance();

// --- subagent-browser-state.ts ---
export type SubagentBrowserMode = "list" | "transcript";

export interface SubagentBrowserState {
	mode: SubagentBrowserMode;
	selectedIndex: number;
	scrollOffset: number;
	armKey: "d" | "s" | null;
}

export function createSubagentBrowserState(): SubagentBrowserState {
	return {
		mode: "list",
		selectedIndex: 0,
		scrollOffset: 0,
		armKey: null,
	};
}

export function handleSubagentBrowserKey(
	state: SubagentBrowserState,
	key: string,
	visibleCount: number,
): { kind: string } {
	const maxIndex = Math.max(0, visibleCount - 1);

	if (key === "escape") {
		state.armKey = null;
		return { kind: "close" };
	}

	if (state.mode === "list") {
		if (key === "up") {
			state.selectedIndex = Math.max(0, state.selectedIndex - 1);
			state.armKey = null;
			return { kind: "noop" };
		}
		if (key === "down") {
			state.selectedIndex = Math.min(maxIndex, state.selectedIndex + 1);
			state.armKey = null;
			return { kind: "noop" };
		}
		if (key === "enter") {
			state.mode = "transcript";
			state.scrollOffset = 0;
			state.armKey = null;
			return { kind: "open-transcript" };
		}
		if (key === "d") {
			if (state.armKey === "d") {
				state.armKey = null;
				return { kind: "dismiss" };
			}
			state.armKey = "d";
			return { kind: "arm-dismiss" };
		}
		state.armKey = null;
		return { kind: "noop" };
	}

	if (key === "w") {
		state.mode = "list";
		state.armKey = null;
		return { kind: "back-to-list" };
	}
	if (key === "a") {
		state.selectedIndex = Math.max(0, state.selectedIndex - 1);
		state.armKey = null;
		return { kind: "previous-subagent" };
	}
	if (key === "d") {
		state.selectedIndex = Math.min(maxIndex, state.selectedIndex + 1);
		state.armKey = null;
		return { kind: "next-subagent" };
	}
	if (key === "up") {
		state.scrollOffset = Math.max(0, state.scrollOffset - 1);
		state.armKey = null;
		return { kind: "scroll-up" };
	}
	if (key === "down") {
		state.scrollOffset += 1;
		state.armKey = null;
		return { kind: "scroll-down" };
	}
	if (key === "s") {
		if (state.armKey === "s") {
			state.armKey = null;
			return { kind: "terminate" };
		}
		state.armKey = "s";
		return { kind: "arm-terminate" };
	}

	state.armKey = null;
	return { kind: "noop" };
}

// --- subagent-render.ts ---

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function truncateLineRender(text: string, width: number): string {
	if (width <= 0) return "";
	if (text.length <= width) return text;
	if (width === 1) return "…";
	return `${text.slice(0, width - 1)}…`;
}

function wrapLine(text: string, width: number): string[] {
	const safeWidth = Math.max(1, width);
	if (text.length <= safeWidth) return [text];
	const lines: string[] = [];
	for (let i = 0; i < text.length; i += safeWidth) {
		lines.push(text.slice(i, i + safeWidth));
	}
	return lines;
}

export function buildSubagentWidgetLines(records: SubagentRecord[], frameIndex: number): string[] {
	return records
		.filter((record) => record.visible)
		.map((record) => {
			const icon = record.status === "running" ? SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]! : record.icon;
			return `${icon} ${record.agentName} — ${record.status}`;
		});
}

export function buildSubagentTranscriptLines(
	record: SubagentRecord,
	layout: { width: number; bodyRows: number; scrollOffset: number },
): string[] {
	const safeWidth = Math.max(20, layout.width);
	const header = truncateLineRender(`${record.agentName} — ${record.status}`, safeWidth);
	const body = [
		`Task: ${record.task}`,
		...record.transcript.map((entry) => `${entry.role}: ${entry.text}`),
	];

	const wrappedBody = body.flatMap((line) => wrapLine(line, Math.max(10, safeWidth)));
	const visibleBodyRows = Math.max(0, layout.bodyRows);
	const start = Math.max(0, wrappedBody.length - visibleBodyRows - Math.max(0, layout.scrollOffset));
	const end = Math.max(start, wrappedBody.length - Math.max(0, layout.scrollOffset));
	const visibleBody = wrappedBody.slice(start, end).map((line) => truncateLineRender(line, safeWidth));

	return [header, ...visibleBody];
}

// --- subagent-browser.ts ---


export interface SubagentBrowserComponentOptions {
	tui: { terminal: { rows: number } };
	store: {
		visibleRecords(): SubagentRecord[];
		dismiss(id: string): void;
	};
	terminateSubagent(id: string): void;
	onClose: () => void;
}

function truncateLineBrowser(text: string, width: number): string {
	if (width <= 0) return "";
	if (text.length <= width) return text;
	if (width === 1) return "…";
	return `${text.slice(0, width - 1)}…`;
}

export class SubagentBrowserComponent {
	private readonly state: SubagentBrowserState = createSubagentBrowserState();

	constructor(private readonly options: SubagentBrowserComponentOptions) {}

	private get visibleRecords(): SubagentRecord[] {
		return this.options.store.visibleRecords();
	}

	private get selectedRecord(): SubagentRecord | undefined {
		const records = this.visibleRecords;
		if (records.length === 0) return undefined;
		const index = Math.min(this.state.selectedIndex, records.length - 1);
		return records[index];
	}

	private syncSelection(): void {
		const records = this.visibleRecords;
		if (records.length === 0) {
			this.state.selectedIndex = 0;
			return;
		}
		this.state.selectedIndex = Math.max(0, Math.min(this.state.selectedIndex, records.length - 1));
	}

	render(width: number): string[] {
		const rows = Math.max(10, this.options.tui.terminal.rows);
		const chromeRows = 4;
		const bodyRows = Math.max(1, rows - chromeRows);
		const records = this.visibleRecords;
		const title = truncateLineBrowser("Subagents", width);
		const controls = this.state.mode === "list"
			? truncateLineBrowser("Enter=open  d×2=dismiss  Esc=close", width)
			: truncateLineBrowser("w=list  a=prev  d=next  s×2=terminate  Esc=close", width);

		if (records.length === 0) {
			return [title, controls, "", truncateLineBrowser("No visible subagents", width)];
		}

		if (this.state.mode === "list") {
			const windowSize = Math.max(1, bodyRows - 1);
			const selectedIndex = Math.min(this.state.selectedIndex, records.length - 1);
			const windowStart = Math.max(0, Math.min(selectedIndex - Math.floor(windowSize / 2), Math.max(0, records.length - windowSize)));
			const windowEnd = Math.min(records.length, windowStart + windowSize);
			const lines = buildSubagentWidgetLines(records.slice(windowStart, windowEnd), 0).map((line, index) => {
				const absoluteIndex = windowStart + index;
				const prefix = absoluteIndex === selectedIndex ? "> " : "  ";
				return truncateLineBrowser(prefix + line, width);
			});
			return [title, controls, "", ...lines.slice(0, bodyRows)];
		}

		const record = this.selectedRecord;
		if (!record) {
			return [title, controls, "", truncateLineBrowser("No visible subagents", width)];
		}

		const transcriptLines = buildSubagentTranscriptLines(record, {
			width,
			bodyRows,
			scrollOffset: this.state.scrollOffset,
		});
		return [title, controls, "", ...transcriptLines.slice(0, bodyRows + 1).map((line) => truncateLineBrowser(line, width))];
	}

	handleInput(data: string): void {
		const records = this.visibleRecords;
		if (records.length === 0) {
			if (matchesKey(data, Key.escape) || data === "escape") this.options.onClose();
			return;
		}

		const result = handleSubagentBrowserKey(this.state, data, records.length);
		if (result.kind === "close") {
			this.options.onClose();
			return;
		}

		if (this.state.mode === "list") {
			if (result.kind === "dismiss") {
				const record = records[Math.min(this.state.selectedIndex, records.length - 1)];
				if (record) this.options.store.dismiss(record.id);
				this.syncSelection();
			}
			if (result.kind === "open-transcript") {
				this.state.scrollOffset = 0;
			}
			return;
		}

		if (result.kind === "previous-subagent" || result.kind === "next-subagent") {
			this.state.scrollOffset = 0;
		}
		if (result.kind === "terminate") {
			const record = records[Math.min(this.state.selectedIndex, records.length - 1)];
			if (record) this.options.terminateSubagent(record.id);
			this.syncSelection();
			if (this.visibleRecords.length === 0) this.state.mode = "list";
		}
		if (result.kind === "back-to-list") {
			this.syncSelection();
		}
	}

	invalidate(): void {}
}

// --- subagent-stream.ts ---
export interface SubagentStreamEntry {
	role: "assistant" | "tool" | "stderr";
	text: string;
}

export interface CreateSubagentStreamCaptureOptions {
	onEntry?: (entry: SubagentStreamEntry) => void;
}

export function createSubagentStreamCapture(options: CreateSubagentStreamCaptureOptions = {}) {
	const transcript: string[] = [];
	let finalOutput = "";

	const emit = (entry: SubagentStreamEntry) => {
		if (!entry.text) return;
		transcript.push(entry.text);
		options.onEntry?.(entry);
	};

	const extractAssistantText = (message: any): string => {
		if (!message || message.role !== "assistant") return "";
		const parts = Array.isArray(message.content) ? message.content : [];
		return parts
			.filter((part: any) => part.type === "text")
			.map((part: any) => String(part.text || ""))
			.join("\n")
			.trim();
	};

	return {
		ingestStdoutLine(line: string) {
			const trimmed = line.trim();
			if (!trimmed) return;

			let event: any;
			try {
				event = JSON.parse(trimmed);
			} catch {
				return;
			}

			if (event.type === "message_end" && event.message) {
				const text = extractAssistantText(event.message);
				if (text) {
					finalOutput = text;
					emit({ role: "assistant", text });
				}

				const parts = Array.isArray(event.message.content) ? event.message.content : [];
				for (const part of parts) {
					if (part.type === "toolCall") {
						emit({ role: "tool", text: `tool: ${part.name} ${JSON.stringify(part.arguments)}` });
					}
				}
			}

			if (event.type === "agent_end" && Array.isArray(event.messages)) {
				for (let i = event.messages.length - 1; i >= 0; i--) {
					const text = extractAssistantText(event.messages[i]);
					if (text) {
						finalOutput = text;
						break;
					}
				}
			}
		},
		ingestStderrLine(line: string) {
			const trimmed = line.trim();
			if (trimmed) emit({ role: "stderr", text: trimmed });
		},
		getFinalOutput() {
			return finalOutput;
		},
		getTranscriptText() {
			return transcript.join("\n");
		},
	};
}
