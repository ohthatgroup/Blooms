import { redirect } from "next/navigation";

export default async function AdminLinksPage() {
  redirect("/admin/orders");
}
