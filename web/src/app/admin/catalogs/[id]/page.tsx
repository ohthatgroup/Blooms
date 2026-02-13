import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { CatalogReviewClient } from "@/components/admin/catalog-review-client";

export default async function CatalogReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;

  return (
    <div className="container grid">
      <AdminNav />
      <div>
        <Link href="/admin">← Back to Catalogs</Link>
      </div>
      <CatalogReviewClient catalogId={id} />
    </div>
  );
}

