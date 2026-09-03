import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "multi-provider-llm-toolbox",
    version: "0.1.0",
  });
}
