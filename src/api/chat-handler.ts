import { NextResponse } from "next/server";
import { RequestValidationError, validateChatRequest } from "@/domain/request-validation";
import { MockProviderError } from "@/providers/mock-provider";
import { ProviderAdapterError } from "@/providers/adapters/errors";
import { ProviderRegistryError, providerRegistry, type ProviderRegistry } from "@/providers/registry";
import { ProviderFactory, providerFactory } from "@/providers/provider-factory";
import type { NormalizedStreamEvent } from "@/domain/provider";

const DEFAULT_TIMEOUT_MS = 180_000;
type ChatErrorCode = "INVALID_REQUEST" | "PROVIDER_NOT_ALLOWED" | "MODEL_NOT_ALLOWED" | "PROVIDER_NOT_CONFIGURED" | "UPSTREAM_AUTH_ERROR" | "UPSTREAM_BAD_REQUEST" | "UPSTREAM_UNAVAILABLE" | "UPSTREAM_TIMEOUT" | "CLIENT_CLOSED" | "INTERNAL_ERROR";
interface ChatErrorResponse { status: number; code: ChatErrorCode; message: string }

function errorResponse(requestId: string, error: ChatErrorResponse): NextResponse {
  return NextResponse.json({ error: { code: error.code, message: error.message, requestId } }, { status: error.status });
}

function classifyError(error: unknown, timedOut: boolean, clientClosed: boolean): ChatErrorResponse {
  if (timedOut) return { status: 504, code: "UPSTREAM_TIMEOUT", message: "上游响应超时。" };
  if (clientClosed) return { status: 499, code: "CLIENT_CLOSED", message: "客户端已取消请求。" };
  if (error instanceof RequestValidationError) return { status: 400, code: error.code, message: error.message };
  if (error instanceof ProviderRegistryError) return { status: 400, code: error.code, message: error.message };
  if (error instanceof MockProviderError) return error.code === "UPSTREAM_TIMEOUT" ? { status: 504, code: "UPSTREAM_TIMEOUT", message: "上游响应超时。" } : { status: 502, code: "UPSTREAM_UNAVAILABLE", message: "上游服务暂时不可用。" };
  if (error instanceof ProviderAdapterError) {
    if (error.code === "PROVIDER_NOT_CONFIGURED") return { status: 503, code: error.code, message: "Provider 尚未配置。" };
    if (error.code === "UPSTREAM_AUTH_ERROR") return { status: 502, code: error.code, message: "上游鉴权失败。" };
    if (error.code === "UPSTREAM_BAD_REQUEST") return { status: 502, code: error.code, message: "上游拒绝了请求。" };
    if (error.code === "UPSTREAM_TIMEOUT") return { status: 504, code: error.code, message: "上游响应超时。" };
    if (error.code === "CLIENT_CLOSED") return { status: 499, code: error.code, message: "客户端已取消请求。" };
    return { status: 502, code: "UPSTREAM_UNAVAILABLE", message: "上游服务暂时不可用。" };
  }
  if (error instanceof DOMException && error.name === "AbortError") return { status: 499, code: "CLIENT_CLOSED", message: "客户端已取消请求。" };
  return { status: 502, code: "UPSTREAM_UNAVAILABLE", message: "上游服务暂时不可用。" };
}

async function callWithControls(request: Request, provider: ReturnType<ProviderRegistry["getProvider"]>, normalizedRequest: Parameters<ReturnType<ProviderRegistry["getProvider"]>["chat"]>[0], requestId: string, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  let clientClosed = request.signal.aborted;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortReject: ((error: DOMException) => void) | undefined;
  const onAbort = () => { clientClosed = true; controller.abort(request.signal.reason); abortReject?.(new DOMException("Request aborted", "AbortError")); };
  request.signal.addEventListener("abort", onAbort, { once: true });
  const abortPromise = new Promise<never>((_, reject) => { abortReject = reject; if (request.signal.aborted) onAbort(); });
  const timeoutPromise = new Promise<never>((_, reject) => { timeoutId = setTimeout(() => { timedOut = true; controller.abort(new Error("Provider timeout")); reject(new Error("Provider timeout")); }, timeoutMs); });
  try {
    const responsePromise = provider.chat(normalizedRequest, { requestId, signal: controller.signal, timeoutMs });
    return { response: await Promise.race([responsePromise, timeoutPromise, abortPromise]), timedOut: false, clientClosed: false };
  } catch (error) {
    return { error, timedOut, clientClosed };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    request.signal.removeEventListener("abort", onAbort);
  }
}

