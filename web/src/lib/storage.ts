import { createSupabaseAdminClient } from "@/lib/supabase/server";

export function getPublicProductImageUrl(path: string) {
  const supabase = createSupabaseAdminClient();
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadOrderCsv(args: {
  orderId: string;
  csv: string;
}): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const path = `orders/${args.orderId}.csv`;
  const { error } = await supabase.storage
    .from("order-csv")
    .upload(path, args.csv, {
      contentType: "text/csv",
      upsert: true,
    });

  if (error) {
    return null;
  }
  return path;
}

