import type { AssistantMessage, ChatMessage, MessageBlock } from "../types";

function blockToMarkdown(block: MessageBlock): string {
  switch (block.type) {
    case "markdown": return block.content;
    case "code": return `\`\`\`${block.language}\n${block.code}\n\`\`\``;
    case "table": {
      const header = `| ${block.columns.join(" | ")} |`;
      const divider = `| ${block.columns.map(() => "---").join(" | ")} |`;
      const rows = block.rows.map((row) => `| ${row.join(" | ")} |`);
      return [block.caption ? `*${block.caption}*` : "", header, divider, ...rows].filter(Boolean).join("\n");
    }
    case "chart": return `*Chart: ${block.title}*`;
    case "image": return `*Image: ${block.alt}*`;
    case "file": return `*File: ${block.name}*`;
  }
}

export function assistantText(message: AssistantMessage): string {
  return message.blocks.map(blockToMarkdown).filter(Boolean).join("\n\n").trim();
}

export function transcriptMarkdown(title: string, messages: ChatMessage[]): string {
  const parts = messages.map((message) => message.role === "user"
    ? `## You\n\n${message.content}${message.attachments?.length ? `\n\nAttached: ${message.attachments.map((file) => file.name).join(", ")}` : ""}`
    : `## DSAI\n\n${assistantText(message) || "_No text in this answer._"}`);
  return [`# ${title}`, ...parts].join("\n\n") + "\n";
}
