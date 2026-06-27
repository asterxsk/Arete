# Perms Extension

This extension manages tool permissions and extensions for the Pi agent.

## Commands
* `/extension`: Opens a checklist of the tools added via extensions. The user can toggle these tools to choose not to load them into the system prompt and harness.
* `/plan`: Enters plan mode. The agent is notified and cannot touch anything, only explore.

## Tools
* `enter_plan`: Use this tool voluntarily to enter plan mode when you are required to do a complex, multi-phase task. Once you enter plan mode, you may only explore the codebase to formulate a plan.
* `exit_plan`: Hidden tool. When in plan mode, once you have explored the codebase and formulated a clear plan, invoke this tool to ask the user to exit plan mode.
  * It will ask the user: "Do you want to exit plan mode? (Yes/No)"
  * If the user says Yes, you proceed to implement your plan.
  * If the user says No, your turn ends immediately.
  * You may optionally ask a second question via the tool: "Use Parallel subagents, Sequential subagents, or no subagents at all?".
