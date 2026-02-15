"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface OrderDeleteButtonProps {
  orderId: string;
  redirectTo?: string;
  onDeleted?: () => void;
}

export function OrderDeleteButton({
  orderId,
  redirectTo,
  onDeleted,
}: OrderDeleteButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      "Permanently delete this order? This cannot be undone.",
    );
    if (!confirmed) return;

    setBusy(true);
    const response = await fetch(`/api/admin/orders/${orderId}`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      window.alert(body.error || "Failed to delete order");
      return;
    }

    if (onDeleted) {
      onDeleted();
      return;
    }

    if (redirectTo) {
      router.push(redirectTo);
      return;
    }

    router.refresh();
  }

  return (
    <button className="button secondary" onClick={handleDelete} disabled={busy} style={{ color: "var(--red)" }}>
      {busy ? "Deleting..." : "Delete"}
    </button>
  );
}
