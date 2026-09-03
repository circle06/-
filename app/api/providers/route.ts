import { NextResponse } from "next/server";
import { providerRegistry } from "@/providers/registry";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const configuredAccessCode = process.env.ACCESS_CODE;
  if (configuredAccessCode && request.headers.get("x-access-code") !== configuredAccessCode) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Access denied." } }, { status: 401 });
  }
  return NextResponse.json({ providers: providerRegistry.listPublicProviders() });
}
