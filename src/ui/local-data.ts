export const MAX_LOCAL_SESSIONS = 5;
export const CHAT_SESSIONS_STORAGE_KEY = "multi-provider-llm-toolbox.chat-sessions.v1";
export const CUSTOM_PROMPTS_STORAGE_KEY = "multi-provider-llm-toolbox.custom-prompts.v1";

export interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface LocalChatSession {
  id: string;
  title: string;
  provider: string;
  model: string;
  messages: LocalMessage[];
  updatedAt: string;
}

export interface LocalPrompt {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validMessage(value: unknown): value is LocalMessage {
  return isRecord(value)
    && typeof value.id === "string"
    && (value.role === "user" || value.role === "assistant")
    && typeof value.content === "string";
}

function validSession(value: unknown): value is LocalChatSession {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.provider === "string"
    && typeof value.model === "string"
    && Array.isArray(value.messages)
    && value.messages.every(validMessage)
    && typeof value.updatedAt === "string";
}

function validPrompt(value: unknown): value is LocalPrompt {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.content === "string"
    && typeof value.updatedAt === "string";
}

function readArray(storage: StorageLike, key: string): unknown[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function newestFirst<T extends { updatedAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function loadChatSessions(storage: StorageLike): LocalChatSession[] {
  return newestFirst(readArray(storage, CHAT_SESSIONS_STORAGE_KEY).filter(validSession)).slice(0, MAX_LOCAL_SESSIONS);
}

export function saveChatSessions(storage: StorageLike, sessions: readonly LocalChatSession[]): LocalChatSession[] {
  const limited = newestFirst(sessions).slice(0, MAX_LOCAL_SESSIONS);
  storage.setItem(CHAT_SESSIONS_STORAGE_KEY, JSON.stringify(limited));
  return limited;
}

export function upsertChatSession(sessions: readonly LocalChatSession[], session: LocalChatSession): LocalChatSession[] {
  return newestFirst([session, ...sessions.filter((item) => item.id !== session.id)]).slice(0, MAX_LOCAL_SESSIONS);
}

export function deleteChatSession(sessions: readonly LocalChatSession[], sessionId: string): LocalChatSession[] {
  return sessions.filter((session) => session.id !== sessionId);
}

export function selectChatSession(sessions: readonly LocalChatSession[], sessionId: string): LocalChatSession | undefined {
  return sessions.find((session) => session.id === sessionId);
}

export function loadLocalPrompts(storage: StorageLike): LocalPrompt[] {
  return newestFirst(readArray(storage, CUSTOM_PROMPTS_STORAGE_KEY).filter(validPrompt));
}

export function saveLocalPrompts(storage: StorageLike, prompts: readonly LocalPrompt[]): LocalPrompt[] {
  const sorted = newestFirst(prompts);
  storage.setItem(CUSTOM_PROMPTS_STORAGE_KEY, JSON.stringify(sorted));
  return sorted;
}

export function upsertLocalPrompt(prompts: readonly LocalPrompt[], prompt: LocalPrompt): LocalPrompt[] {
  return newestFirst([prompt, ...prompts.filter((item) => item.id !== prompt.id)]);
}

export function deleteLocalPrompt(prompts: readonly LocalPrompt[], promptId: string): LocalPrompt[] {
  return prompts.filter((prompt) => prompt.id !== promptId);
}

export function sessionTitle(messages: readonly LocalMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.content.trim());
  if (!firstUserMessage) return "新会话";
  const text = firstUserMessage.content.trim();
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}
