import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";

export default async function AdminLinksPage() {
  await requireAdminPage();
  redirect("/admin/orders");
}
