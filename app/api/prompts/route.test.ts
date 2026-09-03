import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => { vi.unstubAllEnvs(); });

describe("GET /api/prompts", () => {
  it("returns only the server-defined read-only prompt fields", async () => {
    vi.stubEnv("ACCESS_CODE", "");
    const response = GET(new Request("http://localhost/api/prompts"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.prompts).toHaveLength(3);
    expect(body.prompts.map((prompt: { id: string }) => prompt.id)).toEqual(["summarize", "translate-zh-en", "explain-code"]);
    expect(body.prompts[0]).toEqual(expect.objectContaining({ name: "总结", content: expect.any(String), updatedAt: expect.any(String) }));
    expect(Object.keys(body.prompts[0]).sort()).toEqual(["content", "id", "name", "updatedAt"]);
    expect(JSON.stringify(body)).not.toContain("apiKey");
    expect(JSON.stringify(body)).not.toContain("baseUrl");
  });

  it("enforces the existing access-code boundary when configured", async () => {
    vi.stubEnv("ACCESS_CODE", "test-access-code");
    const denied = GET(new Request("http://localhost/api/prompts"));
    expect(denied.status).toBe(401);
    const allowed = GET(new Request("http://localhost/api/prompts", { headers: { "x-access-code": "test-access-code" } }));
    expect(allowed.status).toBe(200);
  });
});
