import { ProviderAdapterError } from "@/providers/adapters/errors";
import type { ProviderCallContext } from "@/domain/provider";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function providerUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export async function fetchWithContext(fetcher: FetchLike, url: string, init: RequestInit, context: ProviderCallContext, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => { timedOut = true; controller.abort(new Error("Provider timeout")); }, timeoutMs);
  const onAbort = () => controller.abort(context.signal.reason);
  context.signal.addEventListener("abort", onAbort, { once: true });
  let abortReject: ((error: DOMException) => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => { abortReject = reject; if (context.signal.aborted) abortReject(new DOMException("Request aborted", "AbortError")); });
  let timeoutRaceId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => { timeoutRaceId = setTimeout(() => reject(new ProviderAdapterError("UPSTREAM_TIMEOUT", "Upstream request timed out.")), timeoutMs); });
  const onContextAbort = () => abortReject?.(new DOMException("Request aborted", "AbortError"));
  context.signal.addEventListener("abort", onContextAbort, { once: true });
  try {
    const response = await Promise.race([fetcher(url, { ...init, signal: controller.signal }), timeoutPromise, abortPromise]);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new ProviderAdapterError("UPSTREAM_AUTH_ERROR", "Upstream authentication failed.", response.status);
      if (response.status >= 400 && response.status < 500) throw new ProviderAdapterError("UPSTREAM_BAD_REQUEST", "Upstream rejected the request.", response.status);
      throw new ProviderAdapterError("UPSTREAM_UNAVAILABLE", "Upstream service is unavailable.", response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderAdapterError) throw error;
    if (timedOut) throw new ProviderAdapterError("UPSTREAM_TIMEOUT", "Upstream request timed out.");
    if (context.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw new ProviderAdapterError("CLIENT_CLOSED", "Client cancelled the request.");
    throw new ProviderAdapterError("UPSTREAM_UNAVAILABLE", "Upstream service is unavailable.");
  } finally {
    clearTimeout(timeoutId);
    if (timeoutRaceId) clearTimeout(timeoutRaceId);
    context.signal.removeEventListener("abort", onAbort);
    context.signal.removeEventListener("abort", onContextAbort);
  }
}

export function requireApiKey(apiKeyEnv: string): string {
  const key = process.env[apiKeyEnv];
  if (!key) throw new ProviderAdapterError("PROVIDER_NOT_CONFIGURED", "Provider credentials are not configured.");
  return key;
}

export async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; }
  catch { throw new ProviderAdapterError("UPSTREAM_BAD_REQUEST", "Upstream returned invalid JSON."); }
}

export async function* sseLines(response: Response): AsyncIterable<{ event?: string; data: string }> {
  if (!response.body) throw new ProviderAdapterError("UPSTREAM_UNAVAILABLE", "Upstream returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | undefined;
  let data: string[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "") {
          if (data.length > 0) { yield { event, data: data.join("\n") }; }
          event = undefined; data = []; continue;
        }
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
    }
    if (data.length > 0) yield { event, data: data.join("\n") };
  } finally { reader.releaseLock(); }
}
