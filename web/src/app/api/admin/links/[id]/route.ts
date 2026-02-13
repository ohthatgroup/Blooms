import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { patchCustomerLinkSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = patchCustomerLinkSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { active } = parsed.data;
  const { data, error } = await auth.admin
    .from("customer_links")
    .update({
      active,
      disabled_at: active ? null : new Date().toISOString(),
    })
    .eq("id", id)
    .select("id,active,disabled_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update link", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ link: data });
}

