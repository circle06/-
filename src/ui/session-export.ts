import type { LocalChatSession } from "@/ui/local-data";

function safeTitle(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, "-").trim();
  return cleaned || "chat-session";
}

export function sessionMarkdown(session: LocalChatSession): string {
  const lines = [
    `# ${session.title}`,
    "",
    `- Provider: ${session.provider}`,
    `- Model: ${session.model}`,
    `- Updated: ${session.updatedAt}`,
    "",
  ];
  for (const message of session.messages) {
    const model = message.role === "assistant" && message.model ? ` · ${message.model}` : "";
    lines.push(`## ${message.role === "user" ? "用户" : "助手"}${model}`, "");
    if (message.attachments?.length) lines.push(`附件：${message.attachments.map((item) => item.name).join("、")}`, "");
    if (message.reasoning) lines.push("<details>", "<summary>思考过程</summary>", "", message.reasoning, "", "</details>", "");
    lines.push(message.content, "");
  }
  return `${lines.join("\n").trim()}\n`;
}

export function sessionExportFilename(session: LocalChatSession): string {
  return `${safeTitle(session.title)}.md`;
}
