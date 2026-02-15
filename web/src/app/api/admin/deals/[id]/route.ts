import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { patchDealSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = patchDealSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await auth.admin
    .from("catalog_deals")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update deal", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ deal: data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const { error } = await auth.admin
    .from("catalog_deals")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete deal", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
