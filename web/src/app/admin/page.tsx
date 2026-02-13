import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CatalogUploadPanel } from "@/components/admin/catalog-upload-panel";
import { AdminNav } from "@/components/admin-nav";
import { SignOutButton } from "@/components/signout-button";
import { TriggerParserButton } from "@/components/admin/trigger-parser-button";
import { CatalogDeleteButton } from "@/components/admin/catalog-delete-button";

export default async function AdminPage() {
  await requireAdminPage();
  const admin = createSupabaseAdminClient();

  const { data: catalogs } = await admin
    .from("catalogs")
    .select("id,version_label,status,parse_status,parse_summary,created_at,published_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="container grid">
      <AdminNav />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <TriggerParserButton />
        <SignOutButton />
      </div>
      <CatalogUploadPanel />
      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0 }}>Catalogs</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Status</th>
              <th>Parse</th>
              <th>Created</th>
              <th>Published</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(catalogs ?? []).map((catalog) => {
              const summary = (catalog.parse_summary ?? {}) as {
                new_items?: number;
                updated_items?: number;
                unchanged_items?: number;
                removed_items?: number;
              };
              const hasDiffSummary =
                typeof summary.new_items === "number" ||
                typeof summary.updated_items === "number" ||
                typeof summary.unchanged_items === "number" ||
                typeof summary.removed_items === "number";

              return (
                <tr key={catalog.id}>
                  <td>{catalog.version_label}</td>
                  <td>
                    <span className={`pill ${catalog.status === "published" ? "green" : "red"}`}>
                      {catalog.status}
                    </span>
                  </td>
                  <td>
                    <div>{catalog.parse_status}</div>
                    {hasDiffSummary && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        n:{summary.new_items ?? 0} u:{summary.updated_items ?? 0} c:
                        {summary.unchanged_items ?? 0} r:{summary.removed_items ?? 0}
                      </div>
                    )}
                  </td>
                  <td>{new Date(catalog.created_at).toLocaleString()}</td>
                  <td>
                    {catalog.published_at
                      ? new Date(catalog.published_at).toLocaleString()
                      : "-"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Link className="button secondary" href={`/admin/catalogs/${catalog.id}`}>
                        Review
                      </Link>
                      <CatalogDeleteButton catalogId={catalog.id} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
