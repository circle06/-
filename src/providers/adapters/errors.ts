export type ProviderAdapterErrorCode = "PROVIDER_NOT_CONFIGURED" | "UPSTREAM_AUTH_ERROR" | "UPSTREAM_BAD_REQUEST" | "UPSTREAM_UNAVAILABLE" | "UPSTREAM_TIMEOUT" | "CLIENT_CLOSED";

export class ProviderAdapterError extends Error {
  constructor(readonly code: ProviderAdapterErrorCode, message: string, readonly status?: number) {
    super(message);
    this.name = "ProviderAdapterError";
  }
}
