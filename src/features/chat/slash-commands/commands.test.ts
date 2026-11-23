import { describe, expect, it } from "vitest";
import { parseSlashCommand, suggestSlashCommands, SLASH_COMMANDS } from "./commands";

describe("slash commands", () => {
  it("covers every command the team asked for, aliases included", () => {
    const names = SLASH_COMMANDS.flatMap((command) => [command.name, ...(command.aliases ?? [])]);
    for (const name of ["compact", "clear", "resume", "model", "effort", "context", "usage", "mcp", "memory", "help", "exit", "rename", "branch", "fork", "btw", "recap", "export", "copy", "focus", "goal", "tasks", "background", "bg", "stop", "agents", "list-agents", "peers", "workflows", "workflow-authoring", "status", "skills"]) {
      expect(names).toContain(name);
    }
  });

  it("suggests only while the draft is a bare command", () => {
    expect(suggestSlashCommands("hello")).toBeNull();
    expect(suggestSlashCommands("/rename my chat")).toBeNull();
    expect(suggestSlashCommands("/")?.length).toBe(SLASH_COMMANDS.length);
    expect(suggestSlashCommands("/re")?.map((command) => command.name).slice(0, 3)).toEqual(["recap", "rename", "resume"]);
    expect(suggestSlashCommands("/peer")?.[0].name).toBe("agents");
  });

  it("parses names, aliases and arguments", () => {
    expect(parseSlashCommand("/rename  Q3 revenue ")).toMatchObject({ name: "rename", args: "Q3 revenue", command: { name: "rename" } });
    expect(parseSlashCommand("/bg")?.command?.name).toBe("background");
    expect(parseSlashCommand("/nope")).toMatchObject({ command: null, name: "nope" });
    expect(parseSlashCommand("not a command")).toBeNull();
  });
});
