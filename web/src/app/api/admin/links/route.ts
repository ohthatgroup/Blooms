import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { createCustomerLinkSchema } from "@/lib/validation";
import { AppBaseUrlError, resolveAppBaseUrl } from "@/lib/url";

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let baseUrl = "";
  try {
    baseUrl = resolveAppBaseUrl({ request, requirePublicInProduction: true });
  } catch (error) {
    if (error instanceof AppBaseUrlError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }

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

  const linkIds = (data ?? []).map((link) => link.id);
  let activeOrdersByLinkId = new Map<
    string,
    {
      id: string;
      total_skus: number;
      total_cases: number;
      updated_at: string | null;
    }
  >();

  if (linkIds.length > 0) {
    const { data: activeOrders, error: orderError } = await auth.admin
      .from("orders")
      .select("id,customer_link_id,total_skus,total_cases,updated_at")
      .in("customer_link_id", linkIds)
      .is("archived_at", null);

    if (orderError) {
      return NextResponse.json(
        { error: "Failed to fetch link order summary", details: orderError.message },
        { status: 500 },
      );
    }

    activeOrdersByLinkId = new Map(
      (activeOrders ?? []).map((order) => [
        order.customer_link_id,
        {
          id: order.id,
          total_skus: order.total_skus ?? 0,
          total_cases: order.total_cases ?? 0,
          updated_at: order.updated_at ?? null,
        },
      ]),
    );
  }

  const links = (data ?? []).map((link) => {
    const activeOrder = activeOrdersByLinkId.get(link.id);
    return {
      ...link,
      catalogs: Array.isArray(link.catalogs) ? link.catalogs[0] : link.catalogs,
      url: `${baseUrl}/o/${link.token}`,
      has_order: Boolean(activeOrder),
      order_id: activeOrder?.id ?? null,
      total_skus: activeOrder?.total_skus ?? 0,
      total_cases: activeOrder?.total_cases ?? 0,
      updated_at: activeOrder?.updated_at ?? null,
    };
  });

  return NextResponse.json({ links });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let baseUrl = "";
  try {
    baseUrl = resolveAppBaseUrl({ request, requirePublicInProduction: true });
  } catch (error) {
    if (error instanceof AppBaseUrlError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }

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
