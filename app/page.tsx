"use client";

import { useEffect, useRef, useState } from "react";
import type { BuiltInPrompt } from "@/prompts/built-in-prompts";
import { parseSseText, type ParsedSseEvent } from "@/ui/chat-sse";
import {
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
  type LocalMessage,
  type LocalPrompt,
} from "@/ui/local-data";
import {
  builtInPromptValue,
  localPromptValue,
  promptContentForSelection,
  type PromptSelection,
} from "@/ui/prompt-selection";

interface PageProvider {
  id: string;
  name: string;
  models: Array<{ id: string; name: string }>;
}

interface ChatRequest {
  provider: string;
  model: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

class ChatStreamError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ChatStreamError";
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSession(provider: string, model: string): LocalChatSession {
  return { id: makeId("session"), title: "新会话", provider, model, messages: [], updatedAt: new Date().toISOString() };
}

async function readError(response: Response): Promise<ChatStreamError> {
  try {
    const body = await response.json() as { error?: { code?: string; message?: string } };
    return new ChatStreamError(body.error?.code ?? "REQUEST_FAILED", body.error?.message ?? "请求失败。");
  } catch {
    return new ChatStreamError("REQUEST_FAILED", `请求失败（HTTP ${response.status}）。`);
  }
}

export default function HomePage() {
  const [providers, setProviders] = useState<PageProvider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [sessions, setSessions] = useState<LocalChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [prompts, setPrompts] = useState<LocalPrompt[]>([]);
  const [builtInPrompts, setBuiltInPrompts] = useState<BuiltInPrompt[]>([]);
  const [promptSelection, setPromptSelection] = useState<PromptSelection>("");
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [promptName, setPromptName] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [retryRequest, setRetryRequest] = useState<ChatRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);
  const sessionsRef = useRef<LocalChatSession[]>([]);
  const activeSessionIdRef = useRef("");
  const messagesRef = useRef<LocalMessage[]>([]);
  const providerIdRef = useRef("");
  const modelIdRef = useRef("");

  const selectedProvider = providers.find((provider) => provider.id === providerId);

  function storeSessions(nextSessions: LocalChatSession[]) {
    sessionsRef.current = nextSessions;
    setSessions(nextSessions);
    try { saveChatSessions(window.localStorage, nextSessions); }
    catch { setError("浏览器本地会话保存失败，请检查存储空间设置。"); }
  }

  function persistActiveSession(nextMessages = messagesRef.current, nextProvider = providerIdRef.current, nextModel = modelIdRef.current) {
    const current = selectChatSession(sessionsRef.current, activeSessionIdRef.current);
    if (!current) return;
    const updated: LocalChatSession = {
      ...current,
      provider: nextProvider,
      model: nextModel,
      messages: nextMessages,
      title: sessionTitle(nextMessages),
      updatedAt: new Date().toISOString(),
    };
    storeSessions(upsertChatSession(sessionsRef.current, updated));
  }

  function showSession(session: LocalChatSession) {
    activeSessionIdRef.current = session.id;
    messagesRef.current = session.messages;
    providerIdRef.current = session.provider;
    modelIdRef.current = session.model;
    setActiveSessionId(session.id);
    setMessages(session.messages);
    setProviderId(session.provider);
    setModelId(session.model);
    setInput("");
    setError("");
    setRetryRequest(null);
  }

  function setVisibleMessages(nextMessages: LocalMessage[]) {
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  }

