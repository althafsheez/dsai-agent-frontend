export type SlashCommandGroup = "Conversation" | "Model" | "Run" | "Navigate";

export interface SlashCommand {
  name: string;
  aliases?: string[];
  /** Shown after the name when the command takes text, e.g. `/rename <title>`. */
  args?: string;
  description: string;
  group: SlashCommandGroup;
  /** Set when DSAI has no backing feature yet; the picker shows it and running it explains why. */
  unavailable?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show every slash command", group: "Conversation" },
  { name: "btw", args: "<question>", description: "Ask a side question in Quick Assistant without adding it to this chat", group: "Conversation" },
  { name: "recap", description: "Ask for a short recap of this analysis", group: "Conversation" },
  { name: "rename", args: "<title>", description: "Rename this chat", group: "Conversation" },
  { name: "copy", description: "Copy the latest answer to the clipboard", group: "Conversation" },
  { name: "export", description: "Download this conversation as Markdown", group: "Conversation" },
  { name: "context", description: "Open this chat's datasets and artifacts", group: "Conversation" },
  { name: "focus", description: "Hide the sidebar to focus on the conversation", group: "Conversation" },
  { name: "clear", description: "Start a fresh analysis (this chat stays in Recent Analyses)", group: "Conversation" },
  { name: "compact", description: "Summarize history to free up context", group: "Conversation", unavailable: "Conversation compaction is not available yet." },
  { name: "branch", aliases: ["fork"], description: "Continue this chat in a copy", group: "Conversation", unavailable: "Branching a chat is not available yet." },
  { name: "goal", args: "<goal>", description: "Pin a goal the analysis should work towards", group: "Conversation", unavailable: "Saved analysis goals are not available yet." },
  { name: "model", args: "[model]", description: "Show or switch the model", group: "Model" },
  { name: "effort", args: "[level]", description: "Show or switch the reasoning effort", group: "Model" },
  { name: "status", description: "Show the model, effort and run state", group: "Model" },
  { name: "usage", description: "Show token and credit usage", group: "Model", unavailable: "Usage tracking is not available yet." },
  { name: "agents", aliases: ["list-agents", "peers"], description: "List the agents working on this chat", group: "Run" },
  { name: "tasks", description: "Show the running and queued questions", group: "Run" },
  { name: "stop", description: "Stop the running analysis", group: "Run" },
  { name: "background", aliases: ["bg"], description: "Keep a run going in the background", group: "Run", unavailable: "Runs stop when you leave a chat, so background runs are not supported." },
  { name: "resume", description: "Open a previous analysis", group: "Navigate" },
  { name: "workflows", description: "Open Workflows", group: "Navigate" },
  { name: "workflow-authoring", description: "Build a new workflow", group: "Navigate" },
  { name: "mcp", description: "Manage connectors and data sources", group: "Navigate" },
  { name: "skills", description: "Browse analysis skills", group: "Navigate" },
  { name: "memory", description: "Edit the workspace AI context the agent reads", group: "Navigate" },
  { name: "exit", description: "Leave this chat and go home", group: "Navigate" },
];

/** Commands to suggest while the draft is a bare `/word` with no arguments yet. */
export function suggestSlashCommands(draft: string): SlashCommand[] | null {
  const match = /^\/([\w-]*)$/.exec(draft);
  if (!match) return null;
  const query = match[1].toLowerCase();
  const names = (command: SlashCommand) => [command.name, ...(command.aliases ?? [])];
  const starts = SLASH_COMMANDS.filter((command) => names(command).some((name) => name.startsWith(query)));
  const contains = SLASH_COMMANDS.filter((command) => !starts.includes(command) && names(command).some((name) => name.includes(query)));
  return [...starts, ...contains];
}

export function parseSlashCommand(draft: string): { command: SlashCommand | null; name: string; args: string } | null {
  const match = /^\/([\w-]+)(?:\s+([\s\S]*))?$/.exec(draft.trim());
  if (!match) return null;
  const name = match[1].toLowerCase();
  const command = SLASH_COMMANDS.find((item) => item.name === name || item.aliases?.includes(name)) ?? null;
  return { command, name, args: (match[2] ?? "").trim() };
}
