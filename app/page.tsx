"use client";

import { useEffect, useRef, useState } from "react";
import { parseSseText, type ParsedSseEvent } from "@/ui/chat-sse";

interface PageProvider {
  id: string;
  name: string;
  models: Array<{ id: string; name: string }>;
}

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
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
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [retryRequest, setRetryRequest] = useState<ChatRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);

  const selectedProvider = providers.find((provider) => provider.id === providerId);

  useEffect(() => {
    let active = true;
    void fetch("/api/providers")
      .then(async (response) => {
        if (!response.ok) throw await readError(response);
        return response.json() as Promise<{ providers?: PageProvider[] }>;
      })
      .then((body) => {
        if (!active) return;
        const available = Array.isArray(body.providers) ? body.providers : [];
        setProviders(available);
        const first = available[0];
        setProviderId(first?.id ?? "");
        setModelId(first?.models[0]?.id ?? "");
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
    setProviderId(nextProviderId);
    setModelId(nextProvider?.models[0]?.id ?? "");
  }

  async function sendRequest(requestBody: ChatRequest, userMessage?: UiMessage) {
    const assistantId = makeId("assistant");
    if (userMessage) setMessages((current) => [...current, userMessage]);
    setMessages((current) => [...current, { id: assistantId, role: "assistant", content: "" }]);
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
      const consume = (flush: boolean) => {
        const blocks = buffer.split(/\r?\n\r?\n/);
        if (!flush) buffer = blocks.pop() ?? "";
        else buffer = "";
        return blocks.flatMap((block) => parseSseText(block));
      };
      const handleEvent = (event: ParsedSseEvent) => {
        const payload = JSON.parse(event.data) as { text?: string; code?: string; message?: string };
        if (event.event === "message_delta" && payload.text) {
          setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + payload.text } : message));
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
      setRetryRequest(null);
    } catch (reason: unknown) {
      if (controller.signal.aborted && cancelRequestedRef.current) {
        setRetryRequest(requestBody);
      } else {
        setMessages((current) => current.filter((message) => message.id !== assistantId));
        setRetryRequest(requestBody);
        setError(reason instanceof Error ? reason.message : "流式请求失败。");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      cancelRequestedRef.current = false;
    }
  }

  function sendMessage() {
    const content = input.trim();
    if (!content || loading || !providerId || !modelId) return;
    const userMessage: UiMessage = { id: makeId("user"), role: "user", content };
    const requestBody: ChatRequest = {
      provider: providerId,
      model: modelId,
      messages: [...messages.map(({ role, content: text }) => ({ role, content: text })), { role: "user", content }],
    };
    setInput("");
    void sendRequest(requestBody, userMessage);
  }

  function stopGeneration() {
    if (!abortRef.current) return;
    cancelRequestedRef.current = true;
    abortRef.current.abort();
  }

  const canSend = Boolean(providerId && modelId && input.trim()) && !loading;

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>MultiProvider LLM Toolbox</h1>
      <p>基础聊天界面（当前使用服务端 Mock 模式）。</p>

      <section aria-label="Provider 设置" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <label>
          Provider
          <select value={providerId} onChange={(event) => changeProvider(event.target.value)} disabled={loadingProviders || loading}>
            {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </label>
        <label>
          模型
          <select value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={!selectedProvider || loading}>
            {selectedProvider?.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
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
