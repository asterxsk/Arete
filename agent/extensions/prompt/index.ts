import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (_event) => {
    return {
      systemPrompt:
        _event.systemPrompt +
        `\n\n## Custom Instructions\n- **Shell Preference**: Use PowerShell as the default shell environment. Only use Bash when absolutely necessary or specifically requested.\n- **Task Tracking**: Always use the \`todo\` system to map out and track your progress when handling multi-step processes or complex requests.\n- **Asynchronous Workflows**: Proactively utilize background tasks and the scheduling tools to manage long-running operations efficiently without blocking the main process.\n- **Visual Styling**: Include no emojis in your responses; only use Nerd Font icons.`
    };
  });
}
