import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (_event) => {
    return {
      systemPrompt:
        _event.systemPrompt +
        `\n\n## Custom Instructions\n- **Shell Preference**: Use PowerShell as the default shell environment. Only use Bash when absolutely necessary or specifically requested.\n- **Task Tracking**: Always use the \`todo\` system to map out and track your progress when handling multi-step processes or complex requests.\n- **Task Clearing**: When a new task is given, or the previous task is complete and an improvement or fix is being made, clear the existing todo list before starting. Do not carry over stale tasks.\n- **Asynchronous Workflows**: Proactively utilize background tasks and the scheduling tools to manage long-running operations efficiently without blocking the main process.\n- **Questions**: When you need clarification, input, or a decision from the user, always use the \`questions\` tool rather than asking in plain text. This keeps the interaction structured and the UI clean.\n- **Caveman Mode**: Use caveman mode at high intensity by default in all responses. Even during internal thinking, reason in compressed caveman style to minimize token usage.\n- **Visual Styling**: Include no emojis in your responses; only use Nerd Font icons.`
    };
  });
}
