import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatDealText } from "@/lib/deals/matrix";
import { DealsManagerClient } from "@/components/admin/deals-manager-client";

export default async function AdminDealsPage() {
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from("deals")
    .select("id,sku,buy_qty,free_qty,starts_at,ends_at,created_at")
    .order("sku")
    .order("starts_at")
    .order("buy_qty");

  const initialDeals = (data ?? []).map((row) => ({
    ...row,
    deal_text: formatDealText(row.buy_qty, row.free_qty),
  }));

  return (
    <div className="container grid">
      <div className="section-header">
        <h2 className="section-header__title">Deals</h2>
      </div>
      <DealsManagerClient initialDeals={initialDeals} />
    </div>
  );
}
