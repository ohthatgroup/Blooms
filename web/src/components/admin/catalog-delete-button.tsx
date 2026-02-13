"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CatalogDeleteButtonProps {
  catalogId: string;
  redirectTo?: string;
}

export function CatalogDeleteButton({
  catalogId,
  redirectTo,
}: CatalogDeleteButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      "Archive this catalog? It will be hidden from the dashboard and all customer links for it will be disabled.",
    );
    if (!confirmed) return;

    setBusy(true);
    const response = await fetch(`/api/admin/catalogs/${catalogId}`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      window.alert(body.error || "Failed to archive catalog");
      return;
    }

    if (redirectTo) {
      router.push(redirectTo);
      return;
    }

    router.refresh();
  }

  return (
    <button className="button secondary" onClick={handleDelete} disabled={busy}>
      {busy ? "Deleting..." : "Delete"}
    </button>
  );
}
