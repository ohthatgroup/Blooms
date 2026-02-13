import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { triggerParserWorkflow } from "@/lib/github-actions";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const payload = (await request.json().catch(() => ({}))) as {
    reason?: string;
    catalog_id?: string;
  };

  const result = await triggerParserWorkflow({
    reason: payload.reason ?? "manual_dashboard_trigger",
    catalogId: payload.catalog_id,
  });

  if (!result.triggered) {
    return NextResponse.json(
      {
        ok: false,
        message: result.message,
        status: result.status,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: result.message,
    status: result.status,
  });
}

