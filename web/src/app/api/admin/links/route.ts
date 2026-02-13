import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { createCustomerLinkSchema } from "@/lib/validation";
import { resolveAppBaseUrl } from "@/lib/url";

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const baseUrl = resolveAppBaseUrl({ request });

  const { data, error } = await auth.admin
    .from("customer_links")
    .select(
      "id,token,catalog_id,customer_name,active,created_at,disabled_at,catalogs!inner(version_label)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch links", details: error.message },
      { status: 500 },
    );
  }

  const links = (data ?? []).map((link) => ({
    ...link,
    url: `${baseUrl}/o/${link.token}`,
  }));
  return NextResponse.json({ links });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const baseUrl = resolveAppBaseUrl({ request });

  const payload = await request.json().catch(() => null);
  const parsed = createCustomerLinkSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const token = nanoid(24);
  const { data, error } = await auth.admin
    .from("customer_links")
    .insert({
      token,
      catalog_id: parsed.data.catalog_id,
      customer_name: parsed.data.customer_name,
      active: true,
      created_by: auth.user.id,
    })
    .select("id,token")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to create customer link", details: error?.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      link_id: data.id,
      token: data.token,
      url: `${baseUrl}/o/${data.token}`,
    },
    { status: 201 },
  );
}
