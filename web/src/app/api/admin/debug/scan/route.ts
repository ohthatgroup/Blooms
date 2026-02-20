import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim() ?? "";
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "200", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 500)
    : 200;

  let linkIdFilter: string | null = null;
  if (token) {
    const { data: link, error: linkError } = await auth.admin
      .from("customer_links")
      .select("id")
      .eq("token", token)
      .maybeSingle();

    if (linkError) {
      return NextResponse.json(
        { error: "Failed to resolve link token", details: linkError.message },
        { status: 500 },
      );
    }

    if (!link) {
      return NextResponse.json({ events: [] });
    }

    linkIdFilter = link.id;
  }

  let query = auth.admin
    .from("scan_debug_events")
    .select(
      "id,session_id,source,event_type,message,details,page_url,ip,user_agent,created_at,customer_links(customer_name,token)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }
  if (linkIdFilter) {
    query = query.eq("customer_link_id", linkIdFilter);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch scan debug events", details: error.message },
      { status: 500 },
    );
  }

  const events = (data ?? []).map((event) => ({
    ...event,
    customer_links: Array.isArray(event.customer_links)
      ? event.customer_links[0]
      : event.customer_links,
  }));

  return NextResponse.json({ events });
}
