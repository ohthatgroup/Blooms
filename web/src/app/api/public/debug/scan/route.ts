import { NextResponse } from "next/server";
import { enforcePublicRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ingestScanDebugEventSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = ingestScanDebugEventSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limitResult = await enforcePublicRateLimit(
    `scan-debug:${parsed.data.token}:${ip}`,
  );
  if (!limitResult.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const admin = createSupabaseAdminClient();
  const { data: link, error: linkError } = await admin
    .from("customer_links")
    .select("id,active")
    .eq("token", parsed.data.token)
    .single();

  if (linkError || !link || !link.active) {
    return NextResponse.json({ error: "Invalid link token" }, { status: 404 });
  }

  const { error: insertError } = await admin.from("scan_debug_events").insert({
    session_id: parsed.data.session_id,
    customer_link_id: link.id,
    source: parsed.data.source,
    event_type: parsed.data.event_type ?? parsed.data.source,
    message: parsed.data.message,
    details: parsed.data.details ?? {},
    page_url: parsed.data.page_url ?? null,
    ip,
    user_agent: request.headers.get("user-agent") ?? null,
  });

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to save scan debug event", details: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
