import { NextResponse } from "next/server";
import { RequestValidationError, validateChatRequest } from "@/domain/request-validation";
import { MockProviderError } from "@/providers/mock-provider";
import { ProviderRegistryError, providerRegistry, type ProviderRegistry } from "@/providers/registry";

const DEFAULT_TIMEOUT_MS = 60_000;
type ChatErrorCode = "INVALID_REQUEST" | "PROVIDER_NOT_ALLOWED" | "MODEL_NOT_ALLOWED" | "UPSTREAM_UNAVAILABLE" | "UPSTREAM_TIMEOUT" | "CLIENT_CLOSED" | "INTERNAL_ERROR";
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

export interface ChatHandlerOptions { registry?: ProviderRegistry; timeoutMs?: number; requestIdFactory?: () => string }

export function createChatHandler(options: ChatHandlerOptions = {}) {
  const registry = options.registry ?? providerRegistry;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestIdFactory = options.requestIdFactory ?? (() => crypto.randomUUID());
  return async function handleChat(request: Request): Promise<NextResponse> {
    const requestId = requestIdFactory();
    if (request.signal.aborted) return errorResponse(requestId, { status: 499, code: "CLIENT_CLOSED", message: "客户端已取消请求。" });
    try {
      const validated = validateChatRequest(await request.json(), registry);
      if (validated.stream) throw new RequestValidationError("Streaming chat is not available yet.");
      const result = await callWithControls(request, registry.getProvider(validated.provider), validated.request, requestId, timeoutMs);
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
