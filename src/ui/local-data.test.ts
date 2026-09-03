import { describe, expect, it } from "vitest";
import {
  CHAT_SESSIONS_STORAGE_KEY,
  CUSTOM_PROMPTS_STORAGE_KEY,
  MAX_LOCAL_SESSIONS,
  deleteChatSession,
  deleteLocalPrompt,
  loadChatSessions,
  loadLocalPrompts,
  saveChatSessions,
  saveLocalPrompts,
  selectChatSession,
  sessionTitle,
  upsertChatSession,
  upsertLocalPrompt,
  type LocalChatSession,
  type StorageLike,
} from "@/ui/local-data";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function session(index: number): LocalChatSession {
  return {
    id: `session-${index}`,
    title: `Session ${index}`,
    provider: "openai",
    model: "gpt-4o-mini",
    messages: [{ id: `message-${index}`, role: "user", content: `message ${index}` }],
    updatedAt: `2026-09-03T00:00:0${index}.000Z`,
  };
}

describe("local chat sessions", () => {
  it("keeps only the five newest sessions with messages and selections", () => {
    const storage = new MemoryStorage();
    const saved = saveChatSessions(storage, Array.from({ length: 7 }, (_, index) => session(index)));
    expect(saved).toHaveLength(MAX_LOCAL_SESSIONS);
    expect(saved.map((item) => item.id)).toEqual(["session-6", "session-5", "session-4", "session-3", "session-2"]);
    expect(loadChatSessions(storage)).toEqual(saved);
    expect(JSON.parse(storage.values.get(CHAT_SESSIONS_STORAGE_KEY)!)[0]).toMatchObject({ provider: "openai", model: "gpt-4o-mini", messages: [{ content: "message 6" }] });
  });

  it("supports creating/updating, switching and deleting sessions", () => {
    const updated = { ...session(1), title: "Updated", updatedAt: "2026-09-03T01:00:00.000Z" };
    const sessions = upsertChatSession([session(0), session(1)], updated);
    expect(selectChatSession(sessions, "session-1")?.title).toBe("Updated");
    expect(deleteChatSession(sessions, "session-1").map((item) => item.id)).toEqual(["session-0"]);
  });

  it("ignores malformed local data and derives a bounded title", () => {
    const storage = new MemoryStorage();
    storage.values.set(CHAT_SESSIONS_STORAGE_KEY, "not-json");
    expect(loadChatSessions(storage)).toEqual([]);
    expect(sessionTitle([{ id: "m", role: "user", content: "abcdefghijklmnopqrstuvwxyz" }])).toBe("abcdefghijklmnopqrstuvwx…");
  });
});

describe("local custom prompts", () => {
  it("saves, selects by id through the page list, updates and deletes prompts locally", () => {
    const storage = new MemoryStorage();
    const first = { id: "prompt-1", name: "摘要", content: "请总结以下内容：", updatedAt: "2026-09-03T00:00:00.000Z" };
    const updated = { ...first, content: "请用三点总结：", updatedAt: "2026-09-03T01:00:00.000Z" };
    const prompts = upsertLocalPrompt([first], updated);
    saveLocalPrompts(storage, prompts);
    expect(loadLocalPrompts(storage)[0]).toEqual(updated);
    expect(JSON.parse(storage.values.get(CUSTOM_PROMPTS_STORAGE_KEY)!)[0].content).toBe("请用三点总结：");
    expect(deleteLocalPrompt(prompts, "prompt-1")).toEqual([]);
  });
});
