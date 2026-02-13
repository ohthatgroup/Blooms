import { requireAdminPage } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin-nav";

export default async function AdminOrdersPage() {
  await requireAdminPage();
  const admin = createSupabaseAdminClient();

  const { data: orders } = await admin
    .from("orders")
    .select(
      "id,customer_name,submitted_at,total_skus,total_cases,csv_storage_path,customer_links(token),catalogs(version_label)",
    )
    .order("submitted_at", { ascending: false })
    .limit(300);

  return (
    <div className="container grid">
      <AdminNav />
      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0 }}>Orders</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Catalog</th>
              <th>SKUs</th>
              <th>Cases</th>
              <th>Link Token</th>
              <th>CSV</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((order) => {
              const catalogRel = order.catalogs as
                | { version_label?: string }
                | { version_label?: string }[]
                | null;
              const linkRel = order.customer_links as
                | { token?: string }
                | { token?: string }[]
                | null;

              return (
                <tr key={order.id}>
                  <td>{new Date(order.submitted_at).toLocaleString()}</td>
                  <td>{order.customer_name}</td>
                  <td>
                    {Array.isArray(catalogRel)
                      ? catalogRel[0]?.version_label
                      : catalogRel?.version_label}
                  </td>
                  <td>{order.total_skus}</td>
                  <td>{order.total_cases}</td>
                  <td>
                    {Array.isArray(linkRel) ? linkRel[0]?.token : linkRel?.token}
                  </td>
                  <td>{order.csv_storage_path ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
