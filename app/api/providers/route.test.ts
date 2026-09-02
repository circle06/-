import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/providers", () => {
  it("returns all four public provider metadata entries without secrets", async () => {
    vi.stubEnv("ACCESS_CODE", "");
    const response = GET(new Request("http://localhost/api/providers"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.providers.map((provider: { id: string }) => provider.id)).toEqual(["openai", "anthropic", "deepseek", "glm"]);
    expect(JSON.stringify(body)).not.toContain("API_KEY");
    expect(JSON.stringify(body)).not.toContain("allowedBaseUrls");
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
