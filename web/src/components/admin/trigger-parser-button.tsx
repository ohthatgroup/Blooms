"use client";

import { useState } from "react";

export function TriggerParserButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function triggerNow() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/parser/trigger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "manual_dashboard_click" }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(body.message || (response.ok ? "Triggered." : "Failed to trigger parser"));
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button className="button secondary" onClick={triggerNow} disabled={busy}>
        {busy ? "Triggering..." : "Run Parser Now"}
      </button>
      {message ? <span className="muted" style={{ fontSize: 12 }}>{message}</span> : null}
    </div>
  );
}

