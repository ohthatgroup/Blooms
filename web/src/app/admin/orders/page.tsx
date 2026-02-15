import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { LinksManagerClient } from "@/components/admin/links-manager-client";
import { AppBaseUrlError, resolveAppBaseUrl } from "@/lib/url";
import { headers } from "next/headers";

export default async function AdminOrdersPage() {
  const admin = createSupabaseAdminClient();

  let baseUrl = "";
  let baseUrlError = "";
  try {
    const headerStore = await headers();
    baseUrl = resolveAppBaseUrl({
      headers: headerStore,
      requirePublicInProduction: true,
    });
  } catch (error) {
    if (error instanceof AppBaseUrlError) {
      baseUrlError = error.message;
    } else {
      throw error;
    }
  }

  const { data: catalogs } = await admin
    .from("catalogs")
    .select("id,version_label")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const { data: links } = await admin
    .from("customer_links")
    .select("id,token,catalog_id,customer_name,active,created_at,catalogs(version_label)")
    .order("created_at", { ascending: false });

  const linkIds = (links ?? []).map((link) => link.id);
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
    const { data: activeOrders } = await admin
      .from("orders")
      .select("id,customer_link_id,total_skus,total_cases,updated_at")
      .in("customer_link_id", linkIds)
      .is("archived_at", null);

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

  const initialLinks = (links ?? []).map((link) => ({
    ...link,
    catalogs: Array.isArray(link.catalogs) ? link.catalogs[0] : link.catalogs,
    url: baseUrl ? `${baseUrl}/o/${link.token}` : "",
    has_order: activeOrdersByLinkId.has(link.id),
    order_id: activeOrdersByLinkId.get(link.id)?.id ?? null,
    total_skus: activeOrdersByLinkId.get(link.id)?.total_skus ?? 0,
    total_cases: activeOrdersByLinkId.get(link.id)?.total_cases ?? 0,
    updated_at: activeOrdersByLinkId.get(link.id)?.updated_at ?? null,
  }));

  return (
    <div className="container grid">
      <div className="section-header">
        <h2 className="section-header__title">Orders &amp; Links</h2>
      </div>
      {baseUrlError && (
        <span className="badge badge--error">
          <span className="badge__dot" />
          {baseUrlError}
        </span>
      )}
      <LinksManagerClient
        publishedCatalogs={catalogs ?? []}
        initialLinks={initialLinks}
      />
    </div>
  );
}
