"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { BuiltInPrompt } from "@/prompts/built-in-prompts";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  MAX_MAX_TOKENS,
  MAX_TEMPERATURE,
  MIN_MAX_TOKENS,
  MIN_TEMPERATURE,
  buildPageChatRequest,
  conversationMessagesForRequest,
  validMaxTokens,
  validTemperature,
  type PageChatRequest,
} from "@/ui/chat-settings";
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
import { SafeMarkdown } from "@/ui/safe-markdown";
import {
  addLocalDocuments,
  composeDocumentMessage,
  formatDocumentSize,
  type LocalDocument,
} from "@/ui/local-documents";
import { sessionExportFilename, sessionMarkdown } from "@/ui/session-export";
import styles from "./page.module.css";

interface PageProvider {
  id: string;
  name: string;
  configured: boolean;
  models: Array<{ id: string; name: string }>;
}

type RuntimeMode = "mock" | "live";

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
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [retryRequest, setRetryRequest] = useState<PageChatRequest | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("mock");
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cancelRequestedRef = useRef(false);
  const sessionsRef = useRef<LocalChatSession[]>([]);
  const activeSessionIdRef = useRef("");
  const messagesRef = useRef<LocalMessage[]>([]);
  const providerIdRef = useRef("");
  const modelIdRef = useRef("");
  const messageListRef = useRef<HTMLElement | null>(null);

  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const configuredProviders = runtimeMode === "live" ? providers.filter((provider) => provider.configured) : providers;
  const providerOptions = configuredProviders.length > 0 ? configuredProviders : providers;

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
    setDocuments([]);
    setError("");
    setRetryRequest(null);
  }

  function setVisibleMessages(nextMessages: LocalMessage[]) {
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  }

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

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
        return response.json() as Promise<{ mode?: RuntimeMode; providers?: PageProvider[] }>;
      })
      .then((body) => {
        if (!active) return;
        setRuntimeMode(body.mode === "live" ? "live" : "mock");
        const available = Array.isArray(body.providers) ? body.providers : [];
        setProviders(available);
        const selectable = body.mode === "live" ? available.filter((provider) => provider.configured) : available;
        const sessionProviders = selectable.length > 0 ? selectable : available;
        const fallbackProvider = sessionProviders[0];
        if (!fallbackProvider) return;

        let stored: LocalChatSession[] = [];
        try { stored = loadChatSessions(window.localStorage); }
        catch { setError("浏览器本地会话读取失败。"); }
        const normalized = stored.map((session) => {
          const provider = sessionProviders.find((item) => item.id === session.provider) ?? fallbackProvider;
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

  async function sendRequest(requestBody: PageChatRequest, userMessage?: LocalMessage) {
    const assistantId = makeId("assistant");
    const nextMessages = userMessage ? [...messagesRef.current, userMessage] : [...messagesRef.current];
    const withAssistant = [...nextMessages, { id: assistantId, role: "assistant" as const, content: "", reasoning: "", model: requestBody.model }];
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
        const payload = JSON.parse(event.data) as { text?: string; code?: string; message?: string; requestId?: string; model?: string; finishReason?: string };
        if (event.event === "message_start") {
          if (payload.model) setVisibleMessages(messagesRef.current.map((message) => message.id === assistantId ? { ...message, model: payload.model } : message));
          return;
        }
        if (event.event === "message_reasoning_delta" && payload.text) {
          setVisibleMessages(messagesRef.current.map((message) => message.id === assistantId ? { ...message, reasoning: (message.reasoning ?? "") + payload.text } : message));
          return;
        }
        if (event.event === "message_delta" && payload.text) {
          setVisibleMessages(messagesRef.current.map((message) => message.id === assistantId ? { ...message, content: message.content + payload.text } : message));
        } else if (event.event === "message_end") {
          ended = true;
          setVisibleMessages(messagesRef.current.map((message) => message.id === assistantId ? { ...message, finishReason: payload.finishReason ?? "stop" } : message));
        } else if (event.event === "error") {
          const diagnostics = [payload.code, payload.requestId].filter(Boolean).join(" · ");
          throw new ChatStreamError(payload.code ?? "STREAM_ERROR", `${payload.message ?? "流式请求失败。"}${diagnostics ? `（${diagnostics}）` : ""}`);
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
    const content = input.trim() || (documents.length > 0 ? "请阅读并分析所附文档。" : "");
    if (!content || loading || !providerId || !modelId) return;
    const requestContent = composeDocumentMessage(content, documents);
    const userMessage: LocalMessage = {
      id: makeId("user"),
      role: "user",
      content,
      attachments: documents.map((document) => ({ name: document.name, kind: document.kind })),
    };
    if (!validTemperature(temperature) || !validMaxTokens(maxTokens)) return;
    const requestBody = buildPageChatRequest(
      providerId,
      modelId,
      conversationMessagesForRequest([...messagesRef.current.map(({ role, content: text }) => ({ role, content: text })), { role: "user", content: requestContent }]),
      temperature,
      maxTokens,
    );
    setInput("");
    setDocuments([]);
    void sendRequest(requestBody, userMessage);
  }

  async function selectDocuments(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selectedFiles.length === 0) return;
    try {
      setDocuments(await addLocalDocuments(documents, selectedFiles));
      setError("");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "本地文档读取失败。");
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    sendMessage();
  }

  async function copyMessage(message: LocalMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? "" : current), 1600);
    } catch {
      setError("复制失败，请检查浏览器剪贴板权限。");
    }
  }

  function exportCurrentSession() {
    const session = selectChatSession(sessionsRef.current, activeSessionIdRef.current);
    if (!session || session.messages.length === 0) return;
    const blob = new Blob([sessionMarkdown(session)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sessionExportFilename(session);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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

  const settingsValid = validTemperature(temperature) && validMaxTokens(maxTokens);
  const providerReady = runtimeMode === "mock" || selectedProvider?.configured === true;
  const canSend = Boolean(providerId && modelId && (input.trim() || documents.length > 0)) && settingsValid && providerReady && !loading;

  return (
    <main className={styles.pageShell}>
      <div className={styles.backgroundGlow} aria-hidden="true" />

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">M</span>
          <div>
            <h1>ModelHub</h1>
            <p>智能对话工作台</p>
          </div>
        </div>
        <div className={styles.runtimeSummary}>
          <span className={`${styles.modeBadge} ${runtimeMode === "live" ? styles.modeLive : styles.modeMock}`}>
            <span className={styles.statusDot} aria-hidden="true" />
            {runtimeMode === "live" ? "LIVE" : "MOCK"}
          </span>
          <div className={styles.providerStatusList} aria-label="Provider 配置状态">
            {providers.map((provider) => (
              <span key={provider.id} className={styles.providerStatus} title={runtimeMode === "mock" ? "Mock 模式可用" : provider.configured ? "密钥已配置" : "密钥未配置"}>
                <i className={runtimeMode === "mock" || provider.configured ? styles.readyDot : styles.missingDot} />
                {provider.name}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <section aria-label="本地会话" className={styles.sideSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.eyebrow}>CONVERSATIONS</span>
                <h2>本地会话</h2>
              </div>
              <span className={styles.countBadge}>{sessions.length}/5</span>
            </div>
            <div className={styles.sessionActions}>
              <button className={styles.newButton} type="button" onClick={newSession} disabled={loading || loadingProviders}>
                <span aria-hidden="true">＋</span> 新建会话
              </button>
              <button className={styles.exportButton} type="button" onClick={exportCurrentSession} disabled={messages.length === 0} title="导出当前会话为 Markdown">
                导出
              </button>
            </div>
            <div className={styles.sessionList}>
              {sessions.map((session) => (
                <div key={session.id} className={styles.sessionRow}>
                  <button
                    type="button"
                    className={styles.sessionButton}
                    aria-pressed={session.id === activeSessionId}
                    onClick={() => switchSession(session.id)}
                    disabled={loading}
                  >
                    <span className={styles.sessionTitle}>{session.title}</span>
                    <span className={styles.sessionTime}>{new Date(session.updatedAt).toLocaleString()}</span>
                  </button>
                  <button className={styles.iconButton} type="button" aria-label={`删除会话 ${session.title}`} onClick={() => removeSession(session.id)} disabled={loading}>×</button>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="提示词" className={styles.sideSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.eyebrow}>PROMPTS</span>
                <h2>提示词库</h2>
              </div>
            </div>
            <label className={styles.field}>
              <span>快速选择</span>
              <select
                aria-label="选择内置或本地提示词"
                value={promptSelection}
                onChange={(event) => insertSelectedPrompt(event.target.value as PromptSelection)}
                disabled={loadingPrompts || loading}
              >
                <option value="">选择一个提示词</option>
                <optgroup label="内置提示词（只读）">
                  {builtInPrompts.map((prompt) => <option key={prompt.id} value={builtInPromptValue(prompt.id)}>{prompt.name}</option>)}
                </optgroup>
                <optgroup label="本地自定义提示词">
                  {prompts.map((prompt) => <option key={prompt.id} value={localPromptValue(prompt.id)}>{prompt.name}</option>)}
                </optgroup>
              </select>
            </label>
            <p className={styles.helperText}>选择后插入输入框，不会自动发送。</p>

            <details className={styles.promptEditor}>
              <summary>管理自定义提示词</summary>
              <div className={styles.promptEditorBody}>
                <select aria-label="选择提示词" value={selectedPromptId} onChange={(event) => selectPrompt(event.target.value)}>
                  <option value="">新提示词</option>
                  {prompts.map((prompt) => <option key={prompt.id} value={prompt.id}>{prompt.name}</option>)}
                </select>
                <input aria-label="提示词名称" value={promptName} onChange={(event) => setPromptName(event.target.value)} placeholder="提示词名称" />
                <textarea aria-label="提示词内容" value={promptContent} onChange={(event) => setPromptContent(event.target.value)} rows={3} placeholder="提示词内容" />
                <div className={styles.compactActions}>
                  <button type="button" onClick={savePrompt} disabled={!promptName.trim() || !promptContent.trim()}>保存</button>
                  <button type="button" onClick={() => setInput(promptContent)} disabled={!promptContent.trim() || loading}>插入</button>
                  <button className={styles.dangerTextButton} type="button" onClick={removePrompt} disabled={!selectedPromptId}>删除</button>
                </div>
              </div>
            </details>
          </section>

          <div className={styles.localNotice}>
            <span aria-hidden="true">◇</span>
            <p><strong>本地优先</strong><br />会话与提示词保存在浏览器；文档正文发送后即从页面内存移除。</p>
          </div>
        </aside>

        <section className={styles.chatPanel}>
          <header className={styles.chatHeader}>
            <div>
              <span className={styles.eyebrow}>ACTIVE CHAT</span>
              <h2>{selectChatSession(sessions, activeSessionId)?.title ?? "新会话"}</h2>
            </div>
            <div className={styles.activeModel}>
              <span className={providerReady ? styles.readyDot : styles.missingDot} />
              {selectedProvider?.name ?? "正在加载"} · {selectedProvider?.models.find((model) => model.id === modelId)?.name ?? "选择模型"}
            </div>
          </header>

          <div className={styles.notificationArea}>
            {!settingsValid && <p className={styles.alert} role="alert">Temperature 必须在 0–2 之间，max_tokens 必须是 1–32768 的整数。</p>}
            {loadingProviders && <p className={styles.statusMessage} role="status">正在加载模型服务…</p>}
            {runtimeMode === "live" && selectedProvider && !selectedProvider.configured && <p className={styles.alert} role="alert">当前没有可用密钥。请用安全启动脚本配置一个 Provider；配置后可在这里直接切换该 Provider 下的模型，无需重启。</p>}
            {error && <p className={styles.alert} role="alert">{error}</p>}
          </div>

          <section ref={messageListRef} aria-label="消息列表" className={styles.messageList}>
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyMark} aria-hidden="true">✦</div>
                <h2>开始一次新的对话</h2>
                <p>选择模型，输入问题，或从左侧提示词库快速开始。</p>
                <div className={styles.capabilityTags}>
                  <span>流式响应</span><span>本地文档</span><span>安全 Markdown</span><span>多模型切换</span>
                </div>
              </div>
            ) : messages.map((message) => (
              <article key={message.id} data-role={message.role} className={`${styles.message} ${message.role === "user" ? styles.userMessage : styles.assistantMessage}`}>
                <div className={styles.avatar} aria-hidden="true">{message.role === "user" ? "你" : "AI"}</div>
                <div className={styles.messageBody}>
                  <div className={styles.messageMeta}>
                    <strong>{message.role === "user" ? "你" : `智能助手${message.model ? ` · ${message.model}` : ""}`}</strong>
                    {message.role === "assistant" && message.content && (
                      <button className={styles.copyButton} type="button" onClick={() => void copyMessage(message)}>
                        {copiedMessageId === message.id ? "已复制" : "复制"}
                      </button>
                    )}
                  </div>
                  {message.attachments?.length ? (
                    <div className={styles.messageAttachments}>
                      {message.attachments.map((attachment) => <span key={`${message.id}-${attachment.name}`}>⌁ {attachment.name}</span>)}
                    </div>
                  ) : null}
                  {message.role === "assistant" && message.reasoning ? (
                    <details className={styles.reasoningPanel} open={loading && message.id === messages[messages.length - 1]?.id}>
                      <summary>{loading && !message.content ? "正在思考" : "查看思考过程"}</summary>
                      <div><SafeMarkdown content={message.reasoning} /></div>
                    </details>
                  ) : null}
                  <div className={styles.messageContent}>
                    {message.role === "assistant"
                      ? (message.content
                        ? <SafeMarkdown content={message.content} />
                        : (loading
                          ? <span className={styles.typing}>{message.reasoning ? "正在生成答复" : "正在等待模型响应"}</span>
                          : <span className={styles.incompleteReply}>{message.finishReason === "length" ? "输出上限已用尽，模型未生成最终答复。请提高 Max tokens 后重试。" : "模型没有返回最终答复。"}</span>))
                      : message.content}
                  </div>
                  {message.role === "assistant" && message.content && message.finishReason === "length" ? (
                    <p className={styles.truncationNotice}>回答因输出上限而截断；可提高 Max tokens 后重试。</p>
                  ) : null}
                </div>
              </article>
            ))}
          </section>

          <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
            {documents.length > 0 && (
              <div className={styles.documentTray} aria-label="已选择的本地文档">
                {documents.map((document) => (
                  <span className={styles.documentChip} key={document.id}>
                    <i>{document.kind.toUpperCase()}</i>
                    <span>{document.name}<small>{formatDocumentSize(document.size)}</small></span>
                    <button type="button" aria-label={`移除文档 ${document.name}`} onClick={() => setDocuments((items) => items.filter((item) => item.id !== document.id))}>×</button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              aria-label="消息输入"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              disabled={loading}
              rows={3}
              placeholder="输入你的问题。Enter 发送，Shift + Enter 换行…"
            />
            <div className={styles.composerFooter}>
              <div className={styles.composerTools}>
                <input ref={fileInputRef} className={styles.fileInput} type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" multiple onChange={(event) => void selectDocuments(event)} />
                <button className={styles.attachButton} type="button" onClick={() => fileInputRef.current?.click()} disabled={loading || documents.length >= 3}>
                  <span aria-hidden="true">＋</span> 本地文档
                </button>
                <span className={styles.characterCount}>{input.length} 字符 · {documents.length}/3 文档（单个 1 MB）</span>
              </div>
              <div className={styles.composerActions}>
                <select className={styles.inlineSelect} aria-label="服务商" value={providerId} onChange={(event) => changeProvider(event.target.value)} disabled={loadingProviders || loading}>
                  {providerOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                </select>
                <select className={`${styles.inlineSelect} ${styles.inlineModelSelect}`} aria-label="模型" value={modelId} onChange={(event) => changeModel(event.target.value)} disabled={!selectedProvider || loading}>
                  {selectedProvider?.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
                <details className={styles.advancedSettings}>
                  <summary aria-label="生成参数">参数</summary>
                  <div className={styles.advancedPanel}>
                    <label className={styles.field}>
                      <span>Temperature</span>
                      <input aria-label="Temperature" type="number" min={MIN_TEMPERATURE} max={MAX_TEMPERATURE} step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} disabled={loading} />
                    </label>
                    <label className={styles.field}>
                      <span>Max tokens</span>
                      <input aria-label="Max tokens" type="number" min={MIN_MAX_TOKENS} max={MAX_MAX_TOKENS} step="1" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} disabled={loading} />
                    </label>
                  </div>
                </details>
                {retryRequest && <button className={styles.secondaryButton} type="button" onClick={() => void sendRequest(retryRequest)} disabled={loading}>重试</button>}
                {loading && <button className={styles.secondaryButton} type="button" onClick={stopGeneration}>停止</button>}
                <button className={styles.primaryButton} type="submit" disabled={!canSend}>
                  发送 <span aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
