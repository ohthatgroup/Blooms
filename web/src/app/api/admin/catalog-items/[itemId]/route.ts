import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { patchCatalogItemSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { itemId } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = patchCatalogItemSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updateValues = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await auth.admin
    .from("catalog_items")
    .update(updateValues)
    .eq("id", itemId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update catalog item", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ item: data });
}

