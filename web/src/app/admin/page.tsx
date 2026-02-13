import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CatalogUploadPanel } from "@/components/admin/catalog-upload-panel";
import { AdminNav } from "@/components/admin-nav";
import { SignOutButton } from "@/components/signout-button";
import { TriggerParserButton } from "@/components/admin/trigger-parser-button";

export default async function AdminPage() {
  await requireAdminPage();
  const admin = createSupabaseAdminClient();

  const { data: catalogs } = await admin
    .from("catalogs")
    .select("id,version_label,status,parse_status,created_at,published_at")
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
            {(catalogs ?? []).map((catalog) => (
              <tr key={catalog.id}>
                <td>{catalog.version_label}</td>
                <td>
                  <span className={`pill ${catalog.status === "published" ? "green" : "red"}`}>
                    {catalog.status}
                  </span>
                </td>
                <td>{catalog.parse_status}</td>
                <td>{new Date(catalog.created_at).toLocaleString()}</td>
                <td>
                  {catalog.published_at
                    ? new Date(catalog.published_at).toLocaleString()
                    : "-"}
                </td>
                <td>
                  <Link className="button secondary" href={`/admin/catalogs/${catalog.id}`}>
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