function sse(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamEvent(event: NormalizedStreamEvent, requestId: string): { name: string; data: unknown } {
  if (event.type === "start") return { name: "message_start", data: { requestId, provider: event.provider, model: event.model } };
  if (event.type === "reasoning_delta") return { name: "message_reasoning_delta", data: { text: event.text } };
  if (event.type === "delta") return { name: "message_delta", data: { text: event.text } };
  if (event.type === "usage") return { name: "message_delta", data: { usage: event.usage } };
  if (event.type === "done") return { name: "message_end", data: { finishReason: event.finishReason } };
  return { name: "error", data: { requestId, code: event.code, message: event.message } };
}

function streamResponse(request: Request, provider: ReturnType<ProviderRegistry["getProvider"]>, normalizedRequest: Parameters<ReturnType<ProviderRegistry["getProvider"]>["stream"]>[0], requestId: string, timeoutMs: number): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const abortController = new AbortController();
      let clientClosed = request.signal.aborted;
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let abortReject: ((error: DOMException) => void) | undefined;
      const onAbort = () => { clientClosed = true; abortController.abort(request.signal.reason); abortReject?.(new DOMException("Request aborted", "AbortError")); };
      request.signal.addEventListener("abort", onAbort, { once: true });
      const abortPromise = new Promise<never>((_, reject) => { abortReject = reject; if (request.signal.aborted) onAbort(); });
      const timeoutPromise = new Promise<never>((_, reject) => { timeoutId = setTimeout(() => { timedOut = true; abortController.abort(new Error("Provider timeout")); reject(new Error("Provider timeout")); }, timeoutMs); });

      void (async () => {
        let ended = false;
        let usage: unknown;
        try {
          const iterator = provider.stream(normalizedRequest, { requestId, signal: abortController.signal, timeoutMs })[Symbol.asyncIterator]();
          while (!ended) {
            const result = await Promise.race([iterator.next(), timeoutPromise, abortPromise]);
            if (clientClosed || timedOut) break;
            if (result.done) break;
            if (result.value.type === "usage") usage = result.value.usage;
            const mapped = streamEvent(result.value, requestId);
            if (mapped.name === "message_end" && usage) mapped.data = { ...mapped.data as object, usage };
            controller.enqueue(encoder.encode(sse(mapped.name, mapped.data)));
            if (mapped.name === "message_end" || mapped.name === "error") ended = true;
          }
        } catch (error) {
          if (!clientClosed) {
            const mapped = classifyError(error, timedOut, clientClosed);
            controller.enqueue(encoder.encode(sse("error", { requestId, code: mapped.code, message: mapped.message })));
          }
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          request.signal.removeEventListener("abort", onAbort);
          controller.close();
        }
      })();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}

export interface ChatHandlerOptions { registry?: ProviderRegistry; factory?: ProviderFactory; timeoutMs?: number; requestIdFactory?: () => string }

export function createChatHandler(options: ChatHandlerOptions = {}) {
  const factory = options.factory ?? providerFactory;
  const registry = options.registry ?? factory.getRegistry() ?? providerRegistry;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestIdFactory = options.requestIdFactory ?? (() => crypto.randomUUID());
  return async function handleChat(request: Request): Promise<Response> {
    const requestId = requestIdFactory();
    if (request.signal.aborted) return errorResponse(requestId, { status: 499, code: "CLIENT_CLOSED", message: "客户端已取消请求。" });
    try {
      const validated = validateChatRequest(await request.json(), registry);
      const provider = options.registry ? registry.getProvider(validated.provider) : factory.getProvider(validated.provider);
      if (validated.stream) return streamResponse(request, provider, validated.request, requestId, timeoutMs);
      const result = await callWithControls(request, provider, validated.request, requestId, timeoutMs);
      if ("error" in result) {
        const providerError = result.error instanceof Error ? result.error : new Error("Provider call failed.");
        throw Object.assign(providerError, { __timedOut: result.timedOut, __clientClosed: result.clientClosed });
      }
      return NextResponse.json({ requestId, ...result.response });
    } catch (error) {
      const typedError = error as { __timedOut?: boolean; __clientClosed?: boolean };
      return errorResponse(requestId, classifyError(error, typedError.__timedOut ?? false, typedError.__clientClosed ?? false));
    }
  };
}
