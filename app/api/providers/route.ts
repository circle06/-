import { NextResponse } from "next/server";
import { providerRegistry } from "@/providers/registry";
import { runtimeModeFromEnv } from "@/providers/provider-factory";
import { hasConfiguredApiKey } from "@/providers/adapters/transport";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const configuredAccessCode = process.env.ACCESS_CODE;
  if (configuredAccessCode && request.headers.get("x-access-code") !== configuredAccessCode) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Access denied." } }, { status: 401 });
  }
  const mode = runtimeModeFromEnv();
  const providers = providerRegistry.listPublicProviders().map((provider) => ({
    ...provider,
    configured: hasConfiguredApiKey(providerRegistry.getConfig(provider.id).apiKeyEnv),
  }));
  return NextResponse.json({ mode, providers });
}
