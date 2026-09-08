import { describe, expect, it } from "vitest";
import { sessionExportFilename, sessionMarkdown } from "@/ui/session-export";

const session = {
  id: "session-1",
  title: "项目/总结",
  provider: "deepseek",
  model: "deepseek-v4-flash",
  updatedAt: "2026-09-08T00:00:00.000Z",
  messages: [
    { id: "user-1", role: "user" as const, content: "请总结", attachments: [{ name: "notes.md", kind: "md" as const }] },
    { id: "assistant-1", role: "assistant" as const, content: "总结结果" },
  ],
};

describe("session export", () => {
  it("exports readable Markdown without invalid filename characters", () => {
    expect(sessionMarkdown(session)).toContain("附件：notes.md");
    expect(sessionMarkdown(session)).toContain("## 助手");
    expect(sessionExportFilename(session)).toBe("项目-总结.md");
  });
});
