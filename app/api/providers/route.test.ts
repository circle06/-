import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/providers", () => {
  it("returns all four public provider metadata entries without secrets", async () => {
    vi.stubEnv("ACCESS_CODE", "");
    vi.stubEnv("LLM_MODE", "mock");
    const response = GET(new Request("http://localhost/api/providers"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.providers.map((provider: { id: string }) => provider.id)).toEqual(["openai", "anthropic", "deepseek", "glm"]);
    expect(JSON.stringify(body)).not.toContain("API_KEY");
    expect(JSON.stringify(body)).not.toContain("allowedBaseUrls");
    expect(body.mode).toBe("mock");
    expect(body.providers.every((provider: { configured: boolean }) => provider.configured === false)).toBe(true);
  });

  it("reports live credential configuration as booleans only", async () => {
    vi.stubEnv("ACCESS_CODE", "");
    vi.stubEnv("LLM_MODE", "live");
    vi.stubEnv("DEEPSEEK_API_KEY", "test-only-secret");
    const response = GET(new Request("http://localhost/api/providers"));
    const body = await response.json();
    expect(body.mode).toBe("live");
    expect(body.providers.find((provider: { id: string }) => provider.id === "deepseek").configured).toBe(true);
    expect(JSON.stringify(body)).not.toContain("test-only-secret");
  });

  it("enforces ACCESS_CODE when configured", async () => {
    vi.stubEnv("ACCESS_CODE", "local-only-test-code");
    const denied = GET(new Request("http://localhost/api/providers"));
    expect(denied.status).toBe(401);
    const allowed = GET(new Request("http://localhost/api/providers", { headers: { "X-Access-Code": "local-only-test-code" } }));
    expect(allowed.status).toBe(200);
    vi.unstubAllEnvs();
  });
});
