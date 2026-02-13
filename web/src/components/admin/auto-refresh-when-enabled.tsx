"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface AutoRefreshWhenEnabledProps {
  enabled: boolean;
  intervalMs?: number;
}

export function AutoRefreshWhenEnabled({
  enabled,
  intervalMs = 5000,
}: AutoRefreshWhenEnabledProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, router]);

  return null;
}