  useEffect(() => {
    let active = true;
    try { setPrompts(loadLocalPrompts(window.localStorage)); }
    catch { setError("浏览器本地提示词读取失败。"); }

    void fetch("/api/prompts")
      .then(async (response) => {
        if (!response.ok) throw await readError(response);
        return response.json() as Promise<{ prompts?: BuiltInPrompt[] }>;
      })
      .then((body) => {
        if (active) setBuiltInPrompts(Array.isArray(body.prompts) ? body.prompts : []);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "内置提示词加载失败。");
      })
      .finally(() => {
        if (active) setLoadingPrompts(false);
      });

    void fetch("/api/providers")
      .then(async (response) => {
        if (!response.ok) throw await readError(response);
        return response.json() as Promise<{ providers?: PageProvider[] }>;
      })
      .then((body) => {
        if (!active) return;
        const available = Array.isArray(body.providers) ? body.providers : [];
        setProviders(available);
        const fallbackProvider = available[0];
        if (!fallbackProvider) return;

        let stored: LocalChatSession[] = [];
        try { stored = loadChatSessions(window.localStorage); }
        catch { setError("浏览器本地会话读取失败。"); }
        const normalized = stored.map((session) => {
          const provider = available.find((item) => item.id === session.provider) ?? fallbackProvider;
          const model = provider.models.find((item) => item.id === session.model) ?? provider.models[0];
          return { ...session, provider: provider.id, model: model?.id ?? "" };
        });
        const initialSessions = normalized.length > 0 ? normalized : [createSession(fallbackProvider.id, fallbackProvider.models[0]?.id ?? "")];
        storeSessions(initialSessions);
        showSession(initialSessions[0]);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Provider 列表加载失败。");
      })
      .finally(() => {
        if (active) setLoadingProviders(false);
      });
    return () => { active = false; };
  }, []);

  function changeProvider(nextProviderId: string) {
    const nextProvider = providers.find((provider) => provider.id === nextProviderId);
    const nextModelId = nextProvider?.models[0]?.id ?? "";
    providerIdRef.current = nextProviderId;
    modelIdRef.current = nextModelId;
    setProviderId(nextProviderId);
    setModelId(nextModelId);
    persistActiveSession(messagesRef.current, nextProviderId, nextModelId);
  }

  function changeModel(nextModelId: string) {
    modelIdRef.current = nextModelId;
    setModelId(nextModelId);
    persistActiveSession(messagesRef.current, providerIdRef.current, nextModelId);
  }

  function newSession() {
    if (!providerIdRef.current || !modelIdRef.current) return;
    const session = createSession(providerIdRef.current, modelIdRef.current);
    storeSessions(upsertChatSession(sessionsRef.current, session));
    showSession(session);
  }

  function switchSession(sessionId: string) {
    const session = selectChatSession(sessionsRef.current, sessionId);
    if (session) showSession(session);
  }

  function removeSession(sessionId: string) {
    let remaining = deleteChatSession(sessionsRef.current, sessionId);
    if (remaining.length === 0) remaining = [createSession(providerIdRef.current, modelIdRef.current)];
    storeSessions(remaining);
    if (sessionId === activeSessionIdRef.current) showSession(remaining[0]);
  }

  async function sendRequest(requestBody: ChatRequest, userMessage?: LocalMessage) {
    const assistantId = makeId("assistant");
    const nextMessages = userMessage ? [...messagesRef.current, userMessage] : [...messagesRef.current];
    const withAssistant = [...nextMessages, { id: assistantId, role: "assistant" as const, content: "" }];
    setVisibleMessages(withAssistant);
    persistActiveSession(withAssistant);
    setError("");
    setRetryRequest(null);
    setLoading(true);
    cancelRequestedRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...requestBody, stream: true }),
        signal: controller.signal,
      });
      if (!response.ok) throw await readError(response);
      if (!response.body) throw new ChatStreamError("EMPTY_STREAM", "服务端未返回流式内容。");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ended = false;
      const consume = (flush: boolean) => {
        const blocks = buffer.split(/\r?\n\r?\n/);
        if (!flush) buffer = blocks.pop() ?? "";
        else buffer = "";
        return blocks.flatMap((block) => parseSseText(block));
      };
      const handleEvent = (event: ParsedSseEvent) => {
        const payload = JSON.parse(event.data) as { text?: string; code?: string; message?: string };
        if (event.event === "message_start") return;
        if (event.event === "message_delta" && payload.text) {
          setVisibleMessages(messagesRef.current.map((message) => message.id === assistantId ? { ...message, content: message.content + payload.text } : message));
        } else if (event.event === "message_end") {
          ended = true;
        } else if (event.event === "error") {
          throw new ChatStreamError(payload.code ?? "STREAM_ERROR", payload.message ?? "流式请求失败。");
        }
      };

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        for (const event of consume(false)) handleEvent(event);
      }
      buffer += decoder.decode();
      for (const event of consume(true)) handleEvent(event);
      if (!ended && !controller.signal.aborted) throw new ChatStreamError("INCOMPLETE_STREAM", "流式响应提前结束。");
      setRetryRequest(null);
    } catch (reason: unknown) {
      if (controller.signal.aborted && cancelRequestedRef.current) {
        setRetryRequest(requestBody);
      } else {
        setVisibleMessages(messagesRef.current.filter((message) => message.id !== assistantId));
        setRetryRequest(requestBody);
        setError(reason instanceof Error ? reason.message : "流式请求失败。");
      }
    } finally {
      persistActiveSession(messagesRef.current);
      setLoading(false);
      abortRef.current = null;
      cancelRequestedRef.current = false;
    }
  }

  function sendMessage() {
    const content = input.trim();
    if (!content || loading || !providerId || !modelId) return;
    const userMessage: LocalMessage = { id: makeId("user"), role: "user", content };
    const requestBody: ChatRequest = {
      provider: providerId,
      model: modelId,
      messages: [...messagesRef.current.map(({ role, content: text }) => ({ role, content: text })), { role: "user", content }],
    };
    setInput("");
    void sendRequest(requestBody, userMessage);
  }

  function stopGeneration() {
    if (!abortRef.current) return;
    cancelRequestedRef.current = true;
    abortRef.current.abort();
  }

  function selectPrompt(promptId: string) {
    const prompt = prompts.find((item) => item.id === promptId);
    setSelectedPromptId(promptId);
    setPromptName(prompt?.name ?? "");
    setPromptContent(prompt?.content ?? "");
  }

  function insertSelectedPrompt(selection: PromptSelection) {
    setPromptSelection(selection);
    const content = promptContentForSelection(selection, builtInPrompts, prompts);
    if (content !== undefined) setInput(content);
  }

  function savePrompt() {
    const name = promptName.trim();
    const content = promptContent.trim();
    if (!name || !content) return;
    const prompt: LocalPrompt = { id: selectedPromptId || makeId("prompt"), name, content, updatedAt: new Date().toISOString() };
    const next = upsertLocalPrompt(prompts, prompt);
    try {
      setPrompts(saveLocalPrompts(window.localStorage, next));
      setSelectedPromptId(prompt.id);
      setError("");
    } catch { setError("浏览器本地提示词保存失败，请检查存储空间设置。"); }
  }

  function removePrompt() {
    if (!selectedPromptId) return;
    const next = deleteLocalPrompt(prompts, selectedPromptId);
    try { setPrompts(saveLocalPrompts(window.localStorage, next)); }
    catch { setError("浏览器本地提示词删除失败。"); return; }
    setSelectedPromptId("");
    setPromptName("");
    setPromptContent("");
    if (promptSelection === localPromptValue(selectedPromptId)) setPromptSelection("");
  }

  const canSend = Boolean(providerId && modelId && input.trim()) && !loading;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>MultiProvider LLM Toolbox</h1>
      <p>基础聊天界面（当前使用服务端 Mock 模式，本地数据仅保存在此浏览器）。</p>

      <section aria-label="本地会话" style={{ border: "1px solid #ddd", padding: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>本地会话（最多 5 个）</h2>
          <button type="button" onClick={newSession} disabled={loading || loadingProviders}>新建会话</button>
        </div>
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          {sessions.map((session) => (
            <div key={session.id} style={{ display: "flex", gap: 8 }}>
              <button type="button" aria-pressed={session.id === activeSessionId} onClick={() => switchSession(session.id)} disabled={loading} style={{ flex: 1, textAlign: "left" }}>
                {session.title} · {new Date(session.updatedAt).toLocaleString()}
              </button>
              <button type="button" aria-label={`删除会话 ${session.title}`} onClick={() => removeSession(session.id)} disabled={loading}>删除</button>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Provider 设置" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <label>
          Provider
          <select value={providerId} onChange={(event) => changeProvider(event.target.value)} disabled={loadingProviders || loading}>
            {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </label>
        <label>
          模型
          <select value={modelId} onChange={(event) => changeModel(event.target.value)} disabled={!selectedProvider || loading}>
            {selectedProvider?.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
      </section>

      <section aria-label="提示词" style={{ border: "1px solid #ddd", padding: 12, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>提示词</h2>
        <label>
          选择提示词
          <select
            aria-label="选择内置或本地提示词"
            value={promptSelection}
            onChange={(event) => insertSelectedPrompt(event.target.value as PromptSelection)}
            disabled={loadingPrompts || loading}
          >
            <option value="">请选择</option>
            <optgroup label="内置提示词（只读）">
              {builtInPrompts.map((prompt) => <option key={prompt.id} value={builtInPromptValue(prompt.id)}>{prompt.name}</option>)}
            </optgroup>
            <optgroup label="本地自定义提示词">
              {prompts.map((prompt) => <option key={prompt.id} value={localPromptValue(prompt.id)}>{prompt.name}</option>)}
            </optgroup>
          </select>
        </label>
        <p style={{ marginBottom: 12 }}>选择后仅插入输入框，不会自动发送。内置提示词不可修改或删除。</p>

        <h3 style={{ fontSize: 16 }}>管理本地自定义提示词</h3>
        <select aria-label="选择提示词" value={selectedPromptId} onChange={(event) => selectPrompt(event.target.value)}>
          <option value="">新提示词</option>
          {prompts.map((prompt) => <option key={prompt.id} value={prompt.id}>{prompt.name}</option>)}
        </select>
        <input aria-label="提示词名称" value={promptName} onChange={(event) => setPromptName(event.target.value)} placeholder="提示词名称" />
        <textarea aria-label="提示词内容" value={promptContent} onChange={(event) => setPromptContent(event.target.value)} rows={2} placeholder="提示词内容" style={{ width: "100%", boxSizing: "border-box", marginTop: 8 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" onClick={savePrompt} disabled={!promptName.trim() || !promptContent.trim()}>保存提示词</button>
          <button type="button" onClick={() => setInput(promptContent)} disabled={!promptContent.trim() || loading}>插入输入框</button>
          <button type="button" onClick={removePrompt} disabled={!selectedPromptId}>删除提示词</button>
        </div>
      </section>

      {loadingProviders && <p role="status">正在加载 Provider…</p>}
      {error && <p role="alert">{error}</p>}

      <section aria-label="消息列表" style={{ minHeight: 220, border: "1px solid #ddd", padding: 12, marginBottom: 16 }}>
        {messages.length === 0 ? <p>还没有消息，输入内容开始对话。</p> : messages.map((message) => (
          <article key={message.id} data-role={message.role} style={{ marginBottom: 10 }}>
            <strong>{message.role === "user" ? "你" : "助手"}：</strong>{message.content || (loading && message.role === "assistant" ? "…" : "")}
          </article>
        ))}
      </section>

      <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
        <textarea aria-label="消息输入" value={input} onChange={(event) => setInput(event.target.value)} disabled={loading} rows={4} style={{ width: "100%", boxSizing: "border-box" }} placeholder="输入消息…" />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="submit" disabled={!canSend}>发送</button>
          <button type="button" onClick={stopGeneration} disabled={!loading}>停止生成</button>
          {retryRequest && <button type="button" onClick={() => void sendRequest(retryRequest)} disabled={loading}>重试</button>}
        </div>
      </form>
    </main>
  );
}
