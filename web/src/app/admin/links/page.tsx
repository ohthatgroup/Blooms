import { requireAdminPage } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin-nav";
import { LinksManagerClient } from "@/components/admin/links-manager-client";
import { env } from "@/lib/env";

export default async function AdminLinksPage() {
  await requireAdminPage();
  const admin = createSupabaseAdminClient();
  const { data: catalogs } = await admin
    .from("catalogs")
    .select("id,version_label")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const { data: links } = await admin
    .from("customer_links")
    .select("id,token,catalog_id,customer_name,active,created_at,catalogs(version_label)")
    .order("created_at", { ascending: false });

  const initialLinks = (links ?? []).map((link) => ({
    ...link,
    catalogs: Array.isArray(link.catalogs) ? link.catalogs[0] : link.catalogs,
    url: `${env.APP_BASE_URL}/o/${link.token}`,
  }));

  return (
    <div className="container grid">
      <AdminNav />
      <LinksManagerClient
        publishedCatalogs={catalogs ?? []}
        initialLinks={initialLinks}
      />
    </div>
  );
}
